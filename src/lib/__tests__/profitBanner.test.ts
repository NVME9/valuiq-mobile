// profitBanner.test.ts (2026-11-16) — proves the result screen's
// answer-card sub-line never prints a precise ROI% on an estimate-only
// result, and that negative profit never prints as "$-27".
import { resolveProfitConfidence, buildAnswerBannerText } from "../profitBanner";

describe("resolveProfitConfidence", () => {
  test("trusts the server's explicit value", () => {
    expect(resolveProfitConfidence("estimate", true)).toBe("estimate");
    expect(resolveProfitConfidence("sold-backed", false)).toBe("sold-backed");
  });
  test("missing (old scan) + card would show a real ROI -> sold-backed", () => {
    expect(resolveProfitConfidence(undefined, true)).toBe("sold-backed");
    expect(resolveProfitConfidence(null, true)).toBe("sold-backed");
  });
  test("missing (old scan) + card shows no ROI -> estimate", () => {
    expect(resolveProfitConfidence(undefined, false)).toBe("estimate");
  });
  test("an unrecognized server value is never trusted verbatim", () => {
    expect(resolveProfitConfidence("some-future-value", true)).toBe("sold-backed");
    expect(resolveProfitConfidence("some-future-value", false)).toBe("estimate");
  });
});

describe("buildAnswerBannerText", () => {
  test("estimate + loss: no ROI%, loss framing, positive dollar amount", () => {
    const text = buildAnswerBannerText({ profitConfidence: "estimate", enteredBp: 72, heroProfit: -26.7, heroRoi: -37 });
    expect(text).toBe("At $72 you'd likely lose about $26.70 (estimate)");
    expect(text).not.toContain("%");
    expect(text).not.toContain("$-");
  });
  test("estimate + profit: no ROI%, 'make roughly' framing", () => {
    const text = buildAnswerBannerText({ profitConfidence: "estimate", enteredBp: 9, heroProfit: 1.61, heroRoi: 18 });
    expect(text).toBe("At $9 you'd make roughly $1.61 (estimate)");
    expect(text).not.toContain("%");
  });
  test("sold-backed keeps the precise Pay/profit/ROI line", () => {
    const text = buildAnswerBannerText({ profitConfidence: "sold-backed", enteredBp: 15, heroProfit: 20, heroRoi: 133 });
    expect(text).toBe("Pay $15 → profit ~$20 (133% ROI)");
  });
});
