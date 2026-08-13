// flexReveal.ts — the Flex Reveal's brain.
//
// selectFlexStat() is a PURE function: given the raw comparison numbers for
// a just-logged sale, it picks the single best TRUE stat to brag about,
// first-that-qualifies-wins. No network, no randomness, no fabrication -
// every branch either returns a number that's directly in the input or
// returns nothing and falls through. This is deliberately separate from
// fetchFlexStat() (the network call) so the selection logic can be reasoned
// about/tested on its own.
import { API_BASE } from "./api";

export interface FlexFlip {
  itemName?: string | null;
  brand?: string | null;
  category?: string | null;
  actualSoldPrice?: number | null;
  buyPrice?: number | null;
  netProfit?: number | null;
  daysToSale?: number | null;
}

export interface FlexPersonalRecord {
  totalPriorSales: number;
  priorBestProfit: number | null;
  priorFastestDays: number | null;
  isHighestProfitEver: boolean;
  isFastestSaleEver: boolean;
}

export interface FlexSegment {
  brand: string | null;
  category: string;
  resolvedCount: number;
  percentile: number | null; // 0-100, null unless resolvedCount cleared the readiness bar
}

export interface FlexWeekly {
  rank: number | null; // 1 = best flip logged platform-wide this week
  totalThisWeek: number;
}

export interface FlexStreak {
  salesThisMonth: number; // includes this one
}

export interface FlexStatInput {
  flip: FlexFlip;
  personalRecord: FlexPersonalRecord;
  segment: FlexSegment;
  weekly: FlexWeekly;
  streak: FlexStreak;
}

export type FlexTier = "personal_record" | "segment_percentile" | "weekly_rarity" | "streak_milestone" | "fallback";

export interface FlexStat {
  tier: FlexTier;
  headline: string;   // the big hero number/phrase
  subStat: string;     // the concrete, always-true detail line beneath it
  badge?: string;       // short rank/record label, if earned
  streakRibbon?: string; // small "Nth flip this month" ribbon, independent of which tier won
}

// Readiness bar for a segment percentile to be honest - matches the
// CROWD_MIN used across the backend (profit-oracle, admin Segment
// Readiness). A percentile computed against fewer real flips than this
// isn't a fact, it's noise wearing a costume.
const MIN_SEGMENT_FOR_PERCENTILE = 15;
// A percentile has to actually be impressive to brag about - "beat 51%" is
// barely a coin flip. Below this, fall through rather than damn with faint praise.
const MIN_PERCENTILE_TO_SHOW = 60;
// Weekly rarity needs enough platform volume for "top 5%" to mean anything.
const MIN_WEEKLY_VOLUME = 20;
const WEEKLY_TOP_RANK = 3;
const WEEKLY_TOP_PCT = 10;
// Round numbers worth a milestone callout.
const STREAK_MILESTONES = [5, 10, 25, 50, 100, 250, 500];

function money(n: number): string {
  const neg = n < 0;
  return (neg ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

function daysLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

// The concrete win line every tier (except the ones that already say it in
// the headline) shows underneath - always literally true, never omitted
// just because a flashier stat won the headline slot.
function concreteLine(flip: FlexFlip): string {
  const parts: string[] = [];
  if (flip.netProfit != null) parts.push(`${money(flip.netProfit)} profit after fees`);
  if (flip.daysToSale != null) parts.push(`sold in ${daysLabel(flip.daysToSale)}`);
  return parts.join(" · ");
}

export function selectFlexStat(input: FlexStatInput): FlexStat {
  const { flip, personalRecord, segment, weekly, streak } = input;
  const sub = concreteLine(flip);

  let result: Omit<FlexStat, "streakRibbon"> | null = null;

  // 1. Personal record - only meaningful once there's a prior flip to beat.
  if (!result && personalRecord.totalPriorSales >= 1) {
    if (personalRecord.isHighestProfitEver && flip.netProfit != null) {
      result = {
        tier: "personal_record",
        headline: money(flip.netProfit),
        subStat: flip.daysToSale != null ? `Your best flip yet · sold in ${daysLabel(flip.daysToSale)}` : "Your best flip yet",
        badge: "PERSONAL BEST",
      };
    } else if (personalRecord.isFastestSaleEver && flip.daysToSale != null) {
      result = {
        tier: "personal_record",
        headline: daysLabel(flip.daysToSale),
        subStat: flip.netProfit != null ? `Your fastest sale yet · ${money(flip.netProfit)} profit after fees` : "Your fastest sale yet",
        badge: "SPEED RECORD",
      };
    }
  }

  // 2. Segment percentile - gated on real sample size, never a weak number.
  if (
    !result &&
    segment.resolvedCount >= MIN_SEGMENT_FOR_PERCENTILE &&
    segment.percentile != null &&
    segment.percentile >= MIN_PERCENTILE_TO_SHOW
  ) {
    const segLabel = segment.brand ? `${segment.brand} ${segment.category.toLowerCase()}` : segment.category.toLowerCase();
    result = {
      tier: "segment_percentile",
      headline: `Beat ${segment.percentile}%`,
      subStat: `of ${segLabel} flips (${segment.resolvedCount} compared)`,
      badge: `TOP ${Math.max(1, 100 - segment.percentile)}%`,
    };
  }

  // 3. Weekly rarity - needs real platform volume behind it too.
  if (!result && weekly.rank != null && weekly.totalThisWeek >= MIN_WEEKLY_VOLUME) {
    if (weekly.rank <= WEEKLY_TOP_RANK) {
      result = {
        tier: "weekly_rarity",
        headline: `#${weekly.rank} this week`,
        subStat: `out of ${weekly.totalThisWeek} flips logged`,
        badge: "TOP FLIP",
      };
    } else {
      const pct = Math.ceil((weekly.rank / weekly.totalThisWeek) * 100);
      if (pct <= WEEKLY_TOP_PCT) {
        result = {
          tier: "weekly_rarity",
          headline: `Top ${pct}%`,
          subStat: `flip this week, out of ${weekly.totalThisWeek}`,
          badge: "RARE FLIP",
        };
      }
    }
  }

  // 4. Streak/volume milestone.
  if (!result && STREAK_MILESTONES.includes(streak.salesThisMonth)) {
    result = {
      tier: "streak_milestone",
      headline: `${streak.salesThisMonth}th flip`,
      subStat: sub || "logged this month",
      badge: "MILESTONE",
    };
  }

  // 5. Fallback - always succeeds, always honest, never a weak percentile.
  if (!result) {
    result = {
      tier: "fallback",
      headline: flip.netProfit != null ? money(flip.netProfit) : "Logged!",
      subStat: sub || "Nice flip.",
    };
  }

  // Streak ribbon is independent of which tier won - skip it only when the
  // milestone tier already IS the streak message, to avoid saying it twice.
  const streakRibbon =
    result.tier !== "streak_milestone" && streak.salesThisMonth >= 2
      ? `🔥 ${streak.salesThisMonth}${ordinalSuffix(streak.salesThisMonth)} flip this month`
      : undefined;

  return { ...result, streakRibbon };
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// ---- network: fetch the raw comparison numbers, then select ----
export async function fetchFlexStat(token: string, scanId: string): Promise<FlexStat | null> {
  try {
    const r = await fetch(`${API_BASE}/api/flex-stat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, scanId }),
    });
    const j = await r.json();
    if (!j?.success) return null;
    return selectFlexStat({
      flip: j.flip,
      personalRecord: j.personalRecord,
      segment: j.segment,
      weekly: j.weekly,
      streak: j.streak,
    });
  } catch {
    return null;
  }
}
