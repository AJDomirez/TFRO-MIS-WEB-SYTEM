-- Rich ticket and settlement notices for the TFRO Staff workflow.
create or replace function public.notify_violation_recipient()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; notice_message text;
begin
  if new.subject_type='operator' then
    select user_id into recipient from public.operators where lower(full_name)=lower(new.subject_name) limit 1;
    notice_message := 'Ticket '||coalesce(new.ticket_number,'(not assigned)')||': violation '||coalesce(new.violation_code,'')||' - '||new.violation_type||'. Amount due: PHP '||to_char(new.penalty,'FM999,999,990.00')||'. Please coordinate with TFRO Staff for the Order of Payment.';
  else
    select o.user_id into recipient from public.drivers d left join public.operators o on o.id=d.operator_id where lower(d.full_name)=lower(new.subject_name) limit 1;
    if recipient is null then select o.user_id into recipient from public.drivers d join public.operators o on lower(o.full_name)=lower(d.operator_name) where lower(d.full_name)=lower(new.subject_name) limit 1; end if;
    notice_message := 'Driver '||new.subject_name||' received ticket '||coalesce(new.ticket_number,'(not assigned)')||' for violation '||coalesce(new.violation_code,'')||' - '||new.violation_type||'. Amount due: PHP '||to_char(new.penalty,'FM999,999,990.00')||'. Please coordinate with TFRO Staff.';
  end if;
  if recipient is not null then insert into public.notifications(title,message,type,user_id,link) values('Violation Notice',notice_message,'warning',recipient,'notification.html'); end if;
  return new;
end; $$;
revoke all on function public.notify_violation_recipient() from public,anon,authenticated;

create or replace function public.mark_violation_paid()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare subject_row public.violations%rowtype; recipient uuid;
begin
  if new.violation_id is not null and new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    update public.violations set status='paid' where id=new.violation_id returning * into subject_row;
    if subject_row.subject_type='operator' then
      select user_id into recipient from public.operators where lower(full_name)=lower(subject_row.subject_name) limit 1;
    else
      select o.user_id into recipient from public.drivers d left join public.operators o on o.id=d.operator_id where lower(d.full_name)=lower(subject_row.subject_name) limit 1;
    end if;
    if recipient is not null then insert into public.notifications(title,message,type,user_id,link)
      values('Violation Payment Recorded','Payment for ticket '||coalesce(subject_row.ticket_number,'')||' was recorded under OR '||coalesce(new.receipt,'')||'.','success',recipient,'notification.html'); end if;
  end if;
  return new;
end; $$;
revoke all on function public.mark_violation_paid() from public,anon,authenticated;
