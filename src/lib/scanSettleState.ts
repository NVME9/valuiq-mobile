// scanSettleState.ts (2026-10-25) — pure gating logic for ScannerScreen's
// PATCH-on-settle effect (the debounced write of buyPrice/netProfit/roi/
// decision back to a scan's stored row).
//
// AUDIT-PROVEN BUG (seven real Walmart scans): three saved REJECTED tag
// reads ($72, $36, one other) as buy_price, and one older row (5:02pm)
// ended up holding a newer scan's (5:27pm) buy price and verdict. Root
// cause was never a single race - it was the absence of any requirement
// that a persisted buyPrice be something the user actually acted on.
// latestVerdictRef only ever checked buyPrice>0, so a confident tag read
// that auto-seeded the field (see ScannerScreen's finishAnalyze) and a
// genuinely-rejected-then-abandoned field (still blank, buyPrice<=0 - safe)
// were the only two states distinguished; nothing stopped a STALE ref
// snapshot or an out-of-order response from supplying a scanId/buyPrice
// pair that never belonged together.
//
// Fix, enforced here as pure, testable rules:
//   1. A buyPrice may only ever patch when it carries a real SOURCE - the
//      user typed it, or explicitly tapped "Confirm $X" on a suggested tag
//      read. An auto-seeded-but-untouched or edited-then-blank price has
//      buyPriceSource===null and can never patch, however large buyPrice
//      is left sitting in other state.
//   2. The same (scanId, buyPrice, decision, netProfit, roi, source)
//      signature never patches twice - redundant re-settles (e.g. a
//      re-render with nothing new) are a no-op.
// Everything ELSE (resetting refs/state on "New Scan" and on each new
// analyze() call, ignoring a late network response for a scan the user has
// already moved on from) is enforced in ScannerScreen.tsx itself via
// scanAttemptRef/reset() - not expressible as a pure function, see that
// file's own comments.
export type BuyPriceSource = "user" | "tag" | null;

export interface SettledVerdict {
  scanId: string | null;
  buyPrice: number;
  buyPriceSource: BuyPriceSource;
  netProfit: number | null;
  roi: number | null;
  decision: string;
}

export function settleSignature(v: SettledVerdict): string {
  return `${v.scanId}:${v.buyPrice}:${v.decision}:${v.netProfit}:${v.roi}:${v.buyPriceSource}`;
}

// The ONE gate the debounced PATCH timer must pass before it's allowed to
// fire - see the header comment above for why each check exists.
export function shouldPatchSettledVerdict(v: SettledVerdict | null | undefined, lastPatchedSig: string): boolean {
  if (!v || !v.scanId) return false;
  if (!(v.buyPrice > 0)) return false;
  // Never a rejected ("Edit" tapped, still blank -> buyPrice<=0 already
  // caught above) or only-suggested (auto-seeded, never confirmed/typed -
  // buyPriceSource stays null until the user acts) read.
  if (!v.buyPriceSource) return false;
  return settleSignature(v) !== lastPatchedSig;
}
