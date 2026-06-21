import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token: string; onBack: () => void; }

export default function ResellerCFO({ token, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/business/cfo?token=${token}`);
      const d = await r.json();
      if (d.success) setData(d);
      else setError(d.error === "upgrade_required" ? "Titan plan required." : (d.error || "Could not load."));
    } catch { setError("Could not load your CFO report."); }
    setLoading(false);
  }

  const money = (n: number) => (n < 0 ? "-$" + Math.abs(n).toLocaleString() : "$" + (n || 0).toLocaleString());

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>The Reseller's CFO</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {loading ? (
          <ActivityIndicator color={B.orange} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={s.empty}><Text style={s.emptyTxt}>{error}</Text></View>
        ) : data?.empty ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 38, marginBottom: 12 }}>{"\uD83D\uDCCA"}</Text>
            <Text style={s.emptyTxt}>Your CFO is warming up</Text>
            <Text style={s.emptySub}>{data.message}</Text>
          </View>
        ) : data ? (
          <>
            {/* Hero intro */}
            <View style={s.hero}>
              <Text style={s.heroTitle}>Your business, by the numbers</Text>
              <Text style={s.heroSub}>A live read on what's actually making (and losing) you money — based on your real scans and sales.</Text>
            </View>

            {/* THE VERDICT */}
            <Text style={s.secTit}>THE VERDICT</Text>
            <View style={s.verdictCard}>
              {(data.verdicts || []).map((v: string, i: number) => (
                <View key={i} style={s.verdictRow}>
                  <Text style={s.verdictBullet}>{"\u25B8"}</Text>
                  <Text style={s.verdictTxt}>{v}</Text>
                </View>
              ))}
            </View>

            {/* Money summary */}
            <View style={s.statGrid}>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: B.profit }]}>{money(data.summary.realizedProfit)}</Text>
                <Text style={s.statLbl}>Realized Profit</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: B.warning }]}>{money(data.summary.capitalTiedUp)}</Text>
                <Text style={s.statLbl}>Capital Tied Up</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: B.text1 }]}>{money(data.summary.thisMonthNet)}</Text>
                <Text style={s.statLbl}>This Month Net</Text>
              </View>
              <View style={s.statCard}>
                <Text style={[s.statVal, { color: B.orange }]}>{money(data.summary.projectedMonthEnd)}</Text>
                <Text style={s.statLbl}>Projected Month-End</Text>
              </View>
            </View>

            {/* Tax set-aside */}
            <View style={s.taxCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.taxLbl}>Suggested Tax Set-Aside</Text>
                <Text style={s.taxSub}>25% of realized profit</Text>
              </View>
              <Text style={s.taxVal}>{money(data.summary.taxSetAside)}</Text>
            </View>

            {/* Category breakdown */}
            <Text style={s.secTit}>MARGIN BY CATEGORY</Text>
            <View style={s.catCard}>
              <View style={s.catHeaderRow}>
                <Text style={[s.catH, { flex: 2 }]}>Category</Text>
                <Text style={[s.catH, { flex: 1, textAlign: "right" }]}>Items</Text>
                <Text style={[s.catH, { flex: 1, textAlign: "right" }]}>$/item</Text>
                <Text style={[s.catH, { flex: 1, textAlign: "right" }]}>Net</Text>
              </View>
              {(data.categoryBreakdown || []).map((c: any, i: number) => (
                <View key={i} style={[s.catRow, i === 0 && s.catRowBest]}>
                  <Text style={[s.catName, { flex: 2 }]} numberOfLines={1}>{c.category}</Text>
                  <Text style={[s.catCell, { flex: 1 }]}>{c.items}</Text>
                  <Text style={[s.catCell, { flex: 1, color: c.avgNet > 0 ? B.profit : B.loss }]}>{money(c.avgNet)}</Text>
                  <Text style={[s.catCell, { flex: 1, fontWeight: "800", color: c.totalNet > 0 ? B.profit : B.loss }]}>{money(c.totalNet)}</Text>
                </View>
              ))}
            </View>

            <Text style={s.disclaimer}>{data.disclaimer}</Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: B.bg },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: B.border },
  back: { width: 36, height: 36, justifyContent: "center" },
  backTxt: { color: B.text3, fontSize: 26 },
  navTitle: { color: B.text1, fontSize: 15, fontWeight: "800" as any },
  scroll: { padding: 16, paddingBottom: 60 },
  hero: { backgroundColor: B.surface, borderWidth: 1.5, borderColor: B.orangeBorder, borderRadius: 16, padding: 18, marginBottom: 18 },
  heroTitle: { color: B.text1, fontSize: 19, fontWeight: "900" as any, marginBottom: 6 },
  heroSub: { color: B.text3, fontSize: 13, lineHeight: 19 },
  secTit: { color: B.text3, fontSize: 12, fontWeight: "800" as any, letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  verdictCard: { backgroundColor: B.orangeBg, borderWidth: 1.5, borderColor: B.orangeBorder, borderRadius: 14, padding: 16, marginBottom: 18 },
  verdictRow: { flexDirection: "row", marginBottom: 10 },
  verdictBullet: { color: B.orange, fontSize: 15, fontWeight: "900" as any, marginRight: 8, marginTop: 1 },
  verdictTxt: { color: B.text1, fontSize: 14, lineHeight: 20, flex: 1, fontWeight: "600" as any },
  statGrid: { flexDirection: "row", flexWrap: "wrap" as any, gap: 8, marginBottom: 12 },
  statCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, width: "48%" as any },
  statVal: { fontSize: 20, fontWeight: "900" as any },
  statLbl: { color: B.text3, fontSize: 11, marginTop: 3 },
  taxCard: { flexDirection: "row", alignItems: "center", backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 20 },
  taxLbl: { color: B.text1, fontSize: 14, fontWeight: "800" as any },
  taxSub: { color: B.text4, fontSize: 11, marginTop: 2 },
  taxVal: { color: B.info, fontSize: 22, fontWeight: "900" as any },
  catCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 12, marginBottom: 14 },
  catHeaderRow: { flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: B.border, marginBottom: 6 },
  catH: { color: B.text4, fontSize: 11, fontWeight: "700" as any },
  catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8 },
  catRowBest: { backgroundColor: B.orangeBg },
  catName: { color: B.text1, fontSize: 13, fontWeight: "600" as any },
  catCell: { color: B.text2, fontSize: 13, textAlign: "right" as any },
  empty: { alignItems: "center", marginTop: 50, paddingHorizontal: 30 },
  emptyTxt: { color: B.text1, fontSize: 16, fontWeight: "800" as any, marginBottom: 6, textAlign: "center" as any },
  emptySub: { color: B.text3, fontSize: 13, textAlign: "center" as any, lineHeight: 19 },
  disclaimer: { color: B.text4, fontSize: 10, lineHeight: 15, fontStyle: "italic" as any, marginTop: 6 },
});
