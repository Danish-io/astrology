'use strict';

/**
 * Fire-and-forget mirroring of local SQLite writes → Supabase.
 * Every insert/update/delete through lib/db.js is also pushed to Supabase
 * asynchronously. Local SQLite stays the source of truth for reads,
 * Supabase becomes the always-up-to-date cloud copy.
 *
 * If a mirror call fails, it only logs a warning — the website keeps working.
 * Re-run scripts/migrate-to-supabase.js anytime to "heal" any drift (upsert).
 */

const { getSupabase, isSupabaseEnabled } = require('./supabase');

// Tables whose primary key is not "id"
const PK = {
  sessions: ['token_hash'],
  app_settings: ['key'],
  provider_services: ['provider_id', 'service_id'],
};

function pkCols(table) {
  return PK[table] || ['id'];
}

function clean(record) {
  const out = {};
  for (const [k, v] of Object.entries(record || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mirrorUpsert(table, record) {
  if (!isSupabaseEnabled()) return;
  const conflict = pkCols(table).join(',');
  getSupabase()
    .from(table)
    .upsert(clean(record), { onConflict: conflict })
    .then(({ error }) => { if (error) console.warn(`[mirror] upsert ${table}: ${error.message}`); })
    .catch((e) => console.warn(`[mirror] upsert ${table}: ${e.message}`));
}

function mirrorUpdate(table, id, data) {
  if (!isSupabaseEnabled()) return;
  const cols = pkCols(table);
  let q = getSupabase().from(table).update(clean(data));
  if (cols.length === 1) q = q.eq(cols[0], id);
  q.then(({ error }) => { if (error) console.warn(`[mirror] update ${table}: ${error.message}`); })
    .catch((e) => console.warn(`[mirror] update ${table}: ${e.message}`));
}

function mirrorInsertNoId(table, record) {
  // For tables with auto-generated identity ids in PostgreSQL (e.g. audit_logs)
  if (!isSupabaseEnabled()) return;
  getSupabase()
    .from(table)
    .insert(clean(record))
    .then(({ error }) => { if (error) console.warn(`[mirror] insert ${table}: ${error.message}`); })
    .catch((e) => console.warn(`[mirror] insert ${table}: ${e.message}`));
}

function mirrorDelete(table, col, val) {
  if (!isSupabaseEnabled()) return;
  getSupabase()
    .from(table)
    .delete()
    .eq(col, val)
    .then(({ error }) => { if (error) console.warn(`[mirror] delete ${table}: ${error.message}`); })
    .catch((e) => console.warn(`[mirror] delete ${table}: ${e.message}`));
}

module.exports = { mirrorUpsert, mirrorUpdate, mirrorInsertNoId, mirrorDelete };
