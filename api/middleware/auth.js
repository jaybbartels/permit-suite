// ── Auth middleware ───────────────────────────────────────────────────────────
// Verifies Supabase JWT, checks role + trial, enforces rate limits for free tier
// Usage: const { user, role, error } = await requireAuth(req, { minRole: 'free' })

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Rate limits for free tier (per day) ──────────────────────────────────────
const FREE_LIMITS = {
  'price/lookup':        3,
  'permit/opportunities': 2,
  'lot/eligibility':     2,
  'price/projection':    10,
};

// ── Rate limits for anonymous (no login) per day per IP ───────────────────────
const ANON_LIMITS = {
  'price/lookup':         3,
  'price/projection':     5,
  'permit/opportunities': 2,
  'lot/eligibility':      2,
  'lot/options':          2,
};

// ── Endpoints that always require login ───────────────────────────────────────
const LOGIN_REQUIRED = new Set([
  'permit/submit',
  'user/me',
  'jurisdiction/crawl-state',
  'jurisdiction/crawl-county',
  'jurisdiction/crawl-city',
  'stripe/webhook',
]);

// ── Verify JWT with Supabase ─────────────────────────────────────────────────
async function verifyJWT(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY || SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Hash IP for anonymous tracking ──────────────────────────────────────────
async function hashIP(ip) {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(ip + 'permit-suite-salt').digest('hex').slice(0, 16);
}

// ── Anonymous rate limit check ────────────────────────────────────────────────
async function checkAnonLimit(ipHash, endpoint) {
  const limit = ANON_LIMITS[endpoint];
  if (!limit) return { allowed: false, reason: 'login_required' };

  const today = new Date().toISOString().slice(0, 10);
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/anonymous_usage?ip_hash=eq.${ipHash}&endpoint=eq.${encodeURIComponent(endpoint)}&date=eq.${today}&select=count`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept-Profile': 'app_data',
        },
      }
    );
    const rows  = getRes.ok ? await getRes.json() : [];
    const count = rows[0]?.count || 0;

    if (count >= limit) {
      return { allowed: false, reason: 'rate_limited', limit, count };
    }

    await fetch(`${SUPABASE_URL}/rest/v1/anonymous_usage`, {
      method: 'POST',
      headers: {
        'apikey':          SUPABASE_KEY,
        'Authorization':   `Bearer ${SUPABASE_KEY}`,
        'Content-Type':    'application/json',
        'Content-Profile': 'app_data',
        'Prefer':          'resolution=merge-duplicates',
      },
      body: JSON.stringify({ ip_hash: ipHash, endpoint, date: today, count: count + 1 }),
    });

    return { allowed: true, remaining: limit - count - 1, limit };
  } catch {
    return { allowed: true, remaining: null };
  }
}

// ── Determine effective role ──────────────────────────────────────────────────
// Returns 'pro', 'free', or 'expired'
function effectiveRole(user) {
  const meta  = user?.user_metadata || {};
  const role  = meta.role || 'free';
  const trial = meta.trial_ends_at ? new Date(meta.trial_ends_at) : null;

  // Still in trial — full pro access regardless of role field
  if (trial && new Date() < trial) return 'pro';

  // Trial expired or never set
  return role === 'pro' ? 'pro' : 'free';
}

// ── Check + increment rate limit ──────────────────────────────────────────────
// Uses Supabase to track daily usage per user per endpoint
async function checkRateLimit(userId, endpoint) {
  const limit = FREE_LIMITS[endpoint];
  if (!limit) return { allowed: true, remaining: 999 };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key   = `${userId}:${endpoint}:${today}`;

  try {
    // Get current count
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/api_usage?user_id=eq.${userId}&endpoint=eq.${encodeURIComponent(endpoint)}&date=eq.${today}&select=count`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept-Profile': 'app_data',
        },
      }
    );
    const rows  = getRes.ok ? await getRes.json() : [];
    const count = rows[0]?.count || 0;

    if (count >= limit) return { allowed: false, remaining: 0, limit };

    // Increment count (upsert)
    await fetch(`${SUPABASE_URL}/rest/v1/api_usage`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'app_data',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id:  userId,
        endpoint,
        date:     today,
        count:    count + 1,
      }),
    });

    return { allowed: true, remaining: limit - count - 1, limit };
  } catch {
    // If rate limit check fails, allow through (don't punish user for DB error)
    return { allowed: true, remaining: null };
  }
}

// ── Main middleware function ───────────────────────────────────────────────────
// options.minRole: 'free' (any logged-in user) | 'pro' (pro only)
// options.endpoint: key for rate limiting e.g. 'price/lookup'
export async function requireAuth(req, options = {}) {
  const { minRole = 'free', endpoint = null } = options;

  // Extract token
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // ── Anonymous request (no token) ─────────────────────────────────────────
  if (!token) {
    // Some endpoints always require login
    if (LOGIN_REQUIRED.has(endpoint)) {
      return { user: null, role: null, error: { status: 401, message: 'Authentication required. Please sign in.' } };
    }

    // Get IP address
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
             || req.headers['x-real-ip']
             || req.socket?.remoteAddress
             || 'unknown';
    const ipHash = await hashIP(ip);

    // Check anonymous rate limit
    const anonCheck = await checkAnonLimit(ipHash, endpoint);
    if (!anonCheck.allowed) {
      if (anonCheck.reason === 'login_required') {
        return { user: null, role: 'anon', error: { status: 401, message: 'Please sign in to use this feature.', code: 'LOGIN_REQUIRED' } };
      }
      return { user: null, role: 'anon', error: {
        status: 429,
        message: `You've used your ${anonCheck.limit} free daily lookups. Sign up free for unlimited access during your 30-day trial.`,
        code: 'SIGNUP_REQUIRED',
        limit: anonCheck.limit,
      }};
    }

    // Allow anonymous request through
    return { user: null, role: 'anon', error: null, remaining: anonCheck.remaining };
  }

  // Verify with Supabase
  const user = await verifyJWT(token);
  if (!user || !user.id) {
    return { user: null, role: null, error: { status: 401, message: 'Invalid or expired session. Please sign in again.' } };
  }

  // Determine role
  const role = effectiveRole(user);

  // Check role requirement
  if (minRole === 'pro' && role !== 'pro') {
    const trial = user.user_metadata?.trial_ends_at;
    const msg   = trial && new Date(trial) < new Date()
      ? 'Your free trial has ended. Upgrade to Pro to continue.'
      : 'This feature requires a Pro subscription.';
    return { user, role, error: { status: 403, message: msg } };
  }

  // Rate limit check for free tier
  if (role === 'free' && endpoint) {
    const { allowed, remaining, limit } = await checkRateLimit(user.id, endpoint);
    if (!allowed) {
      return {
        user, role,
        error: {
          status: 429,
          message: `Daily limit of ${limit} reached for this feature. Upgrade to Pro for unlimited access.`,
        },
      };
    }
  }

  return { user, role, error: null };
}

// ── Helper: send auth error response ─────────────────────────────────────────
export function authError(res, error) {
  return res.status(error.status).json({
    error: error.message,
    code:  error.status === 401 ? 'UNAUTHENTICATED'
         : error.status === 403 ? 'FORBIDDEN'
         : error.status === 429 ? 'RATE_LIMITED'
         : 'AUTH_ERROR',
  });
}
