begin;

create or replace function public.create_complete_manual_franchise_renewal(
  p_franchise_id bigint,
  p_details jsonb,
  p_approve boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  franchise_record public.franchises%rowtype;
  driver_record public.drivers%rowtype;
  renewal_id bigint;
  renewal_code_value text;
  renewal_type_value text := coalesce(nullif(btrim(p_details->>'renewal_type'), ''), 'regular');
  request_date_value date := coalesce(nullif(p_details->>'request_date', '')::date, current_date);
  expected_release_value date := nullif(p_details->>'expected_release_date', '')::date;
  current_expiration_value date;
  calculated_expiration date;
  assessed_amount_value numeric := nullif(p_details->>'assessed_amount', '')::numeric;
  change_motor_id_value bigint := nullif(p_details->>'change_motor_request_id', '')::bigint;
  requirements_verified boolean := coalesce((p_details->>'requirements_verified')::boolean, false);
  inspection_verified boolean := coalesce((p_details->>'inspection_passed')::boolean, false);
  lto_verified boolean := coalesce((p_details->>'lto_verified')::boolean, false);
  payment_or_value text := nullif(btrim(p_details->>'payment_or_number'), '');
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('admin', 'admin_viewer')
  ) then
    raise exception 'Only an Administrator or Head Administrator may encode and approve a complete manual renewal.' using errcode = '42501';
  end if;
  if renewal_type_value not in ('regular', 'expired_or', 'change_motor') then
    raise exception 'Invalid renewal type.';
  end if;

  select * into franchise_record
  from public.franchises
  where id = p_franchise_id
  for update;
  if not found then raise exception 'Franchise record was not found.'; end if;
  if franchise_record.status = 'revoked' then raise exception 'A revoked franchise cannot be renewed.'; end if;
  if franchise_record.expiration_date is null then raise exception 'The franchise has no expiration date.'; end if;
  current_expiration_value := franchise_record.expiration_date;

  if exists (
    select 1 from public.franchise_renewals renewal
    where renewal.franchise_id = franchise_record.id
      and renewal.status not in ('approved', 'rejected')
  ) then
    raise exception 'This franchise already has an active renewal request.';
  end if;

  if renewal_type_value = 'change_motor' then
    if change_motor_id_value is null or not exists (
      select 1 from public.change_motor_requests motor
      where motor.id = change_motor_id_value
        and motor.franchise_id = franchise_record.id
        and motor.status = 'approved'
    ) then
      raise exception 'Select an approved Change Motor request for this franchise.';
    end if;
  else
    change_motor_id_value := null;
  end if;

  if p_approve then
    if not requirements_verified then raise exception 'Confirm that all original renewal requirements were received and verified.'; end if;
    if not inspection_verified then raise exception 'Confirm that the vehicle inspection passed.'; end if;
    if not lto_verified
       or coalesce(p_details->>'or_registration_class', '') <> 'for_hire'
       or coalesce(p_details->>'cr_registration_class', '') <> 'for_hire' then
      raise exception 'Verify the LTO Lucena City For Hire OR and CR before direct approval.';
    end if;
    if nullif(btrim(p_details->>'assessment_number'), '') is null or assessed_amount_value is null then
      raise exception 'Assessment number and assessed amount are required for direct approval.';
    end if;
    if nullif(btrim(p_details->>'mtop_number'), '') is null then raise exception 'MTOP number is required for direct approval.'; end if;
    if expected_release_value is null
       or expected_release_value < current_date + 7
       or expected_release_value > current_date + 14 then
      raise exception 'Expected MTOP release must be 7 to 14 days from approval.';
    end if;
  end if;

  select * into driver_record
  from public.drivers
  where franchise_id = franchise_record.id
  order by id limit 1;

  renewal_code_value := 'REN-M-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  calculated_expiration := (current_expiration_value + interval '3 years')::date;

  insert into public.franchise_renewals (
    operator_id, franchise_id, driver_id, renewal_code, renewal_type,
    current_expiration_date, operator_name, operator_address, operator_contact,
    residential_street, residential_barangay, applicant_birth_date,
    applicant_birth_place, applicant_civil_status, driver_name,
    driver_license_number, plate_number, engine_number, chassis_number,
    motorcycle_make, motorcycle_model, pmbl_certificate_number,
    current_or_number, current_or_date, current_cr_number,
    or_registration_class, cr_registration_class, franchise_check_status,
    status, documents_complete, inspection_results, inspection_passed,
    inspection_remarks, assessment_number, assessment_date, assessed_amount,
    payment_status, payment_or_number, mtop_number, issuance_status,
    expected_release_date, new_expiration_date, reviewed_by, reviewed_at,
    lto_lucena_for_hire_verified, change_motor_request_id,
    hardcopy_requirements_received, hardcopy_received_at, hardcopy_received_by,
    hardcopy_received_notes, submission_source, encoded_by, request_date, staff_notes
  ) values (
    franchise_record.operator_id, franchise_record.id, driver_record.id,
    renewal_code_value, renewal_type_value, current_expiration_value,
    franchise_record.operator_name,
    coalesce(nullif(btrim(p_details->>'operator_address'), ''), franchise_record.address, ''),
    coalesce(nullif(btrim(p_details->>'operator_contact'), ''), franchise_record.contact_number, ''),
    nullif(btrim(p_details->>'residential_street'), ''),
    nullif(btrim(p_details->>'residential_barangay'), ''),
    nullif(p_details->>'applicant_birth_date', '')::date,
    nullif(btrim(p_details->>'applicant_birth_place'), ''),
    nullif(btrim(p_details->>'applicant_civil_status'), ''),
    coalesce(nullif(btrim(p_details->>'driver_name'), ''), driver_record.full_name),
    coalesce(nullif(btrim(p_details->>'driver_license_number'), ''), driver_record.license_number),
    coalesce(nullif(btrim(p_details->>'plate_number'), ''), franchise_record.plate_number, ''),
    coalesce(nullif(btrim(p_details->>'engine_number'), ''), franchise_record.engine_number, ''),
    coalesce(nullif(btrim(p_details->>'chassis_number'), ''), franchise_record.chassis_number, ''),
    coalesce(nullif(btrim(p_details->>'motorcycle_make'), ''), franchise_record.motorcycle_brand),
    coalesce(nullif(btrim(p_details->>'motorcycle_model'), ''), franchise_record.motorcycle_year_model),
    nullif(btrim(p_details->>'pmbl_certificate_number'), ''),
    coalesce(nullif(btrim(p_details->>'current_or_number'), ''), franchise_record.official_receipt_number),
    nullif(p_details->>'current_or_date', '')::date,
    coalesce(nullif(btrim(p_details->>'current_cr_number'), ''), franchise_record.chassis_cr_number),
    coalesce(nullif(p_details->>'or_registration_class', ''), 'for_hire'),
    coalesce(nullif(p_details->>'cr_registration_class', ''), 'for_hire'),
    coalesce(nullif(p_details->>'franchise_check_status', ''),
      case when current_expiration_value < current_date then 'expired' else 'up_to_date' end),
    case when p_approve then 'approved' else 'pending_review' end,
    requirements_verified,
    case when inspection_verified then jsonb_build_object(
      'functional_horn', true, 'signal_lights', true, 'head_tail_lights', true,
      'sidecar_interior_light', true, 'sidecar_light_kept_on', true,
      'anti_noise_muffler', true, 'body_number_sticker', true,
      'garbage_receptacle', true, 'clean_windshield', true
    ) else '{}'::jsonb end,
    inspection_verified, nullif(btrim(p_details->>'inspection_remarks'), ''),
    nullif(btrim(p_details->>'assessment_number'), ''),
    nullif(p_details->>'assessment_date', '')::date, assessed_amount_value,
    case when payment_or_value is null then 'pending' else 'paid' end,
    payment_or_value, nullif(btrim(p_details->>'mtop_number'), ''),
    case when p_approve then 'for_printing' else 'not_ready' end,
    expected_release_value, case when p_approve then calculated_expiration else null end,
    case when p_approve then (select auth.uid()) else null end,
    case when p_approve then now() else null end,
    lto_verified, change_motor_id_value,
    requirements_verified, case when requirements_verified then now() else null end,
    case when requirements_verified then (select auth.uid()) else null end,
    nullif(btrim(p_details->>'hardcopy_notes'), ''),
    'staff_manual', (select auth.uid()), request_date_value,
    nullif(btrim(p_details->>'staff_notes'), '')
  ) returning id into renewal_id;

  if p_approve then
    update public.franchises
    set status = 'active', application_type = 'renewal',
        application_date = current_date, expiration_date = calculated_expiration
    where id = franchise_record.id;
  end if;

  insert into public.audit_logs (user_id, action, action_type, record, description)
  values (
    (select auth.uid()),
    case when p_approve then 'Encoded and Approved Manual Franchise Renewal' else 'Encoded Complete Manual Franchise Renewal' end,
    case when p_approve then 'approve' else 'create' end,
    renewal_code_value,
    case when p_approve
      then 'Administrator encoded and directly approved a complete manual renewal for franchise ' || franchise_record.franchise_number || '.'
      else 'Administrator encoded a complete manual renewal for franchise ' || franchise_record.franchise_number || '.'
    end
  );

  return jsonb_build_object(
    'id', renewal_id, 'renewal_code', renewal_code_value,
    'status', case when p_approve then 'approved' else 'pending_review' end,
    'new_expiration_date', case when p_approve then calculated_expiration else null end
  );
end;
$$;

revoke all on function public.create_complete_manual_franchise_renewal(bigint,jsonb,boolean)
  from public, anon;
grant execute on function public.create_complete_manual_franchise_renewal(bigint,jsonb,boolean)
  to authenticated;

-- Manual in-person requests use physically received originals instead of
-- uploaded renewal_documents. Online requests retain the digital-document rule.
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
  select * into renewal from public.franchise_renewals where id = p_renewal_id for update;
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
      and motor_request.franchise_id = renewal.franchise_id
      and motor_request.status = 'approved'
  ) then
    raise exception 'The linked Change Motor request must be approved first';
  end if;
  if not renewal.documents_complete or not (
    (renewal.submission_source = 'staff_manual' and renewal.hardcopy_requirements_received)
    or (select count(distinct document.doc_type) from public.renewal_documents document
        where document.renewal_id = renewal.id and document.verified
          and document.doc_type in (
            'official_receipt', 'voters_certificate', 'insurance', 'cedula',
            'barangay_clearance', 'drivers_license', 'picture_2x2', 'pmbl_certification'
          )) = 8
  ) then
    raise exception 'All required renewal documents or received hardcopies must be verified';
  end if;
  if not renewal.inspection_passed then raise exception 'Vehicle inspection must pass'; end if;
  if renewal.assessment_number is null or renewal.assessed_amount is null then
    raise exception 'TFRO assessment details are required';
  end if;
  if nullif(trim(p_mtop_number), '') is null then raise exception 'MTOP number is required'; end if;
  if p_expected_release_date < current_date + 7 or p_expected_release_date > current_date + 14 then
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

revoke all on function public.approve_franchise_renewal(bigint,text,date) from public, anon;
grant execute on function public.approve_franchise_renewal(bigint,text,date) to authenticated;

notify pgrst, 'reload schema';

commit;
