export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const base = `${SUPABASE_URL}/rest/v1/permit_cities`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept-Profile': 'permit_data',
    'Content-Profile': 'permit_data',
  };

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      const url = id ? `${base}?id=eq.${id}` : base;
      const r = await fetch(url, { headers });
      const data = await r.json();
      return res.status(200).json({ success: true, rows: data });
    }

    if (req.method === 'POST') {
      const r = await fetch(base, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(req.body),
      });
      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ success: false, error: err });
      }
      return res.status(200).json({ success: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
