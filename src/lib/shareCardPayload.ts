// shareCardPayload.ts — pure request-shape builder for POST /api/share-card
// (the server now renders the finished PNG - see ShareStudio.tsx). No React,
// no network, no file I/O - every function here is a straight input->output
// transform so the stamp/tone mapping, money formatting, and the "no share
// on a loss" rule can all be unit tested independent of the component tree.
import { formatMoney } from "./money";
import { HeroVerdict } from "./outcomeTier";
import { DEFAULT_PHOTO_ADJUST, PhotoAdjust, isValidAccentHex } from "./shareStudio";

export type ShareCardFormat = "story" | "feed" | "square";
export type ShareCardVariant = "scan" | "win";
export type ShareCardTone = "lime" | "yellow" | "red";

// VERDICT STAMP: the real 5-value HeroVerdict mapped to the friendly word(s)
// stamped on the card - CHECK ITEM (and null/any future value) deliberately
// falls through to "no stamp" rather than a hedge word, same "degrade to
// nothing, never fabricate" rule this app already uses elsewhere.
const STAMP_WORDS: Partial<Record<Exclude<HeroVerdict, null>, string>> = {
  SOLID: "GOOD FLIP",
  "WORTH A LOOK": "GOOD FLIP",
  THIN: "THIN MARGIN",
  PASS: "PASS",
};

export function stampForHeroVerdict(verdict: HeroVerdict): string | null {
  if (verdict == null) return null;
  return STAMP_WORDS[verdict] ?? null;
}

// TONE: PASS -> red; THIN/CHECK ITEM -> yellow; WORTH A LOOK/SOLID -> lime.
// An unresolved verdict (null, or a future value this map hasn't caught up
// to yet) reads as yellow - a caution color, never a false "good" or "bad".
const TONE_FOR_VERDICT: Partial<Record<Exclude<HeroVerdict, null>, ShareCardTone>> = {
  PASS: "red",
  THIN: "yellow",
  "CHECK ITEM": "yellow",
  "WORTH A LOOK": "lime",
  SOLID: "lime",
};

export function toneForHeroVerdict(verdict: HeroVerdict): ShareCardTone {
  if (verdict == null) return "yellow";
  return TONE_FOR_VERDICT[verdict] ?? "yellow";
}

// Fallback for a stored row that only ever kept the coarser decision enum
// (BUY/WATCH/PASS/UNKNOWN - lib/outcomeTier.ts's decisionFromVerdict), never
// the full HeroVerdict - used only where there's no real heroVerdict to
// resolve (History's re-share of a not-yet-sold row).
export function toneForDecision(decision: string | null | undefined): ShareCardTone {
  if (decision === "BUY") return "lime";
  if (decision === "WATCH") return "yellow";
  return "red";
}

// WIN VARIANT GATE: a logged sale only ever gets a share screen when it
// actually made money - a loss or break-even sale gets a plain "Saved"
// confirmation instead (see LogSaleModal.tsx), never a share button or the
// "Share your win" wording.
export function canShareWin(profit: number | null | undefined): boolean {
  return typeof profit === "number" && Number.isFinite(profit) && profit > 0;
}

const MAX_HOOK_CHARS = 40;

export interface ShareCardPayload {
  format: ShareCardFormat;
  variant: ShareCardVariant;
  paid: string;
  hero: string;
  sold?: string;
  estimate?: boolean;
  caption?: string;
  stamp?: string;
  tone: ShareCardTone;
  name: string;
  handle?: string;
  hook?: string;
  hidePrice?: boolean;
  // Omitted entirely for "Auto" (the card's own verdict-derived color) -
  // only ever present when the user picked a swatch/hex, and only when
  // that value is actually a valid 6-digit hex (see isValidAccentHex).
  accent?: string;
  photoAdjust: PhotoAdjust;
}

interface ControlsInput {
  format: ShareCardFormat;
  itemName: string;
  hook?: string | null;
  handle?: string | null; // null/empty = handle not shown
  hidePrice?: boolean;
  accent?: string | null; // null/undefined/invalid hex = Auto, omitted from the payload
  photoAdjust?: PhotoAdjust; // defaults to DEFAULT_PHOTO_ADJUST (whole, zoom 1, centered) when omitted
}

export interface BuildScanCardInput extends ControlsInput {
  variant: "scan";
  paidPrice: number | null;
  heroSellPrice: number | null;
  verdict: HeroVerdict;
  // History's re-share of a not-yet-sold row only ever has the coarser
  // decision enum, never a real HeroVerdict - pass a pre-resolved tone in
  // that case instead of `verdict`'s own mapping.
  toneOverride?: ShareCardTone;
  isEstimate: boolean;
}

export interface BuildWinCardInput extends ControlsInput {
  variant: "win";
  boughtPrice: number;
  soldPrice: number;
  profit: number;
}

export type BuildShareCardInput = BuildScanCardInput | BuildWinCardInput;

// Item NAME is NEVER truncated here - same "shrink-to-fit, don't slice
// characters" rule the old on-device card used, now enforced server-side;
// this builder just passes it through verbatim, however long.
export function buildShareCardPayload(input: BuildShareCardInput): ShareCardPayload {
  const hook = input.hook && input.hook.trim() ? input.hook.trim().slice(0, MAX_HOOK_CHARS) : undefined;
  const handle = input.handle && input.handle.trim() ? input.handle.trim() : undefined;
  const hidePrice = !!input.hidePrice;
  const accent = input.accent && isValidAccentHex(input.accent) ? input.accent : undefined;
  const photoAdjust = input.photoAdjust ?? DEFAULT_PHOTO_ADJUST;

  if (input.variant === "win") {
    // A sale can be logged at a profit, a loss, or dead even - the card
    // always shows SOLD, but the sign of `profit` decides everything else:
    // a non-positive result reads as an honest "LOSS AFTER FEES" in red,
    // never dressed up as a win. formatMoney already puts the "-" before
    // the "$" for a negative number, so only the profit branch needs its
    // own leading "+".
    const isLoss = input.profit <= 0;
    return {
      format: input.format,
      variant: "win",
      paid: formatMoney(input.boughtPrice),
      hero: isLoss ? formatMoney(input.profit) : `+${formatMoney(input.profit)}`,
      sold: formatMoney(input.soldPrice),
      caption: isLoss ? "LOSS AFTER FEES" : "PROFIT AFTER FEES",
      stamp: "SOLD",
      tone: isLoss ? "red" : "lime",
      name: input.itemName,
      photoAdjust,
      ...(handle ? { handle } : {}),
      ...(hook ? { hook } : {}),
      ...(hidePrice ? { hidePrice: true } : {}),
      ...(accent ? { accent } : {}),
    };
  }

  const paidUnknown = input.paidPrice == null || input.paidPrice <= 0;
  const tone = input.toneOverride ?? toneForHeroVerdict(input.verdict);
  const stamp = stampForHeroVerdict(input.verdict);

  return {
    format: input.format,
    variant: "scan",
    paid: formatMoney(paidUnknown ? 0 : (input.paidPrice as number)),
    hero: formatMoney(input.heroSellPrice ?? 0),
    tone,
    name: input.itemName,
    photoAdjust,
    ...(stamp ? { stamp } : {}),
    ...(input.isEstimate ? { estimate: true, caption: "ESTIMATE" } : {}),
    ...(handle ? { handle } : {}),
    ...(hook ? { hook } : {}),
    ...(hidePrice || paidUnknown ? { hidePrice: true } : {}),
    ...(accent ? { accent } : {}),
  };
}
