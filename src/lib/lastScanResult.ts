// lib/lastScanResult.ts (2026-11-14) — module-level snapshot of the most
// recent successful scan result, written by ScannerScreen.tsx right where
// it sets `result` state. Exists ONLY so a crash anywhere in the app (the
// App.tsx-level ErrorBoundary wraps every screen, not just Scanner) can
// report what the last real scan response looked like - its field names
// and each field's JS type, never the actual values (this can end up in an
// owner-visible debug log; shape, not content, is what a crash
// investigation needs anyway). A plain module variable, not React
// state/context: componentDidCatch needs this synchronously, and every
// screen in this app fully unmounts/remounts on tab switch (see App.tsx's
// SCREENS[screen] render) while this module itself does not, so it's the
// one thing guaranteed to still hold the last real result's shape by the
// time a crash reaches the boundary.
let _lastScanResult: any = null;

export function setLastScanResult(result: any) {
  _lastScanResult = result;
}

export function getLastScanResultSummary(): { keys: string[]; types: Record<string, string> } | null {
  if (_lastScanResult == null || typeof _lastScanResult !== "object") return null;
  const keys = Object.keys(_lastScanResult);
  const types: Record<string, string> = {};
  for (const k of keys) {
    const v = (_lastScanResult as any)[k];
    types[k] = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  }
  return { keys, types };
}
