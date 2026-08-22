-- Signing up creates the profile row.
--
-- In the database rather than the client, so it holds for every way a user can
-- come into existence -- a second OAuth provider, a maintenance script, a row
-- inserted by hand -- not only the path the frontend takes today.

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
