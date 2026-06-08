import { requireAuth, authError } from '../middleware/auth.js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const baseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Accept-Profile': SCHEMA,
};

function normalizeAddress(address) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function dbGetPermits(address) {
  const key = normalizeAddress(address);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/property_permits?address_key=eq.${encodeURIComponent(key)}&limit=1`,
    { headers: baseHeaders }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  const row = rows[0];
  if (!row) return null;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (new Date(row.fetched_at) < thirtyDaysAgo) return null;
  return { permits: row.permits, fetchedAt: row.fetched_at, source: 'cache' };
}

async function dbUpsertPermits(address, permits) {
  const key = normalizeAddress(address);
  const row = {
    address_key: key,
    permits,
    fetched_at: new Date().toISOString(),
    fetched_by: 'api/permit/opportunities',
  };
  await fetch(`${SUPABASE_URL}/rest/v1/property_permits`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json',
      'Content-Profile': SCHEMA,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
}

async function fetchPermitsLive(address) {
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
      system: 'You are a data-extraction bot. Output ONLY raw JSON — no markdown, no prose.',
      messages: [{ role: 'user', content:
        `Search building permit records for: "${address}"\n` +
        `Check the official city/county open data permit portal.\n` +
        `Output ONLY a JSON array (max 10 items, newest first):\n` +
        `[{"number":"id","type":"type","description":"work","status":"status","filed":"YYYY-MM-DD","issued":"YYYY-MM-DD or null","completed":"YYYY-MM-DD or null","cost":"$X,XXX or null"}]\n` +
        `If none found: []`
      }],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/```json|```/g, '');
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr;
  } catch {}
  const m = text.match(/\[[\s\S]*\]/);
  try { return m ? JSON.parse(m[0]) : []; } catch { return []; }
}

const CATALOGUE = {
  'San Francisco': [
    { rank:1, category:'ADU/In-Law Unit',      title:'Build an ADU or in-law unit',         description:'San Francisco leads the state in ADU approvals. Strong rental demand and high property values make this the highest-ROI permit in the city.', valueImpact:'High',   effort:'High',   typicalCost:'$150,000–$350,000', permitTimeline:'3–6 months', localTrend:'Rising',  localPopularity:'Most permitted improvement in SF 2023–2024', roiNote:'ADUs in SF rent for $2,500–$4,500/mo' },
    { rank:2, category:'Seismic Retrofit',      title:'Soft-story seismic retrofit',          description:'SF mandates retrofits for soft-story buildings. Improves insurability and resale value significantly.',                                        valueImpact:'High',   effort:'Medium', typicalCost:'$60,000–$130,000',  permitTimeline:'2–4 months', localTrend:'Rising',  localPopularity:'City-mandated for qualifying buildings',      roiNote:'Required for many SF multifamily buildings' },
    { rank:3, category:'Solar Installation',    title:'Rooftop solar installation',           description:'California Title 24 requires solar on new construction. Retrofits qualify for 30% federal tax credit.',                                        valueImpact:'Medium', effort:'Low',    typicalCost:'$15,000–$30,000',   permitTimeline:'1–2 months', localTrend:'Stable',  localPopularity:'High adoption in SF residential',             roiNote:'Adds ~$15k to home value per NAR data' },
    { rank:4, category:'Kitchen Remodel',       title:'Full kitchen remodel',                 description:'SF buyers expect high-end finishes. Permitted kitchen remodels recover 70–80% of cost at resale.',                                             valueImpact:'Medium', effort:'Medium', typicalCost:'$40,000–$120,000',  permitTimeline:'1–3 months', localTrend:'Stable',  localPopularity:'Top remodel category in SF',                  roiNote:'70–80% cost recovery at resale' },
    { rank:5, category:'Electrical Upgrade',    title:'Electrical panel upgrade to 200A',     description:'Older SF homes often have 60–100A panels. Upgrading is required for EV chargers and heat pumps.',                                              valueImpact:'Medium', effort:'Low',    typicalCost:'$8,000–$18,000',    permitTimeline:'2–6 weeks',  localTrend:'Rising',  localPopularity:'Driven by EV adoption in SF',                 roiNote:'Prerequisite for EV charger and heat pump' },
    { rank:6, category:'Bathroom Addition',     title:'Add a full bathroom',                  description:'Adding a bathroom to a 1-bath SF home can add significant value in a market where buyers prioritize bedroom/bath count.',                      valueImpact:'High',   effort:'High',   typicalCost:'$30,000–$75,000',   permitTimeline:'2–4 months', localTrend:'Stable',  localPopularity:'High value-add in SF market',                 roiNote:'Can add $50k–$150k in SF market' },
    { rank:7, category:'EV Charger',            title:'Install Level 2 EV charger',           description:'SF has one of the highest EV ownership rates in the US. A permitted 240V EVSE is increasingly expected by buyers.',                            valueImpact:'Low',    effort:'Low',    typicalCost:'$1,500–$4,000',     permitTimeline:'1–3 weeks',  localTrend:'Rising',  localPopularity:'Fast-growing permit category in SF',          roiNote:'Low cost, high buyer expectation' },
    { rank:8, category:'Roof Replacement',      title:'Full roof replacement',                description:'SF fog and rain accelerate roof wear. A documented roof replacement improves insurability and buyer confidence.',                               valueImpact:'Medium', effort:'Medium', typicalCost:'$15,000–$40,000',   permitTimeline:'2–6 weeks',  localTrend:'Stable',  localPopularity:'Common maintenance permit in SF',             roiNote:'Prevents buyer credits at escrow' },
  ],
  Miami: [
    { rank:1, category:'Hurricane Impact Windows', title:'Hurricane impact window & door replacement', description:'Miami-Dade County requires impact-rated openings. Reduces insurance premiums by 20–45% and is required for most permits.',              valueImpact:'High',   effort:'Medium', typicalCost:'$15,000–$60,000',   permitTimeline:'4–8 weeks',  localTrend:'Rising',  localPopularity:'#1 permitted improvement in Miami-Dade',      roiNote:'Insurance savings of $2,000–$8,000/yr' },
    { rank:2, category:'Roof Replacement',      title:'Flat or tile roof replacement',        description:'Miami insurance carriers require roofs under 15 years old for coverage. New roof can reduce premium by 30–50%.',                               valueImpact:'High',   effort:'Medium', typicalCost:'$18,000–$55,000',   permitTimeline:'4–8 weeks',  localTrend:'Rising',  localPopularity:'Insurance-driven, very high permit volume',   roiNote:'Often required to obtain/renew homeowner insurance' },
    { rank:3, category:'ADU/In-Law Unit',       title:'Build a garage apartment or guest suite', description:'Miami ADU rules relaxed in 2023. Strong short-term rental market (Airbnb/VRBO) drives high ROI.',                                         valueImpact:'High',   effort:'High',   typicalCost:'$80,000–$200,000',  permitTimeline:'3–5 months', localTrend:'Rising',  localPopularity:'Growing rapidly post-2023 zoning changes',    roiNote:'STR income potential $2,000–$5,000/mo' },
    { rank:4, category:'Pool/Spa',              title:'Install a pool or spa',                description:'Miami pools are a standard amenity. Homes with pools sell faster and at a premium in this market.',                                            valueImpact:'Medium', effort:'High',   typicalCost:'$40,000–$100,000',  permitTimeline:'2–4 months', localTrend:'Stable',  localPopularity:'High demand in Miami residential market',     roiNote:'Adds $20k–$50k to Miami home value' },
    { rank:5, category:'HVAC Upgrade',          title:'High-efficiency AC system replacement', description:'Miami HVAC systems work year-round. High-efficiency units reduce energy bills by 20–40% and are required at end of life.',                   valueImpact:'Medium', effort:'Low',    typicalCost:'$8,000–$20,000',    permitTimeline:'2–4 weeks',  localTrend:'Stable',  localPopularity:'Very high permit volume — systems wear fast',  roiNote:'Reduces $200–$400/mo energy bills' },
    { rank:6, category:'Kitchen Remodel',       title:'Full kitchen remodel',                 description:'Miami buyers expect modern finishes. Permitted remodels recover well in a competitive resale market.',                                         valueImpact:'Medium', effort:'Medium', typicalCost:'$35,000–$100,000',  permitTimeline:'1–3 months', localTrend:'Stable',  localPopularity:'Consistent top-5 permit category in Miami',   roiNote:'70–80% cost recovery at resale' },
    { rank:7, category:'Solar Installation',    title:'Rooftop solar installation',           description:'Florida net metering and 30% federal tax credit make solar attractive. Miami has 265+ sunny days per year.',                                   valueImpact:'Medium', effort:'Low',    typicalCost:'$15,000–$28,000',   permitTimeline:'1–2 months', localTrend:'Rising',  localPopularity:'Growing in Miami-Dade residential',           roiNote:'$1,200–$2,400/yr energy savings' },
    { rank:8, category:'Deck/Patio',            title:'Covered patio or outdoor kitchen',     description:'Miami outdoor living spaces extend usable square footage year-round. Permitted structures add value and are required by code.',                 valueImpact:'Medium', effort:'Medium', typicalCost:'$15,000–$60,000',   permitTimeline:'4–8 weeks',  localTrend:'Stable',  localPopularity:'High demand for outdoor living in Miami',     roiNote:'Adds $15k–$40k to Miami home value' },
  ],
  National: [
    { rank:1, category:'ADU/In-Law Unit',       title:'Build an ADU or in-law unit',         description:'ADUs are the fastest-growing permit category nationally. Strong rental income potential and significant value addition.',                       valueImpact:'High',   effort:'High',   typicalCost:'$100,000–$300,000', permitTimeline:'3–6 months', localTrend:'Rising',  localPopularity:'Fastest-growing permit nationally',           roiNote:'Rental income potential $1,000–$3,000/mo' },
    { rank:2, category:'Kitchen Remodel',       title:'Full kitchen remodel',                description:'Kitchen remodels consistently rank as the highest-ROI interior improvement nationally, recovering 70–80% of cost.',                             valueImpact:'High',   effort:'Medium', typicalCost:'$25,000–$80,000',   permitTimeline:'1–3 months', localTrend:'Stable',  localPopularity:'#1 remodel category nationally',              roiNote:'70–80% cost recovery nationally' },
    { rank:3, category:'Bathroom Addition',     title:'Add a full bathroom',                  description:'Adding a bathroom to a home with only one full bath is one of the highest-value improvements in most markets.',                                valueImpact:'High',   effort:'Medium', typicalCost:'$20,000–$55,000',   permitTimeline:'1–3 months', localTrend:'Stable',  localPopularity:'Consistent top permit category nationally',   roiNote:'Can add $20k–$50k nationally' },
    { rank:4, category:'Solar Installation',    title:'Rooftop solar installation',           description:'30% federal tax credit available through 2032. Adds value and reduces energy costs in most US markets.',                                       valueImpact:'Medium', effort:'Low',    typicalCost:'$15,000–$30,000',   permitTimeline:'1–2 months', localTrend:'Rising',  localPopularity:'Growing in all US markets',                   roiNote:'$1,000–$2,000/yr average energy savings' },
    { rank:5, category:'Deck/Patio',            title:'Add a deck or patio',                  description:'Outdoor living spaces have surged in popularity post-pandemic. Wood decks recover 65–70% of cost nationally.',                                 valueImpact:'Medium', effort:'Medium', typicalCost:'$10,000–$35,000',   permitTimeline:'4–8 weeks',  localTrend:'Stable',  localPopularity:'Top-5 permit category nationally',            roiNote:'65–70% cost recovery nationally' },
    { rank:6, category:'Electrical Upgrade',    title:'Electrical panel upgrade to 200A',     description:'Required for EV chargers, heat pumps, and modern appliances. Increases marketability significantly.',                                          valueImpact:'Medium', effort:'Low',    typicalCost:'$4,000–$12,000',    permitTimeline:'2–6 weeks',  localTrend:'Rising',  localPopularity:'Rising with EV and heat pump adoption',       roiNote:'Prerequisite for EV charger and heat pump' },
    { rank:7, category:'HVAC Upgrade',          title:'High-efficiency HVAC replacement',     description:'Aging HVAC systems are a top buyer concern. High-efficiency replacements reduce bills and improve indoor air quality.',                         valueImpact:'Medium', effort:'Low',    typicalCost:'$6,000–$16,000',    permitTimeline:'1–4 weeks',  localTrend:'Stable',  localPopularity:'Very high permit volume nationally',          roiNote:'Reduces energy bills by 20–40%' },
    { rank:8, category:'Garage Conversion',     title:'Convert garage to living space',       description:'Adds permitted square footage without expanding the footprint. High value-per-dollar in markets with high price/sqft.',                        valueImpact:'Medium', effort:'Medium', typicalCost:'$20,000–$60,000',   permitTimeline:'2–4 months', localTrend:'Stable',  localPopularity:'Growing nationally as ADU-lite option',       roiNote:'Value depends heavily on local $/sqft' },
  ],
};

function detectCity(address) {
  const a = address.toLowerCase();
  if (a.includes('san francisco') || a.includes(', sf,') || a.includes(', ca 94')) return 'San Francisco';
  if (a.includes('miami') || a.includes(', fl 33')) return 'Miami';
  return 'National';
}

const CATEGORY_KEYWORDS = {
  'ADU/In-Law Unit':      ['adu','accessory dwelling','in-law','inlaw','junior unit','jadu','garage conversion to dwelling','backyard cottage'],
  'Seismic Retrofit':     ['seismic','soft-story','softstory','earthquake'],
  'Solar Installation':   ['solar','photovoltaic','pv system'],
  'Kitchen Remodel':      ['kitchen'],
  'Bathroom Addition':    ['bathroom','bath addition','new bath','add bath'],
  'Electrical Upgrade':   ['electrical service upgrade','panel upgrade','200 amp','new service','service change'],
  'EV Charger':           ['ev charger','electric vehicle','evse','charging station'],
  'Roof Replacement':     ['roof replacement','reroof','new roof'],
  'Window Replacement':   ['window replacement','replace windows','new windows'],
  'HVAC Upgrade':         ['hvac replacement','furnace replacement','new hvac','heat pump','ac replacement','new ac'],
  'Deck/Patio':           ['deck','patio addition','new patio'],
  'Garage Conversion':    ['garage conversion','convert garage','garage to adu'],
  'Room Addition':        ['room addition','new addition','building addition','square footage addition'],
  'Pool/Spa':             ['pool','swimming pool','spa permit'],
  'Hurricane Impact Windows': ['impact window','hurricane window','impact door','hurricane door'],
};

function fetchPermitOpportunities(address, existingPermits) {
  const cityKey = detectCity(address);
  const catalogue = CATALOGUE[cityKey] || CATALOGUE.National;
  const existingArr = (existingPermits || []).map(p => (p.type || '').toLowerCase());
  const existingDesc = (existingPermits || []).map(p => (p.description || '').toLowerCase());
  const allExisting = [...existingArr, ...existingDesc];
  return catalogue
    .filter(opp => {
      const keywords = CATEGORY_KEYWORDS[opp.category] || [];
      return !allExisting.some(et => keywords.some(kw => et.includes(kw)));
    })
    .slice(0, 8);
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free', endpoint: 'permit/opportunities' });
  if (authErr) return authError(res, authErr);

  const { address } = req.body || {};
  if (!address || typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'address is required' });
  }

  const addr = address.trim();

  try {
    // 1. Check Supabase cache
    let permits = [];
    let permitsSource = 'live';
    let permitsFetchedAt = null;

    const cached = await dbGetPermits(addr);
    if (cached) {
      permits = cached.permits;
      permitsSource = 'cache';
      permitsFetchedAt = cached.fetchedAt;
    } else {
      // 2. Fetch live
      permits = await fetchPermitsLive(addr);
      permitsFetchedAt = new Date().toISOString();
      // 3. Write back to cache
      if (permits.length > 0) {
        await dbUpsertPermits(addr, permits);
      }
    }

    // 4. Generate opportunities
    const opportunities = fetchPermitOpportunities(addr, permits);

    return res.status(200).json({
      permits,
      opportunities,
      permitsSource,
      permitsFetchedAt,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
