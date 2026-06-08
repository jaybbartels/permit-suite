import { requireAuth, authError } from '../middleware/auth.js';
// ── State zoning reform laws database ─────────────────────────────────────────
// Each entry defines what the state law permits and key eligibility rules
const STATE_LAWS = {
  CA: {
    name: 'California',
    law: 'SB 9 (2022)',
    summary: 'Allows lot splits and duplexes by right on single-family zoned parcels statewide.',
    allowsDuplex: true,
    allowsLotSplit: true,
    allowsBoth: true,
    maxUnits: 4, // duplex on each split lot
    minLotSizeSqft: 1200, // per resulting parcel
    minLotSizeOriginal: 2400,
    lotSplitMinPct: 40, // each parcel must be at least 40% of original
    ownerOccupyRequired: true,
    ownerOccupyYears: 3,
    disqualifiers: [
      'historic_district',
      'fire_hazard_zone',
      'flood_zone',
      'earthquake_fault_zone',
      'coastal_zone',
      'hoa_prohibition',
      'deed_restriction',
      'tenant_occupied_last_3_years',
    ],
    permitTimeline: '60–120 days (ministerial approval — no discretionary review)',
    notes: 'Local agencies cannot impose design standards that would physically preclude construction. Rental income from ADU + SB9 unit can offset mortgage significantly.',
    valueUplift: { duplex: 0.28, lotSplit: 0.35, both: 0.55 },
    approvalLikelihood: 'High — ministerial approval, no public hearing required',
  },
  OR: {
    name: 'Oregon',
    law: 'HB 2001 (2019) + SB 458 (2021)',
    summary: 'Duplexes allowed by right in all residential zones. Fee-simple lot splits permitted for newly built duplexes.',
    allowsDuplex: true,
    allowsLotSplit: true,
    allowsBoth: true,
    maxUnits: 4, // cities 25k+ must allow 4-plexes
    minLotSizeSqft: 1500,
    minLotSizeOriginal: 3000,
    lotSplitMinPct: 40,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'hoa_prohibition',
      'deed_restriction',
    ],
    permitTimeline: '30–90 days',
    notes: 'Cities with 25,000+ residents must also allow triplexes and fourplexes. Lot splits under SB 458 allow selling each unit separately as fee-simple ownership.',
    valueUplift: { duplex: 0.22, lotSplit: 0.30, both: 0.45 },
    approvalLikelihood: 'High — by-right approval in most jurisdictions',
  },
  WA: {
    name: 'Washington',
    law: 'HB 1110 (2023) + HB 1245 (2024)',
    summary: 'Duplexes required statewide. Lot splits allowed in all residential zones, minimum 1,500 sqft per parcel.',
    allowsDuplex: true,
    allowsLotSplit: true,
    allowsBoth: true,
    maxUnits: 4,
    minLotSizeSqft: 1500,
    minLotSizeOriginal: 3000,
    lotSplitMinPct: 40,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'critical_areas',
      'hoa_prohibition',
    ],
    permitTimeline: '30–60 days',
    notes: 'HB 1245 requires each resulting lot to be at least 40% of the original and no smaller than 1,500 sqft. Seattle already allowed 2 ADUs per lot so impact varies by city.',
    valueUplift: { duplex: 0.20, lotSplit: 0.28, both: 0.42 },
    approvalLikelihood: 'High — by-right in most cities',
  },
  MT: {
    name: 'Montana',
    law: 'SB 382 (2023) + 2025 expansion',
    summary: 'Duplexes and triplexes allowed by right across most of the state. ADUs required statewide including unincorporated areas.',
    allowsDuplex: true,
    allowsLotSplit: false,
    allowsBoth: false,
    maxUnits: 3,
    minLotSizeSqft: 2000,
    minLotSizeOriginal: 4000,
    lotSplitMinPct: null,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'hoa_prohibition',
      'deed_restriction',
      'active_court_injunction',
    ],
    permitTimeline: '30–60 days',
    notes: 'Law faced court challenge but Montana Supreme Court reversed the injunction. 2025 expansion extended ADU requirements to unincorporated areas and removed parking minimums.',
    valueUplift: { duplex: 0.18, lotSplit: 0, both: 0 },
    approvalLikelihood: 'Medium-High — some local resistance but state law preempts',
  },
  VT: {
    name: 'Vermont',
    law: 'Act 47 (2023)',
    summary: 'Duplexes allowed everywhere single-family homes are permitted. Up to 4 units in areas with sewer and water service.',
    allowsDuplex: true,
    allowsLotSplit: false,
    allowsBoth: false,
    maxUnits: 4,
    minLotSizeSqft: 1500,
    minLotSizeOriginal: 3000,
    lotSplitMinPct: null,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'no_sewer_water', // limits to 2 units
      'hoa_prohibition',
    ],
    permitTimeline: '30–90 days',
    notes: 'Properties with sewer and water access can build up to 4 units. Rural properties without sewer/water limited to duplex.',
    valueUplift: { duplex: 0.18, lotSplit: 0, both: 0 },
    approvalLikelihood: 'High — state law is clear and local compliance is strong',
  },
  ME: {
    name: 'Maine',
    law: 'LD 2003 (2022)',
    summary: 'Effectively ends single-family-only zoning statewide. Up to 4 units allowed in designated growth areas.',
    allowsDuplex: true,
    allowsLotSplit: false,
    allowsBoth: false,
    maxUnits: 4,
    minLotSizeSqft: 1500,
    minLotSizeOriginal: 3000,
    lotSplitMinPct: null,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'outside_growth_area', // limits to duplex
      'hoa_prohibition',
    ],
    permitTimeline: '30–90 days',
    notes: 'Properties outside designated growth areas may be limited to duplexes. Check with local planning department for growth area boundaries.',
    valueUplift: { duplex: 0.16, lotSplit: 0, both: 0 },
    approvalLikelihood: 'Medium-High — varies by municipality',
  },
  CO: {
    name: 'Colorado',
    law: 'HB 1152 (2024)',
    summary: 'ADUs legalized statewide. Transit-oriented density required near rail and bus stops.',
    allowsDuplex: false,
    allowsLotSplit: false,
    allowsBoth: false,
    maxUnits: 2, // primary + ADU
    minLotSizeSqft: 1200,
    minLotSizeOriginal: 2400,
    lotSplitMinPct: null,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'hoa_prohibition',
    ],
    permitTimeline: '30–60 days',
    notes: 'Primary focus is ADU legalization. Transit-oriented density (HB 1313) allows higher density near rail/bus stops — check proximity to transit.',
    valueUplift: { duplex: 0, lotSplit: 0, both: 0, adu: 0.15 },
    approvalLikelihood: 'High for ADU — duplex/split subject to local zoning',
  },
  RI: {
    name: 'Rhode Island',
    law: 'Multiple laws (2021–2025)',
    summary: 'Nearly 50 housing laws streamlining permitting and requiring diverse housing types statewide.',
    allowsDuplex: true,
    allowsLotSplit: false,
    allowsBoth: false,
    maxUnits: 3,
    minLotSizeSqft: 1500,
    minLotSizeOriginal: 3000,
    lotSplitMinPct: null,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'hoa_prohibition',
    ],
    permitTimeline: '30–60 days',
    notes: 'Rhode Island has passed the most comprehensive housing reform package in the US. Permitting is streamlined and electronic review is mandatory.',
    valueUplift: { duplex: 0.18, lotSplit: 0, both: 0 },
    approvalLikelihood: 'High — strong state framework',
  },
  CT: {
    name: 'Connecticut',
    law: 'Various (2023)',
    summary: 'Multifamily housing required near transit corridors. ADU reform statewide.',
    allowsDuplex: true,
    allowsLotSplit: false,
    allowsBoth: false,
    maxUnits: 2,
    minLotSizeSqft: 1500,
    minLotSizeOriginal: 3000,
    lotSplitMinPct: null,
    ownerOccupyRequired: false,
    disqualifiers: [
      'historic_district',
      'flood_zone',
      'outside_transit_corridor',
      'hoa_prohibition',
    ],
    permitTimeline: '45–90 days',
    notes: 'Strongest density rights are near transit. Properties outside transit corridors may face local discretionary review.',
    valueUplift: { duplex: 0.16, lotSplit: 0, both: 0 },
    approvalLikelihood: 'Medium — varies significantly by proximity to transit',
  },
};

// States with no statewide reform — return informational response
const REFORM_STATES = new Set(Object.keys(STATE_LAWS));

// ── Extract state code from address ──────────────────────────────────────────
function extractState(address) {
  const m = address.match(/,\s*([A-Z]{2})\s*(\d{5})?$/);
  if (m) return m[1];
  // Full state name fallback
  const STATE_NAMES = {
    'California':'CA','Oregon':'OR','Washington':'WA','Montana':'MT',
    'Vermont':'VT','Maine':'ME','Colorado':'CO','Rhode Island':'RI','Connecticut':'CT',
  };
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (address.includes(name)) return code;
  }
  return null;
}

// ── Geocode via Nominatim ─────────────────────────────────────────────────────
async function geocodeAddress(address) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      {
        headers: { 'User-Agent': 'PermitSuite/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch { return null; }
}

// ── AI-powered property eligibility check ────────────────────────────────────
async function checkPropertyEligibility(address, stateCode, stateLaw) {
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
      system: 'You are a property eligibility analyst. Output ONLY raw JSON — no markdown, no prose.',
      messages: [{ role: 'user', content:
        `Research this property for ${stateLaw} eligibility: "${address}"\n` +
        `Search for:\n` +
        `1. Is it in a historic district or landmark area?\n` +
        `2. Is it in a fire hazard severity zone (California: FHSZ)?\n` +
        `3. Is it in a FEMA flood zone (Zone A or V)?\n` +
        `4. Is it in a coastal zone or earthquake fault zone?\n` +
        `5. Any known HOA that might prohibit development?\n` +
        `6. Current zoning designation\n` +
        `7. Approximate lot size if findable\n` +
        `Output ONLY this JSON:\n` +
        `{\n` +
        `  "zoning": "zoning code or null",\n` +
        `  "lotSizeSqft": number or null,\n` +
        `  "historicDistrict": true/false/null,\n` +
        `  "fireHazardZone": true/false/null,\n` +
        `  "floodZone": true/false/null,\n` +
        `  "coastalZone": true/false/null,\n` +
        `  "earthquakeFaultZone": true/false/null,\n` +
        `  "hoaLikely": true/false/null,\n` +
        `  "currentUnits": number or null,\n` +
        `  "confidence": "high"/"medium"/"low",\n` +
        `  "sources": ["url1", "url2"]\n` +
        `}`
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = (data?.content || [])
    .filter(b => b.type === 'text').map(b => b.text).join('').trim()
    .replace(/```json|```/g, '');
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
  }
}

// ── Determine which options are available ─────────────────────────────────────
function determineOptions(stateLaw, propertyData, lotSizeSqft) {
  const options = [];
  const disqualified = [];

  const lot = lotSizeSqft || propertyData?.lotSizeSqft || null;

  // Check disqualifiers
  if (propertyData?.historicDistrict) disqualified.push({ reason: 'Historic district', detail: 'Properties in historic districts are exempt from most state zoning reform laws.' });
  if (propertyData?.fireHazardZone && stateLaw.disqualifiers.includes('fire_hazard_zone')) disqualified.push({ reason: 'Fire hazard zone', detail: 'High and Very High Fire Hazard Severity Zones are exempt under SB 9.' });
  if (propertyData?.floodZone) disqualified.push({ reason: 'FEMA flood zone', detail: 'Properties in FEMA Zone A or V flood areas may be ineligible.' });
  if (propertyData?.coastalZone && stateLaw.disqualifiers.includes('coastal_zone')) disqualified.push({ reason: 'Coastal zone', detail: 'California Coastal Commission jurisdiction may limit SB 9 rights.' });
  if (propertyData?.earthquakeFaultZone && stateLaw.disqualifiers.includes('earthquake_fault_zone')) disqualified.push({ reason: 'Earthquake fault zone', detail: 'Alquist-Priolo fault zones are exempt from SB 9.' });
  if (propertyData?.hoaLikely) disqualified.push({ reason: 'HOA restrictions', detail: 'HOA CC&Rs may prohibit lot splits or additional units — verify with HOA documents.' });
  if (lot && lot < stateLaw.minLotSizeOriginal) disqualified.push({ reason: 'Lot too small', detail: `Minimum lot size for this state law is ${stateLaw.minLotSizeOriginal.toLocaleString()} sqft. Estimated lot: ${lot.toLocaleString()} sqft.` });
  if (propertyData?.currentUnits > 1) disqualified.push({ reason: 'Not single-family', detail: 'State lot split/duplex laws generally apply to single-family zoned parcels only.' });

  const isEligible = disqualified.length === 0;

  if (isEligible) {
    if (stateLaw.allowsDuplex) {
      options.push({
        type: 'duplex',
        title: 'Build a duplex',
        description: `Convert or rebuild as a duplex on the existing lot. Allows up to 2 primary units${stateLaw.maxUnits > 2 ? ' plus ADUs' : ''}.`,
        maxUnits: 2,
        estimatedCost: '$180,000–$420,000',
        timeline: stateLaw.permitTimeline,
        valueUplift: stateLaw.valueUplift.duplex,
        rentalIncome: '$2,000–$4,500/mo (second unit)',
        approvalLikelihood: stateLaw.approvalLikelihood,
      });
    }
    if (stateLaw.allowsLotSplit && lot && lot >= stateLaw.minLotSizeOriginal) {
      options.push({
        type: 'lotSplit',
        title: 'Lot split',
        description: `Divide the parcel into two lots. Each resulting lot can have its own dwelling unit. Can sell one lot separately.`,
        maxUnits: 2,
        estimatedCost: '$20,000–$60,000 (split only)',
        timeline: stateLaw.permitTimeline,
        valueUplift: stateLaw.valueUplift.lotSplit,
        rentalIncome: 'Lot sale value depends on local market',
        approvalLikelihood: stateLaw.approvalLikelihood,
      });
    }
    if (stateLaw.allowsBoth && lot && lot >= stateLaw.minLotSizeOriginal * 2) {
      options.push({
        type: 'both',
        title: 'Lot split + duplex on each parcel',
        description: `Split the lot and build a duplex on each parcel — up to ${stateLaw.maxUnits} total units on the original lot. Maximum value extraction.`,
        maxUnits: stateLaw.maxUnits,
        estimatedCost: '$400,000–$900,000',
        timeline: `${stateLaw.permitTimeline} (sequential permits)`,
        valueUplift: stateLaw.valueUplift.both,
        rentalIncome: '$4,000–$9,000/mo (3 additional units)',
        approvalLikelihood: stateLaw.approvalLikelihood,
      });
    }
  }

  return { isEligible, disqualified, options };
}

// ── Approval likelihood score ─────────────────────────────────────────────────
async function fetchApprovalLikelihood(address, stateCode, optionType) {
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
      system: 'You are a permit approval analyst. Output ONLY raw JSON.',
      messages: [{ role: 'user', content:
        `Research local permit approval rates and city compliance for: "${address}"\n` +
        `Specifically for: ${optionType} under state zoning reform law\n` +
        `Search for recent permit approvals, city compliance record, local opposition.\n` +
        `Output ONLY:\n` +
        `{\n` +
        `  "likelihoodPct": 0-100,\n` +
        `  "rating": "Very High"/"High"/"Medium"/"Low",\n` +
        `  "factors": ["positive factor 1", "negative factor 1"],\n` +
        `  "localNotes": "1-2 sentence local context"\n` +
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'lot/eligibility' });
  if (authErr) return authError(res, authErr);

  const { address } = req.body || {};
  if (!address || typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'address is required' });
  }

  const addr = address.trim();

  try {
    // 1. Detect state
    const stateCode = extractState(addr);
    if (!stateCode) {
      return res.status(400).json({ error: 'Could not detect state from address. Include state abbreviation e.g. CA, OR, WA.' });
    }

    // 2. Check if state has reform law
    if (!REFORM_STATES.has(stateCode)) {
      return res.status(200).json({
        address: addr,
        stateCode,
        hasReformLaw: false,
        message: `${stateCode} does not currently have a statewide lot split or duplex-by-right law. Check local zoning or ADU ordinances — many cities have their own programs.`,
        isEligible: false,
        options: [],
        disqualified: [],
        propertyData: null,
        stateLaw: null,
      });
    }

    const stateLaw = STATE_LAWS[stateCode];

    // 3. Geocode
    const coords = await geocodeAddress(addr);

    // 4. AI property eligibility check (parallel with geocode)
    const propertyData = await checkPropertyEligibility(addr, stateCode, stateLaw.law);

    // 5. Determine options
    const { isEligible, disqualified, options } = determineOptions(
      stateLaw,
      propertyData,
      propertyData?.lotSizeSqft || null
    );

    // 6. Fetch approval likelihood for each option (parallel)
    const optionsWithLikelihood = await Promise.all(
      options.map(async opt => {
        const likelihood = await fetchApprovalLikelihood(addr, stateCode, opt.type).catch(() => null);
        return { ...opt, likelihood };
      })
    );

    return res.status(200).json({
      address: addr,
      stateCode,
      hasReformLaw: true,
      stateLaw: {
        name: stateLaw.law,
        summary: stateLaw.summary,
        maxUnits: stateLaw.maxUnits,
        ownerOccupyRequired: stateLaw.ownerOccupyRequired,
        ownerOccupyYears: stateLaw.ownerOccupyYears || null,
        notes: stateLaw.notes,
      },
      isEligible,
      disqualified,
      options: optionsWithLikelihood,
      propertyData,
      coords,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
