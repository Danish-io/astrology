'use strict';

const fs = require('node:fs');
const path = require('node:path');

const reset = process.argv.includes('--reset');
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = process.env.DB_PATH || path.join(dataDir, 'aradhana.db');

if (reset) {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  console.log('Existing database removed.');
}

const { seed } = require('../lib/seed');
const start = Date.now();
const result = seed({ force: false });
if (result.seeded) {
  const { get } = require('../lib/db');
  const counts = {
    users: get('SELECT COUNT(*) AS n FROM users').n,
    services: get('SELECT COUNT(*) AS n FROM services').n,
    bookings: get('SELECT COUNT(*) AS n FROM bookings').n,
    slots: get('SELECT COUNT(*) AS n FROM time_slots').n,
    events: get('SELECT COUNT(*) AS n FROM events').n,
    reviews: get('SELECT COUNT(*) AS n FROM reviews').n,
  };
  console.log('Database seeded in', ((Date.now() - start) / 1000).toFixed(1) + 's');
  console.log(counts);
} else {
  console.log('Database already contains data. Use "npm run seed:reset" to rebuild it.');
}
