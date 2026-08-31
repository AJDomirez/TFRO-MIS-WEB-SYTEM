create or replace function private.send_operator_form(
  p_form_code text,
  p_record_type text,
  p_record_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  normalized_code text := upper(btrim(p_form_code));
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Only administrators can send operator forms';
  end if;

  if p_record_type = 'renewal' then
    select operator_id into recipient
    from public.franchise_renewals where id = p_record_id;
  elsif p_record_type = 'change_motor' then
    select operator_id into recipient
    from public.change_motor_requests where id = p_record_id;
  elsif p_record_type = 'payment' then
    select coalesce(operator_record.user_id, direct_operator.user_id)
      into recipient
    from public.payments payment_record
    join public.violations violation_record on violation_record.id = payment_record.violation_id
    left join public.drivers driver_record on driver_record.id = violation_record.driver_id
    left join public.operators operator_record on operator_record.id = driver_record.operator_id
    left join public.operators direct_operator
      on lower(direct_operator.full_name) = lower(violation_record.subject_name)
    where payment_record.id = p_record_id;
  else
    raise exception 'Unsupported form record type';
  end if;

  if recipient is null then
    raise exception 'This record is not linked to an operator account';
  end if;

  insert into public.notifications (title, message, link, type, user_id)
  values (
    normalized_code || ' Form Received',
    'TFRO sent ' || normalized_code || ' to your account. Open your portal to view or generate the form.',
    case when p_record_type = 'renewal' then 'renewal.html' else 'operatorportal.html' end,
    'success',
    recipient
  );

  return true;
end;
$$;

revoke all on function private.send_operator_form(text, text, bigint) from public, anon;
grant execute on function private.send_operator_form(text, text, bigint) to authenticated;

create or replace function public.send_operator_form(
  p_form_code text,
  p_record_type text,
  p_record_id bigint
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.send_operator_form(p_form_code, p_record_type, p_record_id);
$$;

revoke all on function public.send_operator_form(text, text, bigint) from public, anon;
grant execute on function public.send_operator_form(text, text, bigint) to authenticated;

comment on function public.send_operator_form(text, text, bigint) is
  'Admin-only operator form delivery. The recipient is resolved from the related record, never supplied by the client.';
