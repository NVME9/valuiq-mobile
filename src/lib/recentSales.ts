// recentSales.ts — pure selection/sort logic for the result screen's
// "Recent real sales" card (ScannerScreen.tsx). Extracted (2026-11-15,
// result-fix item 11) so it's unit-testable without mounting the whole
// screen, and so ScannerScreen's own JSX stays a straight render of
// whatever this returns.
//
// SPEC (item 11): newest first, last 24 months only; if fewer than 3 sales
// remain after that window, fall back to the 3 newest sales overall (ignore
// the window) and title the card "Real sales" instead of "Recent real
// sales" - 1-2 real comps from 3 years ago are still real data, worth
// showing, just not what "recent" means.
export interface SaleRow {
  date?: string | null;
  price?: number | null;
  condition?: string | null;
  [key: string]: unknown;
}

export interface RecentSalesView {
  title: string;
  sales: SaleRow[];
}

const MONTHS_WINDOW = 24;
const MAX_SHOWN = 5;
const MIN_FOR_RECENT_TITLE = 3;

function saleTimeMs(sale: SaleRow): number {
  if (!sale.date) return NaN;
  const t = new Date(sale.date).getTime();
  return t;
}

export function selectRecentSales(salesInput: unknown, now: Date = new Date()): RecentSalesView {
  // CRASH GUARD: not an array (missing/null/malformed response), or an
  // array containing a null/non-object row (a malformed row on a partial
  // result) - both rendered nothing before (see ScannerScreen.tsx's own
  // "item 6" crash guard, which this absorbs); same result here.
  const sales: SaleRow[] = Array.isArray(salesInput)
    ? salesInput.filter((s): s is SaleRow => !!s && typeof s === "object")
    : [];
  // Newest first; a sale with no parseable date sinks to the bottom rather
  // than crashing the sort or silently floating to the top as "newest."
  const sorted = [...sales].sort((a, b) => {
    const at = saleTimeMs(a);
    const bt = saleTimeMs(b);
    const aRank = isNaN(at) ? -Infinity : at;
    const bRank = isNaN(bt) ? -Infinity : bt;
    return bRank - aRank;
  });
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - MONTHS_WINDOW);
  const cutoffMs = cutoff.getTime();
  const recent = sorted.filter(s => {
    const t = saleTimeMs(s);
    return !isNaN(t) && t >= cutoffMs;
  });
  if (recent.length >= MIN_FOR_RECENT_TITLE) {
    return { title: "Recent real sales", sales: recent.slice(0, MAX_SHOWN) };
  }
  return { title: "Real sales", sales: sorted.slice(0, MIN_FOR_RECENT_TITLE) };
}
