import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

function normalizeAddress(a) {
  return a.trim().toLowerCase().replace(/\s+/g, ' ');
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

function extractFromText(text) {
  if (!text) return null;
  // Try JSON first
  const jsonMatch = text.match(/\{[^{}]{0,300}\}/g);
  if (jsonMatch) {
    for (const m of jsonMatch) {
      try {
        const p = JSON.parse(m);
        if (p.price && p.year && +p.price > 1000) {
          return { price: +p.price, month: p.month || 'Jan', year: +p.year, source: p.source || 'web search' };
        }
      } catch {}
    }
  }
  // Try natural language patterns
  // "sold for $450,000 in March 2021"
  const m1 = text.match(/sold\s+for\s+\$?([\d,]+)\s+in\s+([A-Za-z]+)\s+(\d{4})/i);
  if (m1) {
    const MON = {january:'Jan',february:'Feb',march:'Mar',april:'Apr',may:'May',june:'Jun',july:'Jul',august:'Aug',september:'Sep',october:'Oct',november:'Nov',december:'Dec',jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
    return { price: +m1[1].replace(/,/g,''), month: MON[m1[2].toLowerCase()] || m1[2].slice(0,3), year: +m1[3], source: 'web search' };
  }
  // "last sold: Mar 2021 · $450,000"
  const m2 = text.match(/last\s+sold[:\s]+([A-Za-z]+)\s+(\d{4})[^$]*\$?([\d,]+)/i);
  if (m2) {
    const MON = {january:'Jan',february:'Feb',march:'Mar',april:'Apr',may:'May',june:'Jun',july:'Jul',august:'Aug',september:'Sep',october:'Oct',november:'Nov',december:'Dec',jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
    return { price: +m2[3].replace(/,/g,''), month: MON[m2[1].toLowerCase()] || m2[1].slice(0,3), year: +m2[2], source: 'web search' };
  }
  // "$450,000 in Mar 2021"
  const m3 = text.match(/\$?([\d,]+)\s+in\s+([A-Za-z]+)\s+(\d{4})/i);
  if (m3 && +m3[1].replace(/,/g,'') > 10000) {
    const MON = {january:'Jan',february:'Feb',march:'Mar',april:'Apr',may:'May',june:'Jun',july:'Jul',august:'Aug',september:'Sep',october:'Oct',november:'Nov',december:'Dec',jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
    return { price: +m3[1].replace(/,/g,''), month: MON[m3[2].toLowerCase()] || m3[2].slice(0,3), year: +m3[3], source: 'web search' };
  }
  return null;
}

async function lookupLastSale(address) {
  // Use sonnet for better instruction following on this task
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are a real estate data assistant. Search the web for property sale information.
After searching, you MUST provide the last sale price in this exact format on the last line of your response:
SALE_DATA: {"price":450000,"month":"Mar","year":2021,"source":"Zillow"}
If you cannot find a sale price, write:
SALE_DATA: {"price":null,"month":null,"year":null,"source":null}
Always include the SALE_DATA line even if the data is null.`,
      messages: [{ role: 'user', content:
        `Find the most recent sale price for this property: ${address}\n` +
        `Search Zillow price history, Redfin sale history, or county records.\n` +
        `After searching, end your response with the SALE_DATA line.`
      }],
    }),
  });

  if (!res.ok) {
    console.error('Anthropic error:', res.status);
    return null;
  }

  const data = await res.json();
  const blocks = data?.content || [];

  // Extract text from all blocks
  const fullText = blocks
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Look for SALE_DATA marker first
  const saleDataMatch = fullText.match(/SALE_DATA:\s*(\{[^}]+\})/);
  if (saleDataMatch) {
    try {
      const p = JSON.parse(saleDataMatch[1]);
      if (p.price && p.year && +p.price > 1000) {
        return { price: +p.price, month: p.month || 'Jan', year: +p.year, source: p.source || 'web search' };
      }
    } catch {}
  }

  // Fall back to natural language extraction
  return extractFromText(fullText);
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

    // 2. AI web search with SALE_DATA marker
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
