-- Signing up creates the profile row.
--
-- The alias list needs somewhere to be written the first time a user binds a
-- Showdown name, and doing it here rather than in the client means it holds
-- for every way a user can come into existence -- a second OAuth provider, a
-- maintenance script, a row inserted by hand -- instead of only for the one
-- path the frontend happens to take today.

create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
-- Empty search_path: a security definer function runs with the owner's rights,
-- so every name it touches is written out in full rather than resolved through
-- whatever search_path the caller happened to have.
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

comment on function public.create_profile_for_new_user() is
  'Gives every new auth user the profile row their Showdown aliases go into.';

create trigger create_profile_on_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();
