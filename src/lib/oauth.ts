import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { saveSession } from "./api";

// Required for OAuth to work on iOS
WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URL = Linking.createURL("auth/callback");

// ─────────────────────────────────────────────
// GOOGLE SIGN-IN
// ─────────────────────────────────────────────
export async function signInWithGoogle(): Promise<{
  success: boolean;
  session?: any;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error) return { success: false, error: error.message };
    if (!data.url) return { success: false, error: "No OAuth URL returned" };

    // Open browser for Google sign-in
    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);

    if (result.type !== "success") {
      return { success: false, error: result.type === "cancel" ? "cancelled" : "Authentication failed" };
    }

    // Extract tokens from the redirect URL
    const url = result.url;
    const params = new URL(url).hash.substring(1).split("&").reduce((acc: any, part) => {
      const [key, value] = part.split("=");
      acc[key] = decodeURIComponent(value || "");
      return acc;
    }, {});

    if (!params.access_token) {
      // Try PKCE flow
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        return { success: false, error: "Failed to get session after OAuth" };
      }
      const session = {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        user: sessionData.session.user,
      };
      await saveSession(session as any);
      return { success: true, session };
    }

    const session = {
      access_token: params.access_token,
      refresh_token: params.refresh_token,
      user: null,
    };
    await saveSession(session as any);
    return { success: true, session };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─────────────────────────────────────────────
// APPLE SIGN-IN
// ─────────────────────────────────────────────
export async function signInWithApple(): Promise<{
  success: boolean;
  session?: any;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });

    if (error) return { success: false, error: error.message };
    if (!data.url) return { success: false, error: "No OAuth URL returned" };

    const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URL);

    if (result.type !== "success") {
      return { success: false, error: result.type === "cancel" ? "cancelled" : "Authentication failed" };
    }

    const url = result.url;
    const params = new URL(url).hash.substring(1).split("&").reduce((acc: any, part) => {
      const [key, value] = part.split("=");
      acc[key] = decodeURIComponent(value || "");
      return acc;
    }, {});

    if (!params.access_token) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const session = {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          user: sessionData.session.user,
        };
        await saveSession(session as any);
        return { success: true, session };
      }
      return { success: false, error: "Failed to get session" };
    }

    const session = {
      access_token: params.access_token,
      refresh_token: params.refresh_token,
      user: null,
    };
    await saveSession(session as any);
    return { success: true, session };

  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
