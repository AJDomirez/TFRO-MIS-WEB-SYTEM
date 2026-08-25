# Setting Up Custom SMTP in Supabase

## Current E-TFRO issue (2026-08-16)

Supabase Auth logs show Gmail rejecting confirmation mail with
`535 5.7.8 Username and Password not accepted`. Replace the saved SMTP
password with a Gmail **App Password**; do not use the account's normal
password. Registration cannot finish while email confirmation is enabled and
this SMTP error remains.

Custom SMTP is available on Supabase Free projects; a Pro subscription is not
required. Never save an SMTP password in this repository or share it in chat.

To customize the email **source** (the "from" name and address) and send emails
from your own email service, you must configure a custom SMTP server in Supabase.
By default Supabase uses its built-in email service, which does not let you
change the sender address.

---

## Why you need SMTP
- Default Supabase emails are sent from a generic `no-reply@supabase.co` style address.
- Setting up **custom SMTP** lets you send from your own domain/address, e.g.
  `TFRO Lucena City <tfrolucena2025@gmail.com>`.
- You can only edit the **HTML template** freely while using your own SMTP.

---

## Step 1 — Get SMTP credentials
Choose an email provider and create SMTP credentials. Common options:

| Provider | SMTP Host | Port (TLS) | Port (SSL) |
|----------|-----------|-----------|-----------|
| Gmail     | smtp.gmail.com | 587 | 465 |
| Outlook   | smtp.office365.com | 587 | 465 |
| Zoho      | smtp.zoho.com | 587 | 465 |
| SendGrid  | smtp.sendgrid.net | 587 | 465 |
| Mailgun   | smtp.mailgun.org | 587 | 465 |
| Brevo     | smtp-relay.brevo.com | 587 | 465 |

**Important for Gmail:** you must create an **App Password** (not your normal
password). Enable 2-Step Verification on the Google account, then open
<https://myaccount.google.com/apppasswords> and create an app password named
`TFRO Supabase`. Copy the generated 16-character password for the next step.

---

## Step 2 — Configure SMTP in Supabase
1. Go to your **Supabase Dashboard**.
2. Open **Authentication → Emails → SMTP Settings**.
3. Toggle **"Enable Custom SMTP"** to **ON**.
4. Fill in:
   - **Sender email:** e.g. `tfrolucena2025@gmail.com`
   - **Sender name:** e.g. `TFRO Lucena City`
   - **Host:** e.g. `smtp.gmail.com`
   - **Port:** `587` (STARTTLS)
   - **Username:** your full email address
   - **Password:** the 16-character Google App Password (paste without spaces)
5. Click **Save**.

> Supabase supports custom SMTP for production Auth mail. Review the project's
> Auth email rate limits after connecting the provider; the default custom-SMTP
> limit is 30 new users per hour.

---

## Step 3 — Verify the sender appears
After saving, any email Supabase sends (confirm signup, password reset, etc.)
will come from your configured **Sender name** and **Sender email**.

---

## Step 4 — Customize the email template
Now that SMTP is enabled, you can fully control the email source and design:
1. Go to **Authentication → Emails → Templates**.
2. Select **"Confirm signup"**.
3. Paste the HTML from `supabase/email-template-confirm-signup.html`.
4. Replace the `LOGO_URL` placeholder with a publicly hosted TFRO logo URL.
5. The template already uses `{{ .ConfirmationURL }}` for the confirm link.

---

## Testing
1. Register a test account on `register.html`.
2. Check the inbox — the email should come from your configured sender.
3. Click the **"Confirm My Account"** button.
4. You should be redirected to `login.html` and signed in automatically.

---

## Troubleshooting
- **"Confirm email" not sending:** enable it under Authentication → Providers → Email.
- **Login fails after clicking link:** make sure the redirect URL is added under
  Authentication → URL Configuration → Redirect URLs (e.g. `http://127.0.0.1:5500/html/login.html`).
- **"Access denied" from Gmail:** use an App Password and ensure 2-Step Verification is on.
- **Still receiving 535 errors:** delete the saved SMTP password, generate a
  new Gmail App Password, and paste it without spaces.
- **App passwords option is missing:** enable Google 2-Step Verification first.
  Google Workspace administrators can also disable App Passwords; in that case
  use a transactional SMTP provider such as Resend, Postmark, SendGrid, or
  Brevo instead of Gmail.
