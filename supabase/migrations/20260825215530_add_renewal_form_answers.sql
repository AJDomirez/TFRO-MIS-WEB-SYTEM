alter table public.franchise_renewals
  add column if not exists residential_street text,
  add column if not exists residential_barangay text,
  add column if not exists applicant_birth_date date,
  add column if not exists applicant_birth_place text,
  add column if not exists applicant_civil_status text,
  add column if not exists motorcycle_make text,
  add column if not exists motorcycle_model text,
  add column if not exists current_or_date date;

comment on column public.franchise_renewals.residential_street is 'Home number, street, or purok entered for TFRO-005.';
comment on column public.franchise_renewals.residential_barangay is 'Barangay entered for TFRO-005.';
comment on column public.franchise_renewals.applicant_birth_date is 'Applicant birth date entered during renewal.';
comment on column public.franchise_renewals.applicant_birth_place is 'Applicant place of birth entered during renewal.';
comment on column public.franchise_renewals.applicant_civil_status is 'Applicant civil status entered during renewal.';
comment on column public.franchise_renewals.motorcycle_make is 'Current motorcycle make entered during renewal.';
comment on column public.franchise_renewals.motorcycle_model is 'Current motorcycle model entered during renewal.';
comment on column public.franchise_renewals.current_or_date is 'Date of the current official receipt entered during renewal.';
