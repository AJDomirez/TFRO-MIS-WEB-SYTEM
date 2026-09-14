alter table public.franchise_renewals
  add column if not exists requirements_submission_date date;

create or replace function private.notify_renewal_requirements_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.requirements_submission_date is not null
     and new.requirements_submission_date is distinct from old.requirements_submission_date then
    insert into public.notifications (title, message, link, type, user_id)
    values (
      'Requirements submission date',
      'Bring the original requirements for renewal ' || coalesce(new.renewal_code, '#' || new.id) ||
      ' to the TFRO office on ' || to_char(new.requirements_submission_date, 'FMMonth DD, YYYY') || '.',
      'renewal.html',
      'info',
      new.operator_id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_renewal_requirements_date() from public, anon, authenticated;

drop trigger if exists notify_renewal_requirements_date on public.franchise_renewals;
create trigger notify_renewal_requirements_date
after update of requirements_submission_date on public.franchise_renewals
for each row execute function private.notify_renewal_requirements_date();
