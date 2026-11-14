'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function scryptHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function normalizePhone(raw) {
  let digits = String(raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function maskPhone(phone) {
  if (!phone) return '—';
  const s = String(phone);
  if (s.length < 6) return '••••';
  return `${s.slice(0, 3)} ${s.slice(3, 5)}••• ••${s.slice(-3)}`;
}

function maskEmail(email) {
  if (!email) return '—';
  const [name, domain] = String(email).split('@');
  if (!domain) return '••••';
  return `${name.slice(0, 2)}•••@${domain}`;
}

function maskName(name) {
  if (!name) return '—';
  const bits = String(name).trim().split(/\s+/);
  return bits.map((b, i) => (i === 0 ? b : `${b[0]}•`)).join(' ');
}

/* ---------- IST date helpers (fixed offset, India has no DST) ---------- */

function toIst(date = new Date()) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS);
}

function istDateKey(date = new Date()) {
  const d = toIst(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateKeyToUtc(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function istToIso(dateKey, time = '09:00') {
  return new Date(`${dateKey}T${time.length === 5 ? `${time}:00` : time}+05:30`).toISOString();
}

function localIstToIso(value) {
  // value: 'YYYY-MM-DDTHH:mm' (datetime-local, interpreted as IST)
  if (!value) return null;
  const clean = String(value).slice(0, 16);
  const [dateKey, time] = clean.split('T');
  if (!dateKey || !time) return null;
  return istToIso(dateKey, time);
}

function isoToIstLocal(iso) {
  if (!iso) return '';
  const d = toIst(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
});
const DATE_LONG_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
});
const DATE_SHORT_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short',
});
const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
});
const WEEKDAY_FMT = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' });

function fmtDate(iso, style = 'short') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  if (style === 'long') return DATE_LONG_FMT.format(d);
  if (style === 'date') return DATE_FMT.format(d);
  return DATE_SHORT_FMT.format(d);
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return TIME_FMT.format(d);
}

function fmtDateTime(iso) {
  return `${fmtDate(iso)} · ${fmtTime(iso)} IST`;
}

function weekdayKey(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function weekdayName(dateKey) {
  const d = new Date(`${dateKey}T06:00:00Z`);
  return WEEKDAY_FMT.format(d);
}

function relativeFromNow(iso) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return diff > 0 ? `in ${mins} min` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return diff > 0 ? `in ${hours} hr` : `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return diff > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`;
}

function waitingLabel(iso) {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} hr`;
  return `${Math.floor(h / 24)} d`;
}

/* ---------- domain helpers ---------- */

const BOOKING_STATUSES = ['REQUESTED', 'CONTACTED', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'RESCHEDULE_REQUESTED', 'NO_SHOW', 'EXPIRED'];

const STATUS_TONES = {
  REQUESTED: 'amber', CONTACTED: 'blue', CONFIRMED: 'green', COMPLETED: 'slate',
  REJECTED: 'red', CANCELLED: 'red', RESCHEDULE_REQUESTED: 'purple', NO_SHOW: 'red', EXPIRED: 'slate',
};

const STATUS_LABELS = {
  REQUESTED: 'Requested', CONTACTED: 'Contacted', CONFIRMED: 'Confirmed', COMPLETED: 'Completed',
  REJECTED: 'Rejected', CANCELLED: 'Cancelled', RESCHEDULE_REQUESTED: 'Reschedule requested', NO_SHOW: 'No-show', EXPIRED: 'Expired',
};

const TRANSITIONS = {
  REQUESTED: ['CONTACTED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  CONTACTED: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'RESCHEDULE_REQUESTED', 'CANCELLED', 'NO_SHOW'],
  RESCHEDULE_REQUESTED: ['CONFIRMED', 'CANCELLED'],
  COMPLETED: [], REJECTED: [], CANCELLED: [], NO_SHOW: [], EXPIRED: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function bookingRef(date = new Date()) {
  const key = istDateKey(date).replaceAll('-', '');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `BK-${key}-${suffix}`;
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function toCsv(rows, headers) {
  const lines = [];
  if (headers) lines.push(headers.map(csvEscape).join(','));
  for (const row of rows) {
    const values = Array.isArray(row) ? row : headers.map((h) => row[h]);
    lines.push(values.map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeLog(file, line) {
  try {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch (error) {
    console.error('log write failed', error.message);
  }
}

function lastNDateKeys(n, endKey = istDateKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDaysKey(endKey, -i));
  return out;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

module.exports = {
  IST_OFFSET_MS, uuid, nowIso, sha256, randomToken, scryptHash, verifyPassword,
  normalizePhone, maskPhone, maskEmail, maskName,
  istDateKey, addDaysKey, dateKeyToUtc, istToIso, localIstToIso, isoToIstLocal,
  fmtDate, fmtTime, fmtDateTime, weekdayKey, weekdayName, relativeFromNow, waitingLabel,
  BOOKING_STATUSES, STATUS_TONES, STATUS_LABELS, TRANSITIONS, canTransition,
  bookingRef, slugify, toCsv, csvEscape, parseJson, bump, ensureDir, writeLog,
  lastNDateKeys, pct,
};
