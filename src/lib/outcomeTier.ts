// outcomeTier.ts — classifies a completed scan (lens or specialty) into a
// reactive outcome tier. THE single source of truth for the verdict shown
// on the result screen: the tier IS the verdict (skip = don't buy,
// everything else = buy), so nothing else on screen may independently
// compute or display a conflicting verdict.
//
// RECALIBRATED (2026-08-19): this used to gate HOT-equivalent ("killer") on
// raw ROI >= 150% AND fast velocity AND profit >= $10 - three ANDed
// conditions with no fallback, which is exactly what produced the E.T.
// bug: 129% ROI / 45 days / $22 profit is a genuinely great flip, but 45
// days isn't "fast" by the old velocityTier bucket, so it fell all the way
// through to "solid" despite doubling the seller's money. This is a
// decision engine, not a ROI calculator - it now weighs three factors
// together the way an experienced reseller actually decides, instead of
// gating on them independently:
//   - ROI% (margin) - a raw floor no turnover speed can rescue you from
//   - dollar profit - a floor and a HOT-tier requirement, so trivial-dollar
//     flips don't read as wins regardless of percentage
//   - days-to-sell (velocity) - SOFTENS or STEEPENS how much raw ROI is
//     required, via a velocity-adjusted score, so a fast mover clears the
//     bar at a lower raw ROI and a slow mover needs a higher one
import { C } from "./theme";

export type OutcomeTier = "hot" | "solid" | "skip";

export interface OutcomeTierInput {
  decision: string | null | undefined;   // scan's own BUY/WATCH/PASS/UNKNOWN - only used as a hard PASS override, never to gate the ROI math
  netProfit: number;                       // actual profit: cost = entered buy price when one exists, else cost = max-buy ceiling
  roi: number;                              // percent, computed against that SAME cost basis - the denominator must match netProfit's
  daysToSell: number | null | undefined;   // real estimated days-to-sell (velocity.estDaysToSale, or Oracle medianDays when available) - a NUMBER, not a display string. Unknown -> UNKNOWN_DAYS_FALLBACK (conservative: assume slower, never call something HOT it can't back up).
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
  copy: string;    // one-line reaction under the hero, states the ROI and which threshold it cleared/missed - teaches what "good" looks like instead of just asserting a verdict
  accent: string;   // primary color for the hero number, badge, glow
  adjustedROI: number; // the velocity-adjusted score that actually drove the tier decision - exposed for debug verification, not for display copy (raw roi/days are what's shown to users)
  daysUsed: number;    // the days-to-sell value actually used (real or UNKNOWN_DAYS_FALLBACK) - lets a debug readout confirm whether real velocity data was available
}

// Tunable thresholds — adjust here, nowhere else. See conversation history
// for the calibration worked examples these were tuned against.
const REFERENCE_DAYS = 30;          // the "typical flip" baseline the velocity adjustment scales against
const MIN_DAYS_FLOOR = 3;           // days-to-sell floored here before adjusting, so a 1-day flash sale doesn't produce a meaningless score
const UNKNOWN_DAYS_FALLBACK = 45;   // conservative default when velocity data is missing - assume slower, not faster
const RAW_ROI_FLOOR = 20;           // %, absolute floor - no turnover speed rescues a margin this thin
const ROI_HOT_MIN = 40;             // %, HOT also requires a genuinely good RAW margin, not just great turnover on a thin one
const VELOCITY_ADJUSTED_SOLID_MIN = 30; // the sqrt-dampened score must clear this to escape SKIP
const VELOCITY_ADJUSTED_HOT_MIN = 70;   // the sqrt-dampened score must clear this (plus the profit/roi gates below) to reach HOT
const PROFIT_FLOOR = 10;            // $, the "worth handling" line - required for HOT, and sub-floor profit leans SKIP
const EXCEPTIONAL_ROI_ESCAPE = 400; // sub-$10 profit needs a velocity-adjusted score at least this high to avoid SKIP - 300% (a real worked example) does NOT clear this on purpose

function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

// roi * sqrt(REFERENCE_DAYS / days): softened (not linear) so a strong-
// margin slow-mover isn't killed the way a straight ROI*30/days ratio would
// (50% ROI / 60 days is a genuinely fine patient-reseller buy, not a skip -
// linear scaling would drop it to 25%, sqrt keeps it at ~35%). Fast movers
// still get rewarded, slow movers still cost, but neither swings the score
// as violently as a linear ratio would.
function velocityAdjustedROI(roi: number, daysToSell: number | null | undefined): number {
  const days = Math.max(Number(daysToSell) || UNKNOWN_DAYS_FALLBACK, MIN_DAYS_FLOOR);
  return roi * Math.sqrt(REFERENCE_DAYS / days);
}

export function classifyOutcome(input: OutcomeTierInput): OutcomeTierInfo {
  const { decision, netProfit, roi, daysToSell } = input;
  const days = Math.max(Number(daysToSell) || UNKNOWN_DAYS_FALLBACK, MIN_DAYS_FLOOR);
  const adjustedROI = velocityAdjustedROI(roi, daysToSell);
  const roiRounded = Math.max(0, Math.round(roi));

  // SKIP — checked in order of what actually killed the deal, so the copy
  // can name the real reason instead of a generic "margin too thin".
  const isRealLoss = netProfit <= 0;
  const isTrivialDollars = !isRealLoss && netProfit < PROFIT_FLOOR && adjustedROI < EXCEPTIONAL_ROI_ESCAPE;
  const isThinMargin = !isRealLoss && !isTrivialDollars && roi < RAW_ROI_FLOOR;
  const isTooSlow = !isRealLoss && !isTrivialDollars && !isThinMargin && adjustedROI < VELOCITY_ADJUSTED_SOLID_MIN;
  const isHardPass = decision === "PASS";

  if (isHardPass || isRealLoss || isTrivialDollars || isThinMargin || isTooSlow) {
    let copy: string;
    if (isRealLoss) copy = `You'd lose ${money(netProfit)}. Skip it.`;
    else if (isTrivialDollars) copy = `Only ${money(netProfit)} profit — too small to be worth it, even at ${roiRounded}% ROI.`;
    else if (isThinMargin) copy = `${roiRounded}% ROI — margin too thin regardless of how fast it sells.`;
    else if (isTooSlow) copy = `${roiRounded}% ROI, but ~${days} days to sell ties up capital too long.`;
    else copy = `${roiRounded}% ROI. Below the ~30% line.`;
    return { tier: "skip", emoji: "❌", label: "SKIP", copy, accent: C.red, adjustedROI: Math.round(adjustedROI), daysUsed: days };
  }

  // HOT BUY — clears all three: strong velocity-adjusted score, real
  // dollars, AND a genuinely good raw margin (not just a thin one saved by
  // speed - see ROI_HOT_MIN).
  if (adjustedROI >= VELOCITY_ADJUSTED_HOT_MIN && netProfit >= PROFIT_FLOOR && roi >= ROI_HOT_MIN) {
    return {
      tier: "hot", emoji: "🔥", label: "HOT BUY",
      copy: `${roiRounded}% ROI, sells in ~${days} days. Strong margin and turnover.`,
      accent: C.green, adjustedROI: Math.round(adjustedROI), daysUsed: days,
    };
  }

  // SOLID — cleared the skip bar, didn't clear all three HOT gates. Say
  // WHY it's not HOT when the reason is dollars, since that's the
  // non-obvious case (a huge ROI% that still isn't a home run).
  const copy = netProfit < PROFIT_FLOOR
    ? `${roiRounded}% ROI, but only ${money(netProfit)} profit — solid, not a home run.`
    : `${roiRounded}% ROI, sells in ~${days} days. Solid pickup.`;
  return { tier: "solid", emoji: "✅", label: "SOLID BUY", copy, accent: C.green, adjustedROI: Math.round(adjustedROI), daysUsed: days };
}
