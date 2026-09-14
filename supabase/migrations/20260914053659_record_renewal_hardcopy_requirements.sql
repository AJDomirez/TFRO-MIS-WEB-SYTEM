alter table public.franchise_renewals
  add column if not exists hardcopy_requirements_received boolean not null default false,
  add column if not exists hardcopy_received_at timestamptz,
  add column if not exists hardcopy_received_by uuid references public.profiles(id) on delete set null,
  add column if not exists hardcopy_received_notes text;

create or replace function private.notify_renewal_hardcopy_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hardcopy_requirements_received
     and new.hardcopy_requirements_received is distinct from old.hardcopy_requirements_received then
    insert into public.notifications (title, message, link, type, user_id)
    values (
      'Original requirements received',
      'TFRO recorded receipt of your original hardcopy requirements for renewal ' ||
      coalesce(new.renewal_code, '#' || new.id) || '.',
      'renewal.html',
      'success',
      new.operator_id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_renewal_hardcopy_received() from public, anon, authenticated;

drop trigger if exists notify_renewal_hardcopy_received on public.franchise_renewals;
create trigger notify_renewal_hardcopy_received
after update of hardcopy_requirements_received on public.franchise_renewals
for each row execute function private.notify_renewal_hardcopy_received();
