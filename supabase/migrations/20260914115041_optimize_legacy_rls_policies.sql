-- Remove policies made redundant by later, stricter policies.
drop policy if exists "Operators can read their own record" on public.operators;
drop policy if exists "Staff manage operators" on public.operators;
drop policy if exists "Allow staff read audit_logs" on public.audit_logs;
drop policy if exists "Users save their formal profile picture path" on public.profiles;

-- Cache auth.uid() once per statement instead of evaluating it for every row.
alter policy "Operator read own" on public.operators
  using (user_id = (select auth.uid()));

alter policy "Operator own applications" on public.franchise_applications
  using (operator_id = (select auth.uid()));
alter policy "Operator insert application" on public.franchise_applications
  with check (operator_id = (select auth.uid()));
alter policy "Operator update own application" on public.franchise_applications
  using (operator_id = (select auth.uid()))
  with check (operator_id = (select auth.uid()));

alter policy "Operator own documents" on public.franchise_documents
  using (exists (select 1 from public.franchise_applications a
    where a.id = application_id and a.operator_id = (select auth.uid())));
alter policy "Operator insert documents" on public.franchise_documents
  with check (exists (select 1 from public.franchise_applications a
    where a.id = application_id and a.operator_id = (select auth.uid())));
alter policy "Operator update documents" on public.franchise_documents
  using (exists (select 1 from public.franchise_applications a
    where a.id = application_id and a.operator_id = (select auth.uid())))
  with check (exists (select 1 from public.franchise_applications a
    where a.id = application_id and a.operator_id = (select auth.uid())));

alter policy "Operator read own tricycle" on public.tricycles
  using (exists (select 1 from public.franchises f
    where f.id = franchise_id and f.operator_id = (select auth.uid())));
alter policy "Operator own change motor" on public.change_motor_requests
  using (operator_id = (select auth.uid()));
alter policy "Operator insert change motor" on public.change_motor_requests
  with check (operator_id = (select auth.uid()));
alter policy "Operator read history" on public.change_motor_history
  using (exists (select 1 from public.franchises f
    where f.id = franchise_id and f.operator_id = (select auth.uid())));

alter policy "TFRO Staff add violations" on public.violations
  with check (exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'));
alter policy "TFRO Staff update violations" on public.violations
  using (exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'))
  with check (exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'));
alter policy "Users can read their own violations" on public.violations
  using (subject_name = (select full_name from public.profiles where id = (select auth.uid())));

alter policy "TFRO Staff add payments" on public.payments
  with check (exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'));
alter policy "TFRO Staff update payments" on public.payments
  using (exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'))
  with check (exists (select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'));

-- Correct the Change Motor ownership comparison in renewal creation.
drop policy if exists "Operators create renewals" on public.franchise_renewals;
create policy "Operators create renewals"
on public.franchise_renewals for insert to authenticated
with check (
  operator_id = (select auth.uid())
  and status = 'pending_review'
  and franchise_check_status = 'pending'
  and documents_complete = false
  and inspection_results = '{}'::jsonb
  and inspection_passed = false
  and assessed_amount is null
  and payment_status = 'pending'
  and temporary_mtop_issued = false
  and temporary_mtop_number is null
  and temporary_mtop_expiration_date is null
  and lto_lucena_for_hire_verified = false
  and issuance_status = 'not_ready'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.franchises franchise_record
    where franchise_record.id = franchise_renewals.franchise_id
      and franchise_record.operator_id = (select auth.uid())
      and franchise_record.status <> 'revoked'
      and franchise_record.expiration_date = franchise_renewals.current_expiration_date
      and franchise_record.expiration_date <= current_date
  )
  and exists (
    select 1 from public.drivers driver_record
    join public.operators operator_record on operator_record.id = driver_record.operator_id
    where driver_record.id = franchise_renewals.driver_id
      and operator_record.user_id = (select auth.uid())
  )
  and (
    (renewal_type <> 'change_motor' and change_motor_request_id is null)
    or exists (
      select 1 from public.change_motor_requests motor_request
      where motor_request.id = franchise_renewals.change_motor_request_id
        and motor_request.operator_id = (select auth.uid())
        and motor_request.franchise_id = franchise_renewals.franchise_id
        and motor_request.status in ('pending_review', 'reviewing', 'approved')
    )
  )
);
