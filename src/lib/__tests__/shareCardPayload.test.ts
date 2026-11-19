// shareCardPayload.test.ts — coverage for the server-share-card payload
// builder and the "no share on a loss" rule (see shareCardPayload.ts's own
// header comment - everything here is pure, no network/file I/O).
import { buildShareCardPayload, buildShareVideoPayload, canShareWin, stampForHeroVerdict, toneForHeroVerdict, heroLabelForShareCard, resolveHistoryWinData } from "../shareCardPayload";
import { HeroVerdict } from "../outcomeTier";

describe("buildShareCardPayload - scan variant", () => {
  test("estimate: sets estimate:true and caption 'ESTIMATE'", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Vintage Leather Jacket",
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: true,
    });
    expect(p.estimate).toBe(true);
    expect(p.caption).toBe("ESTIMATE");
    expect(p.paid).toBe("$20");
    expect(p.hero).toBe("$65");
  });

  test("PASS verdict: red tone, PASS stamp", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "feed", itemName: "Chipped Mug",
      paidPrice: 5, heroSellPrice: 4, verdict: "PASS", isEstimate: false,
    });
    expect(p.tone).toBe("red");
    expect(p.stamp).toBe("PASS");
  });

  test("hidePrice: set directly, and implied when paid is unknown - either way the contract's required `paid` string is still present", () => {
    const explicit = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, hidePrice: true,
    });
    expect(explicit.hidePrice).toBe(true);
    expect(explicit.paid).toBe("$10");

    const unknown = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: null, heroSellPrice: 30, verdict: "SOLID", isEstimate: false,
    });
    expect(unknown.hidePrice).toBe(true);
    expect(unknown.paid).toBe("$0");
  });

  test("long name: passed through verbatim, never truncated", () => {
    const longName = "Vintage Carhartt Detroit Jacket Size XL Union Made USA Blanket Lined Chore Coat";
    const p = buildShareCardPayload({
      variant: "scan", format: "square", itemName: longName,
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: false,
    });
    expect(p.name).toBe(longName);
  });

  test("missing handle: omitted from the payload entirely, never sent as an empty string", () => {
    const noHandle = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, handle: null,
    });
    expect(noHandle.handle).toBeUndefined();

    const blankHandle = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, handle: "   ",
    });
    expect(blankHandle.handle).toBeUndefined();

    const withHandle = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, handle: "@thriftflips",
    });
    expect(withHandle.handle).toBe("@thriftflips");
  });

  test("toneOverride wins over the verdict's own mapping (History's decision-only rows)", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: null, toneOverride: "lime", isEstimate: false,
    });
    expect(p.tone).toBe("lime");
  });
});

// EVERY TIER THE RESULT SCREEN CAN SHOW (founder screenshot fix, 2026-11-19):
// a SOLID scan used to stamp "GOOD FLIP" and a PASS scan could show up lime/
// green via a disconnected tone source (see HistoryScreen.tsx's
// resolveStoredHeroVerdict comment) - the card's stamp and tone must now be
// exactly the verdict label and tier ScannerScreen.tsx's result banner shows
// (lib/outcomeTier.ts's `label: headline` - the tier IS the verdict), one
// source of truth, for every real HeroVerdict value.
describe("stampForHeroVerdict / toneForHeroVerdict - every result-screen tier", () => {
  const TABLE: { verdict: HeroVerdict; stamp: string | null; tone: "red" | "yellow" | "lime" }[] = [
    { verdict: "PASS", stamp: "PASS", tone: "red" },
    { verdict: "THIN", stamp: "THIN", tone: "yellow" },
    { verdict: "CHECK ITEM", stamp: "CHECK ITEM", tone: "yellow" },
    { verdict: "WORTH A LOOK", stamp: "WORTH A LOOK", tone: "lime" },
    { verdict: "SOLID", stamp: "SOLID", tone: "lime" },
    { verdict: null, stamp: null, tone: "yellow" },
  ];

  test.each(TABLE)("$verdict -> stamp $stamp, tone $tone", ({ verdict, stamp, tone }) => {
    expect(stampForHeroVerdict(verdict)).toBe(stamp);
    expect(toneForHeroVerdict(verdict)).toBe(tone);
  });

  test("buildShareCardPayload's stamp/tone match the table for every tier", () => {
    for (const { verdict, stamp, tone } of TABLE) {
      const p = buildShareCardPayload({
        variant: "scan", format: "story", itemName: "Item",
        paidPrice: 10, heroSellPrice: 30, verdict, isEstimate: false,
      });
      expect(p.stamp).toBe(stamp ?? undefined);
      expect(p.tone).toBe(tone);
    }
  });
});

describe("buildShareVideoPayload - Make video", () => {
  test("forces format to 'story' regardless of the currently-selected format tab", () => {
    const p = buildShareVideoPayload({
      variant: "scan", format: "square", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false,
    });
    expect(p.format).toBe("story");
  });

  test("every other field matches what the same inputs would build for the image call", () => {
    const input = {
      variant: "scan" as const, format: "feed" as const, itemName: "Vintage Jacket",
      paidPrice: 20, heroSellPrice: 65, verdict: "WORTH A LOOK" as const, isEstimate: false,
      hook: "Would you flip it?", handle: "@thriftflips", hidePrice: false, accent: "#a3e635",
    };
    const imagePayload = buildShareCardPayload(input);
    const videoPayload = buildShareVideoPayload(input);
    expect(videoPayload).toEqual({ ...imagePayload, format: "story" });
  });

  test("win variant: same body shape as the image call, format forced to story", () => {
    const p = buildShareVideoPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 20, soldPrice: 65, profit: 45,
    });
    expect(p.format).toBe("story");
    expect(p.stamp).toBe("SOLD");
    expect(p.tone).toBe("lime");
  });
});

// WIN-VARIANT STAMP/TONE (v5, founder device bug: a real LOSS - Mainstays
// 21.5qt canner, paid 19.62/sold 5/profit -15.28 - still stamped "SOLD" and
// read as a win). Three-way on profit's sign: a real loss is the only case
// that stamps "LOSS"/reads red - break-even is neutral (treated as a win:
// "SOLD"/lime/"BREAK EVEN"), never dressed up OR down.
describe("buildShareCardPayload - win variant", () => {
  test("win with profit (has cents): lime tone, SOLD stamp, 'PROFIT AFTER FEES' caption, signed hero with cents", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 20, soldPrice: 65, profit: 45,
    });
    expect(p.tone).toBe("lime");
    expect(p.stamp).toBe("SOLD");
    expect(p.caption).toBe("PROFIT AFTER FEES");
    expect(p.hero).toBe("+$45");
    expect(p.paid).toBe("$20");
    expect(p.sold).toBe("$65");

    const withCents = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 7.60, soldPrice: 40, profit: 32.40,
    });
    expect(withCents.tone).toBe("lime");
    expect(withCents.stamp).toBe("SOLD");
    expect(withCents.hero).toBe("+$32.40");
  });

  test("win with a loss (has cents): negative hero, red tone, LOSS stamp, 'LOSS AFTER FEES' caption - MEASURED fixture: Mainstays 21.5qt canner, paid 19.62/sold 5/profit -15.28", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Mainstays 21.5 Quart Stainless Steel Canner",
      boughtPrice: 19.62, soldPrice: 5, profit: -15.28,
    });
    expect(p.tone).toBe("red");
    expect(p.stamp).toBe("LOSS");
    expect(p.caption).toBe("LOSS AFTER FEES");
    expect(p.hero).toBe("-$15.28");

    const wholeDollarLoss = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 65, soldPrice: 20, profit: -45,
    });
    expect(wholeDollarLoss.tone).toBe("red");
    expect(wholeDollarLoss.stamp).toBe("LOSS");
    expect(wholeDollarLoss.caption).toBe("LOSS AFTER FEES");
    expect(wholeDollarLoss.hero).toBe("-$45");
  });

  test("win break-even (profit exactly zero): treated as neutral/profit, not a loss - lime tone, SOLD stamp, 'BREAK EVEN' caption, unsigned zero hero", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 20, soldPrice: 20, profit: 0,
    });
    expect(p.tone).toBe("lime");
    expect(p.stamp).toBe("SOLD");
    expect(p.caption).toBe("BREAK EVEN");
    expect(p.hero).toBe("$0");
  });
});

describe("buildShareCardPayload - photoAdjust", () => {
  test("defaults to whole/zoom 1/centered focus when omitted", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45,
    });
    expect(p.photoAdjust).toEqual({ mode: "whole", zoom: 1, fx: 0.5, fy: 0.5 });
  });

  test("a supplied photoAdjust passes through as given", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false,
      photoAdjust: { mode: "fill", zoom: 2.25, fx: 0.3, fy: 0.7 },
    });
    expect(p.photoAdjust).toEqual({ mode: "fill", zoom: 2.25, fx: 0.3, fy: 0.7 });
  });
});

describe("buildShareCardPayload - accent", () => {
  test("Auto (no accent given) omits the field entirely", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45,
    });
    expect(p.accent).toBeUndefined();
  });

  test("Auto (accent explicitly null) also omits the field", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45, accent: null,
    });
    expect(p.accent).toBeUndefined();
  });

  test("a valid 6-digit hex is sent as-is", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45, accent: "#a3e635",
    });
    expect(p.accent).toBe("#a3e635");
  });

  test("an invalid hex (bad length, missing #, non-hex chars) is omitted rather than sent broken", () => {
    const bad1 = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45, accent: "a3e635",
    });
    expect(bad1.accent).toBeUndefined();

    const bad2 = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45, accent: "#zzzzzz",
    });
    expect(bad2.accent).toBeUndefined();

    const bad3 = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Lamp",
      boughtPrice: 20, soldPrice: 65, profit: 45, accent: "#abc",
    });
    expect(bad3.accent).toBeUndefined();
  });
});

// HERO LABEL (v4, founder device bug: a PASS card read "SELLS FOR $16" -
// a recommendation-sounding label on a verdict that says don't buy it).
describe("heroLabelForShareCard / buildShareCardPayload's heroLabel field", () => {
  test("PASS/THIN/CHECK ITEM always read 'WORTH ABOUT', even when sold-backed", () => {
    for (const verdict of ["PASS", "THIN", "CHECK ITEM"] as HeroVerdict[]) {
      expect(heroLabelForShareCard(verdict, false)).toBe("WORTH ABOUT");
      expect(heroLabelForShareCard(verdict, true)).toBe("WORTH ABOUT");
    }
  });

  test("WORTH A LOOK/SOLID read 'SELLS FOR' only when sold-backed (not an estimate)", () => {
    expect(heroLabelForShareCard("WORTH A LOOK", false)).toBe("SELLS FOR");
    expect(heroLabelForShareCard("SOLID", false)).toBe("SELLS FOR");
    expect(heroLabelForShareCard("WORTH A LOOK", true)).toBe("WORTH ABOUT");
    expect(heroLabelForShareCard("SOLID", true)).toBe("WORTH ABOUT");
  });

  test("no verdict (null) is never a recommendation claim", () => {
    expect(heroLabelForShareCard(null, false)).toBe("SELLS FOR");
    expect(heroLabelForShareCard(null, true)).toBe("WORTH ABOUT");
  });

  test("buildShareCardPayload's scan variant carries heroLabel; win variant never does", () => {
    const pass = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Columbia Hat",
      paidPrice: 10, heroSellPrice: 16, verdict: "PASS", isEstimate: false,
    });
    expect(pass.heroLabel).toBe("WORTH ABOUT");

    const soldBackedBuy = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Vintage Jacket",
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: false,
    });
    expect(soldBackedBuy.heroLabel).toBe("SELLS FOR");

    const win = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 20, soldPrice: 65, profit: 45,
    });
    expect(win.heroLabel).toBeUndefined();
  });
});

// SERVER ROOT CAUSE (v5, founder device bug: a PASS Columbia-hat card still
// read "PAID $13 - SELLS FOR $20"): the server's label line
// (deal-ai-pro/lib/shareCard/renderCard.ts:326) never reads `heroLabel` at
// all - it derives its own "WORTH ABOUT"/"SELLS FOR" tail purely from the
// boolean `estimate` field (app/api/share-card/route.ts:72's
// `body?.estimate === true`), so sending `heroLabel` alone (v4's fix) was a
// no-op. These tests assert on the BUILT PAYLOAD's `estimate` field - the
// one the server actually reads - for every fixture the founder's bug
// report named, not just on the heroLabelForShareCard helper in isolation.
describe("buildShareCardPayload - the `estimate` field the server's label line actually reads", () => {
  test("PASS (sold-backed, not a product-level estimate): estimate:true so the server's label shows WORTH ABOUT, no ESTIMATE caption", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Columbia Hat",
      paidPrice: 13, heroSellPrice: 20, verdict: "PASS", isEstimate: false,
    });
    expect(p.estimate).toBe(true);
    expect(p.caption).toBeUndefined();
  });

  test("THIN (sold-backed): estimate:true, no ESTIMATE caption", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Item",
      paidPrice: 10, heroSellPrice: 14, verdict: "THIN", isEstimate: false,
    });
    expect(p.estimate).toBe(true);
    expect(p.caption).toBeUndefined();
  });

  test("CHECK ITEM (sold-backed): estimate:true, no ESTIMATE caption", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Item",
      paidPrice: 10, heroSellPrice: 18, verdict: "CHECK ITEM", isEstimate: false,
    });
    expect(p.estimate).toBe(true);
    expect(p.caption).toBeUndefined();
  });

  test("WORTH A LOOK, sold-backed: estimate omitted entirely so the server's label shows SELLS FOR", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Item",
      paidPrice: 20, heroSellPrice: 65, verdict: "WORTH A LOOK", isEstimate: false,
    });
    expect(p.estimate).toBeUndefined();
    expect(p.caption).toBeUndefined();
  });

  test("SOLID, sold-backed: estimate omitted entirely so the server's label shows SELLS FOR", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Item",
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: false,
    });
    expect(p.estimate).toBeUndefined();
    expect(p.caption).toBeUndefined();
  });

  test("a real product-level estimate (isEstimate:true) still sends both estimate:true AND the ESTIMATE caption, regardless of verdict", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Item",
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: true,
    });
    expect(p.estimate).toBe(true);
    expect(p.caption).toBe("ESTIMATE");
  });
});

describe("canShareWin - the 'no share on loss' rule", () => {
  test("a real profit can be shared", () => {
    expect(canShareWin(45)).toBe(true);
  });
  test("a loss cannot be shared", () => {
    expect(canShareWin(-10)).toBe(false);
  });
  test("break-even (exactly zero) cannot be shared", () => {
    expect(canShareWin(0)).toBe(false);
  });
  test("missing/non-finite profit cannot be shared", () => {
    expect(canShareWin(null)).toBe(false);
    expect(canShareWin(undefined)).toBe(false);
    expect(canShareWin(NaN)).toBe(false);
  });
});

// HISTORY WIN-REVEAL ENTRY POINT (v6, item B) - the extraction History's
// "View reveal" action (HistoryScreen.tsx's openReveal) uses to build the
// Share Studio's win variant for an already-sold row, covering both row
// shapes that screen renders.
describe("resolveHistoryWinData - both History row shapes", () => {
  test("DB row shape (scans/specialty): snake_case buy_price/actual_sold_price/net_profit", () => {
    const row = { buy_price: 19.62, actual_sold_price: 5, net_profit: -15.28 };
    expect(resolveHistoryWinData(row)).toEqual({ boughtPrice: 19.62, soldPrice: 5, profit: -15.28 });
  });

  test("DB row shape falls back to sell_price when actual_sold_price is absent", () => {
    const row = { buy_price: 10, sell_price: 25, net_profit: 15 };
    expect(resolveHistoryWinData(row)).toEqual({ boughtPrice: 10, soldPrice: 25, profit: 15 });
  });

  test("thrift-item shape: camelCase buyPrice/sellPrice/profit", () => {
    const row = { buyPrice: 8, sellPrice: 22, profit: 14 };
    expect(resolveHistoryWinData(row)).toEqual({ boughtPrice: 8, soldPrice: 22, profit: 14 });
  });

  test("a break-even sale resolves profit:0, never null/NaN", () => {
    const row = { buy_price: 20, actual_sold_price: 20, net_profit: 0 };
    expect(resolveHistoryWinData(row)).toEqual({ boughtPrice: 20, soldPrice: 20, profit: 0 });
  });

  test("missing fields degrade to 0, never NaN/undefined", () => {
    expect(resolveHistoryWinData({})).toEqual({ boughtPrice: 0, soldPrice: 0, profit: 0 });
    expect(resolveHistoryWinData(null)).toEqual({ boughtPrice: 0, soldPrice: 0, profit: 0 });
  });
});
