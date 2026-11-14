# Phone SMS OTP — PENDING (Do Not Implement Yet)

**Status:** Phone/SMS authentication is intentionally **disabled** and **not configured**.
It must not be enabled until an SMS provider is chosen and paid/configured by the owner.
No SMS calls are made anywhere in the app.

## Why it is pending

- Supabase Phone Auth requires an external SMS provider (Twilio, MessageBird, Vonage, etc.).
- No provider is configured for the project, and
  `supabase.auth.signInWithOtp({ phone })` currently returns **"Unsupported phone provider"**.
- SMS delivery to Indian numbers for commercial use also requires DLT registration
  on the SMS provider side (TRAI regulation). Not started.
- The owner has explicitly deferred this: **zero additional cost right now.**

## What is already built and kept for later

`ui/assets/js/auth-supabase.js` contains the complete implementation, unused by the UI:

- `toE164(cc, local)` — normalizes country code + local number to E.164
  (`+91XXXXXXXXXX`; India enforced as exactly 10 digits).
- `sendPhoneOtp(e164)` — `supabase.auth.signInWithOtp({ phone })`, never returns the code.
- `verifyPhoneOtp(e164, code)` — `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`,
  then bridges the verified session to the backend via `/api/auth/supabase-sync`.
- `phoneError(...)` — user-friendly mapping (rate limits, provider-not-configured,
  invalid number, expired code, network).
- Resend cooldown (60s) exists in the booking gate/login flows that used it (now removed from UI).

The backend bridge `/api/auth/supabase-sync` already supports verified phone identities
(email preferred, phone fallback) and creates a `CUSTOMER` account on first sign-in.
Phone numbers in the database are **unverified** (they were captured as optional profile
data without OTP).

## Enabling checklist (when the owner is ready)

1. Choose a provider: **Twilio** (global, works with Supabase out of the box) or an
   India-focused provider (TextLocal, MSG91) via their SMTP/SMS gateways supported by Supabase.
   For India delivery: register your DLT entity ID + sender ID on the provider console first.
2. Create/buy: an SMS-capable phone number (Twilio) → note **Account SID**, **Auth Token**,
   **Messaging Service SID**.
3. Supabase Dashboard → **Authentication → Providers → Phone**:
   - Enable Phone provider
   - SMS provider = Twilio (or chosen provider), paste SID / Auth Token / Messaging Service SID
   - Confirm "Enable phone sign-ups" if you want phone-first registration
4. Supabase Dashboard → **Authentication → Rate Limits** (optional): tune OTP send limits.
5. Restore the UI: re-add the "Phone OTP" tab in `renderLogin()` (pages-booking.js)
   and the booking-gate OTP panel; wire to `sendPhoneOtp` / `verifyPhoneOtp`.
   The code paths are intact and commented as PENDING.
6. Verify with a real device: request OTP → receive SMS → sign in; wrong code rejected;
   resend cooldown works; session persists; logout clears it.
7. Update `scripts/test-real-auth.js` TEST A expectations to expect success.
8. Mark this file DONE and delete/replace it with the final SMS auth description in DEPLOY.md.

## Hard rules while pending

- Do **not** enable the Phone provider without a real provider — it will fail closed anyway.
- Do **not** put Twilio credentials in frontend code or commit them. They live only in the
  Supabase dashboard (or a server-side secret store the owner controls).
- Do **not** mark any phone number as verified anywhere in the UI.
- Do **not** re-enable any fixed/test OTP. There is none, and none may be added.

## Current customer login path (works today, free)

Email + password via Supabase Auth (`signUp` / `signInWithPassword`), bridged to the
app backend. Phone numbers may be stored as optional, clearly-labelled **unverified**
profile data only.
