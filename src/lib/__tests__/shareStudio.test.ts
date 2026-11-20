// shareStudio.test.ts — coverage for shareStudio.ts's remaining pure
// helpers (format metadata, the zoom/focus clamp bounds shared with
// shareStudioControls.ts, and the accent hex validator). The direct-
// manipulation gesture math that used to live here (panDeltaToFocus,
// pinchScaleToZoom, photoGestureReducer) was retired in Share Studio v6 -
// see lib/photoCrop.ts and its own test file for the dedicated Photo Crop
// screen's math, which replaced it with a different (frame-relative, not
// whole-preview-viewport-relative) geometry.
import {
  clampZoom, clampFocus, isValidAccentHex, formatFileSize,
  pickSurpriseAccent, ACCENT_SWATCHES, DEFAULT_BG_STYLE, DEFAULT_CUTOUT, DEFAULT_PHOTO_BORDER,
} from "../shareStudio";

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

describe("isValidAccentHex", () => {
  test("accepts a 6-digit hex with a leading #", () => {
    expect(isValidAccentHex("#a3e635")).toBe(true);
    expect(isValidAccentHex("#A3E635")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isValidAccentHex("a3e635")).toBe(false);
    expect(isValidAccentHex("#fff")).toBe(false);
    expect(isValidAccentHex("#gggggg")).toBe(false);
    expect(isValidAccentHex("")).toBe(false);
  });
});

describe("v7 defaults - Background/Border/Cutout", () => {
  test("Blur backdrop, border on, cutout off", () => {
    expect(DEFAULT_BG_STYLE).toBe("blur");
    expect(DEFAULT_PHOTO_BORDER).toBe(true);
    expect(DEFAULT_CUTOUT).toBe(false);
  });
});

describe("pickSurpriseAccent", () => {
  test("picks one of the 12 swatches", () => {
    const hex = pickSurpriseAccent(null, () => 0.999);
    expect(ACCENT_SWATCHES.some((sw) => sw.hex === hex)).toBe(true);
  });

  test("never returns the currently-active swatch when others are available", () => {
    for (let i = 0; i < ACCENT_SWATCHES.length; i++) {
      const current = ACCENT_SWATCHES[i].hex;
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        expect(pickSurpriseAccent(current, () => r)).not.toBe(current);
      }
    }
  });

  test("rand=0 and rand just under 1 both map to a valid in-range swatch (no off-by-one)", () => {
    expect(ACCENT_SWATCHES.some((sw) => sw.hex === pickSurpriseAccent(null, () => 0))).toBe(true);
    expect(ACCENT_SWATCHES.some((sw) => sw.hex === pickSurpriseAccent(null, () => 0.999999))).toBe(true);
  });
});

describe("formatFileSize", () => {
  test("formats bytes/KB/MB at the expected thresholds", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});
