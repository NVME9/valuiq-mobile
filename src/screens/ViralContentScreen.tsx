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

const TABS = ["TikTok", "Instagram", "Twitter/X", "Reddit"];

export default function ViralContentScreen({ token, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<any>(null);
  const [tab, setTab] = useState("TikTok");
  const [best, setBest] = useState("");

  async function generate() {
    if (!itemName.trim()) { Alert.alert("Add an item", "Enter the item you flipped."); return; }
    const bp = Number(buyPrice) || 0, sp = Number(sellPrice) || 0;
    const profit = Math.round(sp * 0.87 - bp);
    const roi = bp > 0 ? Math.round((profit / bp) * 100) : 0;
    setLoading(true); setContent(null);
    try {
      const r = await fetch(`${API_BASE}/api/viral-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, itemName, profit, roi, buyPrice: bp, sellPrice: sp, platform: "all", category }),
      });
      const d = await r.json();
      if (!d.success) { Alert.alert("Couldn't generate", d.error || "Try again."); }
      else { setContent(d.content); setBest(d.content?.bestPlatform || ""); }
    } catch {
      Alert.alert("Error", "Check your connection and try again.");
    }
    setLoading(false);
  }

  async function copy(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${label} copied. Go post it!`);
  }
  const tags = (arr: string[]) => (arr || []).map((t) => (t.startsWith("#") ? t : "#" + t)).join(" ");

  function CopyBlock({ label, text }: { label: string; text: string }) {
    if (!text) return null;
    return (
      <View style={s.block}>
        <View style={s.blockHead}><Text style={s.blockLabel}>{label}</Text><TouchableOpacity onPress={() => copy(text, label)}><Text style={s.copyBtn}>Copy</Text></TouchableOpacity></View>
        <Text style={s.blockText}>{text}</Text>
      </View>
    );
  }

  const c = content || {};

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>📱 Viral Content</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={s.sub}>Turn a flip into ready-to-post content for every platform. Tap, copy, post.</Text>

        <Text style={s.label}>What did you flip?</Text>
        <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="Vintage Carhartt jacket" placeholderTextColor={C.text4} />
        <View style={s.row}>
          <View style={s.third}><Text style={s.label}>Paid</Text><TextInput style={s.input} value={buyPrice} onChangeText={setBuyPrice} placeholder="8" keyboardType="numeric" placeholderTextColor={C.text4} /></View>
          <View style={s.third}><Text style={s.label}>Sold</Text><TextInput style={s.input} value={sellPrice} onChangeText={setSellPrice} placeholder="145" keyboardType="numeric" placeholderTextColor={C.text4} /></View>
          <View style={s.third}><Text style={s.label}>Category</Text><TextInput style={s.input} value={category} onChangeText={setCategory} placeholder="Clothing" placeholderTextColor={C.text4} /></View>
        </View>

        <TouchableOpacity style={s.genBtn} onPress={generate} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.genTxt}>Generate Content</Text>}
        </TouchableOpacity>

        {content && (
          <View style={{ marginTop: 22 }}>
            {best ? <Text style={s.best}>🔥 Best for this find: {best}</Text> : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
              {TABS.map((t) => (
                <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
                  <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {tab === "TikTok" && c.tiktok && (
              <>
                <CopyBlock label="HOOK" text={c.tiktok.hook} />
                <CopyBlock label="SCRIPT" text={c.tiktok.script} />
                <CopyBlock label="CAPTION" text={c.tiktok.caption} />
                <CopyBlock label="HASHTAGS" text={tags(c.tiktok.hashtags)} />
                {c.tiktok.suggestedSong ? <Text style={s.meta}>🎵 {c.tiktok.suggestedSong}</Text> : null}
                {c.tiktok.cta ? <Text style={s.meta}>End card: {c.tiktok.cta}</Text> : null}
              </>
            )}
            {tab === "Instagram" && c.instagram && (
              <>
                <CopyBlock label="CAPTION" text={c.instagram.caption} />
                <CopyBlock label="HASHTAGS" text={tags(c.instagram.hashtags)} />
                {c.instagram.storyText ? <CopyBlock label="STORY OVERLAY" text={c.instagram.storyText} /> : null}
              </>
            )}
            {tab === "Twitter/X" && c.twitter && (
              <>
                {Array.isArray(c.twitter.thread) && c.twitter.thread.map((tw: string, i: number) => (
                  <CopyBlock key={i} label={`TWEET ${i + 1}`} text={tw} />
                ))}
                <CopyBlock label="SINGLE TWEET" text={c.twitter.standalone} />
              </>
            )}
            {tab === "Reddit" && c.reddit && (
              <>
                <CopyBlock label="TITLE" text={c.reddit.title} />
                <CopyBlock label="POST" text={c.reddit.body || c.reddit.post || c.reddit.text} />
              </>
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
  row: { flexDirection: "row", gap: 8 },
  third: { flex: 1 },
  genBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  genTxt: { color: C.greenDark, fontSize: 16, fontWeight: "800" },
  best: { color: C.yellow, fontSize: 14, fontWeight: "700", marginBottom: 14 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 },
  tabActive: { backgroundColor: "#b066ff", borderColor: "#b066ff" },
  tabTxt: { color: C.text2, fontSize: 14, fontWeight: "700" },
  tabTxtActive: { color: "#fff" },
  block: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  blockLabel: { color: C.text4, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  copyBtn: { color: C.green, fontSize: 13, fontWeight: "700" },
  blockText: { color: C.text1, fontSize: 14, lineHeight: 21 },
  meta: { color: C.text3, fontSize: 13, marginBottom: 8, fontStyle: "italic" },
});
