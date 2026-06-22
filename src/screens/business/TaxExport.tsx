import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Linking, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token: string; onBack: () => void; }
const NOW = new Date().getFullYear();
const YEARS = [NOW, NOW - 1, NOW - 2];
const QUARTERS = ["Full Year", "Q1", "Q2", "Q3", "Q4"];

export default function TaxExport({ token, onBack }: Props) {
  const [year, setYear] = useState(NOW);
  const [quarter, setQuarter] = useState("Full Year");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [year, quarter]);

  async function load() {
    setLoading(true); setError(null); setReport(null);
    try {
      const q = quarter === "Full Year" ? "" : `&quarter=${quarter}`;
      const r = await fetch(`${API_BASE}/api/business/tax-export?token=${token}&year=${year}${q}`);
      const d = await r.json();
      if (d.success) setReport(d.report);
      else setError(d.error === "upgrade_required" ? "Titan plan required." : (d.error || "Could not load."));
    } catch { setError("Could not load tax report."); }
    setLoading(false);
  }

  function exportCsv() {
    const q = quarter === "Full Year" ? "" : `&quarter=${quarter}`;
    const url = `${API_BASE}/api/business/tax-export?token=${token}&year=${year}${q}&format=csv`;
    Linking.openURL(url).catch(() => setError("Could not open export."));
  }

  const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n || 0)).toLocaleString();
  const sc = report?.scheduleC || {};
  const sum = report?.summary || {};

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>Tax Export</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Selectors */}
        <Text style={s.lbl}>Tax Year</Text>
        <View style={s.chips}>
          {YEARS.map(y => (
            <TouchableOpacity key={y} style={[s.chip, year === y && s.chipOn]} onPress={() => setYear(y)}>
              <Text style={[s.chipTxt, year === y && s.chipTxtOn]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.lbl}>Period</Text>
        <View style={s.chips}>
          {QUARTERS.map(q => (
            <TouchableOpacity key={q} style={[s.chip, quarter === q && s.chipOn]} onPress={() => setQuarter(q)}>
              <Text style={[s.chipTxt, quarter === q && s.chipTxtOn]}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={B.orange} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={s.empty}><Text style={s.emptyTxt}>{error}</Text></View>
        ) : report ? (
          <View style={{ marginTop: 18 }}>
            <Text style={s.period}>{report.period}</Text>

            {/* Net profit hero */}
            <View style={s.heroCard}>
              <Text style={s.heroLbl}>NET PROFIT</Text>
              <Text style={[s.heroVal, { color: sum.netProfit >= 0 ? B.profit : B.loss }]}>{money(sum.netProfit)}</Text>
              <Text style={s.heroMargin}>{sum.profitMargin}% margin on {money(sum.grossRevenue)} revenue</Text>
            </View>

            {/* Summary breakdown */}
            <View style={s.card}>
              <View style={s.sumRow}><Text style={s.sumLbl}>Gross Revenue</Text><Text style={s.sumVal}>{money(sum.grossRevenue)}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLbl}>Cost of Goods Sold</Text><Text style={[s.sumVal, { color: B.loss }]}>-{money(sum.costOfGoodsSold)}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLbl}>Platform Fees</Text><Text style={[s.sumVal, { color: B.loss }]}>-{money(sum.platformFees)}</Text></View>
              <View style={[s.sumRow, s.sumTotal]}><Text style={[s.sumLbl, { fontWeight: "900", color: B.text1 }]}>Net Profit</Text><Text style={[s.sumVal, { fontWeight: "900", color: sum.netProfit >= 0 ? B.profit : B.loss }]}>{money(sum.netProfit)}</Text></View>
            </View>

            {/* Schedule C lines */}
            <Text style={s.secTit}>SCHEDULE C LINES</Text>
            <View style={s.card}>
              <View style={s.scRow}><Text style={s.scLine}>Line 1 — Gross Receipts</Text><Text style={s.scVal}>{money(sc.line1_GrossReceipts)}</Text></View>
              <View style={s.scRow}><Text style={s.scLine}>Line 4 — COGS</Text><Text style={s.scVal}>{money(sc.line4_COGS)}</Text></View>
              <View style={s.scRow}><Text style={s.scLine}>Line 10 — Commissions/Fees</Text><Text style={s.scVal}>{money(sc.line10_Commissions)}</Text></View>
              <View style={[s.scRow, s.sumTotal]}><Text style={[s.scLine, { color: B.text1, fontWeight: "800" }]}>Line 28 — Net Profit</Text><Text style={[s.scVal, { color: B.profit, fontWeight: "900" }]}>{money(sc.line28_NetProfit)}</Text></View>
            </View>

            {/* By category */}
            {(report.byCategory || []).length ? (
              <>
                <Text style={s.secTit}>BY CATEGORY</Text>
                <View style={s.card}>
                  {report.byCategory.slice(0, 8).map((c: any, i: number) => (
                    <View key={i} style={s.brRow}>
                      <Text style={s.brName} numberOfLines={1}>{c.category || "Uncategorized"}</Text>
                      <Text style={[s.brVal, { color: (c.profit || 0) >= 0 ? B.profit : B.loss }]}>{money(c.profit)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <TouchableOpacity style={s.exportBtn} onPress={exportCsv}>
              <Text style={s.exportTxt}>Export CSV for your accountant</Text>
            </TouchableOpacity>

            <Text style={s.disclaimer}>{sc.note || "This is an estimate based on your logged sales. Consult a tax professional for final filing."}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: B.bg },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: B.border },
  back: { width: 36, height: 36, justifyContent: "center" }, backTxt: { color: B.text3, fontSize: 26 },
  navTitle: { color: B.text1, fontSize: 15, fontWeight: "800" as any },
  scroll: { padding: 16, paddingBottom: 80 },
  lbl: { color: B.text2, fontSize: 12, fontWeight: "700" as any, marginBottom: 8, marginTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap" as any, gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: B.border2, backgroundColor: B.surface },
  chipOn: { backgroundColor: B.orangeBg, borderColor: B.orange },
  chipTxt: { color: B.text3, fontSize: 13, fontWeight: "600" as any }, chipTxtOn: { color: B.orange, fontWeight: "800" as any },
  period: { color: B.text3, fontSize: 13, fontWeight: "700" as any, marginBottom: 10 },
  heroCard: { backgroundColor: B.surface, borderWidth: 1.5, borderColor: B.orangeBorder, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 14 },
  heroLbl: { color: B.text4, fontSize: 11, fontWeight: "800" as any, letterSpacing: 1 },
  heroVal: { fontSize: 34, fontWeight: "900" as any, marginVertical: 4 },
  heroMargin: { color: B.text3, fontSize: 12 },
  card: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 14 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  sumTotal: { borderTopWidth: 1, borderTopColor: B.border, marginTop: 4, paddingTop: 10 },
  sumLbl: { color: B.text2, fontSize: 13 }, sumVal: { color: B.text1, fontSize: 14, fontWeight: "700" as any },
  secTit: { color: B.text3, fontSize: 12, fontWeight: "800" as any, letterSpacing: 1, marginBottom: 10 },
  scRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7 },
  scLine: { color: B.text2, fontSize: 13 }, scVal: { color: B.text1, fontSize: 14, fontWeight: "700" as any },
  brRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  brName: { color: B.text2, fontSize: 13, flex: 1, textTransform: "capitalize" as any }, brVal: { fontSize: 14, fontWeight: "800" as any },
  exportBtn: { backgroundColor: B.orange, borderRadius: 12, padding: 15, alignItems: "center", marginBottom: 12 },
  exportTxt: { color: "#000", fontSize: 14, fontWeight: "900" as any },
  disclaimer: { color: B.text4, fontSize: 10, lineHeight: 15, fontStyle: "italic" as any },
  empty: { alignItems: "center", marginTop: 40, paddingHorizontal: 30 },
  emptyTxt: { color: B.text2, fontSize: 14, textAlign: "center" as any },
});
