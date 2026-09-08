begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- RLS policies need a stable identity check that is not affected by the
-- traffic_enforcers table's own row policies. The helper is private, verifies
-- the caller rather than trusting a supplied ID, and exposes no row data.
create or replace function private.is_active_traffic_enforcer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles profile
      join public.traffic_enforcers enforcer
        on enforcer.user_id = profile.id
      where profile.id = p_user_id
        and profile.role = 'traffic_enforcer'
        and enforcer.status = 'active'
    );
$$;

revoke all on function private.is_active_traffic_enforcer(uuid) from public, anon;
grant execute on function private.is_active_traffic_enforcer(uuid) to authenticated;

alter table public.violations enable row level security;
grant select, insert on table public.violations to authenticated;

drop policy if exists "Traffic Enforcers submit tickets" on public.violations;
create policy "Traffic Enforcers submit tickets"
on public.violations for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and status = 'pending'
  and (select private.is_active_traffic_enforcer((select auth.uid())))
);

drop policy if exists "Traffic Enforcers read their tickets" on public.violations;
create policy "Traffic Enforcers read their tickets"
on public.violations for select to authenticated
using (
  (driver_id is not null or recorded_by = (select auth.uid()))
  and (select private.is_active_traffic_enforcer((select auth.uid())))
);

notify pgrst, 'reload schema';

commit;
