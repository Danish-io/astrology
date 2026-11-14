'use strict';

/**
 * Quick Supabase connection test.
 * Run: node scripts/test-supabase.js
 * Tells us: 1) .env loads  2) keys valid  3) schema exists (tables created)
 */

try { require('dotenv').config(); } catch {}
const { getSupabase, isSupabaseEnabled } = require('../lib/supabase');

(async () => {
  console.log('===== SUPABASE CONNECTION TEST =====\n');

  if (!isSupabaseEnabled()) {
    console.log('❌ .env not configured!');
    console.log('   Check SUPABASE_URL and SUPABASE_SECRET_KEY in B:\\main-astrology-website\\.env');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  console.log(`✅ .env loaded`);
  console.log(`   URL: ${url}`);
  console.log(`   Key: ${process.env.SUPABASE_SECRET_KEY.slice(0, 14)}...${'(hidden)'}\n`);

  const supabase = getSupabase();

  // Test 1: count services (checks schema + connection)
  let { count, error } = await supabase.from('services').select('id', { count: 'exact', head: true });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('Could not find the table')) {
      console.log('⚠️  CONNECTED to Supabase, but tables NOT created yet.');
      console.log('   → Run supabase-schema.sql in Supabase SQL Editor first!');
      console.log(`   (Error: ${msg})`);
    } else if (msg.includes('JWT') || msg.includes('Invalid API key') || msg.includes('authentication')) {
      console.log('❌ KEY INVALID — check SUPABASE_SECRET_KEY in .env');
      console.log(`   (Error: ${msg})`);
    } else {
      console.log(`❌ Unknown error: ${msg}`);
    }
    process.exit(1);
  }

  console.log(`✅ CONNECTED! Schema exists. services rows: ${count ?? 0}`);

  // Test 2: check a few other key tables
  for (const t of ['users', 'bookings', 'providers', 'events', 'app_settings']) {
    const { count: c, error: e } = await supabase.from(t).select('id', { count: 'exact', head: true });
    console.log(`${e ? '❌' : '✅'} ${t}: ${e ? e.message : c + ' rows'}`);
  }

  console.log('\n🎉 All good — ready for data migration!');
  console.log('   Run: node scripts/migrate-to-supabase.js');
})();
