// POST /api/review/report — issue final report
// GET  /api/review/report?application_id=X — get report
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const DEPT_LABELS = {
  planning:             'Planning Department',
  building:             'Building Department',
  engineering:          'Engineering Department',
  fire:                 'Woodside Fire Department',
  geologist:            'Town Geologist',
  environmental_health: 'San Mateo County Environmental Health',
  asrb:                 'Architecture and Site Review Board (ASRB)',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'review/report' });
  if (authErr) return authError(res, authErr);

  // GET — fetch existing report
  if (req.method === 'GET') {
    const { application_id } = req.query || {};
    if (!application_id) return res.status(400).json({ error: 'application_id required' });
    try {
      const dbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/permit_reports?application_id=eq.${application_id}&order=version.desc&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
      );
      if (!dbRes.ok) throw new Error(await dbRes.text());
      const rows = await dbRes.json();
      return res.status(200).json({ report: rows[0] ?? null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST — issue report
  if (req.method === 'POST') {
    let body = req.body;
    if (!body) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
    }

    const { application_id, issued_by_name } = body || {};
    if (!application_id) return res.status(400).json({ error: 'application_id required' });

    try {
      // Fetch all included comments
      const commRes = await fetch(
        `${SUPABASE_URL}/rest/v1/permit_review_comments?application_id=eq.${application_id}&is_included=eq.true&order=department.asc,created_at.asc`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
      );
      const comments = commRes.ok ? await commRes.json() : [];

      // Group by department
      const byDept = {};
      comments.forEach(c => {
        if (!byDept[c.department]) byDept[c.department] = [];
        byDept[c.department].push({ id: c.id, content: c.content, reviewer: c.reviewer_name, is_correction: c.is_correction });
      });

      // Get current version
      const vRes = await fetch(
        `${SUPABASE_URL}/rest/v1/permit_reports?application_id=eq.${application_id}&order=version.desc&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
      );
      const vRows = vRes.ok ? await vRes.json() : [];
      const version = (vRows[0]?.version || 0) + 1;

      const report_content = {
        departments: Object.entries(byDept).map(([dept, cmts]) => ({
          department: dept,
          label: DEPT_LABELS[dept] || dept,
          comments: cmts,
          commentCount: cmts.length,
          correctionCount: cmts.filter(c => c.is_correction).length,
        })),
        totalComments: comments.length,
        totalCorrections: comments.filter(c => c.is_correction).length,
        issuedAt: new Date().toISOString(),
        issuedBy: issued_by_name || user.email,
      };

      // Save report
      const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/permit_reports`, {
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
          version,
          status: 'issued',
          issued_at: new Date().toISOString(),
          issued_by: user.id,
          issued_by_name: issued_by_name || user.email,
          report_content,
        }),
      });

      if (!saveRes.ok) throw new Error(await saveRes.text());
      const rows = await saveRes.json();

      // Update application status
      await fetch(`${SUPABASE_URL}/rest/v1/permit_applications?id=eq.${application_id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Profile': SCHEMA,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'reviewed', updated_at: new Date().toISOString() }),
      });

      return res.status(201).json({ report: rows[0], version });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).end();
}
