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

export default function PriceBattleScreen({ token, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!itemName.trim()) { Alert.alert("Add an item", "Enter at least the item name."); return; }
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API_BASE}/api/price-battle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, brand, category, condition, buyPrice: Number(buyPrice) || 0, userToken: token }),
      });
      const d = await r.json();
      if (d.error === "upgrade_required") { Alert.alert("Pro feature", "Price Battle is a Pro tool."); }
      else if (!d.success) { Alert.alert("Couldn't analyze", d.error || "Try again."); }
      else { setResult(d); }
    } catch { Alert.alert("Error", "Check your connection and try again."); }
    setLoading(false);
  }

  const platforms = (result?.platforms || []).slice().sort((a: any, b: any) => (b.netProfit || 0) - (a.netProfit || 0));
  const best = result?.bestPlatform;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>⚔️ Price Battle</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sub}>See which platform pays the most for your item after fees. Best net profit wins.</Text>

        <Text style={s.label}>Item name *</Text>
        <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Nike Dunk Low Panda" placeholderTextColor={C.text4} />
        <View style={s.row}>
          <View style={s.half}><Text style={s.label}>Brand</Text><TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="Nike" placeholderTextColor={C.text4} /></View>
          <View style={s.half}><Text style={s.label}>Category</Text><TextInput style={s.input} value={category} onChangeText={setCategory} placeholder="Shoes" placeholderTextColor={C.text4} /></View>
        </View>
        <View style={s.row}>
          <View style={s.half}><Text style={s.label}>Condition</Text><TextInput style={s.input} value={condition} onChangeText={setCondition} placeholder="New" placeholderTextColor={C.text4} /></View>
          <View style={s.half}><Text style={s.label}>You paid</Text><TextInput style={s.input} value={buyPrice} onChangeText={setBuyPrice} placeholder="45" keyboardType="numeric" placeholderTextColor={C.text4} /></View>
        </View>

        <TouchableOpacity style={s.genBtn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Run Price Battle</Text>}
        </TouchableOpacity>

        {result && platforms.length > 0 && (
          <View style={{ marginTop: 22 }}>
            {best ? <Text style={s.winner}>🏆 Best net profit: {best}</Text> : null}
            {platforms.map((p: any, i: number) => {
              const isBest = p.platform === best || i === 0;
              return (
                <View key={i} style={[s.pCard, isBest && s.pCardBest]}>
                  <View style={s.pTop}>
                    <Text style={[s.pName, isBest && { color: C.green }]}>{p.platform}{isBest ? " 🏆" : ""}</Text>
                    <Text style={[s.pNet, { color: (p.netProfit || 0) > 0 ? C.green : C.red }]}>
                      {(p.netProfit || 0) >= 0 ? "+" : ""}${p.netProfit} net
                    </Text>
                  </View>
                  <View style={s.pStats}>
                    <Text style={s.pStat}>Sells: <Text style={s.pVal}>${p.sellPrice}</Text></Text>
                    <Text style={s.pStat}>Fees: <Text style={s.pVal}>${p.fees}</Text></Text>
                  </View>
                </View>
              );
            })}
            <Text style={s.footnote}>Prices reflect median sold data after each platform's fees. Verify current comps before listing.</Text>
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
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  genBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  genTxt: { color: C.greenDark, fontSize: 16, fontWeight: "800" },
  winner: { color: C.yellow, fontSize: 15, fontWeight: "800", marginBottom: 14 },
  pCard: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  pCardBest: { borderColor: C.greenBorder, backgroundColor: "#0e1a12" },
  pTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  pName: { color: C.text1, fontSize: 16, fontWeight: "800" },
  pNet: { fontSize: 16, fontWeight: "800" },
  pStats: { flexDirection: "row", gap: 20 },
  pStat: { color: C.text3, fontSize: 13 },
  pVal: { color: C.text1, fontWeight: "700" },
  footnote: { color: C.text4, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18, fontStyle: "italic" },
});
