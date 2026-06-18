import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

export default function CashFlowScreen({ token, onBack }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/cashflow-oracle?token=${token}`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed to load");
      setData(d);
    } catch (e: any) {
      setError(e.message || "Could not load Cash Flow Oracle");
    }
    setLoading(false);
  }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}><ActivityIndicator color={C.green} size="large" /><Text style={s.loadingText}>Forecasting your cash…</Text></View>
      </SafeAreaView>
    );
  }

  const f = data?.forecast;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>💰 Cash Flow Oracle</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
      >
        {data && !data.ready ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>💰</Text>
            <Text style={s.emptyTitle}>No active inventory yet</Text>
            <Text style={s.emptyText}>{data.message}</Text>
          </View>
        ) : data ? (
          <>
            {data.dataMode === "estimate" && (
              <View style={s.estBadge}><Text style={s.estText}>● ESTIMATE · sharpens with real sales</Text></View>
            )}

            {/* Forecast cards */}
            <Text style={s.sectionTitle}>Projected cash incoming</Text>
            <View style={s.forecastRow}>
              <View style={s.fCard}>
                <Text style={s.fLabel}>30 days</Text>
                <Text style={s.fValue}>${(f?.in30 || 0).toLocaleString()}</Text>
              </View>
              <View style={s.fCard}>
                <Text style={s.fLabel}>60 days</Text>
                <Text style={s.fValue}>${(f?.in60 || 0).toLocaleString()}</Text>
              </View>
              <View style={s.fCard}>
                <Text style={s.fLabel}>90 days</Text>
                <Text style={s.fValue}>${(f?.in90 || 0).toLocaleString()}</Text>
              </View>
            </View>

            {/* Capital summary */}
            <View style={s.capRow}>
              <View style={[s.capCard, { borderColor: C.border }]}>
                <Text style={s.capVal}>${(data.capitalDeployed || 0).toLocaleString()}</Text>
                <Text style={s.capLbl}>capital deployed</Text>
              </View>
              <View style={[s.capCard, { borderColor: C.red + "40" }]}>
                <Text style={[s.capVal, { color: C.red }]}>${(data.capitalBlocked || 0).toLocaleString()}</Text>
                <Text style={s.capLbl}>blocked in slow movers</Text>
              </View>
            </View>

            {/* Blockers */}
            {Array.isArray(data.blockers) && data.blockers.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Reprice these — they're blocking cash</Text>
                {data.blockers.map((b: any, i: number) => (
                  <View key={i} style={s.blockerCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.blockerName} numberOfLines={1}>{b.item}</Text>
                      <Text style={s.blockerMeta}>{b.category} · sitting {b.ageDays}d (expected ~{b.expectedTotalDays}d)</Text>
                    </View>
                    <Text style={s.blockerCash}>${b.buyPrice}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={s.footnote}>{data.message}</Text>
          </>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>💰</Text>
            <Text style={s.emptyTitle}>Couldn't load</Text>
            <Text style={s.emptyText}>{error || "Pull to refresh."}</Text>
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
  estBadge: { alignSelf: "flex-start", borderColor: C.yellow + "50", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
  estText: { color: C.yellow, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  sectionTitle: { color: C.text1, fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 6 },
  forecastRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  fCard: { flex: 1, backgroundColor: C.surface, borderColor: C.greenBorder, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  fLabel: { color: C.text3, fontSize: 12, marginBottom: 6 },
  fValue: { color: C.green, fontSize: 20, fontWeight: "900" },
  capRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  capCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderRadius: 12, padding: 14 },
  capVal: { color: C.text1, fontSize: 22, fontWeight: "900" },
  capLbl: { color: C.text4, fontSize: 12, marginTop: 3 },
  blockerCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  blockerName: { color: C.text1, fontSize: 14, fontWeight: "700" },
  blockerMeta: { color: C.text4, fontSize: 12, marginTop: 2 },
  blockerCash: { color: C.red, fontSize: 16, fontWeight: "800", marginLeft: 10 },
  footnote: { color: C.text4, fontSize: 12, textAlign: "center", marginTop: 16, lineHeight: 18, fontStyle: "italic" },
  empty: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: C.text1, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: C.text3, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 30 },
});
