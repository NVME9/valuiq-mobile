// condition.ts — shared condition-chip definitions (2026-10-06).
//
// Previously defined only inside ScannerScreen.tsx (its own pre-sale
// pricing dropdown) and never wired into the actual log-sale/edit-sale
// persistence path at all - SaleCaptureCard.tsx and HistoryScreen.tsx's
// scan editor had no condition UI, so a "sold" or edited record never got
// a real condition on it. Extracted here so all three places (ScannerScreen,
// SaleCaptureCard, HistoryScreen) share the exact same options/mapping
// instead of drifting.
export const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: "new-in-box", label: "New / Sealed" },
  { value: "new-no-tags", label: "New, No Tags" },
  { value: "used-good", label: "Used - Good" },
  { value: "used-heavy", label: "Used - Heavy Wear" },
];

// Maps a condition-chip VALUE to the `scans.condition` column's string -
// always sent alongside, never alone: app/api/scan-history/route.ts stamps
// condition_source: 'user-entered' automatically whenever `condition` is
// present on a PATCH (a human picking a chip is the only way this field
// ever gets edited through the app), so the client never needs to send
// condition_source itself.
export const CONDITION_TO_DB: Record<string, string> = {
  "new-in-box": "New",
  "new-no-tags": "New",
  "used-good": "Good",
  "used-heavy": "Fair",
};
