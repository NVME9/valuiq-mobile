// ApiDebugPanel.tsx — OUTAGE HARDENING (2026-10-07).
// Owner-only on-screen readout for Wins/Feed/Profile - each API call's
// name, HTTP status or error text, ms, retry count, and whether it was
// served by dedup instead of firing its own request. Reads lib/api.ts's
// shared getCallLog() (populated by dedupedCall, used by getPlan/
// getScanCount/getProfileData/getScanHistory/getThriftRuns/
// getCommunityFlips) - not a network call itself, just rendering an
// in-memory log. Collapsed by default so it never gets in the way; the
// caller is responsible for the OWNER_EMAILS gate (isOwner prop) - this
// component renders nothing at all for anyone else.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { C } from "../lib/theme";
import { getCallLog } from "../lib/api";

// winsStats (optional, 2026-10-07): the Wins header's true lifetime totals -
// SCANS/BUY FINDS/RUNS/MADE - plus their raw server-side source, so the
// owner can confirm on-device that these are NOT the page-capped
// getScanHistory(..., 50)/getThriftRuns lists this screen also holds for
// display, but /api/profile's own unbounded (up to its own 5000-row safety
// ceiling - see scansCeilingHit) aggregate. Optional/undefined on any other
// screen that mounts this panel without computing these.
interface WinsStats { trueScans: number; trueBuyFinds: number; total: number; trueRuns: number; scansCeilingHit: boolean }

// priceBasisDebug (optional, 2026-10-08): the price-basis hierarchy's own
// debug readout (deal-ai-pro's lib/priceBasis.ts) - which tier actually
// drove this scan's hero/profit/ROI/verdict, why each higher tier didn't
// qualify, and the exact-item eBay tier's own units/listings/latency. Null/
// undefined on a scan from before this field existed, or wherever no price
// was ever resolved (tier "ai_only" still carries a debug object - this is
// about the FIELD being absent, not the tier).
interface PriceBasisDebug {
  // ALWAYS-ANSWER TIER 4 (2026-10-18): "comparable_range" added - see
  // lib/priceBasis.ts (deal-ai-pro) for the full 5-tier cascade.
  tierUsed: "exact_item" | "item_moat" | "segment" | "comparable_range" | "ai_only";
  conditionTier?: "new" | "used" | null;
  basisPrice: number | null;
  evidenceLine: string | null;
  contextLine?: string | null;
  whyNotExactItem: string | null;
  whyNotItemMoat: string | null;
  whyNotSegment: string | null;
  whyNotComparableRange?: string | null;
  exactItemMs: number | null;
  exactItemUnitsSold: number | null;
  exactItemListings: number | null;
  itemMoatConditionMatchedCount?: number | null;
  segmentConditionMatchedCount?: number | null;
  segmentConditionVerified?: boolean | null;
  segmentItemTypeMismatch?: boolean;
  segmentSoldSampleTooThin?: boolean;
  estShippingCost?: number | null;
  shippingSizeClass?: string | null;
  // review fix #1 (2026-10-19): "keyword" = a real size-word match fired;
  // "category_default" = no keyword, but this category has a real-data
  // median class; "global_default" = neither (flat medium, now rare).
  shippingSizeClassSource?: "keyword" | "category_default" | "global_default" | null;
  canonicalKey?: string | null;
  canonicalKeyMethod?: string | null;
  canonicalKeyConfidence?: string | null;
  // comparable_range's own identity scope (2026-10-19) - "title_tokens" >
  // "brand_category" > "category", see lib/profitOracle.ts's
  // queryComparableRange. Shown here so the owner can see WHICH identity
  // key a given scan actually matched on.
  comparableRangeConfidence?: "low" | "medium" | null;
  comparableRangeBasisN?: number | null;
  comparableRangeScope?: "title_tokens" | "brand_category" | "category" | null;
  comparableRangeIdentityTokens?: string[] | null;
}

// barcodeDebug (optional, 2026-10-08): ScannerScreen's barcode fast path
// (handleBarcode) attaches this to the scan result - detect-to-lookup is
// the /api/upc-lookup round trip (target <1s), lookup-to-result is the
// subsequent full-pricing /api/lens call via confirmedIdentification.
interface BarcodeDebug {
  detectToLookupMs: number;
  lookupToResultMs: number;
  upcSource: string | null;
  gtin: string;
  retailPrice: number | null;
}

// segmentDebug (optional, 2026-10-09): the "What resellers made" block's
// own segment label/condition basis/sample sizes - see SegmentOutcomesBlock.
// tsx's SegmentOutcomesData. Separate from priceBasisDebug.segmentConditionMatchedCount
// (which describes why the HERO price basis tier did/didn't use segment
// data) - this is about the reseller-outcomes DISPLAY block specifically,
// which can be non-null even when segment never won the hero tier.
interface SegmentDebug {
  segmentLabel: string;
  conditionBasis: "confirmed-new" | "confirmed-used" | "mixed";
  resolvedCount: number;
  soldCount: number;
}

// storeReviewDebug (optional, 2026-10-10): lib/storeReview.ts's own
// eligibility readout for the in-app store-review ask - eligible yes/no,
// the exact failing condition when not, and the last-asked timestamp.
// Side-effect-free on the caller's end (never opens the real review modal,
// never writes last-asked) - see evaluateReview()/getReviewDebugState().
interface StoreReviewDebug {
  eligible: boolean;
  failingCondition: string | null;
  lastAskedAt: string | null;
  lifetimeScans: number | null;
  isAvailable: boolean | null;
}

// deleteAccountDebug (optional, 2026-10-11): ProfileScreen's DeleteAccountModal
// state, purely so the owner can see on-device that the entry still exists
// and exactly what state its two confirmation gates (typed word, 2s hold)
// are in - never used to drive anything, same side-effect-free pattern as
// storeReviewDebug above. entryVisible is set by ProfileScreen itself (not
// the modal, which only exists once mounted) so this still shows "false" if
// the entry were ever accidentally removed from the screen entirely.
interface DeleteAccountDebug {
  entryVisible: boolean;
  modalOpen: boolean;
  typedMatches: boolean;
  holding: boolean;
  holdProgressMs: number;
  submitting: boolean;
}

// tagPriceDebug (optional, 2026-10-12): the tag-price verdict fix's own
// readout - the OCR'd tag text, the price it resolved to (and whether the
// sanity gate withheld it), which of user/tag won as the verdict's buy
// price, and the current category/brand (the identity-stability fix's own
// result, shown here since "is this scan's category/brand stable across a
// re-shoot" is exactly what the owner needs to eyeball after that fix).
interface TagPriceDebug {
  ocrTagText: string | null;
  detectedTagPrice: number | null;
  detectedWasPrice: number | null;
  retailPriceRead: number | null;
  retailPriceReadConfidence: "high" | "low" | null;
  buyPriceSource: "user" | "tag" | null;
  category: string | null;
  brand: string | null;
  // TWO-PASS TAG READ (2026-10-18) - both independent passes' own read, so
  // the owner can see WHY a read was accepted or withheld, not just the
  // final outcome. See deal-ai-pro's lib/lensPricing.ts readTagPriceTwoPass.
  twoPass?: {
    passA: { price: number | null; confidence: "high" | "low" | null; sourceText: string | null };
    passB: { price: number | null; confidence: "high" | "low" | null; sourceText: string | null };
    needsConfirmation: boolean;
  } | null;
}

// scanFailures (optional, 2026-11-12, scan-retry item 4; extended
// 2026-11-14 to also carry crash entries): ScannerScreen's own persisted
// history (lib/failureLog.ts, AsyncStorage, last 20) of scan requests that
// threw - network error, timeout, 5xx, or a logical api failure - AND, as
// of the ErrorBoundary crash-capture fix, any genuine React render crash
// anywhere in the app (App.tsx's top-level boundary). Same list, same cap -
// see lib/failureLog.ts's own header for why. Independent of the live call
// log below (getCallLog only covers the six dedupedCall-backed Wins/Feed/
// Profile fetches, never scanImage/scanBarcodeFast or a render crash).
export interface ScanFailureEntry {
  at: number; kind?: "scan_failure" | "crash";
  stage?: string; status?: number | null; elapsedMs?: number; requestId?: string | null;
  name: string; message: string;
  stack?: string; componentStack?: string; screen?: string;
  resultSummary?: { keys: string[]; types: Record<string, string> } | null;
}

// scanTimings (optional, 2026-11-14, item 8): the elapsed ms of the last 10
// scans (success or failure) - see lib/scanTimingLog.ts. Separate from
// scanFailures above (that's failures only, with the full error detail) -
// this is purely "how long did the last several scans actually take,"
// success included, to check a timeout setting against real-world timing.
export interface ScanTimingEntry { at: number; elapsedMs: number; success: boolean }

export default function ApiDebugPanel({ isOwner, winsStats, priceBasisDebug, barcodeDebug, segmentDebug, parityMismatch, storeReviewDebug, deleteAccountDebug, tagPriceDebug, scanFailures, scanTimings }: { isOwner: boolean; winsStats?: WinsStats; priceBasisDebug?: PriceBasisDebug | null; barcodeDebug?: BarcodeDebug | null; segmentDebug?: SegmentDebug | null; parityMismatch?: string | null; storeReviewDebug?: StoreReviewDebug | null; deleteAccountDebug?: DeleteAccountDebug | null; tagPriceDebug?: TagPriceDebug | null; scanFailures?: ScanFailureEntry[]; scanTimings?: ScanTimingEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!isOwner) return null;
  const log = expanded ? getCallLog() : [];
  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.toggle}>{expanded ? "▲" : "▼"} API calls (owner debug)</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.list}>
          {barcodeDebug && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>Barcode: GTIN {barcodeDebug.gtin}  (source: {barcodeDebug.upcSource || "?"})</Text>
              <Text style={styles.row}>Detect→lookup: {barcodeDebug.detectToLookupMs}ms  ·  Lookup→priced result: {barcodeDebug.lookupToResultMs}ms</Text>
              {barcodeDebug.retailPrice != null && <Text style={styles.row}>Retail ${barcodeDebug.retailPrice} (a retail fact, never a sale price)</Text>}
            </View>
          )}
          {tagPriceDebug && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>
                Category/brand: {tagPriceDebug.category || "?"} / {tagPriceDebug.brand || "?"}
              </Text>
              <Text style={styles.row}>
                OCR tag text: {tagPriceDebug.ocrTagText || "(none)"}
              </Text>
              <Text style={styles.row}>
                Tag read: {tagPriceDebug.retailPriceRead != null ? `$${tagPriceDebug.retailPriceRead}` : "none"}
                {tagPriceDebug.retailPriceReadConfidence ? ` [${tagPriceDebug.retailPriceReadConfidence} confidence]` : ""}
                {" → detectedTagPrice: "}{tagPriceDebug.detectedTagPrice != null ? `$${tagPriceDebug.detectedTagPrice}` : "null (withheld or none)"}
                {tagPriceDebug.detectedWasPrice != null ? `  ·  was $${tagPriceDebug.detectedWasPrice}` : ""}
              </Text>
              <Text style={styles.row}>
                buyPriceSource: {tagPriceDebug.buyPriceSource || "null (nothing entered or detected)"}
              </Text>
              {/* TWO-PASS TAG READ (2026-10-18): both independent passes
                  (different models - Haiku + Sonnet, not just different
                  wording - see readTagPriceTwoPass's own header for why
                  same-model prompt variance alone wasn't independent
                  enough) shown separately, so a withheld/disagreeing read
                  is visibly explained, not just a silent "none". */}
              {tagPriceDebug.twoPass && (
                <>
                  <Text style={styles.row}>
                    Pass A: {tagPriceDebug.twoPass.passA.price != null ? `$${tagPriceDebug.twoPass.passA.price}` : "none"} [{tagPriceDebug.twoPass.passA.confidence ?? "?"}]{tagPriceDebug.twoPass.passA.sourceText ? ` — "${tagPriceDebug.twoPass.passA.sourceText}"` : ""}
                  </Text>
                  <Text style={styles.row}>
                    Pass B: {tagPriceDebug.twoPass.passB.price != null ? `$${tagPriceDebug.twoPass.passB.price}` : "none"} [{tagPriceDebug.twoPass.passB.confidence ?? "?"}]{tagPriceDebug.twoPass.passB.sourceText ? ` — "${tagPriceDebug.twoPass.passB.sourceText}"` : ""}
                  </Text>
                  <Text style={styles.row}>
                    {tagPriceDebug.twoPass.needsConfirmation ? "WITHHELD — passes disagreed or confidence was low, user must confirm" : "ACCEPTED — both passes agreed at high confidence"}
                  </Text>
                </>
              )}
            </View>
          )}
          {priceBasisDebug && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>Price basis: {priceBasisDebug.tierUsed}{priceBasisDebug.basisPrice != null ? ` ($${priceBasisDebug.basisPrice})` : ""}  [condition: {priceBasisDebug.conditionTier || "unknown"}]</Text>
              {!!priceBasisDebug.canonicalKey && <Text style={styles.row}>Canonical key: {priceBasisDebug.canonicalKey}  (via {priceBasisDebug.canonicalKeyMethod}, confidence: {priceBasisDebug.canonicalKeyConfidence})</Text>}
              {!!priceBasisDebug.evidenceLine && <Text style={styles.row}>Evidence: {priceBasisDebug.evidenceLine}</Text>}
              {!!priceBasisDebug.contextLine && <Text style={styles.row}>Context (not basis): {priceBasisDebug.contextLine}</Text>}
              {priceBasisDebug.estShippingCost != null && <Text style={styles.row}>Est. shipping: -${priceBasisDebug.estShippingCost} ({priceBasisDebug.shippingSizeClass}, {priceBasisDebug.shippingSizeClassSource === "keyword" ? "inferred from item name" : priceBasisDebug.shippingSizeClassSource === "category_default" ? "category default" : "global default"}) - already subtracted from profit/ROI above</Text>}
              <Text style={styles.row}>Exact-item eBay: {priceBasisDebug.exactItemUnitsSold ?? "?"} units / {priceBasisDebug.exactItemListings ?? "?"} listings / {priceBasisDebug.exactItemMs ?? "?"}ms{priceBasisDebug.whyNotExactItem ? ` — ${priceBasisDebug.whyNotExactItem}` : " — qualified"}</Text>
              <Text style={styles.row}>Item-moat: {priceBasisDebug.itemMoatConditionMatchedCount ?? "?"} condition-matched agreeing — {priceBasisDebug.whyNotItemMoat ? priceBasisDebug.whyNotItemMoat : "qualified"}</Text>
              <Text style={styles.row}>Segment: {priceBasisDebug.segmentConditionMatchedCount ?? "?"} condition-matched outcomes{priceBasisDebug.conditionTier === "new" ? ` (verified-New: ${priceBasisDebug.segmentConditionVerified ? "yes" : "no"})` : ""} — {priceBasisDebug.whyNotSegment ? priceBasisDebug.whyNotSegment : "qualified"}</Text>
              {/* ALWAYS-ANSWER TIER 4 (2026-10-18/19): which identity key
                  actually won - "title_tokens" (brand-independent product-
                  line words, see this app's own queryComparableRange header
                  for the Transformers barcode/photo bug this closes) >
                  "brand_category" > "category" - plus the exact matched
                  words, so the owner can see WHY two scans of the same
                  physical item either converged or didn't. */}
              <Text style={styles.row}>
                Comparable range: {priceBasisDebug.comparableRangeScope ?? "?"} scope, {priceBasisDebug.comparableRangeBasisN ?? "?"} rows [{priceBasisDebug.comparableRangeConfidence ?? "?"} confidence] — {priceBasisDebug.whyNotComparableRange ? priceBasisDebug.whyNotComparableRange : "qualified"}
              </Text>
              {Array.isArray(priceBasisDebug.comparableRangeIdentityTokens) && priceBasisDebug.comparableRangeIdentityTokens.length > 0 && (
                <Text style={styles.row}>Identity tokens matched: {priceBasisDebug.comparableRangeIdentityTokens.join(", ")}</Text>
              )}
            </View>
          )}
          {segmentDebug && (
            <Text style={styles.row}>Segment outcomes: {segmentDebug.segmentLabel} [{segmentDebug.conditionBasis}] — {segmentDebug.resolvedCount} resolved / {segmentDebug.soldCount} sold</Text>
          )}
          {storeReviewDebug && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>
                Store review: {storeReviewDebug.eligible ? "ELIGIBLE" : "not eligible"}{!storeReviewDebug.eligible && storeReviewDebug.failingCondition ? ` — ${storeReviewDebug.failingCondition}` : ""}
              </Text>
              <Text style={styles.row}>
                Lifetime scans: {storeReviewDebug.lifetimeScans ?? "?"}  ·  isAvailable: {String(storeReviewDebug.isAvailable)}  ·  last asked: {storeReviewDebug.lastAskedAt || "never"}
              </Text>
            </View>
          )}
          {deleteAccountDebug && (
            <Text style={styles.row}>
              Delete-account entry: visible={String(deleteAccountDebug.entryVisible)} · modal {deleteAccountDebug.modalOpen ? "open" : "closed"} · typed match: {deleteAccountDebug.typedMatches ? "yes" : "no"} · hold: {deleteAccountDebug.holding ? `${deleteAccountDebug.holdProgressMs}ms/2000ms` : "idle"}{deleteAccountDebug.submitting ? " · SUBMITTING" : ""}
            </Text>
          )}
          {/* PARITY GUARD (2026-10-09) - see ScannerScreen.tsx/SpecialtyScreen.
              tsx's own comment: fires only when the local classifyHeroVerdict
              port disagrees with the server's own fields at buyPrice=$0,
              which should never happen - a regression tripwire, not routine
              diagnostic noise. */}
          {!!parityMismatch && (
            <Text style={[styles.row, styles.err]}>{parityMismatch}</Text>
          )}
          {winsStats && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>
                True Scans: {winsStats.trueScans}{winsStats.scansCeilingHit ? "+" : ""}  (profile.stats.trueScans - scan-tab categories only, own user, is_test excluded)
              </Text>
              <Text style={styles.row}>
                True BUY Finds: {winsStats.trueBuyFinds}{winsStats.scansCeilingHit ? "+" : ""}  (profile.stats.trueBuyFinds - lib/winsStats.ts isBuyFind(): stored decision==="BUY", the single-verdict engine's own legacy mapping)
              </Text>
              <Text style={styles.row}>
                True Made: ${Math.round(winsStats.total)}{winsStats.scansCeilingHit ? "+" : ""}  (profile.stats.soldTotal - unbounded sold-row sum, unchanged by this fix)
              </Text>
              <Text style={styles.row}>
                True Runs: {winsStats.trueRuns}{winsStats.scansCeilingHit ? "+" : ""}  (profile.stats.trueRuns - category=thrift_run header rows)
              </Text>
              {winsStats.scansCeilingHit && (
                <Text style={[styles.row, styles.err]}>
                  ⚠ /api/profile's 5000-row scan ceiling was hit - all 4 totals above are "at least this many," not exact.
                </Text>
              )}
            </View>
          )}
          {!!scanTimings?.length && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>Last {scanTimings.length} scans, elapsed ms:</Text>
              {scanTimings.map((t, i) => (
                <Text key={i} style={[styles.row, !t.success ? styles.err : null]}>
                  {new Date(t.at).toLocaleTimeString()} · {t.elapsedMs}ms · {t.success ? "ok" : "failed"}
                </Text>
              ))}
            </View>
          )}
          {!!scanFailures?.length && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>Last {scanFailures.length} failures/crashes:</Text>
              {scanFailures.map((f, i) => (
                <Text key={i} style={[styles.row, styles.err]}>
                  {f.kind === "crash"
                    ? `${new Date(f.at).toLocaleTimeString()} · CRASH · ${f.screen || "?"} · ${f.name}: ${f.message}`
                    : `${new Date(f.at).toLocaleTimeString()} · ${f.stage}${f.status != null ? ` · HTTP ${f.status}` : ""} · ${f.elapsedMs}ms · ${f.name}: ${f.message}${f.requestId ? ` · req ${f.requestId}` : ""}`}
                </Text>
              ))}
            </View>
          )}
          {log.length === 0 && <Text style={styles.row}>No calls recorded yet this session.</Text>}
          {log.map((e, i) => (
            <Text key={i} style={[styles.row, !e.deduped && e.status !== "ok" ? styles.err : null]}>
              {e.deduped ? "↳ " : ""}{e.name} · {e.status} · {e.ms}ms · retries={e.retries}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginHorizontal: 16, marginBottom: 8 },
  toggle: { color: C.text4, fontSize: 11, fontWeight: "700" },
  list: { marginTop: 6, backgroundColor: C.bgDeep, borderRadius: 6, padding: 8, maxHeight: 220 },
  row: { color: C.text3, fontSize: 10, marginBottom: 2, fontFamily: "monospace" as any },
  err: { color: C.red },
});
