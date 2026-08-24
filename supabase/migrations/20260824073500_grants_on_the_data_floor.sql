-- RLS decides which rows a role sees; a grant decides whether it may reach the
-- table at all. The data floor stated the first half only, and what opened the
-- door was the Postgres image's default privileges — which a current image does
-- not give: `set local role authenticated; select from public.battles` answers
-- `42501 permission denied for table battles`.
--
-- The four verbs match the policies' `for all`.

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.battles to authenticated;

-- Bypassing RLS is not the same as holding a privilege, and `pnpm reparse`
-- rewrites every row through this role.

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.battles to service_role;

-- anon is deliberately absent: every route but /login, /auth/callback and
-- /about is behind the login, and no policy would show it a row anyway.
