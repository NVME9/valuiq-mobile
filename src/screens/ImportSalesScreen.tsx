import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { C } from "../lib/theme";
import HeaderLogo from "../components/HeaderLogo";
import { analyzeSales } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string, data?:any)=>void; onBack?:()=>void; onLogout:()=>void; navData?:any; }

function money(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return (n < 0 ? "-$" : "$") + Math.abs(Math.round(n));
}

export default function ImportSalesScreen({ token, onNavigate, onBack }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  function reset() {
    setFileName(null);
    setResult(null);
    setError("");
  }

  async function pickAndAnalyze() {
    setError("");
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
      });
      if (pick.canceled || !pick.assets?.[0]) return;
      const file = pick.assets[0];
      setFileName(file.name || "sales.csv");
      setLoading(true);

      const csvText = await FileSystem.readAsStringAsync(file.uri);
      const d = await analyzeSales(token, csvText);
      if (!d.success) throw new Error(d.error || "Analysis failed");
      setResult(d);
    } catch (e: any) {
      setError(e?.message || "Could not read that file.");
    }
    setLoading(false);
  }

  // ── LOADING ──────────────────────────────────────────────
  if (loading) return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.center}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={[s.body, { marginTop: 16 }]}>Analyzing {fileName || "your sales"}…</Text>
      </View>
    </SafeAreaView>
  );

  // ── RESULT ───────────────────────────────────────────────
  if (result) {
    const t = result.totals || {};
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.nav}>
          <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
          <View style={s.logoRow}><HeaderLogo textStyle={s.logoText}/></View>
          <TouchableOpacity onPress={reset} style={[s.navBtn, { marginLeft: "auto" as any }]}><Text style={s.navBtnText}>New File</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
          <Text style={s.h1}>📊 Sales Analysis</Text>
          <Text style={[s.body, { marginBottom: 16 }]}>
            {result.truncated
              ? `Analyzed ${result.rowsAnalyzed} of ${result.rowsTotal} sales`
              : `${result.rowsAnalyzed} sale${result.rowsAnalyzed === 1 ? "" : "s"} analyzed`}
          </Text>

          {/* Totals */}
          <View style={s.totalsCard}>
            <View style={s.totalsRow}>
              <View style={s.totalsStat}>
                <Text style={s.totalsVal}>{money(t.revenue)}</Text>
                <Text style={s.totalsLbl}>revenue</Text>
              </View>
              <View style={s.totalsStat}>
                <Text style={[s.totalsVal, { color: C.red }]}>{money(t.fees)}</Text>
                <Text style={s.totalsLbl}>est. fees</Text>
              </View>
              <View style={s.totalsStat}>
                <Text style={s.totalsVal}>{money(t.netAfterFees)}</Text>
                <Text style={s.totalsLbl}>net after fees</Text>
              </View>
            </View>
            {t.trueProfit != null ? (
              <Text style={s.trueProfitLine}>
                True profit ({t.trueProfitCount} sale{t.trueProfitCount === 1 ? "" : "s"} with cost known): <Text style={{ color: C.green, fontWeight: "800" }}>{money(t.trueProfit)}</Text>
              </Text>
            ) : (
              <Text style={s.hintLine}>Add a "Cost" column to your export to see true profit, ROI, and capital velocity.</Text>
            )}
          </View>

          {/* Upsell — free tier or no cost data yet */}
          {!result.isPaid && result.upgradeReason && (
            <TouchableOpacity style={s.upsellCard} activeOpacity={0.88} onPress={() => onNavigate("upgrade")}>
              <Text style={s.upsellTitle}>🔒 Unlock the real analysis</Text>
              <Text style={s.upsellBody}>{result.upgradeReason}</Text>
              <View style={s.upsellBtn}><Text style={s.upsellBtnText}>Upgrade →</Text></View>
            </TouchableOpacity>
          )}

          {/* Capital Velocity Leaderboard */}
          {result.isPaid && result.capitalVelocity?.length > 0 && (
            <View style={s.sectionCard}>
              <Text style={s.sectionTitle}>⚡ Capital Velocity Leaderboard</Text>
              <Text style={s.sectionSub}>Profit per dollar invested, per day — reinvest into these fastest.</Text>
              {result.capitalVelocity.map((x: any, i: number) => (
                <View key={i} style={[s.rankRow, i === 0 && s.rankRowBest]}>
                  <Text style={s.rankNum}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rankTitle} numberOfLines={1}>{x.title}</Text>
                    <Text style={s.rankSub}>{money(x.profit)} profit · {x.days ?? "?"}d · ROI {x.roi}%</Text>
                  </View>
                  <Text style={s.rankVel}>{x.velocityPct}%/day</Text>
                </View>
              ))}
            </View>
          )}

          {/* Capital Traps */}
          {result.isPaid && result.capitalTraps?.length > 0 && (
            <View style={[s.sectionCard, s.trapsCard]}>
              <Text style={[s.sectionTitle, { color: C.orange }]}>🐌 Capital Traps</Text>
              <Text style={s.sectionSub}>Slow money — profit, but tied up too long. Watch these before buying similar items again.</Text>
              {result.capitalTraps.map((x: any, i: number) => (
                <View key={i} style={s.rankRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rankTitle} numberOfLines={1}>{x.title}</Text>
                    <Text style={s.rankSub}>{money(x.profit)} profit · {x.days ?? "?"}d</Text>
                  </View>
                  <Text style={[s.rankVel, { color: C.orange }]}>{x.velocityPct}%/day</Text>
                </View>
              ))}
            </View>
          )}

          {/* Max Buy Recommendations */}
          {result.isPaid && result.maxBuyRecommendations?.length > 0 && (
            <View style={s.sectionCard}>
              <Text style={s.sectionTitle}>💰 Recommended Max Buy</Text>
              <Text style={s.sectionSub}>To net ${result.targetProfit}/flip after fees next time, based on what these items actually sold for.</Text>
              {result.maxBuyRecommendations.map((x: any, i: number) => (
                <View key={i} style={s.rankRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rankTitle} numberOfLines={1}>{x.title}</Text>
                    <Text style={s.rankSub}>sold {money(x.sold)}</Text>
                  </View>
                  <Text style={s.maxBuyVal}>don't pay over {money(x.maxBuy)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── UPLOAD ───────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><HeaderLogo textStyle={s.logoText}/></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={s.h1}>📊 Import Sales</Text>
        <Text style={[s.body, { marginBottom: 20 }]}>
          Upload your eBay or Mercari sales export. See your capital velocity leaderboard, your capital traps, and exactly what to pay next time.
        </Text>

        <View style={s.howCard}>
          <Text style={s.howTitle}>Where to get it</Text>
          <Text style={s.howLine}>• eBay: Seller Hub → Payments → Reports → download</Text>
          <Text style={s.howLine}>• Mercari: Selling → Sold → export</Text>
          <Text style={s.howLine}>• Add a "Cost" column with what you paid to unlock profit, ROI, and velocity</Text>
        </View>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <TouchableOpacity style={s.uploadBtn} activeOpacity={0.85} onPress={pickAndAnalyze}>
          <Text style={s.uploadBtnText}>Choose CSV File</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  nav: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  navBack: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  navBackText: { color: C.text1, fontSize: 22 },
  navBtn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  navBtnText: { color: C.text2, fontSize: 13, fontWeight: "700" as any },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoText: { color: C.text1, fontWeight: "800" as any, fontSize: 16 },
  h1: { color: C.text1, fontSize: 24, fontWeight: "900" as any, marginBottom: 6 },
  body: { color: C.text3, fontSize: 14, lineHeight: 20 },

  howCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, marginBottom: 20 },
  howTitle: { color: C.text1, fontSize: 13, fontWeight: "800" as any, marginBottom: 8 },
  howLine: { color: C.text3, fontSize: 12.5, lineHeight: 19 },

  errorText: { color: C.red, fontSize: 13, marginBottom: 12 },
  uploadBtn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  uploadBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" as any },

  totalsCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 18, marginBottom: 14 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  totalsStat: { alignItems: "center", flex: 1 },
  totalsVal: { color: C.text1, fontSize: 18, fontWeight: "900" as any },
  totalsLbl: { color: C.text4, fontSize: 10, fontWeight: "700" as any, textTransform: "uppercase" as any, marginTop: 2 },
  trueProfitLine: { color: C.text2, fontSize: 13, marginTop: 4 },
  hintLine: { color: C.text4, fontSize: 12, marginTop: 4, fontStyle: "italic" as any },

  upsellCard: { backgroundColor: C.greenBg, borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 16, padding: 18, marginBottom: 16 },
  upsellTitle: { color: C.text1, fontSize: 15, fontWeight: "900" as any, marginBottom: 6 },
  upsellBody: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  upsellBtn: { backgroundColor: C.green, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  upsellBtnText: { color: C.greenDark, fontSize: 14, fontWeight: "900" as any },

  sectionCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginBottom: 14 },
  trapsCard: { borderColor: C.orange + "40" },
  sectionTitle: { color: C.text1, fontSize: 15, fontWeight: "900" as any, marginBottom: 4 },
  sectionSub: { color: C.text4, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border },
  rankRowBest: { backgroundColor: C.greenBg, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8, borderTopWidth: 0 },
  rankNum: { color: C.text4, fontSize: 13, fontWeight: "800" as any, width: 18, textAlign: "center" as any },
  rankTitle: { color: C.text1, fontSize: 13.5, fontWeight: "700" as any },
  rankSub: { color: C.text4, fontSize: 11.5, marginTop: 2 },
  rankVel: { color: C.green, fontSize: 13, fontWeight: "900" as any },
  maxBuyVal: { color: C.yellow, fontSize: 12.5, fontWeight: "800" as any },
});
