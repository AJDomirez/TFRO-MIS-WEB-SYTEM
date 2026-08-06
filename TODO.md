# TODO — Driver & Operator Registration

- [x] Create `html/register.html` (role selector for driver/operator, full name, email, contact number, password, confirm password)
- [x] Create `js/register.js` (Supabase signUp + profile insert + redirect to index.html)
- [x] Update `css/style.css` (styles for role cards, register form, confirm password)
- [x] Update `supabase/setup-auth.sql` (add full_name/contact_number columns, self-registration RLS policies, signup trigger)
- [x] Update `js/login.js` (insert audit log entry on successful login)

### Follow-up steps (manual)
- [ ] Run `supabase/setup-auth.sql` in the Supabase SQL Editor
- [ ] Run `supabase/setup-admin.sql` in the Supabase SQL Editor (creates notifications + audit_logs tables)
- [ ] Test registering a driver and an operator, then sign in with each account
- [ ] If email confirmation is enabled in Supabase, confirm the email before signing in

