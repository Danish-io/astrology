'use strict';

const { db, all, get, run, insert, update, tx, setSetting, getSetting } = require('./db');
const { uuid, nowIso, scryptHash, istDateKey, addDaysKey, istToIso, bookingRef, slugify } = require('./util');
const { SIGNS } = require('./almanac');
const { ensureAllSlots } = require('./slots');
const { queueNewBooking, queueStatusNotification, notifyInApp, processOutbox } = require('./notify');

function seed({ force = false } = {}) {
  const existing = get('SELECT COUNT(*) AS n FROM users');
  if (existing && existing.n > 0 && !force) return { seeded: false };
  if (force) {
    db.exec('PRAGMA foreign_keys = OFF;');
    const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}";`);
    db.exec('PRAGMA foreign_keys = ON;');
    // schema is created by db.js only at load; rebuild through a fresh require cycle is messy.
    // The caller (scripts/seed.js) restarts the process after deleting the DB for a clean reset.
    if (!get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")) {
      throw new Error('Schema missing after reset; delete data/aradhana.db and restart.');
    }
  }

  const ts = nowIso();
  let users, providers, services, events;
  tx(() => {
    seedSettings();
    users = seedUsers(ts);
    providers = seedProviders(ts, users);
    const categories = seedCategories();
    services = seedServices(ts, categories);
    seedSamagri(services);
    seedProviderServices(providers, services);
    seedAvailability(providers);
    events = seedEvents(ts, services, providers);
    seedSigns();
    seedFestivals(services);
    seedFaqs();
    seedTestimonials(services);
    seedTemplates();
    seedRecipients();
    seedDemoProfiles(users.demo);
  });

  ensureAllSlots(45);
  tx(() => seedBookingsAndReviews(providers, services, events));
  processOutbox(200);
  return { seeded: true };
}

function seedSettings() {
  const settings = [
    ['site.name', 'Aradhana', 'Public site name', 'Pujas, horoscope guidance and sacred gatherings.'],
    ['site.tagline', 'Rituals, guidance, and a little cosmic clarity', 'Hero tagline'],
    ['site.primary_provider_slug', 'pandit-ramesh-sharma', 'The pandit this practice is built around'],
    ['site.pandit_name', 'Pandit Ramesh Sharma', 'Pandit name shown across the public site'],
    ['site.pandit_short_name', 'Pandit ji', 'Warm short form used in copy'],
    ['site.pandit_title', 'Vedic priest & jyotish guide · Hyderabad', 'Pandit title line'],
    ['site.pandit_since', '2004', 'Year the practice began'],
    ['site.consult_heading', 'Personal guidance with Pandit ji', 'Consultation section heading'],
    ['site.contact_phone', '+91 90000 12345', 'Public phone'],
    ['site.contact_whatsapp', '+919000012345', 'Public WhatsApp number'],
    ['site.email', 'namaste@aradhana.in', 'Public email'],
    ['site.address', '12 Lotus Lane, Jubilee Hills, Hyderabad 500033', 'Studio address'],
    ['site.hours', 'Mon–Sat, 9:00 AM – 8:00 PM IST', 'Support hours'],
    ['booking.hold_hours', 24, 'How long a tentative slot is held'],
    ['booking.auto_expire_hours', 48, 'Auto-expire untouched requests'],
    ['booking.min_notice_hours', 12, 'Minimum notice for a request'],
    ['booking.max_advance_days', 75, 'How far ahead customers can request'],
    ['booking.max_open_requests_per_phone', 3, 'Anti-spam limit'],
    ['notify.owner_escalation_minutes', 10, 'Escalate if owner has not opened a request'],
    ['notify.reminder_hours', [24, 1], 'Booking reminder schedule'],
    ['otp.ttl_minutes', 10, 'OTP validity'],
    ['privacy.retention_months', 36, 'Anonymise records after this period'],
    ['privacy.policy_version', '2026-01', 'Current policy version'],
    ['booking.cancellation_window_hours', 12, 'Free cancellation window'],
    ['site.instagram', 'https://instagram.com', 'Instagram URL'],
    ['site.youtube', 'https://youtube.com', 'YouTube URL'],
  ];
  for (const [key, value, description, ...rest] of settings) {
    if (!getSetting(key)) setSetting(key, value, description || rest[0] || null);
  }
}

function seedUsers(ts) {
  const users = {};
  const add = (key, data) => {
    const row = {
      id: uuid(), full_name: data.full_name, phone: data.phone || null, email: data.email || null,
      password_hash: data.password ? scryptHash(data.password) : null,
      role: data.role || 'CUSTOMER', preferred_language: data.language || 'en',
      contact_channel: data.contact_channel || 'CALL', call_window: data.call_window || null,
      marketing_opt_in: data.marketing_opt_in ? 1 : 0, city: data.city || null,
      is_active: 1, last_login_at: null, created_at: ts, updated_at: ts, deleted_at: null,
    };
    insert('users', row);
    users[key] = row;
    return row;
  };

  // Staff/owner do NOT get local password hashes — their accounts exist here
  // only as references for bookings/roles. All staff sign-in goes through
  // Supabase Auth (see scripts/provision-staff-auth.js). Legacy scrypt hashes
  // of well-known demo passwords must never exist in this database.
  add('owner', { full_name: 'Aditi Sharma', email: 'owner@aradhana.in', role: 'OWNER', city: 'Hyderabad', language: 'en' });
  add('support', { full_name: 'Kabir Nair', email: 'support@aradhana.in', role: 'SUPPORT', city: 'Pune', language: 'en' });
  add('demo', { full_name: 'Anita Rao', phone: '+919876543210', email: 'anita@example.com', role: 'CUSTOMER', city: 'Hyderabad', contact_channel: 'WHATSAPP', call_window: 'Evening 6–9 PM', marketing_opt_in: true });
  add('ravi', { full_name: 'Ravi Kumar', phone: '+919876500011', email: 'ravi@example.com', city: 'Bengaluru' });
  add('priya', { full_name: 'Priya Menon', phone: '+919876500012', email: 'priya@example.com', city: 'Pune', contact_channel: 'CALL', call_window: 'Morning 9–12' });
  add('suresh', { full_name: 'Suresh Patel', phone: '+919876500013', email: 'suresh@example.com', city: 'Hyderabad' });
  add('meera', { full_name: 'Meera Nair', phone: '+919876500014', email: 'meera@example.com', city: 'Chennai' });
  add('karthik', { full_name: 'Karthik Rao', phone: '+919876500015', email: 'karthik@example.com', city: 'Bengaluru' });
  add('neha', { full_name: 'Neha Gupta', phone: '+919876500016', email: 'neha@example.com', city: 'Delhi' });
  add('arvindc', { full_name: 'Arvind Iyer', phone: '+919876500017', email: 'arvind@example.com', city: 'Chennai' });

  for (const [key, name, email, city] of [
    ['ramesh', 'Pandit Ramesh Sharma', 'ramesh@aradhana.in', 'Hyderabad'],
    ['venkatesh', 'Pandit Venkatesh Iyer', 'venkatesh@aradhana.in', 'Bengaluru'],
    ['lakshmi', 'Acharya Lakshmi Devi', 'lakshmi@aradhana.in', 'Hyderabad'],
    ['mohan', 'Pandit Mohan Tiwari', 'mohan@aradhana.in', 'Varanasi'],
    ['ananya', 'Dr. Ananya Joshi', 'ananya@aradhana.in', 'Pune'],
    ['arvind', 'Guru Arvind Shastri', 'arvind@aradhana.in', 'Chennai'],
  ]) {
    add(key, { full_name: name, email, role: 'PROVIDER', city });
  }
  return users;
}

function seedProviders(ts, users) {
  const providers = {};
  const list = [
    {
      key: 'ramesh', user: users.ramesh, type: 'BOTH', name: 'Pandit Ramesh Sharma',
      headline: 'Household pujas, homams and personal jyotish guidance — performed with care',
      bio: 'For over two decades, Pandit Ramesh Sharma has been the person families in Hyderabad call when a home needs blessing, a wedding needs a muhurat, or a difficult season needs some guidance. Trained in the Smartha tradition, he performs each ceremony himself and explains every step in simple language, so that grandparents and children can participate together.\n\nHis practice is deliberately small. Every request is read by him, every consultation is with him, and every puja is performed by him or under his direct supervision. There are no call centres or rotating astrologers — just a steady relationship with one family priest.',
      exp: 22, tradition: 'Smartha', city: 'Hyderabad', languages: ['Telugu', 'Hindi', 'English', 'Sanskrit'], specs: ['Griha Pravesh', 'Satyanarayana', 'Rudrabhishek', 'Birth Chart', 'Kundli Matching', 'Homam'],
      rating: 4.8, count: 126, verified: 1, order: 1, radius: 35,
    },
    {
      key: 'venkatesh', user: users.venkatesh, type: 'PRIEST', name: 'Pandit Venkatesh Iyer',
      headline: 'Vaishnava rituals, Navagraha shanti and temple ceremonies',
      bio: 'A third-generation Vaishnava priest from Bengaluru, Venkatesh ji specialises in Satyanarayana vratam, Navagraha shanti and Rudrabhishek. He is fluent in Tamil, Telugu and English, and is especially good with families visiting from abroad.',
      exp: 18, tradition: 'Vaishnava', city: 'Bengaluru', languages: ['Tamil', 'Telugu', 'English', 'Sanskrit'], specs: ['Satyanarayana', 'Navagraha Shanti', 'Rudrabhishek', 'Temple Pujas'],
      rating: 4.9, count: 98, verified: 1, order: 2, radius: 30,
    },
    {
      key: 'lakshmi', user: users.lakshmi, type: 'ASTROLOGER', name: 'Acharya Lakshmi Devi',
      headline: 'Birth chart readings with a practical, compassionate approach',
      bio: 'Acharya Lakshmi has practised Vedic and KP astrology for 14 years. Her readings are known for being specific, kind and free of fear-based predictions. She specialises in career direction, marriage compatibility and family harmony, and offers sessions in Telugu, Hindi and English.',
      exp: 14, tradition: 'Vedic & KP', city: 'Hyderabad', languages: ['Telugu', 'Hindi', 'English'], specs: ['Birth Chart', 'Kundli Matching', 'Career', 'Marriage'],
      rating: 4.9, count: 156, verified: 1, order: 3, radius: 0, online: 1, inPerson: 1,
    },
    {
      key: 'mohan', user: users.mohan, type: 'PRIEST', name: 'Pandit Mohan Tiwari',
      headline: 'Rudrabhishek, Shraddha and Kashi-style Vedic ceremonies',
      bio: 'Based in Varanasi, Pandit Mohan Tiwari has performed Vedic ceremonies for 27 years. His specialities include Rudrabhishek, Navagraha shanti and ancestral rites. Families value his precise pronunciation, deep knowledge of scripture and the quiet dignity he brings to difficult occasions.',
      exp: 27, tradition: 'Shaiva', city: 'Varanasi', languages: ['Hindi', 'Sanskrit', 'Bhojpuri'], specs: ['Rudrabhishek', 'Shraddha', 'Navagraha Shanti', 'Maha Mrityunjaya'],
      rating: 5.0, count: 210, verified: 1, order: 4, radius: 20,
    },
    {
      key: 'ananya', user: users.ananya, type: 'ASTROLOGER', name: 'Dr. Ananya Joshi',
      headline: 'Vedic astrology, numerology and name guidance for modern lives',
      bio: 'Dr. Ananya Joshi blends classical Vedic astrology with numerology and a research-led approach. She holds a doctorate in Sanskrit and has advised founders, artists and families for over a decade. Sessions are warm, structured and end with practical next steps rather than vague predictions.',
      exp: 11, tradition: 'Vedic & Numerology', city: 'Pune', languages: ['English', 'Hindi', 'Marathi'], specs: ['Career', 'Numerology', 'Year Ahead', 'Name Guidance'],
      rating: 4.7, count: 87, verified: 1, order: 5, radius: 0, online: 1, inPerson: 1,
    },
    {
      key: 'arvind', user: users.arvind, type: 'BOTH', name: 'Guru Arvind Shastri',
      headline: 'Pujas and jyotish guidance under one compassionate roof',
      bio: 'Guru Arvind Shastri is a Vedic scholar who performs pujas and reads charts. With 20 years of practice across Chennai and Singapore, he is equally at home explaining a dasha to a first-time client or conducting a full homam. He speaks Tamil, English and Sanskrit.',
      exp: 20, tradition: 'Smartha', city: 'Chennai', languages: ['Tamil', 'English', 'Sanskrit'], specs: ['Birth Chart', 'Griha Pravesh', 'Homam', 'Kundli Matching'],
      rating: 4.8, count: 144, verified: 1, order: 6, radius: 40,
    },
  ];
  for (const p of list) {
    const row = {
      id: uuid(), user_id: p.user.id, provider_type: p.type, display_name: p.name,
      slug: slugify(p.name), photo_url: null, headline: p.headline, bio: p.bio,
      years_of_experience: p.exp, tradition: p.tradition, city: p.city,
      service_radius_km: p.radius, offers_online: p.online === undefined ? 1 : p.online,
      offers_in_person: p.inPerson === undefined ? 1 : p.inPerson,
      languages: JSON.stringify(p.languages), specializations: JSON.stringify(p.specs),
      average_rating: p.rating, review_count: p.count, min_notice_hours: 12,
      slot_buffer_minutes: p.type === 'ASTROLOGER' ? 15 : 30, is_verified: p.verified,
      is_active: p.key === 'ramesh' ? 1 : 0, display_order: p.order, created_at: ts, updated_at: ts,
    };
    insert('providers', row);
    providers[p.key] = row;
  }
  return providers;
}

function seedCategories() {
  const defs = [
    ['Home Pujas', 'PUJA', 'home', 'Warm ceremonies for the place you call home.'],
    ['Life Events', 'PUJA', 'lotus', 'Sanskaras that mark the passages of a life.'],
    ['Planet Remedies', 'PUJA', 'planet', 'Shanti and remedies guided by your chart.'],
    ['Homam & Fire Rituals', 'PUJA', 'fire', 'Sacred fire, collective intention, transformation.'],
    ['Horoscope & Guidance', 'CONSULTATION', 'moon', 'Clarity from someone who reads carefully.'],
  ];
  return defs.map(([name, type, icon, tagline], index) => {
    const row = { id: uuid(), name, slug: slugify(name), service_type: type, icon, tagline, display_order: index + 1 };
    insert('service_categories', row);
    return row;
  });
}

function seedServices(ts, categories) {
  const cat = Object.fromEntries(categories.map((c) => [c.slug, c]));
  // Friendly category keys used by the service definitions.
  cat.homam = categories.find((c) => c.slug === 'homam-fire-rituals');
  cat.horoscope = categories.find((c) => c.slug === 'horoscope-guidance');
  const services = {};
  const defs = [
    {
      key: 'griha-pravesh', category: 'home-pujas', type: 'PUJA', name: 'Griha Pravesh Puja',
      price: 'Discussed after request', duration: 120, featured: 1, locations: ['CUSTOMER_HOME', 'TEMPLE', 'ONLINE'], address: 1,
      tagline: 'A blessing for your new beginning.',
      desc: 'Griha Pravesh is the ceremony of entering a new home with intention. We invoke Ganesha to remove obstacles, seek the blessings of the Vastu purusha, and establish a gentle, auspicious rhythm for the home.\n\nThe priest performs the Ganapati puja, Kalash sthapana, Vastu shanti and the first formal aarti. Families are welcome to participate — no prior knowledge of Sanskrit is needed.',
      benefits: 'Clears the space energetically; invokes stability and prosperity; brings the family together in a shared intention; includes practical guidance on the first night and the days that follow.',
      image: 'home', prep: 'Keep the main entrance clean and uncluttered. A small rangoli, fresh flowers and a lamp are lovely but optional. The priest will bring the main samagri unless you choose otherwise.',
    },
    {
      key: 'satyanarayana', category: 'home-pujas', type: 'PUJA', name: 'Satyanarayana Vratam',
      price: 'Discussed after request', duration: 120, featured: 1, locations: ['CUSTOMER_HOME', 'TEMPLE', 'ONLINE'], address: 1,
      tagline: 'Gratitude, patience, and a promise kept.',
      desc: 'A beloved household vratam dedicated to Lord Vishnu in his Satyanarayana form. It is traditionally performed for gratitude, family wellbeing, a new venture, or the fulfilment of a vow.\n\nThe ritual includes the story recital, Vishnu sahasranama, and distribution of prasadam. It can be a quiet family gathering or a larger celebration.',
      benefits: 'A grounding ritual of gratitude; supports harmony and patience within the family; traditionally performed on Purnima or an auspicious day chosen by the priest.',
      image: 'lotus', prep: 'Prepare a small altar with a clean cloth, a lamp and a fruit. You may have the priest bring the complete samagri.',
    },
    {
      key: 'lakshmi-kubera', category: 'home-pujas', type: 'PUJA', name: 'Lakshmi Kubera Puja',
      price: 'Discussed after request', duration: 90, featured: 1, locations: ['CUSTOMER_HOME', 'ONLINE'], address: 1,
      tagline: 'Invite steadiness and abundance.',
      desc: 'A graceful worship of Goddess Lakshmi and Lord Kubera, especially observed on Friday evenings and during the festival season. The puja welcomes prosperity not as mere accumulation, but as the capacity to hold and share what comes.',
      benefits: 'A calm, hopeful ritual for financial clarity; includes a simple wealth blessing and guidance on where to place the altar at home.',
      image: 'kalash', prep: 'Keep the puja space near the entrance or in the north-east. The priest will guide the placement of coins and kalash.',
    },
    {
      key: 'ganapati', category: 'home-pujas', type: 'PUJA', name: 'Ganapati Puja',
      price: 'Discussed after request', duration: 60, featured: 1, locations: ['CUSTOMER_HOME', 'TEMPLE', 'ONLINE'], address: 1,
      tagline: 'Begin with the remover of obstacles.',
      desc: 'A compact, joyful puja to Lord Ganesha before a new job, a journey, an exam or a fresh chapter. The ritual can be performed at home or in a temple, with the family gathered around a simple altar.',
      benefits: 'Perfect before any beginning; short and child-friendly; includes a modak offering and a simple blessing for the whole family.',
      image: 'diya', prep: 'Bring two modaks or a fruit if possible. Everything else can be arranged by the priest.',
    },
    {
      key: 'rudrabhishek', category: 'planet-remedies', type: 'PUJA', name: 'Rudrabhishek',
      price: 'Discussed after request', duration: 90, featured: 1, locations: ['TEMPLE', 'CUSTOMER_HOME', 'ONLINE'], address: 0,
      tagline: 'Soothing the mind through sacred abhishek.',
      desc: 'Rudrabhishek is the ceremonial bathing of the Shiva lingam with milk, honey, ghee and rose water, accompanied by the Rudram chant. It is a deeply calming ritual, often performed during Shravan or when peace of mind is needed.',
      benefits: 'Traditionally performed for mental calm, resilience and relief from fear; includes Shiva dhyana and a guided sankalpam.',
      image: 'fire', prep: 'White flowers and a clean cloth are welcome. The priest will bring the abhishek dravyas.',
    },
    {
      key: 'navagraha', category: 'planet-remedies', type: 'PUJA', name: 'Navagraha Shanti',
      price: 'Discussed after request', duration: 120, featured: 0, locations: ['TEMPLE', 'CUSTOMER_HOME', 'ONLINE'], address: 1,
      tagline: 'A considered remedy for planetary periods.',
      desc: 'A classical shanti homam for the nine planetary deities, chosen after reviewing your birth details. It is often requested during Sade Sati, a difficult dasha, before marriage, or at the start of an important venture.',
      benefits: 'A structured, priest-guided remedy; each planet is honoured with its own mantra and offering. The priest will explain the reasoning behind the chosen sequence.',
      image: 'planet', prep: 'Share birth details at least three days in advance. Wear traditional or comfortable clothing.',
    },
    {
      key: 'mangal-dosh', category: 'planet-remedies', type: 'PUJA', name: 'Mangal Dosha Nivaran',
      price: 'Discussed after request', duration: 90, featured: 0, locations: ['TEMPLE', 'ONLINE'], address: 0,
      tagline: 'Gentle remedies for marriage questions.',
      desc: 'A focused puja addressing the astrological combinations associated with Mangal dosha. It is always paired with a consultation, so the remedy fits the actual chart and does not rely on fear.',
      benefits: 'A clarifying conversation first, followed by a traditional remedy; suitable for families navigating marriage compatibility questions.',
      image: 'planet', prep: 'Please bring both birth charts for the initial discussion.',
    },
    {
      key: 'ayushya-homam', category: 'homam', type: 'PUJA', name: 'Ayushya Homam',
      price: 'Discussed after request', duration: 180, featured: 1, locations: ['TEMPLE', 'CUSTOMER_HOME'], address: 1,
      tagline: 'Blessings for a long, healthy life.',
      desc: 'A traditional homam performed for birthdays, especially milestone birthdays, or when a family seeks health and protection for a loved one. The fire ritual is performed to invoke the blessings of the deities of longevity.',
      benefits: 'An uplifting, meditative ceremony; children can participate; includes a small prasadam and a family blessing.',
      image: 'fire', prep: 'Arrange a clean, ventilated space if the homam is at home. The priest will advise on the fire pit and samagri.',
    },
    {
      key: 'sudarshana-homam', category: 'homam', type: 'PUJA', name: 'Maha Sudarshana Homam',
      price: 'Discussed after request', duration: 240, featured: 0, locations: ['TEMPLE'], address: 0,
      tagline: 'A collective fire ritual for protection.',
      desc: 'A powerful homam dedicated to Sudarshana, performed at our partner temples at specific festivals. Often joined by several families, it combines Vedic chanting with a shared meal and a sense of collective resilience.',
      benefits: 'Traditionally performed for protection and the removal of obstacles; a moving community experience.',
      image: 'fire', prep: 'Join our next scheduled homam from the events page, or request a private ceremony at the temple.',
    },
    {
      key: 'namakaran', category: 'life-events', type: 'PUJA', name: 'Namakaran Sanskar',
      price: 'Discussed after request', duration: 90, featured: 0, locations: ['CUSTOMER_HOME', 'TEMPLE', 'ONLINE'], address: 1,
      tagline: 'Welcome a little one, by name.',
      desc: 'The traditional naming ceremony for a newborn, performed with the family and close friends. The priest guides the naming ritual, offers blessings, and helps the family choose an auspicious time.',
      benefits: 'A tender, personal ceremony; includes a naming blessing based on the baby’s birth details if desired.',
      image: 'lotus', prep: 'Have two or three name choices ready if you would like a suggestion based on the baby’s nakshatra.',
    },
    {
      key: 'vivah', category: 'life-events', type: 'PUJA', name: 'Vivah Sanskar',
      price: 'Discussed after request', duration: 240, featured: 0, locations: ['TEMPLE', 'CUSTOMER_HOME'], address: 1,
      tagline: 'A wedding ceremony held with intention.',
      desc: 'A Vedic wedding ceremony planned with the family, from muhurat selection to the seven vows. Our priests work with your family and wedding coordinator to create a ceremony that is authentic, warm and inclusive.',
      benefits: 'Muhurat selection; explanations in English and regional languages; support for inter-community and overseas families.',
      image: 'lotus', prep: 'Begin with a conversation at least six weeks before the wedding. We will help coordinate the muhurat and the ceremony script.',
    },
    {
      key: 'shraddha', category: 'life-events', type: 'PUJA', name: 'Shraddha & Pitru Tarpan',
      price: 'Discussed after request', duration: 90, featured: 0, locations: ['CUSTOMER_HOME', 'TEMPLE'], address: 1,
      tagline: 'Honouring those who came before.',
      desc: 'A gentle ceremony to remember and honour ancestors, performed on the appropriate tithi or during Pitru Paksha. Our priests approach this ritual with sensitivity, especially for families grieving a recent loss.',
      benefits: 'Conducted with respect and clarity; includes guidance on preparation and the meaning of each step.',
      image: 'lotus', prep: 'Share the names and relationship of the ancestors you wish to remember.',
    },
    {
      key: 'birth-chart', category: 'horoscope', type: 'CONSULTATION', name: 'Birth Chart Discussion',
      price: 'Discussed after request', duration: 30, featured: 1, modes: ['CHAT', 'VOICE', 'VIDEO', 'IN_PERSON'], birth: 1,
      tagline: 'Your chart, read with care.',
      desc: 'A 30-minute conversation about your birth chart, focused on the questions you bring. Pandit ji will explain the key placements, the current dasha, and what they mean in plain language — without predictions designed to frighten you.',
      benefits: 'A clear starting point for understanding your chart; practical takeaways; a written summary PDF follows the session.',
      image: 'moon', prep: 'Have your date, time and place of birth ready. If you do not know the exact time, we can still work with a solar chart.',
    },
    {
      key: 'kundli-matching', category: 'horoscope', type: 'CONSULTATION', name: 'Kundli Matching',
      price: 'Discussed after request', duration: 45, featured: 1, modes: ['VOICE', 'VIDEO', 'IN_PERSON'], birth: 1,
      tagline: 'An honest look at two charts.',
      desc: 'A thoughtful compatibility session for couples and families. We look at the traditional kootas and the lived realities of both charts. The goal is a balanced, human conversation — not a score that decides a relationship for you.',
      benefits: 'Guna milan plus a practical discussion; both families welcome; sensitive to inter-community and modern relationships.',
      image: 'moon', prep: 'Share both birth details in the form. If time of birth is unknown for one person, let us know.',
    },
    {
      key: 'career-reading', category: 'horoscope', type: 'CONSULTATION', name: 'Career & Purpose Reading',
      price: 'Discussed after request', duration: 30, featured: 1, modes: ['CHAT', 'VOICE', 'VIDEO'], birth: 1,
      tagline: 'For the question: what should I do next?',
      desc: 'A focused session on work, purpose and timing. We look at your chart alongside the decision in front of you — a job change, a business idea, further study, or a quieter season.',
      benefits: 'Practical, non-fatalistic guidance; a summary of favourable periods; one follow-up question included by email.',
      image: 'planet', prep: 'Bring the specific decision or timeline you want to discuss.',
    },
    {
      key: 'year-ahead', category: 'horoscope', type: 'CONSULTATION', name: 'Year Ahead Forecast',
      price: 'Discussed after request', duration: 45, featured: 0, modes: ['VOICE', 'VIDEO', 'IN_PERSON'], birth: 1,
      tagline: 'A map for the next twelve months.',
      desc: 'A longer session that walks through the major transits and dashas of the coming year, with attention to work, relationships, money and health. You leave with a simple calendar of key periods and practical remedies.',
      benefits: 'A seasonal map of the year; personalised remedies; a written summary with key dates.',
      image: 'moon', prep: 'Share your birth details and any major plans for the coming year.',
    },
    {
      key: 'numerology', category: 'horoscope', type: 'CONSULTATION', name: 'Numerology & Name Guidance',
      price: 'Discussed after request', duration: 30, featured: 0, modes: ['CHAT', 'VOICE', 'VIDEO'], birth: 1,
      tagline: 'The music of names and numbers.',
      desc: 'A gentle introduction to your life-path number, name vibrations, and the timing of personal years. Useful for naming a child, choosing a business name, or understanding recurring patterns.',
      benefits: 'Practical name and number suggestions; a written summary; no fear-based claims.',
      image: 'planet', prep: 'Bring the full name and birth date you would like us to look at.',
    },
  ];

  for (const [index, def] of defs.entries()) {
    const category = cat[def.category];
    const row = {
      id: uuid(), category_id: category.id, service_type: def.type, name: def.name,
      slug: def.key, short_description: def.tagline, description: def.desc, benefits: def.benefits,
      default_duration_min: def.duration, min_participants: 1, max_participants: 200,
      indicative_price_text: def.price,
      allowed_locations: JSON.stringify(def.locations || []),
      allowed_consult_modes: JSON.stringify(def.modes || []),
      requires_birth_details: def.birth || 0, requires_address: def.address || 0,
      preparation_notes: def.prep, image_url: def.image, is_featured: def.featured,
      is_active: 1, display_order: index + 1, created_at: ts, updated_at: ts,
    };
    insert('services', row);
    services[def.key] = row;
  }
  return services;
}

function seedSamagri(services) {
  const lists = {
    'griha-pravesh': [
      ['Kalash with coconut and mango leaves', '1 set', 'PRIEST'],
      ['Fresh flowers (marigold / jasmine)', '2 bunches', 'CUSTOMER'],
      ['Milk, honey, ghee, curd', 'Small quantities', 'CUSTOMER'],
      ['Navadhanya grains', '1 packet', 'PRIEST'],
      ['Diya and oil', '2 lamps', 'CUSTOMER'],
      ['Fruits for prasadam', '5 pieces', 'CUSTOMER'],
    ],
    'satyanarayana': [
      ['Satyanarayana Katha book', '1', 'PRIEST'],
      ['Banana leaves / plantain', '2', 'CUSTOMER'],
      ['Panchamrit ingredients', '1 set', 'PRIEST'],
      ['Tulsi leaves', '1 bunch', 'CUSTOMER'],
      ['Prasadam (sheera / fruit)', 'For family', 'CUSTOMER'],
    ],
    'lakshmi-kubera': [
      ['Lakshmi & Kubera idols', '1 pair', 'PRIEST'],
      ['Lotus or marigold flowers', '2 bunches', 'CUSTOMER'],
      ['Coins and kalash', '1 set', 'PRIEST'],
      ['Kumkum, haldi, chandan', '1 kit', 'PRIEST'],
    ],
    'ganapati': [
      ['Ganesha idol / picture', '1', 'CUSTOMER'],
      ['Modak or fruit', '2 pieces', 'CUSTOMER'],
      ['Durva grass', '1 handful', 'PRIEST'],
      ['Incense and diya', '1 set', 'CUSTOMER'],
    ],
    'rudrabhishek': [
      ['Milk, honey, ghee, curd, rose water', '1 set', 'PRIEST'],
      ['Bilva leaves', '1 bunch', 'PRIEST'],
      ['White flowers', '1 bunch', 'CUSTOMER'],
      ['Shiva lingam', 'Temple provides', 'PRIEST'],
    ],
    'navagraha': [
      ['Navadhanya', '9 packets', 'PRIEST'],
      ['Nine coloured cloths', '1 set', 'PRIEST'],
      ['Fruits and flowers', 'As advised', 'CUSTOMER'],
      ['Homam samagri', '1 kit', 'PRIEST'],
    ],
    'ayushya-homam': [
      ['Homam wood and ghee', '1 kit', 'PRIEST'],
      ['Fruits, flowers, prasadam', 'Enough for family', 'CUSTOMER'],
      ['Kalash and coconut', '1 set', 'PRIEST'],
    ],
    'namakaran': [
      ['Cradle / decorated seat', '1', 'CUSTOMER'],
      ['Flowers and fruits', '1 set', 'CUSTOMER'],
      ['Naming ritual kit', '1', 'PRIEST'],
    ],
    'vivah': [
      ['Mandap and wedding samagri', 'As per ceremony', 'DISCUSS'],
      ['Garlands and flowers', 'As per decor', 'CUSTOMER'],
      ['Wedding muhurat consultation', 'Included', 'PRIEST'],
    ],
    'shraddha': [
      ['Pinda and tarpan samagri', '1 kit', 'PRIEST'],
      ['Black sesame seeds', '1 packet', 'CUSTOMER'],
      ['Darbha grass', '1 set', 'PRIEST'],
    ],
  };
  for (const [key, items] of Object.entries(lists)) {
    const service = services[key];
    if (!service) continue;
    items.forEach(([name, qty, provider], i) => {
      insert('service_samagri', {
        id: uuid(), service_id: service.id, item_name: name, quantity_text: qty,
        provided_by: provider, display_order: i,
      });
    });
  }
}

function seedProviderServices(providers, services) {
  const map = {
    ramesh: ['griha-pravesh', 'satyanarayana', 'ganapati', 'ayushya-homam', 'navagraha', 'sudarshana-homam', 'namakaran', 'lakshmi-kubera', 'rudrabhishek', 'mangal-dosh', 'vivah', 'shraddha', 'birth-chart', 'kundli-matching', 'career-reading', 'year-ahead', 'numerology'],
    venkatesh: ['satyanarayana', 'navagraha', 'rudrabhishek', 'ganapati', 'griha-pravesh', 'namakaran', 'ayushya-homam'],
    lakshmi: ['birth-chart', 'kundli-matching', 'career-reading', 'year-ahead'],
    mohan: ['rudrabhishek', 'navagraha', 'mangal-dosh', 'shraddha', 'ayushya-homam', 'sudarshana-homam'],
    ananya: ['career-reading', 'numerology', 'year-ahead', 'birth-chart'],
    arvind: ['birth-chart', 'kundli-matching', 'griha-pravesh', 'satyanarayana', 'rudrabhishek', 'mangal-dosh', 'career-reading', 'navagraha'],
  };
  for (const [providerKey, serviceKeys] of Object.entries(map)) {
    for (const serviceKey of serviceKeys) {
      if (!services[serviceKey]) continue;
      insert('provider_services', {
        provider_id: providers[providerKey].id, service_id: services[serviceKey].id,
        custom_duration_min: null, is_active: 1,
      });
    }
  }
}

function seedAvailability(providers) {
  const rules = [];
  const add = (provider, weekday, start, end, length, type) => {
    rules.push({ provider, weekday, start, end, length, type });
  };
  for (let wd = 1; wd <= 6; wd++) {
    add(providers.ramesh, wd, '07:00', '12:00', 90, 'PUJA');
    add(providers.ramesh, wd, '16:30', '20:30', 45, 'CONSULTATION');
    add(providers.venkatesh, wd, '06:30', '11:30', 90, 'PUJA');
    add(providers.venkatesh, wd, '17:00', '20:30', 90, 'PUJA');
    add(providers.lakshmi, wd, '10:00', '13:00', 45, 'CONSULTATION');
    add(providers.lakshmi, wd, '17:00', '21:00', 45, 'CONSULTATION');
    add(providers.mohan, wd, '05:30', '11:00', 90, 'PUJA');
    add(providers.ananya, wd, '11:00', '14:00', 45, 'CONSULTATION');
    add(providers.ananya, wd, '18:00', '21:30', 45, 'CONSULTATION');
    add(providers.arvind, wd, '07:00', '11:00', 60, 'PUJA');
    add(providers.arvind, wd, '17:00', '20:00', 45, 'CONSULTATION');
  }
  add(providers.ramesh, 0, '07:00', '11:00', 90, 'PUJA');
  add(providers.ramesh, 0, '11:30', '13:30', 45, 'CONSULTATION');
  add(providers.venkatesh, 0, '07:00', '11:00', 90, 'PUJA');
  add(providers.mohan, 0, '05:30', '10:30', 90, 'PUJA');
  add(providers.lakshmi, 0, '10:00', '13:00', 45, 'CONSULTATION');
  add(providers.ananya, 6, '10:00', '13:00', 45, 'CONSULTATION');
  add(providers.arvind, 0, '08:00', '11:00', 60, 'PUJA');

  for (const r of rules) {
    insert('availability_rules', {
      id: uuid(), provider_id: r.provider.id, weekday: r.weekday, start_time: r.start,
      end_time: r.end, slot_length_min: r.length, service_type: r.type,
      valid_from: null, valid_to: null, is_active: 1,
    });
  }

  const today = istDateKey();
  insert('availability_exceptions', {
    id: uuid(), provider_id: providers.ramesh.id,
    start_at: istToIso(addDaysKey(today, 6), '00:00'), end_at: istToIso(addDaysKey(today, 8), '00:00'),
    exception_type: 'BLOCKED', reason: 'Family ceremony out of town', created_at: nowIso(),
  });
  insert('availability_exceptions', {
    id: uuid(), provider_id: providers.lakshmi.id,
    start_at: istToIso(addDaysKey(today, 9), '20:00'), end_at: istToIso(addDaysKey(today, 9), '22:00'),
    exception_type: 'EXTRA', reason: 'Extra consultations before the festival', created_at: nowIso(),
  });
}

function seedEvents(ts, services, providers) {
  const today = istDateKey();
  const events = {};
  const defs = [
    {
      key: 'sudarshana', title: 'Maha Sudarshana Homam', slug: 'maha-sudarshana-homam', kind: 'HOMAM',
      days: 8, start: '07:00', end: '12:00', capacity: 100, taken: 76, featured: 1,
      venue: 'Sri Kalyana Venkateswara Temple', address: 'Road No. 12, Banjara Hills, Hyderabad 500034',
      service: 'sudarshana-homam', lead: 'ramesh', online: 1,
      note: 'Led by Pandit Ramesh Sharma',
      desc: 'A powerful morning of Vedic chanting and sacred fire, offered for protection, clarity and the removal of obstacles. Families join from across the city; a simple prasadam lunch is served after the purnahuti.',
      rituals: 'Ganapati puja · Sudarshana moola mantra japa · Maha Sudarshana Homam · Purnahuti · Aarti · Prasadam',
      dress: 'Traditional Indian attire in shades of red, yellow or white.',
      instructions: 'Please arrive by 6:30 AM. Footwear is not permitted inside the mandapam. A light breakfast will be served before the homam begins.',
    },
    {
      key: 'ganapati-homam', title: 'Ganapati Homam', slug: 'ganapati-homam', kind: 'HOMAM',
      days: 15, start: '06:30', end: '10:30', capacity: 60, taken: 60, featured: 1,
      venue: 'Sri Siddhi Vinayak Temple', address: 'Road No. 3, Banjara Hills, Hyderabad 500034',
      service: 'ganapati', lead: 'ramesh', online: 0,
      desc: 'A full-capacity Ganapati Homam on the occasion of the monthly Chaturthi. The morning includes Ganapati Sahasranama, 108 modak offerings and a shared breakfast. Join the waitlist — seats often open in the final week.',
      rituals: 'Ganapati pranayama · Sahasranama · 108 modaka naivedya · Homam · Aarti · Breakfast prasadam',
      dress: 'Comfortable traditional clothing. The temple floor is cool; carry a shawl if you like.',
      instructions: 'This event is currently full. The waitlist is checked in order, and our team will call you if a seat opens.',
    },
    {
      key: 'karthika-satsang', title: 'Karthika Purnima Satsang', slug: 'karthika-purnima-satsang', kind: 'SATSANG',
      days: 21, start: '18:00', end: '20:30', capacity: 150, taken: 41, featured: 1,
      venue: 'Aradhana Courtyard & Online', address: '12 Lotus Lane, Jubilee Hills, Hyderabad 500033',
      service: null, lead: 'ramesh', online: 1,
      desc: 'An evening of bhajan, a short talk on the Karthika month, and a guided moon meditation. Join in person at the courtyard or online from wherever you are. Suitable for all ages and first-time satsang visitors.',
      rituals: 'Bhajan · Short discourse · Moon meditation · Aarti · Chai & prasadam',
      dress: 'Anything comfortable. Warm layers for the courtyard after sunset.',
      instructions: 'The live stream link will be sent after confirmation. Please join ten minutes early if you are attending online.',
    },
    {
      key: 'graha-shanti', title: 'Graha Shanti Workshop', slug: 'graha-shanti-workshop', kind: 'WORKSHOP',
      days: 30, start: '10:00', end: '13:00', capacity: 200, taken: 24, featured: 0,
      venue: 'Online (live)', address: 'Live online workshop · IST',
      service: 'navagraha', lead: 'ramesh', online: 1,
      desc: 'A practical online workshop on the nine planets: what each graha signifies, how to read its role in your chart, and which simple remedies are worth your time. Includes a live Q&A with Pandit Ramesh Sharma.',
      rituals: 'Guided learning · chart examples · Q&A · printable remedy sheet',
      dress: 'No dress code. A notebook is recommended.',
      instructions: 'Bring one birth chart question. A replay will be available for 14 days.',
    },
  ];

  for (const def of defs) {
    const startAt = istToIso(addDaysKey(today, def.days), def.start);
    const endAt = istToIso(addDaysKey(today, def.days), def.end);
    const row = {
      id: uuid(), service_id: def.service ? services[def.service].id : null,
      title: def.title, slug: def.slug, event_kind: def.kind, description: def.desc,
      rituals_included: def.rituals, banner_url: null, venue_name: def.venue,
      venue_address: JSON.stringify({ text: def.address }), map_url: 'https://maps.google.com/?q=' + encodeURIComponent(def.address),
      is_online_available: def.online, stream_url: def.online ? 'https://meet.aradhana.in/live-' + def.key : null,
      start_at: startAt, end_at: endAt,
      registration_opens_at: istToIso(addDaysKey(today, -10), '09:00'),
      registration_closes_at: istToIso(addDaysKey(today, def.days - 2), '18:00'),
      capacity: def.capacity, seats_taken: def.taken, max_per_registration: 5,
      waitlist_enabled: 1, lead_provider_id: providers[def.lead].id,
      indicative_contribution_text: 'Contribution discussed offline',
      dress_code: def.dress, instructions: def.instructions, status: 'PUBLISHED',
      is_featured: def.featured, created_at: ts, updated_at: ts,
    };
    insert('events', row);
    events[def.key] = row;
    const sessions = [
      ['Sankalpam', '07:00', '07:30'],
      ['Main ritual', '07:30', '11:00'],
      ['Purnahuti & aarti', '11:00', '11:30'],
      ['Prasadam', '11:30', '12:00'],
    ];
    sessions.forEach(([title, s, e]) => {
      insert('event_sessions', {
        id: uuid(), event_id: row.id, title,
        start_at: istToIso(addDaysKey(today, def.days), s), end_at: istToIso(addDaysKey(today, def.days), e),
        description: null,
      });
    });
  }
  return events;
}

function seedSigns() {
  SIGNS.forEach((sign, index) => {
    insert('zodiac_signs', {
      id: uuid(), code: sign.code, name_en: sign.name, name_local: sign.local,
      symbol: sign.symbol, element: sign.element, ruling_planet: sign.planet,
      date_range_text: sign.dates, blurb: sign.blurb, display_order: index + 1,
    });
  });
}

function seedFestivals(services) {
  const today = istDateKey();
  const defs = [
    ['Karthika Purnima', 2, 'The full moon of Karthika, a beloved evening for lamps, satsang and Lakshmi puja.', 'lakshmi-kubera', '🌕'],
    ['Utpanna Ekadashi', 9, 'A quiet day of fasting and Vishnu remembrance between the festival weeks.', 'satyanarayana', '🪔'],
    ['Margashirsha Lakshmi Puja', 16, 'A Friday evening puja inviting steadiness and abundance into the home.', 'lakshmi-kubera', '🪷'],
    ['Dattatreya Jayanti', 24, 'Honouring Dattatreya with a simple abhishek and shared reading.', 'rudrabhishek', '🔥'],
    ['Sabarimala Season Begins', 31, 'The beginning of the annual pilgrimage season; many families begin their vows today.', 'ayushya-homam', '🏔️'],
    ['Pongal', 44, 'A harvest festival of gratitude, celebrated with a family puja and sweet prasadam.', 'satyanarayana', '🌾'],
    ['Maha Shivratri', 58, 'A night of Shiva bhajan, Rudrabhishek and quiet reflection.', 'rudrabhishek', '🌙'],
  ];
  for (const [name, offset, description, serviceKey, emoji] of defs) {
    insert('festivals', {
      id: uuid(), name, for_date: addDaysKey(today, offset), description,
      suggested_service_id: services[serviceKey]?.id || null, emoji,
    });
  }
}

function seedFaqs() {
  const faqs = [
    ['How does booking work without online payment?', 'You send a request with your preferred time and details. Pandit ji or our team calls or messages you to confirm the arrangements. Payment, if any, is discussed and settled directly with Pandit ji. We never take card details online.', 'Bookings'],
    ['Is my slot confirmed immediately?', 'No — every request starts as "Requested". The slot is held for a short window while we contact you. Once both sides agree, we confirm the booking and the slot becomes yours.', 'Bookings'],
    ['What if I do not know my exact birth time?', 'That is very common. Tick “I don’t know the time” and the astrologer will work with a solar chart or limited analysis. You can still have a meaningful consultation.', 'Consultations'],
    ['Can I reschedule or cancel a request?', 'Yes. Open My Bookings and use Reschedule or Cancel. For confirmed bookings, please give us at least 12 hours’ notice so the priest’s time can be released.', 'Bookings'],
    ['Who is Pandit Ramesh Sharma?', 'Pandit ji is a Smartha-tradition Vedic priest and jyotish guide based in Hyderabad. He has performed household pujas, homams and consultations for over two decades. Every request on this site is read by him personally.', 'Providers'],
    ['Which languages are supported?', 'Pandit ji offers pujas and consultations in Telugu, Hindi, English and Sanskrit. You can tell us your preferred language while booking.', 'Providers'],
    ['How do event waitlists work?', 'If an event is full, join the waitlist. We contact people in order if a seat opens. You are never charged for joining a waitlist.', 'Events'],
    ['Can a puja be performed at my home?', 'Many pujas can be performed at home, in a temple, or online with a live stream. The service page lists the available locations; some fire rituals require a temple or a ventilated outdoor space.', 'Pujas'],
    ['What is included in the samagri?', 'Each puja page lists the materials and who brings them — you, the priest, or either. If you choose “priest to bring”, the cost is discussed on the confirmation call.', 'Pujas'],
    ['How is my personal data protected?', 'Birth details and phone numbers are visible only to Pandit ji and the person handling your booking. Lists are masked, access is logged, and you can request deletion at any time.', 'Privacy'],
    ['Do you offer refunds?', 'There is no online payment, so there is nothing to refund on the website. Any contribution agreed offline follows the cancellation policy shared on your confirmation call.', 'Payments'],
    ['Can I book for a family member?', 'Yes. Enter their birth details in the form or save a family birth profile in your account. You can add a second person for kundli matching.', 'Consultations'],
  ];
  faqs.forEach(([question, answer, category], i) => {
    insert('faqs', {
      id: uuid(), question, answer, category, display_order: i + 1, language: 'en', is_active: 1,
    });
  });
}

function seedTestimonials(services) {
  const defs = [
    ['Anita Rao', 'Hyderabad', 'The Griha Pravesh puja was the calmest part of our move. Pandit ji explained every step, and our daughter actually participated instead of getting bored. It felt like our home, not a performance.', 5, 'griha-pravesh'],
    ['Ravi Kumar', 'Bengaluru', 'I was nervous about a consultation after a bad experience elsewhere. Pandit ji was specific, kind and never once tried to frighten me. I left with two clear next steps.', 5, 'birth-chart'],
    ['Priya Menon', 'Pune', 'The whole process was refreshingly honest: a request, a phone call, a confirmed time. No fake instant booking, no payment pop-ups. The Satyanarayana puja itself was beautiful.', 5, 'satyanarayana'],
    ['Suresh Patel', 'Hyderabad', 'Booked two seats for the Sudarshana Homam and ended up taking my parents too. The temple coordination was seamless and the prasadam was lovely. We will be back next year.', 5, 'sudarshana-homam'],
    ['Meera Nair', 'Chennai', 'The kundli matching session was very balanced. Both families felt heard, and the conversation was about compatibility, not fear. Exactly what we needed.', 5, 'kundli-matching'],
    ['Neha Gupta', 'Delhi', 'I asked for a career reading during a difficult phase. Pandit ji did not promise miracles — he gave me a realistic map of the next few months and a simple remedy. That honesty helped more than any prediction.', 4, 'career-reading'],
  ];
  for (const [name, city, quote, rating, serviceKey] of defs) {
    insert('testimonials', {
      id: uuid(), customer_name: name, city, quote, rating,
      service_id: services[serviceKey]?.id || null, service_name: services[serviceKey]?.name || null,
      is_published: 1,
    });
  }
}

function seedTemplates() {
  const templates = [
    ['OWNER_NEW_BOOKING', 'WHATSAPP', 'New request · {{booking_ref}}', 'NEW BOOKING REQUEST {{booking_ref}}\nType: {{booking_type}} · {{service_name}}\nName: {{customer_name}}\nPhone: {{customer_phone}}\nPreferred: {{preferred_datetime}}\nProvider: {{provider_name}}\nLocation: {{location}}\nOpen: {{admin_link}}'],
    ['OWNER_NEW_BOOKING', 'EMAIL', '[New request] {{service_name}} — {{customer_name}}', 'A new {{booking_type}} request has arrived.\n\nReference: {{booking_ref}}\nService: {{service_name}}\nCustomer: {{customer_name}} · {{customer_phone}}\nPreferred: {{preferred_datetime}}\nProvider: {{provider_name}}\nLocation: {{location}}\n\nOpen the request: {{admin_link}}'],
    ['OWNER_NEW_BOOKING', 'SMS', 'New request {{booking_ref}}', '{{booking_type}} request {{booking_ref}} from {{customer_name}}. Open: {{admin_link}}'],
    ['CUSTOMER_REQUEST_RECEIVED', 'WHATSAPP', 'We have your request', 'Namaste {{customer_name}}, we have received your request {{booking_ref}} for {{service_name}}. Our team will call or WhatsApp you to confirm the details. No payment is taken online. — Aradhana'],
    ['CUSTOMER_REQUEST_RECEIVED', 'EMAIL', 'Your request {{booking_ref}} is with us', 'Namaste {{customer_name}},\n\nThank you for your request for {{service_name}}. Reference: {{booking_ref}}.\n\nWhat happens next: our team will contact you to confirm the details. Payment, if any, is settled directly with the provider.\n\nWith care,\nAradhana'],
    ['CUSTOMER_REQUEST_RECEIVED', 'SMS', 'Request received {{booking_ref}}', 'We have your request {{booking_ref}}. Our team will contact you shortly. — Aradhana'],
    ['CUSTOMER_REQUEST_RECEIVED', 'PUSH', 'Request received', 'Your request {{booking_ref}} is safe with us. We will be in touch.'],
    ['CUSTOMER_BOOKING_CONFIRMED', 'WHATSAPP', 'Your booking is confirmed', 'Namaste {{customer_name}}, your booking {{booking_ref}} for {{service_name}} is confirmed for {{preferred_datetime}} IST. We look forward to seeing you. — Aradhana'],
    ['CUSTOMER_BOOKING_CONFIRMED', 'EMAIL', 'Confirmed · {{booking_ref}}', 'Your booking is confirmed.\n\n{{service_name}}\n{{preferred_datetime}} IST\nReference: {{booking_ref}}\n\nWe will send a reminder before the appointment.'],
    ['CUSTOMER_BOOKING_CONFIRMED', 'PUSH', 'Booking confirmed', '{{service_name}} on {{preferred_datetime}}. Ref {{booking_ref}}.'],
    ['CUSTOMER_BOOKING_REJECTED', 'WHATSAPP', 'About your request', 'Namaste {{customer_name}}, we are sorry we could not confirm {{booking_ref}} for the requested time. Our team will contact you with alternatives. — Aradhana'],
    ['CUSTOMER_CANCELLED', 'WHATSAPP', 'Request cancelled', 'Your request {{booking_ref}} has been cancelled. If this was not expected, please reply to us. — Aradhana'],
    ['REMINDER_24H', 'WHATSAPP', 'Reminder · {{booking_ref}}', 'A gentle reminder: {{service_name}} is tomorrow at {{preferred_datetime}} IST. Reference {{booking_ref}}. Reply if you need anything. — Aradhana'],
    ['REMINDER_24H', 'EMAIL', 'Tomorrow · {{booking_ref}}', 'A gentle reminder that {{service_name}} is scheduled for {{preferred_datetime}} IST. We look forward to seeing you.'],
    ['REVIEW_REQUEST', 'EMAIL', 'How was your experience?', 'Namaste {{customer_name}}, we would love to hear how your {{service_name}} went. Leave a review from My Bookings — it helps other families find the right guidance.'],
    ['REVIEW_REQUEST', 'WHATSAPP', 'A little request', 'Namaste {{customer_name}}, thank you for choosing Aradhana. If you have a moment, a review of your {{service_name}} would mean a lot. — Aradhana'],
    ['EVENT_WAITLIST_SEAT_OPENED', 'WHATSAPP', 'A seat has opened', 'Good news — a seat has opened for {{service_name}}. Reply to this message or call us to claim it. — Aradhana'],
    ['PROVIDER_ASSIGNED', 'EMAIL', 'New assignment · {{booking_ref}}', 'A booking has been assigned to you.\n\n{{service_name}}\n{{preferred_datetime}} IST\nCustomer: {{customer_name}}\nReference: {{booking_ref}}'],
    ['OWNER_UNHANDLED_ESCALATION', 'EMAIL', 'Escalation · {{booking_ref}} waiting', 'Request {{booking_ref}} has been waiting without a first contact. Please open it now.'],
  ];
  for (const [code, channel, subject, body] of templates) {
    insert('notification_templates', {
      id: uuid(), code, channel, language: 'en', subject, body, is_active: 1,
    });
  }
}

function seedRecipients() {
  const rows = [
    ['Owner · WhatsApp', 'WHATSAPP', '+919000000001', '["PUJA","CONSULTATION","EVENT"]', 1],
    ['Owner · Email', 'EMAIL', 'owner@aradhana.in', '["PUJA","CONSULTATION","EVENT"]', 1],
    ['Support · SMS', 'SMS', '+919000000002', '["CONSULTATION"]', 0],
  ];
  for (const [name, channel, address, types, primary] of rows) {
    insert('notification_recipients', {
      id: uuid(), name, user_id: null, channel, address,
      receives_booking_types: types, quiet_hours_start: null, quiet_hours_end: null,
      is_primary_owner: primary, is_active: 1,
    });
  }
}

function seedDemoProfiles(user) {
  const today = istDateKey();
  insert('customer_profiles', {
    id: uuid(), user_id: user.id, preferred_contact_channel: 'WHATSAPP',
    preferred_call_window: 'Evening 6–9 PM', marketing_opt_in: 1, notes: null,
  });
  insert('birth_profiles', {
    id: uuid(), customer_id: user.id, label: 'Self', full_name: 'Anita Rao', gender: 'FEMALE',
    date_of_birth: '1990-03-12', time_of_birth: '06:15', time_of_birth_unknown: 0,
    place_of_birth: 'Hyderabad, Telangana, India', birth_latitude: 17.385, birth_longitude: 78.4867,
    birth_timezone: 'Asia/Kolkata', gotra: 'Kashyapa', nakshatra: 'Ashwini', rashi: 'Pisces',
    is_default: 1, created_at: nowIso(),
  });
  insert('birth_profiles', {
    id: uuid(), customer_id: user.id, label: 'Mother', full_name: 'Sita Rao', gender: 'FEMALE',
    date_of_birth: '1962-06-05', time_of_birth: null, time_of_birth_unknown: 1,
    place_of_birth: 'Guntur, Andhra Pradesh, India', birth_latitude: 16.3067, birth_longitude: 80.4365,
    birth_timezone: 'Asia/Kolkata', gotra: 'Kashyapa', nakshatra: null, rashi: null,
    is_default: 0, created_at: nowIso(),
  });
  insert('addresses', {
    id: uuid(), customer_id: user.id, label: 'Home', line1: '12-3, Road No. 5',
    line2: 'Jubilee Hills', landmark: 'Near Lotus Park', city: 'Hyderabad', state: 'Telangana',
    country: 'India', postal_code: '500033', latitude: 17.4239, longitude: 78.4121,
    is_default: 1, created_at: nowIso(),
  });
  notifyInApp(user.id, 'Welcome to Aradhana', 'Your account is ready. Save birth profiles to make your next consultation quicker.', '#/my/profiles');
}

/* ---------- bookings & reviews ---------- */

function createBooking({
  refIndex, type, status, customer, service, provider, slot, startAt, endAt, event,
  createdAt, participants = 1, contactChannel = 'CALL', callWindow = 'Evening 6–9 PM',
  specialRequests = null, meetingLink = null, source = 'WEB', offline = null,
}) {
  const id = uuid();
  const ref = `BK-${istDateKey().replaceAll('-', '')}-${String(refIndex).padStart(4, '0')}`;
  const createdAtIso = createdAt || nowIso();
  insert('bookings', {
    id, booking_ref: ref, booking_type: type, status,
    customer_id: customer.id, service_id: service?.id || null, provider_id: provider?.id || null,
    time_slot_id: slot?.id || null, event_id: event?.id || null,
    preferred_start_at: startAt, alt_start_at: null,
    confirmed_start_at: ['CONFIRMED', 'COMPLETED', 'RESCHEDULE_REQUESTED'].includes(status) ? startAt : null,
    confirmed_end_at: ['CONFIRMED', 'COMPLETED', 'RESCHEDULE_REQUESTED'].includes(status) ? endAt : null,
    customer_name: customer.full_name, customer_phone: customer.phone, customer_email: customer.email,
    preferred_contact_channel: contactChannel, preferred_call_window: callWindow,
    preferred_language: 'en', participants_count: participants, special_requests: specialRequests,
    source, assigned_to_user_id: null, meeting_link: meetingLink,
    payment_state: status === 'COMPLETED' ? 'RECEIVED' : 'NOT_DISCUSSED',
    requested_at: createdAtIso,
    first_contacted_at: ['CONTACTED', 'CONFIRMED', 'COMPLETED', 'RESCHEDULE_REQUESTED'].includes(status) ? createdAtIso : null,
    confirmed_at: ['CONFIRMED', 'COMPLETED', 'RESCHEDULE_REQUESTED'].includes(status) ? createdAtIso : null,
    completed_at: status === 'COMPLETED' ? createdAtIso : null,
    cancelled_at: status === 'CANCELLED' ? createdAtIso : null,
    cancel_reason: status === 'CANCELLED' ? 'Change of plan' : null,
    cancelled_by: status === 'CANCELLED' ? 'CUSTOMER' : null,
    expires_at: null, owner_notified_at: null, ip_address: null, user_agent: 'seed',
    created_at: createdAtIso, updated_at: createdAtIso,
  });
  insert('booking_status_history', {
    booking_id: id, from_status: null, to_status: 'REQUESTED', changed_by_role: 'CUSTOMER',
    reason: 'Request submitted', created_at: createdAtIso,
  });
  if (status !== 'REQUESTED') {
    insert('booking_status_history', {
      booking_id: id, from_status: 'REQUESTED', to_status: status, changed_by_role: 'OWNER',
      reason: status === 'CONFIRMED' ? 'Confirmed after a call with the customer' : 'Seeded history',
      created_at: new Date(new Date(createdAtIso).getTime() + 45 * 60000).toISOString(),
    });
  }
  if (provider && slot) {
    run(`UPDATE time_slots SET status = ?, held_by_booking_id = ? WHERE id = ?`, [
      status === 'CONFIRMED' || status === 'COMPLETED' ? 'BOOKED' : status === 'CANCELLED' ? 'AVAILABLE' : 'TENTATIVE',
      status === 'CANCELLED' ? null : id, slot.id,
    ]);
  }
  if (offline) {
    insert('offline_payment_records', {
      id: uuid(), booking_id: id, agreed_amount: offline.agreed, currency: 'INR', mode: offline.mode || 'UPI',
      received_amount: offline.received || 0, received_on: offline.received ? createdAtIso.slice(0, 10) : null,
      reference_note: offline.reference || null, recorded_by: null, remarks: offline.remarks || null, created_at: nowIso(),
    });
  }
  return { id, ref, row: get('SELECT * FROM bookings WHERE id = ?', [id]) };
}

function pastSlot(provider, type, daysAgo, time = '09:00', duration = 120) {
  const dateKey = addDaysKey(istDateKey(), -daysAgo);
  const startAt = istToIso(dateKey, time);
  const endAt = new Date(new Date(startAt).getTime() + duration * 60000).toISOString();
  const id = uuid();
  insert('time_slots', {
    id, provider_id: provider.id, service_type: type, start_at: startAt, end_at: endAt,
    status: 'BLOCKED', held_by_booking_id: null, hold_expires_at: null, source: 'MANUAL', created_at: nowIso(),
  });
  return { id, start_at: startAt, end_at: endAt };
}

function findSlot(providerId, type, daysAhead, preferredTime = '09:00', status = 'AVAILABLE') {
  const dateKey = addDaysKey(istDateKey(), daysAhead);
  const dayStart = istToIso(dateKey, '00:00');
  const dayEnd = istToIso(addDaysKey(dateKey, 1), '00:00');
  const preferred = istToIso(dateKey, preferredTime);
  return get(
    `SELECT * FROM time_slots WHERE provider_id = ? AND service_type = ? AND status = ? AND start_at >= ? AND start_at < ?
      ORDER BY ABS(strftime('%s', start_at) - strftime('%s', ?)) LIMIT 1`,
    [providerId, type, status, dayStart, dayEnd, preferred]
  );
}

function addPujaDetails(bookingId, { location = 'CUSTOMER_HOME', address = null, occasion = 'Family puja', names = [], gotra = null, samagri = 'PRIEST', attendees = 10, live = 0 }) {
  insert('booking_puja_details', {
    booking_id: bookingId, location_type: location, address_snapshot: address ? JSON.stringify(address) : null,
    occasion, sankalpam_names: JSON.stringify(names), gotra: gotra, samagri_by: samagri,
    need_travel: 0, attendee_estimate: attendees, live_stream_required: live,
  });
}

function addConsultDetails(bookingId, { mode = 'VIDEO', topics = [], question = null, duration = 30, language = 'en', previous = 0, matching = 0 }) {
  insert('booking_consultation_details', {
    booking_id: bookingId, consult_mode: mode, topics: JSON.stringify(topics), question_summary: question,
    duration_min: duration, meeting_link: null, language, has_previous_chart: previous, matching_required: matching,
  });
}

function addBirthDetail(bookingId, { label = 'Self', name, gender = 'FEMALE', dob, tob = null, unknown = 0, place, gotra = null, nakshatra = null, rashi = null }) {
  insert('booking_birth_details', {
    id: uuid(), booking_id: bookingId, person_label: label, full_name: name, gender,
    date_of_birth: dob, time_of_birth: tob, time_of_birth_unknown: unknown,
    place_of_birth: place, birth_latitude: null, birth_longitude: null,
    gotra, nakshatra, rashi, source_birth_profile_id: null,
  });
}

function seedBookingsAndReviews(providers, services, events) {
  const demo = get('SELECT * FROM users WHERE phone = ?', ['+919876543210']);
  const ravi = get('SELECT * FROM users WHERE phone = ?', ['+919876500011']);
  const priya = get('SELECT * FROM users WHERE phone = ?', ['+919876500012']);
  const suresh = get('SELECT * FROM users WHERE phone = ?', ['+919876500013']);
  const meera = get('SELECT * FROM users WHERE phone = ?', ['+919876500014']);
  const karthik = get('SELECT * FROM users WHERE phone = ?', ['+919876500015']);
  const neha = get('SELECT * FROM users WHERE phone = ?', ['+919876500016']);
  const arvindc = get('SELECT * FROM users WHERE phone = ?', ['+919876500017']);

  const createdAt = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
  const todayKey = istDateKey();

  // 1. Demo customer — completed puja + review + media/doc
  const s1 = findSlot(providers.ramesh.id, 'PUJA', 1, '09:00');
  const oldSlot = pastSlot(providers.ramesh, 'PUJA', 12, '09:00', 120);
  const b1 = createBooking({
    refIndex: 1, type: 'PUJA', status: 'COMPLETED', customer: demo,
    service: services['griha-pravesh'], provider: providers.ramesh, slot: oldSlot,
    startAt: oldSlot.start_at, endAt: oldSlot.end_at, createdAt: createdAt(14),
    participants: 12, contactChannel: 'WHATSAPP', specialRequests: 'Please keep the ceremony under two hours; we have elderly parents at home.',
    offline: { agreed: 11000, received: 11000, mode: 'UPI', reference: 'UPI-AR-1288', remarks: 'Settled directly with Pandit ji' },
  });
  addPujaDetails(b1.id, {
    location: 'CUSTOMER_HOME',
    address: { line1: '12-3, Road No. 5', line2: 'Jubilee Hills', city: 'Hyderabad', postal_code: '500033' },
    occasion: 'House warming', names: ['Anita Rao', 'Ravi Rao', 'Meera Rao'], gotra: 'Kashyapa',
    samagri: 'PRIEST', attendees: 12, live: 1,
  });
  insert('reviews', {
    id: uuid(), booking_id: b1.id, provider_id: providers.ramesh.id, user_id: demo.id,
    customer_name: 'Anita Rao', rating: 5, title: 'The calmest part of our move',
    comment: 'Pandit ji explained every step, and our daughter actually participated instead of getting bored. It felt like our home, not a performance.',
    is_published: 1, owner_reply: 'Thank you, Anita ji. It was a joy to be part of your new beginning. — Pandit Ramesh', created_at: createdAt(11),
  });
  insert('booking_media', {
    id: uuid(), booking_id: b1.id, media_type: 'PHOTO', storage_url: null,
    caption: 'The entrance lamp and rangoli before the puja', uploaded_by: null, visible_to_customer: 1, created_at: createdAt(11),
  });
  insert('booking_media', {
    id: uuid(), booking_id: b1.id, media_type: 'PHOTO', storage_url: null,
    caption: 'Pandit ji guiding the Vastu shanti', uploaded_by: null, visible_to_customer: 1, created_at: createdAt(11),
  });
  insert('booking_documents', {
    id: uuid(), booking_id: b1.id, doc_type: 'SANKALPAM', file_url: null,
    title: 'Sankalpam sheet · Griha Pravesh', visible_to_customer: 1, expires_at: null, created_at: createdAt(11),
  });

  // 2. Demo customer — confirmed video consultation tomorrow evening
  const cSlot = findSlot(providers.ramesh.id, 'CONSULTATION', 1, '18:30');
  if (cSlot) {
    const b2 = createBooking({
      refIndex: 2, type: 'CONSULTATION', status: 'CONFIRMED', customer: demo,
      service: services['birth-chart'], provider: providers.ramesh, slot: cSlot,
      startAt: cSlot.start_at, endAt: cSlot.end_at, createdAt: createdAt(2), participants: 1,
      contactChannel: 'WHATSAPP', meetingLink: 'https://meet.aradhana.in/anita-lakshmi-8f2k',
      specialRequests: 'I would like to focus on a career decision and my mother’s health.',
    });
    addConsultDetails(b2.id, { mode: 'VIDEO', topics: ['Career', 'Health', 'Family'], question: 'Should I accept the role in Singapore, and what does the next year look like for my mother?', duration: 30, language: 'en', previous: 0 });
    addBirthDetail(b2.id, { name: 'Anita Rao', dob: '1990-03-12', tob: '06:15', place: 'Hyderabad, Telangana', gotra: 'Kashyapa', nakshatra: 'Ashwini', rashi: 'Pisces' });
  }

  // 3. Demo customer — open puja request 4 days ahead
  const pSlot = findSlot(providers.ramesh.id, 'PUJA', 4, '09:00');
  if (pSlot) {
    const b3 = createBooking({
      refIndex: 3, type: 'PUJA', status: 'REQUESTED', customer: demo,
      service: services['satyanarayana'], provider: providers.ramesh, slot: pSlot,
      startAt: pSlot.start_at, endAt: pSlot.end_at, createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
      participants: 15, contactChannel: 'WHATSAPP', specialRequests: 'Prefer a morning muhurat so the children can join before school.',
    });
    addPujaDetails(b3.id, {
      location: 'CUSTOMER_HOME',
      address: { line1: '12-3, Road No. 5', line2: 'Jubilee Hills', city: 'Hyderabad', postal_code: '500033' },
      occasion: 'Family wellbeing', names: ['Anita Rao', 'Ravi Rao'], gotra: 'Kashyapa', samagri: 'PRIEST', attendees: 15,
    });
    queueNewBooking(b3.row, { booking_type: 'PUJA', service_name: 'Satyanarayana Vratam', preferred_datetime: pSlot.start_at, provider_name: 'Pandit Ramesh Sharma', location: 'Home · Jubilee Hills, Hyderabad', booking_ref: b3.ref, customer_name: demo.full_name, customer_phone: demo.phone });
  }

  // 4. Demo customer — event registration
  const event1 = events.sudarshana;
  const eStart = event1.start_at;
  const b4 = createBooking({
    refIndex: 4, type: 'EVENT', status: 'CONFIRMED', customer: demo, service: services['sudarshana-homam'],
    provider: providers.ramesh, slot: null, startAt: eStart, endAt: event1.end_at, event: event1,
    createdAt: createdAt(3), participants: 2, contactChannel: 'WHATSAPP',
  });
  insert('event_registrations', {
    id: uuid(), event_id: event1.id, booking_id: b4.id, seats: 2, status: 'CONFIRMED',
    attendance_mode: 'IN_PERSON', checked_in_at: null, qr_token: `AR-${uuid().slice(0, 8).toUpperCase()}`, created_at: createdAt(3),
  });

  // 5. Demo customer — cancelled puja
  const oldG = pastSlot(providers.ramesh, 'PUJA', 20, '16:00', 60);
  if (oldG) {
    createBooking({
      refIndex: 5, type: 'PUJA', status: 'CANCELLED', customer: demo,
      service: services.ganapati, provider: providers.ramesh, slot: oldG,
      startAt: oldG.start_at, endAt: oldG.end_at, createdAt: createdAt(24),
      contactChannel: 'CALL', specialRequests: null,
    });
  }

  // 6. Ravi — open consultation request (waited 2 hours)
  const rSlot = findSlot(providers.ramesh.id, 'CONSULTATION', 2, '18:00');
  if (rSlot) {
    const b6 = createBooking({
      refIndex: 6, type: 'CONSULTATION', status: 'REQUESTED', customer: ravi,
      service: services['career-reading'], provider: providers.ramesh, slot: rSlot,
      startAt: rSlot.start_at, endAt: rSlot.end_at, createdAt: new Date(Date.now() - 120 * 60000).toISOString(),
      participants: 1, contactChannel: 'CALL', callWindow: 'Evening 6–9 PM',
      specialRequests: 'Considering a switch from a corporate job to teaching.',
    });
    addConsultDetails(b6.id, { mode: 'VOICE', topics: ['Career'], question: 'Is this a good year to leave my corporate job and start teaching?', duration: 30, language: 'en' });
    addBirthDetail(b6.id, { name: 'Ravi Kumar', gender: 'MALE', dob: '1988-09-04', tob: '14:20', place: 'Bengaluru, Karnataka' });
    queueNewBooking(b6.row, { booking_type: 'CONSULTATION', service_name: 'Career & Purpose Reading', preferred_datetime: rSlot.start_at, provider_name: 'Pandit Ramesh Sharma', location: 'Voice call', booking_ref: b6.ref, customer_name: ravi.full_name, customer_phone: ravi.phone });
  }

  // 7. Priya — contacted puja with follow-up due
  const prSlot = findSlot(providers.ramesh.id, 'PUJA', 5, '07:00');
  if (prSlot) {
    const b7 = createBooking({
      refIndex: 7, type: 'PUJA', status: 'CONTACTED', customer: priya,
      service: services.satyanarayana, provider: providers.ramesh, slot: prSlot,
      startAt: prSlot.start_at, endAt: prSlot.end_at, createdAt: createdAt(1),
      participants: 20, contactChannel: 'CALL', callWindow: 'Morning 9–12',
    });
    addPujaDetails(b7.id, {
      location: 'CUSTOMER_HOME', address: { line1: '14 Rose Villa', line2: 'Koregaon Park', city: 'Pune', postal_code: '411001' },
      occasion: 'Anniversary gratitude', names: ['Priya Menon', 'Arun Menon'], gotra: 'Nair', samagri: 'DISCUSS', attendees: 20,
    });
    insert('booking_contact_attempts', {
      id: uuid(), booking_id: b7.id, staff_user_id: null, staff_name: 'Kabir Nair', channel: 'CALL', outcome: 'REACHED',
      summary: 'Discussed samagri and guest count. Priya will confirm the priest to bring the samagri by tomorrow.',
      next_follow_up_at: istToIso(todayKey, '18:00'), agreed_start_at: prSlot.start_at, created_at: createdAt(0.6),
    });
    insert('booking_notes', {
      id: uuid(), booking_id: b7.id, author_user_id: null, author_name: 'Kabir Nair',
      note: 'Family prefers a priest who speaks Tamil. Pandit ji is comfortable in Tamil. Confirm samagri budget on next call.',
      is_pinned: 1, created_at: createdAt(0.5),
    });
  }

  // 8. Suresh — reschedule requested
  const surOld = findSlot(providers.ramesh.id, 'PUJA', 3, '09:00');
  const surNew = findSlot(providers.ramesh.id, 'PUJA', 6, '09:00');
  if (surOld && surNew) {
    const b8 = createBooking({
      refIndex: 8, type: 'PUJA', status: 'RESCHEDULE_REQUESTED', customer: suresh,
      service: services['griha-pravesh'], provider: providers.ramesh, slot: surOld,
      startAt: surOld.start_at, endAt: surOld.end_at, createdAt: createdAt(2),
      participants: 8, contactChannel: 'CALL',
    });
    addPujaDetails(b8.id, {
      location: 'CUSTOMER_HOME', address: { line1: '8 Lake View', city: 'Hyderabad', postal_code: '500081' },
      occasion: 'House warming', names: ['Suresh Patel', 'Kavita Patel'], gotra: 'Patel', samagri: 'PRIEST', attendees: 8,
    });
    run(`UPDATE time_slots SET status = 'TENTATIVE', held_by_booking_id = ? WHERE id = ?`, [b8.id, surNew.id]);
    insert('booking_reschedules', {
      id: uuid(), booking_id: b8.id, requested_by: 'CUSTOMER', old_slot_id: surOld.id, new_slot_id: surNew.id,
      old_start_at: surOld.start_at, new_start_at: surNew.start_at, reason: 'The movers shifted the house handover by three days.',
      status: 'PENDING', decided_by: null, decided_at: null, created_at: createdAt(0.2),
    });
  }

  // 9–13. Past completed bookings + reviews for social proof
  const reviewDefs = [
    { user: meera, provider: providers.ramesh, service: services['kundli-matching'], days: 18, rating: 5, title: 'Balanced and reassuring', comment: 'Both families felt heard. The conversation was about compatibility, not fear. Exactly what we needed.', mode: 'VIDEO' },
    { user: karthik, provider: providers.ramesh, service: services.satyanarayana, days: 26, rating: 5, title: 'A beautiful family morning', comment: 'Pandit ji was punctual, patient with the children, and explained the story in simple language. We will book again.', mode: null },
    { user: neha, provider: providers.ramesh, service: services['career-reading'], days: 9, rating: 4, title: 'Honest and practical', comment: 'No miracle promises — a realistic map of the next few months and a simple remedy. That honesty helped.', mode: 'VIDEO' },
    { user: arvindc, provider: providers.ramesh, service: services['birth-chart'], days: 33, rating: 5, title: 'Depth without drama', comment: 'Pandit ji went deep into the chart but kept the language human. I took notes and left with a clear plan.', mode: 'IN_PERSON' },
    { user: priya, provider: providers.ramesh, service: services.ganapati, days: 40, rating: 5, title: 'Perfect for a new beginning', comment: 'Short, joyful and child-friendly. Pandit ji arrived early and left the house feeling lighter.', mode: null },
  ];
  let reviewIndex = 9;
  for (const def of reviewDefs) {
    const past = pastSlot(def.provider, def.service.service_type, def.days, '10:00', def.service.default_duration_min);
    const booking = createBooking({
      refIndex: reviewIndex++, type: def.service.service_type, status: 'COMPLETED',
      customer: def.user, service: def.service, provider: def.provider, slot: past,
      startAt: past.start_at, endAt: past.end_at, createdAt: createdAt(def.days + 3), contactChannel: 'CALL',
    });
    if (def.service.service_type === 'PUJA') {
      addPujaDetails(booking.id, { location: 'TEMPLE', occasion: 'Family puja', attendees: 6 });
    } else {
      addConsultDetails(booking.id, { mode: def.mode || 'VIDEO', topics: ['General'], duration: def.service.default_duration_min });
      addBirthDetail(booking.id, { name: def.user.full_name, dob: '1990-01-01', place: 'India' });
    }
    insert('reviews', {
      id: uuid(), booking_id: booking.id, provider_id: def.provider.id, user_id: def.user.id,
      customer_name: def.user.full_name, rating: def.rating, title: def.title, comment: def.comment,
      is_published: 1, owner_reply: def.rating === 5 ? 'Thank you for your kind words. It was a privilege to be of service.' : null,
      created_at: createdAt(def.days - 1),
    });
  }

  // 14. Waitlist for the full Ganapati Homam
  const fullEvent = events['ganapati-homam'];
  const waitBooking = createBooking({
    refIndex: 14, type: 'EVENT', status: 'REQUESTED', customer: ravi, service: services.ganapati,
    provider: providers.ramesh, slot: null, startAt: fullEvent.start_at, endAt: fullEvent.end_at,
    event: fullEvent, createdAt: createdAt(1), participants: 2, contactChannel: 'WHATSAPP',
  });
  insert('event_waitlist', {
    id: uuid(), event_id: fullEvent.id, booking_id: waitBooking.id, seats_wanted: 2,
    position: 1, notified_at: null, created_at: createdAt(1),
  });

  // 15. A contacted event registration for Suresh
  const b15 = createBooking({
    refIndex: 15, type: 'EVENT', status: 'CONFIRMED', customer: suresh, service: services['sudarshana-homam'],
    provider: providers.ramesh, slot: null, startAt: events.sudarshana.start_at, endAt: events.sudarshana.end_at,
    event: events.sudarshana, createdAt: createdAt(2), participants: 3, contactChannel: 'CALL',
  });
  const reg15 = uuid();
  insert('event_registrations', {
    id: reg15, event_id: events.sudarshana.id, booking_id: b15.id, seats: 3, status: 'CONFIRMED',
    attendance_mode: 'IN_PERSON', checked_in_at: null, qr_token: `AR-${uuid().slice(0, 8).toUpperCase()}`, created_at: createdAt(2),
  });
  insert('event_attendees', { id: uuid(), registration_id: reg15, full_name: 'Suresh Patel', gotra: 'Patel', nakshatra: 'Rohini', age_group: 'ADULT', dietary_note: null });
  insert('event_attendees', { id: uuid(), registration_id: reg15, full_name: 'Kavita Patel', gotra: 'Patel', nakshatra: null, age_group: 'ADULT', dietary_note: 'No onion or garlic' });
  insert('event_attendees', { id: uuid(), registration_id: reg15, full_name: 'Aarav Patel', gotra: 'Patel', nakshatra: null, age_group: 'CHILD', dietary_note: null });

  // Add some in-app notifications for demo
  notifyInApp(demo.id, 'Your consultation is confirmed', 'Birth Chart Discussion with Pandit Ramesh Sharma is confirmed. The meeting link is in your booking.', '#/my/bookings');
  notifyInApp(demo.id, 'A gentle reminder', 'Your Satyanarayana Vratam request is with Pandit Ramesh Sharma. We will call you to confirm.', '#/my/bookings');

  // Keep the pandit's public rating counters (they represent years of reviews);
  // the written reviews shown on the site are the most recent ones in the reviews table.

  // Queue legacy-style confirmation messages so the notification log looks alive
  const confirmed = get(`SELECT b.*, s.name AS service_name FROM bookings b LEFT JOIN services s ON s.id = b.service_id WHERE b.booking_ref LIKE ? AND b.status = 'CONFIRMED' LIMIT 1`, [`%${String(2).padStart(4, '0')}`]);
  if (confirmed) queueStatusNotification(confirmed, 'CUSTOMER_BOOKING_CONFIRMED', { service_name: confirmed.service_name });
}

module.exports = { seed };
