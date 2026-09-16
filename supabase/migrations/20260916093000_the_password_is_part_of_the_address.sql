-- Where a private replay lives, which the data floor had no room for.
--
-- A private replay is addressed as `<id>-<password>pw` (CONTEXT.md, 公開
-- replay / 私人 replay), so `replay_id` alone names a page Showdown answers
-- 404 for. The password is a capability in an address rather than a Showdown
-- account credential, which is why storing it does not contradict
-- docs/specs/2026-09-11-private-replay-sync-design.md §5. See
-- docs/adr/0018-the-replay-password-is-part-of-the-address.md.

alter table public.battles
  add column replay_private boolean not null default false,
  add column replay_password text;

-- The default exists only to fill the rows already here, every one of which
-- came in through a search and is therefore public. Dropped again for the
-- reason bring_complete never had one: a writer that forgets this column
-- would file private battles as public, and the symptom is a link that 404s
-- with nothing to say why.
alter table public.battles alter column replay_private drop default;

comment on column public.battles.replay_private is
  'Whether Showdown lists this replay publicly. A private replay is not one '
  'the user cannot see -- it is one no third party can enumerate.';

comment on column public.battles.replay_password is
  'The 31-character suffix a private replay is addressed by: '
  '<id>-<password>pw. Null for a public replay, and also for a private one '
  'Showdown gave no password for (its private = 2), which has no address '
  'that opens it at all. Kept readable only under the battles_own policy, '
  'which is user_id = auth.uid().';
