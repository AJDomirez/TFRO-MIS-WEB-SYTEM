-- Run this once in Supabase Dashboard > SQL Editor.
-- Each row gives one Supabase Auth account permission to use a TFRO portal.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'staff', 'operator', 'driver')),
  full_name text,
  contact_number text,
  created_at timestamptz not null default now()
);

-- Add columns if the table already existed before this script.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists contact_number text;

alter table public.profiles enable row level security;

-- Reset every profile policy first. This avoids duplicate-policy errors when
-- an earlier setup/migration was run only partially.
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
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

-- Allow users to update their own profile.
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Automatically create a profile row when a new auth user signs up.
-- This runs with the privileges of the function owner (postgres), so it
-- bypasses RLS and works even when email confirmation is enabled.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'driver');
begin
  -- Public registration can never grant staff or administrator access.
  if requested_role not in ('driver', 'operator') then
    requested_role := 'driver';
  end if;

  insert into public.profiles (id, role, full_name, contact_number)
  values (
    new.id,
    requested_role,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'contact_number'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Browser clients may read their own profile and update only non-privileged
-- fields. Profile creation and role assignment belong exclusively to the
-- trusted auth trigger above.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, contact_number) on table public.profiles to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- After creating users in Authentication > Users, add their roles like this:
-- insert into public.profiles (id, role)
-- values ('THE_AUTH_USER_UUID', 'admin');
