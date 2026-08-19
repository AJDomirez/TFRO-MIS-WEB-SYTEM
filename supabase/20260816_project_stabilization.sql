-- TFRO-MIS project stabilization migration
-- Run in Supabase Dashboard > SQL Editor after the existing setup scripts.
-- This migration is idempotent and is the final source of truth for the
-- registration, notification, cleanup, and approval workflows.

-- ---------------------------------------------------------------------------
-- Registration: only the trusted auth trigger may create profiles or assign
-- roles. Public sign-up metadata is restricted to operator.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'operator');
begin
  if requested_role <> 'operator' then
    requested_role := 'operator';
  end if;

  insert into public.profiles (id, role, full_name, contact_number)
  values (
    new.id,
    requested_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'contact_number'
  )
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      contact_number = coalesce(public.profiles.contact_number, excluded.contact_number);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, contact_number) on table public.profiles to authenticated;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Users read their own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Users update their own profile fields"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill legacy name-only records when the name identifies exactly one
-- matching portal account. Ambiguous names are intentionally left untouched
-- for an administrator to resolve manually.
-- ---------------------------------------------------------------------------
update public.operators o
set user_id = p.id
from public.profiles p
where o.user_id is null
  and p.role = 'operator'
  and lower(trim(p.full_name)) = lower(trim(o.full_name))
  and (
    select count(*) from public.profiles candidate
    where candidate.role = 'operator'
      and lower(trim(candidate.full_name)) = lower(trim(o.full_name))
  ) = 1;

update public.drivers d
set user_id = p.id
from public.profiles p
where d.user_id is null
  and p.role = 'driver'
  and lower(trim(p.full_name)) = lower(trim(d.full_name))
  and (
    select count(*) from public.profiles candidate
    where candidate.role = 'driver'
      and lower(trim(candidate.full_name)) = lower(trim(d.full_name))
  ) = 1;

update public.franchises f
set operator_id = p.id
from public.profiles p
where f.operator_id is null
  and p.role = 'operator'
  and lower(trim(p.full_name)) = lower(trim(f.operator_name))
  and (
    select count(*) from public.profiles candidate
    where candidate.role = 'operator'
      and lower(trim(candidate.full_name)) = lower(trim(f.operator_name))
  ) = 1;

update public.driver_assignments assignment
set driver_user_id = d.user_id
from public.drivers d
where assignment.driver_id = d.id
  and assignment.driver_user_id is null
  and d.user_id is not null;

update public.driver_assignments assignment
set operator_user_id = o.user_id
from public.operators o
where assignment.operator_id = o.id
  and assignment.operator_user_id is null
  and o.user_id is not null;

drop policy if exists "Operator read assignment" on public.driver_assignments;
create policy "Operator read assignment"
on public.driver_assignments for select to authenticated
using (
  operator_user_id = (select auth.uid())
  or exists (
    select 1 from public.operators o
    where o.id = operator_id and o.user_id = (select auth.uid())
  )
);

drop policy if exists "Driver read assignment" on public.driver_assignments;
create policy "Driver read assignment"
on public.driver_assignments for select to authenticated
using (
  driver_user_id = (select auth.uid())
  or exists (
    select 1 from public.drivers d
    where d.id = driver_id and d.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Notification policies: remove the historical policy that allowed any
-- authenticated user to create a notification for any other account.
-- ---------------------------------------------------------------------------
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy if exists %I on public.notifications', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Users and staff read notifications"
on public.notifications for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'staff')
  )
);

create policy "Users update their own notifications"
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users delete their own notifications"
on public.notifications for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Staff create notifications"
on public.notifications for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('admin', 'staff')
  )
);

-- ---------------------------------------------------------------------------
-- Operators may clean up only their own failed, still-pending applications.
-- This supports rollback when one file in a multi-file upload fails.
-- ---------------------------------------------------------------------------
drop policy if exists "Operator delete own pending application" on public.franchise_applications;
create policy "Operator delete own pending application"
on public.franchise_applications for delete to authenticated
using (operator_id = (select auth.uid()) and status = 'pending_review');

drop policy if exists "Operator delete own pending uploads" on storage.objects;
create policy "Operator delete own pending uploads"
on storage.objects for delete to authenticated
using (
  bucket_id = 'franchise-documents'
  and name like 'applications/%/%'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.franchise_applications a
    where a.id = split_part(name, '/', 2)::bigint
      and a.operator_id = (select auth.uid())
      and a.status = 'pending_review'
  )
);

-- ---------------------------------------------------------------------------
-- Transactional franchise approval.
-- ---------------------------------------------------------------------------
create or replace function public.approve_franchise_application(p_application_id bigint)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  application_row public.franchise_applications%rowtype;
  approved_franchise_id bigint;
  reviewer_name text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'staff')
  ) then
    raise exception 'Only TFRO staff can approve franchise applications'
      using errcode = '42501';
  end if;

  select * into application_row
  from public.franchise_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Franchise application % was not found', p_application_id;
  end if;

  if not (
    application_row.info_complete
    and application_row.voters_verified
    and application_row.barangay_verified
    and application_row.cedula_verified
    and application_row.ohcr_verified
    and application_row.insurance_verified
    and application_row.pmbl_verified
  ) then
    raise exception 'All application information and documents must be verified before approval';
  end if;

  select id into approved_franchise_id
  from public.franchises
  where application_id = p_application_id
  order by id
  limit 1;

  if approved_franchise_id is null then
    insert into public.franchises (
      operator_id, application_id, franchise_number, previous_registration,
      operator_name, registration_month, registration_day, registration_year,
      address, engine_number, chassis_number, plate_number, contact_number,
      route, status, is_archived
    ) values (
      application_row.operator_id, application_row.id,
      application_row.franchise_number, application_row.previous_registration,
      application_row.operator_name, application_row.registration_month,
      application_row.registration_day, application_row.registration_year,
      application_row.address, application_row.engine_number,
      application_row.chassis_number, application_row.plate_number,
      application_row.contact_number, application_row.route, 'active', false
    )
    returning id into approved_franchise_id;
  end if;

  if not exists (
    select 1 from public.tricycles t
    where t.franchise_id = approved_franchise_id and t.is_current
  ) then
    insert into public.tricycles (
      franchise_id, engine_number, chassis_number, plate_number, is_current
    ) values (
      approved_franchise_id, application_row.engine_number,
      application_row.chassis_number, application_row.plate_number, true
    );
  end if;

  select coalesce(p.full_name, auth.jwt() ->> 'email') into reviewer_name
  from public.profiles p
  where p.id = auth.uid();

  update public.franchise_applications
  set status = 'approved',
      admin_id = auth.uid(),
      admin_name = reviewer_name,
      admin_approved_at = now(),
      rejection_reason = null
  where id = p_application_id;

  return approved_franchise_id;
end;
$$;

revoke all on function public.approve_franchise_application(bigint) from public, anon;
grant execute on function public.approve_franchise_application(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Transactional Change Motor / MTOP approval.
-- ---------------------------------------------------------------------------
create or replace function public.approve_change_motor_request(p_request_id bigint)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  request_row public.change_motor_requests%rowtype;
  reviewer_name text;
  updated_tricycles integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'staff')
  ) then
    raise exception 'Only TFRO staff can approve Change Motor requests'
      using errcode = '42501';
  end if;

  select * into request_row
  from public.change_motor_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Change Motor request % was not found', p_request_id;
  end if;

  if request_row.status = 'approved' then
    return;
  end if;

  if request_row.franchise_id is null then
    raise exception 'The request is not linked to a franchise';
  end if;

  insert into public.change_motor_history (
    franchise_id, old_engine_number, old_chassis_number, old_plate_number,
    new_engine_number, new_chassis_number, new_plate_number, changed_by
  ) values (
    request_row.franchise_id, request_row.old_engine_number,
    request_row.old_chassis_number, request_row.old_plate_number,
    request_row.new_engine_number, request_row.new_chassis_number,
    request_row.new_plate_number, auth.uid()
  );

  update public.franchises
  set engine_number = coalesce(request_row.new_engine_number, engine_number),
      chassis_number = coalesce(request_row.new_chassis_number, chassis_number),
      plate_number = coalesce(request_row.new_plate_number, plate_number)
  where id = request_row.franchise_id;

  if not found then
    raise exception 'The linked franchise no longer exists';
  end if;

  update public.tricycles
  set engine_number = coalesce(request_row.new_engine_number, engine_number),
      chassis_number = coalesce(request_row.new_chassis_number, chassis_number),
      plate_number = coalesce(request_row.new_plate_number, plate_number),
      motor_brand = coalesce(request_row.new_motor_brand, motor_brand),
      motor_serial = coalesce(request_row.new_motor_serial, motor_serial)
  where franchise_id = request_row.franchise_id and is_current;

  get diagnostics updated_tricycles = row_count;
  if updated_tricycles = 0 then
    insert into public.tricycles (
      franchise_id, engine_number, chassis_number, plate_number,
      motor_brand, motor_serial, is_current
    ) values (
      request_row.franchise_id, request_row.new_engine_number,
      request_row.new_chassis_number, request_row.new_plate_number,
      request_row.new_motor_brand, request_row.new_motor_serial, true
    );
  end if;

  select coalesce(p.full_name, auth.jwt() ->> 'email') into reviewer_name
  from public.profiles p
  where p.id = auth.uid();

  update public.change_motor_requests
  set status = 'approved',
      admin_id = auth.uid(),
      admin_name = reviewer_name,
      admin_reviewed_at = now(),
      rejection_reason = null
  where id = p_request_id;
end;
$$;

revoke all on function public.approve_change_motor_request(bigint) from public, anon;
grant execute on function public.approve_change_motor_request(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Data API privileges are explicit. RLS remains the row-level authorization
-- layer, while these grants expose only the operations used by the browser app.
-- This also prepares the project for Supabase's 2026 explicit-grants rollout.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

grant select, insert, update, delete on table
  public.audit_logs,
  public.change_motor_history,
  public.change_motor_requests,
  public.driver_assignments,
  public.drivers,
  public.franchise_applications,
  public.franchise_documents,
  public.franchises,
  public.notifications,
  public.operators,
  public.payments,
  public.tricycles,
  public.violations
to authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name, contact_number) on table public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

notify pgrst, 'reload schema';

-- Any non-zero value here requires manual account-to-record linking in the
-- corresponding table. Ambiguous duplicate names are never linked by guess.
select
  (select count(*) from public.operators where user_id is null) as unlinked_operators,
  (select count(*) from public.drivers where user_id is null) as unlinked_drivers,
  (select count(*) from public.franchises where operator_id is null) as unlinked_franchises;

-- Verification: both RPCs should be executable by authenticated and not anon.
select
  p.proname as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('approve_franchise_application', 'approve_change_motor_request')
order by p.proname;
