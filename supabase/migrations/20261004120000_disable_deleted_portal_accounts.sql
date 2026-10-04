-- Preserve regulatory records while removing deleted users from every active
-- portal role. Edge Functions set this role before soft-deleting Auth users.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'admin', 'admin_viewer', 'disabled_admin_viewer', 'disabled_account',
    'staff', 'operator', 'traffic_enforcer'
  ));

commit;
