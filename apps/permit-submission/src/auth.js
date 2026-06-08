const AUTH_KEY = "hvp_session";
const API_URL  = import.meta.env.VITE_API_URL || "https://permit-suite-api.vercel.app";

export function getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
export function saveSession(session) {
  if (session) localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  else localStorage.removeItem(AUTH_KEY);
}
export function getUser()  { return getSession()?.user ?? null; }
export function getToken() { return getSession()?.access_token ?? null; }
export function authHeaders() {
  const token = getToken();
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
