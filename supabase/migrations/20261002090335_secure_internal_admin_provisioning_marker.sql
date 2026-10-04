-- A short-lived, server-written marker distinguishes Head Administrator
-- provisioning from public registration without trusting user-editable
-- metadata. Browser roles receive no privileges or RLS policies on this table.
create table if not exists public.internal_admin_provisioning (
  email text primary key,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);

alter table public.internal_admin_provisioning enable row level security;
revoke all on table public.internal_admin_provisioning from public, anon, authenticated;
grant all on table public.internal_admin_provisioning to service_role;

create or replace function private.capture_registration_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_terms constant text := 'TFRO-TERMS-2026-09-08';
  expected_privacy constant text := 'TFRO-PRIVACY-2026-09-08';
  is_internal_admin_viewer boolean := false;
begin
  delete from public.internal_admin_provisioning marker
  where marker.email = lower(new.email)
    and marker.expires_at > now()
  returning true into is_internal_admin_viewer;

  if coalesce(is_internal_admin_viewer, false) then
    return new;
  end if;

  if coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false') <> 'true'
     or coalesce(new.raw_user_meta_data ->> 'terms_version', '') <> expected_terms
     or coalesce(new.raw_user_meta_data ->> 'privacy_notice_version', '') <> expected_privacy then
    raise exception 'Terms of Use and Data Privacy Notice acceptance is required.'
      using errcode = 'P0001';
  end if;

  insert into public.account_consents (
    user_id, terms_version, privacy_notice_version, accepted_at, acceptance_method
  ) values (
    new.id, expected_terms, expected_privacy, now(), 'registration_checkbox'
  );

  return new;
end;
$$;

revoke all on function private.capture_registration_consent() from public, anon, authenticated;
