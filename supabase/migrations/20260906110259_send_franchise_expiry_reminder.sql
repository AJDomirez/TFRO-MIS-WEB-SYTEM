begin;

create or replace function private.send_franchise_expiry_reminder(p_franchise_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  franchise_record public.franchises%rowtype;
  admin_name text;
  reminder_message text;
begin
  select full_name into admin_name
  from public.profiles
  where id = (select auth.uid()) and role = 'admin';

  if admin_name is null then
    raise exception 'Only administrators can send expiry reminders' using errcode = '42501';
  end if;

  select * into franchise_record
  from public.franchises
  where id = p_franchise_id;

  if not found then
    raise exception 'Franchise record not found';
  end if;
  if franchise_record.operator_id is null then
    raise exception 'This franchise is not linked to an operator account';
  end if;
  if franchise_record.expiration_date is null then
    raise exception 'This franchise has no expiration date';
  end if;

  reminder_message := 'Reminder: Franchise ' || franchise_record.franchise_number
    || ' expires on ' || to_char(franchise_record.expiration_date, 'Mon DD, YYYY')
    || '. Please submit your renewal requirements to TFRO before the deadline.';

  if exists (
    select 1 from public.notifications
    where user_id = franchise_record.operator_id
      and title = 'Franchise Expiry Reminder'
      and message = reminder_message
      and created_at >= current_date
  ) then
    return false;
  end if;

  insert into public.notifications (title, message, link, type, user_id)
  values ('Franchise Expiry Reminder', reminder_message, 'renewal.html', 'warning', franchise_record.operator_id);

  insert into public.audit_logs (user_id, user_name, role, action, action_type, record, description)
  values (
    (select auth.uid()), admin_name, 'admin', 'Sent franchise expiry reminder',
    'notification', franchise_record.franchise_number,
    'Sent an expiry reminder to ' || franchise_record.operator_name || ' for ' || to_char(franchise_record.expiration_date, 'Mon DD, YYYY')
  );

  return true;
end;
$$;

revoke all on function private.send_franchise_expiry_reminder(bigint) from public, anon, authenticated;

create or replace function public.send_franchise_expiry_reminder(p_franchise_id bigint)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.send_franchise_expiry_reminder(p_franchise_id);
$$;

revoke all on function public.send_franchise_expiry_reminder(bigint) from public, anon;
grant execute on function public.send_franchise_expiry_reminder(bigint) to authenticated;

comment on function public.send_franchise_expiry_reminder(bigint) is
  'Admin-only reminder delivery. The recipient and message are resolved from the franchise record, and each delivery is audit logged.';

notify pgrst, 'reload schema';

commit;
