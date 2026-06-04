// ── Supabase direct browser calls — app_data schema ──────────────────────────
// Uses authenticated user token from Supabase Auth session
// RLS policies enforce that users can only see their own data

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
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept-Profile': SCHEMA,
    };
  }
}

// Save or update a permit application
export async function dbSaveApplication(appData) {
  const headers = getAuthHeaders();
  const { id, ...data } = appData;

  // Clean up undefined values
  const clean = Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined));
  clean.updated_at = new Date().toISOString();

  try {
    if (id) {
      // Update existing
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
      // Insert new
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

// Load all applications for a user
export async function dbLoadApplications(userId) {
  const headers = getAuthHeaders();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/permit_applications?user_id=eq.${userId}&order=updated_at.desc`,
      { headers }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    console.error('[DB] Load apps error:', e.message);
    return [];
  }
}

// Load a single application by ID
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
  } catch (e) {
    console.error('[DB] Load app error:', e.message);
    return null;
  }
}

// Upload a document to Supabase Storage and record metadata
export async function dbSaveDocument({ applicationId, userId, docId, file }) {
  const session = JSON.parse(localStorage.getItem("hvp_session") || "{}");
  const token = session?.access_token || SUPABASE_KEY;

  const path = `${userId}/${applicationId}/${docId}-${file.name}`;

  try {
    // Upload to Supabase Storage
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
    if (!uploadRes.ok) {
      const e = await uploadRes.text();
      console.error('[DB] Storage upload error:', e);
      return null;
    }

    // Record document metadata
    const headers = getAuthHeaders();
    const metaRes = await fetch(
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
    if (!metaRes.ok) console.error('[DB] Document metadata error:', await metaRes.text());

    console.log('[DB] Document uploaded:', path);
    return path;
  } catch (e) {
    console.error('[DB] Document upload error:', e.message);
    return null;
  }
}
