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
        last_sale_price: lastSalePrice,
        last_sale_month: lastSaleMonth,
        last_sale_year:  lastSaleYear,
        sale_source:     saleSource || null,
        looked_up_at:    new Date().toISOString(),
      }),
    });
  } catch {}
}

function parseSaleJson(text) {
  if (!text) return null;
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const p = JSON.parse(clean);
    if (p.price && p.year && p.price > 1000) {
      return { price: +p.price, month: p.month || 'Jan', year: +p.year, source: p.source || 'web search' };
    }
  } catch {}
  const m = clean.match(/\{[^{}]{0,500}\}/);
  if (m) try {
    const p = JSON.parse(m[0]);
    if (p.price && p.year && p.price > 1000) {
      return { price: +p.price, month: p.month || 'Jan', year: +p.year, source: p.source || 'web search' };
    }
  } catch {}
  // Try field-by-field extraction
  const pm = clean.match(/"price"\s*:\s*(\d{4,9})/);
  const mm = clean.match(/"month"\s*:\s*"([A-Z][a-z]{2})"/);
  const ym = clean.match(/"year"\s*:\s*"?(\d{4})"?/);
  if (pm && ym && +pm[1] > 1000) {
    return { price: +pm[1], month: mm?.[1] || 'Jan', year: +ym[1], source: 'web search' };
  }
  return null;
}

async function callAnthropicSearch(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a real estate data-extraction bot. You MUST search the web and extract the actual sale price. Output ONLY raw JSON with no markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function lookupLastSale(address) {
  // Strategy: Use multiple targeted search queries to find the sale price
  const queries = [
    `Search for "${address}" on Zillow. Find the "Price history" or "Sale history" section and extract the most recent "Sold" entry. Output ONLY: {"price":450000,"month":"Mar","year":2021,"source":"Zillow"} or {"price":null,"month":null,"year":null,"source":null}`,
    `Search for "${address}" sold price on Redfin. Look for "Sale History" or "Last Sold" information. Output ONLY: {"price":450000,"month":"Mar","year":2021,"source":"Redfin"} or {"price":null,"month":null,"year":null,"source":null}`,
    `Search for the last sale price of "${address}". Try county property records, Realtor.com, or any real estate site. Output ONLY: {"price":450000,"month":"Mar","year":2021,"source":"source name"} or {"price":null,"month":null,"year":null,"source":null}`,
  ];

  for (const query of queries) {
    try {
      const data = await callAnthropicSearch(query);
      if (!data) continue;

      const blocks = data?.content || [];
      // Check all text blocks
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          const result = parseSaleJson(block.text);
          if (result?.price) return result;
        }
        // Check tool result content
        if (block.type === 'web_search_tool_result') {
          for (const item of block.content || []) {
            if (item.type === 'web_search_result' && item.snippet) {
              const result = parseSaleJson(item.snippet);
              if (result?.price) return result;
            }
          }
        }
      }
    } catch {}
  }
  return null;
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

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
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
    // 1. Check Supabase cache
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

    // 2. AI web search
    const result = await lookupLastSale(addr);
    if (!result?.price) {
      return res.status(404).json({ error: 'No sale record found' });
    }

    // 3. Cache result
    await dbUpsertProperty({
      address: addr,
      lastSalePrice: result.price,
      lastSaleMonth: result.month,
      lastSaleYear:  result.year,
      saleSource:    result.source,
    });

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
