const AUTH_KEY = "gov_session";
const API_URL  = import.meta.env.VITE_API_URL || "https://permit-suite-api.vercel.app";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
export function saveSession(session) {
  if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  else localStorage.removeItem(AUTH_KEY);
}
export function getUser()  { return getSession()?.user ?? null; }
export function getToken() {
  const s = getSession();
  if (!s?.access_token) return null;
  if (s.expires_at && Date.now() / 1000 > s.expires_at - 60) return null;
  return s.access_token;
}
export function getUserId() { return getUser()?.id ?? null; }
export function authHeaders() {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}
export async function refreshSession() {
  const s = getSession();
  if (!s?.refresh_token) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', refresh_token: s.refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) { saveSession(data); return true; }
    return false;
  } catch { return false; }
}
export async function getValidToken() {
  const token = getToken();
  if (token) return token;
  const refreshed = await refreshSession();
  if (refreshed) return getToken();
  return null;
}
export async function authHeadersAsync() {
  const token = await getValidToken();
  return token
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}
export async function signUp(email, password) {
  const res = await fetch(`${API_URL}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Signup failed');
  if (data.access_token) saveSession(data);
  return data;
}
export async function signIn(email, password) {
  const res = await fetch(`${API_URL}/api/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Login failed');
  saveSession(data);
  return data;
}
export async function signOut() {
  const s = getSession();
  if (s?.refresh_token) {
    await fetch(`${API_URL}/api/auth`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout', refresh_token: s.refresh_token }),
    }).catch(() => {});
  }
  saveSession(null);
}
