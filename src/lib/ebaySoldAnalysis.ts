// ebaySoldAnalysis.ts — SPIKE (branch spike/ebay-sold-webview, 2026-10-07).
// Pure cleaning/stats logic for raw listings scraped off eBay's public sold-
// listings search page (see EbaySoldWebView.tsx for the scrape itself). No
// React Native imports here on purpose - keeps this testable/runnable with
// plain node and reusable by both the debug screen and, later, the real
// result-screen path once the spike is approved.

export type RawSoldListing = {
  title: string;
  priceText: string;
  soldDateText: string | null;
  conditionText: string | null;
};

export type DropReason = "no-price" | "weak-title-match" | "parts-or-accessory";

export type CleanedListing = RawSoldListing & {
  price: number;
  condition: "new" | "used" | "unknown";
};

export type ConditionStats = {
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
};

export type AnalysisResult = {
  totalRaw: number;
  kept: CleanedListing[];
  dropped: { listing: RawSoldListing; reason: DropReason }[];
  outliersRemoved: number;
  byCondition: { new: ConditionStats; used: ConditionStats };
  overall: ConditionStats;
};

const STOPWORDS = new Set([
  "the", "a", "an", "for", "with", "and", "or", "of", "in", "on", "new",
  "used", "pack", "set", "piece", "pc", "pcs", "ct", "count",
]);

// Drops obvious noise, lowercases, strips punctuation.
export function tokenize(s: string): string[] {
  const matches: string[] = s.toLowerCase().match(/[a-z0-9]+/g) || [];
  return matches.filter((t) => t.length > 1);
}

// The tokens from the KNOWN exact product title (brand + model words) that
// a listing's own title must substantially overlap with to count as "the
// same product" rather than a loosely-related search hit.
export function extractRequiredTokens(productTitle: string): string[] {
  const toks = tokenize(productTitle).filter((t) => !STOPWORDS.has(t));
  // Dedupe, keep order
  return Array.from(new Set(toks));
}

export function titleMatchRatio(listingTitle: string, requiredTokens: string[]): number {
  if (requiredTokens.length === 0) return 1;
  const listingToks = new Set(tokenize(listingTitle));
  let hits = 0;
  for (const t of requiredTokens) if (listingToks.has(t)) hits++;
  return hits / requiredTokens.length;
}

const PARTS_ACCESSORY_RE =
  /\bfor parts\b|\bnot working\b|\bparts only\b|\breplacement part\b|\baccessor(y|ies)\b|\blot of\b|\bbundle\b|\bcase only\b|\bbox only\b|\bmanual only\b|\bempty box\b|\bdamaged\b|\bbroken\b|\bas[\s-]is\b|\bcover only\b|\bfilter only\b|\battachment only\b/i;

export function isPartsOrAccessory(title: string): boolean {
  return PARTS_ACCESSORY_RE.test(title);
}

// Handles "$12.99", "$12.99 to $15.00" (takes the first), "US $12.99",
// "$1,234.56". Returns null when nothing parseable is found (free
// shipping-only rows, "Best Offer"-only rows with no fixed price shown, etc).
export function parsePrice(priceText: string): number | null {
  const m = priceText.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function classifyCondition(conditionText: string | null, title: string): "new" | "used" | "unknown" {
  const c = (conditionText || "").toLowerCase();
  const t = title.toLowerCase();
  if (/\bnew\b/.test(c) || /\bnew\b|\bnwt\b|\bnib\b|\bsealed\b/.test(t)) return "new";
  if (/\b(pre-owned|used|refurbished)\b/.test(c) || /\b(used|pre-owned|refurbished)\b/.test(t)) return "used";
  return "unknown";
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// Standard 1.5*IQR fence. Returns the kept subset (outliers excluded).
export function removeIQROutliers(nums: number[]): { kept: number[]; removedCount: number } {
  if (nums.length < 4) return { kept: nums, removedCount: 0 };
  const q1 = percentile(nums, 0.25)!;
  const q3 = percentile(nums, 0.75)!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const kept = nums.filter((n) => n >= lo && n <= hi);
  return { kept, removedCount: nums.length - kept.length };
}

function statsFor(prices: number[]): ConditionStats {
  return { count: prices.length, median: median(prices), p25: percentile(prices, 0.25), p75: percentile(prices, 0.75) };
}

// MIN_MATCH_RATIO: require at least 60% of the known product's significant
// tokens to appear in the listing title - loose enough to survive a
// reseller's slightly different word order/abbreviations, strict enough to
// drop "similar but different model" noise (e.g. a different impact-wrench
// voltage/size showing up in a broad eBay search).
const MIN_MATCH_RATIO = 0.6;

export function cleanAndAnalyze(raw: RawSoldListing[], productTitle: string): AnalysisResult {
  const requiredTokens = extractRequiredTokens(productTitle);
  const kept: CleanedListing[] = [];
  const dropped: { listing: RawSoldListing; reason: DropReason }[] = [];

  for (const r of raw) {
    if (isPartsOrAccessory(r.title)) { dropped.push({ listing: r, reason: "parts-or-accessory" }); continue; }
    if (titleMatchRatio(r.title, requiredTokens) < MIN_MATCH_RATIO) { dropped.push({ listing: r, reason: "weak-title-match" }); continue; }
    const price = parsePrice(r.priceText);
    if (price == null) { dropped.push({ listing: r, reason: "no-price" }); continue; }
    kept.push({ ...r, price, condition: classifyCondition(r.conditionText, r.title) });
  }

  const newPrices = kept.filter((k) => k.condition === "new").map((k) => k.price);
  const usedPrices = kept.filter((k) => k.condition !== "new").map((k) => k.price); // unknown bucketed with used - spike simplification
  const allPrices = kept.map((k) => k.price);

  const newClean = removeIQROutliers(newPrices);
  const usedClean = removeIQROutliers(usedPrices);
  const allClean = removeIQROutliers(allPrices);

  return {
    totalRaw: raw.length,
    kept,
    dropped,
    outliersRemoved: newClean.removedCount + usedClean.removedCount,
    byCondition: { new: statsFor(newClean.kept), used: statsFor(usedClean.kept) },
    overall: statsFor(allClean.kept),
  };
}

export function sellThroughPct(soldCount: number, activeCount: number): number | null {
  const denom = soldCount + activeCount;
  if (denom <= 0) return null;
  return Math.round((soldCount / denom) * 100);
}
