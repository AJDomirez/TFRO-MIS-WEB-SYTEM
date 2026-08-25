-- TFRO-IMIS security and integration migration
-- Run ONCE in Supabase SQL Editor after the existing setup scripts.
-- It is safe to re-run. Review existing admin/staff accounts after running it.

begin;

-- ---------------------------------------------------------------------------
-- Profiles: role assignment is server-controlled. New public registrations may
-- only become operators; staff and admin roles must be assigned by an
-- administrator in SQL/Dashboard, never by browser metadata or profile updates.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'operator');
begin
  if requested_role <> 'operator' then
    requested_role := 'operator';
  end if;

  insert into public.profiles (id, role, full_name, contact_number)
  values (
    new.id,
    requested_role,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'contact_number'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, contact_number) on table public.profiles to authenticated;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Users can update their own non-role profile fields"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private storage. Documents are available only through authenticated RLS or a
-- short-lived signed URL. Change-motor paths use the franchise ID, not a name.
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where id = 'franchise-documents';

drop policy if exists "Public read approved franchise documents" on storage.objects;
drop policy if exists "Operator upload franchise documents" on storage.objects;
drop policy if exists "Operator read own franchise documents" on storage.objects;
drop policy if exists "Operator upload owned franchise documents" on storage.objects;
drop policy if exists "Operator read owned franchise documents" on storage.objects;

create policy "Operator upload owned franchise documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'franchise-documents'
  and (
    (name like 'applications/%/%'
      and split_part(name, '/', 2) ~ '^[0-9]+$'
      and exists (
        select 1 from public.franchise_applications a
        where a.id = split_part(name, '/', 2)::bigint and a.operator_id = auth.uid()
      ))
    or
    (name like 'change-motor/%/%'
      and split_part(name, '/', 2) ~ '^[0-9]+$'
      and exists (
        select 1 from public.franchises f
        where f.id = split_part(name, '/', 2)::bigint and f.operator_id = auth.uid()
      ))
  )
);

create policy "Operator read owned franchise documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'franchise-documents'
  and (
    exists (
      select 1 from public.franchise_applications a
      where a.operator_id = auth.uid()
        and name like 'applications/' || a.id || '/%'
    )
    or exists (
      select 1 from public.change_motor_requests r
      join public.franchises f on f.id = r.franchise_id
      where f.operator_id = auth.uid() and r.supporting_storage_path = name
    )
  )
);

-- ---------------------------------------------------------------------------
-- Notifications: reconcile the initial and integration schemas, and have
-- trusted database triggers deliver cross-user notifications.
-- ---------------------------------------------------------------------------
alter table public.notifications alter column title drop not null;
alter table public.notifications alter column title set default 'TFRO Notification';
alter table public.notifications add column if not exists link text;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('urgent', 'info', 'warning', 'error', 'success'));

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy if exists %I on public.notifications', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Users and staff read notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid() or public.is_tfro_staff());
create policy "Users manage their own notifications"
on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their own notifications"
on public.notifications for delete to authenticated
using (user_id = auth.uid());
create policy "Staff create notifications"
on public.notifications for insert to authenticated
with check (public.is_tfro_staff());

create or replace function public.notify_application_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected', 'needs_correction') then
    insert into public.notifications (title, message, link, type, user_id)
    values (
      'Franchise application update',
      case when new.status = 'approved'
        then 'Your franchise application (' || coalesce(new.franchise_number, new.application_code, '#' || new.id) || ') has been approved.'
        else 'Your franchise application (' || coalesce(new.franchise_number, new.application_code, '#' || new.id) || ') needs correction: ' || coalesce(new.rejection_reason, 'Please review the application.') end,
      'operatorportal.html',
      case when new.status = 'approved' then 'success' else 'warning' end,
      new.operator_id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_change_motor_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (title, message, link, type, user_id)
  select 'New Change Motor request',
         'A new Change Motor/MTOP request (' || coalesce(new.request_code, '#' || new.id) || ') needs review.',
         'motorequests.html', 'info', p.id
  from public.profiles p where p.role in ('admin', 'staff');
  return new;
end;
$$;

create or replace function public.notify_change_motor_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    insert into public.notifications (title, message, link, type, user_id)
    values (
      'Change Motor request update',
      case when new.status = 'approved'
        then 'Your Change Motor/MTOP request (' || coalesce(new.request_code, '#' || new.id) || ') has been approved.'
        else 'Your Change Motor/MTOP request (' || coalesce(new.request_code, '#' || new.id) || ') was rejected: ' || coalesce(new.rejection_reason, 'Please contact TFRO.') end,
      'operatorportal.html', case when new.status = 'approved' then 'success' else 'warning' end, new.operator_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_application_status_change on public.franchise_applications;
create trigger notify_application_status_change after update of status on public.franchise_applications
for each row execute function public.notify_application_status_change();
drop trigger if exists notify_change_motor_request on public.change_motor_requests;
create trigger notify_change_motor_request after insert on public.change_motor_requests
for each row execute function public.notify_change_motor_request();
drop trigger if exists notify_change_motor_status_change on public.change_motor_requests;
create trigger notify_change_motor_status_change after update of status on public.change_motor_requests
for each row execute function public.notify_change_motor_status_change();

-- ---------------------------------------------------------------------------
-- Payments: this replaces the old browser-only payment store.
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists receipt text;
alter table public.payments add column if not exists payer text;
alter table public.payments add column if not exists payment_type text;
alter table public.payments add column if not exists status text not null default 'paid';
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('paid', 'pending', 'overdue'));
create unique index if not exists payments_receipt_unique on public.payments (receipt) where receipt is not null;

drop policy if exists "Staff manage payments" on public.payments;
create policy "Staff manage payments" on public.payments for all to authenticated
using (public.is_tfro_staff()) with check (public.is_tfro_staff());

-- Audit inserts must be attributable to the signed-in user.
alter table public.audit_logs add column if not exists user_id uuid references auth.users(id) on delete set null;
drop policy if exists "Users can insert audit logs" on public.audit_logs;
drop policy if exists "Allow authenticated insert into audit_logs" on public.audit_logs;
drop policy if exists "Users insert their own audit logs" on public.audit_logs;
create policy "Users insert their own audit logs" on public.audit_logs for insert to authenticated
with check (user_id = auth.uid());

notify pgrst, 'reload schema';
commit;
