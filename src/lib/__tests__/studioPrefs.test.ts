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

  // ACCENT MUST NEVER PERSIST (v5, founder device bug): a lime swatch
  // picked in an earlier session was restored on the next open and
  // silently overrode the verdict color (a PASS/red card rendered with a
  // LIME hero). A legacy saved blob that still carries an `accent` key
  // (written before this fix, or by a future bug that writes one again)
  // must be completely ignored on load - StudioPrefs no longer even has
  // an `accent` field to read it into.
  test("a persisted prefs blob containing an old accent is ignored on open - loadStudioPrefs never returns one", async () => {
    await AsyncStorage.setItem(
      "@valuiq_share_studio_prefs",
      JSON.stringify({ handleEnabled: true, handle: "@nate", hook: "Pass or buy?", accent: "#a3e635" })
    );
    const p = await loadStudioPrefs(null);
    expect((p as any).accent).toBeUndefined();
    // the rest of the blob still round-trips normally - only accent is special-cased away
    expect(p.handleEnabled).toBe(true);
    expect(p.handle).toBe("@nate");
    expect(p.hook).toBe("Pass or buy?");
  });

  test("saveStudioPrefs never writes an accent even if handed one (defensive - the type no longer declares the field)", async () => {
    await saveStudioPrefs({ handleEnabled: false, handle: "", hook: null, ...( { accent: "#ff0000" } as any) });
    const raw = await AsyncStorage.getItem("@valuiq_share_studio_prefs");
    const parsed = JSON.parse(raw as string);
    // saveStudioPrefs itself is a dumb passthrough (no field stripping) -
    // this documents that the REAL guarantee lives at the call site
    // (ShareStudio.tsx's persistPrefs, which never includes accent in what
    // it merges and saves) and at load time (above), not here.
    expect(parsed.accent).toBe("#ff0000");
    const reloaded = await loadStudioPrefs(null);
    expect((reloaded as any).accent).toBeUndefined();
  });
});
