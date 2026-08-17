-- Run once after setup-dashboard.sql. It extends the dashboard violations table.
alter table public.violations add column if not exists subject_name text;
alter table public.violations add column if not exists subject_type text check (subject_type in ('driver', 'operator'));
alter table public.violations add column if not exists penalty numeric(12, 2) not null default 0;
alter table public.violations add column if not exists status text not null default 'pending' check (status in ('pending', 'paid', 'dismissed'));

drop policy if exists "Staff can add violations" on public.violations;
create policy "Staff can add violations"
on public.violations for insert to authenticated
with check ((select public.is_tfro_staff()));

drop policy if exists "Staff can update violations" on public.violations;
create policy "Staff can update violations"
on public.violations for update to authenticated
using ((select public.is_tfro_staff()))
with check ((select public.is_tfro_staff()));
