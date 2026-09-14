alter table public.franchise_renewals
  add column if not exists submission_attempt_count integer not null default 1
  check (submission_attempt_count >= 1);

update public.franchise_renewals set submission_attempt_count = 1
where submission_attempt_count is null or submission_attempt_count < 1;

drop policy if exists "Authorized users update renewals" on public.franchise_renewals;
create policy "Authorized users update renewals"
on public.franchise_renewals for update to authenticated
using (
  (select private.is_tfro_staff())
  or (operator_id = (select auth.uid()) and status in ('pending_review', 'needs_correction'))
)
with check (
  (select private.is_tfro_staff())
  or (operator_id = (select auth.uid()) and status = 'pending_review')
);

create or replace function private.guard_renewal_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_role text;
  operator_editable_fields constant text[] := array[
    'status', 'updated_at', 'submission_attempt_count', 'driver_id',
    'renewal_type', 'current_expiration_date', 'operator_name',
    'operator_address', 'operator_contact', 'voters_certificate_number',
    'residential_street', 'residential_barangay', 'applicant_birth_date',
    'applicant_birth_place', 'applicant_civil_status', 'cedula_number',
    'barangay_clearance_number', 'driver_name', 'driver_license_number',
    'motorcycle_make', 'motorcycle_model', 'plate_number', 'engine_number',
    'chassis_number', 'pmbl_certificate_number', 'current_or_number',
    'current_or_date', 'current_cr_number', 'or_registration_class',
    'cr_registration_class', 'change_motor_request_id',
    'temporary_mtop_expiration_date'
  ];
begin
  select role into caller_role from public.profiles where id = (select auth.uid());
  if caller_role = 'operator' then
    if old.operator_id <> (select auth.uid())
      or old.status not in ('pending_review', 'needs_correction')
      or new.status <> 'pending_review'
      or (to_jsonb(new) - operator_editable_fields)
         is distinct from (to_jsonb(old) - operator_editable_fields)
    then
      raise exception 'Operators may only revise their own submitted renewal while it is pending review';
    end if;
    new.submission_attempt_count := old.submission_attempt_count + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_renewal_update() from public, anon, authenticated;
