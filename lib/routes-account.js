'use strict';

const { all, get, run, insert, update, tx, getSetting, audit } = require('./db');
const { str, assert, HttpError, isEmail, int, bool, dateKey } = require('./http');
const { uuid, nowIso, normalizePhone, parseJson, istDateKey } = require('./util');
const { requireUser } = require('./auth');
const {
  findBooking, canViewBooking, bookingsList, detailFor,
  cancelBooking, requestReschedule, createReview,
} = require('./bookings');

function profileInput(body) {
  const dob = str(body.dateOfBirth, { max: 10, field: 'Date of birth', required: true });
  assert(/^\d{4}-\d{2}-\d{2}$/.test(dob), 422, 'Enter a valid date of birth');
  assert(new Date(dob).getTime() < Date.now(), 422, 'Date of birth must be in the past');
  const unknown = bool(body.timeUnknown);
  const time = unknown ? null : str(body.timeOfBirth, { max: 8, field: 'Time of birth' });
  return {
    label: str(body.label, { max: 60, field: 'Profile label' }) || 'Self',
    full_name: str(body.fullName || body.name, { min: 2, max: 150, field: 'Full name', required: true }),
    gender: ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'].includes(body.gender) ? body.gender : 'UNDISCLOSED',
    date_of_birth: dob,
    time_of_birth: time,
    time_of_birth_unknown: unknown ? 1 : 0,
    place_of_birth: str(body.placeOfBirth || body.place, { min: 2, max: 200, field: 'Place of birth', required: true }),
    gotra: str(body.gotra, { max: 80 }) || null,
    nakshatra: str(body.nakshatra, { max: 40 }) || null,
    rashi: str(body.rashi, { max: 40 }) || null,
  };
}

function profileOut(row) {
  return {
    id: row.id, label: row.label, fullName: row.full_name, gender: row.gender,
    dateOfBirth: row.date_of_birth, timeOfBirth: row.time_of_birth,
    timeUnknown: Boolean(row.time_of_birth_unknown), placeOfBirth: row.place_of_birth,
    gotra: row.gotra, nakshatra: row.nakshatra, rashi: row.rashi,
    isDefault: Boolean(row.is_default), createdAt: row.created_at,
  };
}

function addressInput(body) {
  return {
    label: str(body.label, { max: 60 }) || 'Home',
    line1: str(body.line1, { min: 3, max: 200, field: 'Address line 1', required: true }),
    line2: str(body.line2, { max: 200 }) || null,
    landmark: str(body.landmark, { max: 150 }) || null,
    city: str(body.city, { min: 2, max: 80, field: 'City', required: true }),
    state: str(body.state, { max: 80 }) || null,
    country: str(body.country, { max: 80 }) || 'India',
    postal_code: str(body.postalCode, { max: 15 }) || null,
  };
}

function addressOut(row) {
  return {
    id: row.id, label: row.label, line1: row.line1, line2: row.line2,
    landmark: row.landmark, city: row.city, state: row.state, country: row.country,
    postalCode: row.postal_code, isDefault: Boolean(row.is_default), createdAt: row.created_at,
  };
}

function accountRoutes() {
  return [
    {
      method: 'GET', path: '/api/account/summary', handler: async (ctx) => {
        const user = requireUser(ctx);
        const bookings = bookingsList(user.id);
        const upcoming = bookings.filter((b) => ['REQUESTED', 'CONTACTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'].includes(b.status));
        const unread = get('SELECT COUNT(*) AS n FROM inapp_notifications WHERE user_id = ? AND read_at IS NULL', [user.id])?.n || 0;
        return {
          bookings: bookings.slice(0, 5),
          counts: {
            total: bookings.length,
            open: upcoming.length,
            completed: bookings.filter((b) => b.status === 'COMPLETED').length,
            upcoming: upcoming.length,
            profiles: get('SELECT COUNT(*) AS n FROM birth_profiles WHERE customer_id = ?', [user.id])?.n || 0,
            addresses: get('SELECT COUNT(*) AS n FROM addresses WHERE customer_id = ?', [user.id])?.n || 0,
          },
          nextBooking: upcoming
            .filter((b) => b.status === 'CONFIRMED' || b.confirmedStartAt || b.preferredStartAt)
            .sort((a, b) => new Date(a.confirmedStartAt || a.preferredStartAt) - new Date(b.confirmedStartAt || b.preferredStartAt))[0] || null,
          unread,
        };
      },
    },
    {
      method: 'GET', path: '/api/my/bookings', handler: async (ctx) => {
        const user = requireUser(ctx);
        let rows = bookingsList(user.id);
        if (ctx.query.status) {
          const statuses = String(ctx.query.status).split(',').filter(Boolean);
          rows = rows.filter((b) => statuses.includes(b.status));
        }
        if (ctx.query.type) rows = rows.filter((b) => b.type === ctx.query.type);
        return { bookings: rows, total: rows.length };
      },
    },
    {
      method: 'GET', path: '/api/my/bookings/:ref', handler: async (ctx) => {
        const user = requireUser(ctx);
        const booking = findBooking(ctx.params.ref);
        assert(booking, 404, 'We could not find that booking');
        assert(canViewBooking(user, booking), 403, 'You do not have access to this booking');
        return detailFor(booking, user);
      },
    },
    {
      method: 'POST', path: '/api/my/bookings/:ref/cancel', handler: async (ctx) => {
        const user = requireUser(ctx);
        const booking = findBooking(ctx.params.ref);
        assert(booking, 404, 'We could not find that booking');
        assert(booking.customer_id === user.id, 403, 'You can only manage your own booking');
        const result = cancelBooking(user, booking, ctx.body.reason);
        audit(ctx, 'BOOKING_CANCELLED_BY_CUSTOMER', 'booking', booking.id, null, { reason: ctx.body.reason });
        return result;
      },
    },
    {
      method: 'POST', path: '/api/my/bookings/:ref/reschedule', handler: async (ctx) => {
        const user = requireUser(ctx);
        const booking = findBooking(ctx.params.ref);
        assert(booking, 404, 'We could not find that booking');
        assert(booking.customer_id === user.id, 403, 'You can only manage your own booking');
        return requestReschedule(user, booking, ctx.body);
      },
    },
    {
      method: 'POST', path: '/api/my/bookings/:ref/review', handler: async (ctx) => {
        const user = requireUser(ctx);
        const booking = findBooking(ctx.params.ref);
        assert(booking, 404, 'We could not find that booking');
        return createReview(user, booking, ctx.body);
      },
    },
    {
      method: 'GET', path: '/api/account/birth-profiles', handler: async (ctx) => {
        const user = requireUser(ctx);
        const rows = all('SELECT * FROM birth_profiles WHERE customer_id = ? ORDER BY is_default DESC, created_at', [user.id]);
        return { profiles: rows.map(profileOut) };
      },
    },
    {
      method: 'POST', path: '/api/account/birth-profiles', handler: async (ctx) => {
        const user = requireUser(ctx);
        const data = profileInput(ctx.body);
        const count = get('SELECT COUNT(*) AS n FROM birth_profiles WHERE customer_id = ?', [user.id])?.n || 0;
        assert(count < 12, 422, 'You can save up to 12 birth profiles');
        const makeDefault = bool(ctx.body.isDefault) || count === 0;
        const id = uuid();
        tx(() => {
          if (makeDefault) run('UPDATE birth_profiles SET is_default = 0 WHERE customer_id = ?', [user.id]);
          insert('birth_profiles', {
            id, customer_id: user.id, ...data, birth_latitude: null, birth_longitude: null,
            birth_timezone: 'Asia/Kolkata', is_default: makeDefault ? 1 : 0, created_at: nowIso(),
          });
        });
        return { profile: profileOut(get('SELECT * FROM birth_profiles WHERE id = ?', [id])), message: 'Birth profile saved.' };
      },
    },
    {
      method: 'PUT', path: '/api/account/birth-profiles/:id', handler: async (ctx) => {
        const user = requireUser(ctx);
        const row = get('SELECT * FROM birth_profiles WHERE id = ? AND customer_id = ?', [ctx.params.id, user.id]);
        assert(row, 404, 'Birth profile not found');
        const data = profileInput(ctx.body);
        tx(() => {
          if (bool(ctx.body.isDefault)) run('UPDATE birth_profiles SET is_default = 0 WHERE customer_id = ?', [user.id]);
          update('birth_profiles', row.id, { ...data, is_default: bool(ctx.body.isDefault) || row.is_default ? 1 : 0 });
        });
        return { profile: profileOut(get('SELECT * FROM birth_profiles WHERE id = ?', [row.id])), message: 'Birth profile updated.' };
      },
    },
    {
      method: 'DELETE', path: '/api/account/birth-profiles/:id', handler: async (ctx) => {
        const user = requireUser(ctx);
        const row = get('SELECT * FROM birth_profiles WHERE id = ? AND customer_id = ?', [ctx.params.id, user.id]);
        assert(row, 404, 'Birth profile not found');
        run('DELETE FROM birth_profiles WHERE id = ?', [row.id]);
        return { ok: true, message: 'Birth profile removed.' };
      },
    },
    {
      method: 'GET', path: '/api/account/addresses', handler: async (ctx) => {
        const user = requireUser(ctx);
        const rows = all('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at', [user.id]);
        return { addresses: rows.map(addressOut) };
      },
    },
    {
      method: 'POST', path: '/api/account/addresses', handler: async (ctx) => {
        const user = requireUser(ctx);
        const data = addressInput(ctx.body);
        const count = get('SELECT COUNT(*) AS n FROM addresses WHERE customer_id = ?', [user.id])?.n || 0;
        assert(count < 10, 422, 'You can save up to 10 addresses');
        const makeDefault = bool(ctx.body.isDefault) || count === 0;
        const id = uuid();
        tx(() => {
          if (makeDefault) run('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [user.id]);
          insert('addresses', { id, customer_id: user.id, ...data, latitude: null, longitude: null, is_default: makeDefault ? 1 : 0, created_at: nowIso() });
        });
        return { address: addressOut(get('SELECT * FROM addresses WHERE id = ?', [id])), message: 'Address saved.' };
      },
    },
    {
      method: 'PUT', path: '/api/account/addresses/:id', handler: async (ctx) => {
        const user = requireUser(ctx);
        const row = get('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', [ctx.params.id, user.id]);
        assert(row, 404, 'Address not found');
        const data = addressInput(ctx.body);
        tx(() => {
          if (bool(ctx.body.isDefault)) run('UPDATE addresses SET is_default = 0 WHERE customer_id = ?', [user.id]);
          update('addresses', row.id, { ...data, is_default: bool(ctx.body.isDefault) || row.is_default ? 1 : 0 });
        });
        return { address: addressOut(get('SELECT * FROM addresses WHERE id = ?', [row.id])), message: 'Address updated.' };
      },
    },
    {
      method: 'DELETE', path: '/api/account/addresses/:id', handler: async (ctx) => {
        const user = requireUser(ctx);
        const row = get('SELECT * FROM addresses WHERE id = ? AND customer_id = ?', [ctx.params.id, user.id]);
        assert(row, 404, 'Address not found');
        run('DELETE FROM addresses WHERE id = ?', [row.id]);
        return { ok: true, message: 'Address removed.' };
      },
    },
    {
      method: 'GET', path: '/api/account/consents', handler: async (ctx) => {
        const user = requireUser(ctx);
        const rows = all('SELECT * FROM consents WHERE user_id = ? ORDER BY granted_at DESC', [user.id]);
        return { consents: rows };
      },
    },
    {
      method: 'GET', path: '/api/account/export', handler: async (ctx) => {
        const user = requireUser(ctx);
        const bookings = all(
          `SELECT booking_ref, booking_type, status, customer_name, preferred_start_at, confirmed_start_at,
             requested_at, completed_at, special_requests FROM bookings WHERE customer_id = ? ORDER BY requested_at DESC`,
          [user.id]
        );
        const payload = {
          exportedAt: nowIso(),
          account: {
            fullName: user.full_name, phone: user.phone, email: user.email, city: user.city,
            preferredLanguage: user.preferred_language, createdAt: user.created_at,
          },
          birthProfiles: all('SELECT * FROM birth_profiles WHERE customer_id = ?', [user.id]).map(profileOut),
          addresses: all('SELECT * FROM addresses WHERE customer_id = ?', [user.id]).map(addressOut),
          bookings,
          consents: all('SELECT consent_type, policy_version, granted, granted_at FROM consents WHERE user_id = ?', [user.id]),
        };
        ctx.res.setHeader('Content-Type', 'application/json; charset=utf-8');
        ctx.res.setHeader('Content-Disposition', `attachment; filename="aradhana-data-${istDateKey()}.json"`);
        ctx.raw = true;
        ctx.res.end(JSON.stringify(payload, null, 2));
        return undefined;
      },
    },
    {
      method: 'POST', path: '/api/account/delete', handler: async (ctx) => {
        const user = requireUser(ctx);
        assert(String(ctx.body.confirm || '').toUpperCase() === 'DELETE', 422, 'Type DELETE to confirm');
        tx(() => {
          run('DELETE FROM birth_profiles WHERE customer_id = ?', [user.id]);
          run('DELETE FROM addresses WHERE customer_id = ?', [user.id]);
          run(
            `UPDATE bookings SET customer_name = 'Deleted customer', customer_phone = 'removed',
               customer_email = NULL, special_requests = NULL, updated_at = ? WHERE customer_id = ?`,
            [nowIso(), user.id]
          );
          run('UPDATE users SET full_name = ?, phone = NULL, email = NULL, password_hash = NULL, is_active = 0, deleted_at = ?, updated_at = ? WHERE id = ?',
            ['Deleted customer', nowIso(), nowIso(), user.id]);
          run('DELETE FROM sessions WHERE user_id = ?', [user.id]);
        });
        ctx.res.setHeader('Set-Cookie', 'aradhana_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
        return { ok: true, message: 'Your account and saved personal data have been removed.' };
      },
    },
  ];
}

module.exports = { accountRoutes, profileInput, profileOut, addressInput, addressOut };
