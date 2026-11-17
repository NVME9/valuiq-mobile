// shareStudio.ts — pure logic for the Share Studio (the single post-export
// screen that replaced RevealScreen/RevealPhotoEditor). No React, no native
// module, no network - every function here is a straight input->output
// transform so crop clamping, zone geometry, verdict-stamp mapping, and
// price-block text can be unit tested independent of the component tree.
import { formatMoney } from "./money";

export type StudioFormat = "story" | "feed" | "square";
export type StudioLook = "dark" | "light" | "bold";
export type StudioConfidence = "estimate" | "sold-backed";

// Structurally identical to lib/outcomeTier.ts's own HeroVerdict - kept as
// a LOCAL copy (not an import) so this presentation-only module never
// depends on verdict/pricing logic (see AGENTS.md task scope: "Do not touch
// scan, verdict, pricing, or history logic"). TypeScript's structural
// typing means a real HeroVerdict value passes straight through at call
// sites with no cast needed.
export type StudioHeroVerdict = "PASS" | "THIN" | "WORTH A LOOK" | "SOLID" | "CHECK ITEM" | null;

export interface Size { w: number; h: number }
export interface Point { x: number; y: number }

// Export pixel sizes: always 1080 wide, height set by format. The on-screen
// card is this SAME canvas, just multiplied down by a `scale` factor (see
// cardGeometry below) - preview and export can never structurally diverge
// because they both read every pixel value off one function.
export const FORMAT_SIZES: Record<StudioFormat, Size> = {
  story: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
};

export const FORMAT_LABELS: Record<StudioFormat, string> = {
  story: "Story",
  feed: "Feed",
  square: "Square",
};

export const LOOK_LABELS: Record<StudioLook, string> = {
  dark: "Dark",
  light: "Light",
  bold: "Bold",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// On-screen preview frame for a format, as big as fits inside the available
// viewport in both dimensions - same "fit, don't overflow" rule
// RevealPhotoEditor's fixedFrameSize used, generalized to all three ratios.
export function frameSizeForRatio(ratio: number, maxW: number, maxH: number): Size {
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

export function frameSizeForFormat(format: StudioFormat, maxW: number, maxH: number): Size {
  const { w: fw, h: fh } = FORMAT_SIZES[format];
  return frameSizeForRatio(fw / fh, maxW, maxH);
}

// "cover" scale: the minimum zoom at which the image fully fills the frame
// in both dimensions (same definition RevealPhotoEditor.coverScale used).
export function coverScale(img: Size, frame: Size): number {
  if (img.w <= 0 || img.h <= 0) return 1;
  return Math.max(frame.w / img.w, frame.h / img.h);
}

// "contain" scale: the (smaller) zoom at which the WHOLE image fits inside
// the frame with no cropping at all - the counterpart to coverScale's
// Math.max, letterboxed on whichever axis has slack. This is what lets the
// photo zone show a subject in full instead of being forced to crop it.
export function containScale(img: Size, frame: Size): number {
  if (img.w <= 0 || img.h <= 0) return 1;
  return Math.min(frame.w / img.w, frame.h / img.h);
}

// The lowest RELATIVE crop.scale (relative to coverScale, same unit every
// other crop value in this file uses) that still shows the image fully
// contained in the frame - always <= 1 since contain <= cover by
// definition. clampZoomScale's own default floor of 1 is cover (the old,
// crop-forced minimum); passing this as the `min` argument is what lets
// "Adjust photo" zoom OUT past cover to show the whole subject.
export function minCropScale(img: Size, frame: Size): number {
  const cover = coverScale(img, frame);
  if (cover <= 0) return 1;
  return containScale(img, frame) / cover;
}

export function clampZoomScale(scale: number, min = 1, max = 4): number {
  return clamp(scale, min, max);
}

export const ZOOM_STEP = 0.1;

// The +/- zoom buttons (item B: "always-working controls") step by a fixed
// 10% of the base cover scale, then re-clamp into the normal [1,4] range (or
// [min,4] when a caller passes a lower floor, e.g. minCropScale, to allow
// zooming out to "contain") - a button press can NEVER do nothing, unlike a
// pinch gesture a device might fail to recognize.
export function stepZoomScale(scale: number, direction: 1 | -1, step: number = ZOOM_STEP, min = 1): number {
  return clampZoomScale(scale + direction * step, min);
}

// The crop.scale a format should START at, before the user touches
// anything. Story keeps the old "cover" default (its tall 9:16 zone suits
// the typical portrait thrift photo). Feed/Square are the formats whose
// zones are closer to square, where a WIDER-than-tall photo at cover
// crops the sides off the subject - those default to "contain" instead
// (whole photo visible, letterboxed) so the subject is never cut off
// before the user has even touched the crop. A portrait/square photo on
// Feed/Square still defaults to cover - contain would just add pointless
// letterboxing on photos that already fit the zone fine.
export function defaultCropScale(format: StudioFormat, img: Size): number {
  if (format === "story") return 1;
  if (img.w <= 0 || img.h <= 0) return 1;
  if (img.w <= img.h) return 1;
  return minCropScale(img, photoZoneSize(format));
}

// Clamps a pan translate so the frame is always fully covered by the image
// at the given user zoom - the frame can never show empty space outside the
// photo. `scale` is the user's own pinch-zoom multiplier (1 = just covering).
export function clampPanTranslate(t: Point, scale: number, img: Size, frame: Size): Point {
  if (img.w <= 0 || img.h <= 0) return { x: 0, y: 0 };
  const abs = coverScale(img, frame) * scale;
  const maxX = Math.max(0, (img.w * abs - frame.w) / 2);
  const maxY = Math.max(0, (img.h * abs - frame.h) / 2);
  return { x: clamp(t.x, -maxX, maxX), y: clamp(t.y, -maxY, maxY) };
}

export interface ImagePlacement { w: number; h: number; left: number; top: number }

// The exact on-screen placement of the cropped photo inside a frame of
// `nativeFrame` (in native, scale=1 units) displayed at `displayScale` -
// used by BOTH the "Adjust photo" editor's own on-screen preview and the
// card's photo zone (at displayScale=previewScale or 1). Same formula in
// both places, so what the user crops to is pixel-identical to what ends
// up on the exported card, not just visually similar.
export function imagePlacement(img: Size, nativeFrame: Size, crop: { scale: number; translate: Point }, displayScale: number): ImagePlacement {
  const abs = coverScale(img, nativeFrame) * crop.scale;
  const w = img.w * abs * displayScale;
  const h = img.h * abs * displayScale;
  const containerW = nativeFrame.w * displayScale;
  const containerH = nativeFrame.h * displayScale;
  return {
    w, h,
    left: containerW / 2 - w / 2 + crop.translate.x * displayScale,
    top: containerH / 2 - h / 2 + crop.translate.y * displayScale,
  };
}

// ---------------------------------------------------------------------------
// CARD ZONE GEOMETRY (item A: "Card layout must not depend on the device")
//
// Five zones, stacked top to bottom with zero gap and zero overlap BY
// CONSTRUCTION: each zone's y is the previous zone's y+h, and the final
// zone (footer) simply takes whatever height is left. There is no way for
// two zones to occupy the same pixel row - the overlap test below is
// therefore a genuine structural guarantee, not a visual judgment call.
// ---------------------------------------------------------------------------
export type ZoneName = "photo" | "stamp" | "price" | "name" | "footer";
export type Zones = Record<ZoneName, { y: number; h: number }>;

// Instagram Stories overlay native UI at the very top and across roughly
// the bottom quarter (reply bar) - key TEXT has to stay inside y=250..1440
// or a viewer's own UI chrome sits on top of it. That band is a HARD
// ceiling on how much room stamp+price+name can claim; the photo is not
// text and is free to run full-bleed above it, so photo gets everything
// up to that ceiling (as large as the safe band allows) and footer
// (handle/wordmark - the least essential line) is the one thing allowed to
// fall into the reserved bottom strip.
const STORY_TEXT_BAND_END = 1440;
const STORY_ZONE_H = { stamp: 100, price: 320, name: 170 };

// Feed/Square have no equivalent platform-UI overlay to dodge, so their
// three flexible zones just split whatever height remains (after the fixed
// stamp/footer bands) as a fraction of that remainder - same approach as
// before, just re-tuned to give photo more room now that this card is
// styled like the win card (big hero number, not a big empty panel) rather
// than needing a tall price/name block to not look bare.
const FIXED: Record<"feed" | "square", { stamp: number; footer: number }> = {
  feed: { stamp: 90, footer: 100 },
  square: { stamp: 80, footer: 90 },
};
const ZONE_FRACTIONS: Record<"feed" | "square", { photo: number; price: number; name: number }> = {
  feed: { photo: 0.62, price: 0.24, name: 0.14 },
  square: { photo: 0.58, price: 0.26, name: 0.16 },
};

export function zonesForFormat(format: StudioFormat): Zones {
  const { h: H } = FORMAT_SIZES[format];

  if (format === "story") {
    const { stamp: stampH, price: priceH, name: nameH } = STORY_ZONE_H;
    const photoH = STORY_TEXT_BAND_END - stampH - priceH - nameH;
    let y = 0;
    const photo = { y, h: photoH }; y += photoH;
    const stamp = { y, h: stampH }; y += stampH;
    const price = { y, h: priceH }; y += priceH;
    const name = { y, h: nameH }; y += nameH;
    const footer = { y, h: H - y }; // the reserved bottom strip, by construction >= H - 1440
    return { photo, stamp, price, name, footer };
  }

  const { stamp: STAMP_H, footer: FOOTER_H } = FIXED[format];
  const frac = ZONE_FRACTIONS[format];
  const flexH = H - STAMP_H - FOOTER_H;
  const photoH = Math.round(flexH * frac.photo);
  const priceH = Math.round(flexH * frac.price);
  const nameH = Math.round(flexH * frac.name);

  let y = 0;
  const photo = { y, h: photoH }; y += photoH;
  const stamp = { y, h: STAMP_H }; y += STAMP_H;
  const price = { y, h: priceH }; y += priceH;
  const name = { y, h: nameH }; y += nameH;
  const footer = { y, h: H - y }; // absorbs all rounding slack, always >= 0

  return { photo, stamp, price, name, footer };
}

// The native (scale=1, 1080-wide-canvas) size of just the photo zone, in
// its own right aspect ratio - this is the shape the "Adjust photo" crop
// frame uses, so what the user crops to is EXACTLY what the card's photo
// zone will show, never a different (e.g. full 9:16 story) aspect that
// would make the on-screen crop a lie about what gets exported.
export function photoZoneSize(format: StudioFormat): Size {
  const zones = zonesForFormat(format);
  return { w: FORMAT_SIZES[format].w, h: zones.photo.h };
}

// Scales every zone's y/h by a pixel-per-pixel factor - the SAME geometry
// function the export canvas uses, just multiplied down for an on-screen
// preview. This (not a CSS transform) is how "preview == export" is
// guaranteed: there is only one source of truth for where anything sits.
export function scaleZones(zones: Zones, scale: number): Zones {
  const out = {} as Zones;
  (Object.keys(zones) as ZoneName[]).forEach((k) => {
    out[k] = { y: zones[k].y * scale, h: zones[k].h * scale };
  });
  return out;
}

// ---------------------------------------------------------------------------
// VERDICT STAMP (item: "server heroVerdict mapped to friendly words")
// ---------------------------------------------------------------------------
const STAMP_WORDS: Partial<Record<Exclude<StudioHeroVerdict, null>, string>> = {
  SOLID: "GOOD FLIP",
  "WORTH A LOOK": "GOOD FLIP", // decisionFromVerdict buckets this with SOLID as "BUY"
  THIN: "THIN MARGIN",
  PASS: "PASS",
  // "CHECK ITEM" is deliberately absent - falls through to null below.
};

// CHECK ITEM, null, or any future/unknown verdict value all resolve to "no
// stamp" - never "UNCONFIRMED" or any other hedge-word headline. This is
// the ONE place that mapping happens, so a future HeroVerdict addition
// degrades to "no stamp" instead of silently printing something untested.
export function stampForHeroVerdict(verdict: StudioHeroVerdict): string | null {
  if (verdict == null) return null;
  return STAMP_WORDS[verdict] ?? null;
}

// ---------------------------------------------------------------------------
// PRICE BLOCK (item: paid line + big lime price + estimate caption +
// profit line, each independently gated)
// ---------------------------------------------------------------------------
export interface PriceBlockInput {
  paidPrice: number | null;
  sellPrice: number | null;
  profit: number | null;
  roi: number | null;
  confidence: StudioConfidence;
  hidePrice: boolean;
}

export interface PriceBlock {
  paidLine: string | null; // "Paid $X" - hidden whenever hidePrice is on
  bigLine: string | null; // "Worth ~$Y" (estimate) or "Sells for $Y" (sold-backed)
  caption: string | null; // "estimate" - ONLY on confidence "estimate", never jargon
  profitLine: string | null; // "+$Z profit · N% ROI" - ONLY on confidence "sold-backed"
}

export function buildPriceBlock(input: PriceBlockInput): PriceBlock {
  const { paidPrice, sellPrice, profit, roi, confidence, hidePrice } = input;

  const paidLine = !hidePrice && paidPrice != null ? `Paid ${formatMoney(paidPrice)}` : null;

  const bigLine = sellPrice != null
    ? (confidence === "sold-backed" ? `Sells for ${formatMoney(sellPrice)}` : `Worth ~${formatMoney(sellPrice)}`)
    : null;

  const caption = confidence === "estimate" && bigLine != null ? "estimate" : null;

  let profitLine: string | null = null;
  if (confidence === "sold-backed" && profit != null) {
    const sign = profit < 0 ? "-" : "+";
    const roiTxt = roi != null ? ` · ${Math.round(roi)}% ROI` : "";
    profitLine = `${sign}${formatMoney(Math.abs(profit))} profit${roiTxt}`;
  }

  return { paidLine, bigLine, caption, profitLine };
}

// ---------------------------------------------------------------------------
// WIN VARIANT (a logged sale's real bought/sold/profit numbers - no
// confidence gating needed, every input here came from an actual logged
// sale, never a projection)
// ---------------------------------------------------------------------------
export interface WinCardInput {
  boughtPrice: number;
  soldPrice: number;
  profit: number;
}

export interface WinCardText {
  subLine: string; // "Bought $X -> Sold $Y"
  bigLine: string; // "+$Z profit" (honest sign - a logged loss still reads as a loss)
}

export function buildWinCardText(input: WinCardInput): WinCardText {
  const sign = input.profit < 0 ? "-" : "+";
  return {
    subLine: `Bought ${formatMoney(input.boughtPrice)} → Sold ${formatMoney(input.soldPrice)}`,
    bigLine: `${sign}${formatMoney(Math.abs(input.profit))} profit`,
  };
}

// ---------------------------------------------------------------------------
// ITEM NAME (item: name-fit rules) - the name is NEVER pre-truncated here.
// Overflow is handled entirely by the Text component's own
// adjustsFontSizeToFit/minimumFontScale (shrink-to-fit), never by slicing
// characters and appending "..." - that's what produced "American Flag and
// I..." on-device. This function exists so the "never truncate" rule is
// itself a testable, named contract instead of an implicit assumption.
// ---------------------------------------------------------------------------
export function fitItemName(name: string): string {
  return name;
}

// File-size readout for the owner debug line.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
