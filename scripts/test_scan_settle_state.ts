// scripts/test_scan_settle_state.ts — pure-function tests for
// src/lib/scanSettleState.ts (stale-state / rejected-tag-read PATCH fix).
// No React, no simulator - plain function calls.
// Run: npx tsx scripts/test_scan_settle_state.ts
import { shouldPatchSettledVerdict, settleSignature, SettledVerdict } from "../src/lib/scanSettleState";

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

function v(overrides: Partial<SettledVerdict> = {}): SettledVerdict {
  return { scanId: "scan-A", buyPrice: 72, buyPriceSource: "tag", netProfit: 10, roi: 50, decision: "BUY", ...overrides };
}

// ── never patch a rejected read (Edit tapped, field left blank) ──
assertEqual(
  "rejected: blank buyPrice (0) never patches, even with a stale source left over",
  shouldPatchSettledVerdict(v({ buyPrice: 0, buyPriceSource: "tag" }), ""),
  false
);

// ── never patch an only-suggested read (auto-seeded, never confirmed/typed) ──
assertEqual(
  "only-suggested: a nonzero buyPrice with no source never patches",
  shouldPatchSettledVerdict(v({ buyPrice: 72, buyPriceSource: null }), ""),
  false
);

// ── real sources DO patch ──
assertEqual(
  "confirmed: user tapped Confirm on the suggested tag read - patches",
  shouldPatchSettledVerdict(v({ buyPriceSource: "tag" }), ""),
  true
);
assertEqual(
  "typed: user manually entered a price - patches",
  shouldPatchSettledVerdict(v({ buyPriceSource: "user" }), ""),
  true
);

// ── no scanId at all (response never carried an id) never patches ──
assertEqual(
  "no scanId: never patches regardless of price/source",
  shouldPatchSettledVerdict(v({ scanId: null }), ""),
  false
);
assertEqual(
  "null verdict (nothing rendered yet this scan): never patches",
  shouldPatchSettledVerdict(null, ""),
  false
);

// ── dedup: the exact same settled signature never re-patches ──
{
  const verdict = v();
  const sig = settleSignature(verdict);
  assertEqual("dedup: identical signature to the last patch is skipped", shouldPatchSettledVerdict(verdict, sig), false);
  assertEqual("dedup: a genuinely different price DOES patch again", shouldPatchSettledVerdict(v({ buyPrice: 40 }), sig), true);
}

// ── cross-scan: the older scan's last-patched signature never suppresses
//    a different, newer scan's genuinely new settle (scanId is part of the
//    signature, so two different scans can never collide) ──
{
  const older = v({ scanId: "scan-A", buyPrice: 72, decision: "BUY" });
  const olderSig = settleSignature(older);
  const newer = v({ scanId: "scan-B", buyPrice: 72, decision: "BUY" }); // same price/decision, DIFFERENT scan
  assertEqual("cross-scan: a different scanId with identical other fields still patches", shouldPatchSettledVerdict(newer, olderSig), true);
}

// ── round trip: suggested -> rejected -> typed -> settles ──
{
  let verdict = v({ buyPrice: 72, buyPriceSource: null }); // fresh auto-seed, untouched
  assertEqual("round trip 1: fresh auto-seed never patches", shouldPatchSettledVerdict(verdict, ""), false);
  verdict = v({ buyPrice: 0, buyPriceSource: null }); // user tapped Edit (reject)
  assertEqual("round trip 2: rejected (blank) never patches", shouldPatchSettledVerdict(verdict, ""), false);
  verdict = v({ buyPrice: 36, buyPriceSource: "user" }); // user then typed a real price
  assertEqual("round trip 3: typed after rejecting now patches", shouldPatchSettledVerdict(verdict, ""), true);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
