// shareStudio.ts — pure logic for the Share Studio (the single post-export
// screen that replaced RevealScreen/RevealPhotoEditor). No React, no native
// module, no network - every function here is a straight input->output
// transform so crop clamping, format sizing, and card text can be unit
// tested independent of the component tree.
import { formatMoney } from "./money";

export type StudioFormat = "story" | "feed" | "square";
export type StudioLook = "dark" | "light" | "bold" | "clean";
export type StudioConfidence = "estimate" | "sold-backed";

export interface Size { w: number; h: number }
export interface Point { x: number; y: number }

// Export pixel sizes (item 7): always 1080 wide, height set by format.
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
  clean: "Clean",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// On-screen preview frame for a format, as big as fits inside the available
// viewport in both dimensions - same "fit, don't overflow" rule
// RevealPhotoEditor's fixedFrameSize used, generalized to all three ratios.
export function frameSizeForFormat(format: StudioFormat, maxW: number, maxH: number): Size {
  const { w: fw, h: fh } = FORMAT_SIZES[format];
  const ratio = fw / fh; // width/height
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

// "cover" scale: the minimum zoom at which the image fully fills the frame
// in both dimensions (same definition RevealPhotoEditor.coverScale used).
export function coverScale(img: Size, frame: Size): number {
  if (img.w <= 0 || img.h <= 0) return 1;
  return Math.max(frame.w / img.w, frame.h / img.h);
}

export function clampZoomScale(scale: number, min = 1, max = 4): number {
  return clamp(scale, min, max);
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

export interface CardTextInput {
  itemName: string;
  verdictEmoji?: string | null;
  verdictLabel?: string | null;
  paidPrice: number | null;
  sellPrice: number | null;
  profit: number | null;
  roi: number | null; // percent, already rounded or not - rounded here
  confidence: StudioConfidence;
  hidePrice: boolean;
}

export interface CardText {
  itemName: string;
  verdictText: string | null;
  priceLine: string | null;
  statsLine: string | null;
}

// Builds the three text lines every look renders (item 4): verdict+emoji,
// "paid $X -> est. sell $Y" (or "sell $Y" when sold-backed), and a
// profit/ROI line that ONLY appears for sold-backed confidence - an estimate
// never gets a precise-looking ROI percentage next to it (same honesty rule
// lib/profitBanner.ts already applies to the result screen's own banner).
export function buildCardText(input: CardTextInput): CardText {
  const verdictText = input.verdictLabel
    ? [input.verdictEmoji, input.verdictLabel].filter(Boolean).join(" ")
    : null;

  const sellTxt = input.sellPrice != null ? formatMoney(input.sellPrice) : null;
  const paidTxt = !input.hidePrice && input.paidPrice != null ? formatMoney(input.paidPrice) : null;

  let priceLine: string | null = null;
  if (sellTxt) {
    const sellPhrase = input.confidence === "estimate" ? `est. sell ${sellTxt}` : `sell ${sellTxt}`;
    priceLine = paidTxt
      ? `paid ${paidTxt} → ${sellPhrase}`
      : sellPhrase[0].toUpperCase() + sellPhrase.slice(1);
  }

  let statsLine: string | null = null;
  if (input.confidence === "sold-backed" && input.profit != null) {
    const sign = input.profit < 0 ? "-" : "+";
    const roiTxt = input.roi != null ? ` · ${Math.round(input.roi)}% ROI` : "";
    statsLine = `${sign}${formatMoney(Math.abs(input.profit))} profit${roiTxt}`;
  }

  return { itemName: input.itemName, verdictText, priceLine, statsLine };
}

export interface WinCardTextInput {
  boughtPrice: number;
  soldPrice: number;
  profit: number;
}

// The Win variant (item 6) only ever shows real logged numbers - no
// confidence gating needed since every input here came from an actual
// logged sale, never a projection.
export function buildWinCardText(input: WinCardTextInput): { headline: string } {
  return {
    headline: `Bought ${formatMoney(input.boughtPrice)}, sold ${formatMoney(input.soldPrice)}, profit ${formatMoney(input.profit)}`,
  };
}

// File-size readout for the owner debug line (item 9).
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
