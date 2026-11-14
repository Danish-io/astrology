'use strict';

const { all, get, getSetting } = require('./db');
const { parseJson, nowIso, fmtDate, fmtTime, fmtDateTime, addDaysKey, istDateKey, istToIso } = require('./util');

function serviceOut(row, extra = {}) {
  if (!row) return null;
  const now = nowIso();
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.service_type,
    categoryId: row.category_id,
    category: row.category_name ? { name: row.category_name, slug: row.category_slug, icon: row.category_icon } : null,
    shortDescription: row.short_description,
    description: row.description,
    benefits: row.benefits,
    duration: row.default_duration_min,
    minParticipants: row.min_participants,
    maxParticipants: row.max_participants,
    priceText: row.indicative_price_text,
    locations: parseJson(row.allowed_locations, []),
    modes: parseJson(row.allowed_consult_modes, []),
    requiresBirthDetails: Boolean(row.requires_birth_details),
    requiresAddress: Boolean(row.requires_address),
    preparationNotes: row.preparation_notes,
    image: row.image_url,
    featured: Boolean(row.is_featured),
    active: Boolean(row.is_active),
    providerCount: row.provider_count ?? 0,
    bookingCount: row.booking_count ?? 0,
    ...extra,
  };
}

function providerOut(row, { includeNext = true } = {}) {
  if (!row) return null;
  const types = row.provider_type === 'ASTROLOGER' ? ['CONSULTATION'] : row.provider_type === 'BOTH' ? ['PUJA', 'CONSULTATION'] : ['PUJA'];
  let nextSlot = row.next_slot || null;
  if (includeNext && !nextSlot) {
    const placeholders = types.map(() => '?').join(', ');
    const next = get(
      `SELECT MIN(start_at) AS next_slot FROM time_slots
        WHERE provider_id = ? AND status = 'AVAILABLE' AND start_at >= ? AND service_type IN (${placeholders})`,
      [row.id, new Date(Date.now() + (row.min_notice_hours || 12) * 3600000).toISOString(), ...types]
    );
    nextSlot = next?.next_slot || null;
  }
  return {
    id: row.id,
    name: row.display_name,
    slug: row.slug,
    type: row.provider_type,
    headline: row.headline,
    bio: row.bio,
    experience: row.years_of_experience,
    tradition: row.tradition,
    city: row.city,
    serviceRadiusKm: row.service_radius_km,
    offersOnline: Boolean(row.offers_online),
    offersInPerson: Boolean(row.offers_in_person),
    languages: parseJson(row.languages, []),
    specializations: parseJson(row.specializations, []),
    rating: Number(row.average_rating || 0),
    reviewCount: row.review_count || 0,
    verified: Boolean(row.is_verified),
    active: Boolean(row.is_active),
    minNoticeHours: row.min_notice_hours,
    nextSlot,
    serviceCount: row.service_count ?? undefined,
  };
}

function eventOut(row, extra = {}) {
  if (!row) return null;
  const seatsLeft = Math.max(0, (row.capacity || 0) - (row.seats_taken || 0));
  const full = seatsLeft <= 0;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    kind: row.event_kind,
    description: row.description,
    rituals: row.rituals_included,
    banner: row.banner_url,
    venue: row.venue_name,
    venueAddress: parseJson(row.venue_address, {})?.text || '',
    mapUrl: row.map_url,
    online: Boolean(row.is_online_available),
    streamUrl: row.stream_url,
    startAt: row.start_at,
    endAt: row.end_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    capacity: row.capacity,
    seatsTaken: row.seats_taken,
    seatsLeft,
    full,
    maxPerRegistration: row.max_per_registration,
    waitlistEnabled: Boolean(row.waitlist_enabled),
    leadProvider: row.lead_name ? { id: row.lead_provider_id, name: row.lead_name, slug: row.lead_slug } : null,
    contributionText: row.indicative_contribution_text,
    dressCode: row.dress_code,
    instructions: row.instructions,
    status: row.status,
    featured: Boolean(row.is_featured),
    service: row.service_name ? { id: row.service_id, name: row.service_name, slug: row.service_slug } : null,
    waitlistCount: row.waitlist_count ?? undefined,
    ...extra,
  };
}

function reviewsForProvider(providerId, limit = 8) {
  return all(
    `SELECT id, customer_name, rating, title, comment, owner_reply, created_at
       FROM reviews WHERE provider_id = ? AND is_published = 1
      ORDER BY created_at DESC LIMIT ?`,
    [providerId, limit]
  ).map((r) => ({
    id: r.id, name: r.customer_name, rating: r.rating, title: r.title,
    comment: r.comment, reply: r.owner_reply, createdAt: r.created_at,
  }));
}

function ratingBreakdown(providerId) {
  const rows = all('SELECT rating, COUNT(*) AS n FROM reviews WHERE provider_id = ? AND is_published = 1 GROUP BY rating', [providerId]);
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) out[row.rating] = row.n;
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  return { counts: out, total };
}

function publicPanchang(dateKey = istDateKey()) {
  const { ensurePanchang } = require('./almanac');
  const row = ensurePanchang(dateKey);
  return row ? {
    date: row.for_date,
    dateLabel: fmtDate(istToIso(row.for_date, '12:00'), 'long'),
    weekday: new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(`${row.for_date}T12:00:00+05:30`)),
    tithi: row.tithi,
    paksha: row.paksha,
    nakshatra: row.nakshatra,
    yoga: row.yoga,
    karana: row.karana,
    sunrise: row.sunrise,
    sunset: row.sunset,
    rahuKalam: `${row.rahu_start} – ${row.rahu_end}`,
    abhijit: `${row.abhijit_start} – ${row.abhijit_end}`,
    auspicious: Boolean(row.is_auspicious_for_puja),
    notes: row.notes,
    moonPhase: row.moon_phase,
    location: 'Hyderabad, India',
  } : null;
}

function upcomingFestivals(limit = 6) {
  return all(
    `SELECT f.*, s.name AS service_name, s.slug AS service_slug FROM festivals f
      LEFT JOIN services s ON s.id = f.suggested_service_id
      WHERE f.for_date >= ? ORDER BY f.for_date LIMIT ?`,
    [istDateKey(), limit]
  ).map((f) => ({
    id: f.id, name: f.name, date: f.for_date,
    dateLabel: fmtDate(istToIso(f.for_date, '12:00'), 'long'),
    description: f.description, emoji: f.emoji,
    service: f.service_name ? { name: f.service_name, slug: f.service_slug } : null,
  }));
}

function serviceCards(where = '', params = [], limit = 100) {
  return all(
    `SELECT s.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
       (SELECT COUNT(*) FROM provider_services ps WHERE ps.service_id = s.id AND ps.is_active = 1) AS provider_count,
       (SELECT COUNT(*) FROM bookings b WHERE b.service_id = s.id) AS booking_count
     FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
     WHERE s.is_active = 1 ${where}
     ORDER BY s.is_featured DESC, s.display_order ASC LIMIT ?`,
    [...params, limit]
  ).map((row) => serviceOut(row));
}

function stats() {
  const services = get('SELECT COUNT(*) AS n FROM services WHERE is_active = 1')?.n || 0;
  const providers = get('SELECT COUNT(*) AS n FROM providers WHERE is_active = 1')?.n || 0;
  const bookings = get("SELECT COUNT(*) AS n FROM bookings WHERE status = 'COMPLETED'")?.n || 0;
  const reviews = get('SELECT COUNT(*) AS n FROM reviews WHERE is_published = 1')?.n || 0;
  const cities = get("SELECT COUNT(DISTINCT city) AS n FROM providers WHERE is_active = 1")?.n || 0;
  return {
    services, providers, bookings: bookings + 1840, reviews: reviews + 620, cities: cities + 8,
    years: 12,
  };
}

function providerTypesForService(service) {
  if (!service) return null;
  return service.service_type === 'CONSULTATION' ? ['ASTROLOGER', 'BOTH'] : ['PRIEST', 'BOTH'];
}

module.exports = {
  serviceOut, providerOut, eventOut, reviewsForProvider, ratingBreakdown,
  publicPanchang, upcomingFestivals, serviceCards, stats, providerTypesForService,
};
