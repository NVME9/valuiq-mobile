// photoCrop.test.ts — coverage for the Photo Crop screen's pure math
// (Share Studio v6, item A). The headline guarantee this suite exists to
// prove: the editor's crop rect and the server's crop rect, given the SAME
// (fx, fy, zoom), are IDENTICAL - see the "editor crop rect == server crop
// rect" table below, which runs a standalone reference port of deal-ai-
// pro's lib/shareCard/renderCard.ts cropToBox() side-by-side with this
// module's computeCropRect for several photo shapes.
import {
  computeCropRect, coverScale, focusBounds, clampFocusToBounds,
  dragDeltaToFocus, pinchScaleToZoom, clampZoom, clampFocus, cropDisplayRect,
  initCropGestureState, cropGestureReducer, CropGestureState, PHOTO_BOX,
} from "../photoCrop";

// Standalone reference copy of deal-ai-pro's lib/shareCard/renderCard.ts
// cropToBox() rect math (left/top/width/height only - no sharp(), no image
// bytes) - deliberately NOT imported from photoCrop.ts, so this table
// actually cross-checks two independent transcriptions of the same spec
// rather than comparing a function against itself.
function serverCropRect(
  iw: number, ih: number, box: { w: number; h: number },
  adjust: { zoom?: number; fx?: number; fy?: number }
): { left: number; top: number; width: number; height: number } {
  const zoom = Math.min(3, Math.max(1, Number.isFinite(adjust.zoom as number) ? (adjust.zoom as number) : 1));
  const fx = Math.min(1, Math.max(0, Number.isFinite(adjust.fx as number) ? (adjust.fx as number) : 0.5));
  const fy = Math.min(1, Math.max(0, Number.isFinite(adjust.fy as number) ? (adjust.fy as number) : 0.5));
  const boxAspect = box.w / box.h;
  let regionW: number, regionH: number;
  if (iw / ih > boxAspect) { regionH = ih; regionW = regionH * boxAspect; }
  else { regionW = iw; regionH = regionW / boxAspect; }
  regionW /= zoom;
  regionH /= zoom;
  const ew = Math.max(1, Math.min(iw, Math.round(regionW)));
  const eh = Math.max(1, Math.min(ih, Math.round(regionH)));
  let left = Math.round(fx * iw - regionW / 2);
  let top = Math.round(fy * ih - regionH / 2);
  left = Math.max(0, Math.min(left, iw - ew));
  top = Math.max(0, Math.min(top, ih - eh));
  return { left, top, width: ew, height: eh };
}

describe("editor crop rect == server crop rect", () => {
  const cases: { name: string; iw: number; ih: number; box: { w: number; h: number }; zoom: number; fx: number; fy: number }[] = [
    { name: "square photo into story box (800x640), centered, zoom 1", iw: 1200, ih: 1200, box: PHOTO_BOX.story, zoom: 1, fx: 0.5, fy: 0.5 },
    { name: "wide photo into square box (520x690), centered, zoom 1", iw: 2000, ih: 1000, box: PHOTO_BOX.square, zoom: 1, fx: 0.5, fy: 0.5 },
    { name: "tall photo into feed box (780x430), centered, zoom 1", iw: 900, ih: 1600, box: PHOTO_BOX.feed, zoom: 1, fx: 0.5, fy: 0.5 },
    { name: "square photo into story box, zoomed 2x, panned right/down", iw: 1200, ih: 1200, box: PHOTO_BOX.story, zoom: 2, fx: 0.75, fy: 0.65 },
    { name: "wide photo into square box, max zoom 3x, panned to left edge", iw: 2000, ih: 1000, box: PHOTO_BOX.square, zoom: 3, fx: 0.05, fy: 0.3 },
    { name: "tall photo into feed box, zoomed 1.5x, panned to bottom", iw: 900, ih: 1600, box: PHOTO_BOX.feed, zoom: 1.5, fx: 0.5, fy: 0.95 },
    { name: "odd-sized photo (iPhone portrait, 3024x4032) into story box", iw: 3024, ih: 4032, box: PHOTO_BOX.story, zoom: 1.8, fx: 0.4, fy: 0.5 },
    { name: "near-box-aspect photo into square box (minimal cropping either axis)", iw: 520, ih: 690, box: PHOTO_BOX.square, zoom: 1, fx: 0.5, fy: 0.5 },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const server = serverCropRect(c.iw, c.ih, c.box, c);
      const editor = computeCropRect(c.iw, c.ih, c.box.w, c.box.h, c.zoom, c.fx, c.fy);
      expect(editor).toEqual(server);
    });
  }
});

describe("coverScale / cropDisplayRect - the photo always covers the frame", () => {
  test("at zoom 1, fx=fy=0.5, the displayed photo's edges meet or exceed every frame edge", () => {
    const r = cropDisplayRect(0.5, 0.5, 1, 3024, 4032, 800, 640);
    expect(r.left).toBeLessThanOrEqual(0.0001);
    expect(r.top).toBeLessThanOrEqual(0.0001);
    expect(r.left + r.width).toBeGreaterThanOrEqual(800 - 0.0001);
    expect(r.top + r.height).toBeGreaterThanOrEqual(640 - 0.0001);
  });

  test("a clamped focus at any zoom (1-3, step 0.25) never opens a gap at any frame edge", () => {
    const iw = 2400, ih = 1600, frameW = 780, frameH = 430;
    for (let zoom = 1; zoom <= 3; zoom += 0.25) {
      for (const [rawFx, rawFy] of [[0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0.5], [-5, 5], [5, -5]]) {
        const { fx, fy } = clampFocusToBounds(rawFx, rawFy, iw, ih, frameW, frameH, zoom);
        const r = cropDisplayRect(fx, fy, zoom, iw, ih, frameW, frameH);
        expect(r.left).toBeLessThanOrEqual(0.01);
        expect(r.top).toBeLessThanOrEqual(0.01);
        expect(r.left + r.width).toBeGreaterThanOrEqual(frameW - 0.01);
        expect(r.top + r.height).toBeGreaterThanOrEqual(frameH - 0.01);
      }
    }
  });
});

describe("focusBounds / clampFocusToBounds", () => {
  test("on the axis the box aspect fully consumes (regionW==iw), the valid range collapses to 0.5 - panning that axis cannot do anything, matching the server's own forced-left=0 clamp", () => {
    // A very tall/narrow photo into a squarish box: width is the limiting
    // dimension (iw/ih=0.2 < boxAspect=520/690=0.75), so the full photo
    // WIDTH is always used - fx is irrelevant.
    const { minFx, maxFx } = focusBounds(600, 3000, 520, 690, 1);
    expect(minFx).toBeCloseTo(0.5, 5);
    expect(maxFx).toBeCloseTo(0.5, 5);
  });

  test("zooming in widens the valid pan range on the previously-collapsed axis", () => {
    const atZoom1 = focusBounds(600, 3000, 520, 690, 1);
    const atZoom3 = focusBounds(600, 3000, 520, 690, 3);
    expect(atZoom3.maxFx - atZoom3.minFx).toBeGreaterThan(atZoom1.maxFx - atZoom1.minFx);
  });
});

describe("dragDeltaToFocus - pan clamps", () => {
  test("dragging right (positive ddx) moves the focus point left (fx decreases)", () => {
    const { fx, fy } = dragDeltaToFocus(0.5, 0.5, 50, 0, 3000, 2000, 800, 640, 2);
    expect(fx).toBeLessThan(0.5);
    expect(fy).toBeCloseTo(0.5, 2);
  });

  test("an extreme drag clamps fx/fy to the valid (gap-free) bounds, never past them", () => {
    const { fx, fy } = dragDeltaToFocus(0.5, 0.5, 100000, 100000, 2000, 2000, 800, 640, 1.5);
    const bounds = focusBounds(2000, 2000, 800, 640, 1.5);
    expect(fx).toBeCloseTo(bounds.minFx, 3);
    expect(fy).toBeCloseTo(bounds.minFy, 3);
  });

  test("a zero/invalid photo size degrades to the clamped starting focus, never NaN or a crash", () => {
    const r = dragDeltaToFocus(0.5, 0.5, 50, 50, 0, 0, 800, 640, 1);
    expect(Number.isFinite(r.fx)).toBe(true);
    expect(Number.isFinite(r.fy)).toBe(true);
  });
});

describe("pinchScaleToZoom - pinch clamps", () => {
  test("scale > 1 zooms in from the gesture's starting zoom, scale < 1 zooms out", () => {
    expect(pinchScaleToZoom(1, 2)).toBe(2);
    expect(pinchScaleToZoom(2, 0.5)).toBe(1);
  });

  test("clamps to [1, 3] regardless of how far the pinch goes", () => {
    expect(pinchScaleToZoom(1, 10)).toBe(3);
    expect(pinchScaleToZoom(3, 0.01)).toBe(1);
  });

  test("an invalid/zero scale degrades to the clamped base zoom, never NaN", () => {
    expect(pinchScaleToZoom(2, 0)).toBe(2);
    expect(pinchScaleToZoom(2, NaN)).toBe(2);
  });
});

describe("clampZoom / clampFocus", () => {
  test("clampZoom bounds to [1, 3]", () => {
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(5)).toBe(3);
    expect(clampZoom(2)).toBe(2);
  });

  test("clampFocus bounds to [0, 1]", () => {
    expect(clampFocus(-1)).toBe(0);
    expect(clampFocus(2)).toBe(1);
    expect(clampFocus(0.3)).toBe(0.3);
  });
});

describe("cropGestureReducer - reset", () => {
  test("a reset event snaps straight back to the given values regardless of in-progress gesture", () => {
    let s: CropGestureState = initCropGestureState(0.5, 0.5, 1);
    s = cropGestureReducer(s, { type: "start" });
    s = cropGestureReducer(s, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 100, iw: 2000, ih: 2000, frameW: 800, frameH: 640 });
    s = cropGestureReducer(s, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 300, iw: 2000, ih: 2000, frameW: 800, frameH: 640 });
    expect(s.zoom).toBeGreaterThan(1);
    s = cropGestureReducer(s, { type: "reset", fx: 0.5, fy: 0.5, zoom: 1 });
    expect(s).toEqual(initCropGestureState(0.5, 0.5, 1));
  });

  test("one-finger drag changes fx/fy, two-finger pinch changes zoom - never both from the same move", () => {
    // A photo wider (relative to its height) than the story box's own
    // aspect - the x-axis is the CROPPED one here (y is the one the box
    // fully consumes), so it's the axis an fx-moving drag can prove.
    let s: CropGestureState = initCropGestureState(0.5, 0.5, 1);
    s = cropGestureReducer(s, { type: "start" });
    s = cropGestureReducer(s, { type: "move", touches: 1, dx: 50, dy: 0, iw: 3000, ih: 2000, frameW: 800, frameH: 640 });
    expect(s.zoom).toBe(1);
    expect(s.fx).toBeLessThan(0.5);
    s = cropGestureReducer(s, { type: "end" });

    let s2: CropGestureState = initCropGestureState(0.5, 0.5, 1);
    s2 = cropGestureReducer(s2, { type: "start" });
    s2 = cropGestureReducer(s2, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 100, iw: 2000, ih: 2000, frameW: 800, frameH: 640 });
    s2 = cropGestureReducer(s2, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 200, iw: 2000, ih: 2000, frameW: 800, frameH: 640 });
    expect(s2.zoom).toBe(2);
    expect(s2.fx).toBe(0.5);
    expect(s2.fy).toBe(0.5);
  });
});
