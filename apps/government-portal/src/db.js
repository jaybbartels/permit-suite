// ── Supabase direct browser calls — app_data schema ──────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const SCHEMA = "app_data";

function getAuthHeaders() {
  try {
    const session = JSON.parse(localStorage.getItem("hvp_session") || "{}");
    const token = session?.access_token || SUPABASE_KEY;
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': SCHEMA,
    };
  } catch {
    return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept-Profile': SCHEMA };
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────
export async function dbGetQueue({ status, city } = {}) {
  const headers = getAuthHeaders();
  let url = `${SUPABASE_URL}/rest/v1/permit_applications?status=neq.draft&order=submitted_at.asc`;
  if (status) url += `&status=eq.${status}`;
  if (city) url += `&city=eq.${city}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) { console.error('[DB] Queue error:', await res.text()); return []; }
    return await res.json();
  } catch (e) { console.error('[DB] Queue error:', e.message); return []; }
}

// ── Single application ────────────────────────────────────────────────────────
export async function dbGetApplication(id) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/permit_applications?id=eq.${id}&limit=1`, { headers });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] Get app error:', e.message); return null; }
}

// ── Update status ─────────────────────────────────────────────────────────────
export async function dbUpdateApplicationStatus(id, status) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_applications?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      }
    );
    if (!res.ok) console.error('[DB] Status update error:', await res.text());
    else console.log('[DB] Status updated:', id, status);
  } catch (e) { console.error('[DB] Status update error:', e.message); }
}

// ── Comments ──────────────────────────────────────────────────────────────────
export async function dbGetComments(applicationId) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_comments?application_id=eq.${applicationId}&order=created_at.asc`,
      { headers }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (e) { console.error('[DB] Comments error:', e.message); return []; }
}

export async function dbPostComment({ applicationId, authorId, authorRole, authorName, content, isCorrection, isInternal }) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_comments`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          application_id: applicationId,
          author_id: authorId,
          author_role: authorRole,
          author_name: authorName,
          content,
          is_correction_request: isCorrection || false,
          is_internal: isInternal || false,
        }),
      }
    );
    if (!res.ok) { console.error('[DB] Post comment error:', await res.text()); return null; }
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] Post comment error:', e.message); return null; }
}

// ── AI Reviews ────────────────────────────────────────────────────────────────
export async function dbGetAIReview(applicationId) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_reviews?application_id=eq.${applicationId}&order=reviewed_at.desc&limit=1`,
      { headers }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] AI review get error:', e.message); return null; }
}

export async function dbSaveAIReview({ applicationId, userId, review }) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_reviews`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          application_id: applicationId,
          triggered_by: userId,
          completeness_score: review.completeness_score,
          compliance_flags: review.compliance_flags,
          history_conflicts: review.history_conflicts,
          similar_precedents: review.similar_precedents,
          recommendation: review.recommendation,
          confidence_score: review.confidence_score,
          raw_output: JSON.stringify(review),
        }),
      }
    );
    if (!res.ok) { console.error('[DB] AI review save error:', await res.text()); return null; }
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] AI review save error:', e.message); return null; }
}

// ── Property History ──────────────────────────────────────────────────────────
export async function dbGetPropertyHistory(addressKey) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_history?address_key=eq.${encodeURIComponent(addressKey)}&order=issued_date.desc`,
      { headers }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (e) { console.error('[DB] Property history get error:', e.message); return []; }
}

export async function dbSavePropertyHistory(addressKey, apn, permits) {
  const headers = getAuthHeaders();
  try {
    const rows = permits.map(p => ({
      address_key: addressKey,
      apn: apn || null,
      permit_number: p.permit_number || null,
      permit_type: p.permit_type || null,
      description: p.description || null,
      status: p.status || null,
      issued_date: p.issued_date || null,
      completed_date: p.completed_date || null,
      valuation: p.valuation || null,
      source: "web_search",
    }));
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/property_history`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) console.error('[DB] Property history save error:', await res.text());
    else console.log('[DB] Property history saved:', rows.length, 'records');
  } catch (e) { console.error('[DB] Property history save error:', e.message); }
}

// ── Code Lookups ──────────────────────────────────────────────────────────────
export async function dbGetCodeLookup(cityId, topic, jurisdiction) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/code_lookups?city_id=eq.${cityId}&topic=eq.${topic}&jurisdiction=eq.${jurisdiction}&limit=1`,
      { headers }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) return null; // expired
    return row;
  } catch (e) { console.error('[DB] Code lookup get error:', e.message); return null; }
}

export async function dbSaveCodeLookup({ cityId, topic, jurisdiction, content, sourceUrl }) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/code_lookups`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ city_id:cityId, topic, jurisdiction, content, source_url:sourceUrl, cached_at:new Date().toISOString(), expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString() }),
      }
    );
    if (!res.ok) console.error('[DB] Code lookup save error:', await res.text());
  } catch (e) { console.error('[DB] Code lookup save error:', e.message); }
}

// ── User Profile ──────────────────────────────────────────────────────────────
export async function dbGetProfile(userId) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&limit=1`,
      { headers }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] Profile get error:', e.message); return null; }
}

export async function dbSaveProfile({ id, role, cityId, fullName }) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id, role, city_id:cityId, full_name:fullName }),
      }
    );
    if (!res.ok) { console.error('[DB] Profile save error:', await res.text()); return null; }
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] Profile save error:', e.message); return null; }
}
