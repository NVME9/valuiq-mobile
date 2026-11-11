// revealPrefs.ts — on-device personalization for the "Share reveal" card
// (handle/caption/look). Saved locally only (AsyncStorage), never sent to
// the server - this is cosmetic, per-device presentation, not account data.
// Defaults are chosen so the FIRST share needs zero taps to customize
// (open -> Share, ~2 taps total): handle defaults from the profile's own
// display_name (if known) with no "@" typed by the user, caption defaults
// to one honest, reusable line, and look defaults to "dark" (the app's own
// theme, so a brand-new user's first share matches what they already see
// on screen instead of surprising them with an unfamiliar palette).
import AsyncStorage from "@react-native-async-storage/async-storage";

export type RevealLook = "dark" | "light" | "bold";

export interface RevealPrefs {
  handle: string;   // e.g. "@name" - "" is a valid, deliberate choice (no handle shown)
  caption: string;
  look: RevealLook;
}

const STORAGE_KEY = "@valuiq_reveal_prefs";
const DEFAULT_CAPTION = "Real find, real numbers.";

function defaultHandle(displayName?: string | null): string {
  if (!displayName) return "";
  const slug = displayName.trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9_]/g, "");
  return slug ? `@${slug}` : "";
}

// `fallbackDisplayName` is only used the FIRST time this device ever opens
// the reveal (no saved prefs yet) - once the user has saved anything at all
// (even leaving the handle blank on purpose), that saved value always wins,
// never silently overwritten by a later profile fetch.
export async function loadRevealPrefs(fallbackDisplayName?: string | null): Promise<RevealPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        handle: typeof parsed?.handle === "string" ? parsed.handle : defaultHandle(fallbackDisplayName),
        caption: typeof parsed?.caption === "string" ? parsed.caption : DEFAULT_CAPTION,
        look: parsed?.look === "light" || parsed?.look === "bold" ? parsed.look : "dark",
      };
    }
  } catch {}
  return { handle: defaultHandle(fallbackDisplayName), caption: DEFAULT_CAPTION, look: "dark" };
}

export async function saveRevealPrefs(prefs: RevealPrefs): Promise<void> {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
}
