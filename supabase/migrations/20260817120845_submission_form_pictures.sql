alter table public.drivers add column if not exists picture_storage_path text;
alter table public.change_motor_requests add column if not exists picture_storage_path text;

drop policy if exists "Operators upload Driver pictures" on storage.objects;
create policy "Operators upload Driver pictures"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'franchise-documents'
  and name like 'driver-pictures/%/%'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.operators operator_record
    where operator_record.id = (split_part(name, '/', 2))::bigint
      and operator_record.user_id = (select auth.uid())
      and operator_record.verified
      and operator_record.status = 'active'
  )
);

drop policy if exists "Authorized users read Driver pictures" on storage.objects;
create policy "Authorized users read Driver pictures"
on storage.objects for select to authenticated
using (
  bucket_id = 'franchise-documents'
  and name like 'driver-pictures/%/%'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and (
    (select private.is_tfro_staff())
    or exists (
      select 1 from public.operators operator_record
      where operator_record.id = (split_part(name, '/', 2))::bigint
        and operator_record.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Operators read own Change Motor pictures" on storage.objects;
create policy "Operators read own Change Motor pictures"
on storage.objects for select to authenticated
using (
  bucket_id = 'franchise-documents'
  and exists (
    select 1 from public.change_motor_requests request
    where request.operator_id = (select auth.uid())
      and request.picture_storage_path = name
  )
);

-- Store the signed-in Operator's existing franchise on new Driver submissions.
drop policy if exists "Operators submit Driver applications" on public.drivers;
create policy "Operators submit Driver applications"
on public.drivers for insert to authenticated
with check (
  drivers.user_id is null
  and drivers.violation_count = 0
  and drivers.compliance = 'non-compliant'
  and drivers.license_status = 'not_verified'
  and drivers.license_verified_at is null
  and exists (
    select 1
    from public.operators operator_record
    join public.franchises franchise_record
      on franchise_record.operator_id = operator_record.user_id
    where operator_record.id = drivers.operator_id
      and operator_record.user_id = (select auth.uid())
      and operator_record.verified
      and operator_record.status = 'active'
      and operator_record.full_name = drivers.operator_name
      and franchise_record.id = drivers.franchise_id
  )
);
