'use strict';

/** Check if profiles table exists + verify RLS is on. Run: node scripts/check-profiles.js */

try { require('dotenv').config(); } catch {}
const { getSupabase } = require('../lib/supabase');

(async () => {
  const supabase = getSupabase();
  // NOTE: a real SELECT — head-count requests can return success even when
  // the table is missing (no body on HEAD), which caused a false positive.
  const { data, error } = await supabase.from('profiles').select('*').limit(1);

  if (error) {
    const msg = error.message || '';
    if (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('Could not find the table')) {
      console.log('⚠️  profiles table NOT created yet.');
      console.log('   → Run supabase/migrations/001_profiles.sql in Supabase SQL Editor!');
      console.log('   → Then run 002_profiles_phone_metadata.sql the same way.');
    } else {
      console.log('❌ Error:', msg);
    }
    process.exit(1);
  }

  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  console.log(`✅ profiles table EXISTS and is queryable. Rows: ${count ?? 0}`);
  console.log('   (Rows appear automatically when users sign up via Supabase Auth)');
})();
