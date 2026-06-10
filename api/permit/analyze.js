// POST /api/permit/analyze
// Returns fee estimate + 2 similar precedent permits for a permit application
// Caches results in jurisdiction_codes (fees) and property_history (precedents)

import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

async function callAI(system, prompt, useSearch = true) {
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

async function getCachedFees(city, state) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/jurisdiction_codes?state_code=eq.${state}&city_name=eq.${encodeURIComponent(city)}&topic=eq.permit_fees_structured&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows[0]) return null;
    if (new Date(rows[0].expires_at) < new Date()) return null;
    return rows[0].content;
  } catch { return null; }
}

async function cacheFees(city, state, content) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/jurisdiction_codes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Content-Profile': SCHEMA,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        level: 'city', state_code: state, county_name: null,
        city_name: city, topic: 'permit_fees_structured',
        content, source_url: 'https://www.woodsideca.gov/DocumentCenter/View/1070',
        source_type: 'ai_search', fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  } catch {}
}

async function cachePrecedent(precedent, city, state) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/property_history`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Content-Profile': SCHEMA,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        address_key: (precedent.address || '').toLowerCase().trim(),
        apn: precedent.apn || null,
        permit_number: precedent.permit_number || null,
        permit_type: precedent.permit_type || null,
        description: precedent.description || null,
        status: precedent.status || 'issued',
        issued_date: precedent.issued_date || null,
        valuation: precedent.valuation || null,
        source: 'etrakit',
      }),
    });
  } catch {}
}

async function estimateFees(permitType, subType, city, state, projectValue) {
  // Check cache first
  const cached = await getCachedFees(city, state);
  if (cached) {
    return estimateFromSchedule(cached, permitType, subType, projectValue);
  }

  // Fetch fee schedule via AI
  const text = await callAI(
    'You are a permit fee researcher. Extract structured fee data. Output ONLY raw JSON.',
    `Search for the current ${city}, ${state} building permit fee schedule.\n` +
    `Find fees for: building permits, plan check fees, ADU fees, addition/remodel fees.\n` +
    `Output ONLY this JSON:\n` +
    `{\n` +
    `  "building_permit_base": "description of base fee calculation",\n` +
    `  "plan_check_fee": "usually % of building permit fee",\n` +
    `  "adu_fee": "specific ADU fee if any",\n` +
    `  "valuation_table": [{"range": "$0-$10,000", "fee": "$X"}],\n` +
    `  "other_fees": [{"name": "fee name", "amount": "$X"}],\n` +
    `  "source": "URL of fee schedule",\n` +
    `  "effective_date": "date"\n` +
    `}`
  );

  const feeData = parseJSON(text);
  if (feeData) await cacheFees(city, state, feeData);

  return estimateFromSchedule(feeData, permitType, subType, projectValue);
}

function estimateFromSchedule(feeData, permitType, subType, projectValue) {
  if (!feeData) {
    // Fallback estimates based on typical Woodside fees
    const estimates = {
      'new-construction': { permit: 15000, planCheck: 10500, total: 28500 },
      'addition-remodel': { permit: 3500, planCheck: 2450, total: 7200 },
      'adu':              { permit: 4200, planCheck: 2940, total: 9000 },
      'default':          { permit: 2000, planCheck: 1400, total: 4500 },
    };
    const est = estimates[permitType] || estimates.default;
    return {
      permitFee: est.permit,
      planCheckFee: est.planCheck,
      totalEstimate: est.total,
      confidence: 'low',
      notes: 'Estimate based on typical Woodside fees. Verify with Building Dept at 650-851-6796.',
      source: 'fallback',
    };
  }

  // Use fee data to calculate
  let permitFee = 2000;
  let planCheckFee = 1400;

  if (projectValue > 0 && feeData.valuation_table) {
    // Find matching range
    for (const row of feeData.valuation_table) {
      const range = row.range || '';
      const feeStr = row.fee || '';
      const fee = parseFloat(feeStr.replace(/[^0-9.]/g, ''));
      if (!isNaN(fee) && fee > 0) permitFee = fee;
    }
  }

  if (feeData.plan_check_fee) {
    const pct = parseFloat(feeData.plan_check_fee.match(/(\d+)/)?.[1] || '70');
    planCheckFee = Math.round(permitFee * (pct / 100));
  }

  const fireFee = ['new-construction', 'adu', 'addition-remodel'].includes(permitType) ? 850 : 0;
  const geologyFee = permitType === 'new-construction' ? 1200 : 0;

  return {
    permitFee,
    planCheckFee,
    fireFee,
    geologyFee,
    totalEstimate: permitFee + planCheckFee + fireFee + geologyFee,
    confidence: 'medium',
    notes: `Based on ${feeData.effective_date || 'current'} Woodside fee schedule. Final fees determined at permit issuance.`,
    source: feeData.source || 'Woodside fee schedule',
  };
}

async function findPrecedents(permitType, subType, address, city, state) {
  const text = await callAI(
    'You are a permit records researcher. Search eTRAKiT and public permit databases. Output ONLY raw JSON.',
    `Search the ${city}, ${state} eTRAKiT permit database at wood.csqrcloud.com for permits similar to:\n` +
    `Permit type: ${permitType} / ${subType}\n` +
    `Address: ${address}\n\n` +
    `Find 2 recently ISSUED or APPROVED permits of the same type in ${city}.\n` +
    `Output ONLY this JSON array:\n` +
    `[\n` +
    `  {\n` +
    `    "permit_number": "B2024-001",\n` +
    `    "address": "123 Oak Lane, ${city}",\n` +
    `    "permit_type": "ADU",\n` +
    `    "description": "Detached ADU 800 sq ft",\n` +
    `    "status": "Issued",\n` +
    `    "issued_date": "2024-03-15",\n` +
    `    "valuation": 250000,\n` +
    `    "notes": "any relevant notes"\n` +
    `  }\n` +
    `]\n` +
    `If you cannot find 2 permits, return as many as you find. Return [] if none found.`
  );

  const precedents = parseJSON(text);
  if (Array.isArray(precedents) && precedents.length > 0) {
    // Cache each precedent
    for (const p of precedents) {
      await cachePrecedent(p, city, state);
    }
    return precedents.slice(0, 2);
  }
  return [];
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'permit/analyze' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const {
    application_id,
    permit_type,
    sub_type,
    address,
    city = 'Woodside',
    state = 'CA',
    project_value = 0,
  } = body || {};

  if (!application_id) return res.status(400).json({ error: 'application_id required' });

  try {
    const [feeEstimate, precedents] = await Promise.all([
      estimateFees(permit_type, sub_type, city, state, project_value),
      findPrecedents(permit_type, sub_type, address, city, state),
    ]);

    return res.status(200).json({
      application_id,
      feeEstimate,
      precedents,
      analyzedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
