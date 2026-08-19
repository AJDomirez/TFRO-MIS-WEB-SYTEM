-- Create and securely link an Operator record from Operator-only public signup.
alter table public.operators add column if not exists email text;

create index if not exists operators_user_id_idx on public.operators (user_id);
create index if not exists operators_franchise_number_idx on public.operators (franchise_number);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_name text := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  supplied_contact text := nullif(btrim(new.raw_user_meta_data ->> 'contact_number'), '');
  supplied_address text := nullif(btrim(new.raw_user_meta_data ->> 'address'), '');
  supplied_franchise text := nullif(upper(btrim(new.raw_user_meta_data ->> 'franchise_number')), '');
begin
  insert into public.profiles (id, role, full_name, contact_number)
  values (new.id, 'operator', supplied_name, supplied_contact)
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name),
      contact_number = coalesce(public.profiles.contact_number, excluded.contact_number);

  if supplied_name is null or supplied_contact is null or supplied_address is null or supplied_franchise is null then
    raise exception 'Operator name, contact number, address, and franchise number are required';
  end if;

  update public.operators
  set full_name = supplied_name, email = new.email, address = supplied_address,
      contact_number = supplied_contact, franchise_number = supplied_franchise
  where user_id = new.id;

  if not found then
    insert into public.operators (
      user_id, full_name, email, address, contact_number, franchise_number, status, verified
    ) values (
      new.id, supplied_name, new.email, supplied_address, supplied_contact, supplied_franchise, 'active', false
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on table public.operators from anon;
grant select, insert, update, delete on table public.operators to authenticated;
grant usage, select on sequence public.operators_id_seq to authenticated;

create or replace function public.protect_operator_account_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not (select public.is_tfro_staff())
     and (
       new.user_id is distinct from old.user_id
       or new.email is distinct from old.email
       or new.franchise_number is distinct from old.franchise_number
       or new.status is distinct from old.status
       or new.verified is distinct from old.verified
     ) then
    raise exception 'Operators cannot change account ownership, franchise, status, or verification fields';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_operator_account_fields() from public, anon, authenticated;

drop trigger if exists protect_operator_account_fields on public.operators;
create trigger protect_operator_account_fields
before update on public.operators
for each row execute function public.protect_operator_account_fields();

drop policy if exists "Operator read own" on public.operators;
create policy "Operator read own"
on public.operators for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Operator update own profile fields" on public.operators;
create policy "Operator update own profile fields"
on public.operators for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
