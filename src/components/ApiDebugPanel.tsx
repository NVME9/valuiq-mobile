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
  tierUsed: "exact_item" | "item_moat" | "segment" | "ai_only";
  conditionTier?: "new" | "used" | null;
  basisPrice: number | null;
  evidenceLine: string | null;
  contextLine?: string | null;
  whyNotExactItem: string | null;
  whyNotItemMoat: string | null;
  whyNotSegment: string | null;
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
  canonicalKey?: string | null;
  canonicalKeyMethod?: string | null;
  canonicalKeyConfidence?: string | null;
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

export default function ApiDebugPanel({ isOwner, winsStats, priceBasisDebug, barcodeDebug, segmentDebug, parityMismatch, storeReviewDebug }: { isOwner: boolean; winsStats?: WinsStats; priceBasisDebug?: PriceBasisDebug | null; barcodeDebug?: BarcodeDebug | null; segmentDebug?: SegmentDebug | null; parityMismatch?: string | null; storeReviewDebug?: StoreReviewDebug | null }) {
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
          {priceBasisDebug && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>Price basis: {priceBasisDebug.tierUsed}{priceBasisDebug.basisPrice != null ? ` ($${priceBasisDebug.basisPrice})` : ""}  [condition: {priceBasisDebug.conditionTier || "unknown"}]</Text>
              {!!priceBasisDebug.canonicalKey && <Text style={styles.row}>Canonical key: {priceBasisDebug.canonicalKey}  (via {priceBasisDebug.canonicalKeyMethod}, confidence: {priceBasisDebug.canonicalKeyConfidence})</Text>}
              {!!priceBasisDebug.evidenceLine && <Text style={styles.row}>Evidence: {priceBasisDebug.evidenceLine}</Text>}
              {!!priceBasisDebug.contextLine && <Text style={styles.row}>Context (not basis): {priceBasisDebug.contextLine}</Text>}
              {priceBasisDebug.estShippingCost != null && <Text style={styles.row}>Est. shipping: -${priceBasisDebug.estShippingCost} ({priceBasisDebug.shippingSizeClass}) - already subtracted from profit/ROI above</Text>}
              <Text style={styles.row}>Exact-item eBay: {priceBasisDebug.exactItemUnitsSold ?? "?"} units / {priceBasisDebug.exactItemListings ?? "?"} listings / {priceBasisDebug.exactItemMs ?? "?"}ms{priceBasisDebug.whyNotExactItem ? ` — ${priceBasisDebug.whyNotExactItem}` : " — qualified"}</Text>
              <Text style={styles.row}>Item-moat: {priceBasisDebug.itemMoatConditionMatchedCount ?? "?"} condition-matched agreeing — {priceBasisDebug.whyNotItemMoat ? priceBasisDebug.whyNotItemMoat : "qualified"}</Text>
              <Text style={styles.row}>Segment: {priceBasisDebug.segmentConditionMatchedCount ?? "?"} condition-matched outcomes{priceBasisDebug.conditionTier === "new" ? ` (verified-New: ${priceBasisDebug.segmentConditionVerified ? "yes" : "no"})` : ""} — {priceBasisDebug.whyNotSegment ? priceBasisDebug.whyNotSegment : "qualified"}</Text>
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
