// lib/scanTimingLog.ts (2026-11-14, item 8) — owner-only rolling log of the
// last 10 scans' elapsed ms (success or failure), persisted past this
// mount the same way lib/failureLog.ts is (the screen remounts on every
// tab switch - see App.tsx's SCREENS[screen] render) so the owner's debug
// panel reads it from more than just whatever's on screen right now. This
// is what makes "the server finishes every scan in 8-18s, is the client
// bailing earlier than that" actually checkable on-device, not just
// theorized from server-side logs.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SCAN_TIMING_LOG_KEY = "@valuiq_scan_timing_log";
export const MAX_SCAN_TIMING_LOG = 10;

export interface ScanTimingEntry {
  at: number;
  elapsedMs: number;
  success: boolean;
}

export async function recordScanTiming(entry: ScanTimingEntry): Promise<ScanTimingEntry[]> {
  let existing: ScanTimingEntry[] = [];
  try {
    const raw = await AsyncStorage.getItem(SCAN_TIMING_LOG_KEY);
    if (raw) existing = JSON.parse(raw);
  } catch {}
  const next = [entry, ...existing].slice(0, MAX_SCAN_TIMING_LOG);
  try {
    await AsyncStorage.setItem(SCAN_TIMING_LOG_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function readScanTimingLog(): Promise<ScanTimingEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_TIMING_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
