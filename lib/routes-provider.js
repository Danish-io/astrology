'use strict';

const { all, get, run, insert, update, tx, getSetting } = require('./db');
const { str, assert, int, bool } = require('./http');
const { uuid, nowIso, istDateKey, addDaysKey, istToIso, parseJson, fmtTime, STATUS_LABELS, STATUS_TONES } = require('./util');
const { requireProvider } = require('./auth');
const { findBooking, detailFor, bookingSummary } = require('./bookings');
const { notifyInApp } = require('./notify');
const { ensureSlotsForProvider, regenerateFutureSlots, releaseSlot } = require('./slots');
const { confirmBooking, completeBooking, addContactAttempt, primaryProvider } = require('./routes-admin');

function providerFor(ctx) {
  const user = requireProvider(ctx);
  const provider = user.provider || primaryProvider();
  assert(provider, 404, 'No pandit profile is assigned to this account');
  return { user, provider };
}

function ownBooking(ctx) {
  const { user, provider } = providerFor(ctx);
  const booking = findBooking(ctx.params.ref);
  assert(booking, 404, 'Booking not found');
  assert(booking.provider_id === provider.id, 403, 'This booking is not assigned to you');
  return { user, provider, booking };
}

function providerBookingRows(providerId, query = {}) {
  const where = ['b.provider_id = ?'];
  const params = [providerId];
  if (query.status && query.status !== 'ALL') {
    const statuses = String(query.status).split(',').filter((s) => STATUS_LABELS[s]);
    if (statuses.length) { where.push(`b.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  }
  if (query.type && ['PUJA', 'CONSULTATION', 'EVENT'].includes(query.type)) {
    where.push('b.booking_type = ?'); params.push(query.type);
  }
  const rows = all(
    `SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.service_type AS service_type,
       p.display_name AS provider_name, p.slug AS provider_slug, e.title AS event_title, e.slug AS event_slug
     FROM bookings b LEFT JOIN services s ON s.id = b.service_id
     LEFT JOIN providers p ON p.id = b.provider_id LEFT JOIN events e ON e.id = b.event_id
     WHERE ${where.join(' AND ')} ORDER BY b.requested_at DESC`,
    params
  );
  return rows.map((row) => bookingSummary(row));
}

function providerRoutes() {
  const guard = (handler) => async (ctx) => { providerFor(ctx); return handler(ctx); };

  return [
    {
      method: 'GET', path: '/api/provider/dashboard', handler: guard(async (ctx) => {
        const { user, provider } = providerFor(ctx);
        const bookings = providerBookingRows(provider.id);
        const today = istDateKey();
        const todayStart = istToIso(today, '00:00');
        const todayEnd = istToIso(addDaysKey(today, 1), '00:00');
        const todayBookings = all(
          `SELECT b.*, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id
           WHERE b.provider_id = ? AND b.status IN ('CONFIRMED','COMPLETED')
             AND COALESCE(b.confirmed_start_at, b.preferred_start_at) >= ?
             AND COALESCE(b.confirmed_start_at, b.preferred_start_at) < ?
           ORDER BY b.confirmed_start_at`,
          [provider.id, todayStart, todayEnd]
        );
        const upcoming = all(
          `SELECT b.*, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id
           WHERE b.provider_id = ? AND b.status = 'CONFIRMED' AND b.confirmed_start_at >= ?
           ORDER BY b.confirmed_start_at LIMIT 6`,
          [provider.id, nowIso()]
        );
        const weekStart = istToIso(addDaysKey(today, -6), '00:00');
        const weekRows = all(
          'SELECT requested_at FROM bookings WHERE provider_id = ? AND requested_at >= ?',
          [provider.id, weekStart]
        );
        return {
          profile: {
            id: provider.id, name: provider.display_name, headline: provider.headline,
            city: provider.city, rating: provider.average_rating, reviews: provider.review_count,
            active: Boolean(provider.is_active), languages: parseJson(provider.languages, []),
          },
          counts: {
            pending: bookings.filter((b) => ['REQUESTED', 'CONTACTED', 'RESCHEDULE_REQUESTED'].includes(b.status)).length,
            confirmed: bookings.filter((b) => b.status === 'CONFIRMED').length,
            completed: bookings.filter((b) => b.status === 'COMPLETED').length,
            thisWeek: weekRows.length,
          },
          today: todayBookings.map((b) => ({
            ref: b.booking_ref, name: b.customer_name, service: b.service_name || b.booking_type,
            startAt: b.confirmed_start_at || b.preferred_start_at, time: fmtTime(b.confirmed_start_at || b.preferred_start_at),
            status: b.status, mode: b.preferred_contact_channel,
          })),
          upcoming: upcoming.map((b) => ({
            ref: b.booking_ref, name: b.customer_name, service: b.service_name,
            startAt: b.confirmed_start_at, time: fmtTime(b.confirmed_start_at), status: b.status,
          })),
          attention: bookings.filter((b) => ['REQUESTED', 'CONTACTED', 'RESCHEDULE_REQUESTED'].includes(b.status)).slice(0, 8),
          panchang: require('./data').publicPanchang(),
          user: { name: user.full_name },
        };
      }),
    },
    {
      method: 'GET', path: '/api/provider/bookings', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const bookings = providerBookingRows(provider.id, ctx.query);
        return { bookings, total: bookings.length };
      }),
    },
    {
      method: 'GET', path: '/api/provider/bookings/:ref', handler: guard(async (ctx) => {
        const { user, booking } = ownBooking(ctx);
        return detailFor(booking, user);
      }),
    },
    {
      method: 'POST', path: '/api/provider/bookings/:ref/contact', handler: guard(async (ctx) => {
        const { user, booking } = ownBooking(ctx);
        return addContactAttempt(user, booking, ctx.body);
      }),
    },
    {
      method: 'POST', path: '/api/provider/bookings/:ref/confirm', handler: guard(async (ctx) => {
        const { user, booking } = ownBooking(ctx);
        return confirmBooking(user, booking, ctx.body);
      }),
    },
    {
      method: 'POST', path: '/api/provider/bookings/:ref/complete', handler: guard(async (ctx) => {
        const { user, booking } = ownBooking(ctx);
        return completeBooking(user, booking);
      }),
    },
    {
      method: 'POST', path: '/api/provider/bookings/:ref/notes', handler: guard(async (ctx) => {
        const { user, booking } = ownBooking(ctx);
        const note = str(ctx.body.note, { min: 2, max: 2000, field: 'Note', required: true });
        insert('booking_notes', {
          id: uuid(), booking_id: booking.id, author_user_id: user.id, author_name: user.full_name,
          note, is_pinned: bool(ctx.body.pinned) ? 1 : 0, created_at: nowIso(),
        });
        return detailFor(booking, user);
      }),
    },
    {
      method: 'GET', path: '/api/provider/schedule', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const from = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.from || '') ? ctx.query.from : istDateKey();
        const to = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.to || '') ? ctx.query.to : addDaysKey(from, 20);
        const rows = all(
          `SELECT b.*, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id
           WHERE b.provider_id = ? AND b.status IN ('CONFIRMED','COMPLETED','REQUESTED','CONTACTED','RESCHEDULE_REQUESTED')
             AND COALESCE(b.confirmed_start_at, b.preferred_start_at) >= ?
             AND COALESCE(b.confirmed_start_at, b.preferred_start_at) < ?
           ORDER BY COALESCE(b.confirmed_start_at, b.preferred_start_at)`,
          [provider.id, istToIso(from, '00:00'), istToIso(addDaysKey(to, 1), '00:00')]
        );
        const exceptions = all(
          'SELECT * FROM availability_exceptions WHERE provider_id = ? AND end_at > ? ORDER BY start_at',
          [provider.id, nowIso()]
        );
        return {
          from, to,
          bookings: rows.map((b) => ({
            ref: b.booking_ref, name: b.customer_name, service: b.service_name || b.booking_type,
            status: b.status, statusLabel: STATUS_LABELS[b.status], statusTone: STATUS_TONES[b.status],
            startAt: b.confirmed_start_at || b.preferred_start_at, confirmed: Boolean(b.confirmed_start_at),
            type: b.booking_type,
          })),
          exceptions: exceptions.map((e) => ({
            id: e.id, startAt: e.start_at, endAt: e.end_at, type: e.exception_type, reason: e.reason,
          })),
        };
      }),
    },
    {
      method: 'GET', path: '/api/provider/availability', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        ensureSlotsForProvider(provider.id, 30);
        const rules = all('SELECT * FROM availability_rules WHERE provider_id = ? ORDER BY weekday, start_time', [provider.id]);
        const exceptions = all('SELECT * FROM availability_exceptions WHERE provider_id = ? AND end_at >= ? ORDER BY start_at', [provider.id, nowIso()]);
        return {
          rules: rules.map((r) => ({
            id: r.id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time,
            duration: r.slot_length_min, serviceType: r.service_type, active: Boolean(r.is_active),
          })),
          exceptions: exceptions.map((e) => ({
            id: e.id, startAt: e.start_at, endAt: e.end_at, type: e.exception_type, reason: e.reason,
          })),
          profile: {
            minNoticeHours: provider.min_notice_hours, bufferMinutes: provider.slot_buffer_minutes,
            city: provider.city, offersOnline: Boolean(provider.offers_online), offersInPerson: Boolean(provider.offers_in_person),
          },
        };
      }),
    },
    {
      method: 'POST', path: '/api/provider/availability/rules', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const weekday = int(ctx.body.weekday, 0, { min: 0, max: 6, field: 'Weekday' });
        const startTime = str(ctx.body.startTime, { max: 5, field: 'Start time', required: true });
        const endTime = str(ctx.body.endTime, { max: 5, field: 'End time', required: true });
        assert(/^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime), 422, 'Use HH:MM times');
        assert(endTime > startTime, 422, 'End time must be after start time');
        const id = uuid();
        insert('availability_rules', {
          id, provider_id: provider.id, weekday, start_time: startTime, end_time: endTime,
          slot_length_min: int(ctx.body.duration, 60, { min: 15, max: 480 }),
          service_type: ctx.body.serviceType === 'CONSULTATION' ? 'CONSULTATION' : 'PUJA',
          valid_from: null, valid_to: null, is_active: 1,
        });
        return { ok: true, id, message: 'Availability window added.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/provider/availability/rules/:id', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const row = get('SELECT * FROM availability_rules WHERE id = ? AND provider_id = ?', [ctx.params.id, provider.id]);
        assert(row, 404, 'Availability window not found');
        run('DELETE FROM availability_rules WHERE id = ?', [row.id]);
        return { ok: true, message: 'Availability window removed.' };
      }),
    },
    {
      method: 'POST', path: '/api/provider/availability/exceptions', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const start = ctx.body.startAt ? new Date(ctx.body.startAt) : null;
        const end = ctx.body.endAt ? new Date(ctx.body.endAt) : null;
        assert(start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()), 422, 'Choose a valid start and end');
        assert(end > start, 422, 'End must be after start');
        const id = uuid();
        insert('availability_exceptions', {
          id, provider_id: provider.id, start_at: start.toISOString(), end_at: end.toISOString(),
          exception_type: ctx.body.type === 'EXTRA' ? 'EXTRA' : 'BLOCKED',
          reason: str(ctx.body.reason, { max: 200 }) || null, created_at: nowIso(),
        });
        if (ctx.body.type === 'EXTRA') ensureSlotsForProvider(provider.id, 30);
        return { ok: true, id, message: 'Calendar exception added.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/provider/availability/exceptions/:id', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const row = get('SELECT * FROM availability_exceptions WHERE id = ? AND provider_id = ?', [ctx.params.id, provider.id]);
        assert(row, 404, 'Exception not found');
        run('DELETE FROM availability_exceptions WHERE id = ?', [row.id]);
        return { ok: true, message: 'Exception removed.' };
      }),
    },
    {
      method: 'POST', path: '/api/provider/availability/regenerate', handler: guard(async () => {
        const provider = primaryProvider();
        const count = regenerateFutureSlots(provider.id);
        return { ok: true, created: count, message: `Schedule rebuilt — ${count} new slots.` };
      }),
    },
    {
      method: 'GET', path: '/api/provider/profile', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        return {
          profile: {
            id: provider.id, name: provider.display_name, headline: provider.headline, bio: provider.bio,
            experience: provider.years_of_experience, tradition: provider.tradition, city: provider.city,
            languages: parseJson(provider.languages, []), specializations: parseJson(provider.specializations, []),
            offersOnline: Boolean(provider.offers_online), offersInPerson: Boolean(provider.offers_in_person),
            minNoticeHours: provider.min_notice_hours, city: provider.city,
          },
        };
      }),
    },
    {
      method: 'PUT', path: '/api/provider/profile', handler: guard(async (ctx) => {
        const { provider } = providerFor(ctx);
        const b = ctx.body;
        const updates = {};
        if (b.headline !== undefined) updates.headline = str(b.headline, { max: 250 }) || null;
        if (b.bio !== undefined) updates.bio = str(b.bio, { max: 6000 }) || null;
        if (b.city !== undefined) updates.city = str(b.city, { max: 80 }) || null;
        if (b.languages !== undefined) updates.languages = JSON.stringify(Array.isArray(b.languages) ? b.languages : []);
        if (b.specializations !== undefined) updates.specializations = JSON.stringify(Array.isArray(b.specializations) ? b.specializations : []);
        if (b.offersOnline !== undefined) updates.offers_online = bool(b.offersOnline) ? 1 : 0;
        if (b.offersInPerson !== undefined) updates.offers_in_person = bool(b.offersInPerson) ? 1 : 0;
        if (b.minNoticeHours !== undefined) updates.min_notice_hours = int(b.minNoticeHours, provider.min_notice_hours, { min: 1, max: 168 });
        updates.updated_at = nowIso();
        update('providers', provider.id, updates);
        return { ok: true, message: 'Profile updated.' };
      }),
    },
  ];
}

module.exports = { providerRoutes, providerFor };
