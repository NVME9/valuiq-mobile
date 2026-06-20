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

export default function FlipScoreScreen({ token, onNavigate, onBack }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/flip-score?token=${token}`);
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed to load");
      setData(d);
    } catch (e: any) { setError(e.message || "Could not load your Flip Score"); }
    setLoading(false);
  }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const gradeColor = (g: string = "") => {
    const c = g[0];
    return c === "A" ? C.green : c === "B" ? "#8fd14f" : c === "C" ? C.yellow : c === "D" ? C.orange : C.red;
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={s.center}><ActivityIndicator color={C.green} size="large" /><Text style={s.loadingText}>Grading your flips…</Text></View>
      </SafeAreaView>
    );
  }

  const st = data?.stats;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.navTitle}>🎯 Flip Score</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green} />}
      >
        {data && !data.hasData ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🎯</Text>
            <Text style={s.emptyTitle}>No score yet</Text>
            <Text style={s.emptyText}>{data.message || "Scan some items to get your flip report card."}</Text>
            <TouchableOpacity style={s.scanBtn} onPress={() => onNavigate("scanner")}><Text style={s.scanTxt}>Start Scanning</Text></TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Score hero */}
            <View style={s.hero}>
              <Text style={[s.grade, { color: gradeColor(data.grade) }]}>{data.grade}</Text>
              <View style={s.scoreWrap}>
                <Text style={s.scoreNum}>{data.score}<Text style={s.scoreMax}>/100</Text></Text>
                {data.headline ? <Text style={s.headline}>{data.headline}</Text> : null}
              </View>
            </View>
            {data.summary ? <Text style={s.summary}>{data.summary}</Text> : null}

            {/* Stats grid */}
            {st && (
              <View style={s.statGrid}>
                <View style={s.statBox}><Text style={s.statVal}>{st.totalScans}</Text><Text style={s.statLbl}>total scans</Text></View>
                <View style={s.statBox}><Text style={s.statVal}>{st.hitRate}%</Text><Text style={s.statLbl}>buy hit rate</Text></View>
                <View style={s.statBox}><Text style={[s.statVal,{color:C.green}]}>${st.totalProfit}</Text><Text style={s.statLbl}>profit found</Text></View>
                <View style={s.statBox}><Text style={s.statVal}>{st.avgRoi}%</Text><Text style={s.statLbl}>avg ROI</Text></View>
                <View style={s.statBox}><Text style={[s.statVal,{fontSize:14}]}>{st.bestCategory}</Text><Text style={s.statLbl}>best category</Text></View>
                <View style={s.statBox}><Text style={s.statVal}>{st.thisWeekScans}</Text><Text style={s.statLbl}>this week</Text></View>
              </View>
            )}

            {/* Strengths */}
            {Array.isArray(data.strengths) && data.strengths.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>💪 Strengths</Text>
                {data.strengths.map((x: string, i: number) => <Text key={i} style={s.line}>• {x}</Text>)}
              </View>
            )}

            {/* Opportunities */}
            {Array.isArray(data.opportunities) && data.opportunities.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>📈 Opportunities</Text>
                {data.opportunities.map((x: string, i: number) => <Text key={i} style={s.line}>• {x}</Text>)}
              </View>
            )}

            {/* Goal + tip */}
            {data.weeklyGoal ? <View style={s.goalCard}><Text style={s.goalLabel}>THIS WEEK'S GOAL</Text><Text style={s.goalText}>{data.weeklyGoal}</Text></View> : null}
            {data.powerTip ? <Text style={s.tip}>⚡ {data.powerTip}</Text> : null}
          </>
        ) : (
          <View style={s.empty}><Text style={s.emptyEmoji}>🎯</Text><Text style={s.emptyText}>{error || "Pull to refresh."}</Text></View>
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
  hero: { flexDirection: "row", alignItems: "center", gap: 18, marginBottom: 14, marginTop: 4 },
  grade: { fontSize: 56, fontWeight: "900", letterSpacing: -2 },
  scoreWrap: { flex: 1 },
  scoreNum: { color: C.text1, fontSize: 30, fontWeight: "900" },
  scoreMax: { color: C.text4, fontSize: 16, fontWeight: "700" },
  headline: { color: C.text2, fontSize: 14, fontWeight: "700", marginTop: 2 },
  summary: { color: C.text2, fontSize: 14, lineHeight: 21, marginBottom: 18 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statBox: { width: "31.5%", backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  statVal: { color: C.text1, fontSize: 18, fontWeight: "800", textAlign: "center" },
  statLbl: { color: C.text4, fontSize: 10, marginTop: 2, textAlign: "center" },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { color: C.text1, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  line: { color: C.text2, fontSize: 13, lineHeight: 20, marginTop: 2 },
  goalCard: { backgroundColor: "#0e1a12", borderColor: C.greenBorder, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  goalLabel: { color: C.green, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
  goalText: { color: C.text1, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  tip: { color: C.yellow, fontSize: 13, lineHeight: 19, marginTop: 6, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 50 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: C.text1, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: C.text3, fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 },
  scanBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, marginTop: 18 },
  scanTxt: { color: C.greenDark, fontSize: 15, fontWeight: "800" },
});
