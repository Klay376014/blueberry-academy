-- Structural checks on the data floor: the tables, the columns the design
-- document lists, the derived column, the unique key and the five indexes.
--
-- Behavioural checks (RLS isolation, storage path isolation, what the derived
-- column actually derives) live in rls.test.sql.

begin;

create extension if not exists pgtap;

select plan(31);

-- profiles ------------------------------------------------------------------

select has_table('public', 'profiles', 'profiles exists');
select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');
select col_type_is('public', 'profiles', 'id', 'uuid', 'profiles.id is a uuid');
select col_type_is(
  'public', 'profiles', 'showdown_usernames', 'text[]',
  'profiles.showdown_usernames holds a list of Showdown aliases'
);
select fk_ok(
  'public', 'profiles', 'id', 'auth', 'users', 'id',
  'profiles.id points at an auth user'
);

-- battles: every column of design document §5 ------------------------------

select has_table('public', 'battles', 'battles exists');
select columns_are(
  'public', 'battles',
  array[
    'id',
    'user_id',
    'replay_id',
    'played_at',
    'format_id',
    'regulation',
    'rated',
    'game_type',
    'rating',
    'rating_delta',
    'series_id',
    'my_side',
    'my_username',
    'opponent_username',
    'result',
    'team_signature',
    'bring_signature',
    'bring_complete',
    'turn_count',
    'end_reason',
    'details',
    'log_path',
    'parser_version',
    'parse_error',
    'created_at'
  ],
  'battles covers design document §5 and nothing else'
);
select col_type_is('public', 'battles', 'details', 'jsonb', 'details is JSONB');
select col_type_is(
  'public', 'battles', 'bring_complete', 'boolean',
  'bring_complete is a boolean'
);
select col_not_null(
  'public', 'battles', 'bring_complete',
  'bring_complete always answers the question, never leaves it open'
);

-- The signature columns stay open: a spectated battle has no team of mine.
select col_is_null('public', 'battles', 'team_signature', 'team_signature is nullable');
select col_is_null('public', 'battles', 'bring_signature', 'bring_signature is nullable');
select col_is_null('public', 'battles', 'my_side', 'my_side is null for spectated battles');
select col_is_null('public', 'battles', 'result', 'result is null for spectated battles');

select col_has_check('public', 'battles', 'my_side', 'my_side is constrained to a side');
select col_has_check('public', 'battles', 'result', 'result is constrained to an outcome');

select fk_ok(
  'public', 'battles', 'user_id', 'auth', 'users', 'id',
  'a battle belongs to an auth user'
);

-- The unique key that stops the same replay being imported twice ------------

select col_is_unique(
  'public', 'battles', array['user_id', 'replay_id'],
  'one user cannot import the same replay twice'
);

-- regulation, derived from the format id -----------------------------------

select is(
  (select attgenerated from pg_attribute
   where attrelid = 'public.battles'::regclass and attname = 'regulation'),
  's'::"char",
  'regulation is a stored generated column'
);

-- The five indexes ---------------------------------------------------------

select matches(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'battles_user_id_played_at_idx'),
  'btree \(user_id, played_at DESC\)$',
  'index on (user_id, played_at desc), descending as the dashboard reads it'
);
select matches(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'battles_user_id_format_id_played_at_idx'),
  'btree \(user_id, format_id, played_at\)$',
  'index on (user_id, format_id, played_at)'
);
select matches(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'battles_user_id_team_signature_idx'),
  'btree \(user_id, team_signature\)$',
  'index on (user_id, team_signature)'
);
select matches(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'battles_user_id_bring_signature_idx'),
  'btree \(user_id, bring_signature\) WHERE bring_complete$',
  'index on (user_id, bring_signature) conditional on bring_complete, so broken short-game signatures stay out'
);
select matches(
  (select indexdef from pg_indexes
   where schemaname = 'public' and indexname = 'battles_details_idx'),
  'USING gin \(details\)$',
  'GIN index on details'
);

-- Row level security -------------------------------------------------------

select is(
  (select relrowsecurity from pg_class where oid = 'public.battles'::regclass),
  true,
  'battles has row level security enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles has row level security enabled'
);
select bag_eq(
  $$select cmd::text from pg_policies
    where schemaname = 'public' and tablename = 'battles'$$,
  $$values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')$$,
  'battles has one policy per operation'
);
select bag_eq(
  $$select cmd::text from pg_policies
    where schemaname = 'public' and tablename = 'profiles'$$,
  $$values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')$$,
  'profiles has one policy per operation'
);

-- Storage ------------------------------------------------------------------

select is(
  (select count(*)::int from storage.buckets where id = 'replay-logs'),
  1,
  'the replay-logs bucket exists'
);
select is(
  (select public from storage.buckets where id = 'replay-logs'),
  false,
  'the replay-logs bucket is private'
);
select bag_eq(
  $$select cmd::text from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'replay_logs%'$$,
  $$values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')$$,
  'replay-logs has one storage policy per operation'
);

select * from finish();

rollback;
