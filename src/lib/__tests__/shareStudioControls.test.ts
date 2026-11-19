// shareStudioControls.test.ts — coverage for the ONE rule that matters here:
// switching the export format or the selected control tab must never reset
// hook/photo-mode/zoom-focus/accent. MEASURED clunky-controls bug (v2
// layout): state for every row lived in one giant component, with no
// guarantee a future change couldn't quietly wipe another control when the
// user just wanted to look at a different tab or format.
import {
  initialStudioControls, setFormat, setActiveTab, setHook, setPhotoMode,
  setPhotoAdjust, resetPhotoAdjust, setAccent, toggleHandleEnabled,
  setHandle, setHidePrice,
} from "../shareStudioControls";

function baseState() {
  return initialStudioControls({
    hook: "Would you flip it?", handleEnabled: false, handle: "", photoMode: "whole", accent: null,
  });
}

describe("initialStudioControls", () => {
  test("always starts at format:story, tab:hook, centered zoom/focus", () => {
    const s = baseState();
    expect(s.format).toBe("story");
    expect(s.activeTab).toBe("hook");
    expect(s.zoom).toBe(1);
    expect(s.fx).toBe(0.5);
    expect(s.fy).toBe(0.5);
    expect(s.hidePrice).toBe(false);
  });
});

describe("switching format never resets other controls", () => {
  test("hook/color/photoMode/zoom survive a format change", () => {
    let s = baseState();
    s = setHook(s, "Pass or buy?");
    s = setPhotoMode(s, "fill");
    s = setPhotoAdjust(s, { zoom: 1.5 });
    s = setAccent(s, "#a3e635");

    const afterFeed = setFormat(s, "feed");
    expect(afterFeed.hook).toBe("Pass or buy?");
    expect(afterFeed.photoMode).toBe("fill");
    expect(afterFeed.zoom).toBe(1.5);
    expect(afterFeed.accent).toBe("#a3e635");
    expect(afterFeed.format).toBe("feed");

    const afterSquare = setFormat(afterFeed, "square");
    expect(afterSquare.hook).toBe("Pass or buy?");
    expect(afterSquare.photoMode).toBe("fill");
    expect(afterSquare.zoom).toBe(1.5);
    expect(afterSquare.accent).toBe("#a3e635");
  });
});

describe("switching tabs never resets other controls", () => {
  test("hook/color/photoMode/handle/hidePrice survive every tab switch", () => {
    let s = baseState();
    s = setHook(s, "Real find, real numbers.");
    s = setAccent(s, "#22d3ee");
    s = setPhotoMode(s, "fill");
    s = toggleHandleEnabled(s, true);
    s = setHandle(s, "@thriftflips");
    s = setHidePrice(s, true);

    for (const tab of ["photo", "color", "more", "hook"] as const) {
      s = setActiveTab(s, tab);
      expect(s.hook).toBe("Real find, real numbers.");
      expect(s.accent).toBe("#22d3ee");
      expect(s.photoMode).toBe("fill");
      expect(s.handleEnabled).toBe(true);
      expect(s.handle).toBe("@thriftflips");
      expect(s.hidePrice).toBe(true);
    }
    expect(s.activeTab).toBe("hook");
  });
});

describe("setPhotoMode", () => {
  test("switching to Fill keeps a previously-set zoom/focus untouched", () => {
    let s = baseState();
    s = setPhotoMode(s, "fill");
    s = setPhotoAdjust(s, { zoom: 2, fx: 0.6, fy: 0.4 });
    s = setPhotoMode(s, "fill"); // re-selecting the already-active mode is a no-op
    expect(s.zoom).toBe(2);
    expect(s.fx).toBeCloseTo(0.6);
    expect(s.fy).toBeCloseTo(0.4);
  });

  test("switching back to Whole drops any in-progress Fill crop", () => {
    let s = baseState();
    s = setPhotoMode(s, "fill");
    s = setPhotoAdjust(s, { zoom: 2, fx: 0.6, fy: 0.6 });
    s = setPhotoMode(s, "whole");
    expect(s.zoom).toBe(1);
    expect(s.fx).toBe(0.5);
    expect(s.fy).toBe(0.5);
  });
});

describe("setPhotoAdjust - direct-manipulation commit", () => {
  test("zoom clamps to [1, 3]", () => {
    let s = baseState();
    s = setPhotoAdjust(s, { zoom: -5 });
    expect(s.zoom).toBe(1);
    s = setPhotoAdjust(s, { zoom: 10 });
    expect(s.zoom).toBe(3);
  });

  test("focus clamps to [0, 1] per axis, independently", () => {
    let s = baseState();
    s = setPhotoAdjust(s, { fx: -5 });
    expect(s.fx).toBe(0);
    expect(s.fy).toBe(0.5);
    s = setPhotoAdjust(s, { fy: 5 });
    expect(s.fy).toBe(1);
  });

  test("an omitted field leaves that control exactly as it was - a pure pan never touches zoom, a pure pinch never touches fx/fy", () => {
    let s = baseState();
    s = setPhotoAdjust(s, { zoom: 2.5 });
    s = setPhotoAdjust(s, { fx: 0.2, fy: 0.8 });
    expect(s.zoom).toBe(2.5);
    expect(s.fx).toBe(0.2);
    expect(s.fy).toBe(0.8);
  });
});

describe("resetPhotoAdjust", () => {
  test("restores centered zoom/focus without touching photoMode itself", () => {
    let s = baseState();
    s = setPhotoMode(s, "fill");
    s = setPhotoAdjust(s, { zoom: 2, fx: 0.7, fy: 0.7 });
    s = resetPhotoAdjust(s);
    expect(s.zoom).toBe(1);
    expect(s.fx).toBe(0.5);
    expect(s.fy).toBe(0.5);
    expect(s.photoMode).toBe("fill");
  });
});
