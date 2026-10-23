begin;

alter table public.franchise_generated_documents
  drop constraint if exists franchise_generated_documents_source_type_check;
alter table public.franchise_generated_documents
  add constraint franchise_generated_documents_source_type_check
  check (source_type in ('franchise', 'renewal', 'change_motor', 'payment'));

alter table public.franchise_generated_document_drafts
  drop constraint if exists franchise_generated_document_drafts_source_type_check;
alter table public.franchise_generated_document_drafts
  add constraint franchise_generated_document_drafts_source_type_check
  check (source_type in ('franchise', 'renewal', 'change_motor', 'payment'));

create or replace function public.save_generated_form_draft(
  p_form_code text,
  p_record_type text,
  p_record_id bigint,
  p_form_data jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_franchise_id bigint;
  normalized_code text := upper(btrim(p_form_code));
  resolved_name text;
begin
  if not (select private.is_active_administrator()) then
    raise exception 'Only active administrators can save generated form drafts';
  end if;

  if p_record_type = 'franchise' then
    select id into resolved_franchise_id
    from public.franchises where id = p_record_id;
  elsif p_record_type = 'renewal' then
    select franchise_id into resolved_franchise_id
    from public.franchise_renewals where id = p_record_id;
  elsif p_record_type = 'change_motor' then
    select franchise_id into resolved_franchise_id
    from public.change_motor_requests where id = p_record_id;
  elsif p_record_type = 'payment' then
    select coalesce(driver_franchise.id, numbered_franchise.id)
      into resolved_franchise_id
    from public.payments payment_record
    join public.violations violation_record on violation_record.id = payment_record.violation_id
    left join public.drivers driver_record on driver_record.id = violation_record.driver_id
    left join public.franchises driver_franchise on driver_franchise.id = driver_record.franchise_id
    left join public.franchises numbered_franchise
      on upper(btrim(numbered_franchise.franchise_number)) = upper(btrim(violation_record.franchise_number))
    where payment_record.id = p_record_id
    order by driver_franchise.id nulls last, numbered_franchise.id nulls last
    limit 1;
  else
    raise exception 'Unsupported form record type';
  end if;

  if resolved_franchise_id is null then
    raise exception 'This transaction is not linked to a franchise record';
  end if;

  resolved_name := case normalized_code
    when 'TFRO-001' then 'Temporary MTOP'
    when 'MTOP-PERMIT' then 'Motorized Tricycle Operator''s Permit'
    when 'TFRO-002' then 'Petition for Dropping'
    when 'TFRO-003' then 'PMBL Certification'
    when 'TFRO-004' then 'Checklist of Requirements'
    when 'TFRO-005' then 'Application for Motorized Tricycle Operator Permit'
    when 'TFRO-007' then 'Certification of Dropping'
    when 'TFRO-009' then 'Order of Payment'
    when 'TFRO-010' then 'Unit Releasing Slip'
    else normalized_code
  end;

  insert into public.franchise_generated_document_drafts
    (franchise_id, renewal_id, source_type, source_id, form_code, document_name,
     form_data, created_by, updated_by)
  values
    (resolved_franchise_id, case when p_record_type = 'renewal' then p_record_id else null end,
     p_record_type, p_record_id, normalized_code, resolved_name,
     coalesce(p_form_data, '{}'::jsonb), (select auth.uid()), (select auth.uid()))
  on conflict (source_type, source_id, form_code) do update
    set form_data = excluded.form_data,
        document_name = excluded.document_name,
        updated_by = (select auth.uid()),
        updated_at = now();

  return true;
end;
$$;

create or replace function private.send_operator_form(
  p_form_code text,
  p_record_type text,
  p_record_id bigint,
  p_form_data jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  resolved_franchise_id bigint;
  normalized_code text := upper(btrim(p_form_code));
  resolved_name text;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'admin_viewer')
      and account_status = 'active'
  ) then
    raise exception 'Only administrators can send operator forms';
  end if;

  if p_record_type = 'franchise' then
    select operator_id, id into recipient, resolved_franchise_id
    from public.franchises where id = p_record_id;
  elsif p_record_type = 'renewal' then
    select operator_id, franchise_id into recipient, resolved_franchise_id
    from public.franchise_renewals where id = p_record_id;
  elsif p_record_type = 'change_motor' then
    select operator_id, franchise_id into recipient, resolved_franchise_id
    from public.change_motor_requests where id = p_record_id;
  elsif p_record_type = 'payment' then
    select coalesce(operator_record.user_id, direct_operator.user_id), franchise.id
      into recipient, resolved_franchise_id
    from public.payments payment_record
    join public.violations violation_record on violation_record.id = payment_record.violation_id
    left join public.drivers driver_record on driver_record.id = violation_record.driver_id
    left join public.operators operator_record on operator_record.id = driver_record.operator_id
    left join public.operators direct_operator on lower(direct_operator.full_name) = lower(violation_record.subject_name)
    left join public.franchises franchise on franchise.operator_id = coalesce(operator_record.user_id, direct_operator.user_id)
    where payment_record.id = p_record_id
    order by franchise.id
    limit 1;
  else
    raise exception 'Unsupported form record type';
  end if;

  if recipient is null then
    raise exception 'This record is not linked to an operator account';
  end if;

  resolved_name := case normalized_code
    when 'TFRO-001' then 'Temporary MTOP'
    when 'MTOP-PERMIT' then 'Motorized Tricycle Operator''s Permit'
    when 'TFRO-003' then 'PMBL Certification'
    when 'TFRO-004' then 'Checklist of Requirements'
    when 'TFRO-005' then 'Application for Motorized Tricycle Operator Permit'
    when 'TFRO-007' then 'Change Motor Form'
    when 'TFRO-009' then 'Payment Order'
    when 'TFRO-010' then 'Unit Release Form'
    else normalized_code
  end;

  insert into public.franchise_generated_documents
    (franchise_id, renewal_id, source_type, source_id, form_code, document_name, form_data,
     delivered_to_operator, delivered_at, created_by, updated_by)
  values
    (resolved_franchise_id, case when p_record_type = 'renewal' then p_record_id else null end,
     p_record_type, p_record_id, normalized_code, resolved_name, coalesce(p_form_data, '{}'::jsonb),
     true, now(), (select auth.uid()), (select auth.uid()))
  on conflict (source_type, source_id, form_code) do update
    set form_data = excluded.form_data,
        document_name = excluded.document_name,
        delivered_to_operator = true,
        delivered_at = now(),
        updated_by = (select auth.uid()),
        updated_at = now();

  insert into public.notifications (title, message, link, type, user_id)
  values (
    normalized_code || ' Form Received',
    'TFRO saved and sent ' || normalized_code || ' to your franchise record. Open your portal to view or generate the form.',
    case when p_record_type = 'renewal' then 'renewal.html' else 'operatorportal.html' end,
    'success', recipient
  );
  return true;
end;
$$;

revoke all on function private.send_operator_form(text, text, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_generated_form_draft(text, text, bigint, jsonb)
  from public, anon;
grant execute on function public.save_generated_form_draft(text, text, bigint, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
commit;
