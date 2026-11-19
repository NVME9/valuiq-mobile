// shareCardEntryPoints.test.ts — the TONE BUG audit (v4): one test per real
// share-studio entry point, each run through buildShareCardPayload with a
// PASS, THIN, CHECK ITEM, WORTH A LOOK, and SOLID fixture and asserting
// stamp+tone - not just the pure stampForHeroVerdict/toneForHeroVerdict
// function (already covered in shareCardPayload.test.ts), but the actual
// per-entry-point input-resolution helper each screen calls before handing
// heroVerdict/toneOverride to <ShareStudio>. A future edit that bypasses one
// of these helpers (recomputes its own tone, reads a stale `decision` field,
// etc.) fails here before it ever reaches a device.
import { buildShareCardPayload, resolveScanShareVerdict, resolveHistoryShareInput } from "../shareCardPayload";
import { HeroVerdict } from "../outcomeTier";

const FIXTURES: { verdict: HeroVerdict; stamp: string; tone: "red" | "yellow" | "lime" }[] = [
  { verdict: "PASS", stamp: "PASS", tone: "red" },
  { verdict: "THIN", stamp: "THIN", tone: "yellow" },
  { verdict: "CHECK ITEM", stamp: "CHECK ITEM", tone: "yellow" },
  { verdict: "WORTH A LOOK", stamp: "WORTH A LOOK", tone: "lime" },
  { verdict: "SOLID", stamp: "SOLID", tone: "lime" },
];

describe("ScannerScreen entry point (resolveScanShareVerdict)", () => {
  test.each(FIXTURES)("unlocked plan, verdict $verdict -> stamp $stamp, tone $tone", ({ verdict, stamp, tone }) => {
    const heroVerdict = resolveScanShareVerdict(verdict, /* maxBuyLocked */ false);
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Columbia Hat",
      paidPrice: 10, heroSellPrice: 16, verdict: heroVerdict, isEstimate: false,
    });
    expect(p.stamp).toBe(stamp);
    expect(p.tone).toBe(tone);
  });

  test("a paywalled plan (maxBuyLocked) never leaks the real verdict's stamp/tone - no stamp at all, falls back to yellow", () => {
    const heroVerdict = resolveScanShareVerdict("SOLID", /* maxBuyLocked */ true);
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Columbia Hat",
      paidPrice: 10, heroSellPrice: 16, verdict: heroVerdict, isEstimate: false,
    });
    expect(p.stamp).toBeUndefined();
    expect(p.tone).toBe("yellow");
  });
});

describe("HistoryScreen re-share entry point (resolveHistoryShareInput)", () => {
  test.each(FIXTURES)("stored heroVerdict $verdict wins over a stale decision field -> stamp $stamp, tone $tone", ({ verdict, stamp, tone }) => {
    // A row whose legacy `decision` column disagrees with its real stored
    // heroVerdict - exactly the founder-screenshot shape (Bentgo lunch box:
    // decision="BUY", heroVerdict.headline="PASS") - the stored verdict
    // must win regardless of what `decision` says.
    const specialtyDataRaw = JSON.stringify({ heroVerdict: { headline: verdict } });
    const { heroVerdict: resolved, toneOverride } = resolveHistoryShareInput({
      specialtyDataRaw, decision: "BUY", isLoggedWin: false,
    });
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Bentgo Lunch Box",
      paidPrice: 8, heroSellPrice: 14, verdict: resolved, toneOverride, isEstimate: false,
    });
    expect(p.stamp).toBe(stamp);
    expect(p.tone).toBe(tone);
  });

  test("legacy row with no stored heroVerdict falls back to toneForDecision(decision)", () => {
    const { heroVerdict, toneOverride } = resolveHistoryShareInput({
      specialtyDataRaw: null, decision: "BUY", isLoggedWin: false,
    });
    expect(heroVerdict).toBeNull();
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Item",
      paidPrice: 8, heroSellPrice: 14, verdict: heroVerdict, toneOverride, isEstimate: false,
    });
    expect(p.tone).toBe("lime");
  });

  test("a win hand-off (isLoggedWin) never consults the stored verdict or decision at all", () => {
    const { heroVerdict, toneOverride } = resolveHistoryShareInput({
      specialtyDataRaw: JSON.stringify({ heroVerdict: { headline: "PASS" } }),
      decision: "PASS",
      isLoggedWin: true,
    });
    expect(heroVerdict).toBeNull();
    expect(toneOverride).toBeUndefined();
  });
});

// SaleCapturePrompt.tsx / LogSaleModal.tsx's win hand-off (consumed by
// ScannerScreen/HistoryScreen/App.tsx's push-tap flow alike) never passes a
// HeroVerdict at all - a logged sale's card is always the win variant,
// whose stamp/tone come from the profit sign alone (see
// shareCardPayload.test.ts's "buildShareCardPayload - win variant" suite
// for the profit/loss/break-even fixtures). This is a documentation test:
// confirming that shape, not re-testing buildShareCardPayload's win branch.
describe("SaleCapturePrompt / LogSaleModal / App.tsx win hand-off", () => {
  test("a profitable sale is always variant 'win' with a SOLD stamp, never a scan heroVerdict", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Columbia Hat",
      boughtPrice: 10, soldPrice: 22, profit: 12,
    });
    expect(p.variant).toBe("win");
    expect(p.stamp).toBe("SOLD");
    expect(p.tone).toBe("lime");
    expect((p as any).heroVerdict).toBeUndefined();
  });
});
