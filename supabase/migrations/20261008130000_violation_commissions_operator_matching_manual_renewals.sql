begin;

-- One violation may have several rostered enforcers.
create table if not exists public.violation_enforcers (
  violation_id bigint not null references public.violations(id) on delete cascade,
  enforcer_id bigint not null references public.traffic_enforcers(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (violation_id, enforcer_id)
);
create index if not exists violation_enforcers_enforcer_id_idx
  on public.violation_enforcers (enforcer_id);
alter table public.violation_enforcers enable row level security;
revoke all on table public.violation_enforcers from anon, authenticated;
grant select, insert, update, delete on table public.violation_enforcers to authenticated;

drop policy if exists "TFRO staff read active enforcer roster" on public.traffic_enforcers;
create policy "TFRO staff read active enforcer roster"
on public.traffic_enforcers for select to authenticated
using ((select private.is_tfro_staff()) and status = 'active');

drop policy if exists "Authorized users read violation enforcers" on public.violation_enforcers;
create policy "Authorized users read violation enforcers"
on public.violation_enforcers for select to authenticated
using (
  (select private.is_tfro_staff())
  or exists (
    select 1 from public.traffic_enforcers e
    where e.id = violation_enforcers.enforcer_id and e.user_id = (select auth.uid())
  )
);
drop policy if exists "TFRO staff manage violation enforcers" on public.violation_enforcers;
create policy "TFRO staff manage violation enforcers"
on public.violation_enforcers for all to authenticated
using ((select private.is_tfro_staff()))
with check ((select private.is_tfro_staff()) and assigned_by = (select auth.uid()));

alter table public.payments
  add column if not exists commission_rate numeric(5,4) not null default 0.2000,
  add column if not exists total_commission numeric(12,2) not null default 0,
  add column if not exists enforcer_count integer not null default 0,
  add column if not exists individual_commission numeric(12,2) not null default 0;

alter table public.system_settings
  add column if not exists violation_commission_rate numeric(5,4) not null default 0.2000;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'system_settings_violation_commission_rate_check'
      and conrelid = 'public.system_settings'::regclass
  ) then
    alter table public.system_settings add constraint system_settings_violation_commission_rate_check
      check (violation_commission_rate >= 0 and violation_commission_rate <= 1);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_commission_rate_check'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments add constraint payments_commission_rate_check
      check (commission_rate >= 0 and commission_rate <= 1);
  end if;
end $$;

create table if not exists public.payment_enforcer_commissions (
  payment_id bigint not null references public.payments(id) on delete cascade,
  enforcer_id bigint not null references public.traffic_enforcers(id) on delete restrict,
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  created_at timestamptz not null default now(),
  primary key (payment_id, enforcer_id)
);
create index if not exists payment_enforcer_commissions_enforcer_id_idx
  on public.payment_enforcer_commissions (enforcer_id);
alter table public.payment_enforcer_commissions enable row level security;
revoke all on table public.payment_enforcer_commissions from anon, authenticated;
grant select on table public.payment_enforcer_commissions to authenticated;

drop policy if exists "Authorized users read payment commissions" on public.payment_enforcer_commissions;
create policy "Authorized users read payment commissions"
on public.payment_enforcer_commissions for select to authenticated
using (
  (select private.is_tfro_staff())
  or exists (
    select 1 from public.traffic_enforcers e
    where e.id = payment_enforcer_commissions.enforcer_id and e.user_id = (select auth.uid())
  )
);

create or replace function private.allocate_violation_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_count integer;
  commission_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
begin
  select count(*) into assigned_count
  from public.violation_enforcers ve
  where ve.violation_id = new.violation_id;

  select coalesce(s.violation_commission_rate, 0.2000) into new.commission_rate
  from public.system_settings s where s.id = true;
  new.commission_rate := coalesce(new.commission_rate, 0.2000);
  new.total_commission := round(coalesce(new.amount, 0) * new.commission_rate, 2);
  new.enforcer_count := assigned_count;
  new.individual_commission := case when assigned_count > 0
    then trunc(new.total_commission / assigned_count, 2) else 0 end;
  return new;
end;
$$;
revoke all on function private.allocate_violation_commission() from public, anon, authenticated;

drop trigger if exists zz_allocate_violation_commission on public.payments;
create trigger zz_allocate_violation_commission
before insert or update of amount, violation_id, commission_rate on public.payments
for each row execute function private.allocate_violation_commission();

create or replace function private.persist_payment_enforcer_commissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  commission_cents bigint := round(new.total_commission * 100)::bigint;
  base_cents bigint;
  remainder_cents bigint;
begin
  delete from public.payment_enforcer_commissions where payment_id = new.id;
  if new.enforcer_count <= 0 then return new; end if;
  base_cents := commission_cents / new.enforcer_count;
  remainder_cents := commission_cents % new.enforcer_count;

  insert into public.payment_enforcer_commissions (payment_id, enforcer_id, commission_amount)
  select new.id, assigned.enforcer_id,
         (base_cents + case when assigned.position <= remainder_cents then 1 else 0 end)::numeric / 100
  from (
    select ve.enforcer_id, row_number() over (order by ve.enforcer_id) as position
    from public.violation_enforcers ve
    where ve.violation_id = new.violation_id
  ) assigned;
  return new;
end;
$$;
revoke all on function private.persist_payment_enforcer_commissions() from public, anon, authenticated;

drop trigger if exists persist_payment_enforcer_commissions on public.payments;
create trigger persist_payment_enforcer_commissions
after insert or update of amount, violation_id, commission_rate on public.payments
for each row execute function private.persist_payment_enforcer_commissions();

create or replace function private.refresh_payment_commission_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments
  set amount = amount
  where violation_id = coalesce(new.violation_id, old.violation_id);
  return null;
end;
$$;
revoke all on function private.refresh_payment_commission_assignments() from public, anon, authenticated;
drop trigger if exists refresh_payment_commission_assignments on public.violation_enforcers;
create trigger refresh_payment_commission_assignments
after insert or delete on public.violation_enforcers
for each row execute function private.refresh_payment_commission_assignments();

-- Safely connect legacy single-enforcer text entries when the stored name is
-- an exact normalized roster match. Ambiguous and multi-name text is untouched.
insert into public.violation_enforcers (violation_id, enforcer_id, assigned_by)
select v.id, e.id, v.recorded_by
from public.violations v
join public.traffic_enforcers e
  on lower(btrim(e.full_name)) = lower(btrim(v.apprehending_officers))
where nullif(btrim(v.apprehending_officers), '') is not null
on conflict (violation_id, enforcer_id) do nothing;

update public.payments set amount = amount where status = 'paid';

-- Preserve request provenance and allow staff to encode accountless renewals.
alter table public.franchise_renewals
  alter column operator_id drop not null,
  alter column driver_name drop not null,
  alter column driver_license_number drop not null,
  add column if not exists submission_source text not null default 'operator_online',
  add column if not exists encoded_by uuid references public.profiles(id) on delete set null,
  add column if not exists request_date date not null default current_date,
  add column if not exists staff_notes text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'franchise_renewals_submission_source_check'
      and conrelid = 'public.franchise_renewals'::regclass
  ) then
    alter table public.franchise_renewals add constraint franchise_renewals_submission_source_check
      check (submission_source in ('operator_online', 'staff_manual'));
  end if;
end $$;
create index if not exists franchise_renewals_encoded_by_idx
  on public.franchise_renewals (encoded_by);
create index if not exists franchise_renewals_submission_source_idx
  on public.franchise_renewals (submission_source, created_at desc);

drop policy if exists "TFRO staff create manual renewals" on public.franchise_renewals;
create policy "TFRO staff create manual renewals"
on public.franchise_renewals for insert to authenticated
with check (
  (select private.is_tfro_staff())
  and submission_source = 'staff_manual'
  and encoded_by = (select auth.uid())
);

create or replace function public.create_manual_franchise_renewal(
  p_franchise_id bigint,
  p_request_date date,
  p_renewal_type text,
  p_contact text default null,
  p_assessed_amount numeric default null,
  p_payment_or_number text default null,
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
  operator_record public.operators%rowtype;
  driver_record public.drivers%rowtype;
  renewal_id bigint;
  renewal_code_value text;
begin
  if not (select private.is_tfro_staff()) then
    raise exception 'Only TFRO staff may encode a manual renewal.' using errcode = '42501';
  end if;
  if p_renewal_type not in ('regular', 'expired_or', 'change_motor') then
    raise exception 'Invalid renewal type.';
  end if;
  if p_status not in ('pending_review', 'needs_correction', 'documents_verified', 'inspection_pending', 'assessment_pending', 'awaiting_payment') then
    raise exception 'Invalid initial renewal status.';
  end if;

  select * into franchise_record from public.franchises
  where id = p_franchise_id for share;
  if not found then raise exception 'Franchise record was not found.'; end if;
  if franchise_record.status = 'revoked' then raise exception 'A revoked franchise cannot be renewed.'; end if;
  if franchise_record.expiration_date is null then raise exception 'The franchise has no expiration date.'; end if;

  select * into operator_record from public.operators
  where upper(btrim(franchise_number)) = upper(btrim(franchise_record.franchise_number))
  order by verified desc, id limit 1;
  select * into driver_record from public.drivers
  where franchise_id = franchise_record.id order by id limit 1;

  renewal_code_value := 'REN-M-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  insert into public.franchise_renewals (
    operator_id, franchise_id, driver_id, renewal_code, renewal_type,
    current_expiration_date, operator_name, operator_address, operator_contact,
    driver_name, driver_license_number, plate_number, engine_number, chassis_number,
    current_or_number, or_registration_class, cr_registration_class,
    status, assessed_amount, payment_status, payment_or_number,
    submission_source, encoded_by, request_date, staff_notes
  ) values (
    franchise_record.operator_id, franchise_record.id, driver_record.id,
    renewal_code_value, p_renewal_type, franchise_record.expiration_date,
    franchise_record.operator_name, coalesce(franchise_record.address, ''),
    coalesce(nullif(btrim(p_contact), ''), franchise_record.contact_number, ''),
    driver_record.full_name, driver_record.license_number,
    coalesce(franchise_record.plate_number, ''), coalesce(franchise_record.engine_number, ''),
    coalesce(franchise_record.chassis_number, ''), franchise_record.official_receipt_number,
    case when p_renewal_type = 'expired_or' then 'expired' else 'for_hire' end,
    case when p_renewal_type = 'change_motor' then 'private' else 'for_hire' end,
    p_status, p_assessed_amount,
    case when nullif(btrim(p_payment_or_number), '') is null then 'pending' else 'paid' end,
    nullif(btrim(p_payment_or_number), ''), 'staff_manual', (select auth.uid()),
    coalesce(p_request_date, current_date), nullif(btrim(p_notes), '')
  ) returning id into renewal_id;

  insert into public.audit_logs (user_id, action, action_type, record, description)
  values ((select auth.uid()), 'Encoded Manual Franchise Renewal', 'create', renewal_code_value,
          'TFRO staff encoded a manual renewal for franchise ' || franchise_record.franchise_number || '.');
  return renewal_id;
end;
$$;
revoke all on function public.create_manual_franchise_renewal(bigint,date,text,text,numeric,text,text,text) from public, anon;
grant execute on function public.create_manual_franchise_renewal(bigint,date,text,text,numeric,text,text,text) to authenticated;

-- Match new Operator accounts only when both normalized name and franchise
-- number agree. Existing regulatory data is linked, not overwritten.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'operator');
  supplied_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  supplied_contact text := nullif(btrim(new.raw_user_meta_data ->> 'contact_number'), '');
  supplied_address text := nullif(btrim(new.raw_user_meta_data ->> 'address'), '');
  supplied_franchise text := nullif(upper(btrim(new.raw_user_meta_data ->> 'franchise_number')), '');
  supplied_enforcer_id text := nullif(upper(btrim(new.raw_user_meta_data ->> 'enforcer_id')), '');
  roster public.traffic_enforcers%rowtype;
  matched_operator public.operators%rowtype;
  matched_franchise public.franchises%rowtype;
begin
  if requested_role = 'traffic_enforcer' then
    select * into roster from public.traffic_enforcers
    where enforcer_id = supplied_enforcer_id for update;
    if supplied_enforcer_id is null or not found or roster.status <> 'active' then
      raise exception 'Traffic Enforcer ID is not registered or active.' using errcode = 'P0001';
    end if;
    if roster.user_id is not null and roster.user_id <> new.id then
      raise exception 'Traffic Enforcer ID is already linked to an account.' using errcode = 'P0001';
    end if;
    insert into public.profiles (id, role, full_name, contact_number)
    values (new.id, 'traffic_enforcer', coalesce(roster.full_name, supplied_name), supplied_contact)
    on conflict (id) do update set role='traffic_enforcer', full_name=excluded.full_name,
      contact_number=coalesce(excluded.contact_number, public.profiles.contact_number);
    update public.traffic_enforcers set user_id=new.id, email=lower(new.email),
      contact_number=coalesce(supplied_contact, contact_number), updated_at=now()
    where id=roster.id;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(lower(supplied_name),'') || '|' || coalesce(supplied_franchise,''), 0));
  select * into matched_franchise from public.franchises f
  where upper(btrim(f.franchise_number)) = supplied_franchise
    and lower(regexp_replace(btrim(f.operator_name), '\s+', ' ', 'g')) = lower(regexp_replace(supplied_name, '\s+', ' ', 'g'))
  order by f.id limit 1 for update;

  if found then
    select * into matched_operator from public.operators o
    where upper(btrim(o.franchise_number)) = supplied_franchise
      and lower(regexp_replace(btrim(o.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(supplied_name, '\s+', ' ', 'g'))
    order by o.verified desc, o.id limit 1 for update;
    if matched_franchise.operator_id is not null and matched_franchise.operator_id <> new.id then
      raise exception 'This franchise is already linked to another account. Contact TFRO staff.' using errcode='23505';
    end if;
    if matched_operator.id is not null and matched_operator.user_id is not null and matched_operator.user_id <> new.id then
      raise exception 'This operator record is already linked to another account. Contact TFRO staff.' using errcode='23505';
    end if;

    insert into public.profiles (id, role, full_name, contact_number)
    values (new.id, 'operator', matched_franchise.operator_name,
            coalesce(matched_franchise.contact_number, supplied_contact))
    on conflict (id) do update set role='operator', full_name=excluded.full_name,
      contact_number=coalesce(excluded.contact_number, public.profiles.contact_number);

    if matched_operator.id is not null then
      update public.operators set user_id=new.id, email=coalesce(email, lower(new.email)), verified=true
      where id=matched_operator.id;
    else
      insert into public.operators (user_id, full_name, email, address, contact_number, franchise_number, status, verified)
      values (new.id, matched_franchise.operator_name, lower(new.email), matched_franchise.address,
              matched_franchise.contact_number, matched_franchise.franchise_number, 'active', true);
    end if;
    update public.franchises set operator_id=new.id where id=matched_franchise.id;
  else
    insert into public.profiles (id, role, full_name, contact_number)
    values (new.id, 'operator', supplied_name, supplied_contact)
    on conflict (id) do update set role='operator', full_name=coalesce(excluded.full_name, public.profiles.full_name),
      contact_number=coalesce(excluded.contact_number, public.profiles.contact_number);
    insert into public.operators (user_id, full_name, email, address, contact_number, franchise_number, status, verified)
    values (new.id, supplied_name, lower(new.email), supplied_address, supplied_contact,
            supplied_franchise, 'inactive', false);
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
