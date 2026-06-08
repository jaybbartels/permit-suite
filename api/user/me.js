import { requireAuth, authError } from '../middleware/auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { user, role, error } = await requireAuth(req, { minRole: 'free' });
  if (error) return authError(res, error);

  const meta       = user.user_metadata || {};
  const trialEnds  = meta.trial_ends_at ? new Date(meta.trial_ends_at) : null;
  const trialDays  = trialEnds ? Math.max(0, Math.ceil((trialEnds - new Date()) / 86400000)) : null;
  const inTrial    = trialEnds && new Date() < trialEnds;

  return res.status(200).json({
    id:       user.id,
    email:    user.email,
    role,
    inTrial,
    trialEndsAt:  trialEnds?.toISOString() || null,
    trialDaysLeft: inTrial ? trialDays : null,
  });
}
