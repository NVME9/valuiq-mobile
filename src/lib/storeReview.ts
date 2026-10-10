// storeReview.ts — in-app store review prompt (expo-store-review).
// Two triggers only, both wired at their single authoritative call site so
// this can't be duplicated/drifted across screens:
//   - ScannerScreen.tsx: the result-screen hero verdict resolves to SOLID or
//     WORTH A LOOK (real-data tier - the headline is null for ai_only, see
//     that screen's RESULT-SCREEN HERO VERDICT block).
//   - saleCapture.ts's recordSaleOutcome(): a "sold" outcome lands with a
//     positive server-computed net_profit.
// Both call requestReviewIfEligible() after a 1.5s delay so the native
// modal never covers the thing the user just saw render. evaluateReview()
// is the same eligibility check with no side effects (no StoreReview call,
// no AsyncStorage write) - used by the owner-only debug readout so it can
// show live eligibility/failing-condition state without actually spending
// one of the limited OS-level review prompts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { getScanCount } from "./api";

export type ReviewTrigger = "verdict" | "sale";

const LAST_ASKED_KEY = "@valuiq_review_last_asked";
const MIN_LIFETIME_SCANS = 3;
const COOLDOWN_DAYS = 60;
// "Wait 1.5 seconds after the result renders so it doesn't cover the
// answer" - applied uniformly to both triggers (the sale-log confirmation
// is also something a review modal shouldn't stomp on mid-render).
export const REVIEW_PROMPT_DELAY_MS = 1500;

export interface ReviewDebugState {
  eligible: boolean;
  failingCondition: string | null;
  lastAskedAt: string | null;
  lifetimeScans: number | null;
  isAvailable: boolean | null;
  trigger: ReviewTrigger | null;
  checkedAt: string;
}

let _lastDebugState: ReviewDebugState = {
  eligible: false,
  failingCondition: "not yet evaluated",
  lastAskedAt: null,
  lifetimeScans: null,
  isAvailable: null,
  trigger: null,
  checkedAt: new Date(0).toISOString(),
};

// Owner-only debug readout reads this - last evaluation's result, win or
// lose, with the exact failing condition. Never gated on isOwner here
// (gating is the caller's/ApiDebugPanel's job, same pattern as every other
// owner-only readout in this app) - this module just tracks state.
export function getReviewDebugState(): ReviewDebugState {
  return _lastDebugState;
}

async function evaluate(token: string, trigger: ReviewTrigger): Promise<ReviewDebugState> {
  let lastAskedAt: string | null = null;
  try { lastAskedAt = await AsyncStorage.getItem(LAST_ASKED_KEY); } catch {}

  let isAvailable: boolean | null = null;
  try { isAvailable = await StoreReview.isAvailableAsync(); } catch { isAvailable = false; }

  let lifetimeScans: number | null = null;
  try { lifetimeScans = await getScanCount(token); } catch {}

  let failingCondition: string | null = null;
  if (!isAvailable) {
    failingCondition = "StoreReview.isAvailableAsync() is false";
  } else if (lifetimeScans == null || lifetimeScans < MIN_LIFETIME_SCANS) {
    failingCondition = `lifetime scans ${lifetimeScans ?? "unknown"} < ${MIN_LIFETIME_SCANS}`;
  } else if (lastAskedAt) {
    const daysSince = (Date.now() - new Date(lastAskedAt).getTime()) / 86400000;
    if (daysSince < COOLDOWN_DAYS) {
      failingCondition = `last asked ${Math.floor(daysSince)}d ago - < ${COOLDOWN_DAYS}d cooldown`;
    }
  }

  _lastDebugState = {
    eligible: failingCondition == null,
    failingCondition,
    lastAskedAt,
    lifetimeScans,
    isAvailable,
    trigger,
    checkedAt: new Date().toISOString(),
  };
  return _lastDebugState;
}

// Side-effect-free - safe to call on every owner-only render to keep the
// debug readout live, never consumes one of the OS's limited review-prompt
// slots and never writes last-asked.
export async function evaluateReview(token: string, trigger: ReviewTrigger = "verdict"): Promise<ReviewDebugState> {
  return evaluate(token, trigger);
}

// The real thing: re-evaluates, and ONLY if eligible actually opens the
// native review modal and stamps last-asked. Call sites apply their own
// REVIEW_PROMPT_DELAY_MS delay (via setTimeout) before calling this, so the
// eligibility check itself always reflects the moment the prompt would
// actually show, not the moment the triggering event fired.
export async function requestReviewIfEligible(token: string, trigger: ReviewTrigger): Promise<ReviewDebugState> {
  const state = await evaluate(token, trigger);
  if (!state.eligible) return state;
  try {
    await StoreReview.requestReview();
    const now = new Date().toISOString();
    await AsyncStorage.setItem(LAST_ASKED_KEY, now);
    _lastDebugState = { ..._lastDebugState, lastAskedAt: now };
  } catch {}
  return _lastDebugState;
}
