'use strict';

/**
 * Centralized Supabase client (browser side).
 *
 * SECURITY:
 *  - Uses ONLY the publishable key, injected by our own server via
 *    /api/config. The service_role key NEVER reaches the browser.
 *  - Credentials are read from server-injected config, never hardcoded.
 *  - The official SDK is loaded as an ES module (no bundler in this
 *    project — the site already loads fonts from a CDN the same way).
 */

let _client = null;
let _configPromise = null;

function loadConfig() {
  if (!_configPromise) {
    _configPromise = fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('Config unavailable');
        return r.json();
      })
      .then((cfg) => {
        if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
          throw new Error('Supabase not configured on the server');
        }
        return cfg;
      });
  }
  return _configPromise;
}

export async function getSupabase() {
  if (_client) return _client;
  const cfg = await loadConfig();
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  _client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: {
      persistSession: true,      // official session persistence (localStorage under the hood)
      autoRefreshToken: true,
      detectSessionInUrl: true,  // handles recovery/magic links on page load
    },
  });
  return _client;
}

export function onSupabaseAuthStateChange(cb) {
  return getSupabase().then((c) => c.auth.onAuthStateChange(cb));
}

export async function currentSession() {
  try {
    const c = await getSupabase();
    const { data } = await c.auth.getSession();
    return data?.session || null;
  } catch {
    return null;
  }
}

export async function currentProfile() {
  try {
    const c = await getSupabase();
    const { data: session } = await c.auth.getSession();
    if (!session?.session) return null;
    const { data, error } = await c.from('profiles').select('*').eq('id', session.session.user.id).single();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
