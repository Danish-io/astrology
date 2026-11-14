'use strict';

/** Check the latest booking in LOCAL SQLite. Run: node scripts/check-local.js */

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const DB_PATH = path.join(__dirname, '..', 'data', 'aradhana.db');
const sqlite = new DatabaseSync(DB_PATH);

const rows = sqlite.prepare(
  'SELECT booking_ref, customer_name, customer_phone, booking_type, status, created_at FROM bookings ORDER BY requested_at DESC LIMIT 3'
).all();

console.log('📊 Latest 3 bookings in LOCAL SQLite:');
rows.forEach((b, i) => {
  console.log(`#${i + 1} ${b.booking_ref} | ${b.customer_name} | ${b.booking_type} | ${b.status} | ${b.created_at}`);
});

const count = sqlite.prepare('SELECT COUNT(*) as c FROM bookings').get();
console.log(`\nTotal bookings locally: ${count.c}`);
