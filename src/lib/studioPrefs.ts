// studioPrefs.ts — on-device personalization for the Share Studio
// (handle/look/format/hide-price), same AsyncStorage-only, never-sent-to-
// the-server posture revealPrefs.ts used for the screen this replaced. A
// new storage key - not a drop-in migration of the old reveal prefs, since
// the shape changed (look gained "clean", format and hidePrice are new).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StudioFormat, StudioLook } from "./shareStudio";

export interface StudioPrefs {
  handle: string; // "" is a valid, deliberate "no handle shown" choice
  look: StudioLook;
  format: StudioFormat;
  hidePrice: boolean;
}

const STORAGE_KEY = "@valuiq_share_studio_prefs";

function defaultHandle(displayName?: string | null): string {
  if (!displayName) return "";
  const slug = displayName.trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9_]/g, "");
  return slug ? `@${slug}` : "";
}

function isLook(v: unknown): v is StudioLook {
  return v === "dark" || v === "light" || v === "bold";
}

function isFormat(v: unknown): v is StudioFormat {
  return v === "story" || v === "feed" || v === "square";
}

// `fallbackDisplayName` only seeds the handle the FIRST time this device
// opens the Studio (no saved prefs yet) - once anything is saved (even an
// intentionally blank handle), that saved value always wins.
export async function loadStudioPrefs(fallbackDisplayName?: string | null): Promise<StudioPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        handle: typeof parsed?.handle === "string" ? parsed.handle : defaultHandle(fallbackDisplayName),
        look: isLook(parsed?.look) ? parsed.look : "dark",
        format: isFormat(parsed?.format) ? parsed.format : "story",
        hidePrice: typeof parsed?.hidePrice === "boolean" ? parsed.hidePrice : false,
      };
    }
  } catch {}
  return { handle: defaultHandle(fallbackDisplayName), look: "dark", format: "story", hidePrice: false };
}

export async function saveStudioPrefs(prefs: StudioPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
