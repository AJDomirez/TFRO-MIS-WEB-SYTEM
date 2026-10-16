begin;

create or replace function private.is_active_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles administrator
      where administrator.id = (select auth.uid())
        and administrator.role in ('admin', 'admin_viewer')
        and administrator.account_status = 'active'
    );
$$;
revoke all on function private.is_active_administrator() from public, anon;
grant execute on function private.is_active_administrator() to authenticated;

drop policy if exists "Administrators read Enforcer account approvals" on public.profiles;
create policy "Administrators read Enforcer account approvals"
on public.profiles for select to authenticated
using (
  role = 'traffic_enforcer'
  and (select private.is_active_administrator())
);

notify pgrst, 'reload schema';
commit;
