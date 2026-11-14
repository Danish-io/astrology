'use strict';

const { all, get, run } = require('./db');
const { uuid, nowIso, istDateKey, addDaysKey, istToIso, weekdayKey } = require('./util');

const HORIZON_DAYS = 75;

function providerServiceTypes(provider) {
  if (!provider) return ['PUJA'];
  if (provider.provider_type === 'BOTH') return ['PUJA', 'CONSULTATION'];
  return provider.provider_type === 'ASTROLOGER' ? ['CONSULTATION'] : ['PUJA'];
}

function overlapsBooked(providerId, startAt, endAt, ignoreId = null) {
  const row = get(
    `SELECT id FROM time_slots
      WHERE provider_id = ? AND status IN ('BOOKED','TENTATIVE')
        AND start_at < ? AND end_at > ? ${ignoreId ? 'AND id <> ?' : ''}
      LIMIT 1`,
    ignoreId ? [providerId, endAt, startAt, ignoreId] : [providerId, endAt, startAt]
  );
  return Boolean(row);
}

function inBlockedException(providerId, startAt, endAt) {
  return Boolean(get(
    `SELECT id FROM availability_exceptions
      WHERE provider_id = ? AND exception_type = 'BLOCKED' AND start_at < ? AND end_at > ? LIMIT 1`,
    [providerId, endAt, startAt]
  ));
}

function createSlot({ providerId, serviceType, startAt, endAt, source = 'RULE', status = 'AVAILABLE' }) {
  if (overlapsBooked(providerId, startAt, endAt)) return null;
  if (inBlockedException(providerId, startAt, endAt)) return null;
  const exists = get('SELECT id FROM time_slots WHERE provider_id = ? AND start_at = ?', [providerId, startAt]);
  if (exists) return exists.id;
  const id = uuid();
  run(
    `INSERT INTO time_slots (id, provider_id, service_type, start_at, end_at, status, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, providerId, serviceType, startAt, endAt, status, source, nowIso()]
  );
  return id;
}

function parseMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ensureSlotsForProvider(providerId, days = HORIZON_DAYS, fromDateKey = istDateKey()) {
  const provider = get('SELECT * FROM providers WHERE id = ?', [providerId]);
  if (!provider || !provider.is_active) return 0;
  const rules = all('SELECT * FROM availability_rules WHERE provider_id = ? AND is_active = 1', [providerId]);
  if (!rules.length) return 0;

  const todayKey = istDateKey();
  let created = 0;
  for (let offset = 0; offset < days; offset++) {
    const dateKey = addDaysKey(fromDateKey, offset);
    if (dateKey < todayKey) continue;
    const weekday = weekdayKey(dateKey);
    const dayRules = rules.filter((rule) => rule.weekday === weekday &&
      (!rule.valid_from || rule.valid_from <= dateKey) && (!rule.valid_to || rule.valid_to >= dateKey));
    for (const rule of dayRules) {
      const duration = rule.slot_length_min || 60;
      const step = duration + (provider.slot_buffer_minutes || 0);
      const dayStart = parseMinutes(rule.start_time);
      const dayEnd = parseMinutes(rule.end_time);
      for (let m = dayStart; m + duration <= dayEnd; m += step) {
        const startAt = istToIso(dateKey, minutesToTime(m));
        const endAt = istToIso(dateKey, minutesToTime(m + duration));
        if (new Date(startAt).getTime() < Date.now()) continue;
        const before = get('SELECT id FROM time_slots WHERE provider_id = ? AND start_at = ?', [providerId, startAt]);
        if (before) continue;
        const id = createSlot({ providerId, serviceType: rule.service_type, startAt, endAt, source: 'RULE' });
        if (id) created++;
      }
    }
  }
  // extra hours exceptions
  const extras = all(
    `SELECT * FROM availability_exceptions
      WHERE provider_id = ? AND exception_type = 'EXTRA' AND end_at > ? AND start_at < ?`,
    [providerId, nowIso(), istToIso(addDaysKey(fromDateKey, days), '23:59')]
  );
  for (const extra of extras) {
    const types = providerServiceTypes(provider);
    let cursor = new Date(extra.start_at).getTime();
    const end = new Date(extra.end_at).getTime();
    while (cursor + 60 * 60000 <= end) {
      const startAt = new Date(cursor).toISOString();
      const endAt = new Date(cursor + 60 * 60000).toISOString();
      if (startAt >= nowIso()) {
        const id = createSlot({ providerId, serviceType: types[0], startAt, endAt, source: 'EXCEPTION' });
        if (id) created++;
      }
      cursor += 60 * 60000;
    }
  }
  return created;
}

function ensureAllSlots(days = HORIZON_DAYS) {
  const providers = all('SELECT id FROM providers WHERE is_active = 1');
  let total = 0;
  for (const provider of providers) total += ensureSlotsForProvider(provider.id, days);
  return total;
}

function regenerateFutureSlots(providerId) {
  // Remove future generated slots without a hold, then rebuild from rules.
  run(
    `DELETE FROM time_slots
      WHERE provider_id = ? AND start_at > ? AND status = 'AVAILABLE' AND held_by_booking_id IS NULL`,
    [providerId, nowIso()]
  );
  return ensureSlotsForProvider(providerId, HORIZON_DAYS);
}

function releaseSlot(slotId, onlyTentative = false) {
  if (!slotId) return;
  run(
    `UPDATE time_slots SET status = 'AVAILABLE', held_by_booking_id = NULL, hold_expires_at = NULL
      WHERE id = ? ${onlyTentative ? "AND status = 'TENTATIVE'" : "AND status IN ('TENTATIVE','BOOKED')"}`,
    [slotId]
  );
}

function holdSlot(slotId, bookingId, status = 'TENTATIVE', holdHours = 24) {
  const slot = get('SELECT * FROM time_slots WHERE id = ?', [slotId]);
  if (!slot || slot.status !== 'AVAILABLE') return false;
  const holdExpires = status === 'TENTATIVE' ? new Date(Date.now() + holdHours * 3600000).toISOString() : null;
  run(
    `UPDATE time_slots SET status = ?, held_by_booking_id = ?, hold_expires_at = ? WHERE id = ? AND status = 'AVAILABLE'`,
    [status, bookingId, holdExpires, slotId]
  );
  return true;
}

function expireHolds() {
  const rows = all(
    `SELECT ts.id, ts.held_by_booking_id, b.booking_ref FROM time_slots ts
     LEFT JOIN bookings b ON b.id = ts.held_by_booking_id
     WHERE ts.status = 'TENTATIVE' AND ts.hold_expires_at IS NOT NULL AND ts.hold_expires_at < ?`,
    [nowIso()]
  );
  for (const row of rows) {
    const booking = row.held_by_booking_id ? get('SELECT * FROM bookings WHERE id = ?', [row.held_by_booking_id]) : null;
    run(`UPDATE time_slots SET status = 'AVAILABLE', held_by_booking_id = NULL, hold_expires_at = NULL WHERE id = ?`, [row.id]);
    if (booking) {
      const updated = run(
        `UPDATE bookings SET status = 'EXPIRED', updated_at = ?, cancelled_by = 'SYSTEM', cancel_reason = 'Request expired without confirmation'
          WHERE id = ? AND status IN ('REQUESTED','CONTACTED','RESCHEDULE_REQUESTED')`,
        [nowIso(), booking.id]
      );
      if (updated.changes) {
        run(
          `INSERT INTO booking_status_history (booking_id, from_status, to_status, changed_by_role, reason, created_at)
           VALUES (?, ?, 'EXPIRED', 'SYSTEM', 'Tentative hold expired', ?)`,
          [booking.id, booking.status, nowIso()]
        );
      }
    }
  }
  return rows.length;
}

module.exports = {
  HORIZON_DAYS, ensureSlotsForProvider, ensureAllSlots, regenerateFutureSlots,
  releaseSlot, holdSlot, expireHolds, providerServiceTypes, overlapsBooked, createSlot,
};
