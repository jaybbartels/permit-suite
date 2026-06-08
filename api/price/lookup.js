import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

function normalizeAddress(address) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function dbGetProperty(address) {
  const key = normalizeAddress(address);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_lookups?address_key=eq.${encodeURIComponent(key)}&order=looked_up_at.desc&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch { return null; }
}

async function dbUpsertProperty({ address, lastSalePrice, lastSaleMonth, lastSaleYear, saleSource }) {
  const key = normalizeAddress(address);
  const row = {
    address_key:     key,
    address_display: address.trim(),
    last_sale_price: lastSalePrice,
    last_sale_month: lastSaleMonth,
    last_sale_year:  lastSaleYear,
    sale_source:     saleSource || null,
    looked_up_at:    new Date().toISOString(),
  };
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
      body: JSON.stringify(row),
    });
  } catch {}
}

function parseSaleJson(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const p = JSON.parse(clean);
    if (p.price && p.year) return { price: +p.price, month: p.month || 'Jan', year: +p.year, source: p.source || 'web search' };
  } catch {}
  const m = clean.match(/\{[^{}]{0,400}\}/);
  if (m) try {
    const p = JSON.parse(m[0]);
    if (p.price && p.year) return { price: +p.price, month: p.month || 'Jan', year: +p.year, source: p.source || 'web search' };
  } catch {}
  const pm = clean.match(/"price"\s*:\s*(\d{4,9})/);
  const mm = clean.match(/"month"\s*:\s*"([A-Z][a-z]{2})"/);
  const ym = clean.match(/"year"\s*:\s*"?(\d{4})"?/);
  if (pm && ym) return { price: +pm[1], month: mm?.[1] || 'Jan', year: +ym[1], source: 'web search' };
  return null;
}

async function lookupLastSale(address) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
      system: 'You are a real estate data-extraction bot. Output ONLY raw JSON — no markdown, no prose, no explanation.',
      messages: [{ role: 'user', content:
        `Search for the last sale price and date of this property: "${address}"\n` +
        `Search Zillow, Redfin, Realtor.com, and public records.\n` +
        `Look for "last sold", "sold for", "price history", "sale history".\n` +
        `Output ONLY this JSON (no markdown, no extra text):\n` +
        `{"price":450000,"month":"Mar","year":2021,"source":"Zillow"}\n` +
        `month must be 3-letter abbreviation: Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec\n` +
        `If no sale found: {"price":null,"month":null,"year":null,"source":null}`
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('Anthropic error:', res.status, err);
    return null;
  }

  const data = await res.json();

  // Check tool results first — often contain raw sale data
  const allBlocks = data?.content || [];
  for (const block of allBlocks) {
    const txt = block.content?.[0]?.text || block.text || '';
    if (txt) {
      const scraped = parseSaleJson(txt);
      if (scraped?.price) return scraped;
    }
  }

  // Then check model text output
  const text = allBlocks
    .filter(b => b.type === 'text')
    .map(b => b.text).join('').trim();

  return parseSaleJson(text);
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'price/lookup' });
  if (authErr) return authError(res, authErr);

  // Parse body
  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    try { body = JSON.parse(raw); } catch { body = {}; }
  }
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const { address } = body;
  if (!address || typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'address is required' });
  }

  const addr = address.trim();

  try {
    // 1. Check Supabase cache first
    const cached = await dbGetProperty(addr);
    if (cached?.last_sale_price) {
      return res.status(200).json({
        price:  Number(cached.last_sale_price),
        month:  cached.last_sale_month || 'Jan',
        year:   Number(cached.last_sale_year),
        source: cached.sale_source || 'cache',
        cached: true,
      });
    }

    // 2. AI web search lookup
    const result = await lookupLastSale(addr);
    if (!result?.price) {
      return res.status(404).json({ error: 'No sale record found' });
    }

    // 3. Cache the result
    await dbUpsertProperty({
      address: addr,
      lastSalePrice: result.price,
      lastSaleMonth: result.month,
      lastSaleYear:  result.year,
      saleSource:    result.source,
    });

    return res.status(200).json(result);
  } catch (e) {
    console.error('Lookup error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
