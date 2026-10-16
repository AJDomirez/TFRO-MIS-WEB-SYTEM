begin;

drop function if exists public.approve_enforcer_account(bigint, boolean);

create or replace function private.approve_enforcer_account(p_enforcer_record_id bigint, p_approved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'admin_viewer') and account_status = 'active'
  ) then
    raise exception 'Only TFRO administrators can approve Enforcer accounts';
  end if;

  select user_id into target_user
  from public.traffic_enforcers
  where id = p_enforcer_record_id
  for update;

  if target_user is null then
    raise exception 'This Enforcer ID has no linked signup account';
  end if;

  update public.profiles
  set account_status = case when p_approved then 'active' else 'rejected' end
  where id = target_user and role = 'traffic_enforcer';
  return found;
end;
$$;
revoke all on function private.approve_enforcer_account(bigint, boolean) from public, anon;
grant execute on function private.approve_enforcer_account(bigint, boolean) to authenticated;

create function public.approve_enforcer_account(p_enforcer_record_id bigint, p_approved boolean)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.approve_enforcer_account(p_enforcer_record_id, p_approved);
$$;
revoke all on function public.approve_enforcer_account(bigint, boolean) from public, anon;
grant execute on function public.approve_enforcer_account(bigint, boolean) to authenticated;

create index if not exists franchise_generated_documents_created_by_idx
  on public.franchise_generated_documents (created_by);
create index if not exists franchise_generated_documents_updated_by_idx
  on public.franchise_generated_documents (updated_by);

notify pgrst, 'reload schema';
commit;
