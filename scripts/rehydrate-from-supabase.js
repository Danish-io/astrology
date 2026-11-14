'use strict';

/**
 * Rehydrate: Supabase PostgreSQL → Local SQLite (reverse sync)
 *
 * Used automatically on fresh deploys (e.g. Render free tier has an
 * ephemeral disk): when the local database is empty at boot, the server
 * runs this script to restore the real data from Supabase before serving.
 * Also usable manually:  node scripts/rehydrate-from-supabase.js
 *
 * Safe to re-run: uses INSERT OR REPLACE (upsert by primary key).
 */

try { require('dotenv').config(); } catch {}

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { getSupabase, isSupabaseEnabled } = require('../lib/supabase');

if (!isSupabaseEnabled()) {
  console.error('REHYDRATE_SKIPPED: SUPABASE_URL / SUPABASE_SECRET_KEY not configured');
  process.exit(2);
}

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'aradhana.db');

const sqlite = new DatabaseSync(DB_PATH);
const supabase = getSupabase();

// Tables in FK-safe order (parents before children) — same list as migrate-to-supabase.js
const TABLES = [
  'users', 'sessions', 'otp_verifications', 'consents', 'customer_profiles',
  'birth_profiles', 'addresses', 'providers', 'service_categories', 'services',
  'service_samagri', 'provider_services', 'availability_rules',
  'availability_exceptions', 'time_slots', 'bookings', 'booking_puja_details',
  'booking_consultation_details', 'booking_birth_details',
  'booking_status_history', 'booking_notes', 'booking_contact_attempts',
  'booking_reschedules', 'offline_payment_records', 'events', 'event_sessions',
  'event_registrations', 'event_attendees', 'event_waitlist', 'reviews',
  'booking_media', 'booking_documents', 'notification_templates',
  'notification_recipients', 'notification_outbox', 'notification_delivery_logs',
  'inapp_notifications', 'zodiac_signs', 'daily_horoscopes', 'panchang_days',
  'festivals', 'faqs', 'testimonials', 'enquiries', 'newsletter_subscribers',
  'audit_logs', 'app_settings', 'system_jobs',
];

const PAGE = 900;

function localColumns(table) {
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(cols.map((c) => c.name));
  } catch { return null; }
}

/** Convert a Supabase JSON value into something SQLite can store. */
function toSqlite(v) {
  if (v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

async function fetchAll(table) {
  const out = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(start, start + PAGE - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

(async () => {
  let total = 0;
  const report = [];

  for (const table of TABLES) {
    const cols = localColumns(table);
    if (!cols || cols.size === 0) { report.push(`⏭️  ${table}: not present locally (skipped)`); continue; }
    let rows;
    try { rows = await fetchAll(table); } catch (e) { report.push(`❌ ${table}: ${e.message}`); continue; }
    if (rows.length === 0) { report.push(`⏭️  ${table}: 0 rows in Supabase`); continue; }

    const insert = sqlite.prepare(
      `INSERT OR REPLACE INTO ${table} (${[...cols].join(', ')}) VALUES (${[...cols].map(() => '?').join(', ')})`
    );
    let done = 0;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const record = {};
        for (const col of cols) record[col] = toSqlite(row[col]);
        insert.run(...Object.values(record));
        done++;
      }
      sqlite.exec('COMMIT');
    } catch (e) {
      try { sqlite.exec('ROLLBACK'); } catch { /* noop */ }
      report.push(`❌ ${table}: ${e.message}`);
      continue;
    }
    total += done;
    report.push(`✅ ${table}: ${done} rows restored`);
  }

  if (process.env.REHYDRATE_QUIET !== '1') {
    console.log('🔄 Supabase → SQLite rehydration');
    report.forEach((r) => console.log('   ' + r));
    console.log(`🎉 Rehydrated ${total} rows total.`);
  } else {
    console.log(`REHYDRATE_DONE:${total}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('REHYDRATE_FAILED:', e.message);
  process.exit(1);
});
