// scanTimingLog.slowScanThreshold.test.ts (2026-11-16) — proves the
// "Taking longer than usual, still working" message (ScannerScreen.tsx's
// slowScanMsg effect) only fires well past a real scan's normal duration.
// MEASURED: real scans normally take 11-16s; the prior threshold (15000ms,
// originally 8000ms) fired on nearly every scan.
import { SLOW_SCAN_THRESHOLD_MS } from "../scanTimingLog";

describe("SLOW_SCAN_THRESHOLD_MS", () => {
  test("is raised to 22s", () => {
    expect(SLOW_SCAN_THRESHOLD_MS).toBe(22000);
  });
  test("sits clearly above the measured ~16s p90 for a normal scan", () => {
    const MEASURED_P90_MS = 16000;
    expect(SLOW_SCAN_THRESHOLD_MS).toBeGreaterThan(MEASURED_P90_MS);
  });
  test("no longer the old 15s (or 8s) value that fired on every scan", () => {
    expect(SLOW_SCAN_THRESHOLD_MS).not.toBe(15000);
    expect(SLOW_SCAN_THRESHOLD_MS).not.toBe(8000);
  });
});
