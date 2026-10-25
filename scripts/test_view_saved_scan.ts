// scripts/test_view_saved_scan.ts — pure-function tests for
// src/lib/viewSavedScan.ts (HistoryScreen's "View result" button + a
// completed Edit & Re-run landing on the results page instead of History).
// No React, no simulator - plain function calls.
// Run: npx tsx scripts/test_view_saved_scan.ts
import { buildSavedScanView, resolveSavedBuyPriceSource } from "../src/lib/viewSavedScan";

let failures = 0;
function assertEqual(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? "PASS" : "FAIL"} ${label}`);
  if (!pass) {
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
    failures++;
  }
}

// ── resolveSavedBuyPriceSource: rule (e) ──
assertEqual(
  "no saved price (0): null source - 'Type the tag price' state",
  resolveSavedBuyPriceSource(0, { retailPriceRead: 0 }),
  null
);
assertEqual(
  "no saved price (NaN-ish/undefined): null source",
  resolveSavedBuyPriceSource(NaN, {}),
  null
);
assertEqual(
  "saved price matches a confident tag read: 'tag'",
  resolveSavedBuyPriceSource(72, { retailPriceRead: 72, retailPriceNeedsConfirmation: false }),
  "tag"
);
assertEqual(
  "saved price matches a tag read that needed confirmation (was later confirmed): still 'tag'",
  resolveSavedBuyPriceSource(72, { retailPriceRead: 72, retailPriceNeedsConfirmation: true }),
  "tag"
);
assertEqual(
  "saved price differs from the tag read (user typed their own number): 'user'",
  resolveSavedBuyPriceSource(40, { retailPriceRead: 72 }),
  "user"
);
assertEqual(
  "saved price with no tag read on the scan at all (barcode path): 'user'",
  resolveSavedBuyPriceSource(15, {}),
  "user"
);

// ── buildSavedScanView: parsing + wiring ──
assertEqual("no scan at all: null", buildSavedScanView(null), null);
assertEqual("scan with no id: null", buildSavedScanView({ specialty_data: "{}" }), null);
assertEqual(
  "scan with unparseable specialty_data: null (caller offers Re-run)",
  buildSavedScanView({ id: "s1", specialty_data: "{not json" }),
  null
);
assertEqual(
  "scan with no specialty_data at all: null",
  buildSavedScanView({ id: "s1" }),
  null
);

{
  const scan = {
    id: "s1",
    buy_price: 72,
    specialty_data: JSON.stringify({ id: "s1", itemName: "Test Item", retailPriceRead: 72, conditionAssessment: "used-good", sellPrice: 40 }),
  };
  const view = buildSavedScanView(scan);
  assertEqual("confident-tag-match: buyPrice is the saved number as a string", view?.buyPrice, "72");
  assertEqual("confident-tag-match: source is 'tag'", view?.buyPriceSource, "tag");
  assertEqual("confident-tag-match: resultCondition seeded from conditionAssessment", view?.resultCondition, "used-good");
  assertEqual("confident-tag-match: result.id forced to the real scan id (string)", view?.result?.id, "s1");
  assertEqual("confident-tag-match: result carries the rest of specialty_data through unchanged", view?.result?.itemName, "Test Item");
}

{
  // buy_price is 0/missing (rejected read, or never settled) - "Type the
  // tag price" state, never a fabricated price.
  const scan = { id: "s2", buy_price: 0, specialty_data: JSON.stringify({ retailPriceRead: 72, retailPriceNeedsConfirmation: true }) };
  const view = buildSavedScanView(scan);
  assertEqual("never-settled: buyPrice is blank, not the withheld tag read", view?.buyPrice, "");
  assertEqual("never-settled: source is null", view?.buyPriceSource, null);
}

{
  // specialty_data already an object (not a JSON string) - some callers
  // (ScanConfirmScreen's { ...scan, ...updates } after a rerun) may hand
  // this through without re-stringifying.
  const scan = { id: "s3", buy_price: 40, specialty_data: { retailPriceRead: 72 } };
  const view = buildSavedScanView(scan);
  assertEqual("object specialty_data (not a JSON string) is accepted", view?.buyPriceSource, "user");
}

{
  // id is numeric (a raw DB row, not yet through any JSON round trip) -
  // result.id must still come back as a string (ScannerScreen/stale-scan
  // guards key off String(...) everywhere else).
  const scan = { id: 42, buy_price: 0, specialty_data: "{}" };
  const view = buildSavedScanView(scan);
  assertEqual("numeric scan id is coerced to a string on result.id", view?.result?.id, "42");
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
