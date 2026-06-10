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
  if (formData?.project_valuation) return parseFloat(formData.project_valuation);
  if (formData?.estimated_cost) return parseFloat(formData.estimated_cost);

  // Estimate by permit type using Woodside min valuation rates
  const sqft = formData?.square_footage || formData?.sqft || 0;
  const estimates = {
    'new-construction': sqft > 0 ? sqft * 300 : 800000,
    'addition-remodel': sqft > 0 ? sqft * 200 : 150000,
    'adu':              sqft > 0 ? sqft * 300 : 250000,
    'pool':             120000,
    'fence':            15000,
    'mep':              25000,
    'default':          75000,
  };
  return estimates[permitType] || estimates.default;
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
  // Check cache first
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_history?permit_type=ilike.%25${encodeURIComponent(permitType)}%25&source=eq.etrakit&order=issued_date.desc&limit=5`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows.length >= 2) {
        return rows.slice(0, 2).map(r => ({
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

  // Search eTRAKiT via AI
  try {
    const text = await callAI(
      'You are a permit records researcher. Search public permit databases. Output ONLY a JSON array.',
      `Search the ${city}, ${state} eTRAKiT permit database at wood.csqrcloud.com for recently ISSUED permits similar to:\n` +
      `Permit type: ${permitType} / ${subType || 'general'}\n` +
      `Find 2 recently issued/approved permits of the same type in ${city}, CA.\n` +
      `Also search recent Woodside CA permit records online.\n` +
      `Output ONLY this JSON array (no markdown):\n` +
      `[{"permit_number":"B2024-001","address":"123 Oak Ln, Woodside CA","permit_type":"ADU","description":"Detached ADU 800 sqft","status":"Issued","issued_date":"2024-03-15","valuation":250000}]\n` +
      `Return [] if none found.`
    );

    const precedents = parseJSON(text);
    if (Array.isArray(precedents) && precedents.length > 0) {
      // Cache results
      for (const p of precedents.slice(0, 2)) {
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
              permit_number: p.permit_number || null,
              permit_type: p.permit_type || permitType,
              description: p.description || null,
              status: p.status || 'Issued',
              issued_date: p.issued_date || null,
              valuation: p.valuation || null,
              source: 'etrakit',
            }),
          });
        } catch {}
      }
      return precedents.slice(0, 2);
    }
  } catch {}

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
