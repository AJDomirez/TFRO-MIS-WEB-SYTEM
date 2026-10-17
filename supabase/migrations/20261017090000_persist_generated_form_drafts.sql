begin;

alter table public.franchise_generated_documents
  add column if not exists draft_form_data jsonb not null default '{}'::jsonb;

update public.franchise_generated_documents
set draft_form_data = form_data
where draft_form_data = '{}'::jsonb and form_data <> '{}'::jsonb;

alter table public.franchise_generated_documents
  drop constraint if exists franchise_generated_documents_form_code_check;
alter table public.franchise_generated_documents
  add constraint franchise_generated_documents_form_code_check
  check (form_code in (
    'TFRO-001', 'MTOP-PERMIT', 'TFRO-002', 'TFRO-003', 'TFRO-004',
    'TFRO-005', 'TFRO-007', 'TFRO-009', 'TFRO-010'
  ));

create or replace function private.sync_delivered_generated_form_data()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.delivered_to_operator and (
    tg_op = 'INSERT'
    or new.form_data is distinct from old.form_data
    or new.delivered_to_operator is distinct from old.delivered_to_operator
  ) then
    new.draft_form_data := new.form_data;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_delivered_generated_form_data() from public, anon, authenticated;

drop trigger if exists sync_delivered_generated_form_data on public.franchise_generated_documents;
create trigger sync_delivered_generated_form_data
before insert or update of form_data, delivered_to_operator
on public.franchise_generated_documents
for each row execute function private.sync_delivered_generated_form_data();

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
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'admin_viewer')
      and account_status = 'active'
  ) then
    raise exception 'Only active administrators can save generated form drafts';
  end if;

  if p_record_type = 'renewal' then
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

  insert into public.franchise_generated_documents
    (franchise_id, renewal_id, source_type, source_id, form_code, document_name,
     draft_form_data, created_by, updated_by)
  values
    (resolved_franchise_id, case when p_record_type = 'renewal' then p_record_id else null end,
     p_record_type, p_record_id, normalized_code, resolved_name,
     coalesce(p_form_data, '{}'::jsonb), (select auth.uid()), (select auth.uid()))
  on conflict (source_type, source_id, form_code) do update
    set draft_form_data = excluded.draft_form_data,
        document_name = excluded.document_name,
        updated_by = (select auth.uid()),
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.save_generated_form_draft(text, text, bigint, jsonb) from public, anon;
grant execute on function public.save_generated_form_draft(text, text, bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
