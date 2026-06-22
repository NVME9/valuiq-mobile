import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token: string; onBack: () => void; }
const CATEGORIES = ["electronics", "clothing", "tools", "kitchen", "collectibles", "toys"];
const GRADES = ["A", "B", "C", "D", "Unknown"];

export default function VendorIntel({ token, onBack }: Props) {
  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState("electronics");
  const [grade, setGrade] = useState("B");
  const [claimedRetailValue, setClaimed] = useState("");
  const [askingPrice, setAsking] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!vendorName.trim() || !claimedRetailValue || !askingPrice) {
      setError("Enter vendor, claimed value, and asking price."); return;
    }
    setLoading(true); setError(null); setRes(null);
    try {
      const r = await fetch(`${API_BASE}/api/business/vendor-intel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, vendorName, category, grade, claimedRetailValue, askingPrice }),
      });
      const d = await r.json();
      if (d.success) setRes(d);
      else setError(d.error === "upgrade_required" ? "Titan plan required." : (d.error || "Analysis failed."));
    } catch { setError("Could not reach analysis service."); }
    setLoading(false);
  }

  const money = (n: number) => "$" + (Math.round(n) || 0).toLocaleString();
  const verdictColor = (v: string) => v === "BUY" ? B.profit : v === "AVOID" ? B.loss : B.warning;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>Vendor Intelligence</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {!res && (
            <View style={s.hero}>
              <Text style={s.heroTitle}>Know if a vendor over-grades before you wire money</Text>
              <Text style={s.heroSub}>Most liquidation vendors over-state grade and value. Enter the lot details and get the realistic value, over-grade %, and a buy/negotiate/avoid verdict.</Text>
            </View>
          )}

          {/* Form */}
          <View style={s.form}>
            <Text style={s.lbl}>Vendor</Text>
            <TextInput style={s.input} value={vendorName} onChangeText={setVendorName}
              placeholder="B-Stock, BULQ, Liquidation.com, GovDeals..." placeholderTextColor={B.text4} />

            <Text style={s.lbl}>Category</Text>
            <View style={s.chips}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, category === c && s.chipOn]} onPress={() => setCategory(c)}>
                  <Text style={[s.chipTxt, category === c && s.chipTxtOn]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.lbl}>Manifest Grade</Text>
            <View style={s.chips}>
              {GRADES.map(g => (
                <TouchableOpacity key={g} style={[s.chip, grade === g && s.chipOn]} onPress={() => setGrade(g)}>
                  <Text style={[s.chipTxt, grade === g && s.chipTxtOn]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.row}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={s.lbl}>Claimed Retail $</Text>
                <TextInput style={s.input} value={claimedRetailValue} onChangeText={setClaimed} keyboardType="numeric" placeholder="5000" placeholderTextColor={B.text4} />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={s.lbl}>Asking Price $</Text>
                <TextInput style={s.input} value={askingPrice} onChangeText={setAsking} keyboardType="numeric" placeholder="1500" placeholderTextColor={B.text4} />
              </View>
            </View>

            {error ? <Text style={s.err}>{error}</Text> : null}
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={analyze} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnTxt}>Analyze This Lot</Text>}
            </TouchableOpacity>
          </View>

          {/* Result */}
          {res && (
            <View style={{ marginTop: 18 }}>
              <View style={[s.verdictCard, { borderColor: verdictColor(res.analysis?.verdict) + "60" }]}>
                <Text style={[s.verdictTxt, { color: verdictColor(res.analysis?.verdict) }]}>{res.analysis?.verdict || "ANALYZED"}</Text>
                <Text style={s.verdictSub}>{res.analysis?.riskLevel ? res.analysis.riskLevel + " risk" : ""}{res.analysis?.confidence ? " - " + res.analysis.confidence + " confidence" : ""}</Text>
              </View>

              {res.warning ? <Text style={s.warn}>{res.warning}</Text> : null}

              <View style={s.statGrid}>
                <View style={s.stat}><Text style={[s.statVal, { color: B.loss }]}>{res.financials.overgradePercent}%</Text><Text style={s.statLbl}>Over-graded</Text></View>
                <View style={s.stat}><Text style={[s.statVal, { color: B.text1 }]}>{money(res.financials.realisticValue)}</Text><Text style={s.statLbl}>Realistic Value</Text></View>
                <View style={s.stat}><Text style={[s.statVal, { color: res.financials.realisticROI >= 20 ? B.profit : res.financials.realisticROI >= 0 ? B.warning : B.loss }]}>{res.financials.realisticROI}%</Text><Text style={s.statLbl}>Real ROI</Text></View>
                <View style={s.stat}><Text style={[s.statVal, { color: B.orange }]}>{res.vendorTrustScore}%</Text><Text style={s.statLbl}>Vendor Trust</Text></View>
              </View>

              <View style={s.priceCard}>
                <View style={s.priceRow}><Text style={s.priceLbl}>They're asking</Text><Text style={s.priceVal}>{money(res.financials.askingPrice)}</Text></View>
                <View style={s.priceRow}><Text style={[s.priceLbl, { color: B.orange }]}>Counter-offer at</Text><Text style={[s.priceVal, { color: B.orange }]}>{money(res.analysis?.negotiationTarget || res.financials.breakEvenPrice)}</Text></View>
                <View style={s.priceRow}><Text style={[s.priceLbl, { color: B.loss }]}>Walk away above</Text><Text style={[s.priceVal, { color: B.loss }]}>{money(res.analysis?.walkAwayPrice || res.financials.maxBidPrice)}</Text></View>
              </View>

              {res.analysis?.redFlags?.length ? (
                <View style={s.flagCard}>
                  <Text style={[s.flagTit, { color: B.loss }]}>Red Flags</Text>
                  {res.analysis.redFlags.map((f: string, i: number) => <Text key={i} style={s.flagItem}>- {f}</Text>)}
                </View>
              ) : null}

              {res.analysis?.greenFlags?.length ? (
                <View style={s.flagCard}>
                  <Text style={[s.flagTit, { color: B.profit }]}>Green Flags</Text>
                  {res.analysis.greenFlags.map((f: string, i: number) => <Text key={i} style={s.flagItem}>- {f}</Text>)}
                </View>
              ) : null}

              {res.analysis?.expertTip ? (
                <View style={s.tipCard}><Text style={s.tipTxt}>{res.analysis.expertTip}</Text></View>
              ) : null}

              {res.communityIntel?.totalReports > 0 ? (
                <Text style={s.community}>{res.communityIntel.totalReports} community reports{res.communityIntel.avgROI !== null ? ` - avg ROI ${res.communityIntel.avgROI}%` : ""}</Text>
              ) : null}

              <TouchableOpacity style={s.again} onPress={() => setRes(null)}><Text style={s.againTxt}>Analyze Another Lot</Text></TouchableOpacity>
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
  lbl: { color: B.text2, fontSize: 12, fontWeight: "700" as any, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: B.bg, borderWidth: 1, borderColor: B.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: B.text1, fontSize: 14 },
  row: { flexDirection: "row" },
  chips: { flexDirection: "row", flexWrap: "wrap" as any, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: B.border2, backgroundColor: B.bg },
  chipOn: { backgroundColor: B.orangeBg, borderColor: B.orange },
  chipTxt: { color: B.text3, fontSize: 12, fontWeight: "600" as any, textTransform: "capitalize" as any },
  chipTxtOn: { color: B.orange, fontWeight: "800" as any },
  err: { color: B.loss, fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: B.orange, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 16 },
  btnTxt: { color: "#000", fontSize: 14, fontWeight: "900" as any },
  verdictCard: { backgroundColor: B.surface, borderWidth: 2, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 12 },
  verdictTxt: { fontSize: 30, fontWeight: "900" as any, letterSpacing: 1 },
  verdictSub: { color: B.text3, fontSize: 12, marginTop: 4, textTransform: "capitalize" as any },
  warn: { color: B.warning, fontSize: 13, backgroundColor: "#1a1400", borderWidth: 1, borderColor: "#ffcc0040", borderRadius: 10, padding: 12, marginBottom: 12, lineHeight: 18 },
  statGrid: { flexDirection: "row", flexWrap: "wrap" as any, gap: 8, marginBottom: 12 },
  stat: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, width: "48%" as any },
  statVal: { fontSize: 22, fontWeight: "900" as any }, statLbl: { color: B.text3, fontSize: 11, marginTop: 3 },
  priceCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 12 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  priceLbl: { color: B.text2, fontSize: 13, fontWeight: "600" as any }, priceVal: { color: B.text1, fontSize: 17, fontWeight: "900" as any },
  flagCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  flagTit: { fontSize: 13, fontWeight: "800" as any, marginBottom: 8 },
  flagItem: { color: B.text2, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  tipCard: { backgroundColor: B.orangeBg, borderWidth: 1, borderColor: B.orangeBorder, borderRadius: 12, padding: 14, marginBottom: 10 },
  tipTxt: { color: B.text1, fontSize: 13, lineHeight: 19, fontStyle: "italic" as any },
  community: { color: B.text4, fontSize: 11, textAlign: "center" as any, marginBottom: 12 },
  again: { borderWidth: 1, borderColor: B.border2, borderRadius: 12, padding: 14, alignItems: "center" },
  againTxt: { color: B.text2, fontSize: 13, fontWeight: "700" as any },
});
