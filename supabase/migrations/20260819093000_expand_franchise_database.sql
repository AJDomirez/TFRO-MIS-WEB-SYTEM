alter table public.franchises
  add column if not exists previous_mtop_expiration date,
  add column if not exists birth_date date,
  add column if not exists birth_place text,
  add column if not exists civil_status text,
  add column if not exists barangay_clearance_cedula text,
  add column if not exists motorcycle_brand text,
  add column if not exists motorcycle_year_model smallint,
  add column if not exists engine_cr_number text,
  add column if not exists chassis_cr_number text,
  add column if not exists toda_name text,
  add column if not exists official_receipt_number text,
  add column if not exists driver_name text,
  add column if not exists driver_contact_number text;

alter table public.franchises
  drop constraint if exists franchises_motorcycle_year_model_check;

alter table public.franchises
  add constraint franchises_motorcycle_year_model_check
  check (
    motorcycle_year_model is null
    or motorcycle_year_model between 1900 and 2100
  );

comment on column public.franchises.previous_mtop_expiration is
  'Previous MTOP expiration date; the administrator UI derives the next expiration as three years later.';
comment on column public.franchises.birth_date is
  'Operator birth date; age is derived at display time and is not stored.';
comment on column public.franchises.barangay_clearance_cedula is
  'Barangay clearance or cedula reference recorded in the franchise database.';
