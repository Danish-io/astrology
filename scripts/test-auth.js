'use strict';

/**
 * End-to-end authentication test — REAL accounts, no mocks.
 *
 * 1. Real signup through Supabase Auth (publishable key, like the browser does)
 * 2. If email confirmation blocks the session → confirm via ADMIN API (server-side only)
 * 3. Real password sign-in → access token
 * 4. Verify the profiles trigger created the profile row (RLS table)
 * 5. Bridge: POST /api/auth/supabase-sync → local HttpOnly session
 * 6. GET /api/me with the cookie → app recognizes the user
 * 7. Negative test: wrong password must be rejected
 * 8. Negative test: fake access token must be rejected by the bridge
 * 9. Real booking with the session (mirrored to Supabase)
 * 10. Cleanup: delete the test user (Supabase + local SQLite)
 *
 * Run: node scripts/test-auth.js   (server must be running on PORT)
 */

try { require('dotenv').config(); } catch {}
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { getSupabase } = require('../lib/supabase');

const URL_ = process.env.SUPABASE_URL;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY;
const PORT = process.env.PORT || 4321;
const BASE = `http://localhost:${PORT}`;

const stamp = Date.now().toString(36);
const EMAIL = `e2e-${stamp}@mailinator.com`;
const PASS = 'TestPass123';
const NAME = 'E2E Test User';
// Unique phone per run — Supabase users.phone is UNIQUE, so a reused
// number collides with mirror rows from previous runs.
const PHONE = '+9198' + String(Math.floor(10000000 + Math.random() * 89999999));

let passed = 0; let failed = 0;
function ok(label, extra = '') { passed++; console.log(`  ✅ ${label}${extra ? ' — ' + extra : ''}`); }
function bad(label, extra = '') { failed++; console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }

async function main() {
  console.log(`\n🧪 E2E auth test — user: ${EMAIL}\n`);
  const adminClient = getSupabase();

  /* 0. Clean up any orphaned users from earlier failed runs */
  try {
    const { data: all } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
    const orphans = (all.users || []).filter((u) => /^e2e-.*@mailinator\.com$/.test(u.email));
    for (const o of orphans) await adminClient.auth.admin.deleteUser(o.id);
    if (orphans.length) console.log(`  🧹 removed ${orphans.length} orphaned auth user(s) from Supabase`);
    // …and their mirrored app rows (public.users has UNIQUE phone)
    const { data: staleUsers } = await adminClient.from('users').select('id').like('email', 'e2e-%');
    for (const u of staleUsers || []) {
      await adminClient.from('sessions').delete().eq('user_id', u.id);
      await adminClient.from('customer_profiles').delete().eq('user_id', u.id);
      await adminClient.from('users').delete().eq('id', u.id);
    }
    const db0 = new DatabaseSync(path.join(__dirname, '..', 'data', 'aradhana.db'));
    const stales = db0.prepare("SELECT id FROM users WHERE email LIKE 'e2e-%@mailinator.com'").all();
    for (const s of stales) {
      db0.prepare('DELETE FROM sessions WHERE user_id = ?').run(s.id);
      db0.prepare('DELETE FROM customer_profiles WHERE user_id = ?').run(s.id);
      db0.prepare('DELETE FROM bookings WHERE customer_id = ? OR customer_phone = ?').run(s.id, PHONE);
      db0.prepare('DELETE FROM users WHERE id = ?').run(s.id);
    }
    db0.close();
  } catch { /* best effort */ }

  /* 1. Real signup through the public endpoint (exactly what the browser does) */
  let res = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS, data: { full_name: NAME, phone: PHONE } }),
  });
  const signup = await res.json().catch(() => ({}));
  // Newer GoTrue returns the user FLAT; older returns { user, session }.
  let userId = signup.user?.id || (signup.id && signup.email ? signup.id : null);
  let accessToken = signup.session?.access_token || signup.access_token || null;

  if (res.status === 429) {
    // Free-tier confirmation-email rate limit — create the REAL user via the
    // admin API instead (no email involved; password grant still fully tested).
    console.log('  … signup rate-limited (confirmation emails) — creating the real user via ADMIN API');
    const { data: created, error: crErr } = await adminClient.auth.admin.createUser({
      email: EMAIL, password: PASS, email_confirm: true,
      user_metadata: { full_name: NAME, phone: PHONE },
    });
    if (crErr || !created?.user) { bad('Admin fallback signup', crErr?.message || 'no user'); return finish(); }
    userId = created.user.id;
    ok('Real auth user created (admin path, email pre-confirmed)');
  } else if (!userId) {
    bad('Signup', signup.msg || signup.error_description || `HTTP ${res.status}`);
    return finish();
  } else {
    ok('Real signup — Supabase Auth user created', `id=${userId.slice(0, 8)}…`);
  }

  if (accessToken) {
    ok('Signup returned a session immediately (email confirmation disabled in project)');
  } else {
    /* 2. Admin-confirm (server-side only; this is what the emailed link does) */
    console.log('  … confirming email via ADMIN API (secret key, never frontend)');
    const { error: confErr } = await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
    if (confErr) { bad('Admin email confirm', confErr.message); return finish(); }
    ok('Email confirmed via admin API (simulates clicking the confirmation link)');
  }

  /* 3. Real password sign-in */
  res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const login = await res.json();
  if (!res.ok || !login.access_token) { bad('Password sign-in', login.error_description || `HTTP ${res.status}`); return finish(); }
  accessToken = login.access_token;
  ok('Real password sign-in — access token issued');

  /* 4. profiles row created by the trigger (retry once — PostgREST's schema
     cache occasionally lags right after DDL) */
  let prof = null; let profErr = null;
  for (let attempt = 0; attempt < 2 && !prof; attempt++) {
    ({ data: prof, error: profErr } = await adminClient.from('profiles').select('id, full_name, phone').eq('id', userId).single());
    if (!prof && profErr) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!profErr && prof) ok('profiles row auto-created by trigger (RLS table)', `full_name="${prof.full_name}"`);
  else bad('profiles row exists', profErr?.message || 'no row');

  /* 5. Bridge: verified token → local session */
  res = await fetch(`${BASE}/api/auth/supabase-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  });
  const sync = await res.json();
  const cookie = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('aradhana_session='));
  if (res.ok && sync.ok && sync.user && cookie) {
    ok('Bridge /api/auth/supabase-sync — local session created', `role=${sync.user.role}, name="${sync.user.fullName}"`);
  } else { bad('Bridge sync', sync.error || `HTTP ${res.status}`); return finish(); }
  const sessionCookie = cookie.split(';')[0];

  /* 6. /api/me with the session cookie */
  res = await fetch(`${BASE}/api/me`, { headers: { Cookie: sessionCookie } });
  const me = await res.json();
  if (res.ok && me.user?.email === EMAIL) ok('GET /api/me — app recognizes the Supabase user', `email=${me.user.email}`);
  else bad('GET /api/me', JSON.stringify(me).slice(0, 120));

  /* 7. Wrong password must be rejected */
  res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: 'WrongPass999' }),
  });
  if (res.status === 400) ok('Wrong password rejected (HTTP 400)');
  else bad('Wrong password rejected', `HTTP ${res.status}`);

  /* 8. Fake token must be rejected by the bridge */
  res = await fetch(`${BASE}/api/auth/supabase-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: 'fake.token.value.aaaaaaaaaaaaaaaaaaaa' }),
  });
  if (res.status === 401) ok('Fake access token rejected by bridge (HTTP 401)');
  else bad('Fake token rejected', `HTTP ${res.status}`);

  /* 9. Real booking with the session */
  res = await fetch(`${BASE}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      contact: { name: NAME, phone: PHONE, email: EMAIL },
      type: 'PUJA', serviceId: null, details: { date: '2026-12-31' },
    }),
  });
  const booking = await res.json();
  if (res.ok && booking.ref) ok('Booking submitted with the authenticated session', booking.ref);
  else bad('Booking', booking.error || `HTTP ${res.status}`);

  /* 10. Cleanup */
  try {
    await adminClient.auth.admin.deleteUser(userId);
    // …plus every mirrored app row (bookings first — FK references users)
    await adminClient.from('bookings').delete().eq('customer_phone', PHONE);
    await adminClient.from('sessions').delete().eq('user_id', userId);
    await adminClient.from('customer_profiles').delete().eq('user_id', userId);
    await adminClient.from('users').delete().eq('id', userId);
    ok('Cleanup — Supabase auth user + mirrored rows deleted (profiles cascades)');
  } catch (e) { bad('Cleanup supabase user', e.message); }
  try {
    const db = new DatabaseSync(path.join(__dirname, '..', 'data', 'aradhana.db'));
    const u = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);
    if (u) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM customer_profiles WHERE user_id = ?').run(u.id);
      db.prepare('DELETE FROM bookings WHERE customer_id = ? OR customer_phone = ?').run(u.id, PHONE);
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      await adminClient.from('bookings').delete().eq('customer_phone', PHONE);
      ok('Cleanup — local test rows removed');
    }
    db.close();
  } catch (e) { bad('Cleanup local', e.message); }

  finish();
}

function finish() {
  console.log(`\n===== RESULT: ${passed} passed, ${failed} failed =====\n`);
  // Small delay lets libuv close pending handles (avoids a Node/Windows
  // exit crash when the Supabase admin client still has open sockets).
  setTimeout(() => process.exit(failed ? 1 : 0), 300);
}

main().catch((e) => { bad('Unexpected', e.message); finish(); });
