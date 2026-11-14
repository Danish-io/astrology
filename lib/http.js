'use strict';

class HttpError extends Error {
  constructor(status, message, { code = null, details = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': contentType, ...extraHeaders });
  res.end(text);
}

function sendFile(res, status, buffer, contentType, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': contentType, ...extraHeaders });
  res.end(buffer);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = String(req.headers['content-type'] || '');
      if (type.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(raw);
        resolve(Object.fromEntries(params.entries()));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function str(value, { max = 1000, min = 0, field = 'value', required = false } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (required && s.length < Math.max(1, min)) throw new HttpError(422, `${field} is required`);
  if (s.length < min) throw new HttpError(422, `${field} must be at least ${min} characters`);
  if (s.length > max) throw new HttpError(422, `${field} is too long`);
  return s;
}

function oneOf(value, allowed, field = 'value') {
  if (!allowed.includes(value)) throw new HttpError(422, `${field} is invalid`);
  return value;
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function int(value, fallback = null, { min = -Infinity, max = Infinity, field = 'value' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(422, `${field} is invalid`);
  return Math.round(n);
}

function dateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new HttpError(422, 'Date is invalid');
  return value;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function assert(condition, status, message, options) {
  if (!condition) throw new HttpError(status, message, options);
}

module.exports = {
  HttpError, sendJson, sendText, sendFile, parseCookies, readBody,
  str, oneOf, bool, int, dateKey, isEmail, assert,
};
