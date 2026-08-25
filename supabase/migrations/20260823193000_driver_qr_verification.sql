create table if not exists public.driver_qr_verifications (
  driver_id bigint primary key references public.drivers(id) on delete cascade,
  qr_token uuid not null unique default gen_random_uuid(),
  full_name text not null,
  license_number text not null,
  license_type text,
  license_expiration date,
  license_status text not null,
  operator_name text,
  compliance text not null,
  violation_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.driver_qr_verifications enable row level security;
revoke all on table public.driver_qr_verifications from anon, authenticated;
grant select on table public.driver_qr_verifications to authenticated;

create policy "All system users verify Drivers by QR"
on public.driver_qr_verifications for select to authenticated
using ((select auth.uid()) is not null);

create or replace function private.sync_driver_qr_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.driver_qr_verifications (
    driver_id, full_name, license_number, license_type, license_expiration,
    license_status, operator_name, compliance, violation_count, updated_at
  ) values (
    new.id, new.full_name, new.license_number, new.license_type,
    new.license_expiration, new.license_status, new.operator_name,
    new.compliance, new.violation_count, now()
  )
  on conflict (driver_id) do update set
    full_name = excluded.full_name,
    license_number = excluded.license_number,
    license_type = excluded.license_type,
    license_expiration = excluded.license_expiration,
    license_status = excluded.license_status,
    operator_name = excluded.operator_name,
    compliance = excluded.compliance,
    violation_count = excluded.violation_count,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function private.sync_driver_qr_verification() from public, anon, authenticated;

drop trigger if exists sync_driver_qr_verification on public.drivers;
create trigger sync_driver_qr_verification
after insert or update of full_name, license_number, license_type, license_expiration,
  license_status, operator_name, compliance, violation_count
on public.drivers for each row execute function private.sync_driver_qr_verification();

insert into public.driver_qr_verifications (
  driver_id, full_name, license_number, license_type, license_expiration,
  license_status, operator_name, compliance, violation_count, updated_at
)
select id, full_name, license_number, license_type, license_expiration,
  license_status, operator_name, compliance, violation_count, now()
from public.drivers
on conflict (driver_id) do update set
  full_name = excluded.full_name,
  license_number = excluded.license_number,
  license_type = excluded.license_type,
  license_expiration = excluded.license_expiration,
  license_status = excluded.license_status,
  operator_name = excluded.operator_name,
  compliance = excluded.compliance,
  violation_count = excluded.violation_count,
  updated_at = excluded.updated_at;

comment on table public.driver_qr_verifications is
  'Privacy-limited Driver identity data available to authenticated TFRO system roles through an unguessable QR token.';
