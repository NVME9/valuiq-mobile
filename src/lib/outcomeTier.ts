// outcomeTier.ts — classifies a completed scan (lens or specialty) into a
// reactive outcome tier. THE single source of truth for the verdict shown
// on the result screen: the tier IS the verdict (skip = don't buy,
// everything else = buy), so nothing else on screen may independently
// compute or display a conflicting verdict.
//
// REPLACED (2026-09-10): the velocity-adjusted scoring model (sqrt-dampened
// ROI vs days-to-sell, a separate unconditional "trivial dollars" hard-skip
// floor, a +/- band bolted on afterward to soften the exact cutoffs it
// created) is gone. MEASURED BUG: that hard dollar floor (netProfit < $10)
// fired unconditionally, before the ROI band ever got a chance to run - a
// $4-profit / 17% ROI item landed a flat "SKIP" even though 17% sits
// comfortably inside what was supposed to be the judgment-call zone, because
// the floor pre-empted the band entirely. Replaced with a single explicit
// 6-line precedence list, first match wins, top to bottom. No velocity
// input, no sqrt dampening, no bolted-on band - daysToSell is kept only for
// the "sells in ~X days" copy text, it does not gate the tier.
import { C } from "./theme";

// "estimate" is never returned by classifyOutcome() itself - it's a 5th
// state ScannerScreen.tsx constructs directly for "no price entered yet"
// (see its results-page price flow), included here so that literal object
// still satisfies OutcomeTierInfo's type instead of needing an `any` cast.
export type OutcomeTier = "hot" | "solid" | "thin" | "skip" | "estimate";

export interface OutcomeTierInput {
  noFlipMargin: boolean;                   // RETAIL-PRICE SANITY (backend's oracle.noFlipMargin - lib/profitOracle.ts's NO_GAP check): a categorical, cost-basis-INDEPENDENT fact - resale has not depreciated at all from what the item costs new, so there is no flip to have an opinion about, no matter what the user pays. Its own dedicated Rule 0 below, checked before anything cost/ROI-based. Pass the real boolean (result.noFlipMargin) - do NOT smuggle this through the old `decision==="PASS"` field, which this replaces (see 2026-09-10 fix: that field got dropped entirely in the 6-line rewrite, silently discarding this guard along with the dollar-floor scoring cruft it used to be bundled with).
  netProfit: number;                       // actual profit: cost = entered buy price when one exists, else cost = max-buy ceiling
  roi: number;                              // percent, computed against that SAME cost basis - the denominator must match netProfit's. This is AFTER-FEES ROI, the same value the hero displays - not velocity-adjusted.
  daysToSell: number | null | undefined;   // real estimated days-to-sell (velocity.estDaysToSale, or Oracle medianDays when available) - a NUMBER, not a display string. Used ONLY for the "sells in ~X days" copy text, never to gate the tier.
  velocityTier: string | null | undefined; // kept for interface compat with existing callers - no longer used to gate the tier
  sellThrough: number | null | undefined;  // kept for interface compat - no longer used to gate the tier
  dataQuality: string | null | undefined;  // kept for interface compat - no longer used to gate the tier
  sellPrice: number | null | undefined;    // kept for interface compat - no longer used to gate the tier
  sellTimeLabel: string | null | undefined; // kept for interface compat - copy now generates its own "~X days" text from daysToSell directly
}

export interface OutcomeTierInfo {
  tier: OutcomeTier;
  emoji: string;
  label: string;
  copy: string;    // one-line reaction under the hero, states the ROI and which rule it landed on - teaches what "good" looks like instead of just asserting a verdict
  accent: string;   // primary color for the hero number, badge, glow
  adjustedROI: number; // NO LONGER velocity-adjusted (2026-09-10) - equals rounded after-fees roi. Kept for interface/display compat only, not used to decide the tier.
  daysUsed: number;    // the days-to-sell value actually used (real or UNKNOWN_DAYS_FALLBACK) - display-only, feeds the "~X days" copy text
}

// Tunable thresholds — adjust here, nowhere else. Mirrored by the max-buy
// ceiling calc in ScannerScreen.tsx (imports ROI_BUY_MIN/PROFIT_JUDGMENT_
// FLOOR directly from here so the two can't drift apart) and, cross-repo,
// by deal-ai-pro/lib/profitMath.ts's computeMaxBuy (can't literally share a
// module across the two repos - update that file's matching constants if
// these ever change).
const UNKNOWN_DAYS_FALLBACK = 45;   // conservative default when velocity data is missing - assume slower, not faster, for display purposes only
const MIN_DAYS_FLOOR = 3;           // days-to-sell floored here before display, so a 1-day flash sale doesn't produce a meaningless "~1 day" copy line
export const PROFIT_JUDGMENT_FLOOR = 5; // $, rule 2 - net profit below this caps the verdict at JUDGMENT CALL regardless of ROI
export const ROI_SKIP_MAX = 10;         // %, rule 3 - after-fees ROI below this is a hard SKIP
export const ROI_BUY_MIN = 30;          // %, rule 5 - after-fees ROI at/above this (and clear of the profit floor) is a confident BUY; this is the "target ROI" max-buy solves for
export const ROI_HOT_MIN = 75;          // %, rule 6 - after-fees ROI at/above this is a HOT BUY

function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

export function classifyOutcome(input: OutcomeTierInput): OutcomeTierInfo {
  const { noFlipMargin, netProfit, roi, daysToSell } = input;
  const days = Math.max(Number(daysToSell) || UNKNOWN_DAYS_FALLBACK, MIN_DAYS_FLOOR);
  const roiRounded = Math.max(0, Math.round(roi));
  const adjustedROI = roiRounded; // no longer velocity-adjusted - kept for type/display compat only

  // Rule 0 — RETAIL-PRICE SANITY, unconditional, checked before every
  // ROI/profit rule below. A categorical fact about the ITEM (resale ≈ or
  // > brand-new retail, zero depreciation gap), not a judgment about this
  // particular buy price - so it overrides even a real, positive, high-ROI
  // netProfit/roi computed off a low entered price. See noFlipMargin's
  // interface comment above for why this can't be folded into the ROI/
  // profit rules.
  if (noFlipMargin) {
    return {
      tier: "skip", emoji: "❌", label: "SKIP",
      copy: "No flip margin - this resells for about what it costs brand new. Skip it, whatever you'd pay.",
      accent: C.red, adjustedROI, daysUsed: days,
    };
  }

  // 6-LINE PRECEDENCE (2026-09-10) — first match wins, top to bottom.
  // Boundaries are exact: netProfit < 0 is the ONLY thing that hits rule 1;
  // netProfit === 0 falls through to rule 2 (judgment call, not skip).

  // Rule 1 — a real loss, unconditional.
  if (netProfit < 0) {
    return { tier: "skip", emoji: "❌", label: "SKIP", copy: `You'd lose ${money(netProfit)}. Skip it.`, accent: C.red, adjustedROI, daysUsed: days };
  }

  // Rule 2 — net profit under the judgment floor caps the verdict here,
  // REGARDLESS of ROI. A high-ROI-but-tiny-dollar flip is the reseller's
  // own call to make, never an auto-buy or an auto-skip. Checked BEFORE any
  // ROI band, so it overrides ROI downward (a 90%-ROI, $3-profit item lands
  // here) but never upward.
  if (netProfit < PROFIT_JUDGMENT_FLOOR) {
    return {
      tier: "thin", emoji: "⚖️", label: "JUDGMENT CALL",
      copy: `Only ${money(netProfit)} profit — too small to call a clear buy, whatever the ROI says. Your call.`,
      accent: C.yellow, adjustedROI, daysUsed: days,
    };
  }

  // Rule 3 — ROI too thin to buy, dollars aside (already cleared rule 2).
  if (roi < ROI_SKIP_MAX) {
    return { tier: "skip", emoji: "❌", label: "SKIP", copy: `${roiRounded}% ROI — margin too thin to buy.`, accent: C.red, adjustedROI, daysUsed: days };
  }

  // Rule 4 — ROI in the judgment-call zone.
  if (roi < ROI_BUY_MIN) {
    return {
      tier: "thin", emoji: "⚖️", label: "JUDGMENT CALL",
      copy: `${roiRounded}% ROI — right in the judgment-call zone. Could go either way.`,
      accent: C.yellow, adjustedROI, daysUsed: days,
    };
  }

  // Rule 6 — HOT BUY (checked before rule 5's range so >=75 doesn't also
  // match "< 75").
  if (roi >= ROI_HOT_MIN) {
    return {
      tier: "hot", emoji: "🔥", label: "HOT BUY",
      copy: `${roiRounded}% ROI, sells in ~${days} days. Excellent margin.`,
      accent: C.green, adjustedROI, daysUsed: days,
    };
  }

  // Rule 5 — BUY (30% <= roi < 75%).
  return {
    tier: "solid", emoji: "✅", label: "BUY",
    copy: `${roiRounded}% ROI, sells in ~${days} days. Solid pickup.`,
    accent: C.green, adjustedROI, daysUsed: days,
  };
}
