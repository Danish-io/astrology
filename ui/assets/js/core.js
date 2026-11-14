// Aradhana â€” core helpers, state, routing and layout
'use strict';

export const state = {
  user: null,
  settings: {},
  unread: 0,
  route: '/',
  params: {},
  query: {},
  ready: false,
};

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
export function money(n) { return n ? `â‚¹${Number(n).toLocaleString('en-IN')}` : 'â€”'; }
export function fmtDate(iso, style = 'date') {
  if (!iso) return 'â€”';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'â€”';
  const opts = style === 'long'
    ? { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }
    : style === 'short' ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(d);
}
export function fmtTime(iso) {
  if (!iso) return 'â€”';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'â€”';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
}
export function fmtDateTime(iso) { return iso ? `${fmtDate(iso)} Â· ${fmtTime(iso)} IST` : 'â€”'; }
export function relative(iso) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(Math.abs(diff) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return diff > 0 ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return diff > 0 ? `in ${d}d` : `${d}d ago`;
}
export function initials(name) {
  return String(name || '').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'A';
}
export function statusTone(status) {
  return ({ REQUESTED:'amber', CONTACTED:'blue', CONFIRMED:'green', COMPLETED:'slate', REJECTED:'red', CANCELLED:'red', RESCHEDULE_REQUESTED:'purple', NO_SHOW:'red', EXPIRED:'slate' }[status] || 'slate');
}
export function statusLabel(status) {
  return ({ REQUESTED:'Requested', CONTACTED:'Contacted', CONFIRMED:'Confirmed', COMPLETED:'Completed', REJECTED:'Declined', CANCELLED:'Cancelled', RESCHEDULE_REQUESTED:'Reschedule requested', NO_SHOW:'No-show', EXPIRED:'Expired' }[status] || status);
}
export function badge(status) {
  return `<span class="badge badge-${statusTone(status)}">${statusLabel(status)}</span>`;
}

// ---------- API ----------
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: { 'Accept': 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401) state.user = null;
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    err.details = data?.details;
    err.data = data;
    throw err;
  }
  return data;
}
export const API = {
  get: (p) => api(p),
  post: (p, b) => api(p, { method: 'POST', body: b }),
  put: (p, b) => api(p, { method: 'PUT', body: b }),
  del: (p) => api(p, { method: 'DELETE' }),
};

// ---------- toast ----------
let toastRoot = null;
export function ensureToastRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toast-root';
    document.body.appendChild(toastRoot);
  }
  return toastRoot;
}
export function toast(title, message = '', type = 'info', ms = 4200) {
  const root = ensureToastRoot();
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<div><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div><button class="toast-close" aria-label="Close">Ã—</button>`;
  root.appendChild(node);
  const close = () => { node.style.opacity = '0'; setTimeout(() => node.remove(), 200); };
  node.querySelector('.toast-close').addEventListener('click', close);
  if (ms) setTimeout(close, ms);
  return node;
}

// ---------- modal ----------
export function modal({ title, subtitle = '', body = '', actions = '', size = '' }) {
  const root = document.createElement('div');
  root.className = 'modal-root';
  root.innerHTML = `
    <div class="modal-scrim"></div>
    <div class="modal-panel ${size}">
      <div class="modal-head">
        <div><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>
        <button class="modal-close" aria-label="Close">Ã—</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions ? `<div class="modal-actions" style="padding:0 24px 22px">${actions}</div>` : ''}
    </div>`;
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  const close = () => { root.remove(); document.body.style.overflow = ''; };
  root.querySelector('.modal-scrim').addEventListener('click', close);
  root.querySelector('.modal-close').addEventListener('click', close);
  root._close = close;
  return { root, close };
}

// ---------- password visibility toggle ----------
const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:18px;height:18px"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a20.3 20.3 0 0 1 4.24-5.13M9.9 4.24A10.86 10.86 0 0 1 12 5c6.5 0 10 7 10 7a20.4 20.4 0 0 1-2.16 3.19"/><path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/><path d="M1 1l22 22"/></svg>';

/** Wrap every password input under root with a Show/Hide eye button. Idempotent. */
export function wirePasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.dataset.toggleBound) return;
    input.dataset.toggleBound = '1';
    const wrap = document.createElement('div');
    wrap.className = 'password-field';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = EYE_SVG;
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      btn.innerHTML = showing ? EYE_SVG : EYE_OFF_SVG;
    });
    wrap.appendChild(btn);
  });
}

// ---------- router ----------
const routes = [];
export function register(pattern, render) {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ pattern, parts, render });
}
export function navigate(hash) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}
function matchRoute(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.parts.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segments[i]);
      else if (r.parts[i] !== segments[i]) { ok = false; break; }
    }
    if (ok) return { route: r, params };
  }
  return null;
}
export function currentPath() {
  const h = location.hash || '#/';
  return h.replace(/^#/, '').split('?')[0] || '/';
}
export function currentQuery() {
  const h = location.hash || '#/';
  const q = h.split('?')[1];
  return q ? Object.fromEntries(new URLSearchParams(q)) : {};
}
export async function handleRoute() {
  const app = document.getElementById('app');
  const path = currentPath();
  const query = currentQuery();
  state.route = path;
  state.query = query;
  const found = matchRoute(path);
  state.params = found ? found.params : {};
  window.scrollTo(0, 0);
  if (!found) {
    app.innerHTML = `<div class="error-page fade-in"><h1>404</h1><p>That page wandered off into the stars.</p><a class="btn btn-primary" href="#/">Return home</a></div>`;
    return;
  }
  app.innerHTML = `<div class="page-loading"><div class="container"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-card"></div></div></div>`;
  try {
    const html = await found.route.render(state.params, query);
    if (typeof html === 'string') app.innerHTML = html;
    else if (html instanceof Node) { app.innerHTML = ''; app.appendChild(html); }
    enhance(app);
  } catch (err) {
    if (err?.status === 401) { navigate('#/login'); return; }
    console.error(err);
    app.innerHTML = `<div class="error-page fade-in"><h1>Oops</h1><p>${escapeHtml(err?.message || 'Something went wrong.')}</p><a class="btn btn-primary" href="#/">Return home</a></div>`;
  }
}
export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

// ---------- layout ----------
export function layout(inner, { mode = 'public' } = {}) {
  return `
  ${topbar()}
  ${header(mode)}
  <main>${inner}</main>
  ${footer()}
  ${mode === 'public' ? mobileBar() : ''}
  `;
}
function topbar() {
  const s = state.settings || {};
  const phone = s['site.contact_phone'] || '+91 90000 12345';
  const wa = (s['site.contact_whatsapp'] || '+919000012345').replace(/\D/g, '');
  return `<div class="site-topbar"><div class="container">
    <span>${escapeHtml(s['site.pandit_title'] || 'Vedic priest & jyotish guide Â· Hyderabad')}</span>
    <div class="topbar-right">
      <a href="tel:${escapeHtml(phone.replace(/\s/g, ''))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${escapeHtml(phone)}</a>
    </div>
  </div></div>`;
}
function header(mode) {
  const u = state.user;
  const s = state.settings || {};
  const name = s['site.name'] || 'Aradhana';
  const nav = mode === 'admin' || mode === 'provider' ? '' : `
    <nav class="main-nav">
      <a href="#/pujas" class="${state.route.startsWith('/pujas')||state.route.startsWith('/services')?'active':''}">Pujas</a>
      <a href="#/guidance" class="${state.route.startsWith('/guidance')?'active':''}">Personal guidance</a>
      <a href="#/events" class="${state.route.startsWith('/events')?'active':''}">Gatherings</a>
      <a href="#/panchang" class="${state.route.startsWith('/panchang')||state.route.startsWith('/horoscope')?'active':''}">Panchang</a>
      <a href="#/about" class="${state.route.startsWith('/about')?'active':''}">About</a>
    </nav>`;
  const actions = u ? `
    <a class="header-login" href="${u.isStaff ? (u.isOwner ? '#/admin' : (u.provider ? '#/provider' : '#/admin')) : '#/my'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      ${escapeHtml(u.fullName.split(' ')[0])}
    </a>
    <button class="btn btn-ghost btn-sm" id="signOutBtn" type="button">Sign out</button>` : `<a class="header-login" href="#/login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Sign in</a>
    <a class="btn btn-primary btn-sm" href="#/pujas">Book a puja</a>`;
  return `<header class="site-header" id="siteHeader">
    <div class="container">
      <a class="brand" href="#/">
        <span class="brand-mark"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c5 10 5 17 0 25-5-8-5-15 0-25Z" stroke="currentColor" stroke-width="1.4"/><path d="M32 58c-5-10-5-17 0-25 5 8 5 15 0 25Z" stroke="currentColor" stroke-width="1.4"/><path d="M6 32c10-5 17-5 25 0-8 5-15 5-25 0Z" stroke="currentColor" stroke-width="1.4"/><path d="M58 32c-10 5-17 5-25 0 8-5 15-5 25 0Z" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg></span>
        <span class="brand-text"><span class="brand-name">${escapeHtml(name)}</span><span class="brand-sub">Vedic pujas Â· jyotish Â· gatherings</span></span>
      </a>
      ${nav}
      <div class="header-actions">${actions}</div>
      <button class="nav-toggle" id="navToggle" aria-label="Open menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
    </div>
  </header>`;
}
function footer() {
  const s = state.settings || {};
  const phone = s['site.contact_phone'] || '+91 90000 12345';
  const wa = (s['site.contact_whatsapp'] || '+919000012345').replace(/\D/g, '');
  const email = s['site.email'] || 'namaste@aradhana.in';
  const addr = s['site.address'] || '12 Lotus Lane, Jubilee Hills, Hyderabad 500033';
  const hours = s['site.hours'] || 'Monâ€“Sat, 9:00 AM â€“ 8:00 PM IST';
  const ig = s['site.instagram']; const yt = s['site.youtube'];
  return `<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="#/"><span class="brand-mark" style="color:#f7ebd8"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c5 10 5 17 0 25-5-8-5-15 0-25Z" stroke="currentColor" stroke-width="1.4"/><path d="M32 58c-5-10-5-17 0-25 5 8 5 15 0 25Z" stroke="currentColor" stroke-width="1.4"/><path d="M6 32c10-5 17-5 25 0-8 5-15 5-25 0Z" stroke="currentColor" stroke-width="1.4"/><path d="M58 32c-10 5-17 5-25 0 8-5 15-5 25 0Z" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg></span>
          <span class="brand-text"><span class="brand-name" style="color:#f7ebd8">${escapeHtml(s['site.name'] || 'Aradhana')}</span><span class="brand-sub" style="color:#b19263">${escapeHtml(s['site.tagline'] || '')}</span></span></a>
          <p>${escapeHtml(s['site.pandit_bio'] || 'A small, steady practice: one family priest who performs every puja himself, reads every chart himself, and answers every request himself.')} </p>
          <div class="footer-newsletter"><input type="email" placeholder="A gentle note with the next full moon" id="nlEmail" /><button id="nlBtn" aria-label="Subscribe"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button></div>
        </div>
        <div class="footer-col"><h4>Explore</h4>
          <a href="#/pujas">Pujas</a><a href="#/guidance">Personal guidance</a><a href="#/events">Sacred gatherings</a><a href="#/horoscope">Daily horoscope</a><a href="#/panchang">Panchang</a><a href="#/about">About Pandit ji</a>
        </div>
        <div class="footer-col"><h4>Account</h4>
          <a href="#/login">Sign in</a><a href="#/my">My bookings</a><a href="#/my/profiles">Birth profiles</a><a href="#/my/addresses">Addresses</a><a href="#/faq">FAQ</a>
        </div>
        <div class="footer-col"><h4>Contact</h4>
          <div class="footer-contact">
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>${escapeHtml(phone)}</span></div>
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><span>${escapeHtml(email)}</span></div>
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${escapeHtml(addr)}</span></div>
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(hours)}</span></div>
          </div>
          <div style="display:flex;gap:10px;margin-top:14px">${ig?`<a href="${escapeHtml(ig)}" target="_blank" rel="noopener" class="text-link" style="border:0">Instagram</a>`:''}${yt?`<a href="${escapeHtml(yt)}" target="_blank" rel="noopener" class="text-link" style="border:0">YouTube</a>`:''}</div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>Â© ${new Date().getFullYear()} ${escapeHtml(s['site.name'] || 'Aradhana')} Â· Requests, not transactions. No payment is taken online.</span>
        <span class="footer-om">à¥ à¤¶à¤¾à¤¨à¥à¤¤à¤¿à¤ƒ à¤¶à¤¾à¤¨à¥à¤¤à¤¿à¤ƒ à¤¶à¤¾à¤¨à¥à¤¤à¤¿à¤ƒ</span>
        <span><a href="#/privacy">Privacy</a> Â· <a href="#/terms">Terms</a> Â· <a href="#/cancellation">Cancellation</a></span>
      </div>
    </div>
  </footer>`;
}
function mobileBar() {
  return `<nav class="mobile-bar" aria-label="Quick actions">
    <a href="#/pujas" class="${state.route.startsWith('/pujas')?'is-primary':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>Book</a>
    <a href="tel:${(state.settings?.['site.contact_phone']||'+91 90000 12345').replace(/\s/g,'')}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</a>
    <a href="#/${state.user ? 'my' : 'login'}" class="${state.route.startsWith('/my')||state.route.startsWith('/login')?'is-primary':''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Account</a>
  </nav>`;
}
// (removed)

export function enhance(root = document) {
  // header scroll
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  // mobile drawer
  const toggle = document.getElementById('navToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      let drawer = document.getElementById('mobileDrawer');
      if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'mobileDrawer';
        drawer.className = 'mobile-drawer open';
        drawer.innerHTML = `<div class="drawer-scrim"></div><div class="drawer-panel">
          <a class="brand" href="#/"><span class="brand-mark"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c5 10 5 17 0 25-5-8-5-15 0-25Z" stroke="currentColor" stroke-width="1.4"/><circle cx="32" cy="32" r="5" fill="currentColor"/></svg></span><span class="brand-text"><span class="brand-name">${escapeHtml(state.settings?.['site.name']||'Aradhana')}</span></span></a>
          <nav class="drawer-nav">
            <a href="#/pujas">Pujas<small>Ceremonies for home & life</small></a>
            <a href="#/guidance">Personal guidance<small>Readings & consultations</small></a>
            <a href="#/events">Gatherings<small>Homam & group pujas</small></a>
            <a href="#/horoscope">Horoscope<small>Daily & yearly</small></a>
            <a href="#/panchang">Panchang<small>Today's almanac</small></a>
            <a href="#/about">About Pandit ji</a>
            <a href="#/faq">Questions</a>
          </nav>
          <div class="drawer-actions">
            <a class="btn btn-primary" href="#/pujas">Request a puja</a>
            <a class="btn btn-outline" href="#/${state.user ? 'my' : 'login'}">${state.user ? 'My account' : 'Sign in'}</a>
          </div>
        </div>`;
        document.body.appendChild(drawer);
        drawer.querySelector('.drawer-scrim').addEventListener('click', () => drawer.remove());
        drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => drawer.remove()));
      } else {
        drawer.classList.toggle('open');
        if (!drawer.classList.contains('open')) drawer.remove();
      }
    });
  }
  // FAQ accordion
  root.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
  });
  // newsletter
  const nlBtn = document.getElementById('nlBtn');
  if (nlBtn) {
    nlBtn.addEventListener('click', async () => {
      const email = document.getElementById('nlEmail')?.value;
      try {
        await API.post('/api/newsletter', { email });
        toast('You are on the list', 'A gentle note will arrive with the next full moon.', 'success');
      } catch (e) { toast('Could not subscribe', e.message, 'error'); }
    });
  }
  // sign out
  document.querySelectorAll('#signOutBtn').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  });
  // tabs
  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.tabGroup || 'default';
      qsa(`[data-tab-group="${group}"]`).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      qsa(`[data-panel-group="${group}"]`).forEach((p) => p.classList.toggle('hide', p.dataset.panel !== btn.dataset.tab));
    });
  });
  // show/hide password eye buttons
  wirePasswordToggles(root);
}

// ---------- auth helpers ----------
export async function loadMe() {
  try {
    const data = await API.get('/api/me');
    state.user = data.user;
    state.unread = data.unreadNotifications || 0;
  } catch { state.user = null; state.unread = 0; }
}
export async function loadSettings() {
  try {
    const data = await API.get('/api/settings/public');
    state.settings = data.settings || {};
  } catch { state.settings = {}; }
}
export function isStaff() { return !!state.user?.isStaff; }
export function isOwner() { return !!state.user?.isOwner; }
export function isProvider() { return !!state.user?.provider; }
export async function logout() {
  // Clear the Supabase session (if any) first, then the backend cookie.
  try {
    const a = await import('./auth-supabase.js?v=13');
    await a.signOut();
  } catch {
    try { await API.post('/api/auth/logout'); } catch {}
  }
  state.user = null;
  navigate('#/');
}

// ---------- service icon by slug/category ----------
export function serviceIcon(slug = '', type = 'PUJA') {
  const map = {
    'griha-pravesh':'home','satyanarayana':'lotus','lakshmi-kubera':'kalash','ganapati':'diya',
    'rudrabhishek':'trident','navagraha':'planet','mangal-dosh':'planet','ayushya-homam':'fire',
    'sudarshana-homam':'fire','namakaran':'baby','vivah':'rings','shraddha':'lamp',
    'birth-chart':'moon','kundli-matching':'twin','career-reading':'compass','year-ahead':'calendar','numerology':'numbers',
  };
  const key = map[slug] || (type === 'CONSULTATION' ? 'moon' : 'diya');
  const icons = {
    home:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6h6v6"/></svg>`,
    lotus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 20c-3-2-5-5-5-8 2 1 4 1 5 0 1 1 3 1 5 0 0 3-2 6-5 8Z"/><path d="M12 12c0-5 2-8 4-10-1 3-1 6 0 9"/><path d="M12 12c0-5-2-8-4-10 1 3 1 6 0 9"/></svg>`,
    kalash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 13c0 4 2 7 5 7s5-3 5-7"/><path d="M6 13h12"/><path d="M12 6v7"/><path d="M9 4c1 1 2 2 3 2s2-1 3-2"/></svg>`,
    diya:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 15c0 3 3.6 5 8 5s8-2 8-5"/><path d="M12 5c-2 3-1 6 0 8 1-2 2-5 0-8Z"/><path d="M12 13v2"/></svg>`,
    trident:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 4v16"/><path d="M8 4c0 3 1 5 4 6"/><path d="M16 4c0 3-1 5-4 6"/><path d="M8 4H6M16 4h2"/></svg>`,
    planet:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-20 12 12)"/></svg>`,
    fire:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 3c-2 4-5 6-5 11a5 5 0 0 0 10 0c0-5-3-7-5-11Z"/><path d="M12 12c-1 2-2 3-2 5a2 2 0 0 0 4 0c0-2-1-3-2-5Z"/></svg>`,
    baby:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="8" r="3.5"/><path d="M6 20c1-3 3-5 6-5s5 2 6 5"/></svg>`,
    rings:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/></svg>`,
    lamp:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 17h16"/><path d="M6 17c0-4 2-7 6-7s6 3 6 7"/><path d="M12 7V4"/></svg>`,
    moon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`,
    twin:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/></svg>`,
    compass:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5 12 15l-2.5-5.5L15 12z"/></svg>`,
    calendar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    numbers:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M7 4v16M17 4v16M4 8h16M4 16h16"/></svg>`,
  };
  return `<span class="svc-icon" style="display:inline-flex">${icons[key] || icons.diya}</span>`;
}
export function icon(name, cls = '') {
  const paths = {
    arrow: 'M5 12h14M12 5l7 7-7 7',
    arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
    chevDown: 'M6 9l6 6 6-6',
    chevRight: 'M9 6l6 6-6 6',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
    check: 'M20 6 9 17l-5-5',
    plus: 'M12 5v14M5 12h14',
    close: 'M18 6 6 18M6 6l12 12',
    edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 9h18',
    clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
    mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
    map: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 10a1 1 0 1 0 0 .01',
    star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z',
    lotus: 'M12 21c-4-2-6-6-6-9 2 1 4 1 6 0 2 1 4 1 6 0 0 3-2 7-6 9ZM12 12c0-5 2-8 4-10-1 3-1 6 0 8M12 12c0-5-2-8-4-10 1 3 1 6 0 8',
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.arrow}"/></svg>`;
}
export function iconFilled(name, cls = '') {
  if (name === 'star') return `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  return icon(name, cls);
}
export function stars(rating = 0) {
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span style="color:${i <= Math.round(rating) ? 'var(--gold)' : 'var(--line)'}">${i <= Math.round(rating) ? 'â˜…' : 'â˜†'}</span>`;
  return `<span class="stars" style="display:inline-flex;gap:1px">${out}</span>`;
}

// ---------- data helpers ----------
export function setting(key, fallback = '') { return (state.settings && state.settings[key]) ?? fallback; }
export function panditName() { return setting('site.pandit_name', 'Pandit Ramesh Sharma'); }
export function panditShort() { return setting('site.pandit_short_name', 'Pandit ji'); }
export function siteName() { return setting('site.name', 'Aradhana'); }
export function ensure(v, fallback = 'â€”') { return (v === null || v === undefined || v === '') ? fallback : v; }
export function parseJson(v, fallback = null) { if (typeof v !== 'string') return v ?? fallback; try { return JSON.parse(v); } catch { return fallback; } }
export function dayKey(iso) { return new Date(iso).toISOString().slice(0, 10); }

// ---------- small UI bits ----------
export function spinner() { return `<div class="spin-center"><div class="spinner"></div></div>`; }
export function empty(title, text, action = '') {
  return `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>${action}</div>`;
}
export function skeleton(n = 3) {
  return Array.from({ length: n }).map(() => `<div class="skeleton skeleton-card" style="height:180px;margin-bottom:14px"></div>`).join('');
}
export function sectionHead(eyebrow, title, text = '', action = '') {
  return `<div class="section-head"><div class="section-copy"><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 class="display">${title}</h2>${text ? `<p>${text}</p>` : ''}</div>${action}</div>`;
}
export function breadcrumb(items) {
  return `<nav class="breadcrumb">${items.map((it, i) => i ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>${typeof it === 'string' ? it : `<a href="${it.href}">${escapeHtml(it.label)}</a>`}` : (typeof it === 'string' ? it : `<a href="${it.href}">${escapeHtml(it.label)}</a>`)).join('')}</nav>`;
}
export function pageHero(eyebrow, title, text, actions = '') {
  return `<section class="page-hero"><div class="container">
    ${breadcrumb([{ label: 'Home', href: '#/' }])}
    <span class="eyebrow" style="margin-top:14px">${escapeHtml(eyebrow)}</span>
    <h1 class="display">${title}</h1>
    ${text ? `<p class="lede">${text}</p>` : ''}
    ${actions ? `<div class="hero-actions">${actions}</div>` : ''}
  </div></section>`;
}

// ---------- boot ----------
export async function boot() {
  await Promise.all([loadMe(), loadSettings()]);
  // No local session? A visitor may still hold a Supabase session
  // (page refresh after email signup, or a recovery/confirmation link).
  // Restore it BEFORE the router starts so protected pages never flash
  // anonymous content.
  // Confirmation/recovery links land here with credentials in the URL
  // (e.g. "#access_token=…&type=signup" or "?code=…"). The official SDK
  // consumes them (detectSessionInUrl); we then bridge to the backend and
  // SCRUB THE URL - otherwise the hash router matches a nonsense path
  // like "#access_token=…" and renders the 404 page.
  try {
    const rawHash = location.hash.slice(1);
    const urlParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(rawHash);
    const params = urlParams.get('type') || urlParams.get('error') ? urlParams : hashParams;
    const type = params.get('type') || '';
    const next = urlParams.get('next') || '';
    const errCode = params.get('error_code') || params.get('error') || '';
    const isAuthUrl = rawHash.includes('access_token=') || rawHash.includes('error_code=')
      || rawHash.includes('error=') || rawHash.includes('code=')
      || urlParams.has('code') || urlParams.has('error');
    if (isAuthUrl) {
      let target = '#/login';
      if (!errCode) {
        const a = await import('./auth-supabase.js?v=13');
        const restored = await a.restoreSupabaseSession();
        if (restored) {
          await loadMe();
          // Our redirectTo carries ?next=reset-password or ?next=my; an
          // implicit recovery redirect carries type=recovery in the hash.
          target = next === 'reset-password' || type === 'recovery'
            ? '#/reset-password'
            : '#/my';
        }
      } else {
        try { sessionStorage.setItem('aradhana:authNote', 'That link is invalid or has expired. Please request a new one.'); } catch { /* storage unavailable */ }
      }
      // Scrub credentials from the URL before routing.
      history.replaceState(null, 'Aradhana', `${location.pathname}${target}`);
    }
  } catch (bootErr) { console.warn('[boot] auth-url handling failed:', bootErr?.message || bootErr); }
  if (!state.user) {
    try {
      const a = await import('./auth-supabase.js?v=13');
      const restored = await a.restoreSupabaseSession();
      if (restored) await loadMe();
    } catch { /* Supabase optional */ }
  }
  // Centralized auth-state listener: keeps every tab in sync with the
  // official Supabase session (sign-out in another tab, token refresh).
  try {
    const { onSupabaseAuthStateChange } = await import('./supabase-client.js?v=13');
    await onSupabaseAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token) {
        try {
          const a = await import('./auth-supabase.js?v=13');
          await a.syncBackend(session.access_token);
          await loadMe();
        } catch { /* bridge failed â€” next API call will retry */ }
      } else if (event === 'SIGNED_OUT') {
        state.user = null;
        state.unread = 0;
        const p = currentPath();
        if (/^\/(my|admin|provider)(\/|$)/.test(p)) navigate('#/login');
        else handleRoute();
      }
    });
  } catch { /* listener is best-effort */ }
  state.ready = true;
  startRouter();
  // PWA service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
  initEnhancements();
}

function initEnhancements() {
  // Back to top
  const btt = document.createElement('button');
  btt.id = 'backToTop';
  btt.setAttribute('aria-label', 'Back to top');
  btt.style.cssText = 'position:fixed;right:18px;bottom:90px;z-index:60;width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:var(--paper);color:var(--maroon);display:none;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);cursor:pointer;';
  btt.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  document.body.appendChild(btt);
  btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => { btt.style.display = window.scrollY > 400 ? 'flex' : 'none'; }, { passive: true });

  // Chat widget
  const chat = document.createElement('div');
  chat.id = 'chatWidget';
  chat.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:8px;';
  chat.innerHTML = `
    <div id="chatPanel" style="display:none;width:min(360px,calc(100vw-36px));background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-md);overflow:hidden;">
      <div style="background:var(--maroon-deep);color:#f7ebd8;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-family:var(--serif);font-size:1.05rem;">Aradhana assistant</strong>
        <button id="chatClose" style="background:none;border:0;color:#f7ebd8;font-size:1.2rem;cursor:pointer;">Ã—</button>
      </div>
      <div id="chatMessages" style="padding:12px;max-height:280px;overflow:auto;font-size:.82rem;display:grid;gap:8px;"></div>
      <div style="padding:10px;border-top:1px solid var(--line-soft);display:flex;gap:6px;">
        <input id="chatInput" placeholder="Ask about pujas, booking, paymentsâ€¦" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.8rem;" />
        <button id="chatSend" style="background:var(--saffron);color:#fff;border:0;border-radius:8px;padding:8px 12px;font-size:.8rem;cursor:pointer;">Send</button>
      </div>
    </div>
    <button id="chatToggle" aria-label="Open chat" style="width:52px;height:52px;border-radius:50%;border:0;background:var(--maroon);color:#fff;display:grid;place-items:center;box-shadow:var(--shadow-md);cursor:pointer;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:22px;height:22px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
  `;
  document.body.appendChild(chat);
  const panel = document.getElementById('chatPanel');
  const msgs = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const addMsg = (text, who) => {
    const div = document.createElement('div');
    div.style.cssText = who === 'user' ? 'background:var(--gold-pale);color:var(--maroon);padding:8px 10px;border-radius:8px;align-self:flex-end;max-width:90%;' : 'background:var(--cream-2);color:var(--ink);padding:8px 10px;border-radius:8px;align-self:flex-start;max-width:90%;';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  };
  addMsg('Namaste! Ask me about pujas, booking, payments or anything else.', 'bot');
  document.getElementById('chatToggle').addEventListener('click', () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; });
  document.getElementById('chatClose').addEventListener('click', () => { panel.style.display = 'none'; });
  const send = async () => {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    addMsg(q, 'user');
    try {
      const res = await API.post('/api/assistant', { message: q });
      addMsg(res.reply, 'bot');
      if (res.suggestions?.length) {
        const sug = document.createElement('div');
        sug.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
        res.suggestions.forEach((s) => {
          const a = document.createElement('a');
          a.href = `#/services/${s.slug}`;
          a.textContent = s.name;
          a.style.cssText = 'font-size:.72rem;color:var(--maroon);background:var(--gold-pale);padding:4px 8px;border-radius:99px;';
          sug.appendChild(a);
        });
        msgs.appendChild(sug);
      }
    } catch (e) { addMsg('Sorry, something went wrong.', 'bot'); }
  };
  document.getElementById('chatSend').addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}
// app.js calls boot()
window.__aradhana = { state, navigate, API, toast, modal };
