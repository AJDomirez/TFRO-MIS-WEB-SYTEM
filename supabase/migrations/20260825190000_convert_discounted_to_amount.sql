alter table public.violations
  alter column discounted drop default;

alter table public.violations
  alter column discounted type numeric(12, 2)
  using 0::numeric;

alter table public.violations
  alter column discounted set default 0;

alter table public.violations
  add constraint violations_discounted_nonnegative
  check (discounted >= 0);

comment on column public.violations.discounted is
  'Authorized peso discount deducted from the violation penalty.';
