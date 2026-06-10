// GET /api/review/responses?application_id=X — get applicant responses
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'review/responses' });
  if (authErr) return authError(res, authErr);

  const { application_id } = req.query || {};
  if (!application_id) return res.status(400).json({ error: 'application_id required' });

  try {
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/applicant_responses?application_id=eq.${application_id}&order=created_at.asc`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (!dbRes.ok) throw new Error(await dbRes.text());
    const rows = await dbRes.json();
    return res.status(200).json({ responses: rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
