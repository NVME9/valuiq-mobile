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

export default function SourcingIntelScreen({ token, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  async function run() {
    if (!itemName.trim()) { Alert.alert("Add an item", "Enter the item to analyze."); return; }
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
        <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Levi's 501 vintage" placeholderTextColor={C.text4} />
        <Text style={s.label}>Category</Text>
        <TextInput style={s.input} value={category} onChangeText={setCategory} placeholder="Clothing" placeholderTextColor={C.text4} />

        <TouchableOpacity style={s.genBtn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Analyze Item</Text>}
        </TouchableOpacity>

        {data && (
          <View style={{ marginTop: 22 }}>
            {/* Market data */}
            {m && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Market Data</Text>
                <View style={s.statGrid}>
                  <View style={s.statBox}><Text style={s.statVal}>${m.medianSold}</Text><Text style={s.statLbl}>median sold</Text></View>
                  <View style={s.statBox}><Text style={s.statVal}>{m.sellThrough}%</Text><Text style={s.statLbl}>sell-through</Text></View>
                  <View style={s.statBox}><Text style={[s.statVal,{textTransform:"capitalize"}]}>{m.velocity}</Text><Text style={s.statLbl}>velocity</Text></View>
                </View>
                <View style={s.statGrid}>
                  <View style={s.statBox}><Text style={s.statVal}>${m.lowestActive}</Text><Text style={s.statLbl}>lowest active</Text></View>
                  <View style={s.statBox}><Text style={s.statVal}>{m.soldCount}</Text><Text style={s.statLbl}>recent sold</Text></View>
                  <View style={s.statBox}><Text style={[s.statVal,{textTransform:"capitalize"}]}>{m.trend}</Text><Text style={s.statLbl}>price trend</Text></View>
                </View>
              </View>
            )}

            {/* Seasonality */}
            {data.currentSeasonRating && (
              <View style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle}>Seasonality</Text>
                  <Text style={[s.pill, { color: ratingColor(data.currentSeasonRating), borderColor: ratingColor(data.currentSeasonRating) + "60" }]}>{data.currentSeasonRating} now</Text>
                </View>
                {data.seasonalInsight ? <Text style={s.insight}>{data.seasonalInsight}</Text> : null}
                {Array.isArray(data.bestMonthsToBuy) && <Text style={s.line}>📥 Buy: {data.bestMonthsToBuy.join(", ")}</Text>}
                {Array.isArray(data.bestMonthsToSell) && <Text style={s.line}>📤 Sell: {data.bestMonthsToSell.join(", ")}</Text>}
              </View>
            )}

            {/* Authenticity */}
            {data.authenticityRisk && (
              <View style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle}>Authenticity Risk</Text>
                  <Text style={[s.pill, { color: riskColor(data.authenticityRisk), borderColor: riskColor(data.authenticityRisk) + "60" }]}>{data.authenticityRisk}</Text>
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
  navBack: { width: 50 }, navBackText: { color: C.green, fontSize: 16, fontWeight: "600" },
  navTitle: { color: C.text1, fontSize: 18, fontWeight: "800" },
  sub: { color: C.text3, fontSize: 13, marginBottom: 16, lineHeight: 19 },
  label: { color: C.text3, fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.text1, fontSize: 15 },
  genBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  genTxt: { color: C.greenDark, fontSize: 16, fontWeight: "800" },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { color: C.text1, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: { fontSize: 12, fontWeight: "800", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, textTransform: "capitalize", overflow: "hidden" },
  statGrid: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: C.bg, borderRadius: 8, padding: 10, alignItems: "center" },
  statVal: { color: C.text1, fontSize: 15, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 10, marginTop: 2, textAlign: "center" },
  insight: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  line: { color: C.text2, fontSize: 13, lineHeight: 20, marginTop: 2 },
  tip: { color: C.yellow, fontSize: 13, lineHeight: 19, marginTop: 8, fontWeight: "600" },
});
