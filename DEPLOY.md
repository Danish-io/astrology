# Deploying Aradhana to Render (full-stack)

The site is one Node.js app (`server.js`) serving both the website and its
API. Render runs it as-is — no changes needed. Supabase keeps the data safe
across deploys and cold starts (see "How data survives" below).

## One-time setup

1. **Push the project to GitHub**
   ```powershell
   cd B:\main-astrology-website
   git init
   git add .
   git commit -m "Aradhana website"
   # create an empty repo on github.com first, then:
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
   `.gitignore` already excludes `.env` and `data/` — your secret key and
   local database never leave your machine.

2. **Create the service on Render** (render.com → sign in with GitHub)
   - New + → **Blueprint** → pick the repo → Apply.
     `render.yaml` configures everything (Node runtime, start command,
     health check `/api/config`).
   - When prompted, fill the three environment variables:
     - `SUPABASE_URL` = `https://osekxnydmludifhxissd.supabase.co`
     - `SUPABASE_SECRET_KEY` = (the `sb_secret_…` value from your local `.env`)
     - `SUPABASE_PUBLISHABLE_KEY` = (the `sb_publishable_…` value from your local `.env`)
   - Deploy. First boot restores ~740 rows from Supabase automatically.

3. **Point Supabase auth at your new URL**
   - Supabase Dashboard → Authentication → URL Configuration
   - **Site URL:** `https://<your-service>.onrender.com`
   - **Redirect URLs** → add `https://<your-service>.onrender.com/**`
     (keep the `http://localhost:4321/**` entry for local dev)

## Going live checklist (manual dashboard actions — I cannot do these for you)

1. **Decide the email confirmation policy** (Authentication → Sign In / Providers → Email)
   - **Zero-cost option (recommended for now):** turn **OFF** "Confirm email".
     New signups then get an immediate session — no email is sent, no SMTP needed.
   - **With confirmation ON** (current state): every signup and password-reset
     email goes through Supabase's built-in sender, which is rate-limited
     (~2–4 emails/hour) and may be marked spam. Accounts ARE created, but users
     cannot sign in until they click the link, and links may never arrive.
     Keep it ON only with a **custom SMTP** configured (Authentication → SMTP Settings,
     e.g. Resend/Brevo free tier). Do not claim emails are "verified" otherwise.
2. **Staff credentials** — the 7 staff accounts were provisioned as real Supabase
   Auth users with strong random passwords stored ONLY in
   `scripts/.staff-credentials.txt` (gitignored). Share each line with its owner
   privately; tell them to use "Forgot password?" to set their own password.
3. **Rotate any shared password** — if any staff member prefers their own, have
   them use "Forgot password?" or change it now via the settings page.
4. **Phone SMS sign-in** is intentionally **not enabled** — see `PENDING-phone-auth.md`
   for the full checklist when you are ready to add an SMS provider.

## How data survives free-tier restarts

Render's free plan has an ephemeral disk — files (including SQLite) are
cleared on every deploy or cold start. The app handles this:

```
Boot:  SQLite empty?  →  rehydrate-from-supabase.js restores all rows
Write: every insert/update mirrors to Supabase (lib/supabase-mirror.js)
```

So **Supabase is the durable store**; SQLite is the fast read cache.
No manual backup steps — run `node scripts/rehydrate-from-supabase.js`
locally any time you want to pull the latest cloud copy.

## After changing environment variables

Render → your service → Environment → edit → **Save changes** — the service
redeploys automatically (a few minutes). No other action needed.

## Notes

- Free tier sleeps after ~15 min idle; the first visitor waits ~30-60 s.
  Sessions survive (users just sign in again); data is never lost.
- SQLite is rebuilt from Supabase, so the only ever-present risk is losing
  writes made in the last seconds before a crash — the mirror fires
  immediately after each write, so in practice nothing is lost.
- Custom domain later: Render → Settings → Custom Domains, then add the
  domain to the Supabase redirect list too.
