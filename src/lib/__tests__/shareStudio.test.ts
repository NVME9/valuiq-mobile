// shareStudio.test.ts — crop clamping, format sizing, and card text builder
// coverage for the Share Studio (see shareStudio.ts's own header comment).
import {
  FORMAT_SIZES,
  frameSizeForFormat,
  coverScale,
  clampZoomScale,
  clampPanTranslate,
  buildCardText,
  buildWinCardText,
  formatFileSize,
} from "../shareStudio";

describe("frameSizeForFormat", () => {
  test("story (9:16) fills height-constrained viewport", () => {
    const f = frameSizeForFormat("story", 400, 500);
    expect(f.h).toBe(500);
    expect(f.w).toBeCloseTo(500 * (9 / 16), 5);
  });
  test("feed (4:5) fills width-constrained viewport", () => {
    const f = frameSizeForFormat("feed", 300, 1000);
    expect(f.w).toBe(300);
    expect(f.h).toBeCloseTo(300 / (4 / 5), 5);
  });
  test("square (1:1) is always equal w/h", () => {
    const f = frameSizeForFormat("square", 300, 500);
    expect(f.w).toBe(f.h);
  });
  test("export sizes are always 1080 wide", () => {
    expect(FORMAT_SIZES.story).toEqual({ w: 1080, h: 1920 });
    expect(FORMAT_SIZES.feed).toEqual({ w: 1080, h: 1350 });
    expect(FORMAT_SIZES.square).toEqual({ w: 1080, h: 1080 });
  });
});

describe("coverScale", () => {
  test("picks the larger of the two axis ratios", () => {
    expect(coverScale({ w: 100, h: 200 }, { w: 50, h: 50 })).toBe(0.5); // h axis: 50/200=0.25, w axis: 50/100=0.5
    expect(coverScale({ w: 200, h: 100 }, { w: 300, h: 300 })).toBe(3); // w axis: 300/200=1.5, h axis: 300/100=3
  });
  test("degenerate image size never divides by zero", () => {
    expect(coverScale({ w: 0, h: 0 }, { w: 100, h: 100 })).toBe(1);
  });
});

describe("clampZoomScale", () => {
  test("clamps into [1,4] by default", () => {
    expect(clampZoomScale(0.2)).toBe(1);
    expect(clampZoomScale(10)).toBe(4);
    expect(clampZoomScale(2.5)).toBe(2.5);
  });
});

describe("clampPanTranslate", () => {
  const img = { w: 1000, h: 1000 };
  const frame = { w: 500, h: 500 };
  test("at cover scale (scale=1) with a square image, there is no slack - translate clamps to 0", () => {
    const t = clampPanTranslate({ x: 999, y: -999 }, 1, img, frame);
    expect(t.x).toBe(0);
    expect(Math.abs(t.y)).toBe(0); // -0 is a valid "no slack" result, same as +0
  });
  test("zooming in creates slack proportional to the extra scale", () => {
    // cover(img,frame) = 0.5; at userScale=2 -> abs=1 -> displayed 1000x1000 in a 500x500 frame
    // slack = (1000*1 - 500)/2 = 250 on each axis
    const t = clampPanTranslate({ x: 1000, y: -1000 }, 2, img, frame);
    expect(t).toEqual({ x: 250, y: -250 });
  });
  test("the frame is never left showing empty space outside the image", () => {
    const t = clampPanTranslate({ x: 5000, y: 5000 }, 1.2, img, frame);
    const abs = coverScale(img, frame) * 1.2;
    const maxSlack = (img.w * abs - frame.w) / 2;
    expect(Math.abs(t.x)).toBeLessThanOrEqual(maxSlack + 1e-6);
    expect(Math.abs(t.y)).toBeLessThanOrEqual(maxSlack + 1e-6);
  });
});

describe("buildCardText", () => {
  const base = {
    itemName: "Vintage Leather Jacket",
    verdictEmoji: "✅",
    verdictLabel: "BUY IT",
    paidPrice: 20,
    sellPrice: 65,
    profit: 38,
    roi: 133,
  };

  test("sold-backed: shows profit + ROI, precise 'sell' wording", () => {
    const text = buildCardText({ ...base, confidence: "sold-backed", hidePrice: false });
    expect(text.priceLine).toBe("paid $20 → sell $65");
    expect(text.statsLine).toBe("+$38 profit · 133% ROI");
    expect(text.verdictText).toBe("✅ BUY IT");
  });

  test("estimate: 'est.' wording, no ROI/profit line at all", () => {
    const text = buildCardText({ ...base, confidence: "estimate", hidePrice: false });
    expect(text.priceLine).toBe("paid $20 → est. sell $65");
    expect(text.statsLine).toBeNull();
    expect(text.priceLine).not.toContain("%");
  });

  test("hide price: drops the paid amount, keeps the sell phrase capitalized", () => {
    const text = buildCardText({ ...base, confidence: "estimate", hidePrice: true });
    expect(text.priceLine).toBe("Est. sell $65");
    expect(text.priceLine).not.toContain("paid");
  });

  test("no verdict label -> null verdict text, never a bare emoji", () => {
    const text = buildCardText({ ...base, verdictLabel: null, confidence: "estimate", hidePrice: false });
    expect(text.verdictText).toBeNull();
  });

  test("a real loss still formats with the minus sign on the dollar amount", () => {
    const text = buildCardText({ ...base, profit: -12, roi: -30, confidence: "sold-backed", hidePrice: false });
    expect(text.statsLine).toBe("-$12 profit · -30% ROI");
    expect(text.statsLine).not.toContain("$-");
  });

  test("no sell price at all -> no price line", () => {
    const text = buildCardText({ ...base, sellPrice: null, confidence: "estimate", hidePrice: false });
    expect(text.priceLine).toBeNull();
  });
});

describe("buildWinCardText", () => {
  test("real logged numbers, no confidence gating", () => {
    const { headline } = buildWinCardText({ boughtPrice: 20, soldPrice: 65, profit: 45 });
    expect(headline).toBe("Bought $20, sold $65, profit $45");
  });
  test("a logged loss still reads honestly", () => {
    const { headline } = buildWinCardText({ boughtPrice: 50, soldPrice: 40, profit: -10 });
    expect(headline).toBe("Bought $50, sold $40, profit -$10");
  });
});

describe("file size readout", () => {
  test("formatFileSize picks a sensible unit", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});
