# Brevo SMTP → Supabase Auth → Aradhana

Architecture (unchanged, correct):

    Browser → Supabase Auth (signup/login/reset) → Brevo SMTP → user's inbox
    SMTP credentials live ONLY in the Supabase dashboard. Never in code, never in Netlify.

## 1 · Brevo side (done by you in app.brevo.com)

1. SMTP credentials: **SMTP & API → SMTP tab**
   - Host: `smtp-relay.brevo.com` · Port: `587`
   - Login: the SMTP login shown there (looks like `xxxxx@smtp-brevo.com`)
   - Password: an **SMTP key** you generate (NOT your API key, NOT your account password)
2. Verified sender: **Senders & IP → Senders** → add `namaste@aradhana.in`
   (or any address you can receive mail at) — Brevo emails a confirmation link.
   - Keep the sender name: `Aradhana`

## 2 · Supabase side (dashboard)

Authentication → **SMTP Settings** → Enable custom SMTP

    Host:     smtp-relay.brevo.com
    Port:     587
    Username: <Brevo SMTP login from step 1>
    Password: <Brevo SMTP key from step 1>
    Sender (from) email: <verified sender from step 1>
    Sender name: Aradhana

Authentication → **URL Configuration**

    Site URL:          http://localhost:4321            (dev)   →   https://<your-site>  (prod)
    Redirect URLs:     http://localhost:4321/**
                       https://<your-site>/**

⚠️ As of 2026-11-14 the app uses **PKCE** flow (the Supabase client sends a
one-time `code` in the QUERY, not implicit access tokens in the hash). The old
implicit confirmation link landed as "#/reset-password#access_token=…" — a
double fragment the SDK could not parse, which produced silent logins/404s.
Everything now lands as "/?code=…#/…" and is consumed and scrubbed by the
boot handler before routing.

Signup confirmation redirects to `#/login` → after sign-in the user is sent to
`#/my`. Password-reset links land on `#/reset-password`.

Authentication → **Providers → Email** → keep **Confirm email: ON** (now that delivery
actually works). New signups must click the confirmation email.

Authentication → **Email Templates** — paste from `supabase-email-templates/`:

    Confirm signup        → confirm-signup.html
    Magic Link            → magic-link.html
    Reset password        → reset-password.html
    Change email address  → change-email.html

Each redirects to `{{ .ConfirmationURL }}` — signup links land on `#/login`,
reset links land on `#/reset-password` (already wired in the app).

## 3 · Netlify deploy (after pushing this repo to GitHub)

    Netlify → Add new site → Import from Git → pick repo
    Base directory: (root) · Build command: (leave empty) · Publish directory: ui
    Environment variables: NONE NEEDED (never add SECRET/SMTP keys here)

`netlify.toml` already contains the /api proxy to Render and the SPA fallback.
If your Render service got a different subdomain than `aradhana.onrender.com`,
edit the two proxy rules in `netlify.toml`.

⚠️ The app still needs the Render backend for /api/* — deploy Render first
   (see DEPLOY.md), confirm it boots, then deploy/refresh Netlify.

## 4 · Verification checklist (do not skip)

- [ ] Signup with a real email → "Check your inbox" note appears
- [ ] Brevo → Statistics → transactional logs show the email accepted (or the inbox shows it)
- [ ] Confirmation email arrives (not spam) → click → `#/login`
- [ ] Sign in with the new account → `/api/me` returns role CUSTOMER
- [ ] Wrong password → rejected
- [ ] Forgot password → reset email arrives → link opens `#/reset-password`
- [ ] Set new password → sign in with it
- [ ] `/api/me` shows role/member-since; protected routes redirect when logged out

Sign-up and reset emails are only trustworthy once Brevo's own statistics
(or your inbox) confirm actual delivery — never claim delivery otherwise.

## Troubleshooting (learned the hard way, 2026-11-14)

| Symptom | Meaning | Fix |
|---|---|---|
| `504 upstream request timeout` on /signup (36s), no user created | Port not reachable — **`Port` was `543` instead of `587`** | Authentication → Emails → SMTP Settings → Port `587` → Save |
| `500 {"msg":"Error sending confirmation email"}` in ~3s | Relay reachable but auth rejected | Re-enter the Password with the CURRENT Active SMTP key (used: "Aradhana Supabase"), or generate a fresh key in Brevo → SMTP & API → SMTP |
| Email arrives but lands in Spam | Gmail freemail sender (DKIM="Default", DMARC="Freemail") | Authenticate the domain (aradhana.in: DKIM CNAME + DMARC) or accept spam placement for tests |
| Confirmation link opens a blank page on `localhost:3000` | **Site URL is wrong** (`http://localhost:3000`) | Authentication → URL Configuration → Site URL = `http://localhost:4321` (dev) / prod URL; Redirect URLs = `<app>/**` |
| Test alone works but signup doesn't | Wrong: they use the same path — if "Send a test email" succeeds, /signup succeeds | Re-run `node scripts/.verify-smtp-flow.js`-style checks |

Verified 2026-11-14: signup → Brevo delivery (from danishshabbir657@12786517.brevosend.com, IP 77.32.148.24) → click confirm link → login → /api/me CUSTOMER → rows in both local users/customer_profiles and Supabase profiles.
