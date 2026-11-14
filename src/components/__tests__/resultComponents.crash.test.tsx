// resultComponents.crash.test.tsx (2026-11-14, crash-reporting item 3) —
// mutation-tests the scan RESULT screen's two field-driven sub-components
// (SegmentOutcomesBlock, ProfitFlexHero) against a normal, successful
// /api/lens-shaped payload, then every top-level-field variant: removed,
// null, wrong JS type, and NaN (numeric fields only). A bad/unexpected
// server field is exactly the failure mode the App.tsx/ScannerScreen
// ErrorBoundaries were built to catch ("Couldn't read that one. Try
// again.") - this test exists to catch it BEFORE a real device does.
//
// SCOPED TO THESE TWO COMPONENTS, not the whole 3000+-line ScannerScreen
// (time-boxed per this task's own instruction): both are the exact pieces
// ScannerScreen already wraps in their OWN dedicated ErrorBoundaries
// (SegmentOutcomesBlock sits right under the "result card boundary" -
// ProfitFlexHero IS that boundary's content) specifically because they read
// the most raw server fields directly - they are where a malformed field is
// most likely to throw during render, and the place a fix actually belongs.
// Any throw found here gets fixed in the component itself, never papered
// over by only adding a bigger ErrorBoundary around it.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import SegmentOutcomesBlock, { SegmentOutcomesData } from "../SegmentOutcomesBlock";
import ProfitFlexHero from "../ProfitFlexHero";
import { classifyOutcome } from "../../lib/outcomeTier";

// ── mutation generator ──────────────────────────────────────────────────
// Given a valid props object, produces one variant per (field x mutation):
// removed (delete key), null, wrong-type (a value of a different JS type),
// and - for fields whose valid value is a number - NaN.
function mutate(valid: Record<string, any>): Array<{ field: string; mutation: string; props: Record<string, any> }> {
  const out: Array<{ field: string; mutation: string; props: Record<string, any> }> = [];
  for (const field of Object.keys(valid)) {
    const v = valid[field];
    const removed = { ...valid }; delete removed[field];
    out.push({ field, mutation: "removed", props: removed });
    out.push({ field, mutation: "null", props: { ...valid, [field]: null } });
    let wrong: any;
    if (Array.isArray(v)) wrong = "not-an-array";
    else if (typeof v === "function") wrong = "not-a-function";
    else if (typeof v === "object" && v !== null) wrong = "not-an-object";
    else if (typeof v === "number") wrong = "not-a-number";
    else if (typeof v === "boolean") wrong = "not-a-boolean";
    else if (typeof v === "string") wrong = 99999;
    else wrong = {};
    out.push({ field, mutation: "wrong-type", props: { ...valid, [field]: wrong } });
    if (typeof v === "number") {
      out.push({ field, mutation: "NaN", props: { ...valid, [field]: NaN } });
    }
  }
  return out;
}

async function renderOk(el: React.ReactElement) {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(el);
  });
  return tree!;
}

// ── SegmentOutcomesBlock ─────────────────────────────────────────────────
const VALID_SEGMENT: SegmentOutcomesData = {
  label: "brand_itemtype",
  segmentLabel: "Nike sneakers",
  level: "brand_itemtype",
  resolvedCount: 1440,
  soldCount: 900,
  sellThroughRate: 0.62,
  sellThroughPct: 62,
  medianSoldPrice: 45,
  medianBuyPrice: 18,
  medianDaysToSell: 12,
  conditionBasis: "mixed",
  summaryLine: "some summary",
  conditionCaveat: null,
};

describe("SegmentOutcomesBlock - normal payload", () => {
  test("renders a complete, valid segment without throwing", async () => {
    const tree = await renderOk(<SegmentOutcomesBlock segment={VALID_SEGMENT} />);
    expect(tree.toJSON()).toBeTruthy();
  });
  test("renders null segment (withheld/no data) as nothing, not a crash", async () => {
    const tree = await renderOk(<SegmentOutcomesBlock segment={null} />);
    expect(tree.toJSON()).toBeNull();
  });
});

describe("SegmentOutcomesBlock - field mutations", () => {
  for (const { field, mutation, props } of mutate(VALID_SEGMENT as any)) {
    test(`segment.${field} ${mutation} does not crash the render`, async () => {
      await renderOk(<SegmentOutcomesBlock segment={props as any} />);
    });
  }
});

// ── ProfitFlexHero ────────────────────────────────────────────────────────
const BUY_OUTCOME = classifyOutcome({
  noFlipMargin: false, netProfit: 20, roi: 40, daysToSell: 10,
  velocityTier: null, sellThrough: null, dataQuality: null, sellPrice: null, sellTimeLabel: null,
});

const VALID_HERO_PROPS = {
  outcome: BUY_OUTCOME,
  itemName: "Nike Dri-FIT Shirt",
  categoryLine: "Apparel · Nike",
  photoBase64: "/9j/4AAQSkZJRg==",
  onEdit: () => {},
  isSkip: false,
  heroProfit: 20,
  profitLabel: "actual profit after fees",
  maxBuy: 35,
  maxBuyReasoning: "Keeps you at a 40%+ margin after fees and shipping.",
  maxBuyBasis: "Based on typical sale ($45)",
  maxBuyBasisLine: null as string | null,
  riskAtLowEndLine: null as string | null,
  maxBuyLocked: false,
  onUpgradePress: () => {},
  dataTag: "● REAL DATA",
  dataTagColor: "#1db954",
  confidenceLabel: "High confidence",
  confidenceColor: "#1db954",
  secondaryStats: [{ label: "ROI", value: "40%" }, { label: "Sell time", value: "~12 days" }],
  footNote: "48 real flips · mixed condition",
  skipDetail: null as string | null,
  noVerdictPrompt: null as string | null,
  flashSeq: 0,
  heroSizeSmall: false,
};

describe("ProfitFlexHero - normal payload", () => {
  test("renders a complete BUY-tier result without throwing", async () => {
    const tree = await renderOk(<ProfitFlexHero {...VALID_HERO_PROPS} />);
    expect(tree.toJSON()).toBeTruthy();
  });
  test("renders a complete SKIP-tier result without throwing", async () => {
    const skipOutcome = classifyOutcome({
      noFlipMargin: false, netProfit: -5, roi: -10, daysToSell: 20,
      velocityTier: null, sellThrough: null, dataQuality: null, sellPrice: null, sellTimeLabel: null,
    });
    const tree = await renderOk(
      <ProfitFlexHero {...VALID_HERO_PROPS} outcome={skipOutcome} isSkip skipDetail="Comparable sales are thin right now." />
    );
    expect(tree.toJSON()).toBeTruthy();
  });
});

describe("ProfitFlexHero - skipDetail field mutations (isSkip branch)", () => {
  // skipDetail only ever renders while isSkip is true - the base fixture
  // above has isSkip:false, so mutating skipDetail there never actually
  // exercises its render line. Covered separately, on a SKIP-tier base.
  const skipBase = { ...VALID_HERO_PROPS, isSkip: true, skipDetail: "Comparable sales are thin right now." };
  for (const { field, mutation, props } of mutate({ skipDetail: skipBase.skipDetail })) {
    test(`skipDetail ${mutation} does not crash the render (isSkip branch)`, async () => {
      await renderOk(<ProfitFlexHero {...skipBase} {...(props as any)} />);
    });
  }
});

describe("ProfitFlexHero - field mutations", () => {
  for (const { field, mutation, props } of mutate(VALID_HERO_PROPS)) {
    // `outcome`/`onEdit` are caller-computed, never raw server fields passed
    // straight through (ScannerScreen always derives `outcome` via
    // classifyOutcome(), which never returns null/undefined - see
    // outcomeTier.ts - and always provides a real onEdit closure) - removed/
    // null variants of these two are not a reachable real-world shape, so
    // they're skipped rather than asserted on (a wrong-type `outcome` IS
    // still covered, since a malformed server field feeding into
        // classifyOutcome's own inputs is exactly what outcomeTier.test.ts covers).
    if ((field === "outcome" || field === "onEdit") && (mutation === "removed" || mutation === "null")) continue;
    test(`${field} ${mutation} does not crash the render`, async () => {
      await renderOk(<ProfitFlexHero {...(props as any)} />);
    });
  }
});
