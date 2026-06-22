import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token: string; onBack: () => void; }

export default function CompetitorIntel({ token, onBack }: Props) {
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!category.trim()) { setError("Enter a category or product type."); return; }
    setLoading(true); setError(null); setRes(null);
    try {
      const r = await fetch(`${API_BASE}/api/business/competitor-intel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, category }),
      });
      const d = await r.json();
      if (d.success) setRes(d);
      else setError(d.error === "upgrade_required" ? "Titan plan required." : (d.error || "Analysis failed."));
    } catch { setError("Could not reach analysis service."); }
    setLoading(false);
  }

  const money = (n: number) => "$" + (Math.round(n) || 0).toLocaleString();
  const pd = res?.priceDistribution;
  const maxBucket = pd ? Math.max(pd.under25, pd["25to75"], pd["75to150"], pd.over150, 1) : 1;
  const bar = (n: number) => Math.max(4, Math.round((n / maxBucket) * 100));

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>Competitor Intel</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {!res && (
            <View style={s.hero}>
              <Text style={s.heroTitle}>See who you're up against in any category</Text>
              <Text style={s.heroSub}>Enter a category or product type. We analyze live eBay sellers — who dominates, their pricing, and where the market gaps are.</Text>
            </View>
          )}

          <View style={s.form}>
            <Text style={s.lbl}>Category or product type</Text>
            <TextInput style={s.input} value={category} onChangeText={setCategory}
              placeholder="vintage Pyrex, Nike sneakers, power tools..." placeholderTextColor={B.text4} onSubmitEditing={analyze} />
            {error ? <Text style={s.err}>{error}</Text> : null}
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={analyze} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnTxt}>Scan the Competition</Text>}
            </TouchableOpacity>
          </View>

          {res && (
            <View style={{ marginTop: 18 }}>
              {res.insight ? <View style={s.insightCard}><Text style={s.insightTxt}>{res.insight}</Text></View> : null}

              {/* Price distribution */}
              {pd && (
                <>
                  <Text style={s.secTit}>PRICE DISTRIBUTION</Text>
                  <View style={s.distCard}>
                    {[["Under $25", pd.under25], ["$25–75", pd["25to75"]], ["$75–150", pd["75to150"]], ["Over $150", pd.over150]].map(([label, n]: any, i) => (
                      <View key={i} style={s.distRow}>
                        <Text style={s.distLbl}>{label}</Text>
                        <View style={s.distBarBg}><View style={[s.distBarFill, { width: (bar(n) + "%") as any }]} /></View>
                        <Text style={s.distNum}>{n}</Text>
                      </View>
                    ))}
                    <Text style={s.medianTxt}>Median price: {money(pd.median)} · {res.totalListingsAnalyzed} listings analyzed</Text>
                  </View>
                </>
              )}

              {/* Top sellers */}
              <Text style={s.secTit}>TOP SELLERS</Text>
              {(res.topSellers || []).map((sel: any, i: number) => (
                <View key={i} style={[s.sellerCard, i === 0 && s.sellerCardTop]}>
                  <View style={s.sellerHeader}>
                    <Text style={s.sellerRank}>#{i + 1}</Text>
                    <Text style={s.sellerName} numberOfLines={1}>{sel.seller}</Text>
                    <Text style={s.sellerCount}>{sel.listingCount} listings</Text>
                  </View>
                  <Text style={s.sellerPrice}>Avg {money(sel.avgPrice)} · range {money(sel.priceRange?.[0])}–{money(sel.priceRange?.[1])}</Text>
                  {(sel.sampleItems || []).slice(0, 2).map((it: string, j: number) => (
                    <Text key={j} style={s.sellerItem} numberOfLines={1}>· {it}</Text>
                  ))}
                </View>
              ))}

              <TouchableOpacity style={s.again} onPress={() => setRes(null)}><Text style={s.againTxt}>Scan Another Category</Text></TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: B.bg },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: B.border },
  back: { width: 36, height: 36, justifyContent: "center" }, backTxt: { color: B.text3, fontSize: 26 },
  navTitle: { color: B.text1, fontSize: 15, fontWeight: "800" as any },
  scroll: { padding: 16, paddingBottom: 80 },
  hero: { backgroundColor: B.surface, borderWidth: 1.5, borderColor: B.orangeBorder, borderRadius: 16, padding: 18, marginBottom: 16 },
  heroTitle: { color: B.text1, fontSize: 18, fontWeight: "900" as any, lineHeight: 24, marginBottom: 8 },
  heroSub: { color: B.text3, fontSize: 13, lineHeight: 19 },
  form: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 14, padding: 16 },
  lbl: { color: B.text2, fontSize: 12, fontWeight: "700" as any, marginBottom: 6 },
  input: { backgroundColor: B.bg, borderWidth: 1, borderColor: B.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: B.text1, fontSize: 14 },
  err: { color: B.loss, fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: B.orange, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 14 },
  btnTxt: { color: "#000", fontSize: 14, fontWeight: "900" as any },
  insightCard: { backgroundColor: B.orangeBg, borderWidth: 1, borderColor: B.orangeBorder, borderRadius: 12, padding: 14, marginBottom: 14 },
  insightTxt: { color: B.text1, fontSize: 14, lineHeight: 20, fontWeight: "600" as any },
  secTit: { color: B.text3, fontSize: 12, fontWeight: "800" as any, letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  distCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 14 },
  distRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  distLbl: { color: B.text2, fontSize: 12, width: 70 },
  distBarBg: { flex: 1, height: 10, backgroundColor: B.bg, borderRadius: 5, marginHorizontal: 8, overflow: "hidden" },
  distBarFill: { height: 10, backgroundColor: B.orange, borderRadius: 5 },
  distNum: { color: B.text2, fontSize: 12, width: 30, textAlign: "right" as any },
  medianTxt: { color: B.text4, fontSize: 11, marginTop: 6 },
  sellerCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 13, marginBottom: 8 },
  sellerCardTop: { borderColor: B.orange, backgroundColor: B.orangeBg },
  sellerHeader: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  sellerRank: { color: B.orange, fontSize: 14, fontWeight: "900" as any, width: 30 },
  sellerName: { color: B.text1, fontSize: 14, fontWeight: "800" as any, flex: 1 },
  sellerCount: { color: B.text3, fontSize: 12 },
  sellerPrice: { color: B.profit, fontSize: 13, fontWeight: "700" as any, marginBottom: 4 },
  sellerItem: { color: B.text4, fontSize: 11, lineHeight: 16 },
  again: { borderWidth: 1, borderColor: B.border2, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 6 },
  againTxt: { color: B.text2, fontSize: 13, fontWeight: "700" as any },
});
