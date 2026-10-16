begin;

-- RLS policies on drivers and violation commission records call this helper.
-- Keep the helper scoped to the current JWT user, then allow authenticated
-- requests to execute it so unrelated dashboard reads are not rejected.
create or replace function private.is_active_traffic_enforcer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.traffic_enforcers enforcer
      join public.profiles profile on profile.id = enforcer.user_id
      where enforcer.user_id = p_user_id
        and enforcer.status = 'active'
        and profile.role = 'traffic_enforcer'
        and profile.account_status = 'active'
    );
$$;

revoke all on function private.is_active_traffic_enforcer(uuid) from public, anon;
grant execute on function private.is_active_traffic_enforcer(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
