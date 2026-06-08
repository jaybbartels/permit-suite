import { requireAuth, authError } from '../middleware/auth.js';

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

  const { address } = body || {};
  if (!address) return res.status(400).json({ error: 'address required' });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a real estate data-extraction bot. Output ONLY raw JSON.',
      messages: [{ role: 'user', content:
        `Search for the last sale price and date of: "${address}"\n` +
        `Output ONLY: {"price":450000,"month":"Mar","year":2021,"source":"Zillow"}\n` +
        `If not found: {"price":null,"month":null,"year":null,"source":null}`
      }],
    }),
  });

  const data = await r.json();
  return res.status(200).json({ anthropicStatus: r.status, response: data });
}
