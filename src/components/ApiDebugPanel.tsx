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
}

export default function ApiDebugPanel({ isOwner, winsStats, priceBasisDebug }: { isOwner: boolean; winsStats?: WinsStats; priceBasisDebug?: PriceBasisDebug | null }) {
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
          {priceBasisDebug && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.row}>Price basis: {priceBasisDebug.tierUsed}{priceBasisDebug.basisPrice != null ? ` ($${priceBasisDebug.basisPrice})` : ""}  [condition: {priceBasisDebug.conditionTier || "unknown"}]</Text>
              {!!priceBasisDebug.evidenceLine && <Text style={styles.row}>Evidence: {priceBasisDebug.evidenceLine}</Text>}
              {!!priceBasisDebug.contextLine && <Text style={styles.row}>Context (not basis): {priceBasisDebug.contextLine}</Text>}
              <Text style={styles.row}>Exact-item eBay: {priceBasisDebug.exactItemUnitsSold ?? "?"} units / {priceBasisDebug.exactItemListings ?? "?"} listings / {priceBasisDebug.exactItemMs ?? "?"}ms{priceBasisDebug.whyNotExactItem ? ` — ${priceBasisDebug.whyNotExactItem}` : " — qualified"}</Text>
              <Text style={styles.row}>Item-moat: {priceBasisDebug.itemMoatConditionMatchedCount ?? "?"} condition-matched agreeing — {priceBasisDebug.whyNotItemMoat ? priceBasisDebug.whyNotItemMoat : "qualified"}</Text>
              <Text style={styles.row}>Segment: {priceBasisDebug.segmentConditionMatchedCount ?? "?"} condition-matched outcomes{priceBasisDebug.conditionTier === "new" ? ` (verified-New: ${priceBasisDebug.segmentConditionVerified ? "yes" : "no"})` : ""} — {priceBasisDebug.whyNotSegment ? priceBasisDebug.whyNotSegment : "qualified"}</Text>
            </View>
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
