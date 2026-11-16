import { deriveCheckItemCard } from "../checkItemCard";

describe("deriveCheckItemCard", () => {
  test("no server range -> no range text", () => {
    const view = deriveCheckItemCard({ hasServerRange: false, serverPriceLow: null, serverPriceHigh: null, maxBuy: null, sellPriceForProfit: 0 });
    expect(view.rangeText).toBeNull();
  });

  test("server range present -> formatted range text", () => {
    const view = deriveCheckItemCard({ hasServerRange: true, serverPriceLow: 12, serverPriceHigh: 20, maxBuy: null, sellPriceForProfit: 0 });
    expect(view.rangeText).toBe("Typical range: $12-$20");
  });

  test("maxBuy null -> no answer-first card at all", () => {
    const view = deriveCheckItemCard({ hasServerRange: true, serverPriceLow: 12, serverPriceHigh: 20, maxBuy: null, sellPriceForProfit: 16 });
    expect(view.showMaxBuyCard).toBe(false);
    expect(view.maxBuyHeadline).toBeNull();
    expect(view.maxBuySub).toBeNull();
  });

  test("maxBuy present -> same answer-first headline shape as other results", () => {
    const view = deriveCheckItemCard({ hasServerRange: true, serverPriceLow: 12, serverPriceHigh: 20, maxBuy: 8, sellPriceForProfit: 16 });
    expect(view.showMaxBuyCard).toBe(true);
    expect(view.maxBuyHeadline).toBe("Buy at $8 or less");
    expect(view.maxBuySub).toBe("Typical sell $16, range $12 to $20");
  });

  test("maxBuy present but no sell price -> headline only, no sub line", () => {
    const view = deriveCheckItemCard({ hasServerRange: false, serverPriceLow: null, serverPriceHigh: null, maxBuy: 5, sellPriceForProfit: 0 });
    expect(view.maxBuyHeadline).toBe("Buy at $5 or less");
    expect(view.maxBuySub).toBeNull();
  });

  test("maxBuy of exactly 0 still shows the card (a real, honest ceiling, not a missing one)", () => {
    const view = deriveCheckItemCard({ hasServerRange: false, serverPriceLow: null, serverPriceHigh: null, maxBuy: 0, sellPriceForProfit: 0 });
    expect(view.showMaxBuyCard).toBe(true);
    expect(view.maxBuyHeadline).toBe("Buy at $0 or less");
  });

  // THE one rule this file exists to protect: a profit number must never
  // appear on a low-confidence identity, in any combination of inputs.
  test("profitCopy is always the fixed confirm-first prompt, never a Pay/profit/ROI line", () => {
    const cases: Array<Parameters<typeof deriveCheckItemCard>[0]> = [
      { hasServerRange: false, serverPriceLow: null, serverPriceHigh: null, maxBuy: null, sellPriceForProfit: 0 },
      { hasServerRange: true, serverPriceLow: 12, serverPriceHigh: 20, maxBuy: 8, sellPriceForProfit: 16 },
      { hasServerRange: true, serverPriceLow: 12, serverPriceHigh: 20, maxBuy: 0, sellPriceForProfit: 16 },
    ];
    for (const c of cases) {
      const view = deriveCheckItemCard(c);
      expect(view.profitCopy).toBe("Confirm the item to see profit");
      expect(view.profitCopy).not.toMatch(/profit ~|ROI\)|→ profit/);
    }
  });
});
