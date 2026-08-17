create or replace function private.guard_renewal_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_role text;
begin
  select role into caller_role from public.profiles where id = (select auth.uid());
  if caller_role = 'operator' then
    if old.operator_id <> (select auth.uid())
      or old.status <> 'needs_correction'
      or new.status <> 'pending_review'
      or (to_jsonb(new) - array['status', 'updated_at'])
         is distinct from
         (to_jsonb(old) - array['status', 'updated_at'])
    then
      raise exception 'Operators may only resubmit a renewal after correcting documents';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.guard_renewal_document_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_role text;
begin
  select role into caller_role from public.profiles where id = (select auth.uid());
  if caller_role = 'operator' then
    if new.renewal_id is distinct from old.renewal_id
      or new.doc_type is distinct from old.doc_type
    then
      raise exception 'A corrected document must remain attached to the same renewal requirement';
    end if;
    new.verified := false;
    new.status := 'pending';
    new.staff_note := null;
    new.uploaded_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.guard_renewal_update() from public, anon, authenticated;
revoke all on function private.guard_renewal_document_update() from public, anon, authenticated;
