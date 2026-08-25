-- Operator-managed Driver applications and login-role stabilization.
-- Public sign-up always creates an Operator profile. Drivers are records owned
-- by a verified Operator; they are not Auth users and have no login password.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, full_name, contact_number)
  values (
    new.id,
    'operator',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'contact_number'
  )
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      contact_number = coalesce(public.profiles.contact_number, excluded.contact_number);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

alter table public.drivers enable row level security;

-- Replace historical overlapping policies with one explicit policy per action
-- and actor. This prevents a Driver Auth user or another Operator from gaining
-- access through an older permissive policy.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'drivers'
  loop
    execute format('drop policy if exists %I on public.drivers', existing_policy.policyname);
  end loop;
end;
$$;

revoke all on table public.drivers from anon, authenticated;
grant select, insert, update, delete on table public.drivers to authenticated;
grant usage, select on sequence public.drivers_id_seq to authenticated;

create policy "TFRO staff read Driver applications"
on public.drivers for select to authenticated
using ((select private.is_tfro_staff()));

create policy "TFRO staff update Driver applications"
on public.drivers for update to authenticated
using ((select private.is_tfro_staff()))
with check ((select private.is_tfro_staff()));

create policy "TFRO staff delete Driver applications"
on public.drivers for delete to authenticated
using ((select private.is_tfro_staff()));

create policy "Operators read their Driver applications"
on public.drivers for select to authenticated
using (
  exists (
    select 1
    from public.operators operator_record
    where operator_record.id = drivers.operator_id
      and operator_record.user_id = (select auth.uid())
  )
);

create policy "Operators submit Driver applications"
on public.drivers for insert to authenticated
with check (
  drivers.user_id is null
  and drivers.franchise_id is null
  and drivers.violation_count = 0
  and drivers.compliance = 'non-compliant'
  and drivers.license_status = 'not_verified'
  and drivers.license_verified_at is null
  and exists (
    select 1
    from public.operators operator_record
    where operator_record.id = drivers.operator_id
      and operator_record.user_id = (select auth.uid())
      and operator_record.verified
      and operator_record.status = 'active'
      and operator_record.full_name = drivers.operator_name
  )
);

create index if not exists drivers_operator_id_idx
on public.drivers (operator_id);

comment on column public.drivers.user_id is
  'Legacy Auth link only. New Drivers are Operator-managed records and do not receive login accounts.';
