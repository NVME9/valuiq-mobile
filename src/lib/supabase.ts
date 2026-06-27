import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE } from "./constants";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: "implicit",
  },
  global: {
    fetch: fetch.bind(globalThis),
  },
});

export async function getCurrentPlan(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return "free";
    const r = await fetch(`${API_BASE}/api/get-plan?token=${session.access_token}`);
    const d = await r.json();
    return d?.plan || "free";
  } catch {
    return "free";
  }
}

export async function getAccessToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  } catch {
    return "";
  }
}
