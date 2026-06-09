// GET /api/review/status?application_id=X — get review status for all departments
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'review/status' });
  if (authErr) return authError(res, authErr);

  const { application_id } = req.query || {};
  if (!application_id) return res.status(400).json({ error: 'application_id required' });

  try {
    const [reviewsRes, commentsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/permit_reviews?application_id=eq.${application_id}&order=department.asc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/permit_review_comments?application_id=eq.${application_id}&order=department.asc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
      ),
    ]);

    const reviews  = reviewsRes.ok  ? await reviewsRes.json()  : [];
    const comments = commentsRes.ok ? await commentsRes.json() : [];

    const commentsByDept = {};
    comments.forEach(c => {
      if (!commentsByDept[c.department]) commentsByDept[c.department] = [];
      commentsByDept[c.department].push(c);
    });

    const status = reviews.map(r => ({
      ...r,
      commentCount: commentsByDept[r.department]?.length || 0,
    }));

    return res.status(200).json({ reviews: status, comments });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
