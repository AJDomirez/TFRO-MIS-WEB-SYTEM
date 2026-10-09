begin;

alter table public.change_motor_requests
  alter column operator_id drop not null,
  add column if not exists operator_name text,
  add column if not exists submission_source text not null default 'operator_online',
  add column if not exists encoded_by uuid references public.profiles(id) on delete set null,
  add column if not exists request_date date not null default current_date,
  add column if not exists staff_notes text;

update public.change_motor_requests request
set operator_name = coalesce(request.operator_name, profile.full_name, franchise.operator_name)
from public.franchises franchise
left join public.profiles profile on profile.id = franchise.operator_id
where franchise.id = request.franchise_id
  and request.operator_name is null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'change_motor_requests_submission_source_check'
      and conrelid = 'public.change_motor_requests'::regclass
  ) then
    alter table public.change_motor_requests
      add constraint change_motor_requests_submission_source_check
      check (submission_source in ('operator_online', 'staff_manual'));
  end if;
end $$;

create index if not exists change_motor_requests_source_created_idx
  on public.change_motor_requests (submission_source, created_at desc);
create index if not exists change_motor_requests_encoded_by_idx
  on public.change_motor_requests (encoded_by);

drop policy if exists "TFRO staff create manual change motor" on public.change_motor_requests;
create policy "TFRO staff create manual change motor"
on public.change_motor_requests for insert to authenticated
with check (
  (select private.is_tfro_staff())
  and submission_source = 'staff_manual'
  and encoded_by = (select auth.uid())
);

create or replace function public.create_manual_change_motor_request(
  p_franchise_id bigint,
  p_request_date date,
  p_new_engine_number text default null,
  p_new_chassis_number text default null,
  p_new_plate_number text default null,
  p_new_motor_brand text default null,
  p_new_motor_serial text default null,
  p_status text default 'pending_review',
  p_notes text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  franchise_record public.franchises%rowtype;
  request_id bigint;
  request_code_value text;
begin
  if not (select private.is_tfro_staff()) then
    raise exception 'Only authorized TFRO personnel may encode a manual Change Motor request.' using errcode = '42501';
  end if;
  if p_status not in ('pending_review', 'reviewing') then
    raise exception 'Invalid initial Change Motor status.';
  end if;
  if nullif(btrim(p_new_engine_number), '') is null
     and nullif(btrim(p_new_chassis_number), '') is null
     and nullif(btrim(p_new_plate_number), '') is null
     and nullif(btrim(p_new_motor_brand), '') is null
     and nullif(btrim(p_new_motor_serial), '') is null then
    raise exception 'Enter at least one new motor, engine, chassis, or plate value.';
  end if;

  select * into franchise_record
  from public.franchises
  where id = p_franchise_id
  for share;
  if not found then raise exception 'Franchise record was not found.'; end if;
  if franchise_record.status = 'revoked' then
    raise exception 'A Change Motor request cannot be created for a revoked franchise.';
  end if;
  if exists (
    select 1 from public.change_motor_requests
    where franchise_id = franchise_record.id
      and status in ('pending_review', 'reviewing')
  ) then
    raise exception 'This franchise already has an active Change Motor request.';
  end if;

  request_code_value := 'MTR-M-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  insert into public.change_motor_requests (
    operator_id, franchise_id, request_code, operator_name,
    old_engine_number, old_chassis_number, old_plate_number,
    old_motor_brand, old_motor_model,
    new_engine_number, new_chassis_number, new_plate_number,
    new_motor_brand, new_motor_serial, status,
    submission_source, encoded_by, request_date, staff_notes
  ) values (
    franchise_record.operator_id, franchise_record.id, request_code_value,
    franchise_record.operator_name, franchise_record.engine_number,
    franchise_record.chassis_number, franchise_record.plate_number,
    franchise_record.motorcycle_brand, franchise_record.motorcycle_year_model,
    nullif(btrim(p_new_engine_number), ''), nullif(btrim(p_new_chassis_number), ''),
    nullif(btrim(p_new_plate_number), ''), nullif(btrim(p_new_motor_brand), ''),
    nullif(btrim(p_new_motor_serial), ''), p_status, 'staff_manual',
    (select auth.uid()), coalesce(p_request_date, current_date), nullif(btrim(p_notes), '')
  ) returning id into request_id;

  insert into public.audit_logs (user_id, action, action_type, record, description)
  values (
    (select auth.uid()), 'Encoded Manual Change Motor Request', 'create', request_code_value,
    'TFRO personnel encoded a manual Change Motor request for franchise ' || franchise_record.franchise_number || '.'
  );

  return request_id;
end;
$$;

revoke all on function public.create_manual_change_motor_request(bigint,date,text,text,text,text,text,text,text)
  from public, anon;
grant execute on function public.create_manual_change_motor_request(bigint,date,text,text,text,text,text,text,text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
