'use strict';

/**
 * Data migration: Local SQLite (aradhana.db) → Supabase PostgreSQL
 *
 * Usage:
 *   1. Make sure .env has SUPABASE_URL and SUPABASE_SECRET_KEY
 *   2. Make sure the schema (supabase-schema.sql) has been run in Supabase
 *   3. Run:  node scripts/migrate-to-supabase.js
 *
 * Safe to re-run: uses UPSERT (won't duplicate existing rows).
 */

require('dotenv').config?.() || null; // optional dotenv if installed
try { require('dotenv').config(); } catch {}

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { getSupabase, isSupabaseEnabled } = require('../lib/supabase');

if (!isSupabaseEnabled()) {
  console.error('❌ Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'aradhana.db');

const sqlite = new DatabaseSync(DB_PATH);
const supabase = getSupabase();

// Tables in FK-safe order (parents before children)
const TABLES = [
  'users',
  'sessions',
  'otp_verifications',
  'consents',
  'customer_profiles',
  'birth_profiles',
  'addresses',
  'providers',
  'service_categories',
  'services',
  'service_samagri',
  'provider_services',
  'availability_rules',
  'availability_exceptions',
  'time_slots',
  'bookings',
  'booking_puja_details',
  'booking_consultation_details',
  'booking_birth_details',
  'booking_status_history',
  'booking_notes',
  'booking_contact_attempts',
  'booking_reschedules',
  'offline_payment_records',
  'events',
  'event_sessions',
  'event_registrations',
  'event_attendees',
  'event_waitlist',
  'reviews',
  'booking_media',
  'booking_documents',
  'notification_templates',
  'notification_recipients',
  'notification_outbox',
  'notification_delivery_logs',
  'inapp_notifications',
  'zodiac_signs',
  'daily_horoscopes',
  'panchang_days',
  'festivals',
  'faqs',
  'testimonials',
  'enquiries',
  'newsletter_subscribers',
  'audit_logs',
  'app_settings',
  'system_jobs',
];

const BATCH_SIZE = 400;

function rows(sqlite, table) {
  try {
    return sqlite.prepare(`SELECT * FROM ${table}`).all();
  } catch {
    return []; // table might not exist locally
  }
}

async function upsertBatch(table, batch) {
  const { error } = await supabase.from(table).upsert(batch, {
    onConflict: 'id',
    ignoreDuplicates: false,
  });
  if (error) {
    // Retry without onConflict for tables with composite PK or different PK
    const retry = await supabase.from(table).upsert(batch);
    if (retry.error) throw new Error(`[${table}] ${retry.error.message}`);
  }
}

(async () => {
  console.log('🚀 Migrating SQLite → Supabase');
  console.log(`   Source : ${DB_PATH}`);
  console.log(`   Target : ${process.env.SUPABASE_URL}\n`);

  let totalRows = 0;
  const report = [];

  for (const table of TABLES) {
    const data = rows(sqlite, table);
    if (data.length === 0) {
      report.push(`⏭️  ${table}: 0 rows (skipped)`);
      continue;
    }
    try {
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        await upsertBatch(table, batch);
      }
      totalRows += data.length;
      report.push(`✅ ${table}: ${data.length} rows migrated`);
    } catch (e) {
      report.push(`❌ ${table}: FAILED — ${e.message}`);
    }
  }

  console.log('\n===== MIGRATION REPORT =====');
  report.forEach((r) => console.log(r));
  console.log(`\n🎉 Done. Total rows migrated: ${totalRows}`);

  // Quick verification: count services in Supabase
  const { count, error } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true });
  if (!error) console.log(`🔎 Verify — services in Supabase: ${count}`);
  process.exit(0);
})();
