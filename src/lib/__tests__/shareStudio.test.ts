// shareStudio.test.ts — coverage for the direct-manipulation gesture math
// (v4, item 3: replaces the arrow/+-/zoom button pad). Pure functions only -
// no PanResponder, no React - see ShareStudio.tsx's photoPanResponder for
// how these feed the real gesture.
import {
  panDeltaToFocus, pinchScaleToZoom, clampZoom, clampFocus,
  initPhotoGestureState, photoGestureReducer, PhotoGestureState,
} from "../shareStudio";

describe("panDeltaToFocus", () => {
  test("dragging right (positive dx) moves the focus point left (fx decreases)", () => {
    const { fx, fy } = panDeltaToFocus(0.5, 0.5, 100, 0, 1000, 1000, 1);
    expect(fx).toBeLessThan(0.5);
    expect(fy).toBe(0.5);
  });

  test("dragging down (positive dy) moves the focus point up (fy decreases)", () => {
    const { fy } = panDeltaToFocus(0.5, 0.5, 0, 100, 1000, 1000, 1);
    expect(fy).toBeLessThan(0.5);
  });

  test("higher zoom makes the same pixel drag move the focus point less (feels equally fast under the finger)", () => {
    const at1x = panDeltaToFocus(0.5, 0.5, 100, 0, 1000, 1000, 1);
    const at2x = panDeltaToFocus(0.5, 0.5, 100, 0, 1000, 1000, 2);
    const movedAt1x = 0.5 - at1x.fx;
    const movedAt2x = 0.5 - at2x.fx;
    expect(movedAt2x).toBeCloseTo(movedAt1x / 2);
  });

  test("clamps fx/fy to [0, 1] when the drag would push past an edge", () => {
    const past0 = panDeltaToFocus(0.1, 0.1, 5000, 5000, 1000, 1000, 1);
    expect(past0.fx).toBe(0);
    expect(past0.fy).toBe(0);
    const past1 = panDeltaToFocus(0.9, 0.9, -5000, -5000, 1000, 1000, 1);
    expect(past1.fx).toBe(1);
    expect(past1.fy).toBe(1);
  });

  test("a zero/invalid viewport size degrades to the clamped starting focus, never NaN or a crash", () => {
    expect(panDeltaToFocus(0.5, 0.5, 50, 50, 0, 0, 1)).toEqual({ fx: 0.5, fy: 0.5 });
    expect(panDeltaToFocus(0.5, 0.5, 50, 50, 1000, 1000, 0)).toEqual({ fx: 0.5, fy: 0.5 });
  });
});

describe("pinchScaleToZoom", () => {
  test("scale > 1 (fingers spreading) zooms in from the gesture's starting zoom", () => {
    expect(pinchScaleToZoom(1, 2)).toBe(2);
    expect(pinchScaleToZoom(1.5, 2)).toBe(3);
  });

  test("scale < 1 (fingers pinching in) zooms out", () => {
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

describe("clampZoom / clampFocus - shared bounds", () => {
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

// GESTURE STATE MACHINE (v5, item 4: pinch/drag did nothing visible on the
// founder's device). These simulate the exact start/move/end sequence the
// real PanResponder callbacks feed into this reducer (see ShareStudio.tsx),
// with 1 touch (pan) and 2 touches (pinch), asserting fx/fy/zoom actually
// change - the provable contract independent of any native gesture plumbing.
describe("photoGestureReducer - the pure gesture state machine", () => {
  test("one-finger drag (1 touch, move): fx/fy change, zoom untouched", () => {
    let s: PhotoGestureState = initPhotoGestureState(0.5, 0.5, 1);
    s = photoGestureReducer(s, { type: "start" });
    expect(s.phase).toBe("start");
    s = photoGestureReducer(s, { type: "move", touches: 1, dx: 100, dy: 0, viewW: 1000, viewH: 1000 });
    expect(s.phase).toBe("move");
    expect(s.fx).toBeLessThan(0.5); // dragging right moves the focus point left, same convention panDeltaToFocus documents
    expect(s.fy).toBe(0.5);
    expect(s.zoom).toBe(1);
    s = photoGestureReducer(s, { type: "end" });
    expect(s.phase).toBe("end");
    // fx/fy are already live-current from the last move - "end" commits nothing new.
    expect(s.fx).toBeLessThan(0.5);
  });

  test("two-finger pinch (2 touches, move): zoom changes, fx/fy untouched", () => {
    let s: PhotoGestureState = initPhotoGestureState(0.5, 0.5, 1);
    s = photoGestureReducer(s, { type: "start" });
    s = photoGestureReducer(s, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 100, viewW: 1000, viewH: 1000 });
    expect(s.pinchStartDist).toBe(100); // first pinch reading in this gesture becomes its baseline
    expect(s.zoom).toBe(1); // scale is still 1 at the very first reading
    s = photoGestureReducer(s, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 200, viewW: 1000, viewH: 1000 });
    expect(s.zoom).toBe(2); // fingers spread 2x from the gesture's own baseline
    expect(s.fx).toBe(0.5);
    expect(s.fy).toBe(0.5);
    s = photoGestureReducer(s, { type: "end" });
    expect(s.phase).toBe("end");
    expect(s.zoom).toBe(2);
    expect(s.pinchStartDist).toBeNull();
  });

  test("a NEW gesture's pan is relative to the committed result of the PREVIOUS one, not the original start", () => {
    let s: PhotoGestureState = initPhotoGestureState(0.5, 0.5, 1);
    s = photoGestureReducer(s, { type: "start" });
    s = photoGestureReducer(s, { type: "move", touches: 1, dx: 100, dy: 0, viewW: 1000, viewH: 1000 });
    s = photoGestureReducer(s, { type: "end" });
    const afterFirstDrag = s.fx;
    expect(afterFirstDrag).toBeLessThan(0.5);

    s = photoGestureReducer(s, { type: "start" }); // baseFx snapshots afterFirstDrag, not 0.5
    expect(s.baseFx).toBe(afterFirstDrag);
    s = photoGestureReducer(s, { type: "move", touches: 1, dx: 100, dy: 0, viewW: 1000, viewH: 1000 });
    expect(s.fx).toBeLessThan(afterFirstDrag); // moved further left from where the first drag left off, not doubled from 0.5
  });

  test("double-tap reset snaps straight back regardless of what gesture was in progress", () => {
    let s: PhotoGestureState = initPhotoGestureState(0.5, 0.5, 1);
    s = photoGestureReducer(s, { type: "start" });
    s = photoGestureReducer(s, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 100, viewW: 1000, viewH: 1000 });
    s = photoGestureReducer(s, { type: "move", touches: 2, dx: 0, dy: 0, pinchDist: 300, viewW: 1000, viewH: 1000 });
    expect(s.zoom).toBeGreaterThan(1);
    s = photoGestureReducer(s, { type: "reset", fx: 0.5, fy: 0.5, zoom: 1 });
    expect(s).toEqual(initPhotoGestureState(0.5, 0.5, 1));
  });
});
