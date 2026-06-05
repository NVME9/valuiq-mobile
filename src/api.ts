import AsyncStorage from "@react-native-async-storage/async-storage";

export const SUPABASE_URL = "https://tylrcmczbvcvxkbuwnhf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5bHJjbWN6YnZjdnhrYnV3bmhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTMxMDgsImV4cCI6MjA5MDQ2OTEwOH0.RkllmmOBfdfhzC9s_3PyKrhFre9QpvzFVC-aY2xhsN4";
export const API_BASE = "https://www.getvaluiq.com";

const SB = { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" };

export type Session = { access_token: string; refresh_token: string; user: { id: string; email: string } };

// ── AUTH (direct REST — no SDK) ──────────────────────────────────
export async function signIn(email: string, password: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method:"POST", headers:SB, body:JSON.stringify({email,password}) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.message || "Sign in failed");
  return d;
}
export async function signUp(email: string, password: string): Promise<Session> {
  // Uses Admin API: no email confirmation required, instant session
  const r = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Sign up failed. Please try again.");
  return d;
}
export async function resetPasswordForEmail(email: string): Promise<void> {
  // Call Supabase /auth/v1/recover which uses our custom SMTP (Resend)
  // configured in Supabase dashboard - sends from noreply@getvaluiq.com
  const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, redirect_to: "https://www.getvaluiq.com/reset-password" }),
  });
  // Supabase returns 200 even 
  if email not found (security by design)
  // Only  throw on server errors
  if (r.status >= 500) throw new Error("Server error. Please try again.");
}

export async function sendMagicLink(email: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, { method:"POST", headers:SB, body:JSON.stringify({email,create_user:true}) });
  if (!r.ok) { const d = await r.json(); throw new Error(d.error_description || "Failed to send"); }
}
export async function refreshToken(refresh_token: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:"POST", headers:SB, body:JSON.stringify({refresh_token}) });
  const d = await r.json();
  if (!r.ok) throw new Error("Session expired");
  return d;
}

// ── SESSION ───────────────────────────────────────────────────────
const KEY = "viq_session_v2";
export async function saveSession(s: Session): Promise<void> { await AsyncStorage.setItem(KEY, JSON.stringify(s)); }
export async function loadSession(): Promise<Session | null> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function refreshSessionWithToken(refreshToken: string): Promise<Session | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: SB,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.access_token) return null;
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token || refreshToken,
      user: d.user,
    };
  } catch { return null; }
}

export async function clearSession(): Promise<void> { await AsyncStorage.removeItem(KEY); }

// ── VALUIQ API ────────────────────────────────────────────────────
export async function getPlan(token: string): Promise<string> {
  try { return (await fetch(`${API_BASE}/api/get-plan?token=${token}`).then(r=>r.json()))?.plan || "free"; } catch { return "free"; }
}
export async function getScanCount(token: string): Promise<number> {
  try { return (await fetch(`${API_BASE}/api/scan-count?token=${token}`).then(r=>r.json()))?.count ?? 0; } catch { return 0; }
}
export async function getScanHistory(token: string): Promise<any[]> {
  try { const d = await fetch(`${API_BASE}/api/scan-history?token=${token}`).then(r=>r.json()); return Array.isArray(d) ? d : []; } catch { return []; }
}
export async function scanImage(token: string, base64: string, description?: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/lens`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, image:`data:image/jpeg;base64,${base64}`, textInput:description}) });
  return r.json();
}
export async function scanBarcode(token: string, upc: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/lens`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, upc}) });
  return r.json();
}
export async function priceBattle(token: string, itemName: string, brand: string, category: string, condition: string, buyPrice: number): Promise<any> {
  const r = await fetch(`${API_BASE}/api/price-battle`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, itemName, brand, category, condition, buyPrice}) });
  return r.json();
}
export async function analyzeSpecialty(token: string, category: string, fields: Record<string,string>, photoBase64?: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/specialty`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, category, fields, photo:photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : undefined}) });
  return r.json();
}
export async function analyzeManifest(token: string, text: string, imageBase64?: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/manifest`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, manifest:text, imageData:imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : undefined}) });
  return r.json();
}
export async function analyzeDeathPile(token: string, item: string, photoBase64?: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/deathpile`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, item, photo:photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : undefined}) });
  return r.json();
}
export async function getCommunityWins(): Promise<any[]> {
  try { const d = await fetch(`${API_BASE}/api/community-wins`).then(r=>r.json()); return Array.isArray(d) ? d : []; } catch { return []; }
}
