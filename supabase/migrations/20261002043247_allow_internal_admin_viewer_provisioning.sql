-- Public registrations must accept the current Terms of Use and Privacy
-- Notice. View-only Administrator accounts are provisioned internally by a
-- verified Head Administrator and do not pass through public registration.
-- The protected raw_app_meta_data marker can only be set by the service-role
-- Edge Function, so browser clients cannot use this exemption.
create or replace function private.capture_registration_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_terms constant text := 'TFRO-TERMS-2026-09-08';
  expected_privacy constant text := 'TFRO-PRIVACY-2026-09-08';
  is_internal_admin_viewer boolean :=
    coalesce(new.raw_app_meta_data ->> 'account_type', '') = 'admin_viewer'
    and coalesce(new.raw_app_meta_data ->> 'provisioned_by', '') = 'head_admin';
begin
  if is_internal_admin_viewer then
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
