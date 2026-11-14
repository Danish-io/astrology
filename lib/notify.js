'use strict';

const path = require('node:path');
const { all, get, run, insert, getSetting } = require('./db');
const { uuid, nowIso, parseJson, writeLog } = require('./util');

const LOG_PATH = path.join(__dirname, '..', 'data', 'notifications.log');

function render(template, payload = {}) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), payload);
    if (Array.isArray(value)) return value.join(', ');
    return value === undefined || value === null ? '' : String(value);
  });
}

function templateFor(code, channel, language = 'en') {
  return get(
    'SELECT * FROM notification_templates WHERE code = ? AND channel = ? AND is_active = 1 ORDER BY (language = ?) DESC, language LIMIT 1',
    [code, channel, language]
  );
}

function queueMessage({ bookingId = null, code, channel, address, userId = null, payload = {}, scheduledAt = null, dedupeKey = null }) {
  if (!address) return null;
  if (dedupeKey && get('SELECT id FROM notification_outbox WHERE dedupe_key = ?', [dedupeKey])) return null;
  const id = uuid();
  insert('notification_outbox', {
    id,
    booking_id: bookingId,
    template_code: code,
    channel,
    recipient_address: address,
    recipient_user_id: userId,
    payload: JSON.stringify(payload),
    scheduled_at: scheduledAt || nowIso(),
    status: 'PENDING',
    attempts: 0,
    max_attempts: 5,
    sent_at: null,
    dedupe_key: dedupeKey,
    created_at: nowIso(),
  });
  return id;
}

function ownerRecipients(bookingType) {
  return all('SELECT * FROM notification_recipients WHERE is_active = 1').filter((recipient) => {
    const types = parseJson(recipient.receives_booking_types, []);
    return !types.length || types.includes(bookingType);
  });
}

function queueNewBooking(booking, payload = {}) {
  const channelsForCustomer = [];
  if (booking.customer_email) channelsForCustomer.push({ channel: 'EMAIL', address: booking.customer_email });
  if (booking.customer_phone) channelsForCustomer.push({ channel: 'WHATSAPP', address: booking.customer_phone });
  for (const recipient of ownerRecipients(booking.booking_type)) {
    queueMessage({
      bookingId: booking.id,
      code: 'OWNER_NEW_BOOKING',
      channel: recipient.channel,
      address: recipient.address,
      userId: recipient.user_id,
      payload: { ...payload, admin_link: `/admin/inbox/${booking.booking_ref}` },
      dedupeKey: `owner:${booking.id}:${recipient.channel}:${recipient.address}`,
    });
  }
  for (const target of channelsForCustomer) {
    queueMessage({
      bookingId: booking.id,
      code: 'CUSTOMER_REQUEST_RECEIVED',
      channel: target.channel,
      address: target.address,
      userId: booking.customer_id,
      payload,
      dedupeKey: `customer-received:${booking.id}:${target.channel}`,
    });
  }
  queueMessage({
    bookingId: booking.id,
    code: 'CUSTOMER_REQUEST_RECEIVED',
    channel: 'PUSH',
    address: booking.customer_phone || booking.customer_email || 'in-app',
    userId: booking.customer_id,
    payload,
    dedupeKey: `customer-inapp:${booking.id}`,
  });
}

function queueStatusNotification(booking, templateCode, extra = {}) {
  const payload = {
    booking_ref: booking.booking_ref,
    customer_name: booking.customer_name,
    service_name: booking.service_name || extra.service_name || 'your service',
    preferred_datetime: booking.confirmed_start_at || booking.preferred_start_at,
    ...extra,
  };
  const targets = [];
  if (booking.customer_email) targets.push({ channel: 'EMAIL', address: booking.customer_email });
  if (booking.customer_phone) targets.push({ channel: 'WHATSAPP', address: booking.customer_phone });
  for (const target of targets) {
    queueMessage({
      bookingId: booking.id,
      code: templateCode,
      channel: target.channel,
      address: target.address,
      userId: booking.customer_id,
      payload,
      dedupeKey: `${templateCode}:${booking.id}:${target.channel}:${Date.now()}`,
    });
  }
  queueMessage({
    bookingId: booking.id,
    code: templateCode,
    channel: 'PUSH',
    address: booking.customer_phone || booking.customer_email || 'in-app',
    userId: booking.customer_id,
    payload,
    dedupeKey: `${templateCode}:${booking.id}:PUSH:${Date.now()}`,
  });
}

function notifyInApp(userId, title, body = '', link = '') {
  if (!userId) return;
  insert('inapp_notifications', {
    id: uuid(), user_id: userId, title, body, link, read_at: null, created_at: nowIso(),
  });
}

function processOutbox(limit = 40) {
  const due = all(
    `SELECT * FROM notification_outbox
      WHERE status = 'PENDING' AND scheduled_at <= ?
      ORDER BY scheduled_at LIMIT ?`,
    [nowIso(), limit]
  );
  let delivered = 0;
  for (const message of due) {
    const template = templateFor(message.template_code, message.channel);
    const payload = parseJson(message.payload, {});
    const body = render(template?.body || `Update on your booking ${message.payload?.booking_ref || ''}`, payload);
    const provider = message.channel === 'EMAIL' ? 'SMTP' : message.channel === 'WHATSAPP' ? 'WhatsApp Cloud API' : message.channel === 'SMS' ? 'SMS Gateway' : 'In-app';
    const status = 'DELIVERED';
    run('UPDATE notification_outbox SET status = ?, attempts = attempts + 1, sent_at = ? WHERE id = ?', [status, nowIso(), message.id]);
    insert('notification_delivery_logs', {
      outbox_id: message.id,
      provider,
      provider_message_id: `demo_${uuid().slice(0, 8)}`,
      status,
      response_payload: JSON.stringify({ ok: true, channel: message.channel }),
      created_at: nowIso(),
    });
    writeLog(LOG_PATH, `[${provider}] ${message.channel} -> ${message.recipient_address} | ${message.template_code} | ${body.slice(0, 300)}`);
    if (message.template_code === 'OWNER_NEW_BOOKING' && message.booking_id) {
      run('UPDATE bookings SET owner_notified_at = ? WHERE id = ? AND owner_notified_at IS NULL', [nowIso(), message.booking_id]);
    }
    delivered++;
  }
  return delivered;
}

function outboxForBooking(bookingId) {
  return all(
    `SELECT o.*, COALESCE(l.status, o.status) AS delivery_status
       FROM notification_outbox o
       LEFT JOIN notification_delivery_logs l ON l.outbox_id = o.id
      WHERE o.booking_id = ? ORDER BY o.created_at DESC`,
    [bookingId]
  );
}

function scheduleReminders() {
  const now = Date.now();
  const rows = all(
    `SELECT b.*, s.name AS service_name FROM bookings b
       LEFT JOIN services s ON s.id = b.service_id
     WHERE b.status = 'CONFIRMED' AND b.confirmed_start_at IS NOT NULL`
  );
  let queued = 0;
  for (const booking of rows) {
    const start = new Date(booking.confirmed_start_at).getTime();
    const diffH = (start - now) / 3600000;
    if (diffH < 23 || diffH > 25) continue;
    const dedupe = `reminder24:${booking.id}`;
    if (get('SELECT id FROM notification_outbox WHERE dedupe_key = ?', [dedupe])) continue;
    const payload = {
      booking_ref: booking.booking_ref,
      customer_name: booking.customer_name,
      service_name: booking.service_name || 'your service',
      preferred_datetime: booking.confirmed_start_at,
    };
    if (booking.customer_email) {
      queueMessage({ bookingId: booking.id, code: 'REMINDER_24H', channel: 'EMAIL', address: booking.customer_email, userId: booking.customer_id, payload, dedupeKey: dedupe });
      queued++;
    }
    if (booking.customer_phone) {
      queueMessage({ bookingId: booking.id, code: 'REMINDER_24H', channel: 'WHATSAPP', address: booking.customer_phone, userId: booking.customer_id, payload, dedupeKey: `${dedupe}:wa` });
      queued++;
    }
    queueMessage({ bookingId: booking.id, code: 'REMINDER_24H', channel: 'PUSH', address: booking.customer_phone || booking.customer_email || 'in-app', userId: booking.customer_id, payload, dedupeKey: `${dedupe}:push` });
    queued++;
  }
  return queued;
}

function settingsContact() {
  return {
    phone: getSetting('site.contact_phone', '+91 90000 12345'),
    whatsapp: getSetting('site.contact_whatsapp', '+919000012345'),
  };
}

module.exports = {
  render, queueMessage, queueNewBooking, queueStatusNotification, notifyInApp,
  processOutbox, outboxForBooking, ownerRecipients, settingsContact, scheduleReminders, LOG_PATH,
};
