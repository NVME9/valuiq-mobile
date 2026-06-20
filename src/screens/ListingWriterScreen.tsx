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

const PLATFORMS = ["eBay", "Poshmark", "Mercari", "Depop", "Etsy", "Facebook"];

export default function ListingWriterScreen({ token, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [platform, setPlatform] = useState("eBay");
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState<any>(null);

  async function generate() {
    if (!itemName.trim()) { Alert.alert("Add an item", "Enter at least the item name."); return; }
    setLoading(true); setListing(null);
    try {
      const r = await fetch(`${API_BASE}/api/listing-writer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName, brand, category, condition, size, color,
          platform, sellPrice: Number(sellPrice) || 0, notes, userToken: token,
        }),
      });
      const d = await r.json();
      if (d.error === "upgrade_required") {
        Alert.alert("Pro feature", "Listing Writer is a Pro tool. Upgrade to generate listings.");
      } else if (!d.success) {
        Alert.alert("Couldn't generate", d.error || "Try again.");
      } else {
        setListing(d.listing);
      }
    } catch {
      Alert.alert("Error", "Check your connection and try again.");
    }
    setLoading(false);
  }

  async function copy(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${label} copied to clipboard.`);
  }

  function copyAll() {
    if (!listing) return;
    const tags = (listing.hashtags || []).map((t: string) => (t.startsWith("#") ? t : "#" + t)).join(" ");
    copy(`${listing.title}\n\n${listing.description}\n\n${tags}`, "Full listing");
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>✍️ Listing Writer</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sub}>Fill in what you know — AI writes a platform-perfect listing you can paste straight in.</Text>

        {/* Platform picker */}
        <Text style={s.label}>Platform</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {PLATFORMS.map((p) => (
            <TouchableOpacity key={p} style={[s.plat, platform === p && s.platActive]} onPress={() => setPlatform(p)}>
              <Text style={[s.platTxt, platform === p && s.platTxtActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.label}>Item name *</Text>
        <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Carhartt Detroit Jacket" placeholderTextColor={C.text4} />

        <View style={s.row}>
          <View style={s.half}><Text style={s.label}>Brand</Text><TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="Carhartt" placeholderTextColor={C.text4} /></View>
          <View style={s.half}><Text style={s.label}>Category</Text><TextInput style={s.input} value={category} onChangeText={setCategory} placeholder="Jacket" placeholderTextColor={C.text4} /></View>
        </View>
        <View style={s.row}>
          <View style={s.half}><Text style={s.label}>Condition</Text><TextInput style={s.input} value={condition} onChangeText={setCondition} placeholder="Good (EUC)" placeholderTextColor={C.text4} /></View>
          <View style={s.half}><Text style={s.label}>Size</Text><TextInput style={s.input} value={size} onChangeText={setSize} placeholder="L" placeholderTextColor={C.text4} /></View>
        </View>
        <View style={s.row}>
          <View style={s.half}><Text style={s.label}>Color</Text><TextInput style={s.input} value={color} onChangeText={setColor} placeholder="Brown" placeholderTextColor={C.text4} /></View>
          <View style={s.half}><Text style={s.label}>List price</Text><TextInput style={s.input} value={sellPrice} onChangeText={setSellPrice} placeholder="65" keyboardType="numeric" placeholderTextColor={C.text4} /></View>
        </View>
        <Text style={s.label}>Notes (flaws, details)</Text>
        <TextInput style={[s.input, { height: 70 }]} value={notes} onChangeText={setNotes} placeholder="Small stain on left cuff, vintage 90s" placeholderTextColor={C.text4} multiline />

        <TouchableOpacity style={s.genBtn} onPress={generate} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Generate {platform} Listing</Text>}
        </TouchableOpacity>

        {listing && (
          <View style={s.result}>
            <View style={s.resultHead}>
              <Text style={s.resultTitle}>Your {platform} listing</Text>
              <TouchableOpacity onPress={copyAll}><Text style={s.copyAll}>Copy all</Text></TouchableOpacity>
            </View>

            <View style={s.block}>
              <View style={s.blockHead}><Text style={s.blockLabel}>TITLE</Text><TouchableOpacity onPress={() => copy(listing.title, "Title")}><Text style={s.copyBtn}>Copy</Text></TouchableOpacity></View>
              <Text style={s.blockText}>{listing.title}</Text>
            </View>

            <View style={s.block}>
              <View style={s.blockHead}><Text style={s.blockLabel}>DESCRIPTION</Text><TouchableOpacity onPress={() => copy(listing.description, "Description")}><Text style={s.copyBtn}>Copy</Text></TouchableOpacity></View>
              <Text style={s.blockText}>{listing.description}</Text>
            </View>

            {Array.isArray(listing.hashtags) && listing.hashtags.length > 0 && (
              <View style={s.block}>
                <View style={s.blockHead}><Text style={s.blockLabel}>HASHTAGS</Text><TouchableOpacity onPress={() => copy(listing.hashtags.map((t:string)=>t.startsWith("#")?t:"#"+t).join(" "), "Hashtags")}><Text style={s.copyBtn}>Copy</Text></TouchableOpacity></View>
                <Text style={s.blockText}>{listing.hashtags.map((t:string)=>t.startsWith("#")?t:"#"+t).join(" ")}</Text>
              </View>
            )}

            {listing.tip ? <Text style={s.tip}>💡 {listing.tip}</Text> : null}
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
  plat: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 },
  platActive: { backgroundColor: C.green, borderColor: C.green },
  platTxt: { color: C.text2, fontSize: 14, fontWeight: "700" },
  platTxtActive: { color: C.greenDark },
  genBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  genTxt: { color: C.greenDark, fontSize: 16, fontWeight: "800" },
  result: { marginTop: 24 },
  resultHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  resultTitle: { color: C.text1, fontSize: 17, fontWeight: "800" },
  copyAll: { color: C.green, fontSize: 14, fontWeight: "800" },
  block: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  blockLabel: { color: C.text4, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  copyBtn: { color: C.green, fontSize: 13, fontWeight: "700" },
  blockText: { color: C.text1, fontSize: 14, lineHeight: 21 },
  tip: { color: C.yellow, fontSize: 13, lineHeight: 19, marginTop: 4, fontWeight: "600" },
});
