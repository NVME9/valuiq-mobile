// shareCardPayload.test.ts — coverage for the server-share-card payload
// builder and the "no share on a loss" rule (see shareCardPayload.ts's own
// header comment - everything here is pure, no network/file I/O).
import { buildShareCardPayload, canShareWin } from "../shareCardPayload";

describe("buildShareCardPayload - scan variant", () => {
  test("estimate: sets estimate:true and caption 'ESTIMATE'", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Vintage Leather Jacket",
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: true,
    });
    expect(p.estimate).toBe(true);
    expect(p.caption).toBe("ESTIMATE");
    expect(p.paid).toBe("$20");
    expect(p.hero).toBe("$65");
  });

  test("PASS verdict: red tone, PASS stamp", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "feed", itemName: "Chipped Mug",
      paidPrice: 5, heroSellPrice: 4, verdict: "PASS", isEstimate: false,
    });
    expect(p.tone).toBe("red");
    expect(p.stamp).toBe("PASS");
  });

  test("hidePrice: set directly, and implied when paid is unknown - either way the contract's required `paid` string is still present", () => {
    const explicit = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, hidePrice: true,
    });
    expect(explicit.hidePrice).toBe(true);
    expect(explicit.paid).toBe("$10");

    const unknown = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: null, heroSellPrice: 30, verdict: "SOLID", isEstimate: false,
    });
    expect(unknown.hidePrice).toBe(true);
    expect(unknown.paid).toBe("$0");
  });

  test("long name: passed through verbatim, never truncated", () => {
    const longName = "Vintage Carhartt Detroit Jacket Size XL Union Made USA Blanket Lined Chore Coat";
    const p = buildShareCardPayload({
      variant: "scan", format: "square", itemName: longName,
      paidPrice: 20, heroSellPrice: 65, verdict: "SOLID", isEstimate: false,
    });
    expect(p.name).toBe(longName);
  });

  test("missing handle: omitted from the payload entirely, never sent as an empty string", () => {
    const noHandle = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, handle: null,
    });
    expect(noHandle.handle).toBeUndefined();

    const blankHandle = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, handle: "   ",
    });
    expect(blankHandle.handle).toBeUndefined();

    const withHandle = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: "SOLID", isEstimate: false, handle: "@thriftflips",
    });
    expect(withHandle.handle).toBe("@thriftflips");
  });

  test("toneOverride wins over the verdict's own mapping (History's decision-only rows)", () => {
    const p = buildShareCardPayload({
      variant: "scan", format: "story", itemName: "Lamp",
      paidPrice: 10, heroSellPrice: 30, verdict: null, toneOverride: "lime", isEstimate: false,
    });
    expect(p.tone).toBe("lime");
  });
});

describe("buildShareCardPayload - win variant", () => {
  test("win with profit: lime tone, SOLD stamp, 'PROFIT AFTER FEES' caption, signed hero", () => {
    const p = buildShareCardPayload({
      variant: "win", format: "story", itemName: "Vintage Jacket",
      boughtPrice: 20, soldPrice: 65, profit: 45,
    });
    expect(p.tone).toBe("lime");
    expect(p.stamp).toBe("SOLD");
    expect(p.caption).toBe("PROFIT AFTER FEES");
    expect(p.hero).toBe("+$45");
    expect(p.paid).toBe("$20");
    expect(p.sold).toBe("$65");
  });
});

describe("canShareWin - the 'no share on loss' rule", () => {
  test("a real profit can be shared", () => {
    expect(canShareWin(45)).toBe(true);
  });
  test("a loss cannot be shared", () => {
    expect(canShareWin(-10)).toBe(false);
  });
  test("break-even (exactly zero) cannot be shared", () => {
    expect(canShareWin(0)).toBe(false);
  });
  test("missing/non-finite profit cannot be shared", () => {
    expect(canShareWin(null)).toBe(false);
    expect(canShareWin(undefined)).toBe(false);
    expect(canShareWin(NaN)).toBe(false);
  });
});
