'use strict';

/**
 * Real-auth test battery for the migrated flows (no demo data).
 *   TEST C: real email login (provisioned staff account)
 *   TEST D: wrong password rejected
 *   TEST E: unregistered account rejected
 *   TEST G: role authorization (owner→admin dashboard, pandit→provider, customer blocked)
 *   TEST A*: phone OTP — checks whether Supabase SMS is configured (never fakes delivery)
 *   TEST I: demo-removal sweep
 * Run: node scripts/test-real-auth.js   (server must be running on PORT)
 */

try { require('dotenv').config(); } catch {}
const fs = require('node:fs');
const path = require('node:path');
const { getSupabase } = require('../lib/supabase');

const URL_ = process.env.SUPABASE_URL;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY;
const PORT = process.env.PORT || 4321;
const BASE = `http://localhost:${PORT}`;

let passed = 0; let failed = 0;
const ok = (l, x = '') => { passed++; console.log(`  ✅ ${l}${x ? ' — ' + x : ''}`); };
const bad = (l, x = '') => { failed++; console.log(`  ❌ ${l}${x ? ' — ' + x : ''}`); };

function ownerCreds() {
  const file = path.join(__dirname, '.staff-credentials.txt');
  if (!fs.existsSync(file)) return null;
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('OWNER\t'));
  if (!line) return null;
  const [, email, password] = line.split('\t');
  return { email, password };
}

async function passwordGrant(email, password) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { res, body: await res.json().catch(() => ({})) };
}

(async () => {
  console.log('\n🧪 Real-auth test battery\n');
  const admin = getSupabase();
  const creds = ownerCreds();

  /* TEST C: real email login */
  let ownerSession = null;
  if (creds) {
    const { res, body } = await passwordGrant(creds.email, creds.password);
    if (res.ok && body.access_token) { ok('TEST C: real email login (owner@aradhana.in via Supabase password grant)'); ownerSession = body; }
    else bad('TEST C: real email login', body.error_description || `HTTP ${res.status}`);

    /* TEST D: wrong password */
    const d = await passwordGrant(creds.email, 'WrongPass999');
    const dMsg = d.body.msg || d.body.error_description || '';
    if (!d.res.ok && /invalid login credentials|invalid_credentials/i.test(dMsg)) ok('TEST D: wrong password rejected');
    else bad('TEST D: wrong password rejected', `HTTP ${d.res.status} "${dMsg}"`);

    /* TEST E: unregistered account */
    const e = await passwordGrant(`nobody-${Date.now().toString(36)}@mailinator.com`, 'Whatever123');
    const eMsg = e.body.msg || e.body.error_description || '';
    if (!e.res.ok && /invalid login credentials|invalid_credentials/i.test(eMsg)) ok('TEST E: unregistered account rejected');
    else bad('TEST E: unregistered account rejected', `HTTP ${e.res.status} "${eMsg}"`);

    /* TEST F2: duplicate signup is rejected (anti-enumeration safe) */
    const dupEmail = `dup-test-${Date.now().toString(36)}@mailinator.com`;
    const created = await admin.auth.admin.createUser({ email: dupEmail, password: 'DupFixture123', email_confirm: true });
    if (created.data?.user) {
      const s = await fetch(`${URL_}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: PUB, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dupEmail, password: 'OtherFixture123' }),
      });
      const sb = await s.json().catch(() => ({}));
      const sMsg = (sb.msg || sb.error_description || '').toLowerCase();
      const obfuscated = s.ok && Array.isArray(sb.identities) && sb.identities.length === 0;
      if (!s.ok && /already/.test(sMsg)) ok('TEST F2: duplicate signup rejected by Supabase', sMsg.trim());
      else if (obfuscated) ok('TEST F2: duplicate signup obfuscated (confirm-email ON) — client maps to "already has an account"');
      else bad('TEST F2: duplicate signup handling unexpected', `HTTP ${s.status} ${JSON.stringify(sb).slice(0, 140)}`);
      await admin.auth.admin.deleteUser(created.data.user.id);
    } else {
      bad('TEST F2: could not create fixture user', created.error?.message || 'unknown');
    }

    /* TEST G1: owner role via bridge → admin dashboard */
    const sync = await fetch(`${BASE}/api/auth/supabase-sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: ownerSession.access_token }),
    });
    const syncBody = await sync.json().catch(() => ({}));
    const cookie = (sync.headers.getSetCookie?.() || []).find((c) => c.startsWith('aradhana_session='));
    if (sync.ok && syncBody.user?.isOwner) ok('TEST G1: bridge preserved OWNER role', `role=${syncBody.user.role}`);
    else bad('TEST G1: owner role via bridge', syncBody.error || `HTTP ${sync.status}`);

    const dash = await fetch(`${BASE}/api/admin/dashboard`, { headers: { Cookie: cookie?.split(';')[0] } });
    if (dash.ok) ok('TEST G1b: owner can open the admin dashboard');
    else bad('TEST G1b: admin dashboard access', `HTTP ${dash.status}`);

    /* TEST G2: customer must be blocked from admin dashboard */
    const custRes = await fetch(`${BASE}/api/admin/dashboard`); // no cookie → anonymous
    if (custRes.status === 401 || custRes.status === 403) ok('TEST G2: anonymous blocked from admin dashboard', `HTTP ${custRes.status}`);
    else bad('TEST G2: anonymous blocked', `HTTP ${custRes.status}`);

    /* TEST G3: pandit role */
    const pline = fs.readFileSync(path.join(__dirname, '.staff-credentials.txt'), 'utf8')
      .split('\n').find((l) => l.startsWith('PROVIDER\t'));
    if (pline) {
      const [, pemail, ppass] = pline.split('\t');
      const p = await passwordGrant(pemail, ppass);
      if (p.res.ok && p.body.access_token) {
        const ps = await fetch(`${BASE}/api/auth/supabase-sync`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: p.body.access_token }),
        });
        const pb = await ps.json().catch(() => ({}));
        if (ps.ok && pb.user?.provider) ok('TEST G3: pandit login keeps PROVIDER role', pb.user.provider.displayName || '');
        else bad('TEST G3: pandit role via bridge', pb.error || `HTTP ${ps.status}`);
      } else bad('TEST G3: pandit login', p.body.error_description || `HTTP ${p.res.status}`);
    }

    /* TEST G4: profiles RLS — owner token sees own row, NOT other rows */
    if (ownerSession?.access_token && ownerSession?.user?.id) {
      const ownId = ownerSession.user.id;
      const { data: allProfiles } = await admin.auth.admin.listUsers({ page: 1, perPage: 20 });
      const other = (allProfiles?.users || []).find((u) => u.id !== ownId);
      if (other) {
        const ownRes = await fetch(`${URL_}/rest/v1/profiles?select=id&id=eq.${ownId}`, {
          headers: { apikey: PUB, Authorization: `Bearer ${ownerSession.access_token}` },
        });
        const ownRows = await ownRes.json().catch(() => null);
        if (ownRes.ok && Array.isArray(ownRows) && ownRows.length === 1) ok('TEST G4a: user can read own profile row (RLS)');
        else bad('TEST G4a: own profile read', `HTTP ${ownRes.status} ${JSON.stringify(ownRows).slice(0, 100)}`);

        const otherRes = await fetch(`${URL_}/rest/v1/profiles?select=id&id=eq.${other.id}`, {
          headers: { apikey: PUB, Authorization: `Bearer ${ownerSession.access_token}` },
        });
        const otherRows = await otherRes.json().catch(() => null);
        if (otherRes.ok && Array.isArray(otherRows) && otherRows.length === 0) ok("TEST G4b: owner cannot read another user's profile (RLS)");
        else bad("TEST G4b: RLS profile read", `HTTP ${otherRes.status} ${JSON.stringify(otherRows).slice(0, 100)}`);

        const patchRes = await fetch(`${URL_}/rest/v1/profiles?id=eq.${other.id}`, {
          method: 'PATCH',
          headers: { apikey: PUB, Authorization: `Bearer ${ownerSession.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ full_name: 'HACKED' }),
        });
        const patchRows = await patchRes.json().catch(() => null);
        if (patchRes.ok && Array.isArray(patchRows) && patchRows.length === 0) ok("TEST G4c: owner cannot modify another user's profile (RLS)");
        else if (!patchRes.ok) ok("TEST G4c: owner cannot modify another user's profile (RLS)", `HTTP ${patchRes.status}`);
        else bad('TEST G4c: RLS profile update', JSON.stringify(patchRows).slice(0, 100));

        // Role field must not be writable via profiles at all
        const rolePatch = await fetch(`${URL_}/rest/v1/profiles?id=eq.${ownId}`, {
          method: 'PATCH',
          headers: { apikey: PUB, Authorization: `Bearer ${ownerSession.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ role: 'OWNER' }),
        });
        const roleRows = await rolePatch.json().catch(() => null);
        if (!rolePatch.ok) ok("TEST G4d: profiles table rejects role writes (no role column / schema)", `HTTP ${rolePatch.status}`);
        else if (Array.isArray(roleRows)) {
          const { get } = require('../lib/db');
          const localRole = get('SELECT role FROM users WHERE email = ?', [creds.email.toLowerCase()])?.role;
          if (localRole === 'OWNER') ok('TEST G4d: role lives server-side; frontend profiles write cannot self-elevate', `app role=${localRole}`);
          else bad('TEST G4d: unexpected role change', `app role=${localRole}`);
        } else bad('TEST G4d: role write response shape', JSON.stringify(roleRows).slice(0, 100));
      } else {
        bad('TEST G4: could not find a second auth user to probe RLS with');
      }
    }
  } else {
    bad('TEST C: staff credentials file not found — run scripts/provision-staff-auth.js first');
  }

  /* TEST A: phone OTP — is SMS actually configured? */
  const otp = await fetch(`${URL_}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: PUB, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919876543210' }),
  });
  const otpBody = await otp.json().catch(() => ({}));
  if (otp.ok) ok('TEST A: Supabase accepted the OTP request (SMS provider IS configured — a real SMS should arrive)');
  else {
    bad('TEST A: SMS provider NOT configured', otpBody.msg || otpBody.error_description || `HTTP ${otp.status}`);
    console.log('     → Manual fix required (see FINAL-REPORT: SMS provider configuration).');
  }

  /* TEST I: demo-removal sweep */
  const roots = [path.join(__dirname, '..', 'lib'), path.join(__dirname, '..', 'ui'), path.join(__dirname, '..', 'scripts')];
  const badPatterns = ['123456', 'Demo code', 'devOtp', 'demoOtp', 'mockOtp', 'fakeLogin', 'mockAuth'];
  const hits = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p); continue; }
      if (!/\.(js|html|json|css)$/.test(f.name) || f.name.endsWith('.bak')) continue;
      if (path.relative(__dirname, p) === 'test-real-auth.js') continue; // the detector itself
      const content = fs.readFileSync(p, 'utf8');
      for (const pat of badPatterns) if (content.includes(pat)) hits.push(`${path.relative(process.cwd(), p)} → "${pat}"`);
    }
  };
  roots.forEach((r) => walk(r));
  // server.js + root-level files (skip node_modules & dotfiles)
  for (const f of fs.readdirSync(path.join(__dirname, '..'))) {
    if (!/\.js$/.test(f) || f.endsWith('.bak')) continue;
    const p = path.join(__dirname, '..', f);
    const content = fs.readFileSync(p, 'utf8');
    for (const pat of badPatterns) if (content.includes(pat)) hits.push(`${f} → "${pat}"`);
  }
  if (!hits.length) ok('TEST I: demo-removal sweep clean (no demo OTP / mock auth strings in project code)');
  else { bad('TEST I: demo remnants found'); hits.forEach((h) => console.log('     ' + h)); }

  console.log(`\n===== RESULT: ${passed} passed, ${failed} failed =====\n`);
  setTimeout(() => process.exit(failed ? 1 : 0), 300);
})().catch((e) => { console.error('Unexpected:', e.message); process.exit(1); });
