// ── Supabase direct browser calls — app_data schema ──────────────────────────
// Supabase anon key is safe to expose. RLS policies control access.
// These calls go directly from the browser (no proxy needed — CORS open).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const SCHEMA = "app_data";

console.log('SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('SUPABASE_KEY:', import.meta.env.VITE_SUPABASE_KEY);

const baseHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Accept-Profile': SCHEMA,
};

// Normalise address to a consistent lookup key
export function normalizeAddress(address) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Look up a property by address — returns cached row or null
export async function dbGetProperty(address) {
  const key = normalizeAddress(address);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_lookups?address_key=eq.${encodeURIComponent(key)}&order=looked_up_at.desc&limit=1`,
      { headers: baseHeaders }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) {
    console.error('[DB] GET property error:', e.message);
    return null;
  }
}

// Upsert a property lookup record
export async function dbUpsertProperty({ address, lastSalePrice, lastSaleMonth, lastSaleYear, saleSource, lookedUpBy }) {
  const key = normalizeAddress(address);
  const row = {
    address_key:      key,
    address_display:  address.trim(),
    last_sale_price:  lastSalePrice,
    last_sale_month:  lastSaleMonth,
    last_sale_year:   lastSaleYear,
    sale_source:      saleSource || null,
    looked_up_by:     lookedUpBy || 'anonymous',
    looked_up_at:     new Date().toISOString(),
  };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_lookups`,
      {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/json',
          'Content-Profile': SCHEMA,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(row),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[DB] UPSERT error:', err);
    } else {
      console.log('[DB] UPSERT success:', address);
    }
  } catch (e) {
    console.error('[DB] UPSERT error:', e.message);
  }
}
