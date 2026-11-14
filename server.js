'use strict';

require('dotenv').config(); // Load .env (Supabase keys, PORT, etc.)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { get } = require('./lib/db');
const { publicSettings } = require('./lib/db');
const { readBody, parseCookies, sendJson, HttpError } = require('./lib/http');
const { COOKIE_NAME, sessionUser, publicUser, authRoutes } = require('./lib/auth');
const publicRoutes = require('./lib/routes-public');
const { accountRoutes } = require('./lib/routes-account');
const { adminRoutes } = require('./lib/routes-admin');
const { providerRoutes } = require('./lib/routes-provider');
const nextgenRoutes = require('./lib/routes-nextgen');
const { ensureUploadDir } = require('./lib/routes-nextgen');
const { seed } = require('./lib/seed');
const { processOutbox, scheduleReminders } = require('./lib/notify');
const { expireHolds, ensureAllSlots } = require('./lib/slots');

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'ui');                    // site shell: index.html, assets, pages, manifest, service worker
const UPLOADS_SERVE_DIR = path.join(__dirname, 'public');         // uploaded files live in public/uploads and are served at /uploads/*
const MAX_BODY = 2 * 1024 * 1024;

const routes = [...authRoutes(), ...publicRoutes, ...accountRoutes(), ...adminRoutes(), ...providerRoutes(), ...nextgenRoutes];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

function compile(route) {
  const parts = route.path.split('/').filter(Boolean);
  return { ...route, parts };
}

const compiled = routes.map(compile);

function matchRoute(method, pathname) {
  const segments = pathname.split('/').filter(Boolean);
  for (const route of compiled) {
    if (route.method !== method) continue;
    if (route.parts.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < route.parts.length; i++) {
      const part = route.parts[i];
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(segments[i]);
      else if (part !== segments[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

function serveStatic(req, res, pathname) {
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = relative === 'uploads' || relative.startsWith('uploads/') ? UPLOADS_SERVE_DIR : PUBLIC_DIR;
  let filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: any unknown non-file path gets the app shell.
    if (path.extname(relative)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Aradhana is starting. The site files are not installed yet.');
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-cache' : 'public, max-age=3600';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

async function handle(req, res) {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(req.method)) {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    return serveStatic(req, res, pathname);
  }

  const found = matchRoute(req.method === 'HEAD' ? 'GET' : req.method, pathname);
  if (!found) {
    return sendJson(res, 404, { error: 'API route not found', path: pathname });
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME] || null;
  const user = sessionUser(token);
  const query = Object.fromEntries(url.searchParams.entries());

  let body = {};
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try { body = await readBody(req, MAX_BODY); } catch (error) {
      return sendJson(res, error.status || 400, { error: error.message });
    }
  }

  const ctx = {
    req, res, url, query, body, params: found.params, user, token,
    ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
    userAgent: req.headers['user-agent'] || '',
  };

  try {
    const result = await found.route.handler(ctx);
    if (ctx.raw) return undefined;
    if (result === undefined) return undefined;
    return sendJson(res, ctx.status || 200, result);
  } catch (error) {
    if (error instanceof HttpError) {
      return sendJson(res, error.status, {
        error: error.message,
        code: error.code || undefined,
        details: error.details || undefined,
      });
    }
    console.error(`[api] ${req.method} ${pathname}`, error);
    return sendJson(res, 500, {
      error: process.env.NODE_ENV === 'production'
        ? 'Something went wrong. Please try again.'
        : `Server error: ${error.message}`,
    });
  }
}

function ensureSeeded() {
  try { ensureUploadDir(); } catch { /* noop */ }
  const count = get('SELECT COUNT(*) AS n FROM users');
  if (count && count.n > 0) return false;
  // Fresh database: restore the real data from Supabase first (deploy-safe —
  // Render's free tier starts with an empty disk). Demo seed only runs when
  // Supabase has nothing either.
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(
      process.execPath,
      [path.join(__dirname, 'scripts', 'rehydrate-from-supabase.js')],
      { env: { ...process.env, REHYDRATE_QUIET: '1' }, encoding: 'utf8', timeout: 120000 }
    ).trim();
    const match = /REHYDRATE_DONE:(\d+)/.exec(out);
    if (match && Number(match[1]) > 0) {
      console.log(`☁️  Restored ${match[1]} rows from Supabase into the fresh database.`);
      return false;
    }
  } catch (e) {
    const out = String(e.stdout || '');
    if (/REHYDRATE_SKIPPED/.test(out)) {
      console.log('Supabase not configured — falling back to demo seed.');
    } else {
      console.warn('Rehydration from Supabase failed — falling back to demo seed.', e.message);
    }
  }
  console.log('First run — seeding the Aradhana database (this can take a few seconds)…');
  seed();
  console.log('Seed complete.');
  return true;
}

let jobs = null;
function startJobs() {
  if (jobs) return;
  const outbox = setInterval(() => {
    try { processOutbox(50); } catch (error) { console.error('outbox job failed', error.message); }
  }, 8000);
  const holds = setInterval(() => {
    try { expireHolds(); } catch (error) { console.error('hold expiry job failed', error.message); }
  }, 60000);
  const slots = setInterval(() => {
    try { ensureAllSlots(30); } catch (error) { console.error('slot job failed', error.message); }
  }, 6 * 60 * 60 * 1000);
  const reminders = setInterval(() => {
    try { scheduleReminders(); } catch (error) { console.error('reminder job failed', error.message); }
  }, 15 * 60 * 1000);
  outbox.unref?.(); holds.unref?.(); slots.unref?.(); reminders.unref?.();
  jobs = { outbox, holds, slots, reminders };
}

function createApp() {
  ensureSeeded();
  try { processOutbox(100); } catch { /* noop */ }
  try { scheduleReminders(); } catch { /* noop */ }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error('Unhandled request error', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Unexpected server error' });
      else res.end();
    });
  });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use. Stop the other server or run with PORT=4322.\n`);
      process.exit(1);
    }
    throw error;
  });
  return server;
}

if (require.main === module) {
  const server = createApp();
  server.listen(PORT, HOST, () => {
    startJobs();
    console.log('');
    console.log('  ✦  Aradhana is live');
    console.log(`     http://localhost:${PORT}`);
    console.log('');
  });
  const shutdown = () => {
    console.log('\nShutting down…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createApp, handle, PORT };
