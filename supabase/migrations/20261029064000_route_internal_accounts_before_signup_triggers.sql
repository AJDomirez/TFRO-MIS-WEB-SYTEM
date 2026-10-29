-- Auth runs both registration triggers after inserting auth.users. The consent
-- trigger consumes the short-lived internal provisioning marker before the
-- profile trigger can inspect it. Promote the trusted marker into protected
-- app metadata in a BEFORE trigger so both later triggers route the identity
-- as Staff or restricted Administrator rather than as an Operator.

create or replace function private.prepare_internal_account_provisioning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  marker_exists boolean := false;
  internal_account_type text := '';
begin
  select exists (
    select 1
    from public.internal_admin_provisioning marker
    where marker.email = lower(new.email)
      and marker.expires_at > now()
  ) into marker_exists;

  if not marker_exists then
    return new;
  end if;

  if lower(new.email) like '%@admin.tfro-mis.local' then
    internal_account_type := 'admin_viewer';
  elsif lower(new.email) like '%@staff.tfro-mis.local' then
    internal_account_type := 'staff';
  else
    raise exception 'Internal account provisioning uses an invalid account address.'
      using errcode = 'P0001';
  end if;

  new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'account_type', internal_account_type,
      'provisioned_by', 'head_admin'
    );

  return new;
end;
$$;

revoke all on function private.prepare_internal_account_provisioning()
  from public, anon, authenticated;

drop trigger if exists prepare_internal_account_provisioning_on_signup
  on auth.users;

create trigger prepare_internal_account_provisioning_on_signup
  before insert on auth.users
  for each row execute function private.prepare_internal_account_provisioning();
