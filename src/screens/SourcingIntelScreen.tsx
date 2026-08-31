import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

// Same canonical taxonomy the backend's moat query validates category
// against (lens/route.ts's validCats, sourcing-intel/route.ts's
// VALID_CATEGORIES) - a picker only ever emits one of these, so there's no
// more "clothes" vs "Clothing" typo/casing gap, and no free-text category
// can ever silently zero out the query the way an empty string did.
const CATEGORIES = ["Clothing","Shoes","Electronics","Tools","Collectibles","Handbags","Antiques","Jewelry","Toys","Home","Sports","Other"];

export default function SourcingIntelScreen({ token, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  async function run() {
    if (!itemName.trim()) { Alert.alert("Add an item", "Enter the item to analyze."); return; }
    // Belt-and-suspenders: the button is already disabled without a category
    // selected, but a query run with no category returns misleadingly thin
    // data ("not enough data") rather than an honest error, so this is
    // blocked outright rather than allowed to run and mislead.
    if (!category) { Alert.alert("Pick a category", "Select a category so we can find real market data for this item."); return; }
    setLoading(true); setData(null);
    try {
      const r = await fetch(`${API_BASE}/api/sourcing-intel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, category, token, analysisType: "full" }),
      });
      const d = await r.json();
      if (d.error === "upgrade_required") { Alert.alert("Pro feature", "Sourcing Intel is a Pro tool."); }
      else if (!d.success) { Alert.alert("Couldn't analyze", d.error || "Try again."); }
      else { setData(d); }
    } catch { Alert.alert("Error", "Check your connection and try again."); }
    setLoading(false);
  }

  const m = data?.marketData;
  const ratingColor = (r: string) => r === "great" ? C.green : r === "good" ? "#8fd14f" : r === "average" ? C.yellow : C.red;
  const riskColor = (r: string) => r === "Low" ? C.green : r === "Medium" ? C.yellow : C.red;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>🔬 Sourcing Intel</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sub}>Deep market brief on any item: demand, seasonality, authenticity risk, and where it's worth selling.</Text>

        <Text style={s.label}>Item *</Text>
        <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Levi's 501 vintage" placeholderTextColor={C.text4} autoCorrect={false} />

        <Text style={s.label}>Category *</Text>
        {!category && <Text style={s.categoryPrompt}>Select a category below</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} onPress={() => setCategory(cat)}
                style={[s.chip, category === cat && s.chipActive]}>
                <Text style={[s.chipTxt, category === cat && s.chipTxtActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[s.genBtn, (!itemName.trim() || !category) && s.genBtnDisabled]}
          onPress={run}
          disabled={loading || !itemName.trim() || !category}
        >
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Analyze Item</Text>}
        </TouchableOpacity>

        {data && (
          <View style={{ marginTop: 22 }}>
            {/* Market data */}
            {m && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Market Data</Text>
                {m.hasCrowd ? (
                  <>
                    <View style={s.statGrid}>
                      <View style={s.statBox}><Text style={s.statVal}>${m.medianSold}</Text><Text style={s.statLbl}>median sold</Text></View>
                      <View style={s.statBox}><Text style={s.statVal}>{m.sellThrough != null ? `${m.sellThrough}%` : "—"}</Text><Text style={s.statLbl}>sell-through</Text></View>
                      <View style={s.statBox}><Text style={[s.statVal,{textTransform:"capitalize"}]}>{m.velocity || "—"}</Text><Text style={s.statLbl}>velocity</Text></View>
                    </View>
                    <View style={s.statGrid}>
                      <View style={s.statBox}><Text style={s.statVal}>{m.priceLow != null ? `$${m.priceLow}-$${m.priceHigh}` : "—"}</Text><Text style={s.statLbl}>price range</Text></View>
                      <View style={s.statBox}><Text style={s.statVal}>{m.soldCount}</Text><Text style={s.statLbl}>real sales</Text></View>
                      <View style={s.statBox}><Text style={s.statVal}>{m.medianDaysLabel}</Text><Text style={s.statLbl}>days to sell</Text></View>
                    </View>
                    <Text style={s.dataSrc}>📊 From real ValuIQ reseller sales ({m.matchBasis})</Text>
                  </>
                ) : m.medianSold != null ? (
                  <>
                    <View style={s.statGrid}>
                      <View style={s.statBox}><Text style={s.statVal}>~${m.medianSold}</Text><Text style={s.statLbl}>AI estimate</Text></View>
                    </View>
                    <Text style={s.dataSrc}>🤖 AI estimate — limited real sales data yet for this item</Text>
                  </>
                ) : (
                  <Text style={s.line}>Not enough data yet to estimate this item's market. The analysis below still applies.</Text>
                )}
              </View>
            )}

            {/* Seasonality */}
            {data.currentSeasonRating && (
              <View style={s.card}>
                {/* MEASURED BUG: this row had no flex/shrink guard on either
                    side - data.currentSeasonRating is AI-generated text, not
                    a locally-validated short enum, so a longer-than-usual
                    value had nothing to shrink into and could push past the
                    card's right edge. Title stays fixed-width (it's always
                    "Seasonality"); the AI value gets the flexible/shrinkable
                    slot instead. */}
                <View style={[s.rowBetween, { gap: 8 }]}>
                  <Text style={[s.cardTitle, { flexShrink: 0, marginBottom: 0 }]}>Seasonality</Text>
                  <Text
                    style={[s.pill, { flexShrink: 1, textAlign: "right", color: ratingColor(data.currentSeasonRating), borderColor: ratingColor(data.currentSeasonRating) + "60" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {data.currentSeasonRating} now
                  </Text>
                </View>
                {data.seasonalInsight ? <Text style={s.insight}>{data.seasonalInsight}</Text> : null}
                {Array.isArray(data.bestMonthsToBuy) && <Text style={s.line}>📥 Buy: {data.bestMonthsToBuy.join(", ")}</Text>}
                {Array.isArray(data.bestMonthsToSell) && <Text style={s.line}>📤 Sell: {data.bestMonthsToSell.join(", ")}</Text>}
              </View>
            )}

            {/* Authenticity */}
            {data.authenticityRisk && (
              <View style={s.card}>
                {/* Same unbounded-row fix as Seasonality above - riskColor()
                    only special-cases "Low"/"Medium", so data.authenticityRisk
                    isn't guaranteed to be a short fixed word either. */}
                <View style={[s.rowBetween, { gap: 8 }]}>
                  <Text style={[s.cardTitle, { flexShrink: 0, marginBottom: 0 }]}>Authenticity Risk</Text>
                  <Text
                    style={[s.pill, { flexShrink: 1, textAlign: "right", color: riskColor(data.authenticityRisk), borderColor: riskColor(data.authenticityRisk) + "60" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {data.authenticityRisk}
                  </Text>
                </View>
                {Array.isArray(data.authChecks) && data.authChecks.map((c: string, i: number) => (
                  <Text key={i} style={s.line}>✓ {c}</Text>
                ))}
              </View>
            )}

            {/* FBA + supply + tip */}
            {(data.amazonFBAInsight || data.supplyNote || data.hotTip) && (
              <View style={s.card}>
                {data.amazonFBAInsight ? <Text style={s.line}>📦 Amazon FBA: {data.amazonFBAInsight}</Text> : null}
                {data.supplyNote ? <Text style={s.line}>📊 {data.supplyNote}</Text> : null}
                {data.hotTip ? <Text style={s.tip}>💡 {data.hotTip}</Text> : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: C.border, borderBottomWidth: 1 },
  navBack: { minWidth: 64, flexShrink: 0, paddingRight: 8 }, navBackText: { color: C.green, fontSize: 16, fontWeight: "600" },
  navTitle: { color: C.text1, fontSize: 18, fontWeight: "800" },
  sub: { color: C.text3, fontSize: 13, marginBottom: 16, lineHeight: 19 },
  label: { color: C.text3, fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.text1, fontSize: 15 },
  categoryPrompt: { color: C.text4, fontSize: 12, fontStyle: "italic", marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 10, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipTxt: { color: C.text3, fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: C.greenDark, fontWeight: "800" },
  genBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  genBtnDisabled: { backgroundColor: C.border, opacity: 0.6 },
  genTxt: { color: C.greenDark, fontSize: 16, fontWeight: "800" },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { color: C.text1, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: { fontSize: 12, fontWeight: "800", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, textTransform: "capitalize", overflow: "hidden" },
  statGrid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: C.bg, borderRadius: 8, padding: 10, alignItems: "center" },
  statVal: { color: C.text1, fontSize: 15, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 10, marginTop: 2, textAlign: "center" },
  dataSrc: { color: C.text4, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  insight: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  line: { color: C.text2, fontSize: 13, lineHeight: 20, marginTop: 2 },
  tip: { color: C.yellow, fontSize: 13, lineHeight: 19, marginTop: 8, fontWeight: "600" },
});
