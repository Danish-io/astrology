'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { ensureDir, parseJson, nowIso, uuid } = require('./util');
const { mirrorUpsert, mirrorUpdate, mirrorInsertNoId, mirrorDelete } = require('./supabase-mirror');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'aradhana.db');

ensureDir(DATA_DIR);
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'CUSTOMER',
  preferred_language TEXT NOT NULL DEFAULT 'en',
  contact_channel TEXT NOT NULL DEFAULT 'CALL',
  call_window TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  city TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_otp_target ON otp_verifications(target, created_at DESC);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  booking_id TEXT,
  consent_type TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted INTEGER NOT NULL,
  granted_at TEXT,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  preferred_contact_channel TEXT NOT NULL DEFAULT 'CALL',
  preferred_call_window TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS birth_profiles (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT,
  date_of_birth TEXT NOT NULL,
  time_of_birth TEXT,
  time_of_birth_unknown INTEGER NOT NULL DEFAULT 0,
  place_of_birth TEXT NOT NULL,
  birth_latitude REAL,
  birth_longitude REAL,
  birth_timezone TEXT DEFAULT 'Asia/Kolkata',
  gotra TEXT,
  nakshatra TEXT,
  rashi TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  line1 TEXT NOT NULL,
  line2 TEXT,
  landmark TEXT,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'India',
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  provider_type TEXT NOT NULL DEFAULT 'PRIEST',
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  photo_url TEXT,
  headline TEXT,
  bio TEXT,
  years_of_experience INTEGER NOT NULL DEFAULT 0,
  tradition TEXT,
  city TEXT,
  service_radius_km INTEGER NOT NULL DEFAULT 25,
  offers_online INTEGER NOT NULL DEFAULT 1,
  offers_in_person INTEGER NOT NULL DEFAULT 1,
  languages TEXT NOT NULL DEFAULT '[]',
  specializations TEXT NOT NULL DEFAULT '[]',
  average_rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  min_notice_hours INTEGER NOT NULL DEFAULT 12,
  slot_buffer_minutes INTEGER NOT NULL DEFAULT 15,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_providers_type ON providers(provider_type, is_active);

CREATE TABLE IF NOT EXISTS service_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  service_type TEXT NOT NULL DEFAULT 'PUJA',
  icon TEXT,
  tagline TEXT,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES service_categories(id),
  service_type TEXT NOT NULL DEFAULT 'PUJA',
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  benefits TEXT,
  default_duration_min INTEGER NOT NULL DEFAULT 60,
  min_participants INTEGER NOT NULL DEFAULT 1,
  max_participants INTEGER NOT NULL DEFAULT 50,
  indicative_price_text TEXT NOT NULL DEFAULT 'Discussed after request',
  allowed_locations TEXT NOT NULL DEFAULT '[]',
  allowed_consult_modes TEXT NOT NULL DEFAULT '[]',
  requires_birth_details INTEGER NOT NULL DEFAULT 0,
  requires_address INTEGER NOT NULL DEFAULT 0,
  preparation_notes TEXT,
  image_url TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_samagri (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity_text TEXT,
  provided_by TEXT NOT NULL DEFAULT 'EITHER',
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provider_services (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  custom_duration_min INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider_id, service_id)
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_length_min INTEGER NOT NULL DEFAULT 60,
  service_type TEXT NOT NULL DEFAULT 'PUJA',
  valid_from TEXT,
  valid_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_rules_provider ON availability_rules(provider_id);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  exception_type TEXT NOT NULL DEFAULT 'BLOCKED',
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_slots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  held_by_booking_id TEXT,
  hold_expires_at TEXT,
  source TEXT NOT NULL DEFAULT 'RULE',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_provider_start ON time_slots(provider_id, start_at);
CREATE INDEX IF NOT EXISTS ix_slots_lookup ON time_slots(service_type, status, start_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_one_booking ON time_slots(held_by_booking_id) WHERE held_by_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL UNIQUE,
  booking_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  customer_id TEXT REFERENCES users(id),
  service_id TEXT REFERENCES services(id),
  provider_id TEXT REFERENCES providers(id),
  time_slot_id TEXT REFERENCES time_slots(id),
  event_id TEXT,
  preferred_start_at TEXT,
  alt_start_at TEXT,
  confirmed_start_at TEXT,
  confirmed_end_at TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  preferred_contact_channel TEXT NOT NULL DEFAULT 'CALL',
  preferred_call_window TEXT,
  preferred_language TEXT,
  participants_count INTEGER NOT NULL DEFAULT 1,
  special_requests TEXT,
  source TEXT NOT NULL DEFAULT 'WEB',
  assigned_to_user_id TEXT,
  meeting_link TEXT,
  payment_state TEXT NOT NULL DEFAULT 'NOT_DISCUSSED',
  requested_at TEXT NOT NULL,
  first_contacted_at TEXT,
  confirmed_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  cancelled_by TEXT,
  expires_at TEXT,
  owner_notified_at TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bookings_inbox ON bookings(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS ix_bookings_customer ON bookings(customer_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS ix_bookings_provider ON bookings(provider_id, confirmed_start_at);
CREATE INDEX IF NOT EXISTS ix_bookings_phone ON bookings(customer_phone);

CREATE TABLE IF NOT EXISTS booking_puja_details (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  location_type TEXT NOT NULL,
  address_snapshot TEXT,
  occasion TEXT,
  sankalpam_names TEXT,
  gotra TEXT,
  samagri_by TEXT,
  need_travel INTEGER NOT NULL DEFAULT 0,
  attendee_estimate INTEGER,
  live_stream_required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS booking_consultation_details (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  consult_mode TEXT NOT NULL,
  topics TEXT,
  question_summary TEXT,
  duration_min INTEGER,
  meeting_link TEXT,
  language TEXT,
  has_previous_chart INTEGER NOT NULL DEFAULT 0,
  matching_required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS booking_birth_details (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  person_label TEXT,
  full_name TEXT NOT NULL,
  gender TEXT,
  date_of_birth TEXT,
  time_of_birth TEXT,
  time_of_birth_unknown INTEGER NOT NULL DEFAULT 0,
  place_of_birth TEXT,
  birth_latitude REAL,
  birth_longitude REAL,
  gotra TEXT,
  nakshatra TEXT,
  rashi TEXT,
  source_birth_profile_id TEXT
);

CREATE TABLE IF NOT EXISTS booking_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_by_role TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_history_booking ON booking_status_history(booking_id, created_at);

CREATE TABLE IF NOT EXISTS booking_notes (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  author_user_id TEXT,
  author_name TEXT,
  note TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_contact_attempts (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  staff_user_id TEXT,
  staff_name TEXT,
  channel TEXT NOT NULL,
  outcome TEXT NOT NULL,
  summary TEXT,
  next_follow_up_at TEXT,
  agreed_start_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_reschedules (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL,
  old_slot_id TEXT,
  new_slot_id TEXT,
  old_start_at TEXT,
  new_start_at TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offline_payment_records (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  agreed_amount REAL,
  currency TEXT NOT NULL DEFAULT 'INR',
  mode TEXT,
  received_amount REAL NOT NULL DEFAULT 0,
  received_on TEXT,
  reference_note TEXT,
  recorded_by TEXT,
  remarks TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  service_id TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  event_kind TEXT NOT NULL DEFAULT 'HOMAM',
  description TEXT,
  rituals_included TEXT,
  banner_url TEXT,
  venue_name TEXT,
  venue_address TEXT,
  map_url TEXT,
  is_online_available INTEGER NOT NULL DEFAULT 0,
  stream_url TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  registration_opens_at TEXT,
  registration_closes_at TEXT,
  capacity INTEGER NOT NULL DEFAULT 50,
  seats_taken INTEGER NOT NULL DEFAULT 0,
  max_per_registration INTEGER NOT NULL DEFAULT 4,
  waitlist_enabled INTEGER NOT NULL DEFAULT 1,
  lead_provider_id TEXT,
  indicative_contribution_text TEXT DEFAULT 'Contribution discussed offline',
  dress_code TEXT,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'PUBLISHED',
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  seats INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  attendance_mode TEXT NOT NULL DEFAULT 'IN_PERSON',
  checked_in_at TEXT,
  qr_token TEXT UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_attendees (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  gotra TEXT,
  nakshatra TEXT,
  age_group TEXT,
  dietary_note TEXT
);

CREATE TABLE IF NOT EXISTS event_waitlist (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seats_wanted INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  notified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT UNIQUE REFERENCES bookings(id) ON DELETE SET NULL,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  user_id TEXT,
  customer_name TEXT,
  rating INTEGER NOT NULL,
  title TEXT,
  comment TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  owner_reply TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reviews_provider ON reviews(provider_id, is_published);

CREATE TABLE IF NOT EXISTS booking_media (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'PHOTO',
  storage_url TEXT,
  caption TEXT,
  uploaded_by TEXT,
  visible_to_customer INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_documents (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_url TEXT,
  title TEXT,
  visible_to_customer INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  channel TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  subject TEXT,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(code, channel, language)
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_id TEXT,
  channel TEXT NOT NULL,
  address TEXT NOT NULL,
  receives_booking_types TEXT NOT NULL DEFAULT '["PUJA","CONSULTATION","EVENT"]',
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  is_primary_owner INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  template_code TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  recipient_user_id TEXT,
  payload TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  sent_at TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_outbox_due ON notification_outbox(status, scheduled_at);
CREATE INDEX IF NOT EXISTS ix_outbox_booking ON notification_outbox(booking_id);

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outbox_id TEXT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  response_payload TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inapp_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_inapp_user ON inapp_notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS zodiac_signs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_local TEXT,
  symbol TEXT,
  element TEXT,
  ruling_planet TEXT,
  date_range_text TEXT,
  blurb TEXT,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_horoscopes (
  id TEXT PRIMARY KEY,
  zodiac_sign_id TEXT NOT NULL REFERENCES zodiac_signs(id),
  for_date TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'DAILY',
  language TEXT NOT NULL DEFAULT 'en',
  summary TEXT,
  love TEXT,
  career TEXT,
  finance TEXT,
  health TEXT,
  lucky_number TEXT,
  lucky_color TEXT,
  author_id TEXT,
  UNIQUE(zodiac_sign_id, for_date, period, language)
);

CREATE TABLE IF NOT EXISTS panchang_days (
  id TEXT PRIMARY KEY,
  for_date TEXT NOT NULL UNIQUE,
  location_code TEXT NOT NULL DEFAULT 'HYD',
  tithi TEXT,
  paksha TEXT,
  nakshatra TEXT,
  yoga TEXT,
  karana TEXT,
  sunrise TEXT,
  sunset TEXT,
  rahu_start TEXT,
  rahu_end TEXT,
  abhijit_start TEXT,
  abhijit_end TEXT,
  is_auspicious_for_puja INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  moon_phase TEXT
);

CREATE TABLE IF NOT EXISTS festivals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  for_date TEXT NOT NULL,
  description TEXT,
  suggested_service_id TEXT,
  emoji TEXT
);

CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  display_order INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  city TEXT,
  quote TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5,
  service_id TEXT,
  service_name TEXT,
  is_published INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_state TEXT,
  after_state TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_by TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS system_jobs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL UNIQUE,
  last_run_at TEXT,
  status TEXT,
  details TEXT
);
`;

db.exec(schema);

/* ---------- small query helpers ---------- */

function all(sql, params = []) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

function get(sql, params = []) {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : null;
}

function run(sql, params = []) {
  const result = db.prepare(sql).run(...params);
  // Mirror simple DELETEs ("DELETE FROM x WHERE col = ?") to Supabase
  const del = /^DELETE FROM (\w+) WHERE (\w+) = \?/.exec(sql.trim());
  if (del) mirrorDelete(del[1], del[2], params[0]);
  return result;
}

function insert(table, data) {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`, keys.map((k) => data[k]));
  mirrorUpsert(table, data); // also push to Supabase (fire-and-forget)
  return data;
}

function update(table, id, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => data[k]), id]);
  mirrorUpdate(table, id, data); // also push to Supabase (fire-and-forget)
}

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* noop */ }
    throw error;
  }
}

function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM app_settings WHERE key = ?', [key]);
  if (!row) return fallback;
  return parseJson(row.value, fallback) ?? fallback;
}

function setSetting(key, value, description = null, userId = null) {
  const exists = get('SELECT key FROM app_settings WHERE key = ?', [key]);
  const json = JSON.stringify(value);
  if (exists) {
    run('UPDATE app_settings SET value = ?, updated_by = ?, updated_at = ? WHERE key = ?', [json, userId, nowIso(), key]);
  } else {
    run('INSERT INTO app_settings (key, value, description, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)', [key, json, description, userId, nowIso()]);
  }
  // Mirror the full row to Supabase (app_settings PK is "key", not "id")
  try {
    const row = get('SELECT * FROM app_settings WHERE key = ?', [key]);
    if (row) mirrorUpsert('app_settings', row);
  } catch (e) { console.warn('[mirror] setSetting:', e.message); }
}

function publicSettings() {
  const keys = [
    'site.name', 'site.tagline', 'site.contact_phone', 'site.contact_whatsapp', 'site.email',
    'site.address', 'site.hours', 'site.instagram', 'site.youtube',
    'site.primary_provider_slug', 'site.pandit_name', 'site.pandit_short_name',
    'site.pandit_title', 'site.pandit_since', 'site.consult_heading',
    'booking.hold_hours', 'booking.max_advance_days', 'booking.min_notice_hours',
    'booking.cancellation_window_hours', 'privacy.retention_months', 'privacy.policy_version',
  ];
  const out = {};
  for (const key of keys) out[key] = getSetting(key);
  return out;
}

function audit(req, action, entityType, entityId, before = null, after = null) {
  try {
    const user = req?.user || null;
    run(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, before_state, after_state, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user?.id || null, user?.full_name || 'system', action, entityType || null, entityId || null,
        before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, req?.ip || null, nowIso()]
    );
    // Mirror to Supabase (audit_logs uses auto-generated id there)
    mirrorInsertNoId('audit_logs', {
      user_id: user?.id || null,
      user_name: user?.full_name || 'system',
      action, entity_type: entityType || null, entity_id: entityId || null,
      before_state: before ? JSON.stringify(before) : null,
      after_state: after ? JSON.stringify(after) : null,
      ip_address: req?.ip || null,
      created_at: nowIso(),
    });
  } catch (error) {
    console.error('audit failed', error.message);
  }
}

module.exports = {
  db, DB_PATH, schema, all, get, run, insert, update, tx, getSetting, setSetting, publicSettings, audit, uuid,
};
