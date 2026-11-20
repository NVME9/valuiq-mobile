// photoCrop.ts — pure math for the dedicated Photo Crop screen (Share
// Studio v6, item A: replaces the old "transform the whole card preview
// locally, then dim it and re-render from the server" approach, which the
// founder's device recording showed barely changing anything because the
// gesture only ever moved a FULL-CARD preview image, not the photo inside
// its box). This module computes exactly what the crop screen shows on
// screen (coverScale/cropDisplayRect) and exactly what the server will crop
// (computeCropRect) from the SAME (fx, fy, zoom) - so "editor crop rect ==
// server crop rect" is a provable, testable contract rather than a hope.
//
// computeCropRect is a line-for-line port of deal-ai-pro's
// lib/shareCard/renderCard.ts cropToBox() (the photoAdjust 'fill' mode crop)
// - same branching, same rounding, same clamp order - minus the actual
// sharp() extract/resize, which only the server does. Any future edit to
// that server function must be mirrored here, or the two will disagree.
import { StudioFormat } from "./shareStudio";

// Fixed photo-frame box per format, pixels - MUST match deal-ai-pro's
// lib/shareCard/renderCard.ts PHOTO_BOX constant exactly, since only the
// aspect ratio (w/h) is actually used by the math below, but the editor's
// "crop rect == server crop rect" guarantee depends on both sides using the
// same box.
export const PHOTO_BOX: Record<StudioFormat, { w: number; h: number }> = {
  story: { w: 800, h: 640 },
  feed: { w: 780, h: 430 },
  square: { w: 520, h: 690 },
};

export const CROP_ZOOM_MIN = 1;
export const CROP_ZOOM_MAX = 3;

// Margin (screen points) kept clear around the frame on every edge, inside
// whatever stage area the crop screen measures via its own onLayout - the
// SAME 28pt margin v6/v7's fallbackFrameSize used, just centralized here so
// it's one pure, testable number instead of a component-local constant.
export const FRAME_MARGIN = 28;

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function safeZoom(zoom: number): number {
  return clamp(Number.isFinite(zoom) ? zoom : 1, CROP_ZOOM_MIN, CROP_ZOOM_MAX);
}

function safeFraction(f: number): number {
  return Number.isFinite(f) ? f : 0.5;
}

export function clampZoom(z: number): number {
  return Math.round(safeZoom(z) * 100) / 100;
}

export function clampFocus(f: number): number {
  return Math.round(clamp(safeFraction(f), 0, 1) * 1000) / 1000;
}

// The region of the SOURCE photo (in photo pixels) a given zoom shows -
// same two branches cropToBox uses to pick "largest same-aspect region",
// then shrunk by zoom. Depends only on the box's ASPECT RATIO (boxAspect),
// never its absolute size - callers may pass either the server's pixel
// PHOTO_BOX or the editor's on-screen frame size and get the same relative
// answer, as long as both share the box's aspect ratio.
function cropRegionSize(iw: number, ih: number, boxAspect: number, zoom: number): { regionW: number; regionH: number } {
  let regionW: number, regionH: number;
  if (iw / ih > boxAspect) { regionH = ih; regionW = regionH * boxAspect; }
  else { regionW = iw; regionH = regionW / boxAspect; }
  const z = safeZoom(zoom);
  return { regionW: regionW / z, regionH: regionH / z };
}

// Line-for-line port of cropToBox's rect math (deal-ai-pro's
// lib/shareCard/renderCard.ts) - left/top/width/height of the SOURCE photo
// region the server will extract (before its own resize to box.w x box.h).
export function computeCropRect(
  iw: number, ih: number, bw: number, bh: number,
  zoom: number, fx: number, fy: number
): CropRect {
  const boxAspect = bw / bh;
  const { regionW, regionH } = cropRegionSize(iw, ih, boxAspect, zoom);
  const width = Math.max(1, Math.min(iw, Math.round(regionW)));
  const height = Math.max(1, Math.min(ih, Math.round(regionH)));
  const cfx = clamp(safeFraction(fx), 0, 1);
  const cfy = clamp(safeFraction(fy), 0, 1);
  let left = Math.round(cfx * iw - regionW / 2);
  let top = Math.round(cfy * ih - regionH / 2);
  left = Math.max(0, Math.min(left, iw - width));
  top = Math.max(0, Math.min(top, ih - height));
  return { left, top, width, height };
}

// Centers a box of the given ASPECT ratio inside a (stageW x stageH) area,
// shrunk by `margin` on every edge - v8 ROOT-CAUSE FIX for the founder
// screenshot (frame drawn at x=0, vertically centered, NOT at the computed
// x=28/y=104 the old debug readout claimed): the arithmetic below is
// line-for-line what v6/v7's fallbackFrameSize already computed (it was
// never wrong - the founder's own numbers prove it: a 430x932 screen minus
// header/footer/margin yields exactly left=28/width=374/height=299 for the
// story box), but the old component never actually POSITIONED the frame at
// that rect - it handed width/height to a flex row (dimSide/frameRow/dim
// Views) and trusted flexbox to center it, which is exactly the "views are
// not position:'absolute' inside a position:'relative' container" bug.
// This function now returns left/top too, so PhotoCropScreen.tsx can set
// them directly as style.left/style.top on an absolutely-positioned frame
// View instead of hoping flex centering lines up with this math.
export function computeFrameRect(stageW: number, stageH: number, boxAspect: number, margin: number = FRAME_MARGIN): CropRect {
  if (!(stageW > 0) || !(stageH > 0) || !(boxAspect > 0)) return { left: 0, top: 0, width: 0, height: 0 };
  const availW = Math.max(0, stageW - margin * 2);
  const availH = Math.max(0, stageH - margin * 2);
  const width = availW / availH > boxAspect ? availH * boxAspect : availW;
  const height = width / boxAspect;
  return { left: (stageW - width) / 2, top: (stageH - height) / 2, width, height };
}

// On-screen scale at zoom:1 (fx=fy=0.5) at which the photo exactly "covers"
// a box/frame of the given size - the same region computeCropRect picks at
// zoom:1, expressed as a display scale instead of a pixel rect. Both the
// crop screen's displayed photo size (coverScale * zoom) and the pan math
// below are derived from this single number.
export function coverScale(iw: number, ih: number, bw: number, bh: number): number {
  if (!(iw > 0) || !(ih > 0) || !(bw > 0) || !(bh > 0)) return 1;
  return Math.max(bw / iw, bh / ih);
}

// The valid (fx, fy) range at a given zoom - outside this range the photo
// would no longer fully cover the frame (a gap would show on one edge).
// Mirrors the CONSEQUENCE of cropToBox's own left/top pixel clamp
// (`Math.max(0, Math.min(left, iw-ew))`), expressed as a focus-fraction
// range instead of a post-hoc pixel clamp, so the live editor can enforce
// it on every gesture frame, not just once server-side after Done.
export function focusBounds(
  iw: number, ih: number, bw: number, bh: number, zoom: number
): { minFx: number; maxFx: number; minFy: number; maxFy: number } {
  if (!(iw > 0) || !(ih > 0) || !(bw > 0) || !(bh > 0)) return { minFx: 0, maxFx: 1, minFy: 0, maxFy: 1 };
  const boxAspect = bw / bh;
  const { regionW, regionH } = cropRegionSize(iw, ih, boxAspect, zoom);
  const marginX = Math.min(0.5, regionW / (2 * iw));
  const marginY = Math.min(0.5, regionH / (2 * ih));
  return { minFx: marginX, maxFx: 1 - marginX, minFy: marginY, maxFy: 1 - marginY };
}

// Deliberately NOT rounded (unlike the standalone clampFocus above) - this
// clamp's whole job is keeping the photo covering the frame to sub-pixel
// precision; rounding the result to clampFocus's 3 decimal places could
// itself push a boundary value back outside [minFx,maxFx]/[minFy,maxFy] and
// reopen the exact gap this function exists to prevent.
export function clampFocusToBounds(
  fx: number, fy: number, iw: number, ih: number, bw: number, bh: number, zoom: number
): { fx: number; fy: number } {
  const { minFx, maxFx, minFy, maxFy } = focusBounds(iw, ih, bw, bh, zoom);
  return {
    fx: clamp(safeFraction(fx), minFx, maxFx),
    fy: clamp(safeFraction(fy), minFy, maxFy),
  };
}

// The photo's on-screen position/size for a given (fx, fy, zoom) inside a
// frame of (frameW, frameH) screen points - the image is rendered at
// coverScale*zoom*(iw,ih) and positioned so the photo-fractional point
// (fx, fy) sits exactly at the frame's center. Exported so both the crop
// screen component and this module's own tests can assert the "photo
// always covers the frame" invariant from the same formula.
export function cropDisplayRect(
  fx: number, fy: number, zoom: number,
  iw: number, ih: number, frameW: number, frameH: number
): { left: number; top: number; width: number; height: number } {
  const cs = coverScale(iw, ih, frameW, frameH);
  const z = safeZoom(zoom);
  const width = cs * z * iw;
  const height = cs * z * ih;
  const left = frameW / 2 - safeFraction(fx) * width;
  const top = frameH / 2 - safeFraction(fy) * height;
  return { left, top, width, height };
}

// DRAG → FOCUS. ddx/ddy are screen-pixel drag deltas of the photo ITSELF
// inside the frame (not the old whole-card-preview convention). Dragging
// the photo by ddx/ddy pixels shifts the point centered under the frame by
// -ddx/-ddy display pixels - "drag right moves the focus point left", same
// convention the old (now-retired) panDeltaToFocus documented, just against
// the right denominator for this screen's geometry (coverScale*zoom*iw/ih,
// not a bare viewport size). Always returns a focus already clamped so the
// photo keeps covering the frame - see focusBounds.
export function dragDeltaToFocus(
  baseFx: number, baseFy: number, ddx: number, ddy: number,
  iw: number, ih: number, frameW: number, frameH: number, zoom: number
): { fx: number; fy: number } {
  const z = safeZoom(zoom);
  if (!(iw > 0) || !(ih > 0) || !(frameW > 0) || !(frameH > 0)) {
    return { fx: clampFocus(safeFraction(baseFx)), fy: clampFocus(safeFraction(baseFy)) };
  }
  const cs = coverScale(iw, ih, frameW, frameH);
  const rawFx = safeFraction(baseFx) - ddx / (cs * z * iw);
  const rawFy = safeFraction(baseFy) - ddy / (cs * z * ih);
  return clampFocusToBounds(rawFx, rawFy, iw, ih, frameW, frameH, z);
}

// Pinch scale is always relative to the zoom the gesture STARTED at (not
// compounded frame-over-frame) - baseZoom * scale, same convention every
// native pinch-to-zoom implementation uses.
export function pinchScaleToZoom(baseZoom: number, scale: number): number {
  if (!(scale > 0) || !Number.isFinite(scale)) return clampZoom(baseZoom);
  return clampZoom(baseZoom * scale);
}

// GESTURE STATE MACHINE for the crop screen - same shape/rationale as the
// retired photoGestureReducer (a ref-driven pure reducer, not React state,
// so a fast sequence of touch-move events never triggers a re-render -
// only the caller's imperative Animated.setValue calls update the screen),
// just driven by this file's own frame-relative math instead of the old
// whole-preview-viewport one.
export type CropGesturePhase = "idle" | "start" | "move" | "end";

export interface CropGestureState {
  phase: CropGesturePhase;
  touches: number;
  dx: number;
  dy: number;
  scale: number;
  fx: number;
  fy: number;
  zoom: number;
  baseFx: number;
  baseFy: number;
  baseZoom: number;
  pinchStartDist: number | null;
}

export function initCropGestureState(fx: number, fy: number, zoom: number): CropGestureState {
  return {
    phase: "idle", touches: 0, dx: 0, dy: 0, scale: 1,
    fx, fy, zoom, baseFx: fx, baseFy: fy, baseZoom: zoom, pinchStartDist: null,
  };
}

export type CropGestureEvent =
  | { type: "start" }
  | { type: "move"; touches: number; dx: number; dy: number; pinchDist?: number; iw: number; ih: number; frameW: number; frameH: number }
  | { type: "end" }
  | { type: "reset"; fx: number; fy: number; zoom: number };

export function cropGestureReducer(state: CropGestureState, event: CropGestureEvent): CropGestureState {
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
      // Re-clamp the (unchanged) base focus against the NEW zoom's bounds -
      // zooming out can widen the valid range, so a focus that was pinned
      // to an edge at the old zoom may need to ease back toward center.
      const { fx, fy } = clampFocusToBounds(state.baseFx, state.baseFy, event.iw, event.ih, event.frameW, event.frameH, zoom);
      return { ...state, phase: "move", touches: event.touches, scale, pinchStartDist, zoom, fx, fy };
    }
    const { fx, fy } = dragDeltaToFocus(state.baseFx, state.baseFy, event.dx, event.dy, event.iw, event.ih, event.frameW, event.frameH, state.baseZoom);
    return { ...state, phase: "move", touches: event.touches, dx: event.dx, dy: event.dy, fx, fy };
  }
  if (event.type === "end") {
    return { ...state, phase: "end", pinchStartDist: null, dx: 0, dy: 0, scale: 1 };
  }
  // "reset"
  return initCropGestureState(event.fx, event.fy, event.zoom);
}
