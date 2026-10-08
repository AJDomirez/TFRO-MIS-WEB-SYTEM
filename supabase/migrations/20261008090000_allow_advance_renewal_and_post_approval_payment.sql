-- Renewal may be requested up to three months early in the client. Approval no
-- longer depends on a City Treasurer receipt or completed Treasurer payment.
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
    or (select count(distinct document.doc_type) from public.renewal_documents document
        where document.renewal_id = renewal.id
          and document.verified
          and document.doc_type in (
            'official_receipt', 'voters_certificate', 'insurance', 'cedula',
            'barangay_clearance', 'drivers_license', 'picture_2x2', 'pmbl_certification'
          )) <> 8 then
    raise exception 'All eight required renewal documents must be verified';
  end if;
  if not renewal.inspection_passed then raise exception 'Vehicle inspection must pass'; end if;
  if renewal.assessment_number is null or renewal.assessed_amount is null then
    raise exception 'TFRO assessment details are required';
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
