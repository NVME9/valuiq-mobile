// recentSales.test.ts (2026-11-15, fix/tier-crash, result-fix item 11) —
// proves selectRecentSales (the "Recent real sales" card's view-model)
// never throws across every result.sales shape the server can actually
// send, and gets the newest-first/24-month/fallback-title rules right.
import { selectRecentSales } from "../recentSales";

const NOW = new Date("2026-11-15T00:00:00Z");
function monthsAgo(n: number): string {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

describe("selectRecentSales - never throws", () => {
  test.each([
    ["undefined", undefined],
    ["null", null],
    ["empty array", []],
    ["not an array (object)", { oops: true }],
    ["not an array (string)", "nope"],
    ["array with null elements", [null, null, null]],
    ["array with non-object elements", [1, "two", true]],
    ["array with missing date field", [{ price: 10 }]],
    ["array with malformed date", [{ date: "not-a-date", price: 10 }]],
    ["array with missing price field", [{ date: monthsAgo(1) }]],
  ])("%s does not throw", (_label, input) => {
    expect(() => selectRecentSales(input, NOW)).not.toThrow();
  });
});

describe("selectRecentSales - ordering and window rules", () => {
  test("sorts newest first", () => {
    const sales = [
      { date: monthsAgo(10), price: 10 },
      { date: monthsAgo(1), price: 20 },
      { date: monthsAgo(5), price: 30 },
    ];
    const view = selectRecentSales(sales, NOW);
    expect(view.sales.map(s => s.price)).toEqual([20, 30, 10]);
  });

  test("excludes sales older than 24 months when 3+ remain within the window", () => {
    const sales = [
      { date: monthsAgo(1), price: 1 },
      { date: monthsAgo(2), price: 2 },
      { date: monthsAgo(3), price: 3 },
      { date: monthsAgo(30), price: 999 }, // older than 24mo - excluded
    ];
    const view = selectRecentSales(sales, NOW);
    expect(view.title).toBe("Recent real sales");
    expect(view.sales.map(s => s.price)).toEqual([1, 2, 3]);
  });

  test("falls back to the 3 newest overall and retitles to 'Real sales' when fewer than 3 are within 24 months", () => {
    const sales = [
      { date: monthsAgo(30), price: 100 },
      { date: monthsAgo(1), price: 1 }, // only 1 within the 24mo window
    ];
    const view = selectRecentSales(sales, NOW);
    expect(view.title).toBe("Real sales");
    expect(view.sales.map(s => s.price)).toEqual([1, 100]);
    expect(view.sales.length).toBeLessThanOrEqual(3);
  });

  test("no sold data at all (empty array) returns an empty, non-throwing view", () => {
    const view = selectRecentSales([], NOW);
    expect(view.sales).toEqual([]);
  });

  test("caps 'Recent real sales' at 5 even with many recent rows", () => {
    const sales = Array.from({ length: 10 }, (_, i) => ({ date: monthsAgo(i), price: i }));
    const view = selectRecentSales(sales, NOW);
    expect(view.sales.length).toBe(5);
  });
});
