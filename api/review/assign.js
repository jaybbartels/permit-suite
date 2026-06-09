// POST /api/review/assign — Overall reviewer assigns departments to a permit
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const VALID_DEPTS = ['planning','building','engineering','fire','geologist','environmental_health','asrb'];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'review/assign' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const { application_id, departments } = body || {};
  if (!application_id || !departments?.length) {
    return res.status(400).json({ error: 'application_id and departments are required' });
  }

  const invalid = departments.filter(d => !VALID_DEPTS.includes(d));
  if (invalid.length) return res.status(400).json({ error: `Invalid departments: ${invalid.join(', ')}` });

  try {
    // Upsert a review record for each department
    const rows = departments.map(dept => ({
      application_id,
      department: dept,
      status: 'pending',
      assigned_at: new Date().toISOString(),
      assigned_by: user.id,
    }));

    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/permit_reviews`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': SCHEMA,
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(rows),
    });

    if (!dbRes.ok) throw new Error(await dbRes.text());
    const saved = await dbRes.json();

    // Update application status to 'under_review'
    await fetch(`${SUPABASE_URL}/rest/v1/permit_applications?id=eq.${application_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': SCHEMA,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ status: 'under_review', updated_at: new Date().toISOString() }),
    });

    return res.status(200).json({ reviews: saved, assigned: departments.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
