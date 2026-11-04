// viewSavedScan.ts (2026-10-25) — pure logic for opening a SAVED scan
// (scans.specialty_data) straight onto ScannerScreen's results step, with no
// fresh analyze() call. Two callers share this:
//   - HistoryScreen's new "View result" button (Scans tab) - navigates with
//     { viewScan: scan } for the row exactly as it sits in the DB.
//   - ScanConfirmScreen's confirmAndRerun - after a real re-run (or the
//     "nothing changed" no-call shortcut), navigates with
//     { viewScan: { ...scan, ...updates } }, the SAME shape, so both paths
//     land on ScannerScreen through one route param, never a cloned UI.
//
// buildSavedScanView() never makes a network call and never mutates its
// input - ScannerScreen.tsx's load effect is the only thing that turns its
// output into state.
export type BuyPriceSource = "user" | "tag" | null;

export interface SavedScanView {
  // Same shape ScannerScreen.tsx's finishAnalyze() hands to setResult() for
  // a fresh scan - the parsed specialty_data blob, id forced to the DB row's
  // real id so PATCH-on-settle/stale-scan guards always key off the correct
  // scan.
  result: any;
  buyPrice: string;
  buyPriceSource: BuyPriceSource;
  resultCondition: string;
  // PHOTO (2026-11-04, owner phone bug, item 7) - specialty_data NEVER
  // carries the photo (confirmed against this account's real rows: no
  // imageUrl/image/photoUrl field on any saved specialty_data snapshot,
  // fresh scan or re-run) - the ONLY place a scan's photo lives is the
  // scans.image_url column itself. A fresh scan's result-step photo comes
  // from this screen's OWN `photos` capture-state array, which a saved-view
  // mount never populates - so a reopened scan showed no photo even once
  // the "load the stored row, no network call" fix (BUG 1/2) was in,
  // because that fix only ever read specialty_data. Raw base64 (NOT a
  // data: URI) - same shape ScannerScreen.tsx's own `photos` entries are in
  // (ProfitFlexHero/ShareCard's photoBase64 prop prepends the data: URI
  // prefix itself) - stripped here so this is a drop-in match for
  // setPhotos([...]) regardless of which shape the stored column is in.
  photoBase64: string | null;
}

function stripDataUriPrefix(value: string): string {
  return value.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
}

// BUY-PRICE SOURCE FOR A SAVED ROW (rule (e)): scans.buy_price_source is
// never actually persisted server-side (not in app/api/scan-history/
// route.ts's SELECT_COLS or PATCH `allowed` whitelist - confirmed against
// deal-ai-pro) - so there is no stored column to read back. Every positive
// buy_price that DOES reach the DB got there through ScannerScreen's own
// PATCH-on-settle effect, which (lib/scanSettleState.ts's
// shouldPatchSettledVerdict) refuses to patch at all unless buyPriceSource
// was already "user" or "tag" - a rejected or merely-suggested read can
// never leave a positive number behind. So a positive saved buy_price is
// reconstructable: "tag" when it matches the scan's own confident tag read
// (finishAnalyze's auto-seed, or an explicit "Confirm $X" tap - both land on
// buyPrice===retailPriceRead), "user" for any other positive number (typed,
// or edited on ScanConfirmScreen's price field). Zero/missing stays null -
// "Type the tag price" state, never a fabricated source for a price that
// was never actually settled.
export function resolveSavedBuyPriceSource(buyPrice: number, specialtyData: any): BuyPriceSource {
  if (!(buyPrice > 0)) return null;
  const tagRead = Number(specialtyData?.retailPriceRead) || 0;
  if (tagRead > 0 && tagRead === buyPrice) return "tag";
  return "user";
}

// Returns null when there's genuinely nothing honest to show (no
// specialty_data at all, or it's not parseable JSON) - the caller's job is
// to offer Re-run at that point, never to fabricate a blank result.
export function buildSavedScanView(scan: any): SavedScanView | null {
  if (!scan || scan.id == null) return null;
  let full: any = null;
  if (typeof scan.specialty_data === "string") {
    try { full = JSON.parse(scan.specialty_data); } catch { full = null; }
  } else if (scan.specialty_data && typeof scan.specialty_data === "object") {
    full = scan.specialty_data;
  }
  if (!full || typeof full !== "object") return null;

  const savedBuyPrice = Number(scan.buy_price) || 0;
  const buyPriceSource = resolveSavedBuyPriceSource(savedBuyPrice, full);
  // This account's rows store image_url as an inline base64 data: URI
  // (confirmed against real rows) - an http(s) URL isn't this screen's
  // photoBase64 shape (ProfitFlexHero/ShareCard always wrap it in a
  // data:image/jpeg;base64, prefix themselves) and is left out rather than
  // passed through broken; no real row currently has one of those, but
  // this is cheap insurance against a future storage-URL row silently
  // rendering a corrupt image.
  const rawImage = typeof scan.image_url === "string" ? scan.image_url.trim() : "";
  const imageUrl = rawImage && !/^https?:\/\//i.test(rawImage) ? rawImage : "";
  return {
    // id forced to the real scan row id (never whatever specialty_data's
    // own `id` field says, which is normally the same but shouldn't be the
    // thing this depends on) - every stale-state guard and the PATCH-on-
    // settle effect key off result.id.
    result: { ...full, id: String(scan.id) },
    buyPrice: buyPriceSource ? String(savedBuyPrice) : "",
    buyPriceSource,
    resultCondition: full.conditionAssessment || "",
    photoBase64: imageUrl ? stripDataUriPrefix(imageUrl) : null,
  };
}
