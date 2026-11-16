// profitBanner.ts (2026-11-16) — pure view-model for the scan result
// "answer card"'s sub-line (ScannerScreen.tsx's answerSub text, shown right
// under the BUY/THIN/SOLID headline). Extracted so the estimate-vs-sold-
// backed framing rule has a unit test independent of the rest of the
// result screen's render tree - same pattern as lib/checkItemCard.ts.
//
// MEASURED BUG: this line used to always print "Pay $X -> profit ~$Y (Z%
// ROI)" even on an estimate-only result (no real sold comp behind the
// number), while the secondary-stats card right above it already printed
// "ROI —" for the identical scan - a precise-looking percentage sitting
// directly next to its own screen's admission that there's no real number
// to show one. profitConfidence ("estimate" | "sold-backed", now sent by
// the server) decides which framing this line uses.
import { formatMoney } from "./money";

export type ProfitConfidence = "estimate" | "sold-backed";

// MISSING PROFIT CONFIDENCE (old scans, saved before the server sent this
// field): treated as "sold-backed" ONLY when the card's own ROI stat would
// actually show a real percentage (the caller passes that same gate in as
// `cardShowsRoi`) - never independently re-derived here, so an old scan's
// banner and its own ROI stat can never disagree about whether the number
// behind them is real.
export function resolveProfitConfidence(serverValue: unknown, cardShowsRoi: boolean): ProfitConfidence {
  if (serverValue === "estimate" || serverValue === "sold-backed") return serverValue;
  return cardShowsRoi ? "sold-backed" : "estimate";
}

// No ROI% on an estimate - a percentage reads as precise math, and there
// is no real sold comp behind this number to compute a real percentage
// from. "lose"/"make" already signal the sign, so the dollar amount itself
// is always shown positive (Math.abs) - never a double negative like
// "lose -$27".
export function buildAnswerBannerText(opts: {
  profitConfidence: ProfitConfidence;
  enteredBp: number;
  heroProfit: number;
  heroRoi: number;
}): string {
  const { profitConfidence, enteredBp, heroProfit, heroRoi } = opts;
  if (profitConfidence === "estimate") {
    return heroProfit < 0
      ? `At ${formatMoney(enteredBp)} you'd likely lose about ${formatMoney(Math.abs(heroProfit))} (estimate)`
      : `At ${formatMoney(enteredBp)} you'd make roughly ${formatMoney(heroProfit)} (estimate)`;
  }
  return `Pay ${formatMoney(enteredBp)} → profit ~${formatMoney(heroProfit)} (${heroRoi}% ROI)`;
}
