// GET /api/review/queue?department=planning — get application IDs assigned to a dept
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'review/queue' });
  if (authErr) return authError(res, authErr);

  const { department } = req.query || {};
  if (!department) return res.status(400).json({ error: 'department required' });

  try {
    const res2 = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_reviews?department=eq.${department}&status=neq.not_required&select=application_id`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (!res2.ok) throw new Error(await res2.text());
    const rows = await res2.json();
    return res.status(200).json({ applicationIds: rows.map(r => r.application_id) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
