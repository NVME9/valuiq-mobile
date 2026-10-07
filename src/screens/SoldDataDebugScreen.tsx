// SoldDataDebugScreen.tsx — SPIKE (branch spike/ebay-sold-fetch, 2026-10-07).
// Owner-only screen (reached only via ProfileScreen's isOwner-gated nav row
// - see that file) to run and inspect the eBay-sold-via-fetch pipeline on
// real barcodes/products before any of this gets wired into the actual
// result screen. This is NOT the final result-screen UI - it's a raw
// instrument panel.
//
// Plain fetch() + regex parsing (ebaySoldFetch.ts) - no native modules,
// OTA-safe. See that file's header for why (the earlier WebView approach
// is parked on branch spike/ebay-sold-webview: react-native-webview isn't
// in the current production native binary) and for today's diagnostic
// finding that even a real headless browser got blocked identically to
// curl from the owner's home IP - this screen is what finds out whether a
// real phone (and especially cellular, a different IP/ASN) fares better.
//
// Two independent modes per row, chosen by what the owner fills in:
//   - UPC mode: resolve the UPC through the EXISTING barcode pipeline
//     (scanBarcode -> /api/lens -> lookupUPC) to get the exact product
//     title, then fetch+parse eBay's sold-listings search TWICE (once by
//     that title, once by the raw UPC), and pull the active-listing count
//     by GTIN.
//   - Name-only mode (UPC left blank): skips the barcode lookup entirely
//     and scrapes/analyzes directly off a typed product title - for items
//     the owner doesn't physically have. Active-listing count falls back
//     to the keyword Browse search.
import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { scanBarcode, getEbayActiveCount } from "../lib/api";
import BarcodeScanModal from "../components/BarcodeScanModal";
import { fetchAndParseSoldListings, FetchScrapeResult } from "../lib/ebaySoldFetch";
import { cleanAndAnalyze, AnalysisResult, sellThroughPct } from "../lib/ebaySoldAnalysis";

interface Props {
  token: string;
  onBack?: () => void;
}

type RowState = {
  id: string;
  label: string;
  upc: string;
  titleQuery: string;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  mode?: "upc" | "name";
  identifiedTitle?: string;
  titleScrape?: FetchScrapeResult;
  upcScrape?: FetchScrapeResult;
  titleAnalysis?: AnalysisResult;
  upcAnalysis?: AnalysisResult;
  activeCount?: number | null;
  activeSource?: string;
  timing: { identifyMs?: number; titleScrapeMs?: number; upcScrapeMs?: number; activeCountMs?: number; totalMs?: number };
  rawExpanded: boolean;
};

// Seeded from the test list. UPC left blank for items the owner has in hand
// (scan the real box on-device). titleQuery is prefilled for the Walmart
// items the owner does NOT physically have - those run in name-only mode
// straight off this string. Both fields stay editable either way.
const SEED_ROWS: Omit<RowState, "status" | "timing" | "rawExpanded">[] = [
  { id: "1", label: "Dyson PencilVac Fluffy", upc: "", titleQuery: "" },
  { id: "2", label: 'HART 20V 3/8" Impact Wrench', upc: "", titleQuery: "HART 20V 3/8 impact wrench" },
  { id: "3", label: "Cuisinart Elemental 8-Cup Food Processor", upc: "", titleQuery: "Cuisinart Elemental 8 cup food processor" },
  { id: "4", label: "Carote Hokkaido 15-Piece Set", upc: "", titleQuery: "Carote Hokkaido 15 piece nonstick" },
  { id: "5", label: "Vornado Flippi Heater", upc: "", titleQuery: "Vornado Flippi VB heater" },
  { id: "6", label: "Reebok Bodyweight Training Kit", upc: "", titleQuery: "Reebok bodyweight training kit" },
  { id: "7", label: "Barbie World Golf Playset", upc: "", titleQuery: "Barbie World golf playset" },
  { id: "8", label: "Disney Nightmare Before Christmas Monopoly", upc: "", titleQuery: "Nightmare Before Christmas Monopoly" },
  { id: "9", label: "Under Armour striped polo", upc: "", titleQuery: "Under Armour striped polo" },
  { id: "10", label: "Disney Colorfinity Minnie Mouse", upc: "", titleQuery: "Disney Colorfinity Minnie Mouse" },
];

export default function SoldDataDebugScreen({ token, onBack }: Props) {
  const [rows, setRows] = useState<RowState[]>(
    SEED_ROWS.map((r) => ({ ...r, status: "idle", timing: {}, rawExpanded: false }))
  );
  const [runningAll, setRunningAll] = useState(false);
  const [scanTargetId, setScanTargetId] = useState<string | null>(null);

  function patchRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // UPC mode: resolve through the real barcode pipeline, then fetch+parse
  // BOTH the resolved title and the raw UPC so the two can be compared.
  async function runUpcRow(id: string, upc: string) {
    patchRow(id, { status: "running", mode: "upc", error: undefined, timing: {} });
    const t0 = Date.now();
    try {
      const identifyT0 = Date.now();
      const identified = await scanBarcode(token, upc);
      const identifyMs = Date.now() - identifyT0;
      const title: string | null =
        identified?.listingTitle ||
        (identified?.itemName ? `${identified.brand && identified.brand !== "Unknown" ? identified.brand + " " : ""}${identified.itemName}`.trim() : null);
      if (!title) {
        patchRow(id, { status: "error", error: "Barcode lookup found no product", timing: { identifyMs } });
        return;
      }
      patchRow(id, { identifiedTitle: title, timing: { identifyMs } });

      const titleT0 = Date.now();
      const titleScrape = await fetchAndParseSoldListings(title);
      const titleScrapeMs = Date.now() - titleT0;
      const titleAnalysis = titleScrape.ok ? cleanAndAnalyze(titleScrape.listings, title) : undefined;

      const upcT0 = Date.now();
      const upcScrape = await fetchAndParseSoldListings(upc);
      const upcScrapeMs = Date.now() - upcT0;
      const upcAnalysis = upcScrape.ok ? cleanAndAnalyze(upcScrape.listings, title) : undefined;

      const activeT0 = Date.now();
      const activeRes = await getEbayActiveCount(token, { upc, query: title });
      const activeCountMs = Date.now() - activeT0;

      patchRow(id, {
        status: "done",
        titleScrape, upcScrape, titleAnalysis, upcAnalysis,
        activeCount: activeRes.success ? (activeRes.count ?? null) : null,
        activeSource: activeRes.source,
        timing: { identifyMs, titleScrapeMs, upcScrapeMs, activeCountMs, totalMs: Date.now() - t0 },
      });
    } catch (e: any) {
      patchRow(id, { status: "error", error: e?.message || "Unknown error" });
    }
  }

  // Name-only mode: no barcode, no identify call - fetch+parse straight off
  // the typed title. Active-listing count uses the keyword fallback (no
  // GTIN available without a UPC).
  async function runNameRow(id: string, title: string) {
    patchRow(id, { status: "running", mode: "name", error: undefined, timing: {}, identifiedTitle: title });
    const t0 = Date.now();
    try {
      const titleT0 = Date.now();
      const titleScrape = await fetchAndParseSoldListings(title);
      const titleScrapeMs = Date.now() - titleT0;
      const titleAnalysis = titleScrape.ok ? cleanAndAnalyze(titleScrape.listings, title) : undefined;

      const activeT0 = Date.now();
      const activeRes = await getEbayActiveCount(token, { query: title });
      const activeCountMs = Date.now() - activeT0;

      patchRow(id, {
        status: "done",
        titleScrape, upcScrape: undefined, titleAnalysis, upcAnalysis: undefined,
        activeCount: activeRes.success ? (activeRes.count ?? null) : null,
        activeSource: activeRes.source,
        timing: { titleScrapeMs, activeCountMs, totalMs: Date.now() - t0 },
      });
    } catch (e: any) {
      patchRow(id, { status: "error", error: e?.message || "Unknown error" });
    }
  }

  function runRow(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return Promise.resolve();
    if (row.upc.trim()) return runUpcRow(id, row.upc.trim());
    if (row.titleQuery.trim()) return runNameRow(id, row.titleQuery.trim());
    patchRow(id, { status: "error", error: "Enter a UPC or a product title first" });
    return Promise.resolve();
  }

  async function runAll() {
    setRunningAll(true);
    for (const r of rows) {
      if (r.upc.trim() || r.titleQuery.trim()) await runRow(r.id);
    }
    setRunningAll(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <BarcodeScanModal
        visible={!!scanTargetId}
        onClose={() => setScanTargetId(null)}
        onScanned={(upc) => {
          if (scanTargetId) patchRow(scanTargetId, { upc });
          setScanTargetId(null);
        }}
      />
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backTxt}>‹ Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>Sold Data Spike (Debug)</Text>
      </View>
      <TouchableOpacity style={styles.runAllBtn} onPress={runAll} disabled={runningAll}>
        {runningAll ? <ActivityIndicator color={C.bg} /> : <Text style={styles.runAllTxt}>Run All</Text>}
      </TouchableOpacity>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 60 }}>
        {rows.map((row) => (
          <RowCard
            key={row.id}
            row={row}
            onChangeUpc={(v) => patchRow(row.id, { upc: v })}
            onChangeTitle={(v) => patchRow(row.id, { titleQuery: v })}
            onScan={() => setScanTargetId(row.id)}
            onRun={() => runRow(row.id)}
            onToggleRaw={() => patchRow(row.id, { rawExpanded: !row.rawExpanded })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtStats(label: string, s?: { count: number; median: number | null; p25: number | null; p75: number | null }) {
  if (!s || s.count === 0) return `${label}: 0 listings`;
  return `${label}: n=${s.count}  median $${s.median?.toFixed(2)}  p25-p75 $${s.p25?.toFixed(2)}-$${s.p75?.toFixed(2)}`;
}

function RowCard({ row, onChangeUpc, onChangeTitle, onScan, onRun, onToggleRaw }: {
  row: RowState;
  onChangeUpc: (v: string) => void;
  onChangeTitle: (v: string) => void;
  onScan: () => void;
  onRun: () => void;
  onToggleRaw: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{row.label}</Text>
      <View style={styles.upcRow}>
        <TextInput
          style={styles.upcInput}
          placeholder="UPC (type, paste, or scan)"
          placeholderTextColor={C.text4}
          keyboardType="number-pad"
          value={row.upc}
          onChangeText={onChangeUpc}
        />
        <TouchableOpacity style={styles.scanBtn} onPress={onScan}>
          <Text style={styles.scanBtnTxt}>📷</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.upcRow}>
        <TextInput
          style={styles.upcInput}
          placeholder="or search by name (no UPC)"
          placeholderTextColor={C.text4}
          value={row.titleQuery}
          onChangeText={onChangeTitle}
        />
        <TouchableOpacity style={styles.runBtn} onPress={onRun} disabled={row.status === "running"}>
          {row.status === "running" ? <ActivityIndicator color={C.bg} size="small" /> : <Text style={styles.runBtnTxt}>Run</Text>}
        </TouchableOpacity>
      </View>

      {row.status === "error" && <Text style={styles.errorTxt}>Error: {row.error}</Text>}

      {row.status === "done" && (
        <View style={styles.results}>
          <Text style={styles.resultLine}>Mode: {row.mode} · Title: {row.identifiedTitle}</Text>

          <Text style={styles.sectionHdr}>By title query</Text>
          <ScrapeSummary s={row.titleScrape} />
          {row.titleAnalysis && (
            <>
              <Text style={styles.resultLine}>kept {row.titleAnalysis.kept.length} / dropped {row.titleAnalysis.dropped.length} (raw {row.titleAnalysis.totalRaw})</Text>
              <Text style={styles.resultLine}>{fmtStats("overall", row.titleAnalysis.overall)}</Text>
              <Text style={styles.resultLine}>{fmtStats("new", row.titleAnalysis.byCondition.new)}</Text>
              <Text style={styles.resultLine}>{fmtStats("used", row.titleAnalysis.byCondition.used)}</Text>
            </>
          )}

          {row.mode === "upc" && (
            <>
              <Text style={styles.sectionHdr}>By raw UPC query</Text>
              <ScrapeSummary s={row.upcScrape} />
              {row.upcAnalysis && (
                <>
                  <Text style={styles.resultLine}>kept {row.upcAnalysis.kept.length} / dropped {row.upcAnalysis.dropped.length} (raw {row.upcAnalysis.totalRaw})</Text>
                  <Text style={styles.resultLine}>{fmtStats("overall", row.upcAnalysis.overall)}</Text>
                </>
              )}
            </>
          )}

          <Text style={styles.sectionHdr}>Active listings (Browse API)</Text>
          <Text style={styles.resultLine}>
            {row.activeCount == null ? "unavailable" : `${row.activeCount} listed now (${row.activeSource})`}
          </Text>
          {row.titleAnalysis && row.activeCount != null && (
            <Text style={styles.resultLine}>
              sell-through ≈ {sellThroughPct(row.titleAnalysis.overall.count, row.activeCount) ?? "n/a"}%
            </Text>
          )}

          <Text style={styles.sectionHdr}>Timing</Text>
          <Text style={styles.resultLine}>
            {row.timing.identifyMs != null ? `identify ${row.timing.identifyMs}ms · ` : ""}
            title-scrape {row.timing.titleScrapeMs}ms
            {row.timing.upcScrapeMs != null ? ` · upc-scrape ${row.timing.upcScrapeMs}ms` : ""}
            {" "}· active-count {row.timing.activeCountMs}ms · TOTAL {row.timing.totalMs}ms
          </Text>

          <TouchableOpacity onPress={onToggleRaw}>
            <Text style={styles.toggleRaw}>{row.rawExpanded ? "Hide raw listings ▲" : "Show raw listings ▼"}</Text>
          </TouchableOpacity>
          {row.rawExpanded && (
            <View style={styles.rawDump}>
              <Text style={styles.rawHdr}>— title query, kept —</Text>
              {row.titleAnalysis?.kept.map((k, i) => (
                <Text key={i} style={styles.rawLine}>[{k.condition}] ${k.price.toFixed(2)} — {k.title}</Text>
              ))}
              <Text style={styles.rawHdr}>— title query, dropped —</Text>
              {row.titleAnalysis?.dropped.map((d, i) => (
                <Text key={i} style={styles.rawLineDrop}>[{d.reason}] {d.listing.title}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ScrapeSummary({ s }: { s?: FetchScrapeResult }) {
  if (!s) return null;
  return (
    <Text style={styles.resultLine}>
      HTTP {s.httpStatus} · {s.bytes}b · {s.isBlockedPage ? "⚠️ BLOCKED/CHALLENGE PAGE" : s.ok ? "parsed ✓" : `FAILED (${s.error})`} · {s.rawNodeCount} listings found · {s.ms}ms
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn: { marginRight: 12 },
  backTxt: { color: C.text2, fontSize: 16 },
  title: { color: C.text1, fontSize: 18, fontWeight: "700" },
  runAllBtn: { backgroundColor: C.green, marginHorizontal: 16, marginVertical: 8, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  runAllTxt: { color: C.bg, fontWeight: "700" },
  scroll: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  cardLabel: { color: C.text1, fontWeight: "600", marginBottom: 8 },
  upcRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  upcInput: { flex: 1, backgroundColor: C.surfaceHigh, color: C.text1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, borderColor: C.border, borderWidth: 1 },
  scanBtn: { backgroundColor: C.surfaceHigh, borderColor: C.border, borderWidth: 1, paddingHorizontal: 14, borderRadius: 6, justifyContent: "center", alignItems: "center" },
  scanBtnTxt: { fontSize: 16 },
  runBtn: { backgroundColor: C.green, paddingHorizontal: 16, borderRadius: 6, justifyContent: "center", alignItems: "center" },
  runBtnTxt: { color: C.bg, fontWeight: "700" },
  errorTxt: { color: C.red, marginTop: 8 },
  results: { marginTop: 10, borderTopColor: C.border, borderTopWidth: 1, paddingTop: 8 },
  sectionHdr: { color: C.text3, fontSize: 12, fontWeight: "700", marginTop: 8, textTransform: "uppercase" },
  resultLine: { color: C.text2, fontSize: 13, marginTop: 2 },
  toggleRaw: { color: C.yellow, marginTop: 10, fontSize: 13 },
  rawDump: { marginTop: 6, backgroundColor: C.bgDeep, borderRadius: 6, padding: 8 },
  rawHdr: { color: C.text4, fontSize: 11, fontWeight: "700", marginTop: 6 },
  rawLine: { color: C.text2, fontSize: 11, marginTop: 2 },
  rawLineDrop: { color: C.text4, fontSize: 11, marginTop: 2, fontStyle: "italic" },
});
