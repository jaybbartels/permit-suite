// POST /api/inspection/notes — add a note (voice or text) to an inspection
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'inspection/notes' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const { inspection_id, content, source = 'text' } = body || {};
  if (!inspection_id || !content) {
    return res.status(400).json({ error: 'inspection_id and content are required' });
  }

  try {
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/inspection_notes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': SCHEMA,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        inspection_id,
        inspector_id: user.id,
        content,
        source,
        created_at: new Date().toISOString(),
      }),
    });
    if (!dbRes.ok) throw new Error(await dbRes.text());
    const rows = await dbRes.json();
    return res.status(201).json({ note: rows[0] ?? null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
