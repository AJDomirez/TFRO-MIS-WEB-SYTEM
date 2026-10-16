begin;

drop policy if exists "Administrators read Enforcer account approvals" on public.profiles;
create policy "Administrators read Enforcer account approvals"
on public.profiles for select to authenticated
using (
  role = 'traffic_enforcer'
  and exists (
    select 1 from public.profiles administrator
    where administrator.id = (select auth.uid())
      and administrator.role in ('admin', 'admin_viewer')
      and administrator.account_status = 'active'
  )
);

create or replace function private.protect_account_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role or new.account_status is distinct from old.account_status then
    if (select auth.uid()) is not null and not exists (
      select 1 from public.profiles administrator
      where administrator.id = (select auth.uid())
        and administrator.role in ('admin', 'admin_viewer')
        and administrator.account_status = 'active'
    ) then
      raise exception 'Account role and approval status are controlled by TFRO administrators';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_account_authorization_fields() from public, anon, authenticated;

drop trigger if exists protect_account_authorization_fields on public.profiles;
create trigger protect_account_authorization_fields
before update of role, account_status on public.profiles
for each row execute function private.protect_account_authorization_fields();

notify pgrst, 'reload schema';
commit;
