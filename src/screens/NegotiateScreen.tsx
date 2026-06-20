import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

export default function NegotiateScreen({ onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [platform, setPlatform] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!itemName.trim() || !askingPrice.trim()) { Alert.alert("Add details", "Enter the item and asking price."); return; }
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API_BASE}/api/negotiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName, askingPrice: Number(askingPrice) || 0, sellPrice: Number(sellPrice) || 0, platform }),
      });
      const d = await r.json();
      if (!d.success) { Alert.alert("Couldn't generate", d.error || "Try again."); }
      else { setResult(d); }
    } catch { Alert.alert("Error", "Check your connection and try again."); }
    setLoading(false);
  }
  async function copy(text: string) { await Clipboard.setStringAsync(text); Alert.alert("Copied", "Script copied."); }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>🤝 Negotiator</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sub}>Get the exact words to talk a seller down — plus your target and walk-away price.</Text>

        <Text style={s.label}>Item *</Text>
        <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Vintage Pyrex set" placeholderTextColor={C.text4} />
        <View style={s.row}>
          <View style={s.half}><Text style={s.label}>Asking price *</Text><TextInput style={s.input} value={askingPrice} onChangeText={setAskingPrice} placeholder="40" keyboardType="numeric" placeholderTextColor={C.text4} /></View>
          <View style={s.half}><Text style={s.label}>It sells for</Text><TextInput style={s.input} value={sellPrice} onChangeText={setSellPrice} placeholder="120" keyboardType="numeric" placeholderTextColor={C.text4} /></View>
        </View>

        <TouchableOpacity style={s.genBtn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Get Negotiation Scripts</Text>}
        </TouchableOpacity>

        {result && (
          <View style={{ marginTop: 22 }}>
            <View style={s.priceRow}>
              <View style={s.priceCard}><Text style={s.priceLbl}>Target offer</Text><Text style={[s.priceVal,{color:C.green}]}>${result.targetOffer}</Text></View>
              <View style={s.priceCard}><Text style={s.priceLbl}>Walk away above</Text><Text style={[s.priceVal,{color:C.red}]}>${result.walkAwayPrice}</Text></View>
            </View>

            {Array.isArray(result.scripts) && result.scripts.map((sc: any, i: number) => (
              <View key={i} style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardName}>{i + 1}. {sc.name}</Text>
                  <TouchableOpacity onPress={() => copy(sc.say)}><Text style={s.copyBtn}>Copy</Text></TouchableOpacity>
                </View>
                {sc.when ? <Text style={s.when}>{sc.when}</Text> : null}
                <Text style={s.sayLabel}>Say:</Text>
                <Text style={s.say}>"{sc.say}"</Text>
                {sc.body_language ? <Text style={s.extra}>🧍 {sc.body_language}</Text> : null}
                {sc.if_they_say_no ? <Text style={s.extra}>↩️ If they say no: "{sc.if_they_say_no}"</Text> : null}
              </View>
            ))}
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
  priceRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  priceCard: { flex: 1, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  priceLbl: { color: C.text4, fontSize: 12, marginBottom: 4 },
  priceVal: { fontSize: 22, fontWeight: "900" },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardName: { color: C.text1, fontSize: 15, fontWeight: "800" },
  copyBtn: { color: C.green, fontSize: 13, fontWeight: "700" },
  when: { color: C.text4, fontSize: 12, marginBottom: 8, fontStyle: "italic" },
  sayLabel: { color: C.text4, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: 4 },
  say: { color: C.text1, fontSize: 15, lineHeight: 22, marginBottom: 8, marginTop: 2 },
  extra: { color: C.text3, fontSize: 13, lineHeight: 19, marginTop: 4 },
});
