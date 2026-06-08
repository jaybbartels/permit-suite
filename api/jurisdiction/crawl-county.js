// POST /api/jurisdiction/crawl-county
// Queries ArcGIS open data for county zoning info
// Currently supports: San Mateo County, CA
// Easily extensible — add more counties to COUNTY_CONFIGS

import { requireAuth, authError } from '../middleware/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SCHEMA = 'app_data';

const COUNTY_CONFIGS = {
  'San Mateo County_CA': {
    stateCode:  'CA',
    countyName: 'San Mateo County',
    arcgisBase: 'https://services1.arcgis.com/pcuEnFhPL2zPQflM/arcgis/rest/services',
    layers: {
      zoning: {
        url: 'https://services1.arcgis.com/pcuEnFhPL2zPQflM/arcgis/rest/services/Active_Planning_Zones/FeatureServer/0',
        fields: ['ZoningDistrict', 'ZoneDescription', 'ZoneType'],
        topic: 'zoning_districts',
      },
      parcels: {
        url: 'https://services1.arcgis.com/pcuEnFhPL2zPQflM/arcgis/rest/services/Parcels/FeatureServer/0',
        fields: ['APN', 'SitusAddress', 'LandUse', 'Acreage'],
        topic: 'parcel_layer',
      },
    },
    openDataPortal: 'https://data-smcmaps.opendata.arcgis.com/',
    notes: 'San Mateo County GIS open data — public domain, no restrictions',
  },
};

async function queryArcGIS(layerUrl, fields, where = '1=1', resultCount = 100) {
  const params = new URLSearchParams({
    where,
    outFields:       fields.join(','),
    returnGeometry:  'false',
    resultRecordCount: resultCount,
    f:               'json',
  });
  const res = await fetch(`${layerUrl}/query?${params}`, {
    headers: { 'User-Agent': 'PermitSuite/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ArcGIS error: ${res.status}`);
  return await res.json();
}

async function upsertJurisdictionCode({ level, stateCode, countyName, cityName, topic, content, sourceUrl }) {
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
      level,
      state_code:   stateCode,
      county_name:  countyName || null,
      city_name:    cityName || null,
      topic,
      content,
      source_url:   sourceUrl,
      source_type:  'api',
      fetched_at:   new Date().toISOString(),
      expires_at:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert error: ${err}`);
  }
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

  const { county, state } = body || {};
  const key = `${county}_${state}`;
  const config = COUNTY_CONFIGS[key];

  if (!config) {
    return res.status(400).json({
      error: `County not configured: ${county}, ${state}`,
      available: Object.keys(COUNTY_CONFIGS),
    });
  }

  const results = [];
  const errors  = [];

  for (const [layerName, layerConfig] of Object.entries(config.layers)) {
    try {
      // Query a sample to validate the layer is accessible
      const data = await queryArcGIS(layerConfig.url, layerConfig.fields, '1=1', 5);
      const features = data.features || [];
      const sample = features.map(f => f.attributes);

      await upsertJurisdictionCode({
        level:       'county',
        stateCode:   config.stateCode,
        countyName:  config.countyName,
        cityName:    null,
        topic:       layerConfig.topic,
        content: {
          layer_url:    layerConfig.url,
          fields:       layerConfig.fields,
          sample_count: features.length,
          sample_data:  sample,
          portal:       config.openDataPortal,
          notes:        config.notes,
          query_instructions: {
            by_point:    `${layerConfig.url}/query?geometry={"x":LNG,"y":LAT,"spatialReference":{"wkid":4326}}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`,
            by_apn:      layerName === 'parcels' ? `${layerConfig.url}/query?where=APN='XXXXXXXXX'&outFields=*&f=json` : null,
          },
        },
        sourceUrl: config.openDataPortal,
      });

      results.push({ layer: layerName, status: 'ok', recordsSampled: features.length });
    } catch (e) {
      errors.push({ layer: layerName, error: e.message });
    }
  }

  return res.status(200).json({
    county:  config.countyName,
    state:   config.stateCode,
    results,
    errors,
    message: errors.length === 0
      ? 'All layers crawled and cached successfully'
      : `${results.length} layers succeeded, ${errors.length} failed`,
  });
}
