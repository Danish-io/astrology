'use strict';

const { all, get, run, insert, getSetting, publicSettings } = require('./db');
const { str, assert, HttpError, isEmail } = require('./http');
const { uuid, nowIso, istDateKey, addDaysKey, istToIso, fmtDate, weekdayKey, normalizePhone } = require('./util');
const {
  serviceOut, providerOut, eventOut, reviewsForProvider, ratingBreakdown,
  publicPanchang, upcomingFestivals, serviceCards, stats, providerTypesForService,
} = require('./data');
const { ensureSlotsForProvider } = require('./slots');
const { ensureHoroscope, signCards, periodLabel, SIGNS } = require('./almanac');

function primaryPandit() {
  const slug = getSetting('site.primary_provider_slug', 'pandit-ramesh-sharma');
  return get('SELECT * FROM providers WHERE slug = ?', [slug]) || get('SELECT * FROM providers WHERE is_active = 1 ORDER BY display_order LIMIT 1');
}

function metaRoute() {
  return {
    method: 'GET', path: '/api/meta', handler: async () => {
      const categories = all('SELECT * FROM service_categories ORDER BY display_order').map((c) => ({
        id: c.id, name: c.name, slug: c.slug, type: c.service_type, icon: c.icon, tagline: c.tagline,
        serviceCount: get('SELECT COUNT(*) AS n FROM services WHERE category_id = ? AND is_active = 1', [c.id]).n,
      }));
      return {
        settings: publicSettings(),
        categories,
        providerTypes: [
          { value: 'PRIEST', label: 'Priests' },
          { value: 'ASTROLOGER', label: 'Astrologers' },
        ],
        languages: ['English', 'Hindi', 'Telugu', 'Tamil', 'Sanskrit', 'Kannada', 'Marathi', 'Bhojpuri'],
        consultModes: ['CHAT', 'VOICE', 'VIDEO', 'IN_PERSON'],
        locations: ['CUSTOMER_HOME', 'TEMPLE', 'ONLINE', 'PRIEST_PLACE'],
      };
    },
  };
}

// Public, safe config for the browser: URL + PUBLISHABLE key only.
// The service_role / secret key must NEVER appear here.
function configRoute() {
  return {
    method: 'GET', path: '/api/config', handler: async () => {
      const url = process.env.SUPABASE_URL || null;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || null;
      return {
        supabaseUrl: url,
        supabasePublishableKey: key,
        supabaseEnabled: Boolean(url && key),
      };
    },
  };
}

function homeRoute() {
  return {
    method: 'GET', path: '/api/home', handler: async () => {
      const featured = serviceCards('AND s.is_featured = 1', [], 6);
      if (featured.length < 4) featured.push(...serviceCards('', [], 6 - featured.length));
      const panditRow = primaryPandit();
      const pandit = panditRow ? providerOut(panditRow) : null;
      if (pandit) {
        pandit.services = all(
          `SELECT s.name, s.slug FROM services s JOIN provider_services ps ON ps.service_id = s.id
            WHERE ps.provider_id = ? AND ps.is_active = 1 AND s.is_active = 1 ORDER BY s.is_featured DESC LIMIT 8`,
          [pandit.id]
        );
        pandit.reviews = reviewsForProvider(pandit.id, 3);
      }
      const cityRows = all('SELECT DISTINCT city FROM providers WHERE is_active = 1 AND city IS NOT NULL ORDER BY city');
      const categories = all(
        `SELECT c.*, (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id AND s.is_active = 1) AS count
         FROM service_categories c ORDER BY c.display_order`
      );
      const events = all(
        `SELECT e.*, p.display_name AS lead_name, p.slug AS lead_slug, s.name AS service_name, s.slug AS service_slug,
           (SELECT COUNT(*) FROM event_waitlist w WHERE w.event_id = e.id) AS waitlist_count
         FROM events e LEFT JOIN providers p ON p.id = e.lead_provider_id LEFT JOIN services s ON s.id = e.service_id
         WHERE e.status = 'PUBLISHED' AND e.end_at > ? ORDER BY e.start_at LIMIT 3`,
        [nowIso()]
      ).map((row) => eventOut(row));
      const testimonials = all('SELECT * FROM testimonials WHERE is_published = 1 ORDER BY rating DESC LIMIT 6');
      const faqs = all('SELECT * FROM faqs WHERE is_active = 1 ORDER BY display_order LIMIT 6');
      const signs = signCards();
      return {
        settings: publicSettings(),
        featured,
        categories,
        pandit,
        events,
        panchang: publicPanchang(),
        festivals: upcomingFestivals(4),
        testimonials,
        faqs,
        stats: stats(),
        cities: cityRows.map((r) => r.city),
        signs,
        featuredReview: testimonials[0] || null,
      };
    },
  };
}

function serviceRoutes() {
  return [
    {
      method: 'GET', path: '/api/services', handler: async (ctx) => {
        const q = str(ctx.query.q || '', { max: 120 });
        const type = ctx.query.type;
        const category = str(ctx.query.category || '', { max: 120 });
        const location = ctx.query.location;
        const featured = ctx.query.featured === '1';
        const sort = ctx.query.sort || 'recommended';
        const where = [];
        const params = [];
        if (q) {
          where.push('(s.name LIKE ? OR s.short_description LIKE ? OR s.description LIKE ?)');
          params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (['PUJA', 'CONSULTATION', 'EVENT'].includes(type)) { where.push('s.service_type = ?'); params.push(type); }
        if (category) { where.push('c.slug = ?'); params.push(category); }
        if (['CUSTOMER_HOME', 'TEMPLE', 'ONLINE', 'PRIEST_PLACE'].includes(location)) {
          where.push('s.allowed_locations LIKE ?'); params.push(`%${location}%`);
        }
        if (featured) where.push('s.is_featured = 1');

        const order = sort === 'duration' ? 's.default_duration_min ASC'
          : sort === 'newest' ? 's.created_at DESC'
            : sort === 'popular' ? 'booking_count DESC, s.is_featured DESC'
              : 's.is_featured DESC, s.display_order ASC';
        const rows = all(
          `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
             (SELECT COUNT(*) FROM provider_services ps WHERE ps.service_id = s.id AND ps.is_active = 1) AS provider_count,
             (SELECT COUNT(*) FROM bookings b WHERE b.service_id = s.id) AS booking_count
           FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
           WHERE s.is_active = 1 ${where.length ? `AND ${where.join(' AND ')}` : ''}
           ORDER BY ${order}`,
          params
        );
        return {
          services: rows.map((row) => serviceOut(row)),
          total: rows.length,
          categories: all('SELECT * FROM service_categories ORDER BY display_order').map((c) => ({
            id: c.id, name: c.name, slug: c.slug, type: c.service_type, icon: c.icon,
            count: get('SELECT COUNT(*) AS n FROM services WHERE category_id = ? AND is_active = 1', [c.id]).n,
          })),
        };
      },
    },
    {
      method: 'GET', path: '/api/services/:slug', handler: async (ctx) => {
        const row = get(
          `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
             (SELECT COUNT(*) FROM provider_services ps WHERE ps.service_id = s.id AND ps.is_active = 1) AS provider_count
           FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
           WHERE s.slug = ? AND s.is_active = 1`,
          [ctx.params.slug]
        );
        if (!row) throw new HttpError(404, 'We could not find that service');
        const samagri = all('SELECT * FROM service_samagri WHERE service_id = ? ORDER BY display_order', [row.id]);
        const primary = primaryPandit();
        const providers = (primary && get('SELECT 1 AS ok FROM provider_services WHERE provider_id = ? AND service_id = ? AND is_active = 1', [primary.id, row.id]))
          ? [{ ...providerOut(primary), reviews: reviewsForProvider(primary.id, 3) }]
          : [];
        const related = all(
          `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
             (SELECT COUNT(*) FROM provider_services ps WHERE ps.service_id = s.id) AS provider_count
           FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
           WHERE s.category_id = ? AND s.id <> ? AND s.is_active = 1 ORDER BY s.is_featured DESC LIMIT 3`,
          [row.category_id, row.id]
        ).map(serviceOut);
        const festivals = all(
          'SELECT * FROM festivals WHERE for_date >= ? ORDER BY for_date LIMIT 3',
          [istDateKey()]
        );
        const faqs = all("SELECT * FROM faqs WHERE is_active = 1 AND category IN ('Pujas','Consultations','Bookings') ORDER BY display_order LIMIT 8");
        return {
          service: serviceOut(row),
          samagri,
          providers,
          related,
          festivals,
          faqs,
          reviews: providers.flatMap((p) => p.reviews).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
        };
      },
    },
  ];
}

function providerRoutes() {
  return [
    {
      method: 'GET', path: '/api/providers', handler: async () => {
        const primary = primaryPandit();
        return {
          providers: primary ? [providerOut(primary)] : [],
          total: primary ? 1 : 0,
          soloPractice: true,
        };
      },
    },
    {
      method: 'GET', path: '/api/providers/:slug', handler: async (ctx) => {
        const primary = primaryPandit();
        const row = get('SELECT * FROM providers WHERE slug = ?', [ctx.params.slug]);
        if (!row || !primary || row.id !== primary.id) throw new HttpError(404, 'That profile is not available');
        ensureSlotsForProvider(row.id, 30);
        const services = all(
          `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon
           FROM services s JOIN provider_services ps ON ps.service_id = s.id
           LEFT JOIN service_categories c ON c.id = s.category_id
           WHERE ps.provider_id = ? AND ps.is_active = 1 AND s.is_active = 1 ORDER BY s.is_featured DESC, s.display_order`,
          [row.id]
        ).map(serviceOut);
        return {
          provider: providerOut(row),
          services,
          reviews: reviewsForProvider(row.id, 12),
          rating: ratingBreakdown(row.id),
          faqs: all("SELECT * FROM faqs WHERE is_active = 1 AND category IN ('Providers','Consultations','Pujas') ORDER BY display_order LIMIT 6"),
        };
      },
    },
  ];
}

function availabilityRoute() {
  return {
    method: 'GET', path: '/api/availability', handler: async (ctx) => {
      const serviceRef = ctx.query.service;
      const providerRef = ctx.query.provider;
      let service = null;
      if (serviceRef) {
        service = get('SELECT * FROM services WHERE (id = ? OR slug = ?) AND is_active = 1', [serviceRef, serviceRef]);
        if (!service) throw new HttpError(404, 'Service not found');
      }
      const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : istDateKey();
      const serviceType = service?.service_type || (ctx.query.type === 'CONSULTATION' ? 'CONSULTATION' : 'PUJA');
      const globalNotice = Number(getSetting('booking.min_notice_hours', 12));

      const primary = primaryPandit();
      if (!primary) throw new HttpError(404, 'The pandit profile is not configured yet');
      const providers = [primary];
      if (service && !get('SELECT 1 AS ok FROM provider_services WHERE provider_id = ? AND service_id = ? AND is_active = 1', [primary.id, service.id])) {
        return { days: [], groups: { morning: [], afternoon: [], evening: [] }, slots: [], selectedDate, nextAvailable: null, timezone: 'IST', message: 'This service is currently not offered. Please send an enquiry and we will guide you.' };
      }
      for (const p of providers.slice(0, 30)) ensureSlotsForProvider(p.id, 30);

      const providerIds = providers.map((p) => p.id);
      const providerMap = new Map(providers.map((p) => [p.id, p]));
      const placeholders = providerIds.map(() => '?').join(', ');
      const rangeStart = istToIso(istDateKey(), '00:00');
      const rangeEnd = istToIso(addDaysKey(istDateKey(), 21), '00:00');
      const typeFilter = typesForService(service);
      const typeSql = typeFilter.map(() => '?').join(', ');
      const rawSlots = all(
        `SELECT * FROM time_slots WHERE provider_id IN (${placeholders}) AND service_type IN (${typeSql})
           AND start_at >= ? AND start_at < ? AND status IN ('AVAILABLE','TENTATIVE','BOOKED')
         ORDER BY start_at`,
        [...providerIds, ...typeFilter, rangeStart, rangeEnd]
      );
      const nowThreshold = Date.now();
      const visible = rawSlots.filter((slot) => {
        const p = providerMap.get(slot.provider_id);
        const notice = Math.max(globalNotice, p?.min_notice_hours || 0);
        return new Date(slot.start_at).getTime() >= nowThreshold + notice * 3600000;
      });

      const dayKeys = [];
      for (let i = 0; i < 14; i++) dayKeys.push(addDaysKey(istDateKey(), i));
      const counts = new Map(dayKeys.map((d) => [d, 0]));
      for (const slot of visible) {
        if (slot.status !== 'AVAILABLE') continue;
        const key = istDateKey(new Date(slot.start_at));
        if (counts.has(key)) counts.set(key, counts.get(key) + 1);
      }
      const days = dayKeys.map((key) => ({
        date: key,
        weekday: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${key}T12:00:00+05:30`)),
        day: Number(key.slice(-2)),
        month: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${key}T12:00:00+05:30`)),
        count: counts.get(key) || 0,
        isToday: key === istDateKey(),
      }));
      const nextAvailable = days.find((d) => d.count > 0)?.date || null;
      if (!ctx.query.date && nextAvailable) {
        // Keep today selected so the empty state is honest; the UI can jump to next available.
      }
      const daySlots = visible.filter((slot) => istDateKey(new Date(slot.start_at)) === selectedDate).map((slot) => {
        const p = providerMap.get(slot.provider_id);
        return {
          id: slot.id,
          providerId: slot.provider_id,
          providerName: p?.display_name || '',
          providerSlug: p?.slug || '',
          startAt: slot.start_at,
          endAt: slot.end_at,
          timeLabel: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(slot.start_at)),
          status: slot.status,
          statusLabel: slot.status === 'AVAILABLE' ? 'Available' : slot.status === 'TENTATIVE' ? 'Request pending' : 'Booked',
          requestable: slot.status === 'AVAILABLE' || slot.status === 'TENTATIVE',
          duration: Math.round((new Date(slot.end_at) - new Date(slot.start_at)) / 60000),
        };
      });
      const groups = { morning: [], afternoon: [], evening: [] };
      for (const slot of daySlots) {
        const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(slot.startAt)));
        if (hour < 12) groups.morning.push(slot);
        else if (hour < 17) groups.afternoon.push(slot);
        else groups.evening.push(slot);
      }
      return {
        days, groups, slots: daySlots, selectedDate, nextAvailable,
        timezone: 'India Standard Time (IST)',
        service: service ? { id: service.id, name: service.name, type: service.service_type, duration: service.default_duration_min } : null,
        providers: providers.map((p) => ({ id: p.id, name: p.display_name, slug: p.slug, city: p.city, type: p.provider_type })),
        noticeHours: globalNotice,
        message: daySlots.length ? null : 'No slots on this day. Try the next date with availability.',
      };
    },
  };
}

function typesForService(service) {
  if (service?.service_type === 'CONSULTATION') return ['CONSULTATION'];
  return ['PUJA'];
}

function eventRoutes() {
  return [
    {
      method: 'GET', path: '/api/events', handler: async (ctx) => {
        const kind = ctx.query.kind;
        const where = ["e.status = 'PUBLISHED'", 'e.end_at > ?'];
        const params = [nowIso()];
        if (['HOMAM', 'GROUP_PUJA', 'FESTIVAL', 'SATSANG', 'WORKSHOP'].includes(kind)) { where.push('e.event_kind = ?'); params.push(kind); }
        const rows = all(
          `SELECT e.*, p.display_name AS lead_name, p.slug AS lead_slug, s.name AS service_name, s.slug AS service_slug,
             (SELECT COUNT(*) FROM event_waitlist w WHERE w.event_id = e.id) AS waitlist_count
           FROM events e LEFT JOIN providers p ON p.id = e.lead_provider_id LEFT JOIN services s ON s.id = e.service_id
           WHERE ${where.join(' AND ')} ORDER BY e.start_at`,
          params
        );
        return { events: rows.map(eventOut), total: rows.length };
      },
    },
    {
      method: 'GET', path: '/api/events/:slug', handler: async (ctx) => {
        const row = get(
          `SELECT e.*, p.display_name AS lead_name, p.slug AS lead_slug, s.name AS service_name, s.slug AS service_slug,
             (SELECT COUNT(*) FROM event_waitlist w WHERE w.event_id = e.id) AS waitlist_count
           FROM events e LEFT JOIN providers p ON p.id = e.lead_provider_id LEFT JOIN services s ON s.id = e.service_id
           WHERE e.slug = ? AND e.status = 'PUBLISHED'`,
          [ctx.params.slug]
        );
        if (!row) throw new HttpError(404, 'That gathering could not be found');
        const sessions = all('SELECT * FROM event_sessions WHERE event_id = ? ORDER BY start_at', [row.id]);
        const lead = row.lead_provider_id ? providerOut(get('SELECT * FROM providers WHERE id = ?', [row.lead_provider_id])) : null;
        const related = all(
          `SELECT e.*, p.display_name AS lead_name, p.slug AS lead_slug FROM events e
             LEFT JOIN providers p ON p.id = e.lead_provider_id
            WHERE e.id <> ? AND e.status = 'PUBLISHED' AND e.end_at > ? ORDER BY e.start_at LIMIT 2`,
          [row.id, nowIso()]
        ).map(eventOut);
        return {
          event: eventOut(row),
          sessions: sessions.map((s) => ({ id: s.id, title: s.title, startAt: s.start_at, endAt: s.end_at, description: s.description, timeLabel: s.start_at ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(s.start_at)) : '' })),
          lead,
          related,
          faqs: all("SELECT * FROM faqs WHERE is_active = 1 AND category IN ('Events','Payments') ORDER BY display_order"),
        };
      },
    },
  ];
}

function contentRoutes() {
  return [
    {
      method: 'GET', path: '/api/horoscope', handler: async (ctx) => {
        const sign = SIGNS.find((s) => s.code === String(ctx.query.sign || 'aries').toLowerCase())?.code || 'aries';
        const period = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(ctx.query.period || '').toUpperCase()) ? String(ctx.query.period).toUpperCase() : 'DAILY';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : istDateKey();
        const reading = ensureHoroscope(sign, period, date);
        return {
          reading,
          signs: signCards(date),
          period,
          periodLabel: periodLabel(period, date),
          date,
          panchang: publicPanchang(date),
          festivals: upcomingFestivals(5),
        };
      },
    },
    {
      method: 'GET', path: '/api/panchang', handler: async (ctx) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : istDateKey();
        const panchang = publicPanchang(date);
        const nearby = [];
        for (let i = 0; i < 5; i++) {
          const key = addDaysKey(date, i);
          nearby.push({ date: key, ...publicPanchang(key) });
        }
        return {
          panchang,
          nearby,
          festivals: upcomingFestivals(8),
          dates: Array.from({ length: 7 }, (_, i) => addDaysKey(istDateKey(), i)),
        };
      },
    },
    {
      method: 'GET', path: '/api/faqs', handler: async () => {
        const faqs = all('SELECT * FROM faqs WHERE is_active = 1 ORDER BY category, display_order');
        const grouped = {};
        for (const faq of faqs) (grouped[faq.category] ||= []).push(faq);
        return { faqs, grouped };
      },
    },
    {
      method: 'GET', path: '/api/testimonials', handler: async () => {
        const rows = all('SELECT * FROM testimonials WHERE is_published = 1 ORDER BY rating DESC, customer_name');
        return { testimonials: rows };
      },
    },
    {
      method: 'GET', path: '/api/settings/public', handler: async () => ({ settings: publicSettings() }),
    },
    {
      method: 'GET', path: '/api/check', handler: async (ctx) => {
        const serviceRef = ctx.query.service || '';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(ctx.query.date || '') ? ctx.query.date : null;
        const city = str(ctx.query.city || '', { max: 80 });
        const service = serviceRef ? get('SELECT * FROM services WHERE (slug = ? OR id = ?) AND is_active = 1', [serviceRef, serviceRef]) : null;
        let primary = primaryPandit();
        if (!primary) throw new HttpError(404, 'The pandit profile is not configured yet');
        if (!primary.is_active) throw new HttpError(404, 'Availability is paused right now');
        ensureSlotsForProvider(primary.id, 25);
        const availabilityTypes = service
          ? [service.service_type]
          : ['PUJA', 'CONSULTATION'];
        const targetDate = date || istDateKey();
        const start = istToIso(targetDate, '00:00');
        const end = istToIso(addDaysKey(targetDate, 1), '00:00');
        const slots = all(
          `SELECT * FROM time_slots WHERE provider_id = ? AND status = 'AVAILABLE' AND start_at >= ? AND start_at < ?
           AND service_type IN (${availabilityTypes.map(() => '?').join(',')}) ORDER BY start_at`,
          [primary.id, start, end, ...availabilityTypes]
        ).filter((slot) => new Date(slot.start_at).getTime() > Date.now() + Math.max(12, primary.min_notice_hours) * 3600000);
        const result = [{
          ...providerOut(primary),
          availableCount: slots.length,
          slots: slots.slice(0, 3).map((s) => ({ id: s.id, startAt: s.start_at, label: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(s.start_at)) })),
        }];
        return {
          service: service ? serviceOut(service) : null,
          date: date || istDateKey(),
          providers: result,
          pandit: providerOut(primary),
          totalAvailable: slots.length,
          message: slots.length ? null : 'No matching slots on this date. You can still send a request with an alternative time.',
        };
      },
    },
    {
      method: 'POST', path: '/api/enquiries', handler: async (ctx) => {
        const name = str(ctx.body.name, { min: 2, max: 150, field: 'Name', required: true });
        const phoneRaw = str(ctx.body.phone, { max: 25, field: 'Phone' });
        const phone = phoneRaw ? (normalizePhone(phoneRaw) || phoneRaw) : '';
        const email = str(ctx.body.email, { max: 150, field: 'Email' });
        const message = str(ctx.body.message, { min: 5, max: 3000, field: 'Message', required: true });
        assert(phone || email, 422, 'Please leave a phone number or email so we can reply');
        if (email) assert(isEmail(email), 422, 'Enter a valid email address');
        const id = uuid();
        insert('enquiries', {
          id, name, email: email || null, phone: phone || null,
          subject: str(ctx.body.subject, { max: 150 }) || 'General enquiry', message,
          status: 'NEW', created_at: nowIso(),
        });
        const owner = get("SELECT id FROM users WHERE role = 'OWNER' LIMIT 1");
        if (owner) {
          insert('inapp_notifications', {
            id: uuid(), user_id: owner.id, title: 'New website enquiry',
            body: `${name}: ${message.slice(0, 120)}`, link: '#/admin/customers', read_at: null, created_at: nowIso(),
          });
        }
        return { ok: true, message: 'Thank you — we have your note and will reply within one working day.' };
      },
    },
    {
      method: 'POST', path: '/api/newsletter', handler: async (ctx) => {
        const email = str(ctx.body.email, { max: 150, field: 'Email', required: true }).toLowerCase();
        assert(isEmail(email), 422, 'Enter a valid email address');
        const exists = get('SELECT id FROM newsletter_subscribers WHERE email = ?', [email]);
        if (!exists) insert('newsletter_subscribers', { id: uuid(), email, created_at: nowIso() });
        return { ok: true, message: 'You are on the list. A gentle note will arrive with the next full moon.' };
      },
    },
    {
      method: 'GET', path: '/api/notifications', handler: async (ctx) => {
        const { requireUser } = require('./auth');
        const user = requireUser(ctx);
        const rows = all('SELECT * FROM inapp_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [user.id]);
        return {
          notifications: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: Boolean(n.read_at), createdAt: n.created_at })),
          unread: rows.filter((n) => !n.read_at).length,
        };
      },
    },
    {
      method: 'POST', path: '/api/notifications/read', handler: async (ctx) => {
        const { requireUser } = require('./auth');
        const user = requireUser(ctx);
        run('UPDATE inapp_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), user.id]);
        return { ok: true };
      },
    },
    {
      method: 'POST', path: '/api/bookings', handler: async (ctx) => {
        const { str, assert } = require('./http');
        const { nowIso, uuid } = require('./util');
        const body = ctx.body;
        // Validate required fields
        const name = str(body.contact?.name, { min: 2, max: 150, field: 'Name', required: true });
        const phoneRaw = str(body.contact?.phone, { max: 25, field: 'Phone' });
        const phone = phoneRaw ? normalizePhone(phoneRaw) || phoneRaw : '';
        const email = str(body.contact?.email, { max: 150, field: 'Email' });
        assert(phone || email, 422, 'Please leave a phone number or email so we can reply');
        
        const id = uuid();
        const primary = primaryPandit();
        const providerId = primary ? primary.id : null;
        const serviceId = body.serviceId || null;
        const eventId = body.type === 'EVENT' ? body.eventId : null;
        
        const { insert, all } = require('./db');
        const result = insert('bookings', {
          id,
          booking_ref: 'BK-' + (new Date()).toISOString().replace(/-/g, '').slice(0, 8) + '-' + String(id).padStart(4, '0'),
          booking_type: body.type,
          service_id: serviceId,
          event_id: eventId,
          provider_id: providerId,
          status: 'REQUESTED',
          customer_name: name,
          customer_phone: phone || null,
          customer_email: email || null,
          // Link the booking to the signed-in account (if any) so it
          // appears under Account → My bookings.
          customer_id: ctx.user?.id || null,
          preferred_start_at: body.details?.date ? new Date(body.details.date).toISOString() : null,
          requested_at: nowIso(),
          created_at: nowIso(),
          updated_at: nowIso(),
        });
        
        // Queue notification for owner
        const owner = all("SELECT id FROM users WHERE role = 'OWNER' LIMIT 1");
        if (owner && owner.length > 0 && owner[0].id) {
          insert('inapp_notifications', {
            id: uuid(),
            user_id: owner[0].id,
            title: 'New booking request',
            body: `New ${body.type} request: ${name}`,
            link: '#/admin/inbox',
            read_at: null,
            created_at: nowIso(),
          });
        }
        
        return { ok: true, ref: result.booking_ref || id };
      },
    },
  ];
}

module.exports = [
  metaRoute(), configRoute(), homeRoute(), ...serviceRoutes(), ...providerRoutes(), availabilityRoute(),
  ...eventRoutes(), ...contentRoutes(),
];
