// scripts/test_tag_confirm_state.ts — pure-function tests for
// src/lib/tagConfirmState.ts (review fix #4: "confirm, edit, clear,
// withheld, accepted"). No React, no simulator - plain function calls.
// Run: npx tsx scripts/test_tag_confirm_state.ts
import {
  deriveTagConfirmPending, confirmTagRead, editTagRead, clearForNewScan,
} from "../src/lib/tagConfirmState";

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

// ── withheld: both passes disagreed or weren't both high-confidence ──
assertEqual(
  "withheld: a real tag read with needsConfirmation=true shows the card",
  deriveTagConfirmPending({ retailPriceRead: 11.5, retailPriceNeedsConfirmation: true }),
  true
);
assertEqual(
  "withheld: price=0 never shows the card even if needsConfirmation is true",
  deriveTagConfirmPending({ retailPriceRead: 0, retailPriceNeedsConfirmation: true }),
  false
);
assertEqual(
  "withheld: null price never shows the card",
  deriveTagConfirmPending({ retailPriceRead: null, retailPriceNeedsConfirmation: true }),
  false
);

// ── accepted: both passes agreed at high confidence ──
assertEqual(
  "accepted: needsConfirmation=false never shows the card, regardless of price",
  deriveTagConfirmPending({ retailPriceRead: 17.5, retailPriceNeedsConfirmation: false }),
  false
);
assertEqual(
  "accepted: needsConfirmation=null (no tag read attempt at all) never shows the card",
  deriveTagConfirmPending({ retailPriceRead: null, retailPriceNeedsConfirmation: null }),
  false
);

// ── confirm: user taps "Confirm $X" ──
assertEqual(
  "confirm: sets buyPrice to the exact tag value and dismisses the card",
  confirmTagRead(17.5),
  { buyPrice: "17.5", tagConfirmPending: false }
);
assertEqual(
  "confirm: whole-dollar value stringifies without a trailing .0",
  confirmTagRead(39),
  { buyPrice: "39", tagConfirmPending: false }
);

// ── edit: user taps "Edit" ──
assertEqual(
  "edit: clears buyPrice (never keeps the withheld suggestion around) and dismisses the card",
  editTagRead(),
  { buyPrice: "", tagConfirmPending: false }
);

// ── clear: a fresh/re-scan resets prior state ──
assertEqual(
  "clear: resets both buyPrice and tagConfirmPending for a new scan",
  clearForNewScan(),
  { buyPrice: "", tagConfirmPending: false }
);

// ── round trip: withheld -> confirm -> edit -> clear -> withheld again ──
{
  let ui = clearForNewScan();
  assertEqual("round trip 1: starts clear", ui, { buyPrice: "", tagConfirmPending: false });
  const pending = deriveTagConfirmPending({ retailPriceRead: 28, retailPriceNeedsConfirmation: true });
  assertEqual("round trip 2: a withheld $28 read shows the card", pending, true);
  ui = confirmTagRead(28);
  assertEqual("round trip 3: confirming sets buyPrice=28, card dismissed", ui, { buyPrice: "28", tagConfirmPending: false });
  ui = editTagRead();
  assertEqual("round trip 4: editing after confirming still clears buyPrice", ui, { buyPrice: "", tagConfirmPending: false });
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
