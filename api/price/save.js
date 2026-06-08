import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

function normalizeAddress(a) { return a.trim().toLowerCase().replace(/\s+/g,' '); }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { error: authErr } = await requireAuth(req, { minRole: 'free' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const { address, price, month, year, source } = body;
  if (!address || !price || !year) {
    return res.status(400).json({ error: 'address, price, and year are required' });
  }

  const key = normalizeAddress(address);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/property_lookups`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Profile': SCHEMA,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        address_key:     key,
        address_display: address.trim(),
        last_sale_price: price,
        last_sale_month: month || 'Jan',
        last_sale_year:  year,
        sale_source:     source || 'manual',
        looked_up_at:    new Date().toISOString(),
      }),
    });
    return res.status(200).json({ saved: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
