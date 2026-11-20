// shareStudio.ts — shared format metadata for the Share Studio screen. The
// card itself is now rendered server-side (POST /api/share-card returns a
// finished PNG - see ShareStudio.tsx and lib/shareCardPayload.ts/
// shareCardApi.ts), so this file no longer has any crop/zone/theme math -
// just the export sizes/labels the format tabs share with the payload
// builder, and the owner debug byte readout.
export type StudioFormat = "story" | "feed" | "square";
export type StudioConfidence = "estimate" | "sold-backed";

export interface Size { w: number; h: number }

// Export pixel sizes: always 1080 wide, height set by format.
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

// Hook presets shared between the Studio UI and studioPrefs.ts's default -
// DEFAULT_HOOK is what a first-ever open (no saved prefs yet) starts with,
// per the "hook ON by default" product decision.
export const HOOK_PRESETS = ["Would you flip it?", "Pass or buy?", "Real find, real numbers."];
export const DEFAULT_HOOK = HOOK_PRESETS[0];
// The one preset the win-variant's "profit" default points at - kept as its
// own name (not HOOK_PRESETS[2]) so a future reorder of the array can't
// silently change what a profitable sale defaults its hook to.
export const WIN_PROFIT_HOOK = "Real find, real numbers.";

// File-size readout for the owner debug line.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// PHOTO ADJUST — "Whole" shows the full uncropped photo (server picks a
// contain-style layout); "Fill" lets the user zoom/pan a crop that fills the
// card's photo zone. Only `mode` is persisted (studioPrefs.ts) - zoom/focus
// always reset to these defaults on a fresh Studio open, per spec ("Persist
// mode only, not zoom/focus").
export type PhotoMode = "whole" | "fill";
export const DEFAULT_PHOTO_MODE: PhotoMode = "whole";

// BACKGROUND STYLE (v7, server fields from the card v4: bgStyle/cutout/
// photoBorder) — what fills the photo box behind the contained photo.
// Default "blur" matches the server's own default (deal-ai-pro's
// lib/shareCard/renderCard.ts: `d.bgStyle ?? "blur"`), so a Studio that
// never touches this control still sends a value that matches what the
// server would have picked anyway.
export type BgStyle = "blur" | "dark" | "tint";
export const DEFAULT_BG_STYLE: BgStyle = "blur";
export const BG_STYLES: BgStyle[] = ["blur", "dark", "tint"];

// CUT OUT / BORDER (v7) — both OFF/ON booleans the server now accepts.
// Cut out defaults OFF (an extra, possibly-unavailable effect - see
// ShareStudio.tsx's cutout-501 handling); border defaults ON per the
// founder's device-findings spec ("Defaults: Blur, border on").
export const DEFAULT_CUTOUT = false;
export const DEFAULT_PHOTO_BORDER = true;

export interface PhotoAdjust {
  mode: PhotoMode;
  zoom: number; // 1..3
  fx: number;   // 0..1, horizontal focus
  fy: number;   // 0..1, vertical focus
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;

export const DEFAULT_PHOTO_ADJUST: PhotoAdjust = { mode: DEFAULT_PHOTO_MODE, zoom: 1, fx: 0.5, fy: 0.5 };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Rounds away float drift (e.g. 1.1 + 0.25 = 1.3500000000000001) so the
// server/debug readouts and repeated +/- taps never accumulate junk digits.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampZoom(z: number): number {
  return round2(clamp(z, ZOOM_MIN, ZOOM_MAX));
}

export function clampFocus(f: number): number {
  return round2(clamp(f, 0, 1));
}

// COLOR (accent) — "Auto" (null) means the card uses its own verdict-derived
// color and sends no `accent` field at all. The 12 presets below plus a
// free-form hex entry are the only other choices; selection is persisted in
// AsyncStorage (studioPrefs.ts), defaulting to Auto.
export interface AccentSwatch { id: string; hex: string; label: string }

export const ACCENT_SWATCHES: AccentSwatch[] = [
  { id: "lime", hex: "#a3e635", label: "Lime" },
  { id: "cyan", hex: "#22d3ee", label: "Cyan" },
  { id: "blue", hex: "#38bdf8", label: "Blue" },
  { id: "purple", hex: "#8b5cf6", label: "Purple" },
  { id: "magenta", hex: "#d946ef", label: "Magenta" },
  { id: "pink", hex: "#ff6b9d", label: "Pink" },
  { id: "red", hex: "#ff6b6b", label: "Red" },
  { id: "orange", hex: "#ff8a00", label: "Orange" },
  { id: "yellow", hex: "#f5c542", label: "Yellow" },
  { id: "mint", hex: "#34d399", label: "Mint" },
  { id: "white", hex: "#f4f2ec", label: "White" },
  { id: "coral", hex: "#fb7185", label: "Coral" },
];

export const ACCENT_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isValidAccentHex(v: string): boolean {
  return ACCENT_HEX_PATTERN.test(v);
}

// SURPRISE ME (v7) — picks a random swatch from ACCENT_SWATCHES, excluding
// the currently-active one when there are other swatches to pick from (so a
// second tap can never be a visible no-op). `rand` is injectable so this is
// deterministically testable - defaults to Math.random for the real app.
export function pickSurpriseAccent(currentAccent: string | null, rand: () => number = Math.random): string {
  const pool = ACCENT_SWATCHES.filter((sw) => sw.hex !== currentAccent);
  const choices = pool.length > 0 ? pool : ACCENT_SWATCHES;
  const idx = Math.min(choices.length - 1, Math.floor(rand() * choices.length));
  return choices[idx].hex;
}
