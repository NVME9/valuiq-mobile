import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";

export const SUPABASE_URL = "https://tylrcmczbvcvxkbuwnhf.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5bHJjbWN6YnZjdnhrYnV3bmhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTMxMDgsImV4cCI6MjA5MDQ2OTEwOH0.RkllmmOBfdfhzC9s_3PyKrhFre9QpvzFVC-aY2xhsN4";
export const API_BASE = "https://www.getvaluiq.com";
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
export async function getPlan(token: string): Promise<string> {
  try { return (await fetch(`${API_BASE}/api/get-plan?token=${token}`).then(r=>r.json()))?.plan || "free"; } catch { return "free"; }
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

