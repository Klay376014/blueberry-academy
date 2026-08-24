-- The data floor granted the four verbs to authenticated and service_role and
-- said anon was "deliberately absent". Absent from that migration, yes -- but
-- not absent from the table: a hosted project hands the Data API roles the
-- default privileges on anything new in `public`, so on the live project an
-- unauthenticated `select from battles` answered `200 []` rather than
-- `42501 permission denied`. Measured 2026-08-24 on the hosted project, right
-- after the first `supabase db push`.
--
-- No rows were reachable either way -- battles_own and profiles_own are `to
-- authenticated`, so anon matches no policy. This closes the door rather than
-- trusting the lock: a later policy written `to public`, or a view owned by
-- postgres, would otherwise be enough to make the privilege matter.
--
-- Revoking a privilege the role never held is a no-op, so this is the same
-- statement whether the local image granted it or not.

revoke all on public.profiles from anon;
revoke all on public.battles from anon;
