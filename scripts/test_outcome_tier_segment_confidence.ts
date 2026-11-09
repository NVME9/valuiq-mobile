// scripts/test_outcome_tier_segment_confidence.ts — pure-function tests
// for src/lib/outcomeTier.ts's classifyHeroVerdictLocal (ZURU rejection
// follow-up, 2026-11-09): segmentBrandAgnostic and priceVsReferenceSanityCapped
// mirror deal-ai-pro's lib/priceBasis.ts classifyHeroVerdict exactly. No
// React, no simulator - plain function calls.
// Run: npx tsx scripts/test_outcome_tier_segment_confidence.ts
import { classifyHeroVerdictLocal, decisionFromVerdict } from "../src/lib/outcomeTier";

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

// ── 1. ZURU-LIKE CASE: itemtype (brand-agnostic) segment, tag $7, median
// $40 - real numbers from ZURU's own actual stored scan. Must be THIN,
// which this screen's withholdConfidentNumbers flag (ScannerScreen.tsx)
// then nulls Max buy/profit/ROI off of - this test covers the verdict
// half of that; ScannerScreen.tsx's own withholding is covered by its
// `withholdConfidentNumbers = isAiOnly || !!result.conditionThinSampleNote
// || segmentBrandAgnostic || priceVsReferenceSanityCapped` (not a pure
// function, not unit-tested here - no test harness mounts that screen).
// ──
assertEqual(
  "ZURU-like: itemtype segment, $7 tag/$40 median -> THIN",
  classifyHeroVerdictLocal({
    tier: "segment", buyPrice: 7, netProfit: 22.69, roi: 324, sellThroughPct: null,
    segmentBrandAgnostic: true,
    priceVsReferenceSanityCapped: true, // $40 median is also >4x the $7 tag - both guards fire together on the real numbers
  }),
  "THIN"
);
assertEqual(
  "ZURU-like: decision must never be BUY",
  decisionFromVerdict(classifyHeroVerdictLocal({
    tier: "segment", buyPrice: 7, netProfit: 22.69, roi: 324, sellThroughPct: null,
    segmentBrandAgnostic: true, priceVsReferenceSanityCapped: true,
  })),
  "WATCH"
);

// ── 2. BRAND-MATCHED SEGMENT, NORMAL RATIO: level brand_itemtype, price
// well within 4x of the median - unchanged, still reaches WORTH A LOOK/BUY. ──
assertEqual(
  "brand_itemtype segment, normal ratio -> WORTH A LOOK (unchanged)",
  classifyHeroVerdictLocal({
    tier: "segment", buyPrice: 7, netProfit: 7.69, roi: 110, sellThroughPct: null,
    segmentBrandAgnostic: false, priceVsReferenceSanityCapped: false,
  }),
  "WORTH A LOOK"
);
assertEqual(
  "brand_itemtype segment, normal ratio -> decision BUY (unchanged)",
  decisionFromVerdict(classifyHeroVerdictLocal({
    tier: "segment", buyPrice: 7, netProfit: 7.69, roi: 110, sellThroughPct: null,
    segmentBrandAgnostic: false, priceVsReferenceSanityCapped: false,
  })),
  "BUY"
);

// ── 3. EXACT_ITEM, HIGH RATIO: exact_item is exempt from the sanity
// guard even if a caller passes it true - stays SOLID (sellThroughPct
// null means it falls to the ladder's final default, same as deal-ai-
// pro's own exact_item test fixtures). ──
assertEqual(
  "exact_item with a high ratio stays SOLID (exempt from the sanity guard)",
  classifyHeroVerdictLocal({
    tier: "exact_item", buyPrice: 7, netProfit: 22.69, roi: 324, sellThroughPct: null,
    priceVsReferenceSanityCapped: true, // a caller should never set this for exact_item; the function must not trust it blindly either
  }),
  "SOLID"
);

// ── 4. A REAL LOSS STILL READS PASS, regardless of either new guard -
// netProfit<=0 is an unconditional PASS, checked before both. ──
assertEqual(
  "a real loss reads PASS even with both new guards true",
  classifyHeroVerdictLocal({
    tier: "segment", buyPrice: 50, netProfit: -12.34, roi: -25, sellThroughPct: null,
    segmentBrandAgnostic: true, priceVsReferenceSanityCapped: true,
  }),
  "PASS"
);

// ── 5. MISSING FIELDS DO NOT THROW: neither new param passed at all
// (an older caller, or a response shape predating this change) - both
// default to falsy, same as every other optional param here. ──
assertEqual(
  "missing segmentBrandAgnostic/priceVsReferenceSanityCapped does not throw, falls through to existing logic",
  classifyHeroVerdictLocal({ tier: "segment", buyPrice: 7, netProfit: 7.69, roi: 110, sellThroughPct: null }),
  "WORTH A LOOK"
);
assertEqual(
  "missing tier-irrelevant fields (comparableRangeConfidence/Scope) on a segment call does not throw",
  classifyHeroVerdictLocal({ tier: "segment", buyPrice: 7, netProfit: 22.69, roi: 324, sellThroughPct: null, segmentBrandAgnostic: true }),
  "THIN"
);

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
