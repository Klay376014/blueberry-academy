-- Which rows the private sync wrote, so the next one knows where to stop.
--
-- The private sync lists `searchprivate` newest first and stops at the first
-- row no later than the newest game it imported before (#229). That stop has
-- to come from the private sync's own rows: a pasted private link, or a
-- spectated one, is not evidence that everything older was listed. Nothing in
-- the row said which road it came by, hence this column. See
-- docs/specs/2026-09-11-private-replay-sync-design.md §9 D6.
--
-- A default, unlike replay_private and bring_complete, and on purpose: the
-- column is not derived from the replay, so `battle-row` does not know it and
-- `pnpm reparse` does not write it. The one writer that sets it sends true;
-- every other write leaves it out, so an upsert neither marks a pasted row
-- nor wipes the mark off a synced one.
--
-- No backfill: rows already here are filed as not synced, which costs one
-- full listing on the next private sync and nothing else.

alter table public.battles
  add column via_private_sync boolean not null default false;

comment on column public.battles.via_private_sync is
  'Whether the private sync wrote this row. The newest such row is where the '
  'next private sync stops listing. False for a pasted link, a public sync, '
  'and every row written before the column existed.';
