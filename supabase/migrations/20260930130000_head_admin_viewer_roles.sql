-- Head Administrator and view-only Administrator access model.
-- Existing `admin` accounts remain Head Administrators. New `admin_viewer`
-- accounts are read-only, are capped at forty, and cannot be promoted from the
-- browser because profile.role is not client-updatable.

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'admin_viewer', 'disabled_admin_viewer', 'staff', 'operator', 'traffic_enforcer'));

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z][a-z0-9_.-]{2,31}$');

-- Existing admin accounts become Head Administrators. Do not guess which
-- accounts to demote if an older database has more than two of them.
do $$
begin
  if (select count(*) from public.profiles where role = 'admin') > 2 then
    raise exception 'More than two existing Administrator accounts were found. Choose the two Head Administrators before applying this migration.';
  end if;
end;
$$;

create or replace function private.is_head_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.role = 'admin'
    );
$$;

revoke all on function private.is_head_admin() from public, anon;
grant execute on function private.is_head_admin() to authenticated;

create or replace function private.is_admin_viewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.role = 'admin_viewer'
    );
$$;

revoke all on function private.is_admin_viewer() from public, anon;
grant execute on function private.is_admin_viewer() to authenticated;

create or replace function private.enforce_admin_account_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;

  if new.role = 'admin' then
    select count(*) into current_count from public.profiles where role = 'admin' and id <> new.id;
    if current_count >= 2 then
      raise exception 'Only two Head Administrator accounts are allowed.' using errcode = '23514';
    end if;
  elsif new.role = 'admin_viewer' then
    select count(*) into current_count from public.profiles where role = 'admin_viewer' and id <> new.id;
    if current_count >= 40 then
      raise exception 'A maximum of forty view-only Administrator accounts is allowed.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_admin_account_limits() from public, anon, authenticated;
drop trigger if exists enforce_admin_account_limits on public.profiles;
create trigger enforce_admin_account_limits
before insert or update of role on public.profiles
for each row execute function private.enforce_admin_account_limits();

-- Head Administrators need to see the view-only account list. View-only users
-- keep the existing policy that exposes only their own profile.
drop policy if exists "Head administrators read view-only admin accounts" on public.profiles;
create policy "Head administrators read view-only admin accounts"
on public.profiles for select to authenticated
using (role = 'admin_viewer' and (select private.is_head_admin()));

-- The browser uses the same authenticated database role for every signed-in
-- user. These SELECT-only policies give view-only Administrators the data
-- already shown by the Administrator portal without granting any write path.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'audit_logs', 'change_motor_history', 'change_motor_requests',
    'driver_assignments', 'driver_qr_verifications', 'drivers',
    'franchise_applications', 'franchise_documents', 'franchise_renewals',
    'franchises', 'notifications', 'operators', 'payments',
    'renewal_documents', 'system_settings', 'traffic_enforcers',
    'tricycles', 'violation_catalog', 'violations'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      policy_name := 'Admin viewers read ' || table_name;
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select private.is_admin_viewer()))',
        policy_name, table_name
      );
      execute format('grant select on table public.%I to authenticated', table_name);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
