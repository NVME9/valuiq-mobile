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
  // True when this stat represents a real financial LOSS (net profit < 0) -
  // resellers take losses, and a loss isn't a "win": FlexRevealCard reads
  // this to swap out the celebratory green-glow/badge/"share your win"
  // treatment for an honest, non-celebratory one. Never inferred from the
  // formatted headline string - always the real signed number.
  isLoss?: boolean;
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

export function money(n: number): string {
  const neg = n < 0;
  return (neg ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

function daysLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

// The concrete win line every tier (except the ones that already say it in
// the headline) shows underneath - always literally true, never omitted
// just because a flashier stat won the headline slot. Exported so callers
// can render this same real, honest line INSTANTLY (before the crowd-
// comparison fetch resolves) as the reveal's loading placeholder - it's
// only ever built from numbers already on the row, never fabricated.
export function concreteLine(flip: FlexFlip): string {
  const parts: string[] = [];
  if (flip.netProfit != null) parts.push(`${money(flip.netProfit)} profit after fees`);
  if (flip.daysToSale != null) parts.push(`sold in ${daysLabel(flip.daysToSale)}`);
  return parts.join(" · ");
}

// Same real numbers as concreteLine(), minus the dollar figure - for use
// UNDERNEATH a hero that's already showing the money, so the line doesn't
// repeat itself ("$147 ... $147 profit after fees · sold in 9 days").
function concreteSubline(flip: FlexFlip): string {
  const parts: string[] = [];
  if (flip.netProfit != null) parts.push("profit after fees");
  if (flip.daysToSale != null) parts.push(`sold in ${daysLabel(flip.daysToSale)}`);
  return parts.join(" · ");
}

export function selectFlexStat(input: FlexStatInput): FlexStat {
  const { flip, personalRecord, segment, weekly, streak } = input;

  // Tier + badge selection - IDENTICAL priority order and honesty gates as
  // before (CROWD_MIN via MIN_SEGMENT_FOR_PERCENTILE, MIN_PERCENTILE_TO_SHOW,
  // MIN_WEEKLY_VOLUME, STREAK_MILESTONES; nothing here is fabricated or
  // shown against a thin sample). What changed is WHAT the winning tier
  // gets to say: it used to own the headline (the biggest element on the
  // card); now it only earns the badge, demoted below the money - see the
  // hero block after this, which is the SAME for every tier.
  let tier: FlexTier = "fallback";
  let badge: string | undefined;

  // 1. Personal record - only meaningful once there's a prior flip to beat.
  if (!badge && personalRecord.totalPriorSales >= 1) {
    if (personalRecord.isHighestProfitEver && flip.netProfit != null) {
      tier = "personal_record";
      badge = "PERSONAL BEST";
    } else if (personalRecord.isFastestSaleEver && flip.daysToSale != null) {
      tier = "personal_record";
      badge = "SPEED RECORD";
    }
  }

  // 2. Segment percentile - gated on real sample size, never a weak number.
  if (
    !badge &&
    segment.resolvedCount >= MIN_SEGMENT_FOR_PERCENTILE &&
    segment.percentile != null &&
    segment.percentile >= MIN_PERCENTILE_TO_SHOW
  ) {
    tier = "segment_percentile";
    badge = `BEAT ${segment.percentile}%`;
  }

  // 3. Weekly rarity - needs real platform volume behind it too.
  if (!badge && weekly.rank != null && weekly.totalThisWeek >= MIN_WEEKLY_VOLUME) {
    if (weekly.rank <= WEEKLY_TOP_RANK) {
      tier = "weekly_rarity";
      badge = `#${weekly.rank} THIS WEEK`;
    } else {
      const pct = Math.ceil((weekly.rank / weekly.totalThisWeek) * 100);
      if (pct <= WEEKLY_TOP_PCT) {
        tier = "weekly_rarity";
        badge = `TOP ${pct}% THIS WEEK`;
      }
    }
  }

  // 4. Streak/volume milestone.
  if (!badge && STREAK_MILESTONES.includes(streak.salesThisMonth)) {
    tier = "streak_milestone";
    badge = `${streak.salesThisMonth}${ordinalSuffix(streak.salesThisMonth)} FLIP`;
  }

  // 5. No badge earned - tier stays "fallback", badge stays undefined. The
  // hero below still renders the real profit - a flip with no milestone to
  // brag about is still a flip that made real money.

  // HERO: the real, honest profit made - never a milestone count, rank, or
  // percentile, and never the day-one projection (flip.netProfit here is
  // fed by flex-stat/route.ts's server-side read of the row, which the
  // scan-history PATCH recomputes from the actual sale price at log time).
  // Those other numbers are real too, but they're context for WHY this flip
  // is bragworthy, not the number a stranger stops on - "what resellers
  // actually made" is the hero in every tier, fallback included.
  const headline = flip.netProfit != null ? money(flip.netProfit) : "Logged!";
  const subStat = concreteSubline(flip) || "Nice flip.";
  const isLoss = flip.netProfit != null && flip.netProfit < 0;

  // Streak ribbon is independent of which tier won - skip it only when the
  // milestone tier already IS the streak message, to avoid saying it twice.
  const streakRibbon =
    tier !== "streak_milestone" && streak.salesThisMonth >= 2
      ? `🔥 ${streak.salesThisMonth}${ordinalSuffix(streak.salesThisMonth)} flip this month`
      : undefined;

  return { tier, headline, subStat, badge, streakRibbon, isLoss };
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

// ---- cache: persist the ONE stat that actually won, so re-viewing a
// sold flip never re-runs the crowd-comparison query (fetchAll over
// segment/weekly pools + a full user list) that made re-view feel like a
// dead button. Piggybacks on the scan row's existing specialty_data JSON
// blob (already whitelisted on the scan-history PATCH) instead of adding a
// new column - cheapest path, no migration.
// knownNetProfit: the row's real net_profit, ALWAYS passed by the caller
// (HistoryScreen has it on hand with zero extra fetch) so isLoss can be
// re-derived here rather than trusted from the cached blob.
//
// MEASURED INCIDENT (2026-08-31): every FlexStat cached before the isLoss
// field existed in this codebase has no such key at all - not `false`,
// simply absent (JSON.stringify drops an undefined property). That reads
// as falsy "not a loss" on every read forever after, rendering a real past
// loss as a fully celebratory win (green glow, "Share your win", badge/
// ribbon intact) - even though today's live selectFlexStat() computes
// isLoss correctly, this cached-read path never calls it again once a stat
// is cached, so the bug is permanent for that row without this fix.
// isLoss is a pure function of net_profit < 0 - recomputing it here is a
// single free comparison and can never be wrong, so this heals EVERY
// existing cached row (and any future cache-shape drift) the next time
// it's viewed, with no migration and no cache invalidation required.
export function readCachedFlexStat(specialtyData: string | null | undefined, knownNetProfit: number | null | undefined): FlexStat | null {
  if (!specialtyData) return null;
  try {
    const blob = JSON.parse(specialtyData);
    const cached = blob && blob.flexStat ? (blob.flexStat as FlexStat) : null;
    if (!cached) return null;
    return { ...cached, isLoss: knownNetProfit != null && knownNetProfit < 0 };
  } catch {
    return null;
  }
}

// Fire-and-forget from the caller's point of view (never blocks the reveal
// from showing) - merges into whatever's already in specialty_data rather
// than overwriting it, since that blob also carries the full scan-result
// snapshot the History card's "Analysis" prose reads. Returns the merged
// blob string on success (null on failure) so a caller holding the row in
// local state - e.g. HistoryScreen's `scans` array - can update it in place
// instead of re-parsing/re-merging the same logic a second time.
export async function cacheFlexStat(
  token: string,
  scanId: string,
  existingSpecialtyData: string | null | undefined,
  stat: FlexStat
): Promise<string | null> {
  let blob: any = {};
  if (existingSpecialtyData) {
    try { blob = JSON.parse(existingSpecialtyData) || {}; } catch { blob = {}; }
  }
  blob.flexStat = stat;
  const merged = JSON.stringify(blob);
  try {
    await fetch(`${API_BASE}/api/scan-history?token=${encodeURIComponent(token)}&id=${encodeURIComponent(scanId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialty_data: merged }),
    });
    return merged;
  } catch {
    // Best-effort - a failed cache write just means the next view re-fetches
    // live, same as today's behavior. Never surfaced to the user.
    return null;
  }
}
