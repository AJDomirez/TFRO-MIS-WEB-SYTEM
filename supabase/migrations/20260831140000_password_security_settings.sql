alter table public.system_settings
  add column if not exists max_login_attempts integer not null default 5,
  add column if not exists login_lockout_seconds integer not null default 60;

alter table public.system_settings
  drop constraint if exists system_settings_max_login_attempts_check,
  add constraint system_settings_max_login_attempts_check
    check (max_login_attempts between 1 and 10),
  drop constraint if exists system_settings_login_lockout_seconds_check,
  add constraint system_settings_login_lockout_seconds_check
    check (login_lockout_seconds between 10 and 3600);

grant update (max_login_attempts, login_lockout_seconds)
  on table public.system_settings to authenticated;
