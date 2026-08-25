create or replace function private.stamp_audit_log_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'An authenticated system account is required to create an audit record.';
  end if;

  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'The authenticated account has no TFRO profile.'; end if;

  new.user_id := auth.uid();
  new.user_name := coalesce(nullif(btrim(actor.full_name), ''), 'TFRO User');
  new.role := actor.role;
  new.created_at := now();
  new.is_archived := false;
  return new;
end;
$$;

revoke all on function private.stamp_audit_log_identity() from public, anon, authenticated;
drop trigger if exists stamp_audit_log_identity on public.audit_logs;
create trigger stamp_audit_log_identity
before insert on public.audit_logs
for each row execute function private.stamp_audit_log_identity();

comment on function private.stamp_audit_log_identity() is
  'Prevents audit identity spoofing by stamping user id, profile name, role, timestamp, and active state from server-controlled data.';
