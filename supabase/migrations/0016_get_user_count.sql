-- 0016_get_user_count.sql
-- Analytics: total number of accounts, for the "X mensen gebruiken de app"
-- count in the user-menu popover. auth.users is not readable by the anon/
-- authenticated API roles, so we expose a single aggregate through a
-- SECURITY DEFINER function (runs as the owner) and grant EXECUTE on it.
-- `SET search_path = public` prevents search-path hijacking of the definer call.

create or replace function public.get_user_count()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from auth.users;
$$;

grant execute on function public.get_user_count() to anon, authenticated;
