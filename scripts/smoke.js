'use strict';

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.SMOKE_PORT || '4399';

const { createApp } = require('../server');
const { run, uuid } = require('../lib/db');
const { scryptHash, nowIso } = require('../lib/util');

const base = `http://127.0.0.1:${process.env.PORT}`;
let cookie = '';

// Ephemeral dev-fixture credentials for the legacy (dev/test-only) login route.
// Never hardcode shared credentials; created per run, deleted at the end.
const runId = Date.now().toString(36);
const O_EMAIL = `smoke-owner-${runId}@test.local`;
const O_PASSWORD = `Smoke!${runId}${runId.length}`;
const P_EMAIL = `smoke-pandit-${runId}@test.local`;
const P_PASSWORD = `Smoke!${runId}${runId.length}`;
let oId = null; let pId = null; let provId = null;

function createFixtures() {
  const ts = nowIso();
  oId = uuid(); pId = uuid(); provId = uuid();
  const ins = (id, email, password, role, name) => run(
    "INSERT INTO users (id, full_name, phone, email, password_hash, role, preferred_language, contact_channel, call_window, marketing_opt_in, city, is_active, last_login_at, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, name, null, email, scryptHash(password), role, 'en', 'CALL', null, 0, 'Hyderabad', 1, null, ts, ts, null]
  );
  ins(oId, O_EMAIL, O_PASSWORD, 'OWNER', 'Smoke Owner');
  ins(pId, P_EMAIL, P_PASSWORD, 'PROVIDER', 'Smoke Pandit');
  // self-contained provider profile linked to the fixture user (no seed dependencies)
  run("INSERT INTO providers (id, user_id, provider_type, display_name, slug, years_of_experience, languages, specializations, is_active, is_verified, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [provId, pId, 'PRIEST', 'Smoke Pandit', `smoke-pandit-${runId}`, 1, '["Telugu"]', '["Griha Pravesh"]', 1, 1, ts, ts]);
}

function dropFixtures() {
  if (provId) run('DELETE FROM providers WHERE id = ?', [provId]);
  if (oId) run('DELETE FROM users WHERE id = ?', [oId]);
  if (pId) run('DELETE FROM users WHERE id = ?', [pId]);
}

async function request(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data?.error || text}`);
  return data;
}

async function main() {
  const server = createApp();
  createFixtures();
  await new Promise((resolve) => server.listen(process.env.PORT, '127.0.0.1', resolve));
  const failures = [];
  const check = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); } catch (error) { failures.push([name, error.message]); console.log('  ✗', name, '—', error.message); }
  };
  try {
    await check('home page payload', async () => {
      const home = await request('GET', '/api/home');
      if (!home.pandit || !home.featured.length) throw new Error('missing pandit or featured services');
    });
    await check('service catalogue and detail', async () => {
      const list = await request('GET', '/api/services?type=PUJA');
      if (!list.services.length) throw new Error('no pujas');
      const detail = await request('GET', `/api/services/${list.services[0].slug}`);
      if (!detail.providers.length) throw new Error('no pandit on service');
    });
    await check('availability', async () => {
      const a = await request('GET', '/api/availability?type=PUJA');
      if (!a.days || a.days.length !== 14) throw new Error('bad calendar');
    });
    await check('horoscope + panchang', async () => {
      const h = await request('GET', '/api/horoscope?sign=aries');
      if (!h.reading) throw new Error('no reading');
      const p = await request('GET', '/api/panchang');
      if (!p.panchang) throw new Error('no panchang');
    });
    await check('demo OTP routes removed', async () => {
      let status = 0;
      try { await request('POST', '/api/auth/otp/request', { phone: '+919876543210' }); }
      catch (e) { status = Number(/→ (\d{3})/.exec(e.message)?.[1]) || 0; }
      if (status !== 404) throw new Error(`demo OTP route still active (status ${status})`);
    });
    await check('owner login', async () => {
      const result = await request('POST', '/api/auth/login', { email: O_EMAIL, password: O_PASSWORD });
      if (!result.user?.isOwner) throw new Error('not owner');
    });
    await check('admin dashboard + inbox', async () => {
      const d = await request('GET', '/api/admin/dashboard');
      if (!d.stats) throw new Error('no stats');
      const inbox = await request('GET', '/api/admin/inbox');
      if (!inbox.bookings.length) throw new Error('empty inbox');
    });
    await check('admin calendar + availability', async () => {
      await request('GET', '/api/admin/calendar');
      const a = await request('GET', '/api/admin/availability');
      if (!a.rules.length) throw new Error('no rules');
    });
    await check('admin services + events + customers + reports', async () => {
      await request('GET', '/api/admin/services');
      await request('GET', '/api/admin/events');
      await request('GET', '/api/admin/customers');
      await request('GET', '/api/admin/reports');
    });
    cookie = '';
    await check('pandit login', async () => {
      const result = await request('POST', '/api/auth/login', { email: P_EMAIL, password: P_PASSWORD });
      if (!result.user?.provider) throw new Error('no provider profile');
    });
    await check('provider dashboard + bookings', async () => {
      const d = await request('GET', '/api/provider/dashboard');
      if (!d.counts) throw new Error('no counts');
      await request('GET', '/api/provider/bookings');
      await request('GET', '/api/provider/availability');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    dropFixtures();
  }
  console.log('');
  if (failures.length) {
    console.log(`${failures.length} smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('All smoke checks passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
