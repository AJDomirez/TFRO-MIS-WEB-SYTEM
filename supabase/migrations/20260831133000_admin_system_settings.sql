create table if not exists public.system_settings (
  id boolean primary key default true check (id),
  operator_registration_enabled boolean not null default true,
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.system_settings (id) values (true) on conflict (id) do nothing;

alter table public.system_settings enable row level security;
revoke all on table public.system_settings from anon, authenticated;
grant select on table public.system_settings to anon, authenticated;
grant update (operator_registration_enabled, maintenance_mode, updated_at, updated_by)
  on table public.system_settings to authenticated;

drop policy if exists "System settings are readable" on public.system_settings;
create policy "System settings are readable"
on public.system_settings for select to anon, authenticated using (true);

drop policy if exists "Administrators update system settings" on public.system_settings;
create policy "Administrators update system settings"
on public.system_settings for update to authenticated
using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'))
with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'));
