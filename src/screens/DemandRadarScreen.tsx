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

export default function DemandRadarScreen({ token, onNavigate, onBack }: Props) {
  const [rising, setRising] = useState<any[]>([]);
  const [dataMode, setDataMode] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/demand-radar?token=${token}`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed to load");
      setRising(Array.isArray(d.rising) ? d.rising : []);
      setDataMode(d.dataMode || "");
      setMessage(d.message || "");
    } catch (e: any) {
      setError(e.message || "Could not load Demand Radar");
    }
    setLoading(false);
  }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  function ebaySearch(q: string) {
    Linking.openURL("https://www.ebay.com/sch/i.html?_nkw=" + encodeURIComponent(q) + "&LH_Sold=1&LH_Complete=1").catch(() => {});
  }

  const modeBadge =
    dataMode === "crowd-led" ? { txt: "● COMMUNITY SIGNAL", color: C.green } :
    dataMode === "blended" ? { txt: "● EARLY SIGNAL + eBay", color: C.yellow } :
    { txt: "● LIVE eBAY HEAT", color: C.orange };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}>
          <ActivityIndicator color={C.green} size="large" />
          <Text style={s.loadingText}>Scanning the market…</Text>
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
        <Text style={s.navTitle}>🚀 Demand Radar</Text>
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
        <Text style={s.subIntro}>
          Items heating up before prices spike. Get in early.
        </Text>

        {rising.map((r, i) => {
          const isCrowd = r.source === "crowd";
          return (
            <View key={i} style={[s.card, isCrowd && { borderColor: C.greenBorder }]}>
              <View style={s.cardTop}>
                <Text style={s.rank}>#{i + 1}</Text>
                <Text style={s.label} numberOfLines={1}>{r.label}</Text>
                {isCrowd && r.momentum ? (
                  <View style={s.momBadge}>
                    <Text style={s.momText}>{r.momentum}x</Text>
                  </View>
                ) : r.heatRatio ? (
                  <View style={[s.momBadge, { backgroundColor: C.orange }]}>
                    <Text style={[s.momText, { color: "#1a1208" }]}>🔥 {r.heatRatio}</Text>
                  </View>
                ) : null}
              </View>

              {isCrowd ? (
                <>
                  <Text style={s.cardNote}>
                    Scanned {r.thisWeek}x this week{r.lastWeek ? ` (up from ${r.lastWeek})` : ""} · {r.buysThisWeek} flagged BUY
                  </Text>
                  <View style={s.statRow}>
                    {r.avgProfit ? (
                      <View style={s.stat}>
                        <Text style={[s.statVal, { color: C.green }]}>${r.avgProfit}</Text>
                        <Text style={s.statLbl}>avg profit</Text>
                      </View>
                    ) : null}
                    {r.medianActualSold ? (
                      <View style={s.stat}>
                        <Text style={s.statVal}>${r.medianActualSold}</Text>
                        <Text style={s.statLbl}>real sold</Text>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={s.cardNote}>
                  {r.note} {r.soldCount ? `(${r.soldCount} recent sales` : ""}{r.activeCount ? ` vs ${r.activeCount} listed)` : r.soldCount ? ")" : ""}
                </Text>
              )}

              <TouchableOpacity style={s.verifyBtn} onPress={() => ebaySearch(r.example || r.label)}>
                <Text style={s.verifyText}>Check sold comps ›</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {rising.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>📡</Text>
            <Text style={s.emptyTitle}>No strong surges right now</Text>
            <Text style={s.emptyText}>
              {error ? "Couldn't load right now — pull to refresh." : "Demand is steady this week. Check back — surges move fast."}
            </Text>
          </View>
        )}

        {dataMode !== "crowd-led" && rising.length > 0 && (
          <Text style={s.footnote}>
            Demand Radar gets sharper every week as more ValuIQ resellers scan. You're seeing it early.
          </Text>
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
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  rank: { color: C.text4, fontSize: 14, fontWeight: "800", marginRight: 10 },
  label: { color: C.text1, fontSize: 16, fontWeight: "800", flex: 1, textTransform: "capitalize" },
  momBadge: { backgroundColor: C.green, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  momText: { color: C.greenDark, fontSize: 13, fontWeight: "800" },
  cardNote: { color: C.text2, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  statRow: { flexDirection: "row", gap: 20, marginBottom: 8 },
  stat: {},
  statVal: { color: C.text1, fontSize: 18, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 11, marginTop: 1 },
  verifyBtn: { alignSelf: "flex-start" },
  verifyText: { color: C.green, fontSize: 14, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 50 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: C.text1, fontSize: 17, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: C.text3, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 30 },
  footnote: { color: C.text4, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18, fontStyle: "italic" },
});
