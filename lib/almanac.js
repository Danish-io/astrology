'use strict';

const crypto = require('node:crypto');
const { get, insert, run } = require('./db');
const { uuid, istDateKey, addDaysKey, weekdayKey, weekdayName, fmtDate, istToIso } = require('./util');

const SIGNS = [
  { code: 'aries', name: 'Aries', local: 'Mesha', symbol: '♈', element: 'Fire', planet: 'Mars', dates: '21 Mar – 19 Apr', blurb: 'The first spark. Courageous, direct and always ready to begin.' },
  { code: 'taurus', name: 'Taurus', local: 'Vrishabha', symbol: '♉', element: 'Earth', planet: 'Venus', dates: '20 Apr – 20 May', blurb: 'Grounded and sensual. You build slowly, and beautifully.' },
  { code: 'gemini', name: 'Gemini', local: 'Mithuna', symbol: '♊', element: 'Air', planet: 'Mercury', dates: '21 May – 20 Jun', blurb: 'Curious and quick. A mind that loves a good question.' },
  { code: 'cancer', name: 'Cancer', local: 'Karka', symbol: '♋', element: 'Water', planet: 'Moon', dates: '21 Jun – 22 Jul', blurb: 'Tender and protective. Home is a feeling you carry.' },
  { code: 'leo', name: 'Leo', local: 'Simha', symbol: '♌', element: 'Fire', planet: 'Sun', dates: '23 Jul – 22 Aug', blurb: 'Warm and regal. You are here to be seen, not diminished.' },
  { code: 'virgo', name: 'Virgo', local: 'Kanya', symbol: '♍', element: 'Earth', planet: 'Mercury', dates: '23 Aug – 22 Sep', blurb: 'Precise and devoted. Care, in your hands, is a craft.' },
  { code: 'libra', name: 'Libra', local: 'Tula', symbol: '♎', element: 'Air', planet: 'Venus', dates: '23 Sep – 22 Oct', blurb: 'Grace and balance. You seek the beautiful middle path.' },
  { code: 'scorpio', name: 'Scorpio', local: 'Vrishchika', symbol: '♏', element: 'Water', planet: 'Mars / Pluto', dates: '23 Oct – 21 Nov', blurb: 'Deep and transformative. You feel the truth beneath the surface.' },
  { code: 'sagittarius', name: 'Sagittarius', local: 'Dhanu', symbol: '♐', element: 'Fire', planet: 'Jupiter', dates: '22 Nov – 21 Dec', blurb: 'Seeker and optimist. The horizon is your familiar.' },
  { code: 'capricorn', name: 'Capricorn', local: 'Makara', symbol: '♑', element: 'Earth', planet: 'Saturn', dates: '22 Dec – 19 Jan', blurb: 'Patient and wise. You are building something that lasts.' },
  { code: 'aquarius', name: 'Aquarius', local: 'Kumbha', symbol: '♒', element: 'Air', planet: 'Saturn / Rahu', dates: '20 Jan – 18 Feb', blurb: 'Inventive and independent. You see the future early.' },
  { code: 'pisces', name: 'Pisces', local: 'Meena', symbol: '♓', element: 'Water', planet: 'Jupiter', dates: '19 Feb – 20 Mar', blurb: 'Dreaming and compassionate. Your softness is a strength.' },
];

const TITHI = [
  'Shukla Pratipada', 'Shukla Dwitiya', 'Shukla Tritiya', 'Shukla Chaturthi', 'Shukla Panchami',
  'Shukla Shashthi', 'Shukla Saptami', 'Shukla Ashtami', 'Shukla Navami', 'Shukla Dashami',
  'Shukla Ekadashi', 'Shukla Dwadashi', 'Shukla Trayodashi', 'Shukla Chaturdashi', 'Purnima',
  'Krishna Pratipada', 'Krishna Dwitiya', 'Krishna Tritiya', 'Krishna Chaturthi', 'Krishna Panchami',
  'Krishna Shashthi', 'Krishna Saptami', 'Krishna Ashtami', 'Krishna Navami', 'Krishna Dashami',
  'Krishna Ekadashi', 'Krishna Dwadashi', 'Krishna Trayodashi', 'Krishna Chaturdashi', 'Amavasya',
];
const NAKSHATRA = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha',
  'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati',
];
const YOGA = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti',
  'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata',
  'Variyan', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];
const KARANA = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti', 'Shakuni', 'Chatushpada', 'Naga', 'Kimstughna'];
const MOON_PHASES = ['Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent', 'New moon'];
const COLORS = ['Saffron', 'Deep maroon', 'Marigold gold', 'Sandstone beige', 'Forest green', 'Indigo', 'Pearl white', 'Rose', 'Turquoise', 'Copper'];
const AUTHORS = ['Acharya Lakshmi Devi', 'Dr. Ananya Joshi', 'Guru Arvind Shastri'];

function hashInt(text) {
  const h = crypto.createHash('sha256').update(text).digest();
  return h.readUInt32BE(0);
}

function pick(list, seed, offset = 0) {
  return list[(seed + offset * 7) % list.length];
}

function ensurePanchang(dateKey = istDateKey()) {
  const existing = get('SELECT * FROM panchang_days WHERE for_date = ?', [dateKey]);
  if (existing) return existing;
  const dayNum = Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / 86400000);
  const tithiIndex = ((dayNum + 11) % 30 + 30) % 30;
  const tithi = TITHI[tithiIndex];
  const paksha = tithiIndex < 15 ? 'Shukla' : 'Krishna';
  const nakshatra = NAKSHATRA[((dayNum * 13 + 7) % 27 + 27) % 27];
  const yoga = YOGA[((dayNum * 2 + 3) % 27 + 27) % 27];
  const karana = KARANA[(dayNum + 4) % 11];
  const wd = weekdayKey(dateKey);
  const rahuSegments = [8, 2, 7, 5, 6, 4, 3];
  const sunriseMin = 6 * 60 + 15 + ((dayNum % 7) - 3) * 2;
  const sunsetMin = 17 * 60 + 48 + ((dayNum % 5) - 2) * 2;
  const rahuStartMin = sunriseMin + (rahuSegments[wd] - 1) * 90;
  const abhijitStartMin = 11 * 60 + 48;
  const notesPool = [
    'A steady day for beginning what matters. Prefer the morning muhurat for griha pravesh.',
    'Good for satyanarayana vratam and family prayers. Keep the evening light and quiet.',
    'An auspicious window for navagraha shanti. Avoid new financial commitments after sunset.',
    'A gentle day for gratitude and charity. Purnahuti is favoured before noon.',
    'Favourable for homam and temple visits. Rahu kalam is best kept for inward work.',
  ];
  const auspicious = !['Krishna Ashtami', 'Krishna Chaturdashi', 'Amavasya'].includes(tithi) && yoga !== 'Vaidhriti';
  const row = {
    id: uuid(), for_date: dateKey, location_code: 'HYD', tithi, paksha, nakshatra, yoga, karana,
    sunrise: minsToClock(sunriseMin), sunset: minsToClock(sunsetMin),
    rahu_start: minsToClock(rahuStartMin), rahu_end: minsToClock(rahuStartMin + 90),
    abhijit_start: minsToClock(abhijitStartMin), abhijit_end: minsToClock(abhijitStartMin + 48),
    is_auspicious_for_puja: auspicious ? 1 : 0,
    notes: notesPool[dayNum % notesPool.length],
    moon_phase: MOON_PHASES[Math.floor(tithiIndex / 3.75) % 8],
  };
  insert('panchang_days', row);
  return row;
}

function minsToClock(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAILY_POOL = {
  love: [
    'A softer conversation clears something that has been sitting between you and someone close.',
    'Let affection be practical today — a small act of care lands deeper than a grand gesture.',
    'An old connection may return to your thoughts. Notice what you still feel, without rushing to act.',
    'Speak your needs plainly. The right person is listening more closely than you think.',
  ],
  career: [
    'A task you have been circling finally finds its shape. Begin with the smallest honest step.',
    'Someone with more experience is quietly noticing your work. Keep your standards high.',
    'Avoid solving everyone else’s problem before your own. Protect your focus this morning.',
    'A useful conversation opens a door you did not expect. Ask one more question.',
  ],
  finance: [
    'Steady is the theme. Review a recurring expense before adding a new one.',
    'A delayed payment may move forward. Follow up politely, and keep the paper trail tidy.',
    'Good day to plan rather than purchase. A clearer budget will feel like relief.',
    'An opportunity to earn from a skill you already have. Value your time properly.',
  ],
  health: [
    'Your body is asking for rhythm more than intensity. Sleep a little earlier tonight.',
    'A short walk after meals will do more than a punishing workout today.',
    'Hydration and warm food are your allies. Avoid skipping lunch.',
    'Your energy is good for gentle movement. Stretch the shoulders and unclench your jaw.',
  ],
};
const WEEKLY_POOL = [
  'This week rewards consolidation over expansion. Finish what is half-open, honour a promise you made to yourself, and let the next beginning arrive on time.',
  'A week of clear signals. Conversations that felt vague become specific by midweek. Say yes only to what you can wholeheartedly hold.',
  'Momentum returns quietly. A small discipline practised daily will shift more than one dramatic effort. Watch for a helpful introduction near the weekend.',
  'The week asks you to choose your company with care. Warmth is available; so is noise. Protect your attention and the rest follows.',
];
const MONTHLY_POOL = [
  'This month is a slow, luminous recalibration. Priorities you have outgrown will fall away naturally. Make room for one practice, one person and one project that genuinely restore you.',
  'A month for building foundations rather than chasing proof. Financial decisions benefit from patience, and a relationship deepens through honesty rather than performance.',
  'Momentum gathers after a quiet start. A professional opportunity asks for preparation, not bravado. Keep your calendar spacious around the full moon.',
];
const YEARLY_POOL = [
  'The year ahead is a passage from proving to belonging. Career structures evolve, and the relationships that stay become more honest. Choose consistency over intensity and the year will carry you well.',
  'A year of visible growth, gently earned. Learning, travel or a new community may reshape your plans. Say yes to what expands your skill, not merely your status.',
  'A year to rebuild trust in your own timing. Financial clarity improves step by step, and love asks for presence rather than prediction.',
];

function periodDateKey(dateKey, period) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (period === 'WEEKLY') {
    const wd = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (wd === 0 ? 6 : wd - 1));
    return d.toISOString().slice(0, 10);
  }
  if (period === 'MONTHLY') return `${dateKey.slice(0, 7)}-01`;
  if (period === 'YEARLY') return `${dateKey.slice(0, 4)}-01-01`;
  return dateKey;
}

function ensureHoroscope(signCode, period = 'DAILY', dateKey = istDateKey()) {
  const sign = get('SELECT * FROM zodiac_signs WHERE code = ?', [signCode]);
  if (!sign) return null;
  const normalizedPeriod = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(period) ? period : 'DAILY';
  const key = periodDateKey(dateKey, normalizedPeriod);
  const existing = get(
    `SELECT h.*, z.code AS sign_code, z.name_en AS sign_name, z.symbol, z.date_range_text AS sign_dates
       FROM daily_horoscopes h JOIN zodiac_signs z ON z.id = h.zodiac_sign_id
      WHERE h.zodiac_sign_id = ? AND h.for_date = ? AND h.period = ? AND h.language = 'en'`,
    [sign.id, key, normalizedPeriod]
  );
  if (existing) return existing;

  const seed = hashInt(`${sign.code}:${key}:${normalizedPeriod}`);
  let summary;
  if (normalizedPeriod === 'DAILY') {
    const rising = ['The Moon moves through your sector of home and belonging.', 'Mercury favours a clear, unhurried conversation.', 'Jupiter asks you to think a little bigger than your current worry.', 'Venus softens an edge in a close relationship.'][seed % 4];
    summary = `${rising} ${WEEKLY_POOL[seed % WEEKLY_POOL.length].split('. ')[0]}. ${pick(DAILY_POOL.career, seed, 1)} Keep the day simple and the important things will rise to the surface.`;
  } else if (normalizedPeriod === 'WEEKLY') {
    summary = WEEKLY_POOL[seed % WEEKLY_POOL.length];
  } else if (normalizedPeriod === 'MONTHLY') {
    summary = MONTHLY_POOL[seed % MONTHLY_POOL.length];
  } else {
    summary = YEARLY_POOL[seed % YEARLY_POOL.length];
  }

  const row = {
    id: uuid(), zodiac_sign_id: sign.id, for_date: key, period: normalizedPeriod, language: 'en',
    summary,
    love: pick(DAILY_POOL.love, seed, 1),
    career: pick(DAILY_POOL.career, seed, 2),
    finance: pick(DAILY_POOL.finance, seed, 3),
    health: pick(DAILY_POOL.health, seed, 4),
    lucky_number: String((seed % 9) + 1),
    lucky_color: pick(COLORS, seed, 2),
    author_id: pick(AUTHORS, seed, 5),
  };
  insert('daily_horoscopes', row);
  return { ...row, sign_code: sign.code, sign_name: sign.name_en, symbol: sign.symbol, sign_dates: sign.date_range_text };
}

function signCards(dateKey = istDateKey()) {
  return SIGNS.map((sign) => ({ ...sign, horoscope: ensureHoroscope(sign.code, 'DAILY', dateKey) }));
}

function periodLabel(period, dateKey = istDateKey()) {
  if (period === 'WEEKLY') return `Week of ${fmtDate(istToIso(periodDateKey(dateKey, 'WEEKLY'), '12:00'), 'date')}`;
  if (period === 'MONTHLY') return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${periodDateKey(dateKey, 'MONTHLY')}T12:00:00+05:30`));
  if (period === 'YEARLY') return dateKey.slice(0, 4);
  return `${weekdayName(dateKey)}, ${fmtDate(istToIso(dateKey, '12:00'), 'date')}`;
}

module.exports = {
  SIGNS, ensurePanchang, ensureHoroscope, signCards, periodDateKey, periodLabel,
};
