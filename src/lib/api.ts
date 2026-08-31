import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";
import * as ImageManipulator from "expo-image-manipulator";

export const SUPABASE_URL = "https://tylrcmczbvcvxkbuwnhf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5bHJjbWN6YnZjdnhrYnV3bmhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTMxMDgsImV4cCI6MjA5MDQ2OTEwOH0.RkllmmOBfdfhzC9s_3PyKrhFre9QpvzFVC-aY2xhsN4";
export const API_BASE = "https://www.getvaluiq.com";
// Full Titan-suite access: paid Titan, founder Lifetime, or comped VIP.
export const hasTitanAccess = (plan: string): boolean => ["titan","lifetime","vip"].includes(plan);
export const hasProAccess = (plan: string): boolean => ["pro","titan","lifetime","vip"].includes(plan);


const SB = { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };



export type Session = { access_token: string; refresh_token: string; user: { id: string; email: string } };

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AUTH (direct REST ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no SDK) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

// Device management
const DEVICE_KEY = "@valuiq_device_id";
let _deviceId: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (_deviceId) return _deviceId;
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) { _deviceId = existing; return existing; }
    // Generate new device ID
    const id = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(DEVICE_KEY, id);
    _deviceId = id;
    return id;
  } catch { return "dev_unknown"; }
}

export async function registerDevice(token: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const deviceId = await getDeviceId();
    const r = await fetch(`${API_BASE}/api/usage?token=${token}&deviceId=${deviceId}&action=register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const d = await r.json();
    return { allowed: d.allowed !== false, reason: d.reason };
  } catch { return { allowed: true }; }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method:"POST", headers:SB, body:JSON.stringify({email,password}) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.message || "Sign in failed");
  return d;
}
export async function signUp(email: string, password: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method:"POST", headers:SB, body:JSON.stringify({email,password}) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.message || "Sign up failed");
  if (!d.access_token) throw new Error("Check your email to confirm your account, then sign in.");
  return d;
}
export async function confirmPasswordReset(email: string, code: string, password: string): Promise<void> {
  const r = await fetch(`${API_BASE}/api/confirm-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Could not reset password. Check your code and try again.");
}
export async function resetPasswordForEmail(email: string): Promise<void> {
  // Use our web API which sends via Resend (instant) instead of Supabase's slow email
  const r = await fetch(`${API_BASE}/api/request-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || "Failed to send reset email. Please try again.");
  }
}

export async function sendMagicLink(email: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, { method:"POST", headers:SB, body:JSON.stringify({email,create_user:true}) });
  if (!r.ok) { const d = await r.json(); throw new Error(d.error_description || "Failed to send"); }
}
// Session restore must never hang the launch screen on a cold/slow backend -
// a short timeout here means App.tsx's init() always reaches setAppReady()
// quickly, falling back to "session expired" (re-login) rather than a black
// screen if Supabase doesn't answer in time.
//
// MEASURED BUG: Supabase refresh tokens are single-use/rotating - the OLD
// token is invalidated the instant a refresh succeeds and a NEW one is
// issued. App.tsx has two independent callers of this function with the
// SAME stored refresh_token (init()'s session-restore on launch, and the
// AppState "active" foreground-resume listener) - if both fire close
// together (exactly what an OTA update's reloadAsync() can trigger: the
// reload effectively re-launches the app, which can register as "active"
// around the same moment init() re-runs), whichever request reaches
// Supabase SECOND gets rejected as an already-consumed token, throwing
// "Session expired" and logging the user out - a routine update reload
// must never do that. Coalescing by token: a second caller with the SAME
// refresh_token while a request is already in flight gets the SAME promise
// instead of firing a duplicate request that can only lose the race.
let _refreshInFlight: { token: string; promise: Promise<Session> } | null = null;
export async function refreshToken(refresh_token: string): Promise<Session> {
  if (_refreshInFlight && _refreshInFlight.token === refresh_token) {
    return _refreshInFlight.promise;
  }
  const promise = (async () => {
    const r = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:"POST", headers:SB, body:JSON.stringify({refresh_token}) });
    const d = await r.json();
    console.log("[DIAG refreshToken] status=" + r.status + " ok=" + r.ok + " resp=" + JSON.stringify(d).slice(0,300));
    if (!r.ok) throw new Error("Session expired");
    return d;
  })();
  _refreshInFlight = { token: refresh_token, promise };
  try {
    return await promise;
  } finally {
    if (_refreshInFlight?.promise === promise) _refreshInFlight = null;
  }
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ SESSION ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ VALUIQ API ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
export async function getPlan(token: string): Promise<string | null> {
  try { return (await fetchWithTimeout(`${API_BASE}/api/get-plan?token=${token}`, undefined, DATA_FETCH_TIMEOUT_MS).then(r=>r.json()))?.plan || "free"; } catch { return null; }
}
export async function getScanCount(token: string): Promise<number> {
  try { return (await fetchWithTimeout(`${API_BASE}/api/scan-count?token=${token}`, undefined, DATA_FETCH_TIMEOUT_MS).then(r=>r.json()))?.count ?? 0; } catch { return 0; }
}
export async function updateThriftItem(token: string, payload: any): Promise<any> {
  const r = await fetch(`${API_BASE}/api/thrift-run?token=${token}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.json();
}
export async function deleteAccount(token: string): Promise<any> {
  try {
    const r = await fetch(`${API_BASE}/api/delete-account`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userToken: token }),
    });
    return await r.json();
  } catch {
    return { success: false, error: "Network error" };
  }
}
export async function updateScan(token: string, id: string, updates: any): Promise<any> {
  const r = await fetch(`${API_BASE}/api/scan-history?token=${token}&id=${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
  });
  return r.json();
}
export async function rerunScan(token: string, opts: { itemName: string; brand?: string; category?: string; condition?: string; buyPrice?: number; extraDescription?: string; newPhotosBase64?: string[]; }): Promise<any> {
  const body: any = {
    userToken: token,
    textInput: `${opts.brand ? opts.brand + " " : ""}${opts.itemName}`,
    extraDescription: opts.extraDescription || undefined,
    buyPrice: opts.buyPrice || 0,
    confirmedIdentification: true,
    isReanalyze: true,
    confirmedItem: {
      itemName: opts.itemName,
      brand: opts.brand || "Unknown",
      category: opts.category || "Other",
      condition: opts.condition || "Good",
      size: null,
    },
  };
  if (opts.newPhotosBase64 && opts.newPhotosBase64.length > 0) {
    body.images = opts.newPhotosBase64.map(b => b.startsWith("data:") ? b : `data:image/jpeg;base64,${b}`);
  }
  const r = await fetch(`${API_BASE}/api/lens`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}
export async function scanImage(token: string, photos: string[], description?: string, buyPrice?: number): Promise<any> {
  const body: any = {
    userToken: token,
    // lens/route.ts now sends ALL captured photos into ONE identify call -
    // a user deliberately takes extra photos (e.g. a close-up of the brand
    // tag) to help identification, and only uploading photos[0] was why
    // that close-up never reached the model. Each photo is already
    // compressed to ~1024px longest edge/80% quality (see compressPhoto in
    // ScannerScreen.tsx) before it ever reaches this array, so the full set
    // stays a reasonable payload.
    images: photos.map(b => `data:image/jpeg;base64,${b}`),
    textInput: description || "",
    buyPrice: buyPrice || 0,
    // Surfaces _debug.timing (per-stage ms) on every scan - the on-screen
    // DEBUG readout reads this. Cheap (a few extra JSON fields), always on.
    debug: true,
  };
  try {
    const t = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${photos[0]}`,
      [{ resize: { width: 200 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (t.base64) body.thumb = `data:image/jpeg;base64,${t.base64}`;
  } catch {}
  const r = await fetch(`${API_BASE}/api/lens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
export async function scanBarcode(token: string, upc: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/lens`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, upc}) });
  return r.json();
}
export async function analyzeSales(token: string, csvText: string, targetProfit?: number): Promise<any> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/api/analyze-sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken: token, csvText, targetProfit }),
    });
  } catch {
    return { success: false, error: "Network error. Check your connection and try again." };
  }
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: r.status === 504 || r.status === 502 ? "Analysis timed out. Try a smaller file." : "Analysis failed. Try again." };
  }
}
export async function priceBattle(token: string, itemName: string, brand: string, category: string, condition: string, buyPrice: number): Promise<any> {
  const r = await fetch(`${API_BASE}/api/price-battle`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, itemName, brand, category, condition, buyPrice}) });
  return r.json();
}
export async function analyzeSpecialty(token: string, category: string, fields: Record<string,string>, photos?: string[], buyPrice?: number, debug?: boolean): Promise<any> {
  // Resize each photo to keep the request small + fast (avoids vision timeout)
  const images: string[] = [];
  for (const p of (photos || [])) {
    const raw = p.startsWith("data:") ? p : `data:image/jpeg;base64,${p}`;
    try {
      const t = await ImageManipulator.manipulateAsync(raw, [{ resize: { width: 1024 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      images.push(`data:image/jpeg;base64,${t.base64}`);
    } catch { images.push(raw); }
  }
  // Small thumb for history/My Flips - same pattern as scanImage()'s `thumb`,
  // otherwise a specialty appraisal never gets a photo saved anywhere.
  let thumb: string | undefined;
  if (photos && photos[0]) {
    try {
      const raw = photos[0].startsWith("data:") ? photos[0] : `data:image/jpeg;base64,${photos[0]}`;
      const t = await ImageManipulator.manipulateAsync(raw, [{ resize: { width: 200 } }], { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (t.base64) thumb = `data:image/jpeg;base64,${t.base64}`;
    } catch {}
  }
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/api/specialty`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, category, fields, photos: images, thumb, buyPrice: buyPrice || 0, debug: !!debug}) });
  } catch {
    return { success: false, error: "Network error. Check your connection and try again." };
  }
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: r.status === 504 || r.status === 502 ? "Analysis timed out. Try fewer photos or add details by text." : "Analysis failed. Try again." };
  }
}
export async function analyzeManifest(token: string, text: string, imageBase64?: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/manifest`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, manifest:text, imageData:imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : undefined}) });
  return r.json();
}
export async function analyzeDeathPile(token: string, item: string, photoBase64?: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/deathpile`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, item, photo:photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : undefined}) });
  return r.json();
}
export interface CommunityFlip {
  // Only present on real user-submitted wins - the "report this post"
  // target. Seed/mined rows have no id: not a moderatable post, just a
  // real sold-price fact.
  id?: string;
  item_name: string; brand: string | null; profit: number;
  // Only populated for seed/mined rows - real user submissions
  // (community_wins) don't store a buy/sell pair, only the profit.
  buy_price: number | null; sell_price: number | null;
  days_to_sale: number | null; platform: string | null;
  username: string; created_at: string;
}
// THE single anonymized real-flips source - dashboard ticker, community
// feed, and leaderboard tab all read from this one function/endpoint, so
// there's exactly one place fake data could sneak back in. Every row is
// anonymized server-side (see deal-ai-pro's /api/community-flips):
// username is always a generic "A reseller", never a real name, whether
// the row is scraped/seed data or a real user's own submitted win.
// Short TTL, not zero: the endpoint deliberately serves a random window of
// the mined pool so a revisit sees genuine variety (see its own comment in
// deal-ai-pro/app/api/community-flips/route.ts) - a long cache would defeat
// that. This just absorbs the common case of Dashboard/Community mounting
// and unmounting again within a few seconds of each other (no persistent
// tab navigator - see the profile cache comment above), not repeat visits
// minutes apart. Public data, no token, so one cache entry per limit.
const COMMUNITY_FLIPS_TTL = 20000;
export async function getCommunityFlips(limit = 20): Promise<CommunityFlip[]> {
  const key = `community-flips:${limit}`;
  const cached = cacheGet<CommunityFlip[]>(key, COMMUNITY_FLIPS_TTL);
  if (cached) return cached;
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/community-flips?limit=${limit}`, undefined, DATA_FETCH_TIMEOUT_MS);
    const d = await r.json();
    const flips = d?.success && Array.isArray(d.flips) ? d.flips : [];
    cacheSet(key, flips);
    return flips;
  } catch {
    // Same stale-over-empty rule as getScanHistory/getProfileData: a timed-
    // out ticker must never flash empty when it already had real flips a
    // moment ago - only a cold cache (nothing fetched yet this session)
    // falls through to [].
    const stale = _cache.get(key);
    return stale ? (stale.data as CommunityFlip[]) : [];
  }
}
// Synchronous cache peek - lets Dashboard/Community paint their ticker/feed
// instantly on mount, before deciding whether they even need to call
// getCommunityFlips at all. Mirrors peekProfileData/peekScanHistory.
export function peekCommunityFlips(limit = 20): CommunityFlip[] | undefined {
  return _cache.get(`community-flips:${limit}`)?.data as CommunityFlip[] | undefined;
}

export interface DemoFlip {
  itemName: string; brand: string | null; category: string;
  buyPrice: number; sellPrice: number; profit: number; daysToSale: number;
  platform: string | null;
}
// One real, resolved sold outcome from the community/moat pool (seed
// account's mined "what sold" data - never a real user's private flip) -
// powers the empty-Wins "here's what your wins will look like" demo card.
export async function getDemoFlip(): Promise<DemoFlip | null> {
  try {
    const r = await fetch(`${API_BASE}/api/moat-demo-flip`);
    const d = await r.json();
    return d?.success && d.flip ? d.flip as DemoFlip : null;
  } catch { return null; }
}

// ---- tiny in-memory response cache ----
// Dashboard/History/Profile each get fully unmounted and remounted on every
// tab switch (no persistent tab navigator in this app), which used to mean
// every single visit re-hit /api/profile from scratch even seconds after
// the last visit - the main source of Wins/Profile feeling slow. A short
// TTL here lets a revisit within the window paint instantly from cache
// with zero network, while a visit after the window still gets a real
// refresh (see PROFILE_TTL below).
const _cache = new Map<string, { data: any; ts: number }>();
function cacheGet<T>(key: string, ttlMs: number): T | undefined {
  const hit = _cache.get(key);
  if (!hit || Date.now() - hit.ts > ttlMs) return undefined;
  return hit.data as T;
}
function cacheSet(key: string, data: any) { _cache.set(key, { data, ts: Date.now() }); }
export function invalidateProfileCache(token: string) { _cache.delete(`profile:${token}`); }

// INCIDENT (2026-08-30): a plain fetch() has no default timeout in React
// Native - when /api/profile briefly hung server-side (next/server's
// after() misbehaving on deploy), every screen that awaits it (Dashboard,
// Profile, History all block on getProfileData/getScanHistory before their
// own `loading` flips false) hung right along with it - no spinner timeout,
// no error, just stuck. Worse, App.tsx's boot sequence awaited getPlan/
// getScanCount (also plain fetch, no timeout) before ever rendering the
// main UI, so a cold/slow backend meant a multi-second BLACK screen on
// every launch, not just a stuck spinner. AbortController-backed timeout on
// every launch-path + data call now, so a slow/hung backend degrades
// gracefully instead of bricking the screen.
//
// Two different budgets on purpose:
// - AUTH_FETCH_TIMEOUT_MS (4s) - refreshToken only, still on App.tsx's boot
//   path (init() awaits it before setAppReady()) - has to stay short so a
//   cold backend can never reintroduce the black-screen-on-launch bug.
// - DATA_FETCH_TIMEOUT_MS (8s) - getProfileData/getScanHistory/getPlan/
//   getScanCount. MEASURED BUG: at 4s (this used to be one shared constant),
//   a merely-slow-but-VALID scan-history response got cut off just as often
//   as a genuinely hung one, and getScanHistory's catch-all returned []  -
//   which every caller renders as "0 scans" / "No scans yet" - CONTRADICTING
//   the real "$56 Made" total sitting right next to it from a separately-
//   cached /api/profile call. None of these four calls are on the boot
//   path anymore (App.tsx's loadUserData is fire-and-forget; every screen
//   that calls these already renders its own shell first and fills data in
//   after), so they can afford a longer budget before giving up.
const AUTH_FETCH_TIMEOUT_MS = 4000;
const DATA_FETCH_TIMEOUT_MS = 8000;
async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs: number = AUTH_FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export interface ProfileData { profile: any; stats: any; badges: any[] }
const PROFILE_TTL = 30000;

// THE single source of truth for both the full profile payload AND "money
// made" - Dashboard, Profile, and History all read through this one cached
// fetcher instead of each independently hitting /api/profile, so their
// headline wins figures can never disagree AND a revisit within 30s of any
// of the three screens fetching it is instant, no network, no spinner.
export async function getProfileData(token: string): Promise<ProfileData | null> {
  const key = `profile:${token}`;
  const cached = cacheGet<ProfileData>(key, PROFILE_TTL);
  if (cached) return cached;
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/profile?token=${token}`, undefined, DATA_FETCH_TIMEOUT_MS);
    const d = await r.json();
    if (d?.success) {
      const data: ProfileData = { profile: d.profile || {}, stats: d.stats || {}, badges: d.badges || [] };
      cacheSet(key, data);
      return data;
    }
  } catch {}
  // Timeout/network failure/non-success response - fall back to the last
  // real value fetched THIS SESSION (even past its TTL) rather than null,
  // which every caller renders as a zeroed-out "$0 made." A stale real
  // number is more honest than a fabricated zero for a user who actually
  // has real stats on file; only a genuinely cold cache (nothing fetched
  // yet this session) falls through to null.
  const stale = _cache.get(key);
  return stale ? (stale.data as ProfileData) : null;
}
// Synchronous cache peek - lets a screen paint its LAST-known data on the
// very first render (no blank/spinner frame) before deciding whether it
// even needs to call getProfileData at all.
export function peekProfileData(token: string): ProfileData | undefined {
  return cacheGet<ProfileData>(`profile:${token}`, PROFILE_TTL);
}

export async function getWinsSummary(token: string): Promise<{ count: number; total: number }> {
  const d = await getProfileData(token);
  if (d?.stats) return { count: Number(d.stats.soldCount) || 0, total: Number(d.stats.soldTotal) || 0 };
  return { count: 0, total: 0 };
}

// Same shape as getProfileData's cache above: History re-fetches this
// (up to 500 rows, filtered server-side) on every single mount, with zero
// caching, and this app fully unmounts/remounts every screen on every tab
// switch - so hopping Home -> Wins -> Home re-paid that cost every time.
// A short TTL lets a revisit within the window paint instantly.
//
// Unlike the profile stat (read-only-ish, changes slowly), THIS list gets
// directly mutated by the same screen (delete/edit/re-run/log-sale) - a
// blind cache here would make "I just deleted this" or "I just logged this
// sale" look like it silently didn't work for up to 30s. Callers that mutate
// MUST call invalidateScanHistoryCache(token) right after, before re-fetching.
const SCAN_HISTORY_TTL = 30000;
export async function getScanHistory(token: string, type: string, limit: number): Promise<any[]> {
  const key = `scan-history:${token}:${type}:${limit}`;
  const cached = cacheGet<any[]>(key, SCAN_HISTORY_TTL);
  if (cached) return cached;
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/scan-history?token=${encodeURIComponent(token)}&type=${type}&limit=${limit}`, undefined, DATA_FETCH_TIMEOUT_MS);
    const d = await r.json();
    const list = Array.isArray(d) ? d : [];
    cacheSet(key, list);
    return list;
  } catch {
    // MEASURED BUG: this used to return [] unconditionally on a timeout,
    // which every caller (HistoryScreen's stat bar/empty state) renders as
    // "0 Scans" / "No scans yet" - indistinguishable from a real empty
    // account, even sitting right next to a real "$56 Made" from a
    // separately-cached call that happened to succeed. Falling back to the
    // last list this exact query fetched successfully (even past its TTL)
    // is strictly more honest than a fabricated empty list; only a query
    // that's never once succeeded this session (a genuinely cold cache)
    // still has nothing to fall back to and returns [].
    const stale = _cache.get(key);
    return stale ? (stale.data as any[]) : [];
  }
}
// Synchronous cache peek (any freshness, unlike getScanHistory's own TTL-
// gated cacheGet above) - lets a screen paint its LAST-known list on the
// very first render, before deciding whether it even needs to call
// getScanHistory at all. Mirrors peekProfileData.
export function peekScanHistory(token: string, type: string, limit: number): any[] | undefined {
  const hit = _cache.get(`scan-history:${token}:${type}:${limit}`);
  return hit ? (hit.data as any[]) : undefined;
}
export function invalidateScanHistoryCache(token: string) {
  for (const k of Array.from(_cache.keys())) {
    if (k.startsWith(`scan-history:${token}:`)) _cache.delete(k);
  }
}

// MEASURED BUG: HistoryScreen's loadData() used to fetch this with a plain,
// un-timed, un-cached fetch() sitting inside the same Promise.allSettled as
// the (properly timed+cached) scan/specialty/profile calls - allSettled
// waits for EVERY promise to settle before the caller can proceed, so a
// merely-slow thrift-run response held up `loading` flipping false for the
// WHOLE screen even though the other three calls had already resolved (or
// were being served from cache). Same timeout+cache+stale-fallback
// treatment as getScanHistory now closes that gap.
const THRIFT_RUNS_TTL = 30000;
export async function getThriftRuns(token: string): Promise<any[]> {
  const key = `thrift-runs:${token}`;
  const cached = cacheGet<any[]>(key, THRIFT_RUNS_TTL);
  if (cached) return cached;
  try {
    const r = await fetchWithTimeout(`${API_BASE}/api/thrift-run?token=${token}`, undefined, DATA_FETCH_TIMEOUT_MS);
    const d = await r.json();
    const list = d?.success && Array.isArray(d.runs) ? d.runs : [];
    cacheSet(key, list);
    return list;
  } catch {
    const stale = _cache.get(key);
    return stale ? (stale.data as any[]) : [];
  }
}
export function peekThriftRuns(token: string): any[] | undefined {
  const hit = _cache.get(`thrift-runs:${token}`);
  return hit ? (hit.data as any[]) : undefined;
}
export function invalidateThriftRunsCache(token: string) { _cache.delete(`thrift-runs:${token}`); }

export async function getProfitOracle(token: string, item: { category?: string; brand?: string; itemName?: string; buyPrice?: number; estValue?: number; bestPlatform?: string; lensBuyTarget?: number; lensNetProfit?: number; lensSellPrice?: number }): Promise<any> {
  try {
    const r = await fetch(`${API_BASE}/api/profit-oracle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, debug: true, ...item }),
    });
    return await r.json();
  } catch {
    return { success: false };
  }
}

// ============ OAUTH: Apple + Google ============
export async function signInWithApple(): Promise<Session> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error("Apple sign in failed - no identity token");
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });
  if (error) throw new Error(error.message || "Apple sign in failed");
  if (!data.session) throw new Error("Apple sign in failed - no session");
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: { id: data.session.user.id, email: data.session.user.email || "" },
  };
}

export async function signInWithGoogle(): Promise<Session> {
  const redirectTo = "valuiq://auth-callback";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message || "Google sign in failed");
  if (!data?.url) throw new Error("Google sign in failed - no auth URL");
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) throw new Error("Google sign in cancelled");
  const url = result.url;
  // Implicit flow returns tokens in the URL fragment (#access_token=...&refresh_token=...)
  const frag = url.split("#")[1] || url.split("?")[1] || "";
  const params = new URLSearchParams(frag);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token) {
    // Set the session on the client so it persists + auto-refreshes
    await supabase.auth.setSession({
      access_token,
      refresh_token: refresh_token || "",
    });
    const { data: sess } = await supabase.auth.getUser(access_token);
    return {
      access_token,
      refresh_token: refresh_token || "",
      user: { id: sess.user?.id || "", email: sess.user?.email || "" },
    };
  }
  // Fallback: PKCE code exchange (in case provider returns a code)
  const code = params.get("code");
  if (code) {
    const { data: ex, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw new Error(exErr.message || "Google sign in failed");
    if (!ex.session) throw new Error("Google sign in failed - no session");
    return {
      access_token: ex.session.access_token,
      refresh_token: ex.session.refresh_token,
      user: { id: ex.session.user.id, email: ex.session.user.email || "" },
    };
  }
  throw new Error("Google sign in failed - no code or token returned");
}

// Share a win to the in-app Community feed (populates the real community_wins table).
export async function reportWin(
  token: string, winId: string, reason?: string
): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/community-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: token,
        winId,
        reason: reason || "Inappropriate content",
      }),
    });
    const d = await r.json().catch(() => ({}));
    return !!d?.success;
  } catch {
    return false;
  }
}

export async function shareWin(
  token: string, itemName: string, profit: number,
  platform?: string, storeName?: string
): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/api/community-wins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: token,
        itemName,
        profit: Math.round(profit),
        platform: platform || "eBay",
        storeName: storeName || "",
      }),
    });
    const d = await r.json().catch(() => ({}));
    return d?.success === true;
  } catch {
    return false;
  }
}
