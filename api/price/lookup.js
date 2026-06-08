import { requireAuth, authError } from '../middleware/auth.js';
async function callAnthropic(payload) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', ...payload }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    console.error('Anthropic error:', res.status, errText);
    return { ok: false, status: res.status, error: errText };
  }
  const data = await res.json();
  return { ok: true, data };
}

function extractText(data) {
  return (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

function parseSaleJson(text, source) {
  const clean = text.replace(/```json|```/g, '').trim();
  try {
    const p = JSON.parse(clean);
    if (p.price && p.year) return { price: +p.price, month: p.month || 'Jan', year: +p.year, source };
  } catch {}
  const m = clean.match(/\{[^{}]{0,400}\}/);
  if (m) try {
    const p = JSON.parse(m[0]);
    if (p.price && p.year) return { price: +p.price, month: p.month || 'Jan', year: +p.year, source };
  } catch {}
  const pm = clean.match(/"price"\s*:\s*(\d{4,9})/);
  const mm = clean.match(/"month"\s*:\s*"([A-Z][a-z]{2})"/);
  const ym = clean.match(/"year"\s*:\s*"?(\d{4})"?/);
  if (pm && ym) return { price: +pm[1], month: mm?.[1] || 'Jan', year: +ym[1], source };
  return null;
}

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseZillowPage(text) {
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/\|\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\|\s*Sold\s*\|\s*\$([\d,]+)/i);
    if (m) {
      const price = parseInt(m[4].replace(/,/g, ''), 10);
      const year  = parseInt(m[3], 10);
      if (price > 1000 && year > 1980)
        return { price, month: MON[parseInt(m[1], 10) - 1] || 'Jan', year, source: 'Zillow' };
    }
  }
  const og = text.match(/last sold (?:on \S+ )?for \$([\d,]+) in ([A-Za-z]+) (\d{4})/i);
  if (og) {
    const MON_MAP = {january:'Jan',february:'Feb',march:'Mar',april:'Apr',may:'May',june:'Jun',july:'Jul',august:'Aug',september:'Sep',october:'Oct',november:'Nov',december:'Dec'};
    const price = parseInt(og[1].replace(/,/g,''), 10);
    if (price > 1000) return { price, month: MON_MAP[og[2].toLowerCase()] || og[2].slice(0,3), year: parseInt(og[3], 10), source: 'Zillow' };
  }
  return null;
}

function parseRedfinPage(text) {
  const MON_MAP = {jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
  const tbl = text.match(/\|\s*([A-Za-z]+)\s+(\d{4})\s*\|\s*Sold\s*\|\s*\$([\d,]+)/i);
  if (tbl) return { price: parseInt(tbl[3].replace(/,/g,''),10), month: MON_MAP[tbl[1].toLowerCase().slice(0,3)] || tbl[1].slice(0,3), year: parseInt(tbl[2],10), source: 'Redfin' };
  const inline = text.match(/sold\s+for\s+\$([\d,]+)\s+on\s+([A-Za-z]+)\s+\d+,?\s+(\d{4})/i);
  if (inline) return { price: parseInt(inline[1].replace(/,/g,''),10), month: MON_MAP[inline[2].toLowerCase().slice(0,3)] || inline[2].slice(0,3), year: parseInt(inline[3],10), source: 'Redfin' };
  return null;
}

function parseRealtorPage(text) {
  const MON_MAP = {jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
  const m1 = text.match(/sold[^$\n]*\$([\d,]+)[^$\n]*?([A-Za-z]+)\s+(\d{4})/i);
  if (m1) {
    const price = parseInt(m1[1].replace(/,/g,''),10);
    if (price > 1000 && parseInt(m1[3],10) > 1980)
      return { price, month: MON_MAP[m1[2].toLowerCase().slice(0,3)] || m1[2].slice(0,3), year: parseInt(m1[3],10), source: 'Realtor.com' };
  }
  return null;
}

async function fetchDirectPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PropertyValueBot/1.0)', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

async function lookupLastSale(address) {
  // Step 1: Zillow
  try {
    const zpidResult = await callAnthropic({
      max_tokens: 150,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'Output ONLY the exact Zillow homedetails URL with zpid. Nothing else.',
      messages: [{ role: 'user', content: `Search zillow.com for: ${address}\nReturn ONLY the URL: https://www.zillow.com/homedetails/ADDRESS_SLUG/XXXXXXX_zpid/` }],
    });
    if (zpidResult.ok) {
      const allBlocks = zpidResult.data?.content || [];
      let zpidUrl = null;
      for (const block of allBlocks) {
        const raw = block.content?.[0]?.text || block.text || '';
        const found = raw.match(/https?:\/\/www\.zillow\.com\/homedetails\/[^\s"'<>)]+\d+_zpid\/?/i);
        if (found) { zpidUrl = found[0].replace(/\/$/, '') + '/'; break; }
      }
      if (!zpidUrl) {
        const allText = allBlocks.map(b => b.content?.[0]?.text || b.text || '').join(' ');
        const found = allText.match(/https?:\/\/www\.zillow\.com\/homedetails\/[^\s"'<>)]+\d+_zpid\/?/i);
        if (found) zpidUrl = found[0].replace(/\/$/, '') + '/';
      }
      if (zpidUrl) {
        const html = await fetchDirectPage(zpidUrl);
        if (html) { const r = parseZillowPage(html); if (r) return r; }
      }
    }
  } catch {}

  // Step 2: Redfin
  try {
    const rfResult = await callAnthropic({
      max_tokens: 150,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'Output ONLY the raw Redfin property URL.',
      messages: [{ role: 'user', content: `Find the Redfin property page URL for: ${address}\nOutput ONLY the URL.` }],
    });
    if (rfResult.ok) {
      const allText = (rfResult.data?.content || []).map(b => b.text || b.content?.[0]?.text || '').join(' ');
      const urlMatch = allText.match(/https?:\/\/www\.redfin\.com\/[^\s"')]+home\/\d+/i);
      if (urlMatch) {
        const html = await fetchDirectPage(urlMatch[0]);
        if (html) { const r = parseRedfinPage(html); if (r) return r; }
      }
    }
  } catch {}

  // Step 3: Realtor.com
  try {
    const rlResult = await callAnthropic({
      max_tokens: 150,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'Output ONLY the raw Realtor.com property URL.',
      messages: [{ role: 'user', content: `Find the Realtor.com property page URL for: ${address}\nOutput ONLY the URL.` }],
    });
    if (rlResult.ok) {
      const allText = (rlResult.data?.content || []).map(b => b.text || b.content?.[0]?.text || '').join(' ');
      const urlMatch = allText.match(/https?:\/\/www\.realtor\.com\/realestateandhomes-detail\/[^\s"')]+/i);
      if (urlMatch) {
        const html = await fetchDirectPage(urlMatch[0]);
        if (html) { const r = parseRealtorPage(html); if (r) return r; }
      }
    }
  } catch {}

  // Step 4: AI fallback
  try {
    const finalResult = await callAnthropic({
      max_tokens: 350,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a data-extraction bot. Output ONLY raw JSON — no markdown, no prose.',
      messages: [{ role: 'user', content:
        `Search for the last sale price and date of: "${address}"\n` +
        `Output ONLY: {"price":381000,"month":"Jul","year":2020,"source":"Zillow"}\n` +
        `If not found: {"price":null,"month":null,"year":null,"source":null}`
      }],
    });
    if (finalResult.ok) return parseSaleJson(extractText(finalResult.data), 'web search');
  } catch {}

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

  const { address } = req.body || {};
  if (!address || typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'address is required' });
  }

  try {
    const result = await lookupLastSale(address.trim());
    if (!result) return res.status(404).json({ error: 'No sale record found', debug: 'waterfall exhausted' });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
}
