-- Follow-up for projects that applied the first stabilization revision.
-- Approval transactions now run with the caller's privileges, so the existing
-- Admin/Staff RLS policies remain authoritative throughout each operation.

alter function public.approve_franchise_application(bigint) security invoker;
alter function public.approve_change_motor_request(bigint) security invoker;

notify pgrst, 'reload schema';
