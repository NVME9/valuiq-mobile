// studioPrefs.ts — on-device personalization for the Share Studio: just the
// handle. Remembered in AsyncStorage, OFF by default until the user
// explicitly turns it on (per the card spec) - look/format/crop prefs are
// gone along with the on-device card drawing they used to configure.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface StudioPrefs {
  handleEnabled: boolean; // must be explicitly turned on - a saved handle string alone never shows it
  handle: string;
}

const STORAGE_KEY = "@valuiq_share_studio_prefs";

function defaultHandle(displayName?: string | null): string {
  if (!displayName) return "";
  const slug = displayName.trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9_]/g, "");
  return slug ? `@${slug}` : "";
}

// `fallbackDisplayName` only seeds the handle TEXT the first time this
// device opens the Studio (no saved prefs yet) - it never turns the toggle
// on by itself. Once anything is saved, that saved value always wins.
export async function loadStudioPrefs(fallbackDisplayName?: string | null): Promise<StudioPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        handleEnabled: typeof parsed?.handleEnabled === "boolean" ? parsed.handleEnabled : false,
        handle: typeof parsed?.handle === "string" ? parsed.handle : defaultHandle(fallbackDisplayName),
      };
    }
  } catch {}
  return { handleEnabled: false, handle: defaultHandle(fallbackDisplayName) };
}

export async function saveStudioPrefs(prefs: StudioPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
