// lib/failureLog.ts (2026-11-14) — ONE persisted, owner-only diagnostic log
// shared by two producers that used to be separate: ScannerScreen.tsx's own
// scan-failure log (network/timeout/5xx/api failures - added 2026-11-12)
// and App.tsx's top-level ErrorBoundary (a genuine React render crash,
// anywhere in the app - added here). Same AsyncStorage key, same 20-entry
// cap, same ApiDebugPanel readout - a crash and a scan failure are both
// "something went wrong the owner should be able to review later," and
// keeping them in one list means whichever one actually happened is never
// the one nobody thought to check.
//
// Reads AsyncStorage fresh on every append (not a React state merge) so a
// write from one producer can never be clobbered by a stale in-memory copy
// held by the other - App.tsx and ScannerScreen.tsx are separate components
// that would otherwise each hold their own out-of-sync "prev" snapshot.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const FAILURE_LOG_KEY = "@valuiq_scan_failures";
export const MAX_FAILURE_LOG = 20;

export interface FailureLogEntry {
  at: number;
  kind: "scan_failure" | "crash";
  // scan_failure fields (ScannerScreen.tsx's ScanRequestError-derived info).
  stage?: string;
  status?: number | null;
  elapsedMs?: number;
  requestId?: string | null;
  // shared.
  name: string;
  message: string;
  // crash-only fields (App.tsx's ErrorBoundary.onError).
  stack?: string;
  componentStack?: string;
  screen?: string;
  resultSummary?: { keys: string[]; types: Record<string, string> } | null;
}

export async function appendFailureLog(entry: FailureLogEntry): Promise<FailureLogEntry[]> {
  let existing: FailureLogEntry[] = [];
  try {
    const raw = await AsyncStorage.getItem(FAILURE_LOG_KEY);
    if (raw) existing = JSON.parse(raw);
  } catch {}
  const next = [entry, ...existing].slice(0, MAX_FAILURE_LOG);
  try {
    await AsyncStorage.setItem(FAILURE_LOG_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function readFailureLog(): Promise<FailureLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FAILURE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
