// scanStage.ts (2026-11-08, crash-trip audit) — a lightweight "which stage
// was a scan in" marker, written to AsyncStorage at each stage and cleared
// on a clean result or New Scan. This app has no crash reporter (no
// Sentry/Bugsnag/Crashlytics) - a true native crash (OOM/watchdog) never
// runs a JS catch block, so it can't log anything AT the moment it
// happens. This is the next best thing: if the marker is still set the
// NEXT time the app launches, the app died (crashed, was force-quit, or
// the OS killed it) mid-scan without ever reaching a clean end state -
// App.tsx's own cold-start check reports that as `client_crash_suspected`
// with the stage it died in, which is the one signal this app can get
// about a crash it otherwise has zero visibility into.
//
// NOT a precise stage tracker - "identify"/"price" have no real client-
// observable completion signal (one HTTP round trip covers both
// server-side), so those two are approximated by the SAME ms budgets the
// loading screen's own StagedProgress steps already use (ScannerScreen.tsx
// mirrors them here rather than inventing new numbers) - "best guess at
// which stage," not a server-confirmed boundary.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ScanStage = "capture" | "upload" | "identify" | "price";

const KEY = "@valuiq_scan_stage";

export async function markScanStage(stage: ScanStage): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ stage, at: Date.now() }));
  } catch {
    // best-effort only - never block the actual scan on this
  }
}

export async function clearScanStage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort only
  }
}

// Reads the marker WITHOUT clearing it - caller (App.tsx's cold-start
// check) decides whether to report it, then clears it itself so a report
// that fails to send doesn't silently lose the marker forever.
export async function readScanStage(): Promise<{ stage: ScanStage; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.stage || typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
