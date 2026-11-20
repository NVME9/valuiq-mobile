// shareCardPayload.ts — pure request-shape builder for POST /api/share-card
// (the server now renders the finished PNG - see ShareStudio.tsx). No React,
// no network, no file I/O - every function here is a straight input->output
// transform so the stamp/tone mapping, money formatting, and the "no share
// on a loss" rule can all be unit tested independent of the component tree.
import { formatMoney } from "./money";
import { HeroVerdict } from "./outcomeTier";
import { DEFAULT_PHOTO_ADJUST, PhotoAdjust, isValidAccentHex, BgStyle } from "./shareStudio";

export type ShareCardFormat = "story" | "feed" | "square";
export type ShareCardVariant = "scan" | "win";
export type ShareCardTone = "lime" | "yellow" | "red";

// VERDICT STAMP (FIXED, founder screenshot bug): the stamp is now the EXACT
// same string the result screen's banner shows (ScannerScreen.tsx's
// `label: headline` - see lib/outcomeTier.ts's header comment: the tier IS
// the verdict), never a separate friendly phrase of its own. MEASURED: a
// SOLID scan's card used to stamp "GOOD FLIP" - a word the result screen
// never shows anywhere - so the card and the screen it was shared from could
// read as two different verdicts for the identical scan. One source of
// truth: this function returns `verdict` itself, verbatim, for every real
// HeroVerdict value (PASS/THIN/"WORTH A LOOK"/SOLID/"CHECK ITEM"). Only
// null (no verdict at all) still degrades to "no stamp" rather than
// fabricating one.
export function stampForHeroVerdict(verdict: HeroVerdict): string | null {
  return verdict;
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

// HERO LABEL (v4, founder device bug): the scan-variant hero number used to
// always render under a hardcoded "SELLS FOR" label, on every verdict alike
// - a PASS/THIN/CHECK ITEM card (the server's own number the user should NOT
// buy at) read as a recommendation ("SELLS FOR $16") exactly as strongly as
// a real BUY. "WORTH ABOUT" is the honest, non-recommending label for any
// card that isn't backed by real sold comps AND isn't a confident buy
// signal; "SELLS FOR" is reserved for a verdict that actually clears the
// buy bar (WORTH A LOOK/SOLID) AND is backed by real sold data (sold-backed,
// profitConfidence !== "estimate") - the one combination strong enough to
// read as a claim rather than a guess.
export function heroLabelForShareCard(verdict: HeroVerdict, isEstimate: boolean): "WORTH ABOUT" | "SELLS FOR" {
  if (verdict === "PASS" || verdict === "THIN" || verdict === "CHECK ITEM") return "WORTH ABOUT";
  if (isEstimate) return "WORTH ABOUT";
  return "SELLS FOR";
}

// HISTORY ENTRY POINT (v4 tone-bug audit, moved from HistoryScreen.tsx so
// it's pure/dependency-free and independently unit testable - see that
// screen's own comment at the old definition site). A re-shared row's real
// stored heroVerdict ALWAYS wins when present (same field ScannerScreen's
// result banner and HistoryScreen's own on-card badge already read) -
// toneForDecision's coarse BUY/WATCH/PASS mapping is now only a fallback
// for a row saved before heroVerdict existed at all. MEASURED (founder
// screenshot, 2026-11-19): a PASS-headline scan whose stale `decision`
// column still said "BUY" used to share a lime/green card purely because
// the re-share path read `decision` instead of the real stored verdict.
export function resolveStoredHeroVerdict(specialtyDataRaw: string | null | undefined): HeroVerdict {
  if (!specialtyDataRaw) return null;
  let full: any = null;
  try { full = JSON.parse(specialtyDataRaw); } catch { return null; }
  const headline = full?.heroVerdict?.headline;
  const validHeadlines: HeroVerdict[] = ["PASS", "THIN", "SOLID", "WORTH A LOOK", "CHECK ITEM"];
  return headline && (validHeadlines as string[]).includes(headline) ? headline : null;
}

// ONE HELPER PER ENTRY POINT: heroVerdict and toneOverride for History's
// re-share flow come from this SAME call, so a future edit can't update one
// without the other and silently reintroduce the stamp/tone mismatch above.
export function resolveHistoryShareInput(opts: {
  specialtyDataRaw: string | null | undefined;
  decision: string | null | undefined;
  isLoggedWin: boolean;
}): { heroVerdict: HeroVerdict; toneOverride?: ShareCardTone } {
  if (opts.isLoggedWin) return { heroVerdict: null, toneOverride: undefined };
  const stored = resolveStoredHeroVerdict(opts.specialtyDataRaw);
  if (stored) return { heroVerdict: stored, toneOverride: undefined };
  return { heroVerdict: null, toneOverride: toneForDecision(opts.decision) };
}

// HISTORY WIN-REVEAL ENTRY POINT (v6, item B): "View reveal" on an already-
// sold History row now reopens THIS SAME win payload builder (above),
// never the retired FlexRevealCard (whose stat-fallback copy could drift
// from the Studio's own honest label/stamp - see buildShareCardPayload's
// win-variant comment). Extracts the win-variant numbers from whichever row
// shape History hands it - the DB row shape (scans/specialty, snake_case:
// buy_price/actual_sold_price/net_profit) or the thrift-item shape
// (camelCase: buyPrice/sellPrice/profit) - same fallback-chain convention
// HistoryScreen.tsx's own toShareResult() uses for every other field off
// these two row shapes.
export function resolveHistoryWinData(row: any): { boughtPrice: number; soldPrice: number; profit: number } {
  const profit = Number(row?.net_profit ?? row?.profit ?? 0) || 0;
  const boughtPrice = Number(row?.buy_price ?? row?.buyPrice ?? 0) || 0;
  const soldPrice = Number(row?.actual_sold_price ?? row?.sell_price ?? row?.sellPrice ?? 0) || 0;
  return { boughtPrice, soldPrice, profit };
}

// SCANNER ENTRY POINT (v4 tone-bug audit): ScannerScreen.tsx's result screen
// used to inline this exact ternary (`maxBuyLocked ? null : finalHeadline`)
// directly in the ShareStudio JSX prop - correct, but with nothing stopping
// a future edit to that screen from passing finalHeadline on its own (or a
// re-derived local verdict) and silently reintroducing a stamp/tone
// mismatch. Named and exported so ScannerScreen.tsx calls THIS, and so this
// exact gate has its own unit test independent of the component tree.
export function resolveScanShareVerdict(finalHeadline: HeroVerdict, maxBuyLocked: boolean): HeroVerdict {
  return maxBuyLocked ? null : finalHeadline;
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
  // Scan variant only - see heroLabelForShareCard's own comment. Omitted
  // for the win variant, which has its own hero semantics (signed profit/
  // loss, never a "sells for"/"worth about" claim).
  heroLabel?: "WORTH ABOUT" | "SELLS FOR";
  name: string;
  handle?: string;
  hook?: string;
  hidePrice?: boolean;
  // Omitted entirely for "Auto" (the card's own verdict-derived color) -
  // only ever present when the user picked a swatch/hex, and only when
  // that value is actually a valid 6-digit hex (see isValidAccentHex).
  accent?: string;
  photoAdjust: PhotoAdjust;
  // v7 (deal-ai-pro server fields): bgStyle/photoBorder are only ever sent
  // when the caller actually set them - omitted falls back to the SERVER's
  // own defaults ('blur'/accent-driven - see renderCard.ts's resolvePhotoBorder),
  // same "omit for the default, don't resend it" convention `accent` uses.
  // `cutout` is the one exception: always sent as an explicit boolean (never
  // omitted) so the server's "cutout:true -> 501 cutout_unavailable" gate -
  // checked before any photo work - sees a real value rather than defaulting
  // via `?? false` on every request, which would mask a caller that forgot
  // to pass it at all.
  bgStyle?: BgStyle;
  photoBorder?: boolean;
  cutout: boolean;
}

interface ControlsInput {
  format: ShareCardFormat;
  itemName: string;
  hook?: string | null;
  handle?: string | null; // null/empty = handle not shown
  hidePrice?: boolean;
  accent?: string | null; // null/undefined/invalid hex = Auto, omitted from the payload
  photoAdjust?: PhotoAdjust; // defaults to DEFAULT_PHOTO_ADJUST (whole, zoom 1, centered) when omitted
  bgStyle?: BgStyle | null; // null/undefined = let the server pick its own default ('blur')
  photoBorder?: boolean | null; // null/undefined = let the server pick its own default (accent-driven)
  cutout?: boolean; // always sent - see ShareCardPayload.cutout's own comment
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
  const bgStyle = input.bgStyle ?? undefined;
  const photoBorder = input.photoBorder ?? undefined;
  const cutout = !!input.cutout;

  if (input.variant === "win") {
    // A sale can be logged at a profit, a loss, or dead even - the sign of
    // `profit` decides everything (v5, founder device bug: a real LOSS
    // - Mainstays canner, paid 19.62/sold 5/profit -15.28 - still stamped
    // "SOLD" and read as a win). Three-way, not a loss/non-loss binary:
    //   profit > 0  -> stamp "SOLD",  tone lime, caption "PROFIT AFTER FEES"
    //   profit === 0 -> stamp "SOLD", tone lime, caption "BREAK EVEN"
    //                   (a wash is neutral, not a failure - never red/LOSS)
    //   profit < 0  -> stamp "LOSS",  tone red,  caption "LOSS AFTER FEES"
    // formatMoney already puts the "-" before the "$" for a negative
    // number and leaves an exact-zero amount unsigned ("$0") - only the
    // real-profit branch needs its own leading "+".
    const isLoss = input.profit < 0;
    const isBreakEven = input.profit === 0;
    return {
      format: input.format,
      variant: "win",
      paid: formatMoney(input.boughtPrice),
      hero: input.profit > 0 ? `+${formatMoney(input.profit)}` : formatMoney(input.profit),
      sold: formatMoney(input.soldPrice),
      caption: isLoss ? "LOSS AFTER FEES" : isBreakEven ? "BREAK EVEN" : "PROFIT AFTER FEES",
      stamp: isLoss ? "LOSS" : "SOLD",
      tone: isLoss ? "red" : "lime",
      name: input.itemName,
      photoAdjust,
      cutout,
      ...(handle ? { handle } : {}),
      ...(hook ? { hook } : {}),
      ...(hidePrice ? { hidePrice: true } : {}),
      ...(accent ? { accent } : {}),
      ...(bgStyle ? { bgStyle } : {}),
      ...(photoBorder != null ? { photoBorder } : {}),
    };
  }

  const paidUnknown = input.paidPrice == null || input.paidPrice <= 0;
  // ONE HELPER, ONE INPUT (v4 tone-bug audit): stamp, tone, AND heroLabel
  // are all derived from this SAME `input.verdict` right here - no entry
  // point builds any of the three independently, so a scan card's text and
  // color can never disagree the way HistoryScreen's old toneForDecision
  // path once let them (see that screen's resolveStoredHeroVerdict comment).
  const tone = input.toneOverride ?? toneForHeroVerdict(input.verdict);
  const stamp = stampForHeroVerdict(input.verdict);
  const heroLabel = heroLabelForShareCard(input.verdict, input.isEstimate);

  // SERVER ROOT CAUSE (v5, founder device bug: a PASS Columbia-hat card
  // still read "SELLS FOR $20"): the server NEVER reads `heroLabel` at all
  // - deal-ai-pro/lib/shareCard/renderCard.ts:326's labelNode computes its
  // own tail text from the boolean `estimate` field alone
  // (`d.estimate ? "WORTH ABOUT" : "SELLS FOR"`), which app/api/share-card/
  // route.ts:72 reads as `body?.estimate === true` - `heroLabel` isn't in
  // either file's vocabulary, so sending it (as v4 did) was a no-op. Fixed
  // without touching the server (out of scope for this change) by sending
  // the EXISTING `estimate` field whenever heroLabel resolves to "WORTH
  // ABOUT" - not just when isEstimate is true - so a sold-backed PASS/THIN/
  // CHECK ITEM still renders the honest tail. `caption:"ESTIMATE"` is a
  // separate, independently-sent field (only ever true isEstimate), so this
  // never mislabels a real sold-backed card as an "ESTIMATE".
  const sendEstimateFlagForLabel = heroLabel === "WORTH ABOUT";

  return {
    format: input.format,
    variant: "scan",
    paid: formatMoney(paidUnknown ? 0 : (input.paidPrice as number)),
    hero: formatMoney(input.heroSellPrice ?? 0),
    tone,
    heroLabel,
    name: input.itemName,
    photoAdjust,
    cutout,
    ...(stamp ? { stamp } : {}),
    ...(input.isEstimate
      ? { estimate: true, caption: "ESTIMATE" }
      : (sendEstimateFlagForLabel ? { estimate: true } : {})),
    ...(handle ? { handle } : {}),
    ...(hook ? { hook } : {}),
    ...(hidePrice || paidUnknown ? { hidePrice: true } : {}),
    ...(accent ? { accent } : {}),
    ...(bgStyle ? { bgStyle } : {}),
    ...(photoBorder != null ? { photoBorder } : {}),
  };
}

// MAKE VIDEO (2026-11-19): POST /api/share-video takes the EXACT same body
// shape as /api/share-card - every control (hook/handle/hidePrice/accent/
// photoAdjust) carries over unchanged - except format is always forced to
// "story" (the only format the video renderer supports), regardless of
// whichever format tab the user currently has selected in the image
// preview. Pure passthrough + override, so it's testable independent of the
// network call (lib/shareVideoApi.ts) and the component.
export function buildShareVideoPayload(input: BuildShareCardInput): ShareCardPayload {
  return buildShareCardPayload({ ...input, format: "story" });
}
