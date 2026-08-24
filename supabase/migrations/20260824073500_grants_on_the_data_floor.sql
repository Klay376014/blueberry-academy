-- Row level security decides which rows a role may see. A grant decides whether
-- it may reach the table at all, and the data floor never issued one: the
-- policies were written and the privileges were left to whatever the Postgres
-- image happened to grant by default.
--
-- That held on the image the local stack was first brought up on and stops
-- holding on a current one, where `set local role authenticated; select from
-- public.battles` answers `42501 permission denied for table battles`. CI caught
-- it on its first run; a freshly created hosted project would have caught it by
-- serving that error to every query the app makes.
--
-- So the privileges are stated here rather than inherited. The grant is the
-- door, `battles_own` / `profiles_own` are still the only thing that decides
-- which rows are behind it, and the four verbs match the policies' `for all`.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.battles to authenticated;

-- service_role bypasses RLS but is not exempt from needing privileges, and
-- `pnpm reparse` reads and rewrites every row through it.

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.battles to service_role;

-- anon is deliberately absent. Every route but /login, /auth/callback and
-- /about is behind the login, so an anonymous client has no reason to reach
-- either table -- and no policy would let it see a row if it did.
