'use strict';

const { all, get, run, insert, update, getSetting } = require('./db');
const {
  uuid, nowIso, sha256, randomToken, verifyPassword, normalizePhone, scryptHash,
} = require('./util');
const { HttpError, str, assert, bool } = require('./http');

const COOKIE_NAME = 'aradhana_session';
const SESSION_DAYS = 30;

function createSession(userId) {
  const raw = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  insert('sessions', {
    token_hash: sha256(raw), user_id: userId, expires_at: expiresAt, created_at: nowIso(),
  });
  return { token: raw, expiresAt };
}

function cookieFor(token, expiresAt) {
  const maxAge = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function expiredCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function claimGuestBookings(user) {
  // When someone books as a guest and later signs in with the same phone
  // or email, link those unclaimed bookings to their account so they show
  // up under Account → My bookings. (update() also mirrors each change.)
  try {
    if (user?.phone) {
      for (const b of all('SELECT id FROM bookings WHERE customer_id IS NULL AND customer_phone = ?', [user.phone])) {
        update('bookings', b.id, { customer_id: user.id, updated_at: nowIso() });
      }
    }
    if (user?.email) {
      for (const b of all('SELECT id FROM bookings WHERE customer_id IS NULL AND customer_email = ? COLLATE NOCASE', [user.email])) {
        update('bookings', b.id, { customer_id: user.id, updated_at: nowIso() });
      }
    }
  } catch (e) { console.warn('claimGuestBookings failed', e.message); }
}

function sessionUser(token) {
  if (!token) return null;
  const session = get('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', [sha256(token), nowIso()]);
  if (!session) return null;
  const user = get('SELECT * FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [session.user_id]);
  if (!user) return null;
  const provider = get('SELECT * FROM providers WHERE user_id = ?', [user.id]);
  return { ...user, provider: provider || null };
}

function destroySession(token) {
  if (!token) return;
  run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
}

function requireUser(ctx) {
  assert(ctx.user, 401, 'Please sign in to continue', { code: 'AUTH_REQUIRED' });
  return ctx.user;
}

function isStaff(user) {
  return Boolean(user && ['OWNER', 'ADMIN', 'SUPPORT'].includes(user.role));
}

function requireStaff(ctx) {
  const user = requireUser(ctx);
  assert(isStaff(user), 403, 'This area is for the Aradhana team', { code: 'FORBIDDEN' });
  return user;
}

function requireOwner(ctx) {
  const user = requireUser(ctx);
  assert(['OWNER', 'ADMIN'].includes(user.role), 403, 'Owner access required', { code: 'FORBIDDEN' });
  return user;
}

function requireProvider(ctx) {
  const user = requireUser(ctx);
  assert(user.provider || isStaff(user), 403, 'Provider access required', { code: 'FORBIDDEN' });
  return user;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.full_name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    preferredLanguage: user.preferred_language,
    contactChannel: user.contact_channel,
    callWindow: user.call_window,
    marketingOptIn: Boolean(user.marketing_opt_in),
    city: user.city,
    createdAt: user.created_at || null,
    isStaff: isStaff(user),
    isOwner: ['OWNER', 'ADMIN'].includes(user.role),
    provider: user.provider ? {
      id: user.provider.id, slug: user.provider.slug, displayName: user.provider.display_name,
      type: user.provider.provider_type, isActive: Boolean(user.provider.is_active),
    } : null,
  };
}

function authRoutes() {
  return [
    /* Phone OTP moved to Supabase Auth (signInWithOtp + verifyOtp, real SMS).
       The former local OTP routes were removed: they stored a fixed code,
       never delivered anything, and leaked the code in the API response.
       See ui/assets/js/auth-supabase.js for the real flow. */
    {
      // Legacy local credential check — DEV/TEST ONLY.
      // In production every sign-in goes through Supabase Auth (email +
      // password, or phone OTP); this route answers 404 so no parallel
      // credential system exists outside Supabase.
      method: 'POST', path: '/api/auth/login', handler: async (ctx) => {
        if (process.env.NODE_ENV === 'production') throw new HttpError(404, 'Not found');
        const email = str(ctx.body.email, { max: 150, field: 'Email', required: true }).toLowerCase();
        const password = str(ctx.body.password, { max: 200, field: 'Password', required: true });
        const user = get('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
        assert(user && verifyPassword(password, user.password_hash), 401, 'Email or password is incorrect');
        assert(user.is_active, 403, 'This account is inactive. Please contact the owner.');
        run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), user.id]);
        claimGuestBookings(user);
        const session = createSession(user.id);
        ctx.res.setHeader('Set-Cookie', cookieFor(session.token, session.expiresAt));
        const fullUser = sessionUser(session.token);
        return { user: publicUser(fullUser), token: process.env.NODE_ENV === 'test' ? session.token : undefined };
      },
    },
    {
      method: 'POST', path: '/api/auth/logout', handler: async (ctx) => {
        destroySession(ctx.token);
        ctx.res.setHeader('Set-Cookie', expiredCookie());
        return { ok: true };
      },
    },
    {
      // Bridges Supabase Auth → this app's session system.
      // The browser sends the Supabase access token right after a REAL
      // Supabase signup/login (email+password or phone OTP). We verify it
      // SERVER-SIDE against Supabase, then create our own HttpOnly session
      // cookie. Frontend input is never trusted to declare identity.
      method: 'POST', path: '/api/auth/supabase-sync', handler: async (ctx) => {
        const accessToken = str(ctx.body.accessToken, { min: 20, max: 4096, field: 'Access token', required: true });
        const { getSupabase, isSupabaseEnabled } = require('./supabase');
        assert(isSupabaseEnabled(), 500, 'Supabase is not configured on the server');
        const { data, error } = await getSupabase().auth.getUser(accessToken);
        assert(!error && data?.user, 401, 'Could not verify your sign-in. Please try again.');
        const su = data.user;
        assert(
          su.email_confirmed_at || su.phone_confirmed_at || su.confirmed_at || !su.confirmation_sent_at,
          403, 'Please verify your account first (email link or SMS code).'
        );

        // Identity: prefer email, fall back to the verified phone number.
        const email = su.email ? su.email.toLowerCase() : null;
        const phone = su.phone ? (normalizePhone(su.phone) || su.phone) : null;
        let user = email
          ? get('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email])
          : null;
        if (!user && phone) {
          user = get('SELECT * FROM users WHERE phone = ? AND deleted_at IS NULL', [phone]);
        }
        if (!user) {
          let fullName = str(su.user_metadata?.full_name, { max: 150 }) || '';
          if (!fullName) {
            // Phone sign-ups have no name in metadata — take it from the
            // RLS-protected profiles row the DB trigger created.
            try {
              const { data: prof } = await getSupabase().from('profiles').select('full_name').eq('id', su.id).maybeSingle();
              fullName = str(prof?.full_name, { max: 150 }) || '';
            } catch { /* profiles lookup is best-effort */ }
          }
          if (!fullName) fullName = email ? email.split('@')[0] : `Guest ${String(phone || '').slice(-4)}`;
          const id = uuid();
          user = {
            id, full_name: fullName, phone, email,
            password_hash: null, role: 'CUSTOMER',
            preferred_language: 'en', contact_channel: 'CALL', call_window: null,
            marketing_opt_in: 0, city: null, is_active: 1, last_login_at: null,
            created_at: nowIso(), updated_at: nowIso(), deleted_at: null,
          };
          insert('users', user);
          insert('customer_profiles', {
            id: uuid(), user_id: id, preferred_contact_channel: 'CALL',
            preferred_call_window: null, marketing_opt_in: 0, notes: null,
          });
        } else {
          assert(user.is_active, 403, 'This account is inactive. Please contact the owner.');
          run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), user.id]);
        }
        claimGuestBookings(user);
        const session = createSession(user.id);
        ctx.res.setHeader('Set-Cookie', cookieFor(session.token, session.expiresAt));
        const fullUser = sessionUser(session.token);
        return { ok: true, user: publicUser(fullUser) };
      },
    },
    {
      method: 'GET', path: '/api/me', handler: async (ctx) => {
        if (!ctx.user) return { user: null };
        const unread = get(
          'SELECT COUNT(*) AS n FROM inapp_notifications WHERE user_id = ? AND read_at IS NULL',
          [ctx.user.id]
        );
        return { user: publicUser(ctx.user), unreadNotifications: unread?.n || 0 };
      },
    },
    {
      method: 'PUT', path: '/api/me', handler: async (ctx) => {
        const user = requireUser(ctx);
        const fullName = str(ctx.body.fullName, { min: 2, max: 150, field: 'Name', required: true });
        const email = str(ctx.body.email, { max: 150, field: 'Email' });
        if (email) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 422, 'Enter a valid email');
        const city = str(ctx.body.city, { max: 80, field: 'City' });
        const language = str(ctx.body.preferredLanguage || 'en', { max: 5, field: 'Language' });
        run(
          'UPDATE users SET full_name = ?, email = ?, city = ?, preferred_language = ?, contact_channel = ?, call_window = ?, marketing_opt_in = ?, updated_at = ? WHERE id = ?',
          [fullName, email || null, city || null, language, ctx.body.contactChannel === 'WHATSAPP' ? 'WHATSAPP' : 'CALL',
            str(ctx.body.callWindow, { max: 40 }), bool(ctx.body.marketingOptIn) ? 1 : 0, nowIso(), user.id]
        );
        return { user: publicUser(sessionUser(ctx.token)), message: 'Your details have been saved.' };
      },
    },
  ];
}

module.exports = {
  COOKIE_NAME, authRoutes, createSession, cookieFor, expiredCookie, sessionUser,
  requireUser, requireStaff, requireOwner, requireProvider, isStaff, publicUser,
};
