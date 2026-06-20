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

export default function BundleBuilderScreen({ onBack }: Props) {
  const [items, setItems] = useState<{ name: string; price: string }[]>([{ name: "", price: "" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  function setItem(i: number, field: "name" | "price", val: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  }
  function addRow() { setItems((p) => [...p, { name: "", price: "" }]); }
  function removeRow(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  async function run() {
    const valid = items.filter((it) => it.name.trim());
    if (valid.length < 2) { Alert.alert("Add items", "Add at least 2 items to bundle."); return; }
    setLoading(true); setResult(null);
    try {
      const r = await fetch(`${API_BASE}/api/bundle-builder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: valid.map((it) => ({ name: it.name, price: Number(it.price) || 0 })) }),
      });
      const d = await r.json();
      if (!d.success) { Alert.alert("Couldn't build bundles", d.error || "Try again."); }
      else { setResult(d); }
    } catch { Alert.alert("Error", "Check your connection and try again."); }
    setLoading(false);
  }
  async function copy(text: string) { await Clipboard.setStringAsync(text); Alert.alert("Copied", "Listing copied."); }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>📦 Bundle Builder</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sub}>Add your stuck items — AI groups them into bundles that move fast.</Text>

        {items.map((it, i) => (
          <View key={i} style={s.itemRow}>
            <TextInput style={[s.input, { flex: 2 }]} value={it.name} onChangeText={(v) => setItem(i, "name", v)} placeholder={`Item ${i + 1}`} placeholderTextColor={C.text4} />
            <TextInput style={[s.input, { flex: 1 }]} value={it.price} onChangeText={(v) => setItem(i, "price", v)} placeholder="$" keyboardType="numeric" placeholderTextColor={C.text4} />
            {items.length > 1 && <TouchableOpacity onPress={() => removeRow(i)} style={s.removeBtn}><Text style={s.removeTxt}>✕</Text></TouchableOpacity>}
          </View>
        ))}
        <TouchableOpacity onPress={addRow} style={s.addBtn}><Text style={s.addTxt}>+ Add item</Text></TouchableOpacity>

        <TouchableOpacity style={s.genBtn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Build Bundles</Text>}
        </TouchableOpacity>

        {result && (
          <View style={{ marginTop: 22 }}>
            {result.strategy ? <Text style={s.strategy}>🎯 {result.strategy}</Text> : null}

            {Array.isArray(result.bundles) && result.bundles.map((b: any, i: number) => (
              <View key={i} style={s.card}>
                <Text style={s.bundleName}>{b.name}</Text>
                {Array.isArray(b.items) ? <Text style={s.bundleItems}>{b.items.join(" + ")}</Text> : null}
                <View style={s.priceRow}>
                  {b.individualTotal ? <Text style={s.strike}>${b.individualTotal}</Text> : null}
                  <Text style={s.bundlePrice}>${b.bundlePrice}</Text>
                  {b.savings ? <Text style={s.savings}>save ${b.savings}</Text> : null}
                </View>
                {b.rationale ? <Text style={s.rationale}>{b.rationale}</Text> : null}
                <View style={s.metaRow}>
                  {b.platform ? <Text style={s.meta}>📍 {b.platform}</Text> : null}
                  {b.expectedDaysToSell ? <Text style={s.meta}>⏱ {b.expectedDaysToSell}</Text> : null}
                </View>
                {b.title ? (
                  <TouchableOpacity style={s.copyRow} onPress={() => copy(`${b.title}\n\n${b.description || ""}`)}>
                    <Text style={s.copyTxt}>Copy listing →</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            {Array.isArray(result.soloItems) && result.soloItems.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Sell these solo</Text>
                {result.soloItems.map((so: any, i: number) => (
                  <Text key={i} style={s.soloLine}>• {so.item} — {so.platform} ${so.suggestedPrice} ({so.reason})</Text>
                ))}
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
  itemRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  input: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.text1, fontSize: 15 },
  removeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  removeTxt: { color: C.text4, fontSize: 16 },
  addBtn: { paddingVertical: 8 },
  addTxt: { color: C.green, fontSize: 14, fontWeight: "700" },
  genBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 16 },
  genTxt: { color: C.greenDark, fontSize: 16, fontWeight: "800" },
  strategy: { color: C.yellow, fontSize: 14, fontWeight: "700", marginBottom: 14, lineHeight: 20 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { color: C.text1, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  bundleName: { color: C.text1, fontSize: 16, fontWeight: "800", marginBottom: 4 },
  bundleItems: { color: C.text3, fontSize: 13, marginBottom: 8 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  strike: { color: C.text4, fontSize: 14, textDecorationLine: "line-through" },
  bundlePrice: { color: C.green, fontSize: 20, fontWeight: "900" },
  savings: { color: C.green, fontSize: 13, fontWeight: "700" },
  rationale: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  metaRow: { flexDirection: "row", gap: 16, marginBottom: 4 },
  meta: { color: C.text3, fontSize: 12 },
  copyRow: { marginTop: 6 },
  copyTxt: { color: C.green, fontSize: 14, fontWeight: "700" },
  soloLine: { color: C.text2, fontSize: 13, lineHeight: 20, marginBottom: 4 },
});
