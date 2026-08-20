-- Behavioural checks: what the derived column derives, what the unique key
-- refuses, and what one user can reach of another user's data.

begin;

create extension if not exists pgtap;

select plan(14);

-- Two users who have never met.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'one@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'two@example.test');

insert into public.profiles (id, showdown_usernames) values
  ('11111111-1111-1111-1111-111111111111', array['NotLittleStar']),
  ('22222222-2222-2222-2222-222222222222', array['SomeoneElse']);

insert into public.battles (user_id, replay_id, played_at, format_id, bring_complete) values
  ('11111111-1111-1111-1111-111111111111', 'gen9championsvgc2026regmbbo3-1', now(), 'gen9championsvgc2026regmbbo3', true),
  ('11111111-1111-1111-1111-111111111111', 'gen9vgc2026regj-1', now(), 'gen9vgc2026regj', false),
  ('22222222-2222-2222-2222-222222222222', 'gen9vgc2026regj-2', now(), 'gen9vgc2026regjbo2', false);

-- regulation ---------------------------------------------------------------

select is(
  (select regulation from public.battles where replay_id = 'gen9championsvgc2026regmbbo3-1'),
  'gen9championsvgc2026regmb',
  'regulation drops the bo3 suffix'
);
select is(
  (select regulation from public.battles where replay_id = 'gen9vgc2026regj-2'),
  'gen9vgc2026regj',
  'regulation drops the bo2 suffix'
);
select is(
  (select regulation from public.battles where replay_id = 'gen9vgc2026regj-1'),
  'gen9vgc2026regj',
  'a Bo1 format id is already its own regulation'
);

-- the unique key -----------------------------------------------------------

select throws_ok(
  $$insert into public.battles (user_id, replay_id, played_at, format_id, bring_complete)
    values ('11111111-1111-1111-1111-111111111111', 'gen9vgc2026regj-1', now(), 'gen9vgc2026regj', false)$$,
  '23505',
  null,
  'the same user cannot import the same replay twice'
);
select lives_ok(
  $$insert into public.battles (user_id, replay_id, played_at, format_id, bring_complete)
    values ('22222222-2222-2222-2222-222222222222', 'gen9vgc2026regj-1', now(), 'gen9vgc2026regj', false)$$,
  'the other player of the same battle keeps their own row'
);

-- battles under RLS, as user one -------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.battles),
  2,
  'a user sees their own battles and no others'
);
select is(
  (select count(*)::int from public.profiles),
  1,
  'a user sees their own profile and no others'
);
select throws_ok(
  $$insert into public.battles (user_id, replay_id, played_at, format_id, bring_complete)
    values ('22222222-2222-2222-2222-222222222222', 'planted', now(), 'gen9vgc2026regj', false)$$,
  '42501',
  null,
  'a user cannot write a battle onto somebody else'
);

-- An update or a delete that no policy admits is not an error, it simply
-- matches nothing -- so these are checked by looking at the row afterwards.
update public.battles set result = 'win' where replay_id = 'gen9vgc2026regj-2';
delete from public.battles where replay_id = 'gen9vgc2026regj-2';

reset role;
select is(
  (select result from public.battles where replay_id = 'gen9vgc2026regj-2'),
  null,
  'a user cannot update somebody else''s battle'
);
select is(
  (select count(*)::int from public.battles where replay_id = 'gen9vgc2026regj-2'),
  1,
  'a user cannot delete somebody else''s battle'
);
set local role authenticated;

select lives_ok(
  $$insert into public.battles (user_id, replay_id, played_at, format_id, bring_complete)
    values ('11111111-1111-1111-1111-111111111111', 'mine', now(), 'gen9vgc2026regj', false)$$,
  'a user can write a battle onto themselves'
);

-- storage, isolated by the leading path segment ----------------------------

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('replay-logs', '11111111-1111-1111-1111-111111111111/mine.json.gz')$$,
  'a user can upload under their own id'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('replay-logs', '22222222-2222-2222-2222-222222222222/planted.json.gz')$$,
  '42501',
  null,
  'a user cannot upload under somebody else''s id'
);

reset role;
insert into storage.objects (bucket_id, name)
  values ('replay-logs', '22222222-2222-2222-2222-222222222222/theirs.json.gz');
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'replay-logs'),
  1,
  'a user sees only the raw logs under their own id'
);

reset role;

select * from finish();

rollback;
