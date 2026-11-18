// studioPrefs.test.ts — coverage for Share Studio's AsyncStorage-backed
// prefs, in particular the "hook ON by default" product decision (see
// shareStudio.ts's DEFAULT_HOOK): a fresh install (or a prefs blob saved
// before `hook` existed) must default to DEFAULT_HOOK, while an explicit
// "None" choice (hook: null) must be remembered as null, not re-defaulted.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadStudioPrefs, saveStudioPrefs } from "../studioPrefs";
import { DEFAULT_HOOK } from "../shareStudio";

describe("loadStudioPrefs", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test("fresh install (nothing saved yet): hook defaults ON to DEFAULT_HOOK", async () => {
    const p = await loadStudioPrefs(null);
    expect(p.hook).toBe(DEFAULT_HOOK);
    expect(p.handleEnabled).toBe(false);
  });

  test("a prefs blob saved before `hook` existed (no hook key at all) also defaults to DEFAULT_HOOK", async () => {
    await AsyncStorage.setItem(
      "@valuiq_share_studio_prefs",
      JSON.stringify({ handleEnabled: true, handle: "@nate" })
    );
    const p = await loadStudioPrefs(null);
    expect(p.hook).toBe(DEFAULT_HOOK);
    expect(p.handleEnabled).toBe(true);
    expect(p.handle).toBe("@nate");
  });

  test("an explicit 'None' choice (hook: null) is remembered as null, not re-defaulted", async () => {
    await saveStudioPrefs({ handleEnabled: false, handle: "", hook: null });
    const p = await loadStudioPrefs(null);
    expect(p.hook).toBeNull();
  });

  test("a saved custom/preset hook string round-trips", async () => {
    await saveStudioPrefs({ handleEnabled: false, handle: "", hook: "Pass or buy?" });
    const p = await loadStudioPrefs(null);
    expect(p.hook).toBe("Pass or buy?");
  });
});
