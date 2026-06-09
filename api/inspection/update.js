// PATCH /api/inspection/update — update status, notes, started_at, completed_at
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'PATCH' && req.method !== 'POST') return res.status(405).end();

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'inspection/update' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const { id, status, notes, started_at, completed_at } = body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });

  const update = { updated_at: new Date().toISOString() };
  if (status)       update.status       = status;
  if (notes !== undefined) update.notes = notes;
  if (started_at)   update.started_at   = started_at;
  if (completed_at) update.completed_at = completed_at;

  try {
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inspections?id=eq.${id}&inspector_id=eq.${user.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Profile': SCHEMA,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(update),
      }
    );
    if (!dbRes.ok) throw new Error(await dbRes.text());
    const rows = await dbRes.json();
    return res.status(200).json({ inspection: rows[0] ?? null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
