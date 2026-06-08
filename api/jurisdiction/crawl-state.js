// POST /api/jurisdiction/crawl-state
// Fetches state building code metadata from ICC Digital Codes and UpCodes
// Supports: CA, OR — easily extensible

import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const STATE_CONFIGS = {
  CA: {
    name: 'California',
    codes: [
      {
        topic:   'building_code',
        name:    'California Building Standards Code (Title 24)',
        edition: '2025',
        iccUrl:  'https://codes.iccsafe.org/content/CABC2025P1',
        upcodesUrl: 'https://up.codes/codes/california',
        freeAccess: true,
        relevantChapters: {
          'ADU':        ['Chapter 4 Special Detailed Requirements', 'Appendix Q Tiny Houses'],
          'Kitchen':    ['Chapter 4', 'Chapter 11 Accessibility'],
          'Bathroom':   ['Chapter 4', 'Chapter 29 Plumbing'],
          'Electrical': ['Chapter 27 Electrical'],
          'Structural': ['Chapter 16 Structural Design', 'Chapter 23 Wood'],
          'Solar':      ['Chapter 16', 'Title 24 Part 6 Energy'],
          'HVAC':       ['Chapter 28 Mechanical', 'Title 24 Part 6 Energy'],
        },
        nextEdition: '2028',
        notes: 'Free public access via ICC Digital Codes and UpCodes. Legally public domain as enacted law.',
      },
      {
        topic:   'zoning_reform',
        name:    'SB 9 — California Home Act (2022)',
        edition: '2022',
        url:     'https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202120220SB9',
        freeAccess: true,
        applies_to: 'Single-family zoned parcels statewide',
        allows: ['duplex', 'lot_split', 'duplex_on_each_split_lot'],
        maxUnits: 4,
        ownerOccupyRequired: true,
        ownerOccupyYears: 3,
        disqualifiers: ['historic_district', 'fire_hazard_zone', 'flood_zone',
                        'earthquake_fault_zone', 'coastal_zone'],
        agGuidanceUrl: 'https://oag.ca.gov/news/press-releases/attorney-general-bonta-issues-guidance-sb-9',
        notes: 'Ministerial approval only — no discretionary review or public hearing required.',
      },
      {
        topic:   'adu_law',
        name:    'California ADU Law (AB 2221 + SB 897, 2023)',
        edition: '2023',
        url:     'https://www.hcd.ca.gov/policy-research/accessory-dwelling-units',
        freeAccess: true,
        applies_to: 'All residential zoned parcels statewide',
        minLotSize: null,
        maxAdus: 2,
        permitTimeline: '60 days ministerial',
        notes: 'Local agencies cannot impose design standards that physically preclude construction.',
      },
    ],
    stateBuildingAgency: 'California Building Standards Commission',
    agencyUrl: 'https://www.dgs.ca.gov/BSC',
  },
  OR: {
    name: 'Oregon',
    codes: [
      {
        topic:   'building_code',
        name:    'Oregon Residential Specialty Code',
        edition: '2023',
        url:     'https://www.oregon.gov/bcd/codes-stand/pages/or-codes.aspx',
        freeAccess: true,
        relevantChapters: {
          'ADU':        ['Chapter 3 Building Planning', 'Appendix Q'],
          'Structural': ['Chapter 6 Wall Construction', 'Chapter 8 Roof-Ceiling Construction'],
          'Electrical': ['Chapter 36 Electrical'],
          'Plumbing':   ['Chapter 25 Plumbing'],
        },
        nextEdition: '2026',
        notes: 'Oregon Building Codes Division — free public access.',
      },
      {
        topic:   'zoning_reform',
        name:    'Oregon HB 2001 (2019) + SB 458 (2021)',
        edition: '2021',
        url:     'https://www.oregon.gov/lcd/UP/Pages/Housing-Choices.aspx',
        freeAccess: true,
        applies_to: 'All residential zones statewide',
        allows: ['duplex', 'lot_split'],
        maxUnits: 4,
        ownerOccupyRequired: false,
        disqualifiers: ['historic_district', 'flood_zone'],
        notes: 'Cities 25k+ must allow triplexes and fourplexes. Fee-simple lot splits for new duplexes under SB 458.',
      },
    ],
    stateBuildingAgency: 'Oregon Building Codes Division',
    agencyUrl: 'https://www.oregon.gov/bcd',
  },
};

async function fetchCodeMetadata(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PermitSuite/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    return { accessible: res.ok, status: res.status };
  } catch (e) {
    return { accessible: false, error: e.message };
  }
}

async function upsertJurisdictionCode({ stateCode, topic, content, sourceUrl }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jurisdiction_codes`, {
    method: 'POST',
    headers: {
      'apikey':          SUPABASE_KEY,
      'Authorization':   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':    'application/json',
      'Content-Profile': SCHEMA,
      'Prefer':          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      level:       'state',
      state_code:  stateCode,
      county_name: null,
      city_name:   null,
      topic,
      content,
      source_url:  sourceUrl,
      source_type: 'api',
      fetched_at:  new Date().toISOString(),
      expires_at:  new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);
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

  const { error: authErr } = await requireAuth(req, { minRole: 'free' });
  if (authErr) return authError(res, authErr);

  let body = req.body;
  if (!body) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; }
  }

  const { states } = body || {};
  const statesToCrawl = states || Object.keys(STATE_CONFIGS);
  const results = [];
  const errors  = [];

  for (const stateCode of statesToCrawl) {
    const config = STATE_CONFIGS[stateCode];
    if (!config) {
      errors.push({ state: stateCode, error: 'State not configured' });
      continue;
    }

    for (const code of config.codes) {
      try {
        // Verify URL is accessible
        const urlCheck = await fetchCodeMetadata(code.url || code.iccUrl);

        await upsertJurisdictionCode({
          stateCode,
          topic:     code.topic,
          content: {
            ...code,
            stateName:      config.name,
            agencyName:     config.stateBuildingAgency,
            agencyUrl:      config.agencyUrl,
            urlAccessible:  urlCheck.accessible,
            urlStatus:      urlCheck.status,
          },
          sourceUrl: code.url || code.iccUrl,
        });

        results.push({ state: stateCode, topic: code.topic, status: 'ok', urlAccessible: urlCheck.accessible });
      } catch (e) {
        errors.push({ state: stateCode, topic: code.topic, error: e.message });
      }
    }
  }

  return res.status(200).json({
    statesCrawled: statesToCrawl,
    results,
    errors,
    message: errors.length === 0
      ? 'All state codes cached successfully'
      : `${results.length} succeeded, ${errors.length} failed`,
  });
}
