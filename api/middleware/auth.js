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
  'price/projection':    10, // cheap — just math
};

// ── Verify JWT with Supabase ─────────────────────────────────────────────────
async function verifyJWT(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
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

  if (!token) {
    return { user: null, role: null, error: { status: 401, message: 'Authentication required. Please sign in.' } };
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
