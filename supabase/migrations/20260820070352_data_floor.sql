-- The data floor: profiles, battles, and the bucket the raw logs live in.
--
-- battles is a hybrid model: dimensions known to be sliced on are promoted to
-- columns and indexed, everything else sits in `details` until a view needs it.
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
  -- players use this site, which buys a one-line RLS policy for a duplication
  -- rate that is near zero in practice.
  user_id uuid not null references auth.users (id) on delete cascade,
  replay_id text not null,

  played_at timestamptz not null,
  format_id text not null,

  -- No part in team identity, and unread by the UI: it exists so a future
  -- "same team across Bo1 and Bo3" view needs no backfill.
  regulation text generated always as (regexp_replace(format_id, 'bo[23]$', '')) stored,

  rated boolean,

  -- Recorded rather than assumed: the parser is gametype-agnostic, so the
  -- dashboard filters instead of the import dropping half an account.
  game_type text,

  -- This side's own post-battle rating, and the change Showdown reported. The
  -- replay metadata carries a `rating` too, but it is the loser's value
  -- whichever side that is. Null for Bo3 event games.
  rating integer,
  rating_delta integer,

  -- The parent battle of a Bo3 series. Games are always stored one row each;
  -- a series result is derived from the games that share this id.
  series_id text,

  -- Which side is "me". All four are null for a spectated battle, one where
  -- neither player is in this user's alias list.
  my_side text check (my_side in ('p1', 'p2')),
  my_username text,
  opponent_username text,
  result text check (result in ('win', 'loss', 'tie')),

  -- Sorted base species ids joined by '|'. The registered 6, and the ones
  -- that actually appeared.
  team_signature text,
  bring_signature text,

  -- Whether as many Pokémon appeared as |teamsize| says were picked. An early
  -- forfeit leaves the fourth pick never having shown up, which is common, so
  -- the stats layer takes only true.
  --
  -- No default on purpose: a default of false would let a writer that forgot
  -- this column drop battles out of every bring view silently.
  bring_complete boolean not null,

  turn_count integer,

  -- Unconstrained where my_side and result are not: a forfeit is recognised
  -- only by matching free text, so the set of reasons grows as more of it is
  -- understood and a CHECK would turn each new reason into a migration.
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

-- A user reaches their own rows and nothing else. The frontend writes with the
-- user's own JWT, so a user can in principle put anything into their own
-- battles; accepted, because faking personal statistics is lying to yourself.
--
-- `for all` rather than four identical policies: the predicate is the same for
-- reading, writing, changing and removing.

alter table public.profiles enable row level security;

create policy profiles_own on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.battles enable row level security;

create policy battles_own on public.battles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage -------------------------------------------------------------------

-- replay-logs/{user_id}/{replay_id}.json.gz, gzipped and untouched.
--
-- Not a DB text column: it would eat the 500MB allowance. Not "fetch it again
-- when needed" either: replays get deleted, private ones need a password, and
-- a re-parse would mean re-running the whole import.

insert into storage.buckets (id, name, public)
values ('replay-logs', 'replay-logs', false)
on conflict (id) do nothing;

-- Isolated by the leading path segment, which is the owner's user id.

create policy replay_logs_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'replay-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
