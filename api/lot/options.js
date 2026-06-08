// ── Cost models by option type and state ─────────────────────────────────────
const COST_MODELS = {
  duplex: {
    base: { low: 180000, high: 420000 },
    byState: {
      CA: { low: 280000, high: 520000 },
      OR: { low: 200000, high: 380000 },
      WA: { low: 220000, high: 400000 },
      MT: { low: 160000, high: 300000 },
      VT: { low: 180000, high: 340000 },
      ME: { low: 160000, high: 320000 },
      CO: { low: 200000, high: 380000 },
      RI: { low: 200000, high: 380000 },
      CT: { low: 200000, high: 380000 },
    },
    breakdown: [
      { item: 'Design & architecture',      pct: 0.06 },
      { item: 'Permits & fees',             pct: 0.04 },
      { item: 'Site prep & foundation',     pct: 0.12 },
      { item: 'Framing & structure',        pct: 0.22 },
      { item: 'MEP (mechanical/elec/plumb)',pct: 0.18 },
      { item: 'Finishes & fixtures',        pct: 0.24 },
      { item: 'Landscaping & site work',    pct: 0.06 },
      { item: 'Contingency (10%)',          pct: 0.08 },
    ],
  },
  lotSplit: {
    base: { low: 20000, high: 60000 },
    byState: {
      CA: { low: 25000, high: 70000 },
      OR: { low: 15000, high: 45000 },
      WA: { low: 15000, high: 45000 },
    },
    breakdown: [
      { item: 'Survey & parcel map',        pct: 0.25 },
      { item: 'Civil engineering',          pct: 0.20 },
      { item: 'Permit & filing fees',       pct: 0.20 },
      { item: 'Utility separation',         pct: 0.25 },
      { item: 'Legal & title',              pct: 0.10 },
    ],
  },
  both: {
    base: { low: 400000, high: 900000 },
    byState: {
      CA: { low: 550000, high: 1100000 },
      OR: { low: 420000, high: 820000 },
      WA: { low: 450000, high: 860000 },
    },
    breakdown: [
      { item: 'Lot split (survey, permits)', pct: 0.06 },
      { item: 'Unit 1 construction',         pct: 0.44 },
      { item: 'Unit 2 construction',         pct: 0.44 },
      { item: 'Shared infrastructure',       pct: 0.06 },
    ],
  },
};

// ── Rental income models by metro ─────────────────────────────────────────────
const RENTAL_MODELS = {
  CA: {
    'San Francisco': { studio: 2800, oneBed: 3400, twoBed: 4200 },
    'Los Angeles':   { studio: 2200, oneBed: 2800, twoBed: 3600 },
    'San Diego':     { studio: 2000, oneBed: 2600, twoBed: 3200 },
    default:         { studio: 1800, oneBed: 2200, twoBed: 2800 },
  },
  OR: { default: { studio: 1400, oneBed: 1700, twoBed: 2200 } },
  WA: { default: { studio: 1600, oneBed: 2000, twoBed: 2600 } },
  MT: { default: { studio: 900,  oneBed: 1100, twoBed: 1400 } },
  VT: { default: { studio: 1100, oneBed: 1400, twoBed: 1800 } },
  ME: { default: { studio: 1000, oneBed: 1300, twoBed: 1700 } },
  CO: { default: { studio: 1400, oneBed: 1800, twoBed: 2300 } },
  RI: { default: { studio: 1300, oneBed: 1600, twoBed: 2100 } },
  CT: { default: { studio: 1400, oneBed: 1700, twoBed: 2200 } },
  default: { default: { studio: 1200, oneBed: 1500, twoBed: 1900 } },
};

function getRentalEstimate(stateCode, address) {
  const stateRentals = RENTAL_MODELS[stateCode] || RENTAL_MODELS.default;
  const addr = address.toLowerCase();
  for (const [city, rates] of Object.entries(stateRentals)) {
    if (city !== 'default' && addr.includes(city.toLowerCase())) return rates;
  }
  return stateRentals.default || RENTAL_MODELS.default.default;
}

function getCostModel(optionType, stateCode) {
  const model = COST_MODELS[optionType] || COST_MODELS.duplex;
  const costs = model.byState?.[stateCode] || model.base;
  const mid   = Math.round((costs.low + costs.high) / 2);
  return {
    low: costs.low,
    high: costs.high,
    mid,
    breakdown: model.breakdown.map(b => ({
      item:   b.item,
      low:    Math.round(costs.low  * b.pct),
      high:   Math.round(costs.high * b.pct),
    })),
  };
}

// ── ROI model ─────────────────────────────────────────────────────────────────
function calcROI(costModel, rentalRates, optionType, currentValue) {
  const annualRent = rentalRates.twoBed * 12;
  const grossYield = costModel.mid > 0 ? (annualRent / costModel.mid) * 100 : 0;
  const netYield   = grossYield * 0.65; // ~35% expenses
  const paybackYrs = costModel.mid > 0 ? costModel.mid / (annualRent * 0.65) : null;
  const valueUpliftAmt = optionType === 'both'
    ? Math.round(currentValue * 0.55)
    : optionType === 'lotSplit'
    ? Math.round(currentValue * 0.35)
    : Math.round(currentValue * 0.25);
  const roi = costModel.mid > 0
    ? Math.round((valueUpliftAmt / costModel.mid) * 100)
    : null;
  return { annualRent, grossYield, netYield, paybackYrs, valueUpliftAmt, roi };
}

// ── Local permit process via AI ───────────────────────────────────────────────
async function fetchLocalProcess(address, optionType, stateLaw) {
  const optionLabel = optionType === 'both'
    ? 'lot split and duplex construction'
    : optionType === 'lotSplit'
    ? 'residential lot split'
    : 'duplex construction';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a permit process researcher. Output ONLY raw JSON.',
      messages: [{ role: 'user', content:
        `Search the local building/planning department for: "${address}"\n` +
        `Find the exact local process for: ${optionLabel} under ${stateLaw}\n` +
        `Output ONLY:\n` +
        `{\n` +
        `  "steps": [{"step":1,"title":"name","description":"detail","duration":"time"}],\n` +
        `  "fees": "fee description or null",\n` +
        `  "portalUrl": "official URL or null",\n` +
        `  "localNotes": "any local specifics or null",\n` +
        `  "isLocalData": true/false\n` +
        `}`
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = (data?.content || [])
    .filter(b => b.type === 'text').map(b => b.text).join('').trim()
    .replace(/```json|```/g, '');
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
  }
}

// ── Fallback permit steps ─────────────────────────────────────────────────────
const FALLBACK_STEPS = {
  duplex: [
    { step:1, title:'Pre-application meeting',      description:'Meet with local planning department to confirm duplex eligibility under state law and discuss design requirements.', duration:'1–2 hours' },
    { step:2, title:'Hire architect',               description:'Engage a licensed architect to prepare construction drawings meeting local building code and state law requirements.', duration:'4–8 weeks' },
    { step:3, title:'Submit permit application',    description:'Submit building permit application with plans, energy compliance, and structural calculations.', duration:'1–2 weeks' },
    { step:4, title:'Plan check',                   description:'Building department reviews plans. Under state law, approval must be ministerial — no discretionary review or public hearing.', duration:'2–6 weeks' },
    { step:5, title:'Construction',                 description:'Licensed general contractor builds the duplex with required inspections at foundation, framing, MEP rough-in, and final.', duration:'6–12 months' },
    { step:6, title:'Final inspection & occupancy', description:'Pass all final inspections and receive Certificate of Occupancy for both units.', duration:'1–2 weeks' },
  ],
  lotSplit: [
    { step:1, title:'Boundary survey',              description:'Licensed surveyor prepares a boundary survey and proposed parcel map showing the two resulting lots.', duration:'2–4 weeks' },
    { step:2, title:'Civil engineering',            description:'Civil engineer prepares grading plan, utility separation plan, and any required drainage analysis.', duration:'2–4 weeks' },
    { step:3, title:'Tentative parcel map',         description:'Submit tentative parcel map to planning department. Under state law, approval is ministerial within 60 days.', duration:'4–8 weeks' },
    { step:4, title:'Conditions of approval',       description:'Satisfy any conditions (utility connections, easements, fees). Local agencies limited in conditions they can impose.', duration:'2–6 weeks' },
    { step:5, title:'Final parcel map',             description:'Record final parcel map with county recorder. New APN numbers assigned to each parcel.', duration:'2–4 weeks' },
    { step:6, title:'Title & financing',            description:'Update title, obtain separate financing if selling one parcel, and establish any shared easements.', duration:'2–4 weeks' },
  ],
  both: [
    { step:1, title:'Pre-application & design',     description:'Meet with planning department. Engage architect and civil engineer simultaneously to design both lots and both units.', duration:'4–8 weeks' },
    { step:2, title:'Lot split application',        description:'Submit tentative parcel map. Approval is ministerial under state law.', duration:'4–8 weeks' },
    { step:3, title:'Building permits — Unit 1',    description:'Submit building permit for first duplex unit on Parcel A while lot split processes.', duration:'2–6 weeks' },
    { step:4, title:'Record parcel map',            description:'Record final parcel map once conditions are satisfied.', duration:'2–4 weeks' },
    { step:5, title:'Building permits — Unit 2',    description:'Submit building permit for second unit on Parcel B.', duration:'2–6 weeks' },
    { step:6, title:'Construction — both units',    description:'Construct both units sequentially or simultaneously depending on financing. Required inspections at each stage.', duration:'12–18 months' },
    { step:7, title:'Final inspections & occupancy',description:'Pass final inspections for all units. Receive Certificate of Occupancy for each unit separately.', duration:'2–4 weeks' },
  ],
};

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { address, stateCode, optionType, currentValue, stateLawName } = req.body || {};

  if (!address || !stateCode || !optionType) {
    return res.status(400).json({ error: 'address, stateCode, and optionType are required' });
  }

  try {
    const costModel   = getCostModel(optionType, stateCode);
    const rentalRates = getRentalEstimate(stateCode, address);
    const roi         = calcROI(costModel, rentalRates, optionType, currentValue || 800000);

    // Fetch local permit process (with fallback)
    let process = null;
    try {
      process = await fetchLocalProcess(address, optionType, stateLawName || 'state zoning reform law');
    } catch {}

    const steps      = process?.steps?.length ? process.steps : FALLBACK_STEPS[optionType] || FALLBACK_STEPS.duplex;
    const isLocalData = !!process?.steps?.length;

    return res.status(200).json({
      address,
      stateCode,
      optionType,
      costModel,
      rentalRates,
      roi,
      process: {
        steps,
        fees:        process?.fees || null,
        portalUrl:   process?.portalUrl || null,
        localNotes:  process?.localNotes || null,
        isLocalData,
      },
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
