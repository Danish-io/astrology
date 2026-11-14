'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { all, get, run, insert } = require('./db');
const { str, assert, HttpError } = require('./http');
const { uuid, nowIso, toCsv, istDateKey, fmtDate, fmtTime } = require('./util');
const { requireUser, requireStaff, requireOwner, isStaff } = require('./auth');
const { findBooking, canViewBooking } = require('./bookings');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

function ensureUploadDir() { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); }

function routes() {
  return [
    // ---------- Calendar export (.ics) ----------
    {
      method: 'GET', path: '/api/bookings/:ref/calendar.ics', handler: async (ctx) => {
        const user = requireUser(ctx);
        const booking = findBooking(ctx.params.ref);
        assert(booking, 404, 'We could not find that booking');
        assert(canViewBooking(user, booking), 403, 'You do not have access to this booking');
        const service = booking.service_id ? get('SELECT name FROM services WHERE id = ?', [booking.service_id]) : null;
        const event = booking.event_id ? get('SELECT title, start_at, end_at FROM events WHERE id = ?', [booking.event_id]) : null;
        const provider = booking.provider_id ? get('SELECT display_name FROM providers WHERE id = ?', [booking.provider_id]) : null;
        const start = event?.start_at || booking.confirmed_start_at || booking.preferred_start_at;
        assert(start, 422, 'No scheduled time available for this booking yet');
        const end = event?.end_at || booking.confirmed_end_at || new Date(new Date(start).getTime() + 60 * 60000).toISOString();
        const dt = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
        const title = event?.title || service?.name || booking.booking_type;
        const lines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Aradhana//Booking//EN',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'BEGIN:VEVENT',
          `UID:${booking.booking_ref}@aradhana`,
          `DTSTAMP:${dt(new Date().toISOString())}`,
          `DTSTART:${dt(start)}`,
          `DTEND:${dt(end)}`,
          `SUMMARY:${esc(`${title} — ${provider?.display_name || 'Aradhana'}`)}`,
          `DESCRIPTION:${esc(`Booking ${booking.booking_ref}. Customer: ${booking.customer_name}. ${booking.special_requests || ''}`)}`,
          `LOCATION:${esc(booking.customer_email || '')}`,
          'STATUS:CONFIRMED',
          'END:VEVENT',
          'END:VCALENDAR',
        ];
        ctx.res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        ctx.res.setHeader('Content-Disposition', `attachment; filename="${booking.booking_ref}.ics"`);
        ctx.raw = true;
        ctx.res.end(lines.join('\r\n'));
        return undefined;
      },
    },

    // ---------- File upload (base64) ----------
    {
      method: 'POST', path: '/api/uploads', handler: async (ctx) => {
        const user = requireUser(ctx);
        const name = str(ctx.body.fileName || ctx.body.name, { max: 200, field: 'File name' }) || 'upload';
        const dataUrl = str(ctx.body.data || ctx.body.base64, { max: 8 * 1024 * 1024, field: 'File data', required: true });
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        assert(match, 422, 'Invalid file payload (expected base64 data URL)');
        const mime = match[1];
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        assert(allowed.includes(mime), 422, 'Unsupported file type');
        const buf = Buffer.from(match[2], 'base64');
        assert(buf.length <= 5 * 1024 * 1024, 413, 'File is too large (max 5 MB)');
        ensureUploadDir();
        const ext = mime === 'image/jpeg' ? '.jpg' : mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.pdf';
        const safeBase = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
        const fileName = `${uuid()}-${safeBase || 'file'}${safeBase.includes('.') ? '' : ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buf);
        const url = `/uploads/${fileName}`;
        // Optionally attach to a booking if bookingRef provided
        if (ctx.body.bookingRef) {
          const booking = findBooking(ctx.body.bookingRef);
          if (booking && (booking.customer_id === user.id || isStaff(user))) {
            insert('booking_media', {
              id: uuid(), booking_id: booking.id, media_type: mime.startsWith('image/') ? 'PHOTO' : 'DOCUMENT',
              storage_url: url, caption: str(ctx.body.caption, { max: 200 }) || null,
              uploaded_by: user.id, visible_to_customer: 1, created_at: nowIso(),
            });
          }
        }
        return { url, fileName, size: buf.length, mime };
      },
    },

    // ---------- Assistant (FAQ + service search) ----------
    {
      method: 'POST', path: '/api/assistant', handler: async (ctx) => {
        const message = str(ctx.body.message, { min: 1, max: 500, field: 'Message', required: true }).toLowerCase();
        const faqs = all('SELECT question, answer, category FROM faqs WHERE is_active = 1');
        const services = all('SELECT name, slug, short_description, service_type FROM services WHERE is_active = 1');
        // simple keyword matching
        const tokens = message.split(/\W+/).filter((t) => t.length > 2);
        const scored = faqs.map((f) => {
          const hay = `${f.question} ${f.answer} ${f.category}`.toLowerCase();
          const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
          return { ...f, score };
        }).sort((a, b) => b.score - a.score);
        const topFaq = scored[0]?.score > 0 ? scored[0] : null;
        const svcMatches = services.filter((s) => tokens.some((t) => `${s.name} ${s.short_description}`.toLowerCase().includes(t))).slice(0, 3);
        let reply = '';
        if (topFaq) {
          reply = `${topFaq.answer}`;
        } else if (svcMatches.length) {
          reply = `You might be looking for: ${svcMatches.map((s) => s.name).join(', ')}. Open any puja for details and available slots.`;
        } else {
          reply = 'I am not sure about that yet. You can browse Pujas, Personal guidance and Gatherings, or send a note via Contact and Pandit ji will reply within one working day.';
        }
        // quick intents
        if (/book|slot|availab/.test(message)) reply = 'To book, open a puja or consultation, choose a date on the 14-day calendar, pick a slot, and submit your request. A slot is held for 24 hours while we confirm by phone.';
        if (/cancel/.test(message)) reply = 'You can cancel a request from My bookings → booking detail → Cancel, with a reason. Confirmed bookings follow the cancellation window in the policy.';
        if (/payment|price|cost|fee/.test(message)) reply = 'No payment is taken online. Prices are discussed and settled directly and offline after we confirm your request.';
        return { reply, suggestions: svcMatches.map((s) => ({ name: s.name, slug: s.slug })) };
      },
    },

    // ---------- Widget availability JSON ----------
    {
      method: 'GET', path: '/api/widget/availability', handler: async (ctx) => {
        const { primaryPandit } = require('./routes-public');
        // primaryPandit not exported; inline:
        const slug = get('SELECT value FROM app_settings WHERE key = ?', ['site.primary_provider_slug']);
        const primary = get('SELECT * FROM providers WHERE slug = ?', [JSON.parse(slug?.value || '"pandit-ramesh-sharma"')]) || get('SELECT * FROM providers WHERE is_active = 1 ORDER BY display_order LIMIT 1');
        if (!primary) return { available: false };
        const today = istDateKey();
        const slots = all("SELECT COUNT(*) AS n FROM time_slots WHERE provider_id = ? AND status = 'AVAILABLE' AND start_at >= ? AND start_at < ?", [primary.id, `${today}T00:00:00+05:30`, `${istDateKey()}T23:59:59+05:30`]);
        return { available: true, pandit: primary.display_name, city: primary.city, slotsToday: slots[0]?.n || 0, bookUrl: '/#/pujas' };
      },
    },

    // ---------- Accounting export ----------
    {
      method: 'GET', path: '/api/admin/payments/export.csv', handler: async (ctx) => {
        const user = requireOwner(ctx);
        const from = ctx.query.from || '2000-01-01';
        const to = ctx.query.to || '2100-01-01';
        const rows = all(
          `SELECT b.booking_ref, b.booking_type, b.status, b.customer_name, b.customer_phone,
                  b.confirmed_start_at, b.completed_at, p.agreed_amount, p.received_amount,
                  p.mode, p.received_on, p.reference_note, p.remarks, p.recorded_by
           FROM offline_payment_records p JOIN bookings b ON b.id = p.booking_id
           WHERE (b.requested_at >= ? AND b.requested_at <= ?)
           ORDER BY b.requested_at DESC`,
          [`${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`]
        );
        const csv = toCsv(rows.map((r) => ({
          ref: r.booking_ref, type: r.booking_type, status: r.status, customer: r.customer_name,
          phone: r.customer_phone, confirmed: r.confirmed_start_at, completed: r.completed_at,
          agreed: r.agreed_amount, received: r.received_amount, mode: r.mode,
          receivedOn: r.received_on, note: r.reference_note, remarks: r.remarks,
        })), ['ref', 'type', 'status', 'customer', 'phone', 'confirmed', 'completed', 'agreed', 'received', 'mode', 'receivedOn', 'note', 'remarks']);
        ctx.res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        ctx.res.setHeader('Content-Disposition', `attachment; filename="aradhana-payments-${istDateKey()}.csv"`);
        ctx.raw = true;
        ctx.res.end(csv);
        return undefined;
      },
    },
  ];
}

module.exports = routes();
module.exports.routes = routes;
module.exports.ROUTES = routes();
module.exports.UPLOAD_DIR = UPLOAD_DIR;
module.exports.ensureUploadDir = ensureUploadDir;