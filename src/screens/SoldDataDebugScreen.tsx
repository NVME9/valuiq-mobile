// SoldDataDebugScreen.tsx — SPIKE (branch spike/ebay-sold-fetch, 2026-10-07).
// Owner-only screen (reached only via ProfileScreen's isOwner-gated nav row
// - see that file) to run and inspect the eBay-sold-via-fetch pipeline on
// real barcodes/products before any of this gets wired into the actual
// result screen. This is NOT the final result-screen UI - it's a raw
// instrument panel.
//
// Plain fetch() + regex parsing (ebaySoldFetch.ts) - no native modules,
// OTA-safe. See that file's header for the WebView-vs-fetch history.
//
// ROUND 2 (same day, real device result): HTTP 200, ~43KB, not the Akamai
// block page, but 0 listings parsed on BOTH wifi and 5G - a real sold-
// search results page is normally hundreds of KB, so this is NOT the
// network block from before, it's a parsing/markup problem. Added:
//   - "Send page to server" per scrape result - uploads the raw HTML to
//     deal-ai-pro's new owner-gated /api/debug-capture so it can be
//     inspected and the parser fixed against real bytes.
//   - A/B: the title query now runs with BOTH the mobile Safari UA and a
//     desktop Chrome UA, shown side by side, to see whether either
//     actually returns real listings.
//
// Two independent modes per row, chosen by what the owner fills in:
//   - UPC mode: resolve the UPC through the FAST lookup-only endpoint
//     (lookupUpcFast -> /api/upc-lookup -> lookupUPC, no pricing/oracle/
//     scan-save - see api.ts's own comment on why: the real /api/lens
//     path measured 6.2s for this and silently wrote a test scan row
//     every run), then fetch+parse eBay's sold-listings search (title x2
//     UAs, plus the raw UPC on the mobile UA), and pull the active-
//     listing count by GTIN.
//   - Name-only mode (UPC left blank): skips the lookup entirely and
//     scrapes/analyzes directly off a typed product title - for items the
//     owner doesn't physically have. Active-listing count falls back to
//     the keyword Browse search.
import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { lookupUpcFast, getEbayActiveCount, sendDebugCapture } from "../lib/api";
import BarcodeScanModal from "../components/BarcodeScanModal";
import { fetchAndParseSoldListings, FetchScrapeResult, MOBILE_SAFARI_UA, DESKTOP_CHROME_UA } from "../lib/ebaySoldFetch";
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
  titleScrapeMobile?: FetchScrapeResult;
  titleScrapeDesktop?: FetchScrapeResult;
  upcScrape?: FetchScrapeResult;
  titleAnalysisMobile?: AnalysisResult;
  titleAnalysisDesktop?: AnalysisResult;
  upcAnalysis?: AnalysisResult;
  activeCount?: number | null;
  activeSource?: string;
  timing: { identifyMs?: number; titleScrapeMobileMs?: number; titleScrapeDesktopMs?: number; upcScrapeMs?: number; activeCountMs?: number; totalMs?: number };
  rawExpanded: boolean;
  sendingCapture?: string | null; // which capture key is mid-upload, for the per-button spinner
  sentCaptures: Record<string, string>; // capture key -> saved row id
};

// Seeded from the test list. UPC left blank for items the owner has in hand
// (scan the real box on-device). titleQuery is prefilled for the Walmart
// items the owner does NOT physically have - those run in name-only mode
// straight off this string. Both fields stay editable either way.
const SEED_ROWS: Omit<RowState, "status" | "timing" | "rawExpanded" | "sentCaptures">[] = [
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
    SEED_ROWS.map((r) => ({ ...r, status: "idle", timing: {}, rawExpanded: false, sentCaptures: {} }))
  );
  const [runningAll, setRunningAll] = useState(false);
  const [scanTargetId, setScanTargetId] = useState<string | null>(null);

  function patchRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function sendCapture(rowId: string, key: string, label: string, s: FetchScrapeResult) {
    patchRow(rowId, { sendingCapture: key });
    const res = await sendDebugCapture(token, {
      label, url: s.url, userAgent: s.userAgent, httpStatus: s.httpStatus, bytes: s.bytes, isBlockedPage: s.isBlockedPage, html: s.html,
    });
    setRows((prev) => prev.map((r) => r.id === rowId ? {
      ...r,
      sendingCapture: null,
      sentCaptures: res.success && res.id ? { ...r.sentCaptures, [key]: res.id } : r.sentCaptures,
      error: res.success ? r.error : `Capture upload failed: ${res.error}`,
    } : r));
  }

  // UPC mode: fast lookup-only title resolution, then fetch+parse the
  // title (both UAs) and the raw UPC (mobile UA), plus the active count.
  async function runUpcRow(id: string, upc: string) {
    patchRow(id, { status: "running", mode: "upc", error: undefined, timing: {}, sentCaptures: {} });
    const t0 = Date.now();
    try {
      const identifyT0 = Date.now();
      const identified = await lookupUpcFast(token, upc);
      const identifyMs = Date.now() - identifyT0;
      const title = identified?.listingTitle || identified?.itemName || null;
      if (!identified?.success || !title) {
        patchRow(id, { status: "error", error: identified?.error || "UPC lookup found no product", timing: { identifyMs } });
        return;
      }
      patchRow(id, { identifiedTitle: title, timing: { identifyMs } });

      const mobT0 = Date.now();
      const titleScrapeMobile = await fetchAndParseSoldListings(title, MOBILE_SAFARI_UA);
      const titleScrapeMobileMs = Date.now() - mobT0;
      const titleAnalysisMobile = titleScrapeMobile.ok ? cleanAndAnalyze(titleScrapeMobile.listings, title) : undefined;

      const deskT0 = Date.now();
      const titleScrapeDesktop = await fetchAndParseSoldListings(title, DESKTOP_CHROME_UA);
      const titleScrapeDesktopMs = Date.now() - deskT0;
      const titleAnalysisDesktop = titleScrapeDesktop.ok ? cleanAndAnalyze(titleScrapeDesktop.listings, title) : undefined;

      const upcT0 = Date.now();
      const upcScrape = await fetchAndParseSoldListings(upc, MOBILE_SAFARI_UA);
      const upcScrapeMs = Date.now() - upcT0;
      const upcAnalysis = upcScrape.ok ? cleanAndAnalyze(upcScrape.listings, title) : undefined;

      const activeT0 = Date.now();
      const activeRes = await getEbayActiveCount(token, { upc, query: title });
      const activeCountMs = Date.now() - activeT0;

      patchRow(id, {
        status: "done",
        titleScrapeMobile, titleScrapeDesktop, upcScrape, titleAnalysisMobile, titleAnalysisDesktop, upcAnalysis,
        activeCount: activeRes.success ? (activeRes.count ?? null) : null,
        activeSource: activeRes.source,
        timing: { identifyMs, titleScrapeMobileMs, titleScrapeDesktopMs, upcScrapeMs, activeCountMs, totalMs: Date.now() - t0 },
      });
    } catch (e: any) {
      patchRow(id, { status: "error", error: e?.message || "Unknown error" });
    }
  }

  // Name-only mode: no lookup call - fetch+parse straight off the typed
  // title, both UAs. Active-listing count uses the keyword fallback (no
  // GTIN available without a UPC).
  async function runNameRow(id: string, title: string) {
    patchRow(id, { status: "running", mode: "name", error: undefined, timing: {}, identifiedTitle: title, sentCaptures: {} });
    const t0 = Date.now();
    try {
      const mobT0 = Date.now();
      const titleScrapeMobile = await fetchAndParseSoldListings(title, MOBILE_SAFARI_UA);
      const titleScrapeMobileMs = Date.now() - mobT0;
      const titleAnalysisMobile = titleScrapeMobile.ok ? cleanAndAnalyze(titleScrapeMobile.listings, title) : undefined;

      const deskT0 = Date.now();
      const titleScrapeDesktop = await fetchAndParseSoldListings(title, DESKTOP_CHROME_UA);
      const titleScrapeDesktopMs = Date.now() - deskT0;
      const titleAnalysisDesktop = titleScrapeDesktop.ok ? cleanAndAnalyze(titleScrapeDesktop.listings, title) : undefined;

      const activeT0 = Date.now();
      const activeRes = await getEbayActiveCount(token, { query: title });
      const activeCountMs = Date.now() - activeT0;

      patchRow(id, {
        status: "done",
        titleScrapeMobile, titleScrapeDesktop, upcScrape: undefined, titleAnalysisMobile, titleAnalysisDesktop, upcAnalysis: undefined,
        activeCount: activeRes.success ? (activeRes.count ?? null) : null,
        activeSource: activeRes.source,
        timing: { titleScrapeMobileMs, titleScrapeDesktopMs, activeCountMs, totalMs: Date.now() - t0 },
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
            onSendCapture={(key, label, s) => sendCapture(row.id, key, label, s)}
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

function RowCard({ row, onChangeUpc, onChangeTitle, onScan, onRun, onToggleRaw, onSendCapture }: {
  row: RowState;
  onChangeUpc: (v: string) => void;
  onChangeTitle: (v: string) => void;
  onScan: () => void;
  onRun: () => void;
  onToggleRaw: () => void;
  onSendCapture: (key: string, label: string, s: FetchScrapeResult) => void;
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

          <Text style={styles.sectionHdr}>Title query — mobile Safari UA</Text>
          <ScrapeBlock s={row.titleScrapeMobile} a={row.titleAnalysisMobile} captureKey="titleMobile" label={`${row.label} - title - mobile UA`} sending={row.sendingCapture === "titleMobile"} sentId={row.sentCaptures.titleMobile} onSendCapture={onSendCapture} />

          <Text style={styles.sectionHdr}>Title query — desktop Chrome UA</Text>
          <ScrapeBlock s={row.titleScrapeDesktop} a={row.titleAnalysisDesktop} captureKey="titleDesktop" label={`${row.label} - title - desktop UA`} sending={row.sendingCapture === "titleDesktop"} sentId={row.sentCaptures.titleDesktop} onSendCapture={onSendCapture} />

          {row.mode === "upc" && (
            <>
              <Text style={styles.sectionHdr}>Raw UPC query — mobile Safari UA</Text>
              <ScrapeBlock s={row.upcScrape} a={row.upcAnalysis} captureKey="upcMobile" label={`${row.label} - upc - mobile UA`} sending={row.sendingCapture === "upcMobile"} sentId={row.sentCaptures.upcMobile} onSendCapture={onSendCapture} />
            </>
          )}

          <Text style={styles.sectionHdr}>Active listings (Browse API)</Text>
          <Text style={styles.resultLine}>
            {row.activeCount == null ? "unavailable" : `${row.activeCount} listed now (${row.activeSource})`}
          </Text>
          {row.titleAnalysisMobile && row.activeCount != null && (
            <Text style={styles.resultLine}>
              sell-through ≈ {sellThroughPct(row.titleAnalysisMobile.overall.count, row.activeCount) ?? "n/a"}%
            </Text>
          )}

          <Text style={styles.sectionHdr}>Timing</Text>
          <Text style={styles.resultLine}>
            {row.timing.identifyMs != null ? `identify ${row.timing.identifyMs}ms · ` : ""}
            mobile-scrape {row.timing.titleScrapeMobileMs}ms · desktop-scrape {row.timing.titleScrapeDesktopMs}ms
            {row.timing.upcScrapeMs != null ? ` · upc-scrape ${row.timing.upcScrapeMs}ms` : ""}
            {" "}· active-count {row.timing.activeCountMs}ms · TOTAL {row.timing.totalMs}ms
          </Text>

          <TouchableOpacity onPress={onToggleRaw}>
            <Text style={styles.toggleRaw}>{row.rawExpanded ? "Hide raw listings ▲" : "Show raw listings ▼"}</Text>
          </TouchableOpacity>
          {row.rawExpanded && (
            <View style={styles.rawDump}>
              <Text style={styles.rawHdr}>— mobile UA title query, kept —</Text>
              {row.titleAnalysisMobile?.kept.map((k, i) => (
                <Text key={i} style={styles.rawLine}>[{k.condition}] ${k.price.toFixed(2)} — {k.title}</Text>
              ))}
              <Text style={styles.rawHdr}>— mobile UA title query, dropped —</Text>
              {row.titleAnalysisMobile?.dropped.map((d, i) => (
                <Text key={i} style={styles.rawLineDrop}>[{d.reason}] {d.listing.title}</Text>
              ))}
              <Text style={styles.rawHdr}>— desktop UA title query, kept —</Text>
              {row.titleAnalysisDesktop?.kept.map((k, i) => (
                <Text key={i} style={styles.rawLine}>[{k.condition}] ${k.price.toFixed(2)} — {k.title}</Text>
              ))}
              <Text style={styles.rawHdr}>— desktop UA title query, dropped —</Text>
              {row.titleAnalysisDesktop?.dropped.map((d, i) => (
                <Text key={i} style={styles.rawLineDrop}>[{d.reason}] {d.listing.title}</Text>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ScrapeBlock({ s, a, captureKey, label, sending, sentId, onSendCapture }: {
  s?: FetchScrapeResult;
  a?: AnalysisResult;
  captureKey: string;
  label: string;
  sending: boolean;
  sentId?: string;
  onSendCapture: (key: string, label: string, s: FetchScrapeResult) => void;
}) {
  if (!s) return null;
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.resultLine}>
        HTTP {s.httpStatus} · {s.bytes}b · {s.isBlockedPage ? "⚠️ BLOCKED/CHALLENGE PAGE" : s.ok ? "parsed ✓" : `FAILED (${s.error})`} · {s.rawNodeCount} listings found · {s.ms}ms
      </Text>
      {a && <Text style={styles.resultLine}>kept {a.kept.length} / dropped {a.dropped.length} (raw {a.totalRaw}) · {fmtStats("overall", a.overall)}</Text>}
      <TouchableOpacity
        style={styles.sendBtn}
        onPress={() => onSendCapture(captureKey, label, s)}
        disabled={sending || !!sentId}
      >
        {sending ? (
          <ActivityIndicator color={C.bg} size="small" />
        ) : (
          <Text style={styles.sendBtnTxt}>{sentId ? `Sent ✓ (${sentId.slice(0, 8)})` : "Send page to server"}</Text>
        )}
      </TouchableOpacity>
    </View>
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
  sendBtn: { marginTop: 4, alignSelf: "flex-start", backgroundColor: C.surfaceHigh, borderColor: C.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  sendBtnTxt: { color: C.yellow, fontSize: 11, fontWeight: "600" },
});
