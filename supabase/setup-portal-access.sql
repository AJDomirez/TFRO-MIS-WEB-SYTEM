-- Run this once in Supabase Dashboard > SQL Editor after:
--   setup-auth.sql, setup-drivers.sql, setup-operators.sql,
--   setup-franchises.sql, setup-violations.sql
--
-- Grants operators read access to their own records.
-- Records are matched by full_name because that is how the tables are linked.

drop policy if exists "Drivers can read their own record" on public.drivers;

-- OPERATORS: an operator can read their own record
drop policy if exists "Operators can read their own record" on public.operators;
create policy "Operators can read their own record"
on public.operators
for select
to authenticated
using (
  (select role from public.profiles where id = auth.uid()) = 'operator'
  and full_name = (select full_name from public.profiles where id = auth.uid())
);

-- FRANCHISES: an operator can read their own franchise(s)
drop policy if exists "Operators can read their own franchise" on public.franchises;
create policy "Operators can read their own franchise"
on public.franchises
for select
to authenticated
using (
  (select role from public.profiles where id = auth.uid()) = 'operator'
  and operator_name = (select full_name from public.profiles where id = auth.uid())
);

-- VIOLATIONS: an operator can read violations under their own name
drop policy if exists "Users can read their own violations" on public.violations;
create policy "Users can read their own violations"
on public.violations
for select
to authenticated
using (
  subject_name = (select full_name from public.profiles where id = auth.uid())
);

