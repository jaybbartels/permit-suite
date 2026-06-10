// POST /api/permit/analyze
// Returns fee estimate + 2 similar precedent permits for a permit application

import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

async function callAI(system, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch {}
  const m = clean.match(/[\[{][\s\S]*[\]}]/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

async function getFeeSchedule(city, state) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/jurisdiction_codes?state_code=eq.${state}&city_name=eq.${encodeURIComponent(city)}&topic=eq.permit_fees_structured&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0]?.content ?? null;
  } catch { return null; }
}

function calcPermitFee(valuation, feeSchedule) {
  if (!feeSchedule?.valuation_based_fees) return 2000;
  for (const row of feeSchedule.valuation_based_fees) {
    if (valuation >= row.min && valuation <= row.max) {
      if (row.formula === 'flat') return row.fee;
      if (row.formula === 'base_plus_per_k') {
        const extra = Math.ceil((valuation - row.base_threshold) / 1000);
        return Math.round(row.fee + extra * row.per_k);
      }
    }
  }
  return 2000;
}

function estimateValuation(permitType, subType, formData) {
  // Use form data if available
  if (formData?.project_valuation && formData.project_valuation > 0) return parseFloat(formData.project_valuation);
  if (formData?.estimated_value && formData.estimated_value > 0) return parseFloat(formData.estimated_value);
  if (formData?.estimated_cost && formData.estimated_cost > 0) return parseFloat(formData.estimated_cost);

  // Normalize permit type (handle hyphenated and slash formats)
  const pt = (permitType || '').toLowerCase().replace(/[^a-z]/g, '-');
  const sqft = formData?.square_footage || formData?.sqft || 0;

  // Map permit categories to valuation estimates
  const estimates = {
    'new-construction':   sqft > 0 ? sqft * 300 : 800000,
    'new':                sqft > 0 ? sqft * 300 : 800000,
    'addition-remodel':   sqft > 0 ? sqft * 200 : 150000,
    'remodel':            sqft > 0 ? sqft * 200 : 150000,
    'addition':           sqft > 0 ? sqft * 200 : 150000,
    'adu':                sqft > 0 ? sqft * 300 : 250000,
    'pool':               120000,
    'pool-spa':           120000,
    'fence':              15000,
    'fence-gate-wall':    15000,
    'mep':                25000,
    'solar':              30000,
    'default':            75000,
  };

  // Try exact match then partial match
  if (estimates[pt]) return estimates[pt];
  for (const [key, val] of Object.entries(estimates)) {
    if (pt.includes(key) || key.includes(pt)) return val;
  }
  return estimates.default;
}

function buildFeeEstimate(permitType, subType, valuation, feeSchedule) {
  // Check if minor permit type has flat fee
  const minorMap = {
    'hvac':         feeSchedule?.minor_permits?.hvac,
    'water-heater': feeSchedule?.minor_permits?.water_heater,
    'ev-charger':   feeSchedule?.minor_permits?.ev_charger,
    'solar':        feeSchedule?.minor_permits?.solar_residential_15kw,
    'generator':    feeSchedule?.minor_permits?.generator,
    're-roof':      feeSchedule?.minor_permits?.reroof_small,
  };

  const flatFee = minorMap[subType];
  let permitFee, planCheckFee, fireFee, geologyFee, asrbFee;

  if (flatFee) {
    permitFee = flatFee;
    planCheckFee = 0;
  } else {
    permitFee = calcPermitFee(valuation, feeSchedule);
    const pct = (feeSchedule?.plan_check_fee_pct || 70) / 100;
    planCheckFee = Math.round(permitFee * pct);
  }

  // Additional fees by permit type
  fireFee     = ['new-construction','adu','addition-remodel','pool'].includes(permitType) ? 850 : 0;
  geologyFee  = ['new-construction'].includes(permitType) ? 1200 : 0;
  asrbFee     = ['new-construction','addition-remodel'].includes(permitType) ? 1500 : 0;

  // State surcharges (approx 1% + strong motion)
  const stateFee = Math.round(permitFee * 0.013);

  const total = permitFee + planCheckFee + fireFee + geologyFee + asrbFee + stateFee;

  return {
    estimatedValuation: valuation,
    permitFee,
    planCheckFee,
    fireFee,
    geologyFee,
    asrbFee,
    stateSurcharges: stateFee,
    totalEstimate: total,
    breakdown: [
      { label: 'Building permit fee', amount: permitFee },
      ...(planCheckFee > 0 ? [{ label: 'Plan check fee (70%)', amount: planCheckFee }] : []),
      ...(fireFee > 0 ? [{ label: 'WFPD fire review (est.)', amount: fireFee }] : []),
      ...(geologyFee > 0 ? [{ label: 'Geology review (est.)', amount: geologyFee }] : []),
      ...(asrbFee > 0 ? [{ label: 'ASRB review (est.)', amount: asrbFee }] : []),
      { label: 'State surcharges (est.)', amount: stateFee },
    ],
    confidence: feeSchedule ? 'high' : 'low',
    effectiveDate: feeSchedule?.effective_date || 'unknown',
    notes: `Based on ${feeSchedule?.effective_date || 'current'} Woodside fee schedule. ${feeSchedule?.notes || ''} Final fees set by Building Official.`,
    paymentNote: feeSchedule?.payment || 'Check with Building Dept for payment methods.',
  };
}

async function findPrecedents(permitType, subType, address, city, state) {
  // Normalize permit type for cache lookup
  const ptNorm = (permitType || '').toLowerCase().replace(/[^a-z]/g, '-');

  // Check cache first — look for same city + permit type
  try {
    const cityKey = city.toLowerCase().replace(/[^a-z]/g, '-');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_history?permit_type=ilike.%25${encodeURIComponent(ptNorm.split('-')[0])}%25&order=issued_date.desc&limit=10`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (res.ok) {
      const rows = await res.json();
      // Filter to same city if address_key contains city name
      const cityRows = rows.filter(r =>
        (r.address_key || '').toLowerCase().includes(city.toLowerCase()) ||
        rows.length <= 3 // if few results, use any city
      );
      const useRows = cityRows.length >= 2 ? cityRows : rows;
      if (useRows.length >= 2) {
        return useRows.slice(0, 2).map(r => ({
          permit_number: r.permit_number,
          address: r.address_key,
          permit_type: r.permit_type,
          description: r.description,
          status: r.status,
          issued_date: r.issued_date,
          valuation: r.valuation,
          source: 'cached',
        }));
      }
    }
  } catch {}

  // Multi-strategy AI search
  const searches = [
    `${city} ${state} building permit ${permitType.replace(/-/g,' ')} issued 2024 2023 permit number address`,
    `site:${city.toLowerCase().replace(/\s+/g,'')}.gov building permit ${permitType.replace(/-/g,' ')} issued approved`,
    `"${city}" "${state}" permit records "${permitType.replace(/-/g,' ')}" issued approved 2023 2024`,
  ];

  for (const query of searches) {
    try {
      const text = await callAI(
        `You are a permit records researcher. Search for real issued building permits.
Output ONLY a valid JSON array. No markdown, no explanation, no preamble.
Each object must have these exact fields: permit_number, address, permit_type, description, status, issued_date, valuation.
Use null for unknown values. Return [] if you cannot find real permits.`,
        `Search for: ${query}

Find 2-4 recently ISSUED or APPROVED ${permitType.replace(/-/g,' ')} permits in ${city}, ${state}.
Look for real permit numbers (like B2023-0142, 2024-00123, BP-2024-001 etc).
Each permit must have a real street address in ${city}.

Return ONLY this JSON array format:
[{"permit_number":"B2024-001","address":"123 Oak Ln, ${city} ${state}","permit_type":"${permitType}","description":"brief description","status":"Issued","issued_date":"2024-03-15","valuation":250000}]`
      );

      const found = parseJSON(text);
      if (Array.isArray(found) && found.length > 0 &&
          found.some(p => p.permit_number && p.address)) {

        // Filter out obviously fake results
        const real = found.filter(p =>
          p.permit_number &&
          p.address &&
          p.permit_number !== 'B2024-001' && // filter template values
          p.permit_number !== 'UNKNOWN'
        );

        if (real.length > 0) {
          // Cache all results
          for (const p of real) {
            try {
              await fetch(`${SUPABASE_URL}/rest/v1/property_history`, {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json', 'Content-Profile': SCHEMA,
                  'Prefer': 'return=minimal',
                },
                body: JSON.stringify({
                  address_key: (p.address || '').toLowerCase().trim(),
                  permit_number: p.permit_number,
                  permit_type: p.permit_type || permitType,
                  description: p.description || null,
                  status: p.status || 'Issued',
                  issued_date: p.issued_date || null,
                  valuation: p.valuation || null,
                  source: 'ai_search',
                }),
              });
            } catch {}
          }
          return real.slice(0, 2);
        }
      }
    } catch {}
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

  const { application_id, permit_type, sub_type, address, city = 'Woodside', state = 'CA', form_data = {} } = body || {};
  if (!application_id) return res.status(400).json({ error: 'application_id required' });

  try {
    const [feeSchedule] = await Promise.all([getFeeSchedule(city, state)]);
    const valuation = estimateValuation(permit_type, sub_type, form_data);
    const feeEstimate = buildFeeEstimate(permit_type, sub_type, valuation, feeSchedule);
    const precedents = await findPrecedents(permit_type, sub_type, address, city, state);

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
