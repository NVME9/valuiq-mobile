// money.test.ts (2026-11-16) — proves formatMoney's sign placement.
// MEASURED BUG: the two prior ad-hoc fmtMoney copies (ScannerScreen.tsx,
// lib/checkItemCard.ts) rendered a real loss as "$-26.70" - the "$"
// prepended to the signed value directly instead of to its absolute value.
import { formatMoney } from "../money";

describe("formatMoney", () => {
  test("negative fractional renders as -$X.XX, never $-X.XX", () => {
    expect(formatMoney(-26.7)).toBe("-$26.70");
  });
  test("negative whole dollar renders as -$X", () => {
    expect(formatMoney(-5)).toBe("-$5");
  });
  test("positive whole dollar has no decimals", () => {
    expect(formatMoney(9)).toBe("$9");
  });
  test("positive fractional pads to two decimals", () => {
    expect(formatMoney(1.61)).toBe("$1.61");
  });
  test("zero renders as $0", () => {
    expect(formatMoney(0)).toBe("$0");
  });
  test("never produces a literal \"$-\" for any negative input", () => {
    for (const n of [-0.01, -1, -26.7, -1000.5]) {
      expect(formatMoney(n)).not.toContain("$-");
    }
  });
  // ScannerScreen.tsx's "Tag: $..." label (result step, compact tag price
  // row) used to echo the raw buyPrice TextInput string instead of running
  // it through this formatter - "10.5" printed as "Tag: $10.5" instead of
  // "Tag: $10.50", while a whole-dollar tag like "28" was already fine by
  // accident. Fixed by routing that label through fmtMoney(enteredBp) -
  // these two cases are exactly what that fix depends on.
  test("a non-integer tag price pads to two decimals ($10.5 -> $10.50)", () => {
    expect(formatMoney(10.5)).toBe("$10.50");
  });
  test("an integer tag price stays undecorated ($28 stays $28)", () => {
    expect(formatMoney(28)).toBe("$28");
  });
});
