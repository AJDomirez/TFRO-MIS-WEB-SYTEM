-- Run this once after setup-dashboard.sql to allow admin/staff to manage franchises.
create policy "Staff can add franchises"
on public.franchises for insert to authenticated
with check ((select public.is_tfro_staff()));

create policy "Staff can update franchises"
on public.franchises for update to authenticated
using ((select public.is_tfro_staff()))
with check ((select public.is_tfro_staff()));
