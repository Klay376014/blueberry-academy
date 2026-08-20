-- The data floor: profiles, battles, and the bucket the raw logs live in.
--
-- battles is a hybrid model. The dimensions that are known to be sliced on are
-- promoted to columns and indexed; everything else sits in `details` until a
-- view actually needs it, at which point it is promoted and backfilled by
-- re-parsing the stored raw logs.
--
-- See docs/specs/2026-08-16-replay-analytics-design.md §5 and CONTEXT.md.

-- profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  showdown_usernames text[] not null default '{}',
  created_at timestamptz not null default now()
);

comment on column public.profiles.showdown_usernames is
  'Showdown names that are all the same "me". Compared after toID() '
  'normalisation, never raw: NotLittleStar and notlittlestar are one person. '
  'Ownership of a Showdown account cannot be verified, so this is trust only.';

-- battles --------------------------------------------------------------------

create table public.battles (
  id uuid primary key default gen_random_uuid(),

  -- One row per user per replay. The same battle is stored twice when both
  -- players use this site: a deliberate trade, because it buys an RLS policy
  -- that is one line long and the duplication rate is near zero in practice.
  user_id uuid not null references auth.users (id) on delete cascade,
  replay_id text not null,

  played_at timestamptz not null,
  format_id text not null,

  -- Derived from format_id by dropping the Bo2/Bo3 suffix. It takes no part in
  -- team identity and the UI does not read it; it exists so that a future
  -- "same team across Bo1 and Bo3" view does not require backfilling the
  -- entire table.
  regulation text generated always as (regexp_replace(format_id, 'bo[23]$', '')) stored,

  rated boolean,

  -- Recorded rather than assumed. The parser is gametype-agnostic, so every
  -- battle is taken in and the dashboard filters instead of the import
  -- dropping half of somebody's account on the floor.
  game_type text,

  -- This side's own rating once the game was over, and the change Showdown
  -- reported for it. The replay metadata also carries a `rating`, but it is
  -- the loser's post-battle value whichever side that is, so it belongs to
  -- neither side and must not be written here. Null for Bo3 event games.
  rating integer,
  rating_delta integer,

  -- The parent battle of a Bo3 series. Games are always stored one row each;
  -- a series result is derived from the games that share this id.
  series_id text,

  -- Which side is "me". All three are null for a spectated battle, one where
  -- neither player is in this user's alias list.
  my_side text check (my_side in ('p1', 'p2')),
  my_username text,
  opponent_username text,
  result text check (result in ('win', 'loss', 'tie')),

  -- Sorted base species ids joined by '|'. The registered 6, and the ones
  -- that actually appeared.
  team_signature text,
  bring_signature text,

  -- Whether as many Pokémon appeared as |teamsize| says were picked. A player
  -- who forfeits early leaves the fourth pick never having shown up, which is
  -- common rather than exceptional, so the stats layer takes only true.
  bring_complete boolean not null default false,

  turn_count integer,
  end_reason text,

  -- Opponent's team, who fainted, Mega/Tera use — everything the views that
  -- are not designed yet will need.
  details jsonb not null default '{}'::jsonb,

  -- Path in the replay-logs bucket. The raw log is the only source of truth;
  -- every column above it is derived data that can be rebuilt from it.
  log_path text,

  -- Which parser version produced this row, and why it produced nothing.
  parser_version text,
  parse_error text,

  created_at timestamptz not null default now(),

  constraint battles_user_id_replay_id_key unique (user_id, replay_id)
);

comment on column public.battles.regulation is
  'format_id without its Bo2/Bo3 suffix. Not part of team identity: '
  'gen9championsvgc2026regmb and ...regmbbo3 are different teams.';

comment on column public.battles.rating is
  'This side''s post-battle rating from its own |raw| line. Never the '
  'replay metadata rating, which is the loser''s value.';

-- Indexes -------------------------------------------------------------------

-- Perspective 1: the battle list and the rating curve, newest first.
create index battles_user_id_played_at_idx
  on public.battles (user_id, played_at desc);

-- The global format filter, over any window of time.
create index battles_user_id_format_id_played_at_idx
  on public.battles (user_id, format_id, played_at);

-- Perspective 2: group by registered team.
create index battles_user_id_team_signature_idx
  on public.battles (user_id, team_signature);

-- Group by bring. Conditional on purpose: without the WHERE, the index would
-- mix in the short-game signatures the stats layer excludes anyway.
create index battles_user_id_bring_signature_idx
  on public.battles (user_id, bring_signature)
  where bring_complete;

-- Perspectives 3 and 4, before they have columns of their own.
create index battles_details_idx on public.battles using gin (details);

-- Row level security --------------------------------------------------------

-- A user reaches their own rows and nothing else. The frontend writes to
-- Supabase directly with the user's own JWT, so a user can in principle put
-- anything into their own battles. That risk is accepted: these are personal
-- statistics only they can see, so faking them is lying to yourself.

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = auth.uid());

alter table public.battles enable row level security;

create policy battles_select_own on public.battles
  for select to authenticated using (user_id = auth.uid());
create policy battles_insert_own on public.battles
  for insert to authenticated with check (user_id = auth.uid());
create policy battles_update_own on public.battles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy battles_delete_own on public.battles
  for delete to authenticated using (user_id = auth.uid());

-- Storage -------------------------------------------------------------------

-- replay-logs/{user_id}/{replay_id}.json.gz, gzipped and untouched.
--
-- Not a DB text column: it would eat the 500MB database allowance, and every
-- battles query would have to be careful not to drag the big column along.
-- Not "fetch it again when needed" either: replays get deleted, private ones
-- need a password, and a re-parse would mean re-running the whole import.

insert into storage.buckets (id, name, public)
values ('replay-logs', 'replay-logs', false)
on conflict (id) do nothing;

-- Isolated by the leading path segment, which is the owner's user id.

create policy replay_logs_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy replay_logs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy replay_logs_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy replay_logs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
