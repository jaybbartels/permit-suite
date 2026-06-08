export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Missing env vars', hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_KEY });
    }

    // Parse body — handle string, object, or undefined
    let body = req.body;
    if (!body) {
      // Try reading raw body
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      try { body = JSON.parse(raw); } catch { body = {}; }
    }
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const { action, email, password } = body;

    const endpoints = {
      signup: `${SUPABASE_URL}/auth/v1/signup`,
      login:  `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      logout: `${SUPABASE_URL}/auth/v1/logout`,
    };

    const url = endpoints[action];
    if (!url) return res.status(400).json({ error: 'Unknown action', received: action });

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
