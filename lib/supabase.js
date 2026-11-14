'use strict';

/**
 * Supabase client for Aradhana backend.
 * Uses the SECRET key (server-side only!) — bypasses RLS.
 * The secret key must never be sent to the browser or committed to git.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

let supabase = null;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error(
      'Supabase not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to your .env file.'
    );
  }
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

function isSupabaseEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

module.exports = { getSupabase, isSupabaseEnabled };
