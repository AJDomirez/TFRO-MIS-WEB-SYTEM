-- Drivers remain operational records managed by Operators and TFRO personnel.
-- Only Administrators, TFRO Staff, and Operators may have portal accounts.

delete from public.profiles where role = 'driver';

drop policy if exists "Drivers can read their own record" on public.drivers;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'staff', 'operator'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      contact_number = coalesce(public.profiles.contact_number, excluded.contact_number);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
