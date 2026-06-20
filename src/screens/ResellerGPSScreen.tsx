import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

export default function ResellerGPSScreen({ token, onBack }: Props) {
  const [targets, setTargets] = useState<any[]>([]);
  const [dataMode, setDataMode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/reseller-gps?token=${token}`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed to load");
      setTargets(Array.isArray(d.targets) ? d.targets : []);
      setDataMode(d.dataMode || "");
      setMessage(d.message || "");
    } catch (e: any) {
      setError(e.message || "Could not load Reseller GPS");
    }
    setLoading(false);
  }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }
  function open(url: string) { if (url) Linking.openURL(url).catch(() => {}); }

  const modeBadge =
    dataMode === "crowd-led"
      ? { txt: "● COMMUNITY SIGNAL", color: C.green }
      : { txt: "● EVERGREEN + eBay", color: C.orange };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}><ActivityIndicator color={C.green} size="large" /><Text style={s.loadingText}>Mapping the hunt…</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>🗺️ Reseller GPS</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
      >
        <View style={[s.modeBadge, { borderColor: modeBadge.color + "50" }]}>
          <Text style={[s.modeText, { color: modeBadge.color }]}>{modeBadge.txt}</Text>
        </View>
        <Text style={s.intro}>{message}</Text>
        <Text style={s.subIntro}>What to hunt this week — and where. Tap to search live listings.</Text>

        {targets.map((t, i) => (
          <View key={i} style={[s.card, t.source === "crowd" && { borderColor: C.greenBorder }]}>
            <View style={s.cardTop}>
              <Text style={s.cat}>{t.category}</Text>
              {t.source === "crowd" && t.buyFlags ? (
                <View style={s.badge}><Text style={s.badgeText}>{t.buyFlags} BUY flags</Text></View>
              ) : null}
            </View>

            {t.source === "crowd" ? (
              <View style={s.statRow}>
                {t.buyRate != null && <View style={s.stat}><Text style={s.statVal}>{t.buyRate}%</Text><Text style={s.statLbl}>buy rate</Text></View>}
                {t.avgProfit ? <View style={s.stat}><Text style={[s.statVal,{color:C.green}]}>${t.avgProfit}</Text><Text style={s.statLbl}>avg profit</Text></View> : null}
                {t.avgDaysToSale != null && <View style={s.stat}><Text style={s.statVal}>~{t.avgDaysToSale}d</Text><Text style={s.statLbl}>to sell</Text></View>}
              </View>
            ) : (
              <Text style={s.note}>{t.note}</Text>
            )}

            <Text style={s.hunt}>📍 Hunt at: {t.whereToHunt}</Text>

            <View style={s.linkRow}>
              {t.links?.facebook && <TouchableOpacity style={s.linkBtn} onPress={() => open(t.links.facebook)}><Text style={s.linkTxt}>FB Market</Text></TouchableOpacity>}
              {t.links?.offerup && <TouchableOpacity style={s.linkBtn} onPress={() => open(t.links.offerup)}><Text style={s.linkTxt}>OfferUp</Text></TouchableOpacity>}
              {t.links?.ebaySold && <TouchableOpacity style={s.linkBtn} onPress={() => open(t.links.ebaySold)}><Text style={s.linkTxt}>eBay Sold</Text></TouchableOpacity>}
            </View>
          </View>
        ))}

        {targets.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🗺️</Text>
            <Text style={s.emptyTitle}>Mapping the hunt…</Text>
            <Text style={s.emptyText}>{error ? "Couldn't load — pull to refresh." : "Check back soon."}</Text>
          </View>
        )}

        {dataMode !== "crowd-led" && targets.length > 0 && (
          <Text style={s.footnote}>Reseller GPS gets sharper every week as the community scans and sells near you.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: C.text3, marginTop: 12, fontSize: 14 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: C.border, borderBottomWidth: 1 },
  navBack: { width: 50 }, navBackText: { color: C.green, fontSize: 16, fontWeight: "600" },
  navTitle: { color: C.text1, fontSize: 18, fontWeight: "800" },
  modeBadge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  modeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  intro: { color: C.text1, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  subIntro: { color: C.text3, fontSize: 13, marginBottom: 16 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cat: { color: C.text1, fontSize: 17, fontWeight: "800" },
  badge: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: C.greenDark, fontSize: 12, fontWeight: "800" },
  statRow: { flexDirection: "row", gap: 20, marginBottom: 10 },
  stat: {},
  statVal: { color: C.text1, fontSize: 18, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 11, marginTop: 1 },
  note: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  hunt: { color: C.text2, fontSize: 13, marginBottom: 12 },
  linkRow: { flexDirection: "row", gap: 8 },
  linkBtn: { flex: 1, backgroundColor: C.surfaceHigh, borderColor: C.border, borderWidth: 1, borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  linkTxt: { color: C.text1, fontSize: 13, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 50 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: C.text1, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: C.text3, fontSize: 14, textAlign: "center" },
  footnote: { color: C.text4, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18, fontStyle: "italic" },
});
