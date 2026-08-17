-- ============================================================
-- TFRO-MIS Audit Log Enhancements
-- Adds columns to audit_logs to support the improved Admin
-- Audit Log page (Record, Previous/New values, Description,
-- archiving). Safe to re-run (uses ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- Add columns if they do not yet exist
alter table public.audit_logs add column if not exists record text;
alter table public.audit_logs add column if not exists previous_value text;
alter table public.audit_logs add column if not exists new_value text;
alter table public.audit_logs add column if not exists description text;
alter table public.audit_logs add column if not exists is_archived boolean not null default false;

-- Ensure the insert policy allows staff/server to write audit logs.
-- (Dropped first to avoid "policy already exists" when re-running.)
drop policy if exists "Allow authenticated insert into audit_logs" on public.audit_logs;
create policy "Allow authenticated insert into audit_logs"
  on public.audit_logs
  for insert
  to authenticated
  with check (true);

-- Ensure staff can read audit logs.
drop policy if exists "Allow staff read audit_logs" on public.audit_logs;
create policy "Allow staff read audit_logs"
  on public.audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','staff')
    )
  );

-- Ensure only admins can delete/archive audit logs.
drop policy if exists "Allow admins delete audit_logs" on public.audit_logs;
create policy "Allow admins delete audit_logs"
  on public.audit_logs
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

-- Ensure only admins can update (archive) audit logs.
drop policy if exists "Allow admins update audit_logs" on public.audit_logs;
create policy "Allow admins update audit_logs"
  on public.audit_logs
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
</content>
