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

export default function HotNowScreen({ token, onNavigate, onBack }: Props) {
  const [real, setReal] = useState<any[]>([]);
  const [market, setMarket] = useState<any[]>([]);
  const [weeklyTip, setWeeklyTip] = useState<string>("");
  const [avoid, setAvoid] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [hasRealData, setHasRealData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/hot-now?token=${token}`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed to load");
      setReal(Array.isArray(d.realHotCategories) ? d.realHotCategories : []);
      setMarket(Array.isArray(d.hotCategories) ? d.hotCategories : []);
      setWeeklyTip(d.weeklyTip || "");
      setAvoid(Array.isArray(d.avoid) ? d.avoid : []);
      setLastUpdated(d.lastUpdated || "");
      setHasRealData(!!d.hasRealData);
    } catch (e: any) {
      setError(e.message || "Could not load Hot Now");
    }
    setLoading(false);
  }

  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  function ebaySearch(q: string) {
    const url = "https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q) + "&LH_Sold=1&LH_Complete=1";
    Linking.openURL(url).catch(() => {});
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={s.loadingText}>Reading the market…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}>
          <Text style={s.navBackText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>🔥 Hot Right Now</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
      >
        {!!lastUpdated && <Text style={s.updated}>Updated {lastUpdated}</Text>}

        {/* WEEKLY TIP */}
        {!!weeklyTip && (
          <View style={s.tipCard}>
            <Text style={s.tipLabel}>💡 THIS WEEK</Text>
            <Text style={s.tipText}>{weeklyTip}</Text>
          </View>
        )}

        {/* REAL COMMUNITY DATA — the moat-backed feed */}
        {hasRealData && real.length > 0 && (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>What your community is finding</Text>
              <View style={s.liveDot}><Text style={s.liveDotText}>● LIVE</Text></View>
            </View>
            <Text style={s.sectionSub}>Real BUY flags from ValuIQ resellers this week</Text>
            {real.map((c, i) => (
              <View key={"real" + i} style={s.realCard}>
                <View style={s.realRow}>
                  <Text style={s.realCat}>{c.category}</Text>
                  <View style={s.realBadge}>
                    <Text style={s.realBadgeText}>{c.buyCount} BUY flags</Text>
                  </View>
                </View>
                <View style={s.statRow}>
                  <View style={s.stat}>
                    <Text style={s.statVal}>{c.buyRate}%</Text>
                    <Text style={s.statLbl}>buy rate</Text>
                  </View>
                  <View style={s.stat}>
                    <Text style={[s.statVal, { color: C.green }]}>${c.avgProfit}</Text>
                    <Text style={s.statLbl}>avg profit</Text>
                  </View>
                  {c.avgDaysToSale != null && (
                    <View style={s.stat}>
                      <Text style={s.statVal}>~{c.avgDaysToSale}d</Text>
                      <Text style={s.statLbl}>to sell</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity style={s.verifyBtn} onPress={() => ebaySearch(c.category)}>
                  <Text style={s.verifyText}>Check sold comps ›</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* MARKET TRENDS — AI analyst view, clearly labeled */}
        {market.length > 0 && (
          <>
            <View style={[s.sectionHead, { marginTop: hasRealData ? 24 : 0 }]}>
              <Text style={s.sectionTitle}>Market trends</Text>
            </View>
            <Text style={s.sectionSub}>Seasonal & demand analysis — verify before buying</Text>
            {market.map((c, i) => (
              <View key={"mkt" + i} style={s.mktCard}>
                <View style={s.mktTop}>
                  <Text style={s.mktCat}>{c.icon ? c.icon + " " : ""}{c.category}</Text>
                  {c.heatScore != null && (
                    <View style={s.heat}>
                      <Text style={s.heatText}>🔥 {c.heatScore}</Text>
                    </View>
                  )}
                </View>
                {!!c.whyHot && <Text style={s.whyHot}>{c.whyHot}</Text>}
                <View style={s.mktMeta}>
                  {!!c.avgROI && <Text style={s.metaPill}>{c.avgROI} ROI</Text>}
                  {!!c.priceRange && <Text style={s.metaPill}>{c.priceRange}</Text>}
                  {!!c.bestPlatform && <Text style={s.metaPill}>{c.bestPlatform}</Text>}
                </View>
                {!!c.buyTarget && <Text style={s.buyTarget}>🎯 {c.buyTarget}</Text>}
                {Array.isArray(c.specificItems) && c.specificItems.length > 0 && (
                  <Text style={s.specItems}>Look for: {c.specificItems.join(" · ")}</Text>
                )}
                {!!c.watchOut && <Text style={s.watchOut}>⚠️ {c.watchOut}</Text>}
                {!!c.ebayQuery && (
                  <TouchableOpacity style={s.verifyBtn} onPress={() => ebaySearch(c.ebayQuery)}>
                    <Text style={s.verifyText}>Verify on eBay ›</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </>
        )}

        {/* AVOID */}
        {avoid.length > 0 && (
          <View style={s.avoidCard}>
            <Text style={s.avoidLabel}>🚫 AVOID RIGHT NOW</Text>
            {avoid.map((a, i) => <Text key={i} style={s.avoidText}>{a}</Text>)}
          </View>
        )}

        {/* EMPTY / ERROR — honest, no fake data */}
        {!hasRealData && market.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📡</Text>
            <Text style={s.emptyTitle}>Gathering signal…</Text>
            <Text style={s.emptyText}>
              {error
                ? "Couldn't load Hot Now right now. Pull to refresh."
                : "Hot Now sharpens as the community scans and sells. Check back soon."}
            </Text>
          </View>
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
  updated: { color: C.text4, fontSize: 12, marginBottom: 12 },
  tipCard: { backgroundColor: C.greenBg, borderColor: C.greenBorder, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18 },
  tipLabel: { color: C.green, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
  tipText: { color: C.text1, fontSize: 14, lineHeight: 20 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: C.text1, fontSize: 18, fontWeight: "800" },
  sectionSub: { color: C.text3, fontSize: 13, marginTop: 2, marginBottom: 12 },
  liveDot: { backgroundColor: C.green + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  liveDotText: { color: C.green, fontSize: 10, fontWeight: "800" },
  realCard: { backgroundColor: C.surface, borderColor: C.greenBorder, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  realRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  realCat: { color: C.text1, fontSize: 17, fontWeight: "800" },
  realBadge: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  realBadgeText: { color: C.greenDark, fontSize: 12, fontWeight: "800" },
  statRow: { flexDirection: "row", gap: 20, marginBottom: 12 },
  stat: { alignItems: "flex-start" },
  statVal: { color: C.text1, fontSize: 20, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 11, marginTop: 1 },
  verifyBtn: { alignSelf: "flex-start", marginTop: 2 },
  verifyText: { color: C.green, fontSize: 14, fontWeight: "700" },
  mktCard: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  mktTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  mktCat: { color: C.text1, fontSize: 16, fontWeight: "800", flex: 1 },
  heat: { backgroundColor: C.orange + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  heatText: { color: C.orange, fontSize: 12, fontWeight: "800" },
  whyHot: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  mktMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  metaPill: { color: C.text2, fontSize: 12, fontWeight: "600", backgroundColor: C.surfaceHigh, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  buyTarget: { color: C.green, fontSize: 13, fontWeight: "700", marginBottom: 4 },
  specItems: { color: C.text3, fontSize: 12, marginBottom: 4 },
  watchOut: { color: C.yellow, fontSize: 12, marginBottom: 8 },
  avoidCard: { backgroundColor: C.red + "10", borderColor: C.red + "30", borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 18 },
  avoidLabel: { color: C.red, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  avoidText: { color: C.text2, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: C.text1, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: C.text3, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 30 },
});
