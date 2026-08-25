alter table public.violations
  add column if not exists discounted boolean not null default false;

comment on column public.violations.discounted is
  'Whether the assessed violation received an authorized discount.';
