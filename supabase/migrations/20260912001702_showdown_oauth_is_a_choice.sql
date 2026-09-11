-- The data floor said ownership of a Showdown account "cannot be verified".
-- The conclusion stands -- this project does not verify it -- but the reason
-- was wrong: Showdown does have a full OAuth implementation
-- (pokemon-showdown-loginserver, src/oauth.ts, endpoints in src/actions.ts).
-- Not verifying is a choice: OAuth binds a client_id that has to be applied
-- for from PS and is matched verbatim against the origin domain, and this
-- project has not applied for one. See CONTEXT.md "Alias" and
-- docs/specs/2026-09-11-private-replay-sync-design.md §2.2.

comment on column public.profiles.showdown_usernames is
  'Showdown names that are all the same "me". Compared after toID() '
  'normalisation, never raw: NotLittleStar and notlittlestar are one person. '
  'Ownership is not verified, so this is trust only -- a choice, not a '
  'limitation: PS OAuth needs a client_id this project has not applied for.';
