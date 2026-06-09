// GET /api/inspection/list — returns inspector's queue sorted by scheduled_at
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'inspection/list' });
  if (authErr) return authError(res, authErr);

  try {
    const url = `${SUPABASE_URL}/rest/v1/inspections?inspector_id=eq.${user.id}&status=neq.cancelled&order=scheduled_at.asc`;
    const dbRes = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept-Profile': SCHEMA,
      },
    });
    if (!dbRes.ok) throw new Error(await dbRes.text());
    const inspections = await dbRes.json();
    return res.status(200).json({ inspections });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
