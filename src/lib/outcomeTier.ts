// outcomeTier.ts — classifies a completed LENS scan into a reactive outcome
// tier, using only fields the scan already returns (velocity, dataQuality,
// decision, reconciled profit/ROI). Pure function, first-that-qualifies-wins,
// same shape as selectFlexStat() in flexReveal.ts. No network, no new backend
// data — presentation-layer only.
import { C } from "./theme";

export type OutcomeTier = "killer" | "rare" | "solid" | "skip";

export interface OutcomeTierInput {
  decision: string | null | undefined;   // "BUY" | "WATCH" | "PASS" | "UNKNOWN"
  netProfit: number;                       // reconciled hero profit (oracle when present, else lens netProfit)
  velocityTier: string | null | undefined; // "fast" | "steady" | "slow" | "unknown"
  sellThrough: number | null | undefined;  // 0-100
  dataQuality: string | null | undefined;  // "strong" | "limited" | "none"
  sellPrice: number | null | undefined;    // lens's own expected sell price
}

export interface OutcomeTierInfo {
  tier: OutcomeTier;
  emoji: string;
  label: string;
  copy: string;    // one-line reaction under the hero number
  accent: string;   // primary color for the hero number, badge, glow
}

// Tunable thresholds — adjust here, nowhere else.
const KILLER_MIN_PROFIT = 50;
const RARE_MIN_SELL_PRICE = 150;
const SKIP_MAX_PROFIT = 15; // negative or thin — not worth the trip

function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

export function classifyOutcome(input: OutcomeTierInput): OutcomeTierInfo {
  const { decision, netProfit, velocityTier, sellThrough, dataQuality, sellPrice } = input;
  const isFastVelocity = velocityTier === "fast" || (sellThrough != null && sellThrough >= 70);

  // 1. SKIP — the honest floor. A straight PASS or thin/negative profit beats
  //    every other tier; a high-value "rare" item that doesn't pencil out is still a skip.
  if (decision === "PASS" || netProfit < SKIP_MAX_PROFIT) {
    return {
      tier: "skip",
      emoji: "❌",
      label: "SKIP",
      copy: netProfit <= 0 ? "Walk away — the math doesn't work." : `Only ${money(netProfit)} profit — not worth the trip.`,
      accent: C.red,
    };
  }

  // 2. KILLER — high profit AND moving fast. The banger.
  if (decision === "BUY" && netProfit >= KILLER_MIN_PROFIT && isFastVelocity) {
    return { tier: "killer", emoji: "🔥", label: "KILLER FLIP", copy: "This is a banger.", accent: C.green };
  }

  // 3. RARE — high sell price backed by strong (real comps) data, regardless of speed.
  if (dataQuality === "strong" && (sellPrice || 0) >= RARE_MIN_SELL_PRICE) {
    return { tier: "rare", emoji: "💎", label: "RARE FIND", copy: "High-value piece — worth the extra care.", accent: C.gold };
  }

  // 4. SOLID — the default good outcome.
  return { tier: "solid", emoji: "✅", label: "SOLID", copy: "Solid pickup — the math works.", accent: C.green };
}
