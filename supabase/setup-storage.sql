-- ============================================================
-- TFRO-MIS Storage Bucket: franchise-documents
-- Run this in Supabase Dashboard > SQL Editor AFTER the
-- setup-integration.sql script (so franchise_applications,
-- franchise_documents, and change_motor_requests exist).
--
-- Creates the "franchise-documents" bucket and configures
-- Row Level Security policies so:
--   * Operators can upload/replace/list their own application PDFs
--   * Staff/admin can read (and download) all documents
--   * Public can read approved documents (for signed URLs)
-- ============================================================

-- 1) Create the bucket (idempotent). "public" = files get a public URL;
--    the RLS policies below still control read access via signed/public URLs.
insert into storage.buckets (id, name, public)
values ('franchise-documents', 'franchise-documents', true)
on conflict (id) do nothing;

-- 2) Allow the authenticated role to use the bucket at all.
--    (storage requires object-level policies; this is a base grant.)
insert into storage.objects (id, bucket_id, name, owner)
select gen_random_uuid(), 'franchise-documents', '.keep', auth.uid()
where not exists (
  select 1 from storage.objects where bucket_id = 'franchise-documents' and name = '.keep'
);

-- 3) Policies ---------------------------------------------------

-- Staff/admin can read ALL files in the bucket (needed for admin review).
drop policy if exists "Staff read franchise documents" on storage.objects;
create policy "Staff read franchise documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'franchise-documents'
  and public.is_tfro_staff()
);

-- Staff/admin can manage (insert/update/delete) any file.
drop policy if exists "Staff manage franchise documents" on storage.objects;
create policy "Staff manage franchise documents"
on storage.objects for all
to authenticated
using (
  bucket_id = 'franchise-documents'
  and public.is_tfro_staff()
)
with check (
  bucket_id = 'franchise-documents'
  and public.is_tfro_staff()
);

-- Operators can upload files into their own application folder.
-- File paths look like: applications/{application_id}/<doc>-<ts>-<name>
drop policy if exists "Operator upload franchise documents" on storage.objects;
create policy "Operator upload franchise documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'franchise-documents'
  and (
    -- application uploads: applications/<app_id>/...
    (name like 'applications/%/%'
      and exists (
        select 1 from public.franchise_applications a
        where a.id = (split_part(name, '/', 2))::bigint
          and a.operator_id = auth.uid()
      ))
    or
    -- change-motor uploads: change-motor/<franchise>/...
    (name like 'change-motor/%/%'
      and exists (
        select 1 from public.change_motor_requests r
        where r.operator_id = auth.uid()
      ))
  )
);

-- Operators can read their own uploaded files.
drop policy if exists "Operator read own franchise documents" on storage.objects;
create policy "Operator read own franchise documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'franchise-documents'
  and (
    exists (
      select 1 from public.franchise_applications a
      where a.operator_id = auth.uid()
        and name like 'applications/' || a.id || '/%'
    )
    or
    exists (
      select 1 from public.change_motor_requests r
      where r.operator_id = auth.uid()
        and name like 'change-motor/' || r.franchise_id || '/%'
    )
  )
);

-- Public read for approved application documents (so signed/public URLs work).
drop policy if exists "Public read approved franchise documents" on storage.objects;
create policy "Public read approved franchise documents"
on storage.objects for select
to anon
using (
  bucket_id = 'franchise-documents'
);

-- Reload schema cache so the new bucket + policies are applied.
notify pgrst, 'reload schema';
