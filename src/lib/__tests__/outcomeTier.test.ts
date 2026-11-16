// outcomeTier.test.ts (2026-11-15, fix/tier-crash) — proves the result
// screen's verdict pipeline (classifyOutcome -> classifyHeroVerdictLocal ->
// metaForHeroVerdict) never throws, across the result-time payload shapes
// that can actually reach it: a missing verdict, no max-buy basis, the
// "Full analysis unavailable" fallback, no tag price, no sold data, empty
// arrays, and null for every nested field. This is the "write a small
// script that runs the result view-model code with these shapes" check -
// run through the normal jest runner (no new dependency), not a one-off
// script, so it stays part of CI/`npm test` instead of rotting unused.
//
// metaForHeroVerdict is the actual fix for the on-device crash
// ("TypeError: Cannot read property 'tier' of undefined", ~4/9 scans,
// right after "Crunching the numbers"): classifyHeroVerdictLocal can
// return "CHECK ITEM" for a comparable_range match at category scope, but
// ScannerScreen.tsx's own local META table never had that key - the exact
// gap this test's "every HeroVerdict value" loop below would have caught.
import { classifyOutcome, classifyHeroVerdictLocal, metaForHeroVerdict, decisionFromVerdict, resolveHeroVerdict, type HeroVerdict, type OutcomeTierInput } from "../outcomeTier";

const BASE_INPUT: OutcomeTierInput = {
  noFlipMargin: false,
  netProfit: 20,
  roi: 40,
  daysToSell: 10,
  velocityTier: null,
  sellThrough: null,
  dataQuality: null,
  sellPrice: null,
  sellTimeLabel: null,
};

describe("classifyOutcome - never throws", () => {
  test("normal BUY-shaped input", () => {
    expect(() => classifyOutcome(BASE_INPUT)).not.toThrow();
  });
  test("missing verdict inputs (every optional field null/undefined)", () => {
    expect(() => classifyOutcome({
      ...BASE_INPUT,
      daysToSell: null, velocityTier: undefined, sellThrough: undefined,
      dataQuality: undefined, sellPrice: undefined, sellTimeLabel: undefined,
    })).not.toThrow();
  });
  test("no max-buy / no tag price shape (netProfit and roi both zero)", () => {
    expect(() => classifyOutcome({ ...BASE_INPUT, netProfit: 0, roi: 0 })).not.toThrow();
  });
  test("no sold data shape (noFlipMargin unknown, roi/profit NaN-prone fields coerced)", () => {
    // Number(undefined)||0 upstream is how ScannerScreen feeds this when a
    // scan never resolved real numbers - NaN must never reach here raw.
    expect(() => classifyOutcome({ ...BASE_INPUT, netProfit: NaN, roi: NaN })).not.toThrow();
  });
  test("a real loss", () => {
    expect(() => classifyOutcome({ ...BASE_INPUT, netProfit: -5, roi: -10 })).not.toThrow();
  });
  test("noFlipMargin true short-circuits everything else", () => {
    expect(() => classifyOutcome({ ...BASE_INPUT, noFlipMargin: true, netProfit: -999, roi: -999, daysToSell: null })).not.toThrow();
  });
});

describe("classifyHeroVerdictLocal - never throws", () => {
  const base = {
    tier: "segment", buyPrice: 20, netProfit: 20, roi: 40, sellThroughPct: null as number | null,
  };
  test("missing verdict shape - buyPrice 0 (no tag price entered)", () => {
    expect(classifyHeroVerdictLocal({ ...base, buyPrice: 0 })).toBeNull();
  });
  test("ai_only tier short-circuits to null (no verdict)", () => {
    expect(classifyHeroVerdictLocal({ ...base, tier: "ai_only" })).toBeNull();
  });
  test("comparable_range at category scope - the exact crash-trigger headline", () => {
    expect(() => classifyHeroVerdictLocal({
      ...base, tier: "comparable_range", comparableRangeScope: "category",
    })).not.toThrow();
    expect(classifyHeroVerdictLocal({
      ...base, tier: "comparable_range", comparableRangeScope: "category",
    })).toBe("CHECK ITEM");
  });
  test("every optional field omitted (null for every nested object)", () => {
    expect(() => classifyHeroVerdictLocal({
      tier: "segment", buyPrice: 20, netProfit: 20, roi: 40, sellThroughPct: null,
      comparableRangeConfidence: null, comparableRangeScope: null,
      segmentBrandAgnostic: null, priceVsReferenceSanityCapped: null,
    })).not.toThrow();
  });
  test("net loss (no max buy clears) returns PASS, not a throw", () => {
    expect(classifyHeroVerdictLocal({ ...base, netProfit: -1 })).toBe("PASS");
  });
});

describe("metaForHeroVerdict - never throws, never returns undefined for a real headline", () => {
  const ALL_REAL_HEADLINES: Exclude<HeroVerdict, null>[] = ["PASS", "THIN", "SOLID", "WORTH A LOOK", "CHECK ITEM"];
  for (const headline of ALL_REAL_HEADLINES) {
    test(`"${headline}" resolves to a real tier/emoji/accent, not undefined`, () => {
      const meta = metaForHeroVerdict(headline);
      expect(meta).not.toBeUndefined();
      expect(meta).not.toBeNull();
      expect(["hot", "solid", "thin", "skip"]).toContain(meta!.tier);
      expect(typeof meta!.emoji).toBe("string");
      expect(typeof meta!.accent).toBe("string");
    });
  }
  test("null headline (no verdict reached) returns null, not a throw", () => {
    expect(metaForHeroVerdict(null)).toBeNull();
  });
  test("an unrecognized future headline value degrades to a real tier instead of throwing", () => {
    // Simulates the exact bug: classifyHeroVerdictLocal (or a future
    // server contract change) returning a value this table hasn't caught
    // up with yet. Before the fix this was `undefined`, and the caller's
    // very next `.tier` read threw - the on-device crash.
    const meta = metaForHeroVerdict("SOME FUTURE VALUE" as unknown as HeroVerdict);
    expect(meta).not.toBeUndefined();
    expect(meta!.tier).toBe("thin");
  });
});

describe("resolveHeroVerdict - server headline is the source of truth", () => {
  // MEASURED BUG (2026-11-16): the NECA TMNT figure scan showed a local
  // "SOLID" badge while the server's own stored heroVerdict said "THIN" -
  // ScannerScreen.tsx used to always recompute locally and never consult
  // result.heroVerdict at all. This is the exact regression test: a server
  // headline of THIN must win even when the local inputs would clearly
  // compute SOLID.
  test("server THIN + local inputs that would compute SOLID -> THIN wins", () => {
    const computeLocal = () => classifyHeroVerdictLocal({
      tier: "exact_item", buyPrice: 10, netProfit: 40, roi: 40, sellThroughPct: 10,
    });
    expect(computeLocal()).toBe("SOLID"); // sanity: local really would say SOLID here
    expect(resolveHeroVerdict("THIN", computeLocal)).toBe("THIN");
  });

  test("server headline absent (old stored scan) falls back to the local compute", () => {
    const computeLocal = () => classifyHeroVerdictLocal({
      tier: "exact_item", buyPrice: 10, netProfit: 40, roi: 40, sellThroughPct: 10,
    });
    expect(resolveHeroVerdict(null, computeLocal)).toBe("SOLID");
  });

  test("server headline present as PASS overrides a local SOLID", () => {
    const computeLocal = () => classifyHeroVerdictLocal({
      tier: "exact_item", buyPrice: 10, netProfit: 40, roi: 40, sellThroughPct: 10,
    });
    expect(resolveHeroVerdict("PASS", computeLocal)).toBe("PASS");
  });

  test("computeLocal is never invoked when a server headline is present", () => {
    const computeLocal = jest.fn(() => "SOLID" as HeroVerdict);
    expect(resolveHeroVerdict("CHECK ITEM", computeLocal)).toBe("CHECK ITEM");
    expect(computeLocal).not.toHaveBeenCalled();
  });
});

describe("decisionFromVerdict - never throws", () => {
  test.each<[HeroVerdict, string]>([
    [null, "UNKNOWN"], ["PASS", "PASS"], ["THIN", "WATCH"], ["CHECK ITEM", "WATCH"],
    ["SOLID", "BUY"], ["WORTH A LOOK", "BUY"],
  ])("%s -> %s", (verdict, expected) => {
    expect(decisionFromVerdict(verdict)).toBe(expected);
  });
});
