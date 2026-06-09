// GET  /api/review/comments?application_id=X&department=Y — get comments
// POST /api/review/comments — add a comment
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'review/comments' });
  if (authErr) return authError(res, authErr);

  // GET — fetch comments
  if (req.method === 'GET') {
    const { application_id, department } = req.query || {};
    if (!application_id) return res.status(400).json({ error: 'application_id required' });

    let url = `${SUPABASE_URL}/rest/v1/permit_review_comments?application_id=eq.${application_id}&order=created_at.asc`;
    if (department) url += `&department=eq.${department}`;

    try {
      const dbRes = await fetch(url, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA },
      });
      if (!dbRes.ok) throw new Error(await dbRes.text());
      return res.status(200).json({ comments: await dbRes.json() });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — add a comment
  if (req.method === 'POST') {
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
    }

    const { application_id, department, content, reviewer_name, is_correction = false } = body || {};
    if (!application_id || !department || !content) {
      return res.status(400).json({ error: 'application_id, department, and content are required' });
    }

    try {
      const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/permit_review_comments`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Profile': SCHEMA,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          application_id,
          department,
          reviewer_id: user.id,
          reviewer_name: reviewer_name || user.email,
          content,
          is_correction,
          is_included: true,
        }),
      });
      if (!dbRes.ok) throw new Error(await dbRes.text());
      const rows = await dbRes.json();

      // Update review status to in_review
      await fetch(
        `${SUPABASE_URL}/rest/v1/permit_reviews?application_id=eq.${application_id}&department=eq.${department}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Content-Profile': SCHEMA,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ status: 'in_review' }),
        }
      );

      return res.status(201).json({ comment: rows[0] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH — update is_included flag (overall reviewer editing)
  if (req.method === 'PATCH') {
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
    }
    const { id, is_included, content } = body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    const update = { updated_at: new Date().toISOString() };
    if (is_included !== undefined) update.is_included = is_included;
    if (content !== undefined) update.content = content;

    try {
      const dbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/permit_review_comments?id=eq.${id}`,
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
      return res.status(200).json({ comment: rows[0] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}
