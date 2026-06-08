// GET /api/jurisdiction/lookup
// Returns cached jurisdiction data for a given state/county/city/topic
// Query params: state, county (optional), city (optional), topic (optional)

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

  const { error: authErr } = await requireAuth(req, { minRole: 'free' });
  if (authErr) return authError(res, authErr);

  const { state, county, city, topic } = req.query || {};

  if (!state) return res.status(400).json({ error: 'state is required' });

  try {
    let url = `${SUPABASE_URL}/rest/v1/jurisdiction_codes?state_code=eq.${state}`;
    if (county) url += `&county_name=eq.${encodeURIComponent(county)}`;
    if (city)   url += `&city_name=eq.${encodeURIComponent(city)}`;
    if (topic)  url += `&topic=eq.${encodeURIComponent(topic)}`;
    url += `&expires_at=gt.${new Date().toISOString()}`;
    url += `&order=level.asc,fetched_at.desc`;

    const dbRes = await fetch(url, {
      headers: {
        'apikey':          SUPABASE_KEY,
        'Authorization':   `Bearer ${SUPABASE_KEY}`,
        'Accept-Profile':  SCHEMA,
      },
    });

    if (!dbRes.ok) throw new Error(`DB error: ${await dbRes.text()}`);
    const rows = await dbRes.json();

    if (!rows.length) {
      return res.status(404).json({
        error: 'No cached data found for this jurisdiction',
        hint:  'Call /api/jurisdiction/crawl-state or /api/jurisdiction/crawl-city to populate',
        query: { state, county, city, topic },
      });
    }

    return res.status(200).json({
      count: rows.length,
      results: rows.map(r => ({
        level:      r.level,
        state:      r.state_code,
        county:     r.county_name,
        city:       r.city_name,
        topic:      r.topic,
        content:    r.content,
        sourceUrl:  r.source_url,
        fetchedAt:  r.fetched_at,
        expiresAt:  r.expires_at,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
