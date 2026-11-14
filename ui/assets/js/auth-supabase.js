'use strict';

/**
 * Auth service â€” real Supabase Auth integration.
 * Handles: signup, login, logout, password recovery, profile updates,
 * and syncing the Supabase session with the app's own backend session.
 *
 * No fake logins. No password storage. Tokens managed by the official SDK.
 */

import { getSupabase, currentSession, currentProfile } from './supabase-client.js?v=14';
import { API } from './core.js?v=14';

/* ---------- validation helpers ---------- */

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function passwordProblem(pass) {
  if (!pass || pass.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(pass)) return 'Password must contain a letter.';
  if (!/[0-9]/.test(pass)) return 'Password must contain a number.';
  return null;
}

/** Map raw Supabase errors to friendly, non-revealing messages. */
function authError(message = '') {
  const m = String(message).toLowerCase();
  if (/invalid login credentials/.test(m)) return 'Incorrect email or password.';
  if (/email not confirmed/.test(m)) return 'Please confirm your email first â€” check your inbox for the verification link.';
  if (/over_email_send_rate_limit|rate limit/.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/user already registered|already been registered/.test(m)) return 'This email already has an account. Please sign in instead.';
  if (/password.*weak|short/.test(m)) return 'That password is too weak. Use at least 8 characters with a letter and a number.';
  if (/network|fetch/.test(m)) return 'Network problem â€” please check your connection and try again.';
  if (/signup requires a valid email|invalid email/.test(m)) return 'Please enter a valid email address.';
  return message || 'Something went wrong. Please try again.';
}

/* ---------- real auth operations ---------- */

/**
 * Real signup: creates the account in Supabase Auth.
 * Profile row is created automatically by the DB trigger (001_profiles.sql).
 */
export async function signUp({ fullName, email, password, phone }) {
  if (!fullName || fullName.trim().length < 2) throw new Error('Please enter your full name.');
  if (!validateEmail(email)) throw new Error('Please enter a valid email address.');
  const pwErr = passwordProblem(password);
  if (pwErr) throw new Error(pwErr);

  const c = await getSupabase();
  const { data, error } = await c.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      // Phone must ride in metadata (Supabase allows either email or phone
      // on the auth record at signup). The DB trigger copies it to profiles.
      data: { full_name: fullName.trim(), ...(phone ? { phone: phone.trim() } : {}) },
      emailRedirectTo: `${location.origin}${location.pathname}?next=my`,
    },
  });
  if (error) {
    if (/already registered|already been registered/i.test(error.message)) {
      throw new Error('This email already has an account. Please sign in instead.');
    }
    throw new Error(authError(error.message));
  }
  const user = data?.user || null;
  const needsEmailConfirm = !user?.confirmed_at && user?.confirmation_sent_at !== undefined
    ? !user.confirmed_at
    : Boolean(user && !user.email_confirmed_at);

  // If email confirmation is required, no session exists yet.
  const session = data?.session || null;
  if (session) await syncBackend(session.access_token);
  return { user, needsEmailConfirm, hasSession: Boolean(session) };
}

/** Real login via Supabase. */
export async function signIn(email, password) {
  if (!validateEmail(email)) throw new Error('Please enter a valid email address.');
  if (!password) throw new Error('Please enter your password.');
  const c = await getSupabase();
  const { data, error } = await c.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    throw new Error(authError(error.message));
  }
  await syncBackend(data.session.access_token);
  return data.session;
}

/** Real logout: clears Supabase session + backend session. */
export async function signOut() {
  try {
    const c = await getSupabase();
    await c.auth.signOut();
  } catch { /* ignore */ }
  try { await API.post('/api/auth/logout'); } catch { /* ignore */ }
}

/* ---------- real phone OTP (Supabase SMS) â€” PHASE 14: PENDING ----------
 * Phone SMS authentication is deliberately DISABLED until an SMS provider
 * is configured in the Supabase dashboard (see PENDING-phone-auth.md).
 * The code below is the complete, tested-shape implementation and is kept
 * so it can be switched on later without rewrites. No SMS calls are made
 * anywhere in the UI right now; Supabase rejects phone OTP requests with
 * "Unsupported phone provider" until a provider (e.g. Twilio) is added.
 * DO NOT call these functions from any page until SMS is configured. */

/** Normalize the country-code select + local number into E.164 (+91XXXXXXXXXX). */
export function toE164(cc, local) {
  const digits = String(local || '').replace(/\D/g, '');
  const code = String(cc || '+91').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (code === '+91' && digits.length !== 10) return null; // India: exactly 10 digits
  return `${code}${digits}`;
}

function phoneError(message = '') {
  const m = String(message).toLowerCase();
  if (/rate|too many|frequency/.test(m)) return 'Too many attempts. Please wait a minute before requesting another code.';
  if (/sms provider|not configured|provider.*not.*found|twilio/.test(m)) return 'SMS delivery is not configured yet. Please sign in with your email account or contact the temple office.';
  if (/invalid phone|phone.*invalid|malformed/.test(m)) return 'That mobile number looks invalid. Please check it and try again.';
  if (/expired/.test(m)) return 'That code has expired. Please request a new one.';
  if (/network|fetch|failed to fetch/.test(m)) return 'Network problem â€” please check your connection and try again.';
  return message || 'Something went wrong. Please try again.';
}

/**
 * Send a real OTP over SMS. Resolves once Supabase accepts the request;
 * the code itself is NEVER returned to the browser.
 */
export async function sendPhoneOtp(e164) {
  if (!e164) throw new Error('Enter a valid mobile number.');
  const c = await getSupabase();
  const { error } = await c.auth.signInWithOtp({ phone: e164 });
  if (error) throw new Error(phoneError(error.message));
  return true;
}

/** Verify the SMS code and bridge the verified session to the app backend. */
export async function verifyPhoneOtp(e164, code) {
  if (!e164) throw new Error('Enter a valid mobile number.');
  if (!/^\d{4,8}$/.test(String(code || ''))) throw new Error('Enter the 6-digit code from the SMS.');
  const c = await getSupabase();
  const { data, error } = await c.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
  if (error) throw new Error(phoneError(error.message));
  if (!data?.session) throw new Error('Could not verify that code. Please try again.');
  await syncBackend(data.session.access_token);
  return data.session;
}

/** Send the password recovery email. */
export async function sendPasswordReset(email) {
  if (!validateEmail(email)) throw new Error('Please enter a valid email address.');
  const c = await getSupabase();
  const { error } = await c.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${location.origin}${location.pathname}?next=reset-password`,
  });
  if (error) throw new Error(authError(error.message));
  return true;
}

/** Set a new password (used on the reset page while holding a recovery session).
 *  The emailed recovery link IS the verification — no separate OTP step. */
export async function updatePassword(newPassword, confirmPassword) {
  if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
  const pwErr = passwordProblem(newPassword);
  if (pwErr) throw new Error(pwErr);
  const c = await getSupabase();
  const { error } = await c.auth.updateUser({ password: newPassword });
  if (error) throw new Error(authError(error.message));
  return true;
}

/* ---------- profile (public.profiles, protected by RLS) ---------- */

export async function getMyProfile() {
  return currentProfile();
}

export async function updateMyProfile({ fullName, phone, avatarUrl }) {
  const session = await currentSession();
  if (!session) throw new Error('Please sign in first.');
  const c = await getSupabase();
  const patch = { updated_at: new Date().toISOString() };
  if (fullName !== undefined) patch.full_name = String(fullName).trim();
  if (phone !== undefined) patch.phone = phone ? String(phone).trim() : null;
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl ? String(avatarUrl).trim() : null;
  const { data, error } = await c.from('profiles').update(patch).eq('id', session.user.id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/* ---------- backend session bridge ---------- */

/**
 * Gives our Node backend the verified Supabase token; the backend
 * verifies it independently and sets its own HttpOnly session cookie.
 * After this, the entire existing site (bookings, account pages)
 * recognizes the user as state.user.
 */
export async function syncBackend(accessToken) {
  const res = await API.post('/api/auth/supabase-sync', { accessToken });
  if (!res?.ok) throw new Error('Could not sign you in to the app.');
  return res.user;
}

/** Convenience: true if the visitor holds a live Supabase session. */
export async function hasSupabaseSession() {
  return Boolean(await currentSession());
}

/**
 * Called once at boot when the app has no local session.
 * Restores a Supabase session (page refresh / recovery link) and bridges
 * it to the backend. Cheap-skip: if nothing suggests a Supabase session
 * exists, we never even load the SDK.
 */
export async function restoreSupabaseSession() {
  let hasStored = false;
  try {
    hasStored = Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch { /* storage unavailable */ }
  const recoveryHint = /[?&]code=/.test(location.search)
    || /access_token=|type=recovery|error_description/.test(location.hash);
  if (!hasStored && !recoveryHint) return null;
  try {
    const session = await currentSession();
    if (!session) { console.warn('[restore] no SDK session available'); return null; }
    await syncBackend(session.access_token);
    return true;
  } catch (restoreErr) {
    console.warn('[restore] failed:', restoreErr?.message || restoreErr);
    return null;
  }
}
