// POST /api/inspection/location — update inspector GPS position
import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const PROXIMITY_METERS = 50;

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { error: authErr, user } = await requireAuth(req, { minRole: 'free', endpoint: 'inspection/location' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const { lat, lng, accuracy } = body || {};
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });

  try {
    // Store location
    await fetch(`${SUPABASE_URL}/rest/v1/inspector_locations`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': SCHEMA,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        inspector_id: user.id,
        lat, lng,
        accuracy: accuracy || null,
        recorded_at: new Date().toISOString(),
      }),
    });

    // Check proximity to scheduled inspections
    const qRes = await fetch(
      `${SUPABASE_URL}/rest/v1/inspections?inspector_id=eq.${user.id}&status=eq.scheduled&lat=not.is.null`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept-Profile': SCHEMA,
        },
      }
    );
    const scheduled = qRes.ok ? await qRes.json() : [];

    const nearby = scheduled.filter(insp =>
      insp.lat && insp.lng &&
      distanceMeters(lat, lng, insp.lat, insp.lng) <= PROXIMITY_METERS
    );

    return res.status(200).json({
      recorded: true,
      nearbyInspections: nearby.map(i => ({
        id: i.id,
        address: i.address,
        distance: Math.round(distanceMeters(lat, lng, i.lat, i.lng)),
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
