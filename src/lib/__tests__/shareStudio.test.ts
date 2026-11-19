// shareStudio.test.ts — coverage for the direct-manipulation gesture math
// (v4, item 3: replaces the arrow/+-/zoom button pad). Pure functions only -
// no PanResponder, no React - see ShareStudio.tsx's photoPanResponder for
// how these feed the real gesture.
import { panDeltaToFocus, pinchScaleToZoom, clampZoom, clampFocus } from "../shareStudio";

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
