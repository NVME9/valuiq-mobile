// outcomeTier.ts — classifies a completed LENS scan into a reactive outcome
// tier. THE single source of truth for the verdict shown on the result
// screen: the tier IS the verdict (skip = don't buy, everything else = buy),
// so nothing else on screen may independently compute or display a
// conflicting BUY/WATCH/PASS word. Dominated by ROI/margin relative to what
// was actually paid, not raw profit dollars — a $13 profit on a $1 buy
// (1300% ROI) is a very different outcome than $13 on a $100 buy (13% ROI),
// even though the dollar amount is identical.
import { C } from "./theme";

export type OutcomeTier = "killer" | "rare" | "solid" | "skip";

export interface OutcomeTierInput {
  decision: string | null | undefined;   // lens's own BUY/WATCH/PASS/UNKNOWN - only used as a hard PASS override, never to gate the ROI math
  netProfit: number;                       // actual profit: cost = entered buy price when one exists, else cost = max-buy ceiling
  roi: number;                              // percent, computed against that SAME cost basis - the denominator must match netProfit's
  velocityTier: string | null | undefined; // "fast" | "steady" | "slow" | "unknown"
  sellThrough: number | null | undefined;  // 0-100
  dataQuality: string | null | undefined;  // "strong" | "limited" | "none"
  sellPrice: number | null | undefined;    // lens's own expected sell price
  sellTimeLabel: string | null | undefined; // e.g. "~90 days" - cited in the skip reason when it's part of why
}

export interface OutcomeTierInfo {
  tier: OutcomeTier;
  emoji: string;
  label: string;
  copy: string;    // one-line reaction under the hero (skip: the ONE reason, cites the actual numbers)
  accent: string;   // primary color for the hero number, badge, glow
}

// Tunable thresholds — adjust here, nowhere else.
const SKIP_ROI_MIN = 20;     // below this the margin isn't worth the effort/capital/risk, regardless of dollars
const SKIP_MIN_PROFIT = 3;   // floor so a trivial dollar amount at a freak % ROI doesn't read as a win
const KILLER_ROI_MIN = 150;  // more than doubling your money
const KILLER_MIN_PROFIT = 10;
const RARE_MIN_SELL_PRICE = 150;

function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

export function classifyOutcome(input: OutcomeTierInput): OutcomeTierInfo {
  const { decision, netProfit, roi, velocityTier, sellThrough, dataQuality, sellPrice, sellTimeLabel } = input;
  const isFastVelocity = velocityTier === "fast" || (sellThrough != null && sellThrough >= 70);

  // SKIP — the honest floor. A hard lens PASS, a real loss, a trivial dollar
  // amount, or (dominant case) ROI too thin to be worth the capital/effort -
  // beats every other tier. The reason cites the actual figures that killed
  // it, never a bare "PASS".
  const isSkip = decision === "PASS" || netProfit <= 0 || netProfit < SKIP_MIN_PROFIT || roi < SKIP_ROI_MIN;
  if (isSkip) {
    const parts: string[] = [];
    parts.push(netProfit <= 0 ? `you'd lose ${money(netProfit)}` : `only ${money(netProfit)} profit (${Math.max(0, Math.round(roi))}% ROI)`);
    if (sellTimeLabel) parts.push(`${sellTimeLabel} to sell`);
    return {
      tier: "skip",
      emoji: "❌",
      label: "SKIP",
      copy: `${parts.join(", ")}. Margin too thin.`,
      accent: C.red,
    };
  }

  // KILLER — high ROI (more than doubled your money) AND moving fast. The banger.
  if (roi >= KILLER_ROI_MIN && netProfit >= KILLER_MIN_PROFIT && isFastVelocity) {
    return { tier: "killer", emoji: "🔥", label: "KILLER FLIP", copy: "This is a banger.", accent: C.green };
  }

  // RARE — high sell price backed by strong (real comps) data. Value-based,
  // orthogonal to ROI - checked before the default so a genuinely rare piece
  // still gets called out even if it's not the fastest mover.
  if (dataQuality === "strong" && (sellPrice || 0) >= RARE_MIN_SELL_PRICE) {
    return { tier: "rare", emoji: "💎", label: "RARE FIND", copy: "High-value piece — worth the extra care.", accent: C.gold };
  }

  // SOLID — cleared the skip bar, not a killer or a rare find. Still a real BUY.
  return { tier: "solid", emoji: "✅", label: "SOLID BUY", copy: "Solid pickup — the math works.", accent: C.green };
}
