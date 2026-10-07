// ebaySoldFetch.ts — SPIKE (branch spike/ebay-sold-fetch, 2026-10-07).
// Plain fetch() + regex HTML parsing of eBay's public sold-listings search
// page. No native modules (no react-native-webview - see the parked
// branch spike/ebay-sold-webview: that module isn't in the current
// production native binary, so it would need a new build; this branch
// tries to avoid that entirely).
//
// DIAGNOSTIC FINDING (same day, run from the owner's own residential
// Comcast IP): a bare curl request AND a real headless-Chromium browser
// (full JS execution, genuine browser TLS fingerprint) both got an
// IDENTICAL 403 "Error Page" from eBay's Akamai edge, on BOTH
// www.ebay.com and m.ebay.com - i.e. that specific network path is
// blocked outright, not merely fingerprinted (a real browser got stopped
// exactly like curl did). React Native's fetch() goes through the OS's
// own native TLS stack (CFNetwork/okhttp, not Node/curl's OpenSSL), and a
// phone on cellular sits on a different IP/ASN entirely - so the real
// outcome on-device is still genuinely unknown. That's what
// SoldDataDebugScreen exists to find out; isBlockedPage below is what lets
// it tell "got real results" apart from "got the same wall again" at a
// glance.
//
// MARKUP CAVEAT: extractListings() is regex-based against eBay's
// documented `.s-item` card structure (title/price/caption/subtitle class
// names), the same ones the parked WebView branch queried via the DOM.
// This could NOT be verified against a real current response body from
// this environment (every request here hit the block above) - if a
// device run comes back 200/not-blocked but with 0 parsed listings, that
// means the markup has drifted and this needs adjusting from a real saved
// HTML sample, not that the network path failed.
export type RawSoldListing = {
  title: string;
  priceText: string;
  soldDateText: string | null;
  conditionText: string | null;
};

export type FetchScrapeResult = {
  ok: boolean;
  httpStatus: number;
  bytes: number;
  isBlockedPage: boolean;
  listings: RawSoldListing[];
  rawNodeCount: number;
  error: string | null;
  ms: number;
  url: string;
  userAgent: string;
  // Full response body - ONLY kept because this is a debug pipeline (the
  // owner's "Send page to server" capture needs the real bytes). Never
  // carry this into the real result-screen path if/when this spike lands
  // there - a ~43KB-200KB string per request has no business sitting in
  // normal app state.
  html: string;
};

export function buildSoldSearchUrl(query: string): string {
  const q = encodeURIComponent(query.slice(0, 120));
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1&_ipg=60`;
}

export const MOBILE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

// A/B probe (2026-10-07): the phone's own fetch() got 200/~43KB/not-blocked
// but 0 listings on the mobile Safari UA above - genuinely unknown yet
// whether that's markup drift on mobile specifically, or something that
// also happens on desktop. SoldDataDebugScreen runs both and reports which
// (if either) returns real listings.
export const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

// Covers both the generic Akamai "Error Page | eBay" static block (what
// this specific IP got on every single attempt today) and the more
// familiar interactive bot-challenge wording, in case a different
// network path gets THAT instead of a flat reject.
const BLOCKED_PAGE_MARKERS =
  /something went wrong on our end|pardon our interruption|verify you.?re a human|unusual traffic|checking your browser|needs to review the security of your connection|<title>\s*error page\s*\|\s*ebay\s*<\/title>/i;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'");
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Captures the text between a field's class attribute and whichever comes
// first: the next `s-item__*` class marker, or a hard length cap - a
// sibling-boundary approach rather than matching a specific closing tag,
// so it survives eBay nesting an extra <span> or two inside a field
// without needing to track tag depth.
function captureField(card: string, fieldClassRe: RegExp): string | null {
  const m = card.match(fieldClassRe);
  if (!m || m.index == null) return null;
  const rest = card.slice(m.index + m[0].length);
  const closeTag = rest.match(/>/);
  if (!closeTag || closeTag.index == null) return null;
  const afterOpenTag = rest.slice(closeTag.index + 1);
  const nextField = afterOpenTag.search(/class="[^"]*s-item__/i);
  const chunk = nextField === -1 ? afterOpenTag.slice(0, 600) : afterOpenTag.slice(0, nextField);
  const text = stripTags(chunk);
  return text || null;
}

function extractListings(html: string): RawSoldListing[] {
  // Each result card starts at an <li ... class="... s-item ..."> - split
  // on that marker and treat everything up to the next one as one card.
  const cards = html.split(/<li[^>]*class="[^"]*\bs-item\b[^"]*"/i).slice(1);
  const out: RawSoldListing[] = [];
  for (const card of cards) {
    const title = captureField(card, /class="[^"]*s-item__title[^"]*"[^>]*/i);
    if (!title || /^shop on ebay$/i.test(title)) continue;
    const priceText = captureField(card, /class="[^"]*s-item__price[^"]*"[^>]*/i) || "";
    const soldDateText = captureField(card, /class="[^"]*s-item__caption[^"]*"[^>]*/i);
    const conditionText = captureField(card, /class="[^"]*s-item__subtitle[^"]*"[^>]*/i);
    out.push({ title, priceText, soldDateText, conditionText });
  }
  return out;
}

export async function fetchAndParseSoldListings(
  query: string,
  userAgent: string = MOBILE_SAFARI_UA,
  timeoutMs = 10000
): Promise<FetchScrapeResult> {
  const t0 = Date.now();
  const url = buildSoldSearchUrl(query);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
    });
    const html = await r.text();
    const isBlockedPage = BLOCKED_PAGE_MARKERS.test(html);
    const listings = isBlockedPage ? [] : extractListings(html);
    return {
      ok: r.ok && !isBlockedPage,
      httpStatus: r.status,
      bytes: html.length,
      isBlockedPage,
      listings,
      rawNodeCount: listings.length,
      error: isBlockedPage ? "Blocked/challenge page" : (!r.ok ? `HTTP ${r.status}` : null),
      ms: Date.now() - t0,
      url,
      userAgent,
      html,
    };
  } catch (e: any) {
    return {
      ok: false, httpStatus: 0, bytes: 0, isBlockedPage: false, listings: [], rawNodeCount: 0,
      error: e?.name === "AbortError" ? `Timed out after ${timeoutMs}ms` : (e?.message || "Network error"),
      ms: Date.now() - t0,
      url, userAgent, html: "",
    };
  } finally {
    clearTimeout(timer);
  }
}
