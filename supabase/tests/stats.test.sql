-- The stats layer's numbers, against seed data in the real database.
--
-- The aggregation itself lives in the browser (apps/web/app/utils/battleStats.ts).
-- What is checked here is the half only a database can answer -- that the read
-- useStats issues returns exactly these rows under RLS -- and then the same
-- counts the TypeScript tests assert, computed independently in SQL.
--
-- The seed matches apps/web/test/fixtures/stats-rows.ts, plus the two rows that
-- fixture cannot hold: a spectated battle and somebody else's. Change them
-- together. See docs/specs/2026-08-16-replay-analytics-design.md §7.

begin;

create extension if not exists pgtap;

select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'one@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'two@example.test');

update public.profiles set showdown_usernames = array['NotLittleStar']
  where id = '11111111-1111-1111-1111-111111111111';

-- The fixture. Team A is the six that appears throughout; team B is the other.
insert into public.battles (
  user_id, replay_id, played_at, format_id, series_id,
  my_side, my_username, opponent_username, result,
  team_signature, bring_signature, bring_complete
) values
  -- Ladder Bo1.
  ('11111111-1111-1111-1111-111111111111', 'ladder-1', '2026-08-01T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'NotLittleStar', 'Rival', 'win',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|incineroar|ironhands|urshifu', true),
  ('11111111-1111-1111-1111-111111111111', 'ladder-2', '2026-08-02T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'NotLittleStar', 'Rival', 'loss',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|incineroar|ironhands|urshifu', true),
  -- Forfeited on turn four: four were picked, three ever appeared.
  ('11111111-1111-1111-1111-111111111111', 'ladder-3', '2026-08-03T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'NotLittleStar', 'Rival', 'win',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|incineroar|urshifu', false),
  ('11111111-1111-1111-1111-111111111111', 'ladder-4', '2026-08-04T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'NotLittleStar', 'Rival', 'win',
   'amoonguss|chiyu|farigiraf|kingambit|miraidon|ogerpon',
   'chiyu|farigiraf|miraidon|ogerpon', true),
  -- The log declared no winner.
  ('11111111-1111-1111-1111-111111111111', 'ladder-5', '2026-08-05T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'NotLittleStar', 'Rival', null,
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|incineroar|ironhands|urshifu', true),
  -- Me, spelled the other way.
  ('11111111-1111-1111-1111-111111111111', 'ladder-6', '2026-08-06T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'notlittlestar', 'Rival', 'win',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|incineroar|ironhands|urshifu', true),
  -- Not me: a name that is not on the profile at all.
  ('11111111-1111-1111-1111-111111111111', 'ladder-7', '2026-08-07T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'SomeAlt', 'Rival', 'loss',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|incineroar|ironhands|urshifu', true),

  -- A Bo3 taken 2-1.
  ('11111111-1111-1111-1111-111111111111', 'series-1-g1', '2026-08-08T10:00:00Z', 'gen9championsvgc2026regmbbo3', 'series-1',
   'p1', 'NotLittleStar', 'Rival', 'win',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|ragingbolt|rillaboom|urshifu', true),
  ('11111111-1111-1111-1111-111111111111', 'series-1-g2', '2026-08-08T10:30:00Z', 'gen9championsvgc2026regmbbo3', 'series-1',
   'p1', 'NotLittleStar', 'Rival', 'loss',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'incineroar|ironhands|ragingbolt|rillaboom', true),
  ('11111111-1111-1111-1111-111111111111', 'series-1-g3', '2026-08-08T11:00:00Z', 'gen9championsvgc2026regmbbo3', 'series-1',
   'p1', 'NotLittleStar', 'Rival', 'win',
   'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu',
   'calyrexshadow|ragingbolt|rillaboom|urshifu', true),

  -- A Bo3 with only two of its games imported: 1-1 of what is held.
  ('11111111-1111-1111-1111-111111111111', 'series-2-g1', '2026-08-09T10:00:00Z', 'gen9championsvgc2026regmbbo3', 'series-2',
   'p1', 'NotLittleStar', 'Rival', 'win',
   'amoonguss|chiyu|farigiraf|kingambit|miraidon|ogerpon',
   'amoonguss|kingambit|miraidon|ogerpon', true),
  ('11111111-1111-1111-1111-111111111111', 'series-2-g2', '2026-08-09T10:30:00Z', 'gen9championsvgc2026regmbbo3', 'series-2',
   'p1', 'NotLittleStar', 'Rival', 'loss',
   'amoonguss|chiyu|farigiraf|kingambit|miraidon|ogerpon',
   'amoonguss|kingambit|miraidon|ogerpon', true),

  -- Spectated: neither player is this user, so there is no side, no result and
  -- nothing to count.
  ('11111111-1111-1111-1111-111111111111', 'spectated-1', '2026-08-10T10:00:00Z', 'gen9championsvgc2026regmb', null,
   null, null, null, null, null, null, false),

  -- Somebody else's battle, which this user's read must never reach.
  ('22222222-2222-2222-2222-222222222222', 'theirs-1', '2026-08-11T10:00:00Z', 'gen9championsvgc2026regmb', null,
   'p1', 'SomeoneElse', 'Rival', 'win',
   'amoonguss|chiyu|farigiraf|kingambit|miraidon|ogerpon',
   'chiyu|farigiraf|miraidon|ogerpon', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- What the read returns ------------------------------------------------------

select is(
  (select count(*)::int from public.battles where my_side is not null),
  12,
  'the read leaves out the spectated battle and never sees another user''s'
);

-- Counting by game -----------------------------------------------------------

select is(
  (select count(*)::int from public.battles
   where my_side is not null and result is not null),
  11,
  'a battle the log declared no winner for is in no denominator'
);
select is(
  (select count(*)::int from public.battles
   where my_side is not null and result = 'win'),
  7,
  'seven of the eleven decided games were won'
);

-- Counting by series ---------------------------------------------------------

-- A game with no series id is a series of one, so no branch is needed: a
-- ladder Bo1 folds to itself.
select is(
  (with units as (
     select coalesce(series_id, 'game:' || replay_id) as key,
            count(*) filter (where result = 'win') as wins,
            count(*) filter (where result = 'loss') as losses
     from public.battles
     where my_side is not null and result is not null
     group by 1
   )
   select count(*)::int from units),
  8,
  'folding the two Bo3s leaves eight series where there were eleven games'
);
select is(
  (with units as (
     select coalesce(series_id, 'game:' || replay_id) as key,
            count(*) filter (where result = 'win') as wins,
            count(*) filter (where result = 'loss') as losses
     from public.battles
     where my_side is not null and result is not null
     group by 1
   )
   select count(*)::int from units where wins > losses),
  5,
  'the 2-1 series counts once, so seven game wins become five series wins'
);
select is(
  (with units as (
     select coalesce(series_id, 'game:' || replay_id) as key,
            count(*) filter (where result = 'win') as wins,
            count(*) filter (where result = 'loss') as losses
     from public.battles
     where my_side is not null and result is not null
     group by 1
   )
   select count(*)::int from units where wins = losses),
  1,
  'the series held only in part is a tie, not a guessed winner'
);

-- Team level and bring level disagree, on purpose ----------------------------

select is(
  (select count(*)::int from public.battles
   where my_side is not null and result is not null
     and team_signature = 'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu'),
  8,
  'the team keeps the forfeited game: the registered six are known regardless'
);
select is(
  (select count(*)::int from public.battles
   where my_side is not null and result is not null and bring_complete
     and team_signature = 'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu'),
  7,
  'the bring level drops it, so the two levels have different denominators'
);
select is(
  (select count(*)::int from public.battles
   where my_side is not null and result is not null and bring_complete
     and bring_signature = 'calyrexshadow|incineroar|ironhands|urshifu'),
  4,
  'the forfeit does not scatter into a three-Pokemon version of this bring'
);

-- The global filters ---------------------------------------------------------

select is(
  (select count(*)::int from public.battles
   where my_side is not null and format_id = 'gen9championsvgc2026regmbbo3'),
  5,
  'the format filter is an exact format id, not a regulation'
);
select is(
  (select count(*)::int from public.battles
   where my_side is not null
     and format_id not like '%bo2' and format_id not like '%bo3'),
  7,
  'Bo1 is every format without a best-of suffix'
);
select is(
  (select count(*)::int from public.battles
   where my_side is not null
     and (format_id like '%bo2' or format_id like '%bo3')),
  5,
  'best-of is either suffix: a Bo2 is a series whichever number is in the name'
);
select is(
  (select count(*)::int from public.battles
   where my_side is not null
     and played_at >= '2026-08-01'
     and played_at <= '2026-08-05T23:59:59.999Z'),
  5,
  'a date range includes the whole of the day it ends on'
);

reset role;

select * from finish();

rollback;
