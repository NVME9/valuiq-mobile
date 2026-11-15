// scanResultPayloads.crash.test.tsx (2026-11-15, fix/tier-crash) —
// task 2's "run the result view-model code with these payload shapes"
// check, via the normal jest runner (no new dependency) so it's part of
// `npm test`/CI instead of a one-off script that bit-rots. Each shape
// below is a named, plausible RESULT-TIME payload (missing verdict,
// missing maxBuy, the "Full analysis unavailable" fallback, no tag price,
// no sold data, empty arrays, null for every nested object) run through
// the real decision pipeline (classifyOutcome/classifyHeroVerdictLocal/
// metaForHeroVerdict, lib/outcomeTier.ts) and then the two result
// sub-components that actually render those fields (ProfitFlexHero,
// SegmentOutcomesBlock) - the same two components
// resultComponents.crash.test.tsx mutation-tests generically. This file
// is the targeted complement: specific, named, real-world shapes rather
// than a generic field-by-field mutation sweep.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ProfitFlexHero from "../../components/ProfitFlexHero";
import SegmentOutcomesBlock from "../../components/SegmentOutcomesBlock";
import { classifyOutcome, classifyHeroVerdictLocal, metaForHeroVerdict } from "../../lib/outcomeTier";
import { selectRecentSales } from "../../lib/recentSales";

async function renderOk(el: React.ReactElement) {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(el);
  });
  return tree!;
}

// Mirrors ScannerScreen.tsx's own outcome assembly closely enough to
// exercise the real metaForHeroVerdict call this test suite cares about -
// not a reimplementation of the whole screen, just the headline->outcome
// step that used to crash.
function buildOutcome(opts: { enteredBp: number; hasItemLevelSellEvidence: boolean; netProfit: number; roi: number; priceBasisTier?: string; comparableRangeScope?: "title_tokens" | "brand_category" | "category" | null }) {
  const base = classifyOutcome({
    noFlipMargin: false, netProfit: opts.netProfit, roi: opts.roi, daysToSell: null,
    velocityTier: null, sellThrough: null, dataQuality: null, sellPrice: null, sellTimeLabel: null,
  });
  if (opts.enteredBp <= 0) return base;
  const headline = classifyHeroVerdictLocal({
    tier: opts.priceBasisTier || "ai_only", buyPrice: opts.enteredBp, netProfit: opts.netProfit, roi: opts.roi,
    sellThroughPct: null, comparableRangeScope: opts.comparableRangeScope ?? null,
  });
  if (headline == null) return base;
  const meta = metaForHeroVerdict(headline)!;
  return { tier: meta.tier, emoji: meta.emoji, label: headline, accent: meta.accent, copy: base.copy, adjustedROI: base.adjustedROI, daysUsed: base.daysUsed };
}

describe("scan result payload shapes - none throw", () => {
  test("missing verdict (no tag price entered yet, no headline)", async () => {
    const outcome = buildOutcome({ enteredBp: 0, hasItemLevelSellEvidence: false, netProfit: 0, roi: 0 });
    const tree = await renderOk(
      <ProfitFlexHero
        outcome={outcome} itemName="Unknown Item" categoryLine={null} onEdit={() => {}} isSkip={false}
        maxBuy={25} noVerdictPrompt="Type the tag price to get Buy or Pass."
      />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  test("missing maxBuy (withheld/null ceiling)", async () => {
    const outcome = buildOutcome({ enteredBp: 15, hasItemLevelSellEvidence: false, netProfit: 0, roi: 0, priceBasisTier: "ai_only" });
    const tree = await renderOk(
      <ProfitFlexHero
        outcome={outcome} itemName="Thrift Mystery Item" categoryLine="Home goods" onEdit={() => {}}
        isSkip={outcome.tier === "skip" || outcome.tier === "estimate"} maxBuy={null}
      />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  test("the comparable_range/category-scope CHECK ITEM shape - the exact on-device crash trigger", async () => {
    // MEASURED BUG (2026-11-15): before the metaForHeroVerdict fix, this
    // exact combination threw "Cannot read property 'tier' of undefined"
    // right after "Crunching the numbers" - ScannerScreen's own META table
    // had no "CHECK ITEM" entry.
    const outcome = buildOutcome({
      enteredBp: 12, hasItemLevelSellEvidence: false, netProfit: 8, roi: 40,
      priceBasisTier: "comparable_range", comparableRangeScope: "category",
    });
    expect(outcome.tier).toBe("thin");
    expect(outcome.label).toBe("CHECK ITEM");
    const tree = await renderOk(
      <ProfitFlexHero outcome={outcome} itemName="Unbranded Figurine" categoryLine={null} onEdit={() => {}} isSkip={outcome.tier === "skip"} maxBuy={14} />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  test('"Full analysis unavailable" fallback payload', async () => {
    const outcome = classifyOutcome({
      noFlipMargin: false, netProfit: -5, roi: -20, daysToSell: null,
      velocityTier: null, sellThrough: null, dataQuality: null, sellPrice: null, sellTimeLabel: null,
    });
    const tree = await renderOk(
      <ProfitFlexHero
        outcome={outcome} itemName="Unidentified Item" categoryLine={null} onEdit={() => {}}
        isSkip skipDetail="Full analysis unavailable for this item." maxBuy={null}
      />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  test("no tag price (buyPrice empty string upstream, enteredBp 0)", async () => {
    const outcome = buildOutcome({ enteredBp: 0, hasItemLevelSellEvidence: false, netProfit: 0, roi: 0 });
    const tree = await renderOk(
      <ProfitFlexHero outcome={outcome} itemName="Candle" categoryLine={null} onEdit={() => {}} isSkip={false} maxBuy={9} noVerdictPrompt="Type the tag price to get Buy or Pass." />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  test("no sold data (segment null, sales empty, sell price unknown)", async () => {
    const outcome = buildOutcome({ enteredBp: 10, hasItemLevelSellEvidence: false, netProfit: 0, roi: 0, priceBasisTier: "ai_only" });
    const salesView = selectRecentSales([]);
    expect(salesView.sales).toEqual([]);
    const segTree = await renderOk(<SegmentOutcomesBlock segment={null} />);
    expect(segTree.toJSON()).toBeNull();
    const heroTree = await renderOk(
      <ProfitFlexHero
        outcome={outcome} itemName="Mystery Box" categoryLine={null} onEdit={() => {}}
        isSkip={outcome.tier === "skip" || outcome.tier === "estimate"} maxBuy={null}
        secondaryStats={[{ label: "sell price", value: "—" }, { label: "ROI", value: "—" }, { label: "to sell", value: "not enough data yet" }]}
      />
    );
    expect(heroTree.toJSON()).toBeTruthy();
  });

  test("empty arrays (secondaryStats: [])", async () => {
    const outcome = buildOutcome({ enteredBp: 20, hasItemLevelSellEvidence: true, netProfit: 20, roi: 40, priceBasisTier: "item_moat" });
    const tree = await renderOk(
      <ProfitFlexHero outcome={outcome} itemName="Nike Hoodie" categoryLine="Apparel" onEdit={() => {}} isSkip={false} maxBuy={30} secondaryStats={[]} />
    );
    expect(tree.toJSON()).toBeTruthy();
  });

  test("null for every nested/optional object field", async () => {
    const outcome = buildOutcome({ enteredBp: 0, hasItemLevelSellEvidence: false, netProfit: 0, roi: 0 });
    const tree = await renderOk(
      <ProfitFlexHero
        outcome={outcome} itemName="Item" categoryLine={null} onEdit={() => {}} isSkip={false}
        maxBuy={null} maxBuyReasoning={undefined} maxBuyBasis={null} maxBuyBasisLine={null}
        riskAtLowEndLine={null} dataTag={undefined} dataTagColor={undefined}
        confidenceLabel={null} confidenceColor={undefined} secondaryStats={undefined}
        footNote={undefined} skipDetail={null} noVerdictPrompt={null} photoBase64={null}
      />
    );
    expect(tree.toJSON()).toBeTruthy();
    const segTree = await renderOk(<SegmentOutcomesBlock segment={null} />);
    expect(segTree.toJSON()).toBeNull();
  });
});
