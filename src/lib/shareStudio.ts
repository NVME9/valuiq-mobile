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

// DIRECT-MANIPULATION GESTURE MATH (v4, replaces the arrow/+-/zoom button
// pad) - pure, no React/PanResponder here, so the pan-delta-to-focus and
// pinch-scale-to-zoom conversions are unit testable independent of the
// gesture plumbing in ShareStudio.tsx. `zoom` divides the pan delta because
// at higher zoom the same finger-pixel distance covers a SMALLER fraction
// of the full photo - panning should feel equally fast under the finger at
// any zoom level, not slower the further in you are. `dx` is SUBTRACTED
// (not added) so dragging the photo right (positive dx) feels like dragging
// the PHOTO itself, not the viewport over it - the focus point it's
// centered on moves left.
export function panDeltaToFocus(
  fx: number, fy: number, dx: number, dy: number,
  viewW: number, viewH: number, zoom: number
): { fx: number; fy: number } {
  if (!(viewW > 0) || !(viewH > 0) || !(zoom > 0)) return { fx: clampFocus(fx), fy: clampFocus(fy) };
  return {
    fx: clampFocus(fx - dx / (viewW * zoom)),
    fy: clampFocus(fy - dy / (viewH * zoom)),
  };
}

// Pinch scale is ALWAYS relative to the zoom the gesture started at (not
// multiplied cumulatively frame-over-frame) - baseZoom * scale, where scale
// is current-touch-distance / distance-at-gesture-start, same convention
// every native pinch-to-zoom implementation uses.
export function pinchScaleToZoom(baseZoom: number, scale: number): number {
  if (!(scale > 0) || !Number.isFinite(scale)) return clampZoom(baseZoom);
  return clampZoom(baseZoom * scale);
}

// GESTURE STATE MACHINE (v5, item 4 - founder device bug: pinch/drag did
// nothing visible). Pure, no PanResponder/React - built ONLY on top of the
// two tested conversions above (panDeltaToFocus/pinchScaleToZoom), never
// duplicating their math. The component (ShareStudio.tsx) drives this
// through a ref (not React state) on every touch callback, so a fast
// sequence of "move" events during an active gesture never triggers a
// re-render - only committing the result into real controls state on
// "end" does. Having the state machine as data (not closures captured by
// PanResponder's own callbacks) is what makes it independently testable
// AND immune to the stale-closure bug that's the leading suspect for why
// v4's touches did nothing: a PanResponder rebuilt via useMemo on every
// state change can still reference the state current at BUILD time inside
// a long-lived native gesture, whereas reading fields off this plain
// object/ref is never stale.
export type PhotoGesturePhase = "idle" | "start" | "move" | "end";

export interface PhotoGestureState {
  phase: PhotoGesturePhase;
  touches: number;
  dx: number;
  dy: number;
  scale: number;
  // Live/committed photo-adjust values - during a gesture these ARE the
  // live preview numbers; once "end" fires they're also the values the
  // caller should commit into the real persisted controls.
  fx: number;
  fy: number;
  zoom: number;
  // Snapshot of fx/fy/zoom taken at gesture "start" - pan/pinch math is
  // always relative to where THIS gesture began (never compounded move-
  // over-move), same convention panDeltaToFocus/pinchScaleToZoom's own
  // comments describe.
  baseFx: number;
  baseFy: number;
  baseZoom: number;
  // Two-finger distance at the moment a pinch was first detected within
  // this gesture - null whenever the gesture isn't (yet) a pinch.
  pinchStartDist: number | null;
}

export function initPhotoGestureState(fx: number, fy: number, zoom: number): PhotoGestureState {
  return {
    phase: "idle", touches: 0, dx: 0, dy: 0, scale: 1,
    fx, fy, zoom, baseFx: fx, baseFy: fy, baseZoom: zoom, pinchStartDist: null,
  };
}

export type PhotoGestureEvent =
  | { type: "start" }
  | { type: "move"; touches: number; dx: number; dy: number; pinchDist?: number; viewW: number; viewH: number }
  | { type: "end" }
  | { type: "reset"; fx: number; fy: number; zoom: number };

// First match wins: a "start" snapshots the current fx/fy/zoom as the
// gesture's base (so release-vs-release gestures never compound); a "move"
// with 2+ touches AND a real pinch distance is always treated as a pinch
// (zoom only, fx/fy untouched) even if a 1-finger pan was in progress
// moments earlier within the SAME gesture - touch count can fluctuate
// frame to frame as a second finger lands/lifts, and a pinch reading is
// only ever available once 2 touches are actually down; a "move" with
// fewer than 2 touches (or a 2-touch move that hasn't started a pinch
// because `pinchDist` was omitted) is a pan (fx/fy only, zoom untouched).
// "end" just freezes the phase/clears transient pinch tracking - fx/fy/
// zoom are already live-current from the last "move", nothing left to
// compute. "reset" (double-tap) snaps straight back to the given values,
// independent of whatever gesture was in progress.
export function photoGestureReducer(state: PhotoGestureState, event: PhotoGestureEvent): PhotoGestureState {
  if (event.type === "start") {
    return {
      ...state, phase: "start", touches: 0, dx: 0, dy: 0, scale: 1,
      baseFx: state.fx, baseFy: state.fy, baseZoom: state.zoom, pinchStartDist: null,
    };
  }
  if (event.type === "move") {
    if (event.touches >= 2 && event.pinchDist != null && event.pinchDist > 0) {
      const pinchStartDist = state.pinchStartDist ?? event.pinchDist;
      const scale = event.pinchDist / pinchStartDist;
      const zoom = pinchScaleToZoom(state.baseZoom, scale);
      return { ...state, phase: "move", touches: event.touches, scale, pinchStartDist, zoom };
    }
    const { fx, fy } = panDeltaToFocus(state.baseFx, state.baseFy, event.dx, event.dy, event.viewW, event.viewH, state.baseZoom);
    return { ...state, phase: "move", touches: event.touches, dx: event.dx, dy: event.dy, fx, fy };
  }
  if (event.type === "end") {
    return { ...state, phase: "end", pinchStartDist: null, dx: 0, dy: 0, scale: 1 };
  }
  // "reset"
  return initPhotoGestureState(event.fx, event.fy, event.zoom);
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
