// shareStudio.test.ts — crop clamping, zoom steps, zone geometry (overlap
// proof), verdict-to-stamp mapping, and price-block/name-fit coverage for
// the Share Studio (see shareStudio.ts's own header comment).
import {
  FORMAT_SIZES,
  StudioFormat,
  frameSizeForFormat,
  frameSizeForRatio,
  coverScale,
  containScale,
  minCropScale,
  defaultCropScale,
  clampZoomScale,
  stepZoomScale,
  clampPanTranslate,
  imagePlacement,
  zonesForFormat,
  scaleZones,
  photoZoneSize,
  stampForHeroVerdict,
  buildPriceBlock,
  buildWinCardText,
  fitItemName,
  formatFileSize,
  ZoneName,
} from "../shareStudio";

describe("frameSizeForFormat / frameSizeForRatio", () => {
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
  test("frameSizeForRatio is the same fit logic for an arbitrary ratio (the photo zone's own aspect)", () => {
    const f = frameSizeForRatio(2, 100, 1000); // very wide ratio, width-constrained
    expect(f.w).toBe(100);
    expect(f.h).toBe(50);
  });
});

describe("coverScale", () => {
  test("picks the larger of the two axis ratios", () => {
    expect(coverScale({ w: 100, h: 200 }, { w: 50, h: 50 })).toBe(0.5);
    expect(coverScale({ w: 200, h: 100 }, { w: 300, h: 300 })).toBe(3);
  });
  test("degenerate image size never divides by zero", () => {
    expect(coverScale({ w: 0, h: 0 }, { w: 100, h: 100 })).toBe(1);
  });
});

describe("clampZoomScale / stepZoomScale", () => {
  test("clamps into [1,4] by default", () => {
    expect(clampZoomScale(0.2)).toBe(1);
    expect(clampZoomScale(10)).toBe(4);
    expect(clampZoomScale(2.5)).toBe(2.5);
  });
  test("the +/- buttons step by a fixed amount and re-clamp", () => {
    expect(stepZoomScale(1, 1)).toBeCloseTo(1.1, 5);
    expect(stepZoomScale(1, -1)).toBe(1); // already at the floor, button press is a no-op at the clamp, never negative
    expect(stepZoomScale(3.95, 1)).toBe(4); // clamps at the ceiling
  });
  test("a caller can pass a lower floor (e.g. minCropScale) to allow zooming out below the default cover floor of 1", () => {
    expect(stepZoomScale(0.6, -1, 0.1, 0.5)).toBeCloseTo(0.5, 5); // clamps at the custom floor, not 1
    expect(stepZoomScale(0.6, 1, 0.1, 0.5)).toBeCloseTo(0.7, 5);
  });
});

describe("clampPanTranslate", () => {
  const img = { w: 1000, h: 1000 };
  const frame = { w: 500, h: 500 };
  test("at cover scale (scale=1) with a square image, there is no slack - translate clamps to 0", () => {
    const t = clampPanTranslate({ x: 999, y: -999 }, 1, img, frame);
    expect(t.x).toBe(0);
    expect(Math.abs(t.y)).toBe(0);
  });
  test("zooming in creates slack proportional to the extra scale", () => {
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

describe("imagePlacement", () => {
  const img = { w: 1000, h: 500 }; // 2:1
  const frame = { w: 200, h: 200 }; // native frame, square
  test("at default crop, the image is centered with no extra offset", () => {
    const p = imagePlacement(img, frame, { scale: 1, translate: { x: 0, y: 0 } }, 1);
    // cover scale = max(200/1000, 200/500) = 0.4 -> displayed 400x200 inside a 200x200 box
    expect(p.w).toBeCloseTo(400, 5);
    expect(p.h).toBeCloseTo(200, 5);
    expect(p.left).toBeCloseTo((200 - 400) / 2, 5);
    expect(p.top).toBeCloseTo((200 - 200) / 2, 5);
  });
  test("displayScale multiplies every output dimension and offset identically (preview == export at any scale)", () => {
    const crop = { scale: 1.5, translate: { x: 10, y: -4 } };
    const full = imagePlacement(img, frame, crop, 1);
    const half = imagePlacement(img, frame, crop, 0.5);
    expect(half.w).toBeCloseTo(full.w * 0.5, 5);
    expect(half.h).toBeCloseTo(full.h * 0.5, 5);
    expect(half.left).toBeCloseTo(full.left * 0.5, 5);
    expect(half.top).toBeCloseTo(full.top * 0.5, 5);
  });
});

describe("zonesForFormat - structural no-overlap guarantee", () => {
  const formats: StudioFormat[] = ["story", "feed", "square"];
  const zoneOrder: ZoneName[] = ["photo", "stamp", "price", "name", "footer"];

  for (const format of formats) {
    test(`${format}: zones stack with zero gap and zero overlap, filling the whole canvas`, () => {
      const zones = zonesForFormat(format);
      let expectedY = 0;
      for (const name of zoneOrder) {
        const z = zones[name];
        expect(z.h).toBeGreaterThan(0);
        expect(z.y).toBe(expectedY); // next zone starts EXACTLY where the previous one ended
        expectedY += z.h;
      }
      expect(expectedY).toBe(FORMAT_SIZES[format].h); // the stack exactly fills the canvas height
    });

    test(`${format}: no two zone rectangles overlap (generic pairwise check)`, () => {
      const zones = zonesForFormat(format);
      const rects = zoneOrder.map((name) => ({ name, y1: zones[name].y, y2: zones[name].y + zones[name].h }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const overlaps = a.y1 < b.y2 && b.y1 < a.y2;
          expect(overlaps).toBe(false);
        }
      }
    });
  }

  test("scaleZones multiplies every y/h by the given factor", () => {
    const zones = zonesForFormat("square");
    const scaled = scaleZones(zones, 0.25);
    for (const name of zoneOrder) {
      expect(scaled[name].y).toBeCloseTo(zones[name].y * 0.25, 5);
      expect(scaled[name].h).toBeCloseTo(zones[name].h * 0.25, 5);
    }
  });

  test("photoZoneSize's height matches zonesForFormat's own photo zone, at the full 1080 canvas width", () => {
    for (const format of formats) {
      const size = photoZoneSize(format);
      expect(size.w).toBe(1080);
      expect(size.h).toBe(zonesForFormat(format).photo.h);
    }
  });

  // Story-specific: Instagram overlays native UI at the very top and across
  // roughly the bottom quarter of a Story - key TEXT (the stamp/price/name
  // zones) has to stay inside y=250..1440 or a viewer's own chrome covers
  // it. Only the photo (not text) is allowed to run through y=0..250; only
  // the footer (handle/wordmark, least essential) is allowed to fall past
  // y=1440.
  test("story: key text (stamp/price/name) stays inside the y=250..1440 safe band", () => {
    const zones = zonesForFormat("story");
    expect(zones.stamp.y).toBeGreaterThanOrEqual(250);
    expect(zones.name.y + zones.name.h).toBeLessThanOrEqual(1440);
    // footer (handle/wordmark) is the one zone allowed into the reserved
    // bottom strip - it must start at/after the text band's own end.
    expect(zones.footer.y).toBeGreaterThanOrEqual(1440);
  });

  test("feed/square have no such safe-band ceiling - photo is free to be the dominant zone", () => {
    for (const format of ["feed", "square"] as StudioFormat[]) {
      const zones = zonesForFormat(format);
      expect(zones.photo.h).toBeGreaterThan(zones.stamp.h);
      expect(zones.photo.h).toBeGreaterThan(zones.price.h);
      expect(zones.photo.h).toBeGreaterThan(zones.name.h);
      expect(zones.photo.h).toBeGreaterThan(zones.footer.h);
    }
  });
});

describe("containScale / minCropScale (never force-cropping the subject)", () => {
  test("containScale picks the SMALLER of the two axis ratios (the opposite of coverScale)", () => {
    expect(containScale({ w: 100, h: 200 }, { w: 50, h: 50 })).toBe(0.25);
    expect(containScale({ w: 200, h: 100 }, { w: 300, h: 300 })).toBe(1.5);
  });
  test("degenerate image size never divides by zero", () => {
    expect(containScale({ w: 0, h: 0 }, { w: 100, h: 100 })).toBe(1);
  });
  test("minCropScale is <= 1 (contain is always <= cover) and exactly 1 for a same-aspect image/frame", () => {
    const img = { w: 1000, h: 1000 };
    const frame = { w: 500, h: 500 };
    expect(minCropScale(img, frame)).toBe(1);
  });
  test("minCropScale is well below 1 for a wide photo in a tall/square frame - it CAN zoom out past cover", () => {
    const img = { w: 2000, h: 500 }; // very wide
    const frame = { w: 500, h: 500 }; // square zone
    const min = minCropScale(img, frame);
    expect(min).toBeLessThan(1);
    // at that min, the absolute scale equals containScale exactly - the
    // whole image fits with no cropping at all.
    expect(coverScale(img, frame) * min).toBeCloseTo(containScale(img, frame), 5);
  });
});

describe("defaultCropScale (default crop rules)", () => {
  const wideImg = { w: 2000, h: 800 }; // wider than tall
  const tallImg = { w: 800, h: 2000 }; // taller than wide (portrait)
  const squareImg = { w: 1000, h: 1000 };

  test("Story always defaults to cover (1), regardless of photo orientation", () => {
    expect(defaultCropScale("story", wideImg)).toBe(1);
    expect(defaultCropScale("story", tallImg)).toBe(1);
  });

  test("Feed/Square default to contain-biased (< 1) for a wider-than-tall photo", () => {
    for (const format of ["feed", "square"] as StudioFormat[]) {
      const scale = defaultCropScale(format, wideImg);
      expect(scale).toBeLessThan(1);
      expect(scale).toBe(minCropScale(wideImg, photoZoneSize(format)));
    }
  });

  test("Feed/Square still default to cover (1) for a portrait or square photo", () => {
    for (const format of ["feed", "square"] as StudioFormat[]) {
      expect(defaultCropScale(format, tallImg)).toBe(1);
      expect(defaultCropScale(format, squareImg)).toBe(1);
    }
  });

  test("a degenerate image size never crashes and defaults to cover", () => {
    expect(defaultCropScale("feed", { w: 0, h: 0 })).toBe(1);
  });
});

describe("stampForHeroVerdict", () => {
  test("SOLID and WORTH A LOOK (both decisionFromVerdict 'BUY') -> GOOD FLIP", () => {
    expect(stampForHeroVerdict("SOLID")).toBe("GOOD FLIP");
    expect(stampForHeroVerdict("WORTH A LOOK")).toBe("GOOD FLIP");
  });
  test("THIN -> THIN MARGIN", () => {
    expect(stampForHeroVerdict("THIN")).toBe("THIN MARGIN");
  });
  test("PASS -> PASS", () => {
    expect(stampForHeroVerdict("PASS")).toBe("PASS");
  });
  test("CHECK ITEM -> no stamp", () => {
    expect(stampForHeroVerdict("CHECK ITEM")).toBeNull();
  });
  test("null/unknown verdict -> no stamp, never 'UNCONFIRMED'", () => {
    expect(stampForHeroVerdict(null)).toBeNull();
    expect(stampForHeroVerdict("SOMETHING_NEW" as any)).toBeNull();
  });
});

describe("buildPriceBlock", () => {
  const base = { paidPrice: 20, sellPrice: 65, profit: 38, roi: 133 };

  test("sold-backed: 'Sells for' with no tilde, profit+ROI shown", () => {
    const b = buildPriceBlock({ ...base, confidence: "sold-backed", hidePrice: false });
    expect(b.paidLine).toBe("Paid $20");
    expect(b.bigLine).toBe("Sells for $65");
    expect(b.caption).toBeNull();
    expect(b.profitLine).toBe("+$38 profit · 133% ROI");
  });

  test("estimate: 'Worth ~$Y', an 'estimate' caption, and no profit/ROI line at all", () => {
    const b = buildPriceBlock({ ...base, confidence: "estimate", hidePrice: false });
    expect(b.bigLine).toBe("Worth ~$65");
    expect(b.caption).toBe("estimate");
    expect(b.profitLine).toBeNull();
  });

  test("the estimate caption is never 'estimate-only' or any other jargon", () => {
    const b = buildPriceBlock({ ...base, confidence: "estimate", hidePrice: false });
    expect(b.caption).toBe("estimate");
  });

  test("hide price: drops the paid line, keeps the big price line", () => {
    const b = buildPriceBlock({ ...base, confidence: "estimate", hidePrice: true });
    expect(b.paidLine).toBeNull();
    expect(b.bigLine).toBe("Worth ~$65");
  });

  test("a real loss still formats with the minus sign on the dollar amount, never '$-'", () => {
    const b = buildPriceBlock({ ...base, profit: -12, roi: -30, confidence: "sold-backed", hidePrice: false });
    expect(b.profitLine).toBe("-$12 profit · -30% ROI");
    expect(b.profitLine).not.toContain("$-");
  });

  test("no sell price at all -> no big line, no caption", () => {
    const b = buildPriceBlock({ ...base, sellPrice: null, confidence: "estimate", hidePrice: false });
    expect(b.bigLine).toBeNull();
    expect(b.caption).toBeNull();
  });

  test("no paid price -> no paid line, independent of hidePrice", () => {
    const b = buildPriceBlock({ ...base, paidPrice: null, confidence: "sold-backed", hidePrice: false });
    expect(b.paidLine).toBeNull();
  });
});

describe("buildWinCardText", () => {
  test("real logged numbers, no confidence gating", () => {
    const t = buildWinCardText({ boughtPrice: 20, soldPrice: 65, profit: 45 });
    expect(t.subLine).toBe("Bought $20 → Sold $65");
    expect(t.bigLine).toBe("+$45 profit");
  });
  test("a logged loss still reads honestly", () => {
    const t = buildWinCardText({ boughtPrice: 50, soldPrice: 40, profit: -10 });
    expect(t.bigLine).toBe("-$10 profit");
  });
});

describe("fitItemName (name-fit rule: never pre-truncated)", () => {
  test("returns the name completely unmodified, no matter how long", () => {
    const long = "American Flag and Independence Day Patriotic Decorative Garden Flag, Large Size";
    expect(fitItemName(long)).toBe(long);
  });
  test("never appends an ellipsis", () => {
    const long = "A".repeat(200);
    expect(fitItemName(long)).not.toContain("...");
    expect(fitItemName(long).length).toBe(200);
  });
});

describe("file size readout", () => {
  test("formatFileSize picks a sensible unit", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});
