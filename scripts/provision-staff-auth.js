'use strict';

/**
 * Provision staff/pandit accounts in Supabase Auth.
 *
 * The app's role system lives in the local users table (users.role) and is
 * enforced server-side. Staff log in via Supabase Auth (email + password);
 * the /api/auth/supabase-sync bridge then maps their email to the existing
 * local user, preserving their REAL role (OWNER/STAFF/PROVIDER).
 *
 * - Idempotent: existing Supabase users are skipped.
 * - Passwords: strong + random, written to scripts/.staff-credentials.txt
 *   (gitignored) and shown once. Share with each staff member privately;
 *   they can change it via "Forgot password?".
 *
 * Run: node scripts/provision-staff-auth.js
 */

try { require('dotenv').config(); } catch {}
const fs = require('node:fs');
const path = require('node:path');
const { all } = require('../lib/db');
const { getSupabase, isSupabaseEnabled } = require('../lib/supabase');

if (!isSupabaseEnabled()) { console.error('❌ Supabase not configured'); process.exit(1); }

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
function strongPassword() {
  // 16 chars, guaranteed letter+digit mix
  let out = '';
  const rnd = new Uint32Array(16);
  require('node:crypto').webcrypto.getRandomValues(rnd);
  for (let i = 0; i < 16; i++) out += PASSWORD_ALPHABET[rnd[i] % PASSWORD_ALPHABET.length];
  return out.slice(0, 8) + '7' + out.slice(8); // ensure a digit
}

(async () => {
  const supabase = getSupabase();
  // Staff = everyone with elevated role in the app's own users table.
  // Customers are NEVER provisioned here (they use OTP or email signup).
  const staff = all(
    "SELECT email, full_name, role FROM users WHERE deleted_at IS NULL AND email IS NOT NULL AND role IN ('OWNER','ADMIN','STAFF','PROVIDER')"
  );
  if (!staff.length) { console.log('No staff users found locally.'); process.exit(0); }

  const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingByEmail = new Map((existing.users || []).map((u) => [u.email?.toLowerCase(), u]));

  const lines = ['# Aradhana staff credentials (generated ' + new Date().toISOString() + ')', '# Share privately; staff should change passwords after first login.', ''];
  let created = 0; let skipped = 0;

  for (const s of staff) {
    const email = s.email.toLowerCase();
    if (existingByEmail.has(email)) { console.log(`⏭️  ${email} — already exists in Supabase Auth`); skipped++; continue; }
    const password = strongPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: s.full_name || email.split('@')[0] },
    });
    if (error || !data?.user) { console.error(`❌ ${email} — ${error?.message || 'no user'}`); continue; }
    // Keep the mirrored app row's name consistent
    await supabase.from('profiles').update({ full_name: s.full_name || email.split('@')[0] }).eq('id', data.user.id);
    lines.push(`${s.role}\t${email}\t${password}`);
    console.log(`✅ ${email} — ${s.role} — created`);
    created++;
  }

  if (created) {
    const out = path.join(__dirname, '.staff-credentials.txt');
    fs.appendFileSync(out, lines.join('\n') + '\n', 'utf8');
    console.log(`\n🔑 ${created} account(s) created. Credentials appended to scripts/.staff-credentials.txt`);
    console.log('   (gitignored — never commit or paste publicly. Share with each staff member privately.)');
  } else {
    console.log('\nNothing to create — all staff already provisioned.');
  }
  console.log(`Summary: ${created} created, ${skipped} skipped (already present).`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
