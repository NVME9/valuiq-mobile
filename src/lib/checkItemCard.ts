// checkItemCard.ts (2026-11-15, fix/share-cta-and-check-item) — pure view
// model for the "Check This Item" card (ScannerScreen.tsx's result step,
// isCheckItem branch). Extracted so the one rule that matters here - a
// profit number must never appear on a low-confidence identity - has a
// unit test independent of the rest of the result screen's render tree.
// Inputs are all values ScannerScreen already computes upstream (same
// maxBuy/sellPriceForProfit/hasServerRange the non-CHECK-ITEM answer card
// uses), never recomputed here.
function fmtMoney(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export interface CheckItemCardInput {
  hasServerRange: boolean;
  serverPriceLow: number | null;
  serverPriceHigh: number | null;
  maxBuy: number | null;
  sellPriceForProfit: number;
}

export interface CheckItemCardView {
  rangeText: string | null;
  showMaxBuyCard: boolean;
  maxBuyHeadline: string | null;
  maxBuySub: string | null;
  // Fixed - see this file's header comment. Whatever the "Pay $X -> profit
  // ~$Y (ROI)" line would otherwise say on a confirmed result, CHECK ITEM
  // shows this instead, always, regardless of any other input here.
  profitCopy: string;
}

export function deriveCheckItemCard(input: CheckItemCardInput): CheckItemCardView {
  const rangeText = input.hasServerRange
    ? `Typical range: $${input.serverPriceLow}-$${input.serverPriceHigh}`
    : null;
  const showMaxBuyCard = input.maxBuy != null;
  const maxBuyHeadline = showMaxBuyCard ? `Buy at ${fmtMoney(input.maxBuy as number)} or less` : null;
  const maxBuySub = (showMaxBuyCard && input.sellPriceForProfit > 0)
    ? (input.hasServerRange
        ? `Typical sell ${fmtMoney(input.sellPriceForProfit)}, range ${fmtMoney(input.serverPriceLow as number)} to ${fmtMoney(input.serverPriceHigh as number)}`
        : `Typical sell ${fmtMoney(input.sellPriceForProfit)}`)
    : null;
  return {
    rangeText,
    showMaxBuyCard,
    maxBuyHeadline,
    maxBuySub,
    profitCopy: "Confirm the item to see profit",
  };
}
