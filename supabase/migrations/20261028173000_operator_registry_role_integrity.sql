-- The Operators registry may link only to profiles whose current portal role
-- is `operator`. Unlinked administrative records created manually remain
-- possible, but no Administrator, Staff, or Enforcer login may appear here.

create or replace function private.enforce_operator_registry_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.profiles
    where id = new.user_id and role = 'operator'
  ) then
    raise exception 'Only an Operator account can be linked to the Operators registry.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_operator_registry_role() from public, anon, authenticated;

drop trigger if exists enforce_operator_registry_role on public.operators;
create trigger enforce_operator_registry_role
before insert or update of user_id on public.operators
for each row execute function private.enforce_operator_registry_role();

create or replace function private.remove_nonoperator_registry_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'operator' and old.role is distinct from new.role then
    delete from public.operators where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.remove_nonoperator_registry_entry() from public, anon, authenticated;

drop trigger if exists remove_nonoperator_registry_entry on public.profiles;
create trigger remove_nonoperator_registry_entry
after update of role on public.profiles
for each row execute function private.remove_nonoperator_registry_entry();

-- Remove only invalid registry rows. Profiles and Auth accounts are preserved.
delete from public.operators operator_record
using public.profiles profile
where profile.id = operator_record.user_id
  and profile.role <> 'operator';
