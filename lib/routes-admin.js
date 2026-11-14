'use strict';

const { all, get, run, insert, update, tx, getSetting, setSetting, audit } = require('./db');
const { str, assert, HttpError, int, bool, dateKey, isEmail } = require('./http');
const {
  uuid, nowIso, istDateKey, addDaysKey, istToIso, localIstToIso, toCsv,
  STATUS_LABELS, STATUS_TONES, waitingLabel, parseJson, slugify, fmtDate, fmtTime,
} = require('./util');
const { requireStaff, requireOwner, publicUser } = require('./auth');
const {
  findBooking, detailFor, cancelBooking, recordHistory,
  bookingSummary,
} = require('./bookings');
const { notifyInApp, queueStatusNotification, processOutbox } = require('./notify');
const { releaseSlot, holdSlot, regenerateFutureSlots, ensureSlotsForProvider } = require('./slots');
const { profileOut, addressOut } = require('./routes-account');

function primaryProvider() {
  const slug = getSetting('site.primary_provider_slug', 'pandit-ramesh-sharma');
  return get('SELECT * FROM providers WHERE slug = ?', [slug]);
}

function pageParams(query) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit || 20) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function dateRange(query, defaultDays = 30) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : addDaysKey(istDateKey(), defaultDays);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : addDaysKey(istDateKey(), 0);
  return { from, to, start: istToIso(from, '00:00'), end: istToIso(addDaysKey(to, 1), '00:00') };
}

function bookingListQuery(where, params, query) {
  const { page, limit, offset } = pageParams(query);
  const rows = all(
    `SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.service_type AS service_type,
       p.display_name AS provider_name, p.slug AS provider_slug,
       e.title AS event_title, e.slug AS event_slug, e.start_at AS event_start_at, e.end_at AS event_end_at
     FROM bookings b
     LEFT JOIN services s ON s.id = b.service_id
     LEFT JOIN providers p ON p.id = b.provider_id
     LEFT JOIN events e ON e.id = b.event_id
     WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
     ORDER BY CASE WHEN b.status IN ('REQUESTED','CONTACTED','RESCHEDULE_REQUESTED') THEN 0 ELSE 1 END,
              b.requested_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = get(
    `SELECT COUNT(*) AS n FROM bookings b
     LEFT JOIN services s ON s.id = b.service_id
     LEFT JOIN providers p ON p.id = b.provider_id
     WHERE ${where.length ? where.join(' AND ') : '1 = 1'}`,
    params
  )?.n || 0;
  return {
    bookings: rows.map((row) => ({
      ...bookingSummary(row),
      waiting: waitingLabel(row.requested_at),
      serviceType: row.service_type,
      createdAt: row.created_at,
    })),
    page, limit, total, pages: Math.max(1, Math.ceil(total / limit)),
  };
}

function inbox(ctx) {
  requireStaff(ctx);
  const where = [];
  const params = [];
  if (ctx.query.status && ctx.query.status !== 'ALL') {
    const statuses = String(ctx.query.status).split(',').filter((s) => STATUS_LABELS[s]);
    if (statuses.length) {
      where.push(`b.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (ctx.query.type && ['PUJA', 'CONSULTATION', 'EVENT'].includes(ctx.query.type)) {
    where.push('b.booking_type = ?'); params.push(ctx.query.type);
  }
  if (ctx.query.q) {
    const q = `%${str(ctx.query.q, { max: 100 })}%`;
    where.push('(b.customer_name LIKE ? OR b.customer_phone LIKE ? OR b.booking_ref LIKE ? OR s.name LIKE ?)');
    params.push(q, q, q, q);
  }
  if (ctx.query.from && /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.from)) {
    where.push('b.requested_at >= ?'); params.push(istToIso(ctx.query.from, '00:00'));
  }
  if (ctx.query.to && /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.to)) {
    where.push('b.requested_at < ?'); params.push(istToIso(addDaysKey(ctx.query.to, 1), '00:00'));
  }
  const result = bookingListQuery(where, params, ctx.query);
  const counts = {};
  for (const row of all('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status')) counts[row.status] = row.n;
  return { ...result, counts };
}

function bookingOr404(ref) {
  const booking = findBooking(ref);
  assert(booking, 404, 'Booking not found');
  return booking;
}

function staffName(user) {
  return user.full_name || 'Aradhana team';
}

function confirmBooking(user, booking, body = {}) {
  let slot = booking.time_slot_id ? get('SELECT * FROM time_slots WHERE id = ?', [booking.time_slot_id]) : null;
  let startAt = body.confirmedStartAt || booking.confirmed_start_at || booking.preferred_start_at;
  let endAt = body.confirmedEndAt || null;
  if (body.timeSlotId) {
    const chosen = get('SELECT * FROM time_slots WHERE id = ?', [body.timeSlotId]);
    assert(chosen, 404, 'That time slot was not found');
    assert(chosen.status === 'AVAILABLE' || chosen.held_by_booking_id === booking.id, 409, 'That time is no longer available');
    if (booking.time_slot_id && booking.time_slot_id !== chosen.id) releaseSlot(booking.time_slot_id);
    slot = chosen;
    startAt = chosen.start_at;
    endAt = chosen.end_at;
  }
  assert(startAt && !Number.isNaN(new Date(startAt).getTime()), 422, 'Choose a date and time to confirm');
  const service = booking.service_id ? get('SELECT * FROM services WHERE id = ?', [booking.service_id]) : null;
  if (!endAt) endAt = new Date(new Date(startAt).getTime() + ((service?.default_duration_min || 60) * 60000)).toISOString();
  const status = booking.status;
  assert(['REQUESTED', 'CONTACTED', 'RESCHEDULE_REQUESTED'].includes(status), 409, 'This booking cannot be confirmed in its current state');
  tx(() => {
    if (slot && slot.held_by_booking_id !== booking.id) {
      if (slot.status !== 'AVAILABLE') throw new HttpError(409, 'That time is no longer available');
      run(`UPDATE time_slots SET status = 'BOOKED', held_by_booking_id = ?, hold_expires_at = NULL WHERE id = ?`, [booking.id, slot.id]);
    } else if (slot) {
      run(`UPDATE time_slots SET status = 'BOOKED', held_by_booking_id = ?, hold_expires_at = NULL WHERE id = ?`, [booking.id, slot.id]);
    }
    run(
      `UPDATE bookings SET status = 'CONFIRMED', time_slot_id = ?, confirmed_start_at = ?, confirmed_end_at = ?,
         confirmed_at = ?, first_contacted_at = COALESCE(first_contacted_at, ?), meeting_link = COALESCE(?, meeting_link),
         updated_at = ? WHERE id = ?`,
      [slot?.id || booking.time_slot_id || null, startAt, endAt, nowIso(), nowIso(), body.meetingLink || null, nowIso(), booking.id]
    );
    recordHistory(booking.id, status, 'CONFIRMED', 'STAFF', body.reason || 'Confirmed after a call with the customer', user.id);
  });
  const fresh = get('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  queueStatusNotification(fresh, 'CUSTOMER_BOOKING_CONFIRMED', { service_name: service?.name });
  if (fresh.customer_id) {
    notifyInApp(fresh.customer_id, 'Your booking is confirmed',
      `${service?.name || 'Your booking'} is confirmed for ${fmtDate(startAt, 'date')} at ${fmtTime(startAt)}.`,
      `#/my/bookings/${fresh.booking_ref}`);
  }
  return detailFor(fresh, user);
}

function rejectBooking(user, booking, reason) {
  const status = booking.status;
  assert(['REQUESTED', 'CONTACTED'].includes(status), 409, 'This booking cannot be declined in its current state');
  const clean = str(reason, { max: 400, field: 'Reason' }) || 'We could not accommodate this request';
  tx(() => {
    releaseSlot(booking.time_slot_id);
    run(`UPDATE bookings SET status = 'REJECTED', cancelled_at = ?, cancel_reason = ?, cancelled_by = 'STAFF', updated_at = ? WHERE id = ?`,
      [nowIso(), clean, nowIso(), booking.id]);
    recordHistory(booking.id, status, 'REJECTED', 'STAFF', clean, user.id);
  });
  const fresh = get('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  const service = booking.service_id ? get('SELECT name FROM services WHERE id = ?', [booking.service_id]) : null;
  queueStatusNotification(fresh, 'CUSTOMER_BOOKING_REJECTED', { service_name: service?.name, reason: clean });
  if (fresh.customer_id) {
    notifyInApp(fresh.customer_id, 'About your request', `${fresh.booking_ref}: ${clean}`, `#/my/bookings/${fresh.booking_ref}`);
  }
  return detailFor(fresh, user);
}

function completeBooking(user, booking) {
  assert(booking.status === 'CONFIRMED', 409, 'Only a confirmed booking can be completed');
  tx(() => {
    run(`UPDATE bookings SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ?`, [nowIso(), nowIso(), booking.id]);
    if (booking.time_slot_id) run(`UPDATE time_slots SET status = 'BOOKED' WHERE id = ?`, [booking.time_slot_id]);
    recordHistory(booking.id, 'CONFIRMED', 'COMPLETED', 'STAFF', 'Service completed', user.id);
  });
  const fresh = get('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  const service = booking.service_id ? get('SELECT name FROM services WHERE id = ?', [booking.service_id]) : null;
  queueStatusNotification(fresh, 'REVIEW_REQUEST', { service_name: service?.name });
  if (fresh.customer_id) {
    notifyInApp(fresh.customer_id, 'How was your experience?',
      `We would love to hear how your ${service?.name || 'ceremony'} went. You can leave a review from My Bookings.`,
      `#/my/bookings/${fresh.booking_ref}`);
  }
  return detailFor(fresh, user);
}

function addContactAttempt(user, booking, body) {
  const channel = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL'].includes(body.channel) ? body.channel : 'CALL';
  const outcome = ['REACHED', 'NO_ANSWER', 'RESCHEDULED', 'NOT_INTERESTED', 'WRONG_NUMBER'].includes(body.outcome) ? body.outcome : 'REACHED';
  const summary = str(body.summary, { max: 1000, field: 'Summary' });
  const follow = body.nextFollowUpAt ? new Date(body.nextFollowUpAt).toISOString() : null;
  const agreed = body.agreedStartAt ? new Date(body.agreedStartAt).toISOString() : null;
  tx(() => {
    insert('booking_contact_attempts', {
      id: uuid(), booking_id: booking.id, staff_user_id: user.id, staff_name: staffName(user),
      channel, outcome, summary: summary || null, next_follow_up_at: follow, agreed_start_at: agreed, created_at: nowIso(),
    });
    if (booking.status === 'REQUESTED' && outcome === 'REACHED') {
      run('UPDATE bookings SET status = ?, first_contacted_at = ?, updated_at = ? WHERE id = ?', ['CONTACTED', nowIso(), nowIso(), booking.id]);
      recordHistory(booking.id, 'REQUESTED', 'CONTACTED', 'STAFF', summary || 'Spoke with the customer', user.id);
    }
  });
  return detailFor(get('SELECT * FROM bookings WHERE id = ?', [booking.id]), user);
}

function decideReschedule(user, booking, body) {
  const pending = get('SELECT * FROM booking_reschedules WHERE booking_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1', [booking.id, 'PENDING']);
  assert(pending, 404, 'There is no pending reschedule request');
  const decision = body.decision === 'APPROVE' ? 'APPROVE' : 'REJECT';
  tx(() => {
    if (decision === 'APPROVE') {
      if (pending.old_slot_id && pending.old_slot_id !== pending.new_slot_id) releaseSlot(pending.old_slot_id);
      if (pending.new_slot_id && pending.new_slot_id !== pending.old_slot_id) {
        const fresh = get('SELECT * FROM time_slots WHERE id = ?', [pending.new_slot_id]);
        if (fresh && fresh.status !== 'BOOKED') {
          run(`UPDATE time_slots SET status = 'BOOKED', held_by_booking_id = ?, hold_expires_at = NULL WHERE id = ?`, [booking.id, pending.new_slot_id]);
        }
      }
      run(`UPDATE bookings SET status = 'CONFIRMED', time_slot_id = ?, confirmed_start_at = ?, confirmed_end_at = ?, updated_at = ? WHERE id = ?`,
        [pending.new_slot_id || booking.time_slot_id, pending.new_start_at,
          new Date(new Date(pending.new_start_at).getTime() + 60 * 60000).toISOString(), nowIso(), booking.id]);
      run(`UPDATE booking_reschedules SET status = 'APPROVED', decided_by = ?, decided_at = ? WHERE id = ?`, [user.id, nowIso(), pending.id]);
      recordHistory(booking.id, booking.status, 'CONFIRMED', 'STAFF', 'Reschedule approved', user.id);
    } else {
      if (pending.new_slot_id && pending.new_slot_id !== pending.old_slot_id) releaseSlot(pending.new_slot_id, true);
      run(`UPDATE bookings SET status = 'CONFIRMED', updated_at = ? WHERE id = ?`, [nowIso(), booking.id]);
      run(`UPDATE booking_reschedules SET status = 'REJECTED', decided_by = ?, decided_at = ? WHERE id = ?`, [user.id, nowIso(), pending.id]);
      recordHistory(booking.id, booking.status, 'CONFIRMED', 'STAFF', 'Reschedule declined; original time retained', user.id);
    }
  });
  const fresh = get('SELECT * FROM bookings WHERE id = ?', [booking.id]);
  if (fresh.customer_id) {
    notifyInApp(fresh.customer_id, decision === 'APPROVE' ? 'New time confirmed' : 'Original time retained',
      decision === 'APPROVE'
        ? `Your new time for ${fresh.booking_ref} is confirmed.`
        : `We could not move ${fresh.booking_ref}; your original time still stands.`,
      `#/my/bookings/${fresh.booking_ref}`);
  }
  return detailFor(fresh, user);
}

function settingsPayload() {
  const rows = all('SELECT * FROM app_settings ORDER BY key');
  return rows.map((row) => ({
    key: row.key, value: parseJson(row.value, row.value), description: row.description,
    updatedAt: row.updated_at,
  }));
}

function adminRoutes() {
  const staff = (handler) => async (ctx) => { requireStaff(ctx); return handler(ctx); };
  const owner = (handler) => async (ctx) => { requireOwner(ctx); return handler(ctx); };

  return [
    {
      method: 'GET', path: '/api/admin/dashboard', handler: staff(async (ctx) => {
        const today = istDateKey();
        const dayStart = istToIso(today, '00:00');
        const dayEnd = istToIso(addDaysKey(today, 1), '00:00');
        const pending = get("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('REQUESTED','CONTACTED','RESCHEDULE_REQUESTED')")?.n || 0;
        const todayBookings = get('SELECT COUNT(*) AS n FROM bookings WHERE preferred_start_at >= ? AND preferred_start_at < ? AND status NOT IN (?, ?)', [dayStart, dayEnd, 'CANCELLED', 'REJECTED'])?.n || 0;
        const confirmed = get("SELECT COUNT(*) AS n FROM bookings WHERE status = 'CONFIRMED' AND confirmed_start_at >= ?", [nowIso()])?.n || 0;
        const completed = get("SELECT COUNT(*) AS n FROM bookings WHERE status = 'COMPLETED'")?.n || 0;
        const monthStart = `${today.slice(0, 7)}-01`;
        const revenue = get('SELECT COALESCE(SUM(received_amount), 0) AS n FROM offline_payment_records WHERE received_on >= ?', [monthStart])?.n || 0;
        const recent = all(
          `SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.service_type AS service_type,
             p.display_name AS provider_name, p.slug AS provider_slug, e.title AS event_title, e.slug AS event_slug
           FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN providers p ON p.id = b.provider_id
           LEFT JOIN events e ON e.id = b.event_id ORDER BY b.requested_at DESC LIMIT 6`
        ).map((row) => ({ ...bookingSummary(row), waiting: waitingLabel(row.requested_at) }));
        const attention = all(
          `SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.service_type AS service_type,
             p.display_name AS provider_name, p.slug AS provider_slug
           FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN providers p ON p.id = b.provider_id
           WHERE b.status IN ('REQUESTED','CONTACTED','RESCHEDULE_REQUESTED') ORDER BY b.requested_at ASC LIMIT 8`
        ).map((row) => ({ ...bookingSummary(row), waiting: waitingLabel(row.requested_at) }));
        const trend = [];
        for (let i = 6; i >= 0; i--) {
          const key = addDaysKey(today, -i);
          const start = istToIso(key, '00:00');
          const end = istToIso(addDaysKey(key, 1), '00:00');
          trend.push({
            date: key,
            label: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${key}T12:00:00+05:30`)),
            count: get('SELECT COUNT(*) AS n FROM bookings WHERE requested_at >= ? AND requested_at < ?', [start, end])?.n || 0,
          });
        }
        const topServices = all(
          `SELECT s.name, s.slug, s.service_type, COUNT(b.id) AS n FROM services s
           LEFT JOIN bookings b ON b.service_id = s.id AND b.status <> 'CANCELLED'
           WHERE s.is_active = 1 GROUP BY s.id ORDER BY n DESC, s.is_featured DESC LIMIT 5`
        );
        const upcomingEvents = all(
          `SELECT e.*, (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','CONFIRMED')) AS registrations
           FROM events e WHERE e.status = 'PUBLISHED' AND e.end_at > ? ORDER BY e.start_at LIMIT 3`, [nowIso()]
        );
        return {
          user: publicUser(ctx.user),
          stats: {
            pending, todayBookings, confirmed, completed, revenue,
            enquiries: get("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'NEW'")?.n || 0,
            customers: get("SELECT COUNT(*) AS n FROM users WHERE role = 'CUSTOMER' AND deleted_at IS NULL")?.n || 0,
          },
          recent, attention, trend, topServices,
          upcomingEvents: upcomingEvents.map((e) => ({
            id: e.id, title: e.title, slug: e.slug, startAt: e.start_at, endAt: e.end_at,
            venue: e.venue_name, seatsTaken: e.seats_taken, capacity: e.capacity, registrations: e.registrations,
          })),
          panchang: require('./data').publicPanchang(),
        };
      }),
    },
    {
      method: 'GET', path: '/api/admin/inbox', handler: staff(async (ctx) => inbox(ctx)),
    },
    {
      method: 'GET', path: '/api/admin/bookings/:ref', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        return detailFor(booking, ctx.user);
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/contact', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const result = addContactAttempt(ctx.user, booking, ctx.body);
        audit(ctx, 'BOOKING_CONTACT_LOGGED', 'booking', booking.id, null, { outcome: ctx.body.outcome });
        return result;
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/confirm', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const result = confirmBooking(ctx.user, booking, ctx.body);
        audit(ctx, 'BOOKING_CONFIRMED', 'booking', booking.id, null, { startAt: result.booking.confirmedStartAt });
        return result;
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/reject', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const result = rejectBooking(ctx.user, booking, ctx.body.reason);
        audit(ctx, 'BOOKING_REJECTED', 'booking', booking.id, null, { reason: ctx.body.reason });
        return result;
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/complete', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const result = completeBooking(ctx.user, booking);
        audit(ctx, 'BOOKING_COMPLETED', 'booking', booking.id);
        return result;
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/no-show', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        assert(booking.status === 'CONFIRMED', 409, 'Only a confirmed booking can be marked no-show');
        tx(() => {
          releaseSlot(booking.time_slot_id);
          run(`UPDATE bookings SET status = 'NO_SHOW', updated_at = ? WHERE id = ?`, [nowIso(), booking.id]);
          recordHistory(booking.id, 'CONFIRMED', 'NO_SHOW', 'STAFF', str(ctx.body.reason, { max: 300 }) || 'Customer did not attend', ctx.user.id);
        });
        audit(ctx, 'BOOKING_NO_SHOW', 'booking', booking.id);
        return detailFor(get('SELECT * FROM bookings WHERE id = ?', [booking.id]), ctx.user);
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/cancel', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const result = cancelBooking(ctx.user, booking, ctx.body.reason || 'Cancelled by the Aradhana team', 'STAFF');
        audit(ctx, 'BOOKING_CANCELLED_BY_STAFF', 'booking', booking.id, null, { reason: ctx.body.reason });
        return result;
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/reschedule/decide', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const result = decideReschedule(ctx.user, booking, ctx.body);
        audit(ctx, 'BOOKING_RESCHEDULE_DECIDED', 'booking', booking.id, null, { decision: ctx.body.decision });
        return result;
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/notes', handler: staff(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const note = str(ctx.body.note, { min: 2, max: 2000, field: 'Note', required: true });
        insert('booking_notes', {
          id: uuid(), booking_id: booking.id, author_user_id: ctx.user.id, author_name: staffName(ctx.user),
          note, is_pinned: bool(ctx.body.pinned) ? 1 : 0, created_at: nowIso(),
        });
        audit(ctx, 'BOOKING_NOTE_ADDED', 'booking', booking.id);
        return detailFor(booking, ctx.user);
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/notes/:id', handler: staff(async (ctx) => {
        const note = get('SELECT * FROM booking_notes WHERE id = ?', [ctx.params.id]);
        assert(note, 404, 'Note not found');
        run('DELETE FROM booking_notes WHERE id = ?', [note.id]);
        return { ok: true };
      }),
    },
    {
      method: 'POST', path: '/api/admin/bookings/:ref/payments', handler: owner(async (ctx) => {
        const booking = bookingOr404(ctx.params.ref);
        const agreed = Number(ctx.body.agreedAmount || 0);
        const received = Number(ctx.body.receivedAmount || 0);
        assert(agreed >= 0 && received >= 0, 422, 'Amounts cannot be negative');
        const id = uuid();
        tx(() => {
          insert('offline_payment_records', {
            id, booking_id: booking.id, agreed_amount: agreed || null, currency: 'INR',
            mode: ['UPI', 'CASH', 'BANK_TRANSFER', 'OTHER'].includes(ctx.body.mode) ? ctx.body.mode : 'UPI',
            received_amount: received, received_on: received ? (ctx.body.receivedOn || istDateKey()) : null,
            reference_note: str(ctx.body.referenceNote, { max: 150 }) || null,
            recorded_by: ctx.user.id, remarks: str(ctx.body.remarks, { max: 500 }) || null,
            created_at: nowIso(),
          });
          const state = received <= 0 ? 'NOT_DISCUSSED' : (agreed && received < agreed ? 'PARTIAL' : 'RECEIVED');
          run('UPDATE bookings SET payment_state = ?, updated_at = ? WHERE id = ?', [state, nowIso(), booking.id]);
        });
        audit(ctx, 'OFFLINE_PAYMENT_RECORDED', 'booking', booking.id, null, { agreed, received });
        return detailFor(booking, ctx.user);
      }),
    },
    {
      method: 'GET', path: '/api/admin/calendar', handler: staff(async (ctx) => {
        const range = dateRange(ctx.query, 30);
        const rows = all(
          `SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.service_type AS service_type,
             p.display_name AS provider_name, p.slug AS provider_slug, e.title AS event_title
           FROM bookings b LEFT JOIN services s ON s.id = b.service_id LEFT JOIN providers p ON p.id = b.provider_id
           LEFT JOIN events e ON e.id = b.event_id
           WHERE b.status NOT IN ('CANCELLED','REJECTED','EXPIRED')
             AND COALESCE(b.confirmed_start_at, b.preferred_start_at) >= ?
             AND COALESCE(b.confirmed_start_at, b.preferred_start_at) < ?
           ORDER BY COALESCE(b.confirmed_start_at, b.preferred_start_at)`,
          [range.start, range.end]
        );
        const exceptions = all(
          'SELECT * FROM availability_exceptions WHERE end_at > ? AND start_at < ? ORDER BY start_at',
          [range.start, range.end]
        );
        return {
          ...range,
          bookings: rows.map((row) => ({
            id: row.id, ref: row.booking_ref, status: row.status, statusLabel: STATUS_LABELS[row.status],
            statusTone: STATUS_TONES[row.status], type: row.booking_type,
            customerName: row.customer_name, service: row.service_name || row.event_title,
            startAt: row.confirmed_start_at || row.preferred_start_at, endAt: row.confirmed_end_at,
            confirmed: Boolean(row.confirmed_start_at), timeLabel: fmtTime(row.confirmed_start_at || row.preferred_start_at),
            date: String(row.confirmed_start_at || row.preferred_start_at).slice(0, 10),
          })),
          exceptions: exceptions.map((e) => ({ id: e.id, startAt: e.start_at, endAt: e.end_at, type: e.exception_type, reason: e.reason })),
        };
      }),
    },
    {
      method: 'GET', path: '/api/admin/availability', handler: staff(async () => {
        const provider = primaryProvider();
        assert(provider, 404, 'Primary pandit profile not configured');
        ensureSlotsForProvider(provider.id, 30);
        const rules = all('SELECT * FROM availability_rules WHERE provider_id = ? ORDER BY weekday, start_time', [provider.id]);
        const exceptions = all('SELECT * FROM availability_exceptions WHERE provider_id = ? AND end_at >= ? ORDER BY start_at', [provider.id, nowIso()]);
        const days = [];
        for (let i = 0; i < 21; i++) {
          const key = addDaysKey(istDateKey(), i);
          const slots = all(
            `SELECT status, COUNT(*) AS n FROM time_slots WHERE provider_id = ? AND substr(start_at, 1, 10) = ? GROUP BY status`,
            [provider.id, key]
          );
          const counts = Object.fromEntries(slots.map((s) => [s.status, s.n]));
          days.push({ date: key, available: counts.AVAILABLE || 0, booked: (counts.BOOKED || 0) + (counts.TENTATIVE || 0) });
        }
        return {
          provider: {
            id: provider.id, name: provider.display_name, city: provider.city,
            minNoticeHours: provider.min_notice_hours, bufferMinutes: provider.slot_buffer_minutes,
            offersOnline: Boolean(provider.offers_online), offersInPerson: Boolean(provider.offers_in_person),
          },
          rules: rules.map((r) => ({
            id: r.id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time,
            duration: r.slot_length_min, serviceType: r.service_type, active: Boolean(r.is_active),
          })),
          exceptions: exceptions.map((e) => ({
            id: e.id, startAt: e.start_at, endAt: e.end_at, type: e.exception_type, reason: e.reason,
          })),
          days,
        };
      }),
    },
    {
      method: 'POST', path: '/api/admin/availability/rules', handler: staff(async (ctx) => {
        const provider = primaryProvider();
        const weekday = int(ctx.body.weekday, 0, { min: 0, max: 6, field: 'Weekday' });
        const startTime = str(ctx.body.startTime, { max: 5, field: 'Start time', required: true });
        const endTime = str(ctx.body.endTime, { max: 5, field: 'End time', required: true });
        assert(/^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime), 422, 'Use HH:MM times');
        assert(endTime > startTime, 422, 'End time must be after start time');
        const id = uuid();
        insert('availability_rules', {
          id, provider_id: provider.id, weekday,
          start_time: startTime, end_time: endTime,
          slot_length_min: int(ctx.body.duration, 60, { min: 15, max: 480, field: 'Slot length' }),
          service_type: ctx.body.serviceType === 'CONSULTATION' ? 'CONSULTATION' : 'PUJA',
          valid_from: null, valid_to: null, is_active: 1,
        });
        audit(ctx, 'AVAILABILITY_RULE_CREATED', 'availability_rule', id, null, ctx.body);
        return { ok: true, id, message: 'Availability window added. Slots will appear within a few seconds.' };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/availability/rules/:id', handler: staff(async (ctx) => {
        const rule = get('SELECT * FROM availability_rules WHERE id = ?', [ctx.params.id]);
        assert(rule, 404, 'Availability rule not found');
        update('availability_rules', rule.id, {
          is_active: bool(ctx.body.active) ? 1 : 0,
        });
        return { ok: true, message: 'Availability window updated.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/availability/rules/:id', handler: staff(async (ctx) => {
        const rule = get('SELECT * FROM availability_rules WHERE id = ?', [ctx.params.id]);
        assert(rule, 404, 'Availability rule not found');
        run('DELETE FROM availability_rules WHERE id = ?', [rule.id]);
        return { ok: true, message: 'Availability window removed.' };
      }),
    },
    {
      method: 'POST', path: '/api/admin/availability/exceptions', handler: staff(async (ctx) => {
        const provider = primaryProvider();
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
      method: 'DELETE', path: '/api/admin/availability/exceptions/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM availability_exceptions WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Exception not found');
        run('DELETE FROM availability_exceptions WHERE id = ?', [row.id]);
        return { ok: true, message: 'Exception removed.' };
      }),
    },
    {
      method: 'POST', path: '/api/admin/availability/regenerate', handler: staff(async (ctx) => {
        const provider = primaryProvider();
        const count = regenerateFutureSlots(provider.id);
        return { ok: true, created: count, message: `Availability rebuilt — ${count} new slots.` };
      }),
    },
    {
      method: 'GET', path: '/api/admin/services', handler: staff(async () => {
        const categories = all('SELECT * FROM service_categories ORDER BY display_order');
        const services = all(
          `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
             (SELECT COUNT(*) FROM bookings b WHERE b.service_id = s.id) AS booking_count,
             (SELECT COUNT(*) FROM provider_services ps WHERE ps.service_id = s.id AND ps.is_active = 1) AS provider_count
           FROM services s LEFT JOIN service_categories c ON c.id = s.category_id ORDER BY s.display_order`
        ).map((s) => ({
          id: s.id, name: s.name, slug: s.slug, type: s.service_type,
          categoryId: s.category_id, category: s.category_name, categorySlug: s.category_slug,
          shortDescription: s.short_description, description: s.description, benefits: s.benefits,
          duration: s.default_duration_min, priceText: s.indicative_price_text,
          locations: parseJson(s.allowed_locations, []), modes: parseJson(s.allowed_consult_modes, []),
          featured: Boolean(s.is_featured), active: Boolean(s.is_active), bookings: s.booking_count,
          providers: s.provider_count, requiresBirthDetails: Boolean(s.requires_birth_details),
          preparationNotes: s.preparation_notes, image: s.image_url,
        }));
        return { services, categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, type: c.service_type, icon: c.icon })) };
      }),
    },
    {
      method: 'POST', path: '/api/admin/services', handler: staff(async (ctx) => {
        const body = ctx.body;
        const name = str(body.name, { min: 2, max: 150, field: 'Name', required: true });
        const type = body.type === 'CONSULTATION' ? 'CONSULTATION' : 'PUJA';
        const slug = slugify(body.slug || name);
        assert(slug, 422, 'Enter a valid service name');
        assert(!get('SELECT id FROM services WHERE slug = ?', [slug]), 409, 'A service with that name already exists');
        const provider = primaryProvider();
        const id = uuid();
        tx(() => {
          insert('services', {
            id, category_id: body.categoryId || null, service_type: type, name, slug,
            short_description: str(body.shortDescription, { max: 250 }) || null,
            description: str(body.description, { max: 8000 }) || null,
            benefits: str(body.benefits, { max: 3000 }) || null,
            default_duration_min: int(body.duration, 60, { min: 15, max: 480, field: 'Duration' }),
            min_participants: 1, max_participants: int(body.maxParticipants, 50, { min: 1, max: 500 }),
            indicative_price_text: str(body.priceText, { max: 120 }) || 'Discussed after request',
            allowed_locations: JSON.stringify(Array.isArray(body.locations) ? body.locations : []),
            allowed_consult_modes: JSON.stringify(Array.isArray(body.modes) ? body.modes : []),
            requires_birth_details: body.requiresBirthDetails ? 1 : 0,
            requires_address: body.requiresAddress ? 1 : 0,
            preparation_notes: str(body.preparationNotes, { max: 2000 }) || null,
            image_url: str(body.image, { max: 60 }) || 'diya',
            is_featured: body.featured ? 1 : 0, is_active: body.active === false ? 0 : 1,
            display_order: int(body.displayOrder, 99, { min: 0, max: 999 }),
            created_at: nowIso(), updated_at: nowIso(),
          });
          if (provider) insert('provider_services', { provider_id: provider.id, service_id: id, custom_duration_min: null, is_active: 1 });
        });
        audit(ctx, 'SERVICE_CREATED', 'service', id, null, { name });
        return { ok: true, id, message: 'Service created.' };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/services/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM services WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Service not found');
        const body = ctx.body;
        const updates = {};
        if (body.name !== undefined) updates.name = str(body.name, { min: 2, max: 150, field: 'Name', required: true });
        if (body.shortDescription !== undefined) updates.short_description = str(body.shortDescription, { max: 250 }) || null;
        if (body.description !== undefined) updates.description = str(body.description, { max: 8000 }) || null;
        if (body.benefits !== undefined) updates.benefits = str(body.benefits, { max: 3000 }) || null;
        if (body.duration !== undefined) updates.default_duration_min = int(body.duration, row.default_duration_min, { min: 15, max: 480 });
        if (body.priceText !== undefined) updates.indicative_price_text = str(body.priceText, { max: 120 }) || 'Discussed after request';
        if (body.featured !== undefined) updates.is_featured = bool(body.featured) ? 1 : 0;
        if (body.active !== undefined) updates.is_active = bool(body.active) ? 1 : 0;
        if (body.categoryId !== undefined) updates.category_id = body.categoryId || null;
        if (body.locations !== undefined) updates.allowed_locations = JSON.stringify(Array.isArray(body.locations) ? body.locations : []);
        if (body.modes !== undefined) updates.allowed_consult_modes = JSON.stringify(Array.isArray(body.modes) ? body.modes : []);
        if (body.preparationNotes !== undefined) updates.preparation_notes = str(body.preparationNotes, { max: 2000 }) || null;
        updates.updated_at = nowIso();
        update('services', row.id, updates);
        audit(ctx, 'SERVICE_UPDATED', 'service', row.id, null, Object.keys(updates));
        return { ok: true, message: 'Service updated.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/services/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM services WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Service not found');
        const used = get('SELECT COUNT(*) AS n FROM bookings WHERE service_id = ?', [row.id])?.n || 0;
        if (used) {
          run('UPDATE services SET is_active = 0, updated_at = ? WHERE id = ?', [nowIso(), row.id]);
          return { ok: true, message: 'This service has past bookings, so it was archived instead of deleted.' };
        }
        run('DELETE FROM services WHERE id = ?', [row.id]);
        return { ok: true, message: 'Service deleted.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/events', handler: staff(async () => {
        const events = all(
          `SELECT e.*, p.display_name AS lead_name, s.name AS service_name,
             (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','CONFIRMED')) AS registrations,
             (SELECT COALESCE(SUM(r.seats), 0) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('REGISTERED','CONFIRMED')) AS seats_registered,
             (SELECT COUNT(*) FROM event_waitlist w WHERE w.event_id = e.id) AS waitlist
           FROM events e LEFT JOIN providers p ON p.id = e.lead_provider_id LEFT JOIN services s ON s.id = e.service_id
           ORDER BY e.start_at DESC`
        );
        return {
          events: events.map((e) => ({
            id: e.id, title: e.title, slug: e.slug, kind: e.event_kind, description: e.description,
            venue: e.venue_name, venueAddress: parseJson(e.venue_address, {}).text || '',
            online: Boolean(e.is_online_available), startAt: e.start_at, endAt: e.end_at,
            capacity: e.capacity, seatsTaken: e.seats_taken, seatsRegistered: e.seats_registered,
            registrations: e.registrations, waitlist: e.waitlist, status: e.status,
            featured: Boolean(e.is_featured), registrationClosesAt: e.registration_closes_at,
            lead: e.lead_name, service: e.service_name, instructions: e.instructions,
            dressCode: e.dress_code, contributionText: e.indicative_contribution_text,
          })),
        };
      }),
    },
    {
      method: 'POST', path: '/api/admin/events', handler: staff(async (ctx) => {
        const body = ctx.body;
        const title = str(body.title, { min: 3, max: 180, field: 'Title', required: true });
        const slug = slugify(body.slug || title);
        assert(!get('SELECT id FROM events WHERE slug = ?', [slug]), 409, 'An event with that title already exists');
        const start = new Date(body.startAt);
        const end = new Date(body.endAt || new Date(start.getTime() + 3 * 3600000));
        assert(!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()), 422, 'Enter a valid start and end');
        assert(end > start, 422, 'End must be after start');
        const provider = primaryProvider();
        const id = uuid();
        insert('events', {
          id, service_id: body.serviceId || null, title, slug,
          event_kind: ['HOMAM', 'GROUP_PUJA', 'FESTIVAL', 'SATSANG', 'WORKSHOP'].includes(body.kind) ? body.kind : 'HOMAM',
          description: str(body.description, { max: 5000 }) || null,
          rituals_included: str(body.rituals, { max: 2000 }) || null, banner_url: null,
          venue_name: str(body.venue, { max: 200 }) || 'To be announced',
          venue_address: JSON.stringify({ text: str(body.venueAddress, { max: 300 }) || '' }),
          map_url: body.venueAddress ? `https://maps.google.com/?q=${encodeURIComponent(body.venueAddress)}` : null,
          is_online_available: body.online ? 1 : 0, stream_url: body.online ? 'https://meet.aradhana.in/live' : null,
          start_at: start.toISOString(), end_at: end.toISOString(),
          registration_opens_at: nowIso(), registration_closes_at: body.registrationClosesAt ? new Date(body.registrationClosesAt).toISOString() : null,
          capacity: int(body.capacity, 50, { min: 1, max: 5000, field: 'Capacity' }),
          seats_taken: 0, max_per_registration: int(body.maxPerRegistration, 4, { min: 1, max: 20 }),
          waitlist_enabled: body.waitlistEnabled === false ? 0 : 1, lead_provider_id: provider?.id || null,
          indicative_contribution_text: str(body.contributionText, { max: 120 }) || 'Contribution discussed offline',
          dress_code: str(body.dressCode, { max: 300 }) || null, instructions: str(body.instructions, { max: 2000 }) || null,
          status: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'].includes(body.status) ? body.status : 'DRAFT',
          is_featured: body.featured ? 1 : 0, created_at: nowIso(), updated_at: nowIso(),
        });
        audit(ctx, 'EVENT_CREATED', 'event', id, null, { title });
        return { ok: true, id, message: 'Gathering created.' };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/events/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM events WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Event not found');
        const b = ctx.body;
        const updates = {};
        if (b.title !== undefined) updates.title = str(b.title, { min: 3, max: 180, field: 'Title', required: true });
        if (b.description !== undefined) updates.description = str(b.description, { max: 5000 }) || null;
        if (b.rituals !== undefined) updates.rituals_included = str(b.rituals, { max: 2000 }) || null;
        if (b.venue !== undefined) updates.venue_name = str(b.venue, { max: 200 }) || 'To be announced';
        if (b.venueAddress !== undefined) updates.venue_address = JSON.stringify({ text: str(b.venueAddress, { max: 300 }) || '' });
        if (b.startAt !== undefined) updates.start_at = new Date(b.startAt).toISOString();
        if (b.endAt !== undefined) updates.end_at = new Date(b.endAt).toISOString();
        if (b.capacity !== undefined) updates.capacity = int(b.capacity, row.capacity, { min: 1, max: 5000 });
        if (b.status !== undefined && ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'].includes(b.status)) updates.status = b.status;
        if (b.featured !== undefined) updates.is_featured = bool(b.featured) ? 1 : 0;
        if (b.online !== undefined) updates.is_online_available = bool(b.online) ? 1 : 0;
        if (b.instructions !== undefined) updates.instructions = str(b.instructions, { max: 2000 }) || null;
        if (b.dressCode !== undefined) updates.dress_code = str(b.dressCode, { max: 300 }) || null;
        updates.updated_at = nowIso();
        update('events', row.id, updates);
        audit(ctx, 'EVENT_UPDATED', 'event', row.id, null, Object.keys(updates));
        return { ok: true, message: 'Gathering updated.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/events/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM events WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Event not found');
        const used = get('SELECT COUNT(*) AS n FROM bookings WHERE event_id = ?', [row.id])?.n || 0;
        if (used) {
          run("UPDATE events SET status = 'CANCELLED', updated_at = ? WHERE id = ?", [nowIso(), row.id]);
          return { ok: true, message: 'The gathering had registrations, so it was cancelled instead of deleted.' };
        }
        run('DELETE FROM events WHERE id = ?', [row.id]);
        return { ok: true, message: 'Gathering deleted.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/events/:id/registrations', handler: staff(async (ctx) => {
        const event = get('SELECT * FROM events WHERE id = ?', [ctx.params.id]);
        assert(event, 404, 'Event not found');
        const rows = all(
          `SELECT r.*, b.booking_ref, b.customer_name, b.customer_phone, b.customer_email, b.status AS booking_status
           FROM event_registrations r JOIN bookings b ON b.id = r.booking_id
           WHERE r.event_id = ? ORDER BY r.created_at DESC`,
          [event.id]
        );
        return {
          event: { id: event.id, title: event.title, startAt: event.start_at, capacity: event.capacity, seatsTaken: event.seats_taken },
          registrations: rows.map((r) => ({
            id: r.id, ref: r.booking_ref, name: r.customer_name, phone: r.customer_phone, email: r.customer_email,
            seats: r.seats, status: r.status, bookingStatus: r.booking_status, mode: r.attendance_mode,
            qrToken: r.qr_token, checkedInAt: r.checked_in_at, createdAt: r.created_at,
            attendees: all('SELECT * FROM event_attendees WHERE registration_id = ?', [r.id]).map((a) => ({
              name: a.full_name, gotra: a.gotra, nakshatra: a.nakshatra, ageGroup: a.age_group, dietaryNote: a.dietary_note,
            })),
          })),
          waitlist: all(
            `SELECT w.*, b.booking_ref, b.customer_name, b.customer_phone FROM event_waitlist w
             JOIN bookings b ON b.id = w.booking_id WHERE w.event_id = ? ORDER BY w.position`,
            [event.id]
          ),
        };
      }),
    },
    {
      method: 'POST', path: '/api/admin/registrations/:id/check-in', handler: staff(async (ctx) => {
        const reg = get('SELECT * FROM event_registrations WHERE id = ?', [ctx.params.id]);
        assert(reg, 404, 'Registration not found');
        run('UPDATE event_registrations SET checked_in_at = ?, status = ? WHERE id = ?', [nowIso(), 'ATTENDED', reg.id]);
        return { ok: true, message: 'Checked in.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/customers', handler: staff(async (ctx) => {
        const { page, limit, offset } = pageParams(ctx.query);
        const where = ["u.role = 'CUSTOMER'", 'u.deleted_at IS NULL'];
        const params = [];
        if (ctx.query.q) {
          const q = `%${str(ctx.query.q, { max: 100 })}%`;
          where.push('(u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.city LIKE ?)');
          params.push(q, q, q, q);
        }
        const rows = all(
          `SELECT u.*,
             (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = u.id) AS booking_count,
             (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = u.id AND b.status = 'COMPLETED') AS completed_count,
             (SELECT MAX(b.requested_at) FROM bookings b WHERE b.customer_id = u.id) AS last_booking_at
           FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );
        const total = get(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, params)?.n || 0;
        return {
          customers: rows.map((u) => ({
            ...publicUser({ ...u, provider: null }), bookingCount: u.booking_count, completedCount: u.completed_count,
            lastBookingAt: u.last_booking_at, createdAt: u.created_at,
          })),
          page, limit, total, pages: Math.max(1, Math.ceil(total / limit)),
        };
      }),
    },
    {
      method: 'GET', path: '/api/admin/customers/:id', handler: staff(async (ctx) => {
        const user = get("SELECT * FROM users WHERE id = ? AND role = 'CUSTOMER'", [ctx.params.id]);
        assert(user, 404, 'Customer not found');
        const bookings = bookingListQuery(['b.customer_id = ?'], [user.id], { page: 1, limit: 100 }).bookings;
        return {
          customer: publicUser({ ...user, provider: null }),
          profiles: all('SELECT * FROM birth_profiles WHERE customer_id = ? ORDER BY is_default DESC', [user.id]).map(profileOut),
          addresses: all('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC', [user.id]).map(addressOut),
          bookings,
          consents: all('SELECT * FROM consents WHERE user_id = ? ORDER BY granted_at DESC', [user.id]),
        };
      }),
    },
    {
      method: 'GET', path: '/api/admin/pandit', handler: staff(async () => {
        const p = primaryProvider();
        assert(p, 404, 'Pandit profile not found');
        return {
          pandit: {
            id: p.id, name: p.display_name, slug: p.slug, headline: p.headline, bio: p.bio,
            experience: p.years_of_experience, tradition: p.tradition, city: p.city,
            languages: parseJson(p.languages, []), specializations: parseJson(p.specializations, []),
            offersOnline: Boolean(p.offers_online), offersInPerson: Boolean(p.offers_in_person),
            serviceRadiusKm: p.service_radius_km, minNoticeHours: p.min_notice_hours,
            active: Boolean(p.is_active), rating: p.average_rating, reviewCount: p.review_count,
          },
          settings: Object.fromEntries(settingsPayload().filter((s) => s.key.startsWith('site.')).map((s) => [s.key, s.value])),
        };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/pandit', handler: owner(async (ctx) => {
        const p = primaryProvider();
        const b = ctx.body;
        const updates = {};
        if (b.name !== undefined) updates.display_name = str(b.name, { min: 2, max: 150, field: 'Pandit name', required: true });
        if (b.headline !== undefined) updates.headline = str(b.headline, { max: 250 }) || null;
        if (b.bio !== undefined) updates.bio = str(b.bio, { max: 6000 }) || null;
        if (b.experience !== undefined) updates.years_of_experience = int(b.experience, p.years_of_experience, { min: 0, max: 80 });
        if (b.tradition !== undefined) updates.tradition = str(b.tradition, { max: 80 }) || null;
        if (b.city !== undefined) updates.city = str(b.city, { max: 80 }) || null;
        if (b.languages !== undefined) updates.languages = JSON.stringify(Array.isArray(b.languages) ? b.languages : []);
        if (b.specializations !== undefined) updates.specializations = JSON.stringify(Array.isArray(b.specializations) ? b.specializations : []);
        if (b.offersOnline !== undefined) updates.offers_online = bool(b.offersOnline) ? 1 : 0;
        if (b.offersInPerson !== undefined) updates.offers_in_person = bool(b.offersInPerson) ? 1 : 0;
        if (b.serviceRadiusKm !== undefined) updates.service_radius_km = int(b.serviceRadiusKm, p.service_radius_km, { min: 0, max: 500 });
        if (b.minNoticeHours !== undefined) updates.min_notice_hours = int(b.minNoticeHours, p.min_notice_hours, { min: 1, max: 168 });
        if (b.active !== undefined) updates.is_active = bool(b.active) ? 1 : 0;
        updates.updated_at = nowIso();
        tx(() => {
          update('providers', p.id, updates);
          if (updates.display_name) setSetting('site.pandit_name', updates.display_name, 'Pandit name shown across the public site', ctx.user.id);
          if (b.title !== undefined) setSetting('site.pandit_title', str(b.title, { max: 160 }), 'Pandit title line', ctx.user.id);
          if (b.consultHeading !== undefined) setSetting('site.consult_heading', str(b.consultHeading, { max: 160 }), 'Consultation section heading', ctx.user.id);
          if (b.since !== undefined) setSetting('site.pandit_since', str(b.since, { max: 20 }), 'Year the practice began', ctx.user.id);
        });
        audit(ctx, 'PANDIT_PROFILE_UPDATED', 'provider', p.id, null, Object.keys(updates));
        return { ok: true, message: 'Pandit profile updated.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/notifications', handler: staff(async () => {
        const recipients = all('SELECT * FROM notification_recipients ORDER BY is_primary_owner DESC, name');
        const templates = all('SELECT * FROM notification_templates ORDER BY code, channel');
        const outbox = all(
          `SELECT o.*, b.booking_ref, COALESCE(l.status, o.status) AS delivery_status
           FROM notification_outbox o LEFT JOIN bookings b ON b.id = o.booking_id
           LEFT JOIN notification_delivery_logs l ON l.outbox_id = o.id
           ORDER BY o.created_at DESC LIMIT 60`
        );
        return {
          recipients: recipients.map((r) => ({
            id: r.id, name: r.name, channel: r.channel, address: r.address,
            bookingTypes: parseJson(r.receives_booking_types, []), primary: Boolean(r.is_primary_owner),
            active: Boolean(r.is_active),
          })),
          templates: templates.map((t) => ({
            id: t.id, code: t.code, channel: t.channel, language: t.language,
            subject: t.subject, body: t.body, active: Boolean(t.is_active),
          })),
          outbox: outbox.map((o) => ({
            id: o.id, code: o.template_code, channel: o.channel, address: o.recipient_address,
            status: o.delivery_status, bookingRef: o.booking_ref, sentAt: o.sent_at, createdAt: o.created_at,
            attempts: o.attempts,
          })),
          stats: {
            pending: get("SELECT COUNT(*) AS n FROM notification_outbox WHERE status = 'PENDING'")?.n || 0,
            delivered: get("SELECT COUNT(*) AS n FROM notification_outbox WHERE status = 'DELIVERED'")?.n || 0,
            recipients: recipients.filter((r) => r.is_active).length,
          },
        };
      }),
    },
    {
      method: 'POST', path: '/api/admin/notifications/recipients', handler: owner(async (ctx) => {
        const channel = ['WHATSAPP', 'EMAIL', 'SMS'].includes(ctx.body.channel) ? ctx.body.channel : 'EMAIL';
        const address = str(ctx.body.address, { min: 3, max: 200, field: 'Address', required: true });
        if (channel === 'EMAIL') assert(isEmail(address), 422, 'Enter a valid email address');
        const id = uuid();
        insert('notification_recipients', {
          id, name: str(ctx.body.name, { max: 100 }) || 'Owner',
          user_id: ctx.user.id, channel, address,
          receives_booking_types: JSON.stringify(Array.isArray(ctx.body.bookingTypes) && ctx.body.bookingTypes.length ? ctx.body.bookingTypes : ['PUJA', 'CONSULTATION', 'EVENT']),
          quiet_hours_start: null, quiet_hours_end: null,
          is_primary_owner: bool(ctx.body.primary) ? 1 : 0, is_active: 1,
        });
        return { ok: true, id, message: 'Notification recipient added.' };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/notifications/recipients/:id', handler: owner(async (ctx) => {
        const row = get('SELECT * FROM notification_recipients WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Recipient not found');
        run('UPDATE notification_recipients SET is_active = ? WHERE id = ?', [bool(ctx.body.active) ? 1 : 0, row.id]);
        return { ok: true, message: 'Recipient updated.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/notifications/recipients/:id', handler: owner(async (ctx) => {
        const row = get('SELECT * FROM notification_recipients WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Recipient not found');
        run('DELETE FROM notification_recipients WHERE id = ?', [row.id]);
        return { ok: true, message: 'Recipient removed.' };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/notifications/templates/:id', handler: owner(async (ctx) => {
        const row = get('SELECT * FROM notification_templates WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Template not found');
        update('notification_templates', row.id, {
          subject: str(ctx.body.subject, { max: 200 }) || null,
          body: str(ctx.body.body, { min: 5, max: 4000, field: 'Body', required: true }),
          is_active: ctx.body.active === false ? 0 : 1,
        });
        return { ok: true, message: 'Template updated.' };
      }),
    },
    {
      method: 'POST', path: '/api/admin/notifications/process', handler: staff(async () => {
        const delivered = processOutbox(100);
        return { ok: true, delivered, message: `${delivered} queued messages delivered.` };
      }),
    },
    {
      method: 'GET', path: '/api/admin/enquiries', handler: staff(async () => {
        const rows = all('SELECT * FROM enquiries ORDER BY created_at DESC');
        return {
          enquiries: rows.map((e) => ({
            id: e.id, name: e.name, email: e.email, phone: e.phone, subject: e.subject,
            message: e.message, status: e.status, createdAt: e.created_at,
          })),
        };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/enquiries/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM enquiries WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Enquiry not found');
        assert(['NEW', 'IN_PROGRESS', 'CLOSED'].includes(ctx.body.status), 422, 'Invalid status');
        run('UPDATE enquiries SET status = ? WHERE id = ?', [ctx.body.status, row.id]);
        return { ok: true, message: 'Enquiry updated.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/reviews', handler: staff(async () => {
        const rows = all(
          `SELECT r.*, p.display_name AS provider_name, b.booking_ref FROM reviews r
           LEFT JOIN providers p ON p.id = r.provider_id LEFT JOIN bookings b ON b.id = r.booking_id
           ORDER BY r.created_at DESC`
        );
        return {
          reviews: rows.map((r) => ({
            id: r.id, name: r.customer_name, rating: r.rating, title: r.title, comment: r.comment,
            published: Boolean(r.is_published), reply: r.owner_reply, createdAt: r.created_at,
            provider: r.provider_name, bookingRef: r.booking_ref,
          })),
        };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/reviews/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM reviews WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'Review not found');
        update('reviews', row.id, {
          is_published: ctx.body.published === undefined ? row.is_published : (bool(ctx.body.published) ? 1 : 0),
          owner_reply: ctx.body.reply === undefined ? row.owner_reply : (str(ctx.body.reply, { max: 2000 }) || null),
        });
        audit(ctx, 'REVIEW_UPDATED', 'review', row.id);
        return { ok: true, message: 'Review updated.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/faqs', handler: staff(async () => {
        return { faqs: all('SELECT * FROM faqs ORDER BY category, display_order') };
      }),
    },
    {
      method: 'POST', path: '/api/admin/faqs', handler: staff(async (ctx) => {
        const id = uuid();
        insert('faqs', {
          id, question: str(ctx.body.question, { min: 5, max: 300, field: 'Question', required: true }),
          answer: str(ctx.body.answer, { min: 5, max: 4000, field: 'Answer', required: true }),
          category: str(ctx.body.category, { max: 60 }) || 'General',
          display_order: int(ctx.body.displayOrder, 99, { min: 0, max: 999 }), language: 'en',
          is_active: 1,
        });
        return { ok: true, id, message: 'FAQ added.' };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/faqs/:id', handler: staff(async (ctx) => {
        const row = get('SELECT * FROM faqs WHERE id = ?', [ctx.params.id]);
        assert(row, 404, 'FAQ not found');
        update('faqs', row.id, {
          question: str(ctx.body.question, { min: 5, max: 300, field: 'Question', required: true }),
          answer: str(ctx.body.answer, { min: 5, max: 4000, field: 'Answer', required: true }),
          category: str(ctx.body.category, { max: 60 }) || row.category,
          is_active: ctx.body.active === false ? 0 : 1,
        });
        return { ok: true, message: 'FAQ updated.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/faqs/:id', handler: staff(async (ctx) => {
        run('DELETE FROM faqs WHERE id = ?', [ctx.params.id]);
        return { ok: true, message: 'FAQ deleted.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/testimonials', handler: staff(async () => {
        return { testimonials: all('SELECT * FROM testimonials ORDER BY created_at DESC') };
      }),
    },
    {
      method: 'POST', path: '/api/admin/testimonials', handler: staff(async (ctx) => {
        const id = uuid();
        insert('testimonials', {
          id, customer_name: str(ctx.body.customerName, { min: 2, max: 100, field: 'Name', required: true }),
          city: str(ctx.body.city, { max: 80 }) || null,
          quote: str(ctx.body.quote, { min: 10, max: 2000, field: 'Quote', required: true }),
          rating: int(ctx.body.rating, 5, { min: 1, max: 5, field: 'Rating' }),
          service_name: str(ctx.body.serviceName, { max: 150 }) || null,
          service_id: null, is_published: 1,
        });
        return { ok: true, id, message: 'Testimonial added.' };
      }),
    },
    {
      method: 'DELETE', path: '/api/admin/testimonials/:id', handler: staff(async (ctx) => {
        run('DELETE FROM testimonials WHERE id = ?', [ctx.params.id]);
        return { ok: true, message: 'Testimonial removed.' };
      }),
    },
    {
      method: 'GET', path: '/api/admin/reports', handler: staff(async (ctx) => {
        const range = dateRange(ctx.query, 30);
        const bookings = all(
          `SELECT b.*, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id
           WHERE b.requested_at >= ? AND b.requested_at < ? ORDER BY b.requested_at`,
          [range.start, range.end]
        );
        const byStatus = {};
        const byType = {};
        const byService = {};
        for (const b of bookings) {
          byStatus[b.status] = (byStatus[b.status] || 0) + 1;
          byType[b.booking_type] = (byType[b.booking_type] || 0) + 1;
          const key = b.service_name || 'Event registration';
          byService[key] = (byService[key] || 0) + 1;
        }
        const daily = [];
        for (let d = new Date(`${range.from}T00:00:00Z`); d <= new Date(`${range.to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          daily.push({ date: key, count: bookings.filter((b) => b.requested_at.slice(0, 10) === key).length });
        }
        const payments = all('SELECT * FROM offline_payment_records WHERE created_at >= ? AND created_at < ?', [range.start, range.end]);
        const totalAgreed = payments.reduce((sum, p) => sum + (p.agreed_amount || 0), 0);
        const totalReceived = payments.reduce((sum, p) => sum + (p.received_amount || 0), 0);
        const reviews = all('SELECT rating FROM reviews WHERE created_at >= ? AND created_at < ?', [range.start, range.end]);
        const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
        return {
          ...range,
          totals: {
            bookings: bookings.length,
            completed: bookings.filter((b) => b.status === 'COMPLETED').length,
            cancelled: bookings.filter((b) => ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(b.status)).length,
            confirmed: bookings.filter((b) => b.status === 'CONFIRMED').length,
            completionRate: bookings.length ? Math.round((bookings.filter((b) => b.status === 'COMPLETED').length / bookings.length) * 100) : 0,
            totalAgreed, totalReceived, avgRating: Math.round(avgRating * 10) / 10, reviewCount: reviews.length,
          },
          byStatus, byType,
          topServices: Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
          daily,
        };
      }),
    },
    {
      method: 'GET', path: '/api/admin/audit', handler: owner(async (ctx) => {
        const { page, limit, offset } = pageParams(ctx.query);
        const rows = all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
        return {
          logs: rows.map((l) => ({
            id: l.id, userName: l.user_name, action: l.action, entityType: l.entity_type,
            entityId: l.entity_id, after: parseJson(l.after_state, null), ip: l.ip_address, createdAt: l.created_at,
          })),
          total: get('SELECT COUNT(*) AS n FROM audit_logs')?.n || 0,
          page, limit,
        };
      }),
    },
    {
      method: 'GET', path: '/api/admin/settings', handler: owner(async () => {
        return {
          settings: settingsPayload(),
          pandit: (() => {
            const p = primaryProvider();
            return p ? { id: p.id, name: p.display_name, slug: p.slug, headline: p.headline, city: p.city, active: Boolean(p.is_active) } : null;
          })(),
        };
      }),
    },
    {
      method: 'PUT', path: '/api/admin/settings', handler: owner(async (ctx) => {
        assert(ctx.body.settings && typeof ctx.body.settings === 'object', 422, 'Settings payload is required');
        const allowed = new Set(all('SELECT key FROM app_settings').map((r) => r.key));
        let updated = 0;
        tx(() => {
          for (const [key, value] of Object.entries(ctx.body.settings)) {
            if (!allowed.has(key)) continue;
            if (value !== null && typeof value === 'object') setSetting(key, value, null, ctx.user.id);
            else setSetting(key, value, null, ctx.user.id);
            updated++;
          }
        });
        audit(ctx, 'SETTINGS_UPDATED', 'settings', null, null, Object.keys(ctx.body.settings));
        return { ok: true, updated, message: `${updated} settings saved.` };
      }),
    },
    {
      method: 'GET', path: '/api/admin/export/:kind', handler: owner(async (ctx) => {
        const kind = ctx.params.kind;
        let csv = '';
        if (kind === 'bookings') {
          const rows = all(
            `SELECT b.booking_ref, b.booking_type, b.status, b.customer_name, b.customer_phone, b.customer_email,
               s.name AS service, b.preferred_start_at, b.confirmed_start_at, b.payment_state, b.requested_at
             FROM bookings b LEFT JOIN services s ON s.id = b.service_id ORDER BY b.requested_at DESC`
          );
          csv = toCsv(rows, ['booking_ref', 'booking_type', 'status', 'customer_name', 'customer_phone', 'customer_email', 'service', 'preferred_start_at', 'confirmed_start_at', 'payment_state', 'requested_at']);
        } else if (kind === 'customers') {
          const rows = all(
            `SELECT u.full_name, u.phone, u.email, u.city, u.created_at,
               (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = u.id) AS bookings
             FROM users u WHERE u.role = 'CUSTOMER' AND u.deleted_at IS NULL ORDER BY u.created_at DESC`
          );
          csv = toCsv(rows, ['full_name', 'phone', 'email', 'city', 'created_at', 'bookings']);
        } else if (kind === 'reviews') {
          const rows = all('SELECT customer_name, rating, title, comment, is_published, created_at FROM reviews ORDER BY created_at DESC');
          csv = toCsv(rows, ['customer_name', 'rating', 'title', 'comment', 'is_published', 'created_at']);
        } else if (kind === 'enquiries') {
          const rows = all('SELECT name, phone, email, subject, message, status, created_at FROM enquiries ORDER BY created_at DESC');
          csv = toCsv(rows, ['name', 'phone', 'email', 'subject', 'message', 'status', 'created_at']);
        } else if (kind === 'audit') {
          const rows = all('SELECT user_name, action, entity_type, entity_id, created_at, ip_address FROM audit_logs ORDER BY created_at DESC');
          csv = toCsv(rows, ['user_name', 'action', 'entity_type', 'entity_id', 'created_at', 'ip_address']);
        } else {
          throw new HttpError(404, 'Unknown export');
        }
        ctx.res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="aradhana-${kind}-${istDateKey()}.csv"`,
          'Cache-Control': 'no-store',
        });
        ctx.res.end(csv);
        ctx.raw = true;
        return undefined;
      }),
    },
  ];
}

module.exports = {
  adminRoutes, primaryProvider, confirmBooking, rejectBooking, completeBooking,
  addContactAttempt, decideReschedule, settingsPayload,
};
