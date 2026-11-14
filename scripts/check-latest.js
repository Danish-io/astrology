'use strict';

/** Check the latest booking in Supabase. Run: node scripts/check-latest.js */

try { require('dotenv').config(); } catch {}
const { getSupabase } = require('../lib/supabase');

(async () => {
  const supabase = getSupabase();

  const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true });
  console.log(`📊 Total bookings in Supabase: ${count}`);

  const { data, error } = await supabase
    .from('bookings')
    .select('booking_ref, customer_name, customer_phone, booking_type, status, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) { console.error('❌', error.message); process.exit(1); }

  console.log('\n🆕 Latest 3 bookings in Supabase:');
  data.forEach((b, i) => {
    console.log(`\n#${i + 1} ${b.booking_ref}`);
    console.log(`   Name: ${b.customer_name} | Phone: ${b.customer_phone}`);
    console.log(`   Type: ${b.booking_type} | Status: ${b.status}`);
    console.log(`   Created: ${b.created_at}`);
  });
})();
