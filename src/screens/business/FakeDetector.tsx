import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, TextInput, Image, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token: string; onBack: () => void; }

export default function FakeDetector({ token, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickImage() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaType.Images, allowsEditing: false, quality: 0.8, base64: true });
    if (r.canceled || !r.assets?.[0]) return;
    setImageB64(r.assets[0].base64 || null); setImageUri(r.assets[0].uri);
  }

  async function analyze() {
    if (!imageB64 && !itemName.trim()) { setError("Add a photo or an item name."); return; }
    setLoading(true); setError(null); setRes(null);
    try {
      const r = await fetch(`${API_BASE}/api/business/authenticate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imageBase64: imageB64, itemName, brand, mimeType: "image/jpeg" }),
      });
      const d = await r.json();
      if (d.success) setRes(d);
      else setError(d.error === "upgrade_required" ? "Titan plan required." : (d.error || "Analysis failed."));
    } catch { setError("Could not reach authentication service."); }
    setLoading(false);
  }

  const a = res?.authentication || {};
  const verdict = a.overallVerdict || "";
  const vColor = verdict.includes("AUTHENTIC") ? B.profit : verdict.includes("FAKE") ? B.loss : verdict.includes("SUSPICIOUS") ? B.warning : B.text2;
  const vLabel = (verdict || "ANALYZED").replace(/_/g, " ");

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>Fake Detector</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {!res && (
            <View style={s.hero}>
              <Text style={s.heroTitle}>Authenticate before you list</Text>
              <Text style={s.heroSub}>Selling a fake — even unknowingly — can get your account banned. Add a photo and we'll flag the authentication markers, red flags, and a verdict.</Text>
            </View>
          )}

          <View style={s.form}>
            <TouchableOpacity style={s.photoBtn} onPress={pickImage}>
              {imageUri ? <Image source={{ uri: imageUri }} style={s.preview} /> : <Text style={s.photoTxt}>+ Add Photo</Text>}
            </TouchableOpacity>

            <Text style={s.lbl}>Item name {imageB64 ? "(optional)" : "(required if no photo)"}</Text>
            <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Louis Vuitton Neverfull, Jordan 1..." placeholderTextColor={B.text4} />

            <Text style={s.lbl}>Brand (optional)</Text>
            <TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="Louis Vuitton, Nike..." placeholderTextColor={B.text4} />

            {error ? <Text style={s.err}>{error}</Text> : null}
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={analyze} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnTxt}>Authenticate</Text>}
            </TouchableOpacity>
          </View>

          {res && (
            <View style={{ marginTop: 18 }}>
              <View style={[s.verdictCard, { borderColor: vColor + "60" }]}>
                <Text style={[s.verdictTxt, { color: vColor }]}>{vLabel}</Text>
                {a.confidenceScore != null ? <Text style={s.verdictSub}>{a.confidenceScore}% confidence · {res.warningLevel} risk</Text> : null}
              </View>

              {res.recommendation ? <View style={s.recCard}><Text style={s.recTxt}>{res.recommendation}</Text></View> : null}

              {(a.authenticityMarkers || []).length ? (
                <>
                  <Text style={s.secTit}>WHAT TO CHECK</Text>
                  {a.authenticityMarkers.map((m: any, i: number) => (
                    <View key={i} style={s.markerCard}>
                      <View style={s.markerHead}>
                        <Text style={s.markerLoc}>{m.location}</Text>
                        {m.importance ? <Text style={[s.markerImp, { color: m.importance === "critical" ? B.loss : m.importance === "important" ? B.orange : B.text3 }]}>{m.importance}</Text> : null}
                      </View>
                      <Text style={s.markerCheck}>{m.whatToCheck}</Text>
                    </View>
                  ))}
                </>
              ) : null}

              {(a.redFlags || []).length ? (
                <View style={s.flagCard}>
                  <Text style={[s.flagTit, { color: B.loss }]}>Red Flags</Text>
                  {a.redFlags.map((f: string, i: number) => <Text key={i} style={s.flagItem}>- {f}</Text>)}
                </View>
              ) : null}

              {(a.commonFakeVersions || []).length ? (
                <View style={s.flagCard}>
                  <Text style={[s.flagTit, { color: B.warning }]}>Common Fakes to Watch</Text>
                  {a.commonFakeVersions.map((f: string, i: number) => <Text key={i} style={s.flagItem}>- {f}</Text>)}
                </View>
              ) : null}

              {a.bestAuthenticationMethod ? <View style={s.methodCard}><Text style={s.methodLbl}>Best verification method</Text><Text style={s.methodTxt}>{a.bestAuthenticationMethod}</Text></View> : null}
              {a.expertNote ? <View style={s.tipCard}><Text style={s.tipTxt}>{a.expertNote}</Text></View> : null}

              <Text style={s.disclaimer}>AI authentication is a screening aid, not a guarantee. For high-value items, use a professional authentication service.</Text>
              <TouchableOpacity style={s.again} onPress={() => { setRes(null); setImageB64(null); setImageUri(null); }}><Text style={s.againTxt}>Check Another Item</Text></TouchableOpacity>
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
  photoBtn: { backgroundColor: B.bg, borderWidth: 1.5, borderColor: B.border2, borderStyle: "dashed" as any, borderRadius: 12, height: 160, alignItems: "center", justifyContent: "center", marginBottom: 6, overflow: "hidden" },
  photoTxt: { color: B.text3, fontSize: 14, fontWeight: "700" as any },
  preview: { width: "100%" as any, height: "100%" as any },
  lbl: { color: B.text2, fontSize: 12, fontWeight: "700" as any, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: B.bg, borderWidth: 1, borderColor: B.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: B.text1, fontSize: 14 },
  err: { color: B.loss, fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: B.orange, borderRadius: 12, padding: 15, alignItems: "center", marginTop: 16 },
  btnTxt: { color: "#000", fontSize: 14, fontWeight: "900" as any },
  verdictCard: { backgroundColor: B.surface, borderWidth: 2, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 12 },
  verdictTxt: { fontSize: 24, fontWeight: "900" as any, letterSpacing: 0.5, textAlign: "center" as any },
  verdictSub: { color: B.text3, fontSize: 12, marginTop: 4 },
  recCard: { backgroundColor: B.orangeBg, borderWidth: 1, borderColor: B.orangeBorder, borderRadius: 12, padding: 14, marginBottom: 12 },
  recTxt: { color: B.text1, fontSize: 14, lineHeight: 20, fontWeight: "600" as any },
  secTit: { color: B.text3, fontSize: 12, fontWeight: "800" as any, letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  markerCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 13, marginBottom: 8 },
  markerHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  markerLoc: { color: B.text1, fontSize: 13, fontWeight: "800" as any, flex: 1 },
  markerImp: { fontSize: 10, fontWeight: "800" as any, textTransform: "uppercase" as any },
  markerCheck: { color: B.text2, fontSize: 13, lineHeight: 18 },
  flagCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  flagTit: { fontSize: 13, fontWeight: "800" as any, marginBottom: 8 },
  flagItem: { color: B.text2, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  methodCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  methodLbl: { color: B.text4, fontSize: 11, fontWeight: "700" as any, marginBottom: 4 },
  methodTxt: { color: B.text1, fontSize: 13, lineHeight: 19 },
  tipCard: { backgroundColor: B.orangeBg, borderWidth: 1, borderColor: B.orangeBorder, borderRadius: 12, padding: 14, marginBottom: 10 },
  tipTxt: { color: B.text1, fontSize: 13, lineHeight: 19, fontStyle: "italic" as any },
  disclaimer: { color: B.text4, fontSize: 10, lineHeight: 15, fontStyle: "italic" as any, marginBottom: 12 },
  again: { borderWidth: 1, borderColor: B.border2, borderRadius: 12, padding: 14, alignItems: "center" },
  againTxt: { color: B.text2, fontSize: 13, fontWeight: "700" as any },
});
