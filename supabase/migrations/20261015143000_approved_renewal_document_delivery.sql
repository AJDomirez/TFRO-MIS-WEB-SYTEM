-- Tell operators exactly where to collect the complete auto-filled document set
-- as soon as TFRO approves a renewal. Existing owner-scoped renewal RLS policies
-- already allow the operator to read only their own approved renewal and files.
create or replace function private.notify_renewal_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  renewal_label text := coalesce(new.renewal_code, '#' || new.id);
  approval_message text;
  operator_email text;
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (title, message, link, type, user_id)
    select
      'New franchise renewal',
      'Franchise renewal ' || renewal_label || ' is pending TFRO review. The Operator must present the original requirements in person for final verification.',
      'renewals.html',
      'info',
      profile.id
    from public.profiles profile
    where profile.role in ('admin', 'staff');
  elsif new.status is distinct from old.status then
    approval_message := 'Your franchise renewal ' || renewal_label || ' is approved. New expiration: '
      || coalesce(to_char(new.new_expiration_date, 'Mon DD, YYYY'), 'recorded by TFRO')
      || '. MTOP ' || coalesce(new.mtop_number, 'is being prepared')
      || ' is expected for release on ' || coalesce(to_char(new.expected_release_date, 'Mon DD, YYYY'), 'the advised release date')
      || '. Your complete auto-filled document set is ready in Franchise Renewal: final MTOP Permit, TFRO-003, TFRO-004, TFRO-005, and TFRO-001 when issued. Open and print each document, then bring the set, original requirements, and valid identification to the TFRO office.';

    insert into public.notifications (title, message, link, type, user_id)
    values (
      case when new.status = 'approved' then 'Renewal documents ready' else 'Franchise renewal update' end,
      case new.status
        when 'approved' then approval_message
        when 'needs_correction' then 'Your franchise renewal ' || renewal_label || ' is not approved because requirements are incomplete: ' || coalesce(new.decision_reason, 'Please submit the missing requirements.')
        when 'rejected' then 'Your franchise renewal ' || renewal_label || ' was not approved: ' || coalesce(new.decision_reason, 'Please contact TFRO.')
        when 'awaiting_payment' then 'Your franchise renewal ' || renewal_label || ' is pending payment at the Treasurer''s Office.'
        when 'inspection_pending' then 'Documents for renewal ' || renewal_label || ' were verified. Vehicle inspection is pending.'
        else 'Your franchise renewal ' || renewal_label || ' status is now ' || replace(new.status, '_', ' ') || '.'
      end,
      'renewal.html',
      case when new.status = 'approved' then 'success' when new.status in ('needs_correction', 'rejected') then 'warning' else 'info' end,
      new.operator_id
    );

    if new.status = 'approved' then
      select email into operator_email
      from public.operators
      where user_id = new.operator_id
      order by verified desc, id
      limit 1;

      if operator_email is not null then
        insert into public.email_outbox (user_id, recipient_email, subject, html_body, event_type, related_record_id)
        values (
          new.operator_id,
          operator_email,
          'TFRO Renewal Documents Ready - ' || renewal_label,
          '<h2>Franchise Renewal Approved</h2><p>' || approval_message || '</p><p><strong>Documents ready:</strong> Final MTOP Permit, TFRO-003, TFRO-004, TFRO-005, and TFRO-001 when issued.</p><p><strong>In-person requirement:</strong> Bring the printed set, all original submitted documents, and a valid ID to the TFRO office.</p>',
          'renewal_approved',
          new.id
        );
      end if;
    end if;

    if new.status = 'pending_review' and old.status = 'needs_correction' then
      insert into public.notifications (title, message, link, type, user_id)
      select
        'Renewal requirements resubmitted',
        'Corrected requirements for renewal ' || renewal_label || ' are ready for review.',
        'renewals.html',
        'info',
        profile.id
      from public.profiles profile
      where profile.role in ('admin', 'staff');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_renewal_event() from public, anon, authenticated;

comment on function private.notify_renewal_event() is
  'Creates renewal workflow notifications and tells approved operators that their complete auto-filled document set is ready.';
