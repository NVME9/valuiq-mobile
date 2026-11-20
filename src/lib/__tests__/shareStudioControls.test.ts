// shareStudioControls.test.ts — coverage for the ONE rule that matters here:
// switching the export format or the selected control tab must never reset
// hook/photo-mode/zoom-focus/accent. MEASURED clunky-controls bug (v2
// layout): state for every row lived in one giant component, with no
// guarantee a future change couldn't quietly wipe another control when the
// user just wanted to look at a different tab or format.
import {
  initialStudioControls, setFormat, setActiveTab, setHook, setPhotoMode,
  setPhotoAdjust, resetPhotoAdjust, setAccent, toggleHandleEnabled,
  setHandle, setHidePrice, setCutout, setPhotoBorder, setBgStyle,
  resetHookTab, resetPhotoTab, resetColorTab, resetMoreTab, resetAllTabs,
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

  test("v7: always starts cutout off, border on, background blur - regardless of what an earlier session left them at", () => {
    const s = baseState();
    expect(s.cutout).toBe(false);
    expect(s.photoBorder).toBe(true);
    expect(s.bgStyle).toBe("blur");
  });
});

describe("v7 setters - cutout/photoBorder/bgStyle", () => {
  test("each setter touches only its own field", () => {
    let s = baseState();
    s = setCutout(s, true);
    expect(s.cutout).toBe(true);
    expect(s.photoBorder).toBe(true);
    expect(s.bgStyle).toBe("blur");

    s = setPhotoBorder(s, false);
    expect(s.photoBorder).toBe(false);
    expect(s.cutout).toBe(true);

    s = setBgStyle(s, "tint");
    expect(s.bgStyle).toBe("tint");
    expect(s.cutout).toBe(true);
    expect(s.photoBorder).toBe(false);
  });
});

describe("per-tab Reset (v7, founder device finding #1: every option needs a reset)", () => {
  test("resetHookTab restores the caller's default hook (scan vs. win variant) without touching other tabs", () => {
    let s = baseState();
    s = setAccent(s, "#a3e635");
    s = setHook(s, "Yeah");
    s = resetHookTab(s, "Would you flip it?");
    expect(s.hook).toBe("Would you flip it?");
    expect(s.accent).toBe("#a3e635");

    // Win variant's default is null ("None"), not the scan preset.
    const win = resetHookTab(setHook(baseState(), "Yeah"), null);
    expect(win.hook).toBeNull();
  });

  test("resetPhotoTab restores Whole/no-crop/no-cutout/border-on/blur without touching hook/color/handle", () => {
    let s = baseState();
    s = setHook(s, "Yeah");
    s = setAccent(s, "#22d3ee");
    s = setPhotoMode(s, "fill");
    s = setPhotoAdjust(s, { zoom: 2.5, fx: 0.2, fy: 0.8 });
    s = setCutout(s, true);
    s = setPhotoBorder(s, false);
    s = setBgStyle(s, "dark");

    s = resetPhotoTab(s);
    expect(s.photoMode).toBe("whole");
    expect(s.zoom).toBe(1);
    expect(s.fx).toBe(0.5);
    expect(s.fy).toBe(0.5);
    expect(s.cutout).toBe(false);
    expect(s.photoBorder).toBe(true);
    expect(s.bgStyle).toBe("blur");
    expect(s.hook).toBe("Yeah");
    expect(s.accent).toBe("#22d3ee");
  });

  test("resetColorTab restores Auto without touching hook/photo/handle", () => {
    let s = baseState();
    s = setHook(s, "Yeah");
    s = setAccent(s, "#ff6b6b");
    s = setPhotoMode(s, "fill");
    s = resetColorTab(s);
    expect(s.accent).toBeNull();
    expect(s.hook).toBe("Yeah");
    expect(s.photoMode).toBe("fill");
  });

  test("resetMoreTab restores handle-off/price-shown without touching hook/photo/color", () => {
    let s = baseState();
    s = setHook(s, "Yeah");
    s = setAccent(s, "#ff6b6b");
    s = toggleHandleEnabled(s, true);
    s = setHandle(s, "@thriftflips");
    s = setHidePrice(s, true);

    s = resetMoreTab(s);
    expect(s.handleEnabled).toBe(false);
    expect(s.hidePrice).toBe(false);
    expect(s.hook).toBe("Yeah");
    expect(s.accent).toBe("#ff6b6b");
  });

  test("resetAllTabs restores every tab's defaults at once, but never format/activeTab", () => {
    let s = baseState();
    s = setFormat(s, "square");
    s = setActiveTab(s, "color");
    s = setHook(s, "Yeah");
    s = setAccent(s, "#ff6b6b");
    s = setPhotoMode(s, "fill");
    s = setPhotoAdjust(s, { zoom: 2 });
    s = setCutout(s, true);
    s = toggleHandleEnabled(s, true);
    s = setHidePrice(s, true);

    s = resetAllTabs(s, "Would you flip it?");
    expect(s.hook).toBe("Would you flip it?");
    expect(s.accent).toBeNull();
    expect(s.photoMode).toBe("whole");
    expect(s.zoom).toBe(1);
    expect(s.cutout).toBe(false);
    expect(s.photoBorder).toBe(true);
    expect(s.bgStyle).toBe("blur");
    expect(s.handleEnabled).toBe(false);
    expect(s.hidePrice).toBe(false);
    // Navigation state is NOT part of "reset all".
    expect(s.format).toBe("square");
    expect(s.activeTab).toBe("color");
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
