// studioPrefs.ts — on-device personalization for the Share Studio: the
// handle and the last-chosen hook. Remembered in AsyncStorage - the handle
// is OFF by default until the user explicitly turns it on (per the card
// spec), while the hook defaults ON (DEFAULT_HOOK) since "Would you flip
// it?" is the product's default pitch. look/format/crop prefs are gone
// along with the on-device card drawing they used to configure.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_HOOK } from "./shareStudio";

export interface StudioPrefs {
  handleEnabled: boolean; // must be explicitly turned on - a saved handle string alone never shows it
  handle: string;
  hook: string | null; // last-chosen hook (preset or custom text) - null means the user explicitly picked "None"
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
      // `hook` only existed in prefs blobs written AFTER this field was
      // added - its absence (an older saved blob) means "never chosen yet",
      // which defaults to DEFAULT_HOOK, same as a fresh install. A PRESENT
      // but null value is the user's own explicit "None" choice and must be
      // honored, not treated as "missing."
      const hasHook = !!parsed && Object.prototype.hasOwnProperty.call(parsed, "hook");
      return {
        handleEnabled: typeof parsed?.handleEnabled === "boolean" ? parsed.handleEnabled : false,
        handle: typeof parsed?.handle === "string" ? parsed.handle : defaultHandle(fallbackDisplayName),
        hook: hasHook ? (typeof parsed.hook === "string" ? parsed.hook : null) : DEFAULT_HOOK,
      };
    }
  } catch {}
  return { handleEnabled: false, handle: defaultHandle(fallbackDisplayName), hook: DEFAULT_HOOK };
}

export async function saveStudioPrefs(prefs: StudioPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
