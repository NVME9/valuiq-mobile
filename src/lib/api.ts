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
export async function refreshToken(refresh_token: string): Promise<Session> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method:"POST", headers:SB, body:JSON.stringify({refresh_token}) });
  const d = await r.json();
  console.log("[DIAG refreshToken] status=" + r.status + " ok=" + r.ok + " resp=" + JSON.stringify(d).slice(0,300));
  if (!r.ok) throw new Error("Session expired");
  return d;
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
  try { return (await fetch(`${API_BASE}/api/get-plan?token=${token}`).then(r=>r.json()))?.plan || "free"; } catch { return null; }
}
export async function getScanCount(token: string): Promise<number> {
  try { return (await fetch(`${API_BASE}/api/scan-count?token=${token}`).then(r=>r.json()))?.count ?? 0; } catch { return 0; }
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
export async function getScanHistory(token: string): Promise<any[]> {
  try { const d = await fetch(`${API_BASE}/api/scan-history?token=${token}`).then(r=>r.json()); return Array.isArray(d) ? d : []; } catch { return []; }
}
export async function scanImage(token: string, base64: string, description?: string, buyPrice?: number): Promise<any> {
  const body: any = {
    userToken: token,
    images: [`data:image/jpeg;base64,${base64}`],
    textInput: description || "",
    buyPrice: buyPrice || 0,
  };
  try {
    const t = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
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
export async function priceBattle(token: string, itemName: string, brand: string, category: string, condition: string, buyPrice: number): Promise<any> {
  const r = await fetch(`${API_BASE}/api/price-battle`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, itemName, brand, category, condition, buyPrice}) });
  return r.json();
}
export async function analyzeSpecialty(token: string, category: string, fields: Record<string,string>, photos?: string[]): Promise<any> {
  // Resize each photo to keep the request small + fast (avoids vision timeout)
  const images: string[] = [];
  for (const p of (photos || [])) {
    const raw = p.startsWith("data:") ? p : `data:image/jpeg;base64,${p}`;
    try {
      const t = await ImageManipulator.manipulateAsync(raw, [{ resize: { width: 1024 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      images.push(`data:image/jpeg;base64,${t.base64}`);
    } catch { images.push(raw); }
  }
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/api/specialty`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({userToken:token, category, fields, photos: images}) });
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
export async function getCommunityWins(): Promise<any[]> {
  try { const d = await fetch(`${API_BASE}/api/community-wins`).then(r=>r.json()); return Array.isArray(d) ? d : []; } catch { return []; }
}

export async function getProfitOracle(token: string, item: { category?: string; brand?: string; itemName?: string; buyPrice?: number }): Promise<any> {
  try {
    const r = await fetch(`${API_BASE}/api/profit-oracle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...item }),
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
