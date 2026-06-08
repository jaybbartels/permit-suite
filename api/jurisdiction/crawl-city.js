// POST /api/jurisdiction/crawl-city
// Crawls city municipal code websites via Anthropic web search
// Stores structured permit guidance per city
// Currently configured: Woodside CA

import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const CITY_CONFIGS = {
  'Woodside_CA': {
    stateCode:   'CA',
    countyName:  'San Mateo County',
    cityName:    'Woodside',
    codeUrl:     'https://www.woodsideca.gov/municipal-code',
    permitUrl:   'https://www.woodsideca.gov/393/Permits',
    portalUrl:   'https://wood.csqrcloud.com/community-etrakit/',
    topics: [
      {
        topic: 'adu_rules',
        searchQuery: 'site:woodsideca.gov ADU accessory dwelling unit requirements setbacks height',
        description: 'ADU requirements under Woodside Municipal Code',
      },
      {
        topic: 'setback_requirements',
        searchQuery: 'site:woodsideca.gov setback requirements residential zoning districts',
        description: 'Setback requirements by zoning district',
      },
      {
        topic: 'permit_fees',
        searchQuery: 'site:woodsideca.gov building permit fees schedule 2024 2025',
        description: 'Current permit fee schedule',
      },
      {
        topic: 'fire_hazard_zones',
        searchQuery: 'Woodside CA fire hazard severity zone FHSZ map 2024',
        description: 'Fire Hazard Severity Zone boundaries in Woodside',
      },
    ],
  },
};

async function crawlWithAI(query, topic) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a municipal code research assistant. Extract structured information from official government websites. Output ONLY raw JSON.',
      messages: [{
        role: 'user',
        content:
          `Search for: ${query}\n\n` +
          `Extract the key rules, requirements, and any specific numbers (fees, dimensions, distances).\n` +
          `Output ONLY this JSON:\n` +
          `{\n` +
          `  "summary": "2-3 sentence summary",\n` +
          `  "key_rules": ["rule 1", "rule 2"],\n` +
          `  "specific_values": {"key": "value"},\n` +
          `  "source_urls": ["url1"],\n` +
          `  "last_updated": "date or null",\n` +
          `  "confidence": "high|medium|low"\n` +
          `}`,
      }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter(b => b.type === 'text').map(b => b.text).join('').trim()
    .replace(/```json|```/g, '');

  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
  }
}

async function upsertJurisdictionCode({ stateCode, countyName, cityName, topic, content, sourceUrl }) {
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
      level:       'city',
      state_code:  stateCode,
      county_name: countyName,
      city_name:   cityName,
      topic,
      content,
      source_url:  sourceUrl,
      source_type: 'ai_search',
      fetched_at:  new Date().toISOString(),
      expires_at:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

  const { city, state } = body || {};
  const key = `${city}_${state}`;
  const config = CITY_CONFIGS[key];

  if (!config) {
    return res.status(400).json({
      error: `City not configured: ${city}, ${state}`,
      available: Object.keys(CITY_CONFIGS),
    });
  }

  const results = [];
  const errors  = [];

  for (const topicConfig of config.topics) {
    try {
      const crawled = await crawlWithAI(topicConfig.searchQuery, topicConfig.topic);

      await upsertJurisdictionCode({
        stateCode:  config.stateCode,
        countyName: config.countyName,
        cityName:   config.cityName,
        topic:      topicConfig.topic,
        content: {
          description: topicConfig.description,
          codeUrl:     config.codeUrl,
          permitUrl:   config.permitUrl,
          portalUrl:   config.portalUrl,
          ...(crawled || {}),
        },
        sourceUrl: config.codeUrl,
      });

      results.push({ topic: topicConfig.topic, status: 'ok', confidence: crawled?.confidence });
    } catch (e) {
      errors.push({ topic: topicConfig.topic, error: e.message });
    }
  }

  return res.status(200).json({
    city:    config.cityName,
    state:   config.stateCode,
    results,
    errors,
    message: errors.length === 0
      ? 'All city code topics crawled and cached'
      : `${results.length} succeeded, ${errors.length} failed`,
  });
}
