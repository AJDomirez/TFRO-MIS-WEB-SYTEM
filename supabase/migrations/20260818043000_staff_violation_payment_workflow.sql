-- TFRO Staff exclusively manage violation and payment transactions.
-- Administrators retain read-only summary access through existing SELECT policies.

create table if not exists public.violation_catalog (
  code text primary key,
  violation text not null,
  penalty numeric(12,2) not null check (penalty >= 0),
  active boolean not null default true
);

insert into public.violation_catalog (code, violation, penalty) values
('5001','Colorum Tricycle - 1st Offense',3000),('5002','Colorum Tricycle - 2nd and succeeding offense',5000),
('5003','Without ID Plate - 1st offense',200),('5004','Without ID Plate - 2nd offense',400),
('5005','Removal/Tampering of ID Card - 1st Offense',200),('5006','Removal/Tampering of ID Card - 2nd Offense',400),
('5007','Without Serial No. on windshield and/or Plate - 1st Offense',200),('5008','Without Serial No. on windshield and/or Plate - 2nd Offense',400),
('5009','Using Improvised ID No. Plate without Permit - 1st Offense',200),('5010','Using Improvised ID No. Plate without Permit - 2nd Offense',400),
('5011','Operating on Banned Days - 1st Offense',200),('5012','Operating on Banned Days - 2nd Offense',400),
('5013','No garbage receptacle - 1st Offense',200),('5014','No garbage receptacle - 2nd Offense',400),
('5015','Wearing Slipper, sando or short - 1st Offense',200),('5016','Wearing Slipper, sando or short - 2nd Offense',500),
('5017','Wearing Slipper, sando or short - 3rd Offense',1000),('5018','Overcharging - 1st Offense',200),
('5019','Overcharging - 2nd Offense',500),('5020','Overcharging - 3rd Offense',1000),
('5024','Refusal to Convey Passenger - 1st Offense',200),('5025','Refusal to Convey Passenger - 2nd Offense',500),
('5026','Refusal to Convey Passenger - 3rd Offense',1000),('5027','Selling of MTOP/Franchise Line',5000)
on conflict (code) do update set violation=excluded.violation, penalty=excluded.penalty;

alter table public.violation_catalog enable row level security;
drop policy if exists "Authenticated read violation catalog" on public.violation_catalog;
create policy "Authenticated read violation catalog" on public.violation_catalog for select to authenticated using (true);
grant select on public.violation_catalog to authenticated;

alter table public.violations add column if not exists violation_code text references public.violation_catalog(code);
alter table public.violations add column if not exists classification text;
alter table public.violations add column if not exists franchise_number text;
alter table public.violations add column if not exists ticket_number text;
alter table public.violations add column if not exists apprehending_officers text;
alter table public.violations add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

alter table public.payments add column if not exists violation_id bigint references public.violations(id) on delete set null;
alter table public.payments add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

drop policy if exists "Staff can add violations" on public.violations;
drop policy if exists "Staff can update violations" on public.violations;
create policy "TFRO Staff add violations" on public.violations for insert to authenticated
with check (exists(select 1 from public.profiles where id=auth.uid() and role='staff'));
create policy "TFRO Staff update violations" on public.violations for update to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='staff'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='staff'));

drop policy if exists "Staff manage payments" on public.payments;
create policy "TFRO Staff add payments" on public.payments for insert to authenticated
with check (exists(select 1 from public.profiles where id=auth.uid() and role='staff'));
create policy "TFRO Staff update payments" on public.payments for update to authenticated
using (exists(select 1 from public.profiles where id=auth.uid() and role='staff'))
with check (exists(select 1 from public.profiles where id=auth.uid() and role='staff'));

create or replace function public.notify_violation_recipient()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; notice_message text;
begin
  if new.subject_type='operator' then
    select user_id into recipient from public.operators where lower(full_name)=lower(new.subject_name) limit 1;
    notice_message := 'A violation ('||coalesce(new.violation_code,'')||' '||new.violation_type||') was recorded with a penalty of PHP '||new.penalty||'.';
  else
    select o.user_id into recipient from public.drivers d left join public.operators o on o.id=d.operator_id
    where lower(d.full_name)=lower(new.subject_name) limit 1;
    if recipient is null then select o.user_id into recipient from public.drivers d join public.operators o on lower(o.full_name)=lower(d.operator_name) where lower(d.full_name)=lower(new.subject_name) limit 1; end if;
    notice_message := 'Driver '||new.subject_name||' received violation ('||coalesce(new.violation_code,'')||' '||new.violation_type||') with a penalty of PHP '||new.penalty||'.';
  end if;
  if recipient is not null then insert into public.notifications(title,message,type,user_id) values('Violation Notice',notice_message,'warning',recipient); end if;
  return new;
end; $$;
revoke all on function public.notify_violation_recipient() from public,anon,authenticated;
drop trigger if exists notify_violation_recipient on public.violations;
create trigger notify_violation_recipient after insert on public.violations for each row execute function public.notify_violation_recipient();

create or replace function public.mark_violation_paid()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.violation_id is not null and new.status='paid' then update public.violations set status='paid' where id=new.violation_id; end if;
  return new;
end; $$;
revoke all on function public.mark_violation_paid() from public,anon,authenticated;
drop trigger if exists mark_violation_paid on public.payments;
create trigger mark_violation_paid after insert or update on public.payments for each row execute function public.mark_violation_paid();
