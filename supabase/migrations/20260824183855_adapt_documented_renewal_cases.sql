-- Enforce the renewal cases documented by TFRO.

alter table public.franchise_renewals
  add column if not exists lto_lucena_for_hire_verified boolean not null default false,
  add column if not exists change_motor_request_id bigint references public.change_motor_requests(id) on delete restrict,
  add column if not exists temporary_mtop_number text,
  add column if not exists temporary_mtop_expiration_date date;

create index if not exists franchise_renewals_change_motor_request_id_idx
  on public.franchise_renewals (change_motor_request_id)
  where change_motor_request_id is not null;

drop policy if exists "Operators create renewals" on public.franchise_renewals;
create policy "Operators create renewals"
on public.franchise_renewals for insert to authenticated
with check (
  operator_id = (select auth.uid())
  and status = 'pending_review'
  and franchise_check_status = 'pending'
  and documents_complete = false
  and inspection_results = '{}'::jsonb
  and inspection_passed = false
  and assessed_amount is null
  and payment_status = 'pending'
  and temporary_mtop_issued = false
  and temporary_mtop_number is null
  and temporary_mtop_expiration_date is null
  and lto_lucena_for_hire_verified = false
  and issuance_status = 'not_ready'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.franchises franchise_record
    where franchise_record.id = franchise_id
      and franchise_record.operator_id = (select auth.uid())
      and franchise_record.status <> 'revoked'
      and franchise_record.expiration_date = current_expiration_date
      and franchise_record.expiration_date <= current_date
  )
  and exists (
    select 1
    from public.drivers driver_record
    join public.operators operator_record on operator_record.id = driver_record.operator_id
    where driver_record.id = driver_id
      and operator_record.user_id = (select auth.uid())
  )
  and (
    (renewal_type <> 'change_motor' and change_motor_request_id is null)
    or exists (
      select 1 from public.change_motor_requests motor_request
      where motor_request.id = change_motor_request_id
        and motor_request.operator_id = (select auth.uid())
        and motor_request.franchise_id = franchise_id
        and motor_request.status in ('pending_review', 'reviewing', 'approved')
    )
  )
);

create or replace function public.approve_franchise_renewal(
  p_renewal_id bigint,
  p_mtop_number text,
  p_expected_release_date date
)
returns date
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  renewal public.franchise_renewals%rowtype;
  calculated_expiration date;
begin
  if not (select private.is_tfro_staff()) then
    raise exception 'Only TFRO Staff may approve franchise renewals';
  end if;

  select * into renewal
  from public.franchise_renewals
  where id = p_renewal_id
  for update;

  if not found then raise exception 'Renewal request was not found'; end if;
  if renewal.franchise_check_status not in ('up_to_date', 'expired') then
    raise exception 'Complete the franchise status check before approval';
  end if;
  if not renewal.lto_lucena_for_hire_verified
     or renewal.or_registration_class <> 'for_hire'
     or renewal.cr_registration_class <> 'for_hire' then
    raise exception 'LTO Lucena City For Hire OR and CR must be verified';
  end if;
  if renewal.renewal_type = 'change_motor' and not exists (
    select 1 from public.change_motor_requests motor_request
    where motor_request.id = renewal.change_motor_request_id
      and motor_request.operator_id = renewal.operator_id
      and motor_request.franchise_id = renewal.franchise_id
      and motor_request.status = 'approved'
  ) then
    raise exception 'The linked Change Motor request must be approved first';
  end if;
  if not renewal.documents_complete
    or (select count(*) from public.renewal_documents document
        where document.renewal_id = renewal.id and document.verified) <> 9 then
    raise exception 'All nine renewal documents must be verified';
  end if;
  if not renewal.inspection_passed then raise exception 'Vehicle inspection must pass'; end if;
  if renewal.assessment_number is null or renewal.assessed_amount is null then
    raise exception 'TFRO assessment details are required';
  end if;
  if renewal.payment_status <> 'paid' or nullif(trim(renewal.payment_or_number), '') is null then
    raise exception 'Treasurer payment and payment OR number must be confirmed';
  end if;
  if nullif(trim(p_mtop_number), '') is null then raise exception 'MTOP number is required'; end if;
  if p_expected_release_date < current_date + 7
     or p_expected_release_date > current_date + 14 then
    raise exception 'Expected MTOP release must be 7 to 14 days from approval';
  end if;

  calculated_expiration := (renewal.current_expiration_date + interval '3 years')::date;

  update public.franchises
  set status = 'active', application_type = 'renewal', application_date = current_date,
      expiration_date = calculated_expiration
  where id = renewal.franchise_id;

  update public.franchise_renewals
  set status = 'approved', decision_reason = null, mtop_number = trim(p_mtop_number),
      issuance_status = 'for_printing', expected_release_date = p_expected_release_date,
      new_expiration_date = calculated_expiration, reviewed_by = (select auth.uid()),
      reviewed_at = now(), updated_at = now()
  where id = renewal.id;

  return calculated_expiration;
end;
$$;

revoke all on function public.approve_franchise_renewal(bigint, text, date) from public, anon;
grant execute on function public.approve_franchise_renewal(bigint, text, date) to authenticated;
