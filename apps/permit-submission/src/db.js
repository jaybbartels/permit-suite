// ── Supabase direct browser calls — app_data schema ──────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const SCHEMA = "app_data";

function getAuthHeaders() {
  try {
    const session = JSON.parse(localStorage.getItem("hvp_session") || "{}");
    const token = session?.access_token;
    if (!token) {
      console.warn('[DB] No access token found — using anon key');
      return {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept-Profile': SCHEMA,
      };
    }
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Accept-Profile': SCHEMA,
    };
  } catch {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept-Profile': SCHEMA,
    };
  }
}

export async function dbSaveApplication(appData) {
  const headers = getAuthHeaders();
  const { id, ...data } = appData;
  const clean = Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined));
  clean.updated_at = new Date().toISOString();

  console.log('[DB] Saving application, user_id:', clean.user_id, 'id:', id || 'new');

  try {
    if (id) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/permit_applications?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=representation' },
          body: JSON.stringify(clean),
        }
      );
      if (!res.ok) { const e = await res.text(); console.error('[DB] Update error:', e); return null; }
      const rows = await res.json();
      return rows[0] ?? null;
    } else {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/permit_applications`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=representation' },
          body: JSON.stringify(clean),
        }
      );
      if (!res.ok) { const e = await res.text(); console.error('[DB] Insert error:', e); return null; }
      const rows = await res.json();
      console.log('[DB] Application saved:', rows[0]?.id);
      return rows[0] ?? null;
    }
  } catch (e) {
    console.error('[DB] Save error:', e.message);
    return null;
  }
}

export async function dbLoadApplications(userId) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_applications?user_id=eq.${userId}&order=updated_at.desc`,
      { headers }
    );
    if (!res.ok) { console.error('[DB] Load apps error:', await res.text()); return []; }
    return await res.json();
  } catch (e) { console.error('[DB] Load apps error:', e.message); return []; }
}

export async function dbLoadApplication(id) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_applications?id=eq.${id}&limit=1`,
      { headers }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] ?? null;
  } catch (e) { console.error('[DB] Load app error:', e.message); return null; }
}

export async function dbSaveDocument({ applicationId, userId, docId, file }) {
  const session = JSON.parse(localStorage.getItem("hvp_session") || "{}");
  const token = session?.access_token || SUPABASE_KEY;
  const path = `${userId}/${applicationId}/${docId}-${file.name}`;

  try {
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/permit-documents/${path}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      }
    );
    if (!uploadRes.ok) { console.error('[DB] Storage upload error:', await uploadRes.text()); return null; }

    const headers = getAuthHeaders();
    await fetch(
      `${SUPABASE_URL}/rest/v1/permit_documents`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': SCHEMA, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          application_id: applicationId,
          user_id: userId,
          document_type: docId,
          display_name: file.name,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        }),
      }
    );
    console.log('[DB] Document uploaded:', path);
    return path;
  } catch (e) { console.error('[DB] Document upload error:', e.message); return null; }
}
