import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token: string; onBack: () => void; }

export default function TrendPredictor({ token, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/business/trend-predictor?token=${token}`);
      const d = await r.json();
      if (d.success) setRes(d);
      else setError(d.error === "upgrade_required" ? "Titan plan required." : (d.error || "Could not load."));
    } catch { setError("Could not load trend data."); }
    setLoading(false);
  }

  const p = res?.predictions || {};
  const toneColor = (t: string) => t === "hot" ? B.loss : t === "warm" ? B.orange : t === "cooling" ? B.info : B.text2;
  const confColor = (c: string) => c === "high" ? B.profit : c === "medium" ? B.warning : B.text3;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>Trend Predictor</Text>
        <TouchableOpacity onPress={load} style={s.back}><Text style={s.refresh}>{"\u21BB"}</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {loading ? (
          <ActivityIndicator color={B.orange} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={s.empty}><Text style={s.emptyTxt}>{error}</Text></View>
        ) : res ? (
          <>
            {/* Market tone */}
            <View style={s.toneCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.toneLbl}>MARKET TONE</Text>
                <Text style={[s.toneVal, { color: toneColor(p.overallMarketTone) }]}>{(p.overallMarketTone || "neutral").toUpperCase()}</Text>
              </View>
              {res.currentMonth ? <Text style={s.monthTxt}>{res.currentMonth}</Text> : null}
            </View>

            {/* Weekly focus - the hero */}
            {p.weeklyFocus ? (
              <View style={s.focusCard}>
                <Text style={s.focusLbl}>THIS WEEK'S #1 FOCUS</Text>
                <Text style={s.focusTxt}>{p.weeklyFocus}</Text>
              </View>
            ) : null}

            {/* Upcoming events */}
            {(res.upcomingEvents || []).length ? (
              <>
                <Text style={s.secTit}>ON THE CALENDAR</Text>
                <View style={s.eventWrap}>
                  {res.upcomingEvents.map((e: string, i: number) => (
                    <View key={i} style={s.eventChip}><Text style={s.eventTxt}>{e}</Text></View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Hot right now */}
            {(p.hotRightNow || []).length ? (
              <>
                <Text style={s.secTit}>HOT RIGHT NOW</Text>
                <View style={s.hotCard}>
                  {p.hotRightNow.map((h: string, i: number) => (
                    <View key={i} style={s.hotRow}><Text style={s.hotFire}>{"\uD83D\uDD25"}</Text><Text style={s.hotTxt}>{h}</Text></View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Predictions */}
            <Text style={s.secTit}>PREDICTIONS</Text>
            {(p.topPredictions || []).map((pred: any, i: number) => (
              <View key={i} style={s.predCard}>
                <View style={s.predHeader}>
                  <Text style={s.predCat} numberOfLines={1}>{pred.category}</Text>
                  {pred.confidence ? <Text style={[s.predConf, { color: confColor(pred.confidence) }]}>{pred.confidence}</Text> : null}
                </View>
                <Text style={s.predMain}>{pred.prediction}</Text>
                {pred.trigger ? <Text style={s.predMeta}>Trigger: {pred.trigger}</Text> : null}
                <View style={s.predStats}>
                  {pred.timeframe ? <View style={s.predStat}><Text style={s.predStatVal}>{pred.timeframe}</Text><Text style={s.predStatLbl}>timeframe</Text></View> : null}
                  {pred.expectedDemandIncrease ? <View style={s.predStat}><Text style={[s.predStatVal, { color: B.profit }]}>{pred.expectedDemandIncrease}</Text><Text style={s.predStatLbl}>demand</Text></View> : null}
                  {pred.potentialROI ? <View style={s.predStat}><Text style={[s.predStatVal, { color: B.orange }]}>{pred.potentialROI}</Text><Text style={s.predStatLbl}>ROI</Text></View> : null}
                </View>
                {pred.action ? <View style={s.actionBox}><Text style={s.actionLbl}>ACT NOW</Text><Text style={s.actionTxt}>{pred.action}</Text></View> : null}
                {pred.buyTarget ? <Text style={s.predBuy}>Buy: {pred.buyTarget}</Text> : null}
                {pred.sellWindow ? <Text style={s.predSell}>Sell window: {pred.sellWindow}</Text> : null}
              </View>
            ))}

            {/* Secret opportunity */}
            {p.secretOpportunity ? (
              <View style={s.secretCard}>
                <Text style={s.secretLbl}>{"\uD83D\uDD0D"} OVERLOOKED OPPORTUNITY</Text>
                <Text style={s.secretTxt}>{p.secretOpportunity}</Text>
              </View>
            ) : null}

            {/* Avoid */}
            {p.categoryToAvoidNow ? (
              <View style={s.avoidCard}>
                <Text style={s.avoidLbl}>COOLING — EASE OFF</Text>
                <Text style={s.avoidTxt}>{p.categoryToAvoidNow}</Text>
              </View>
            ) : null}

            <Text style={s.disclaimer}>{res.disclaimer}</Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: B.bg },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: B.border },
  back: { width: 36, height: 36, justifyContent: "center", alignItems: "center" }, backTxt: { color: B.text3, fontSize: 26 },
  refresh: { color: B.orange, fontSize: 20 },
  navTitle: { color: B.text1, fontSize: 15, fontWeight: "800" as any },
  scroll: { padding: 16, paddingBottom: 70 },
  toneCard: { flexDirection: "row", alignItems: "center", backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  toneLbl: { color: B.text4, fontSize: 11, fontWeight: "800" as any, letterSpacing: 1 },
  toneVal: { fontSize: 26, fontWeight: "900" as any, marginTop: 2 },
  monthTxt: { color: B.text3, fontSize: 13, fontWeight: "600" as any },
  focusCard: { backgroundColor: B.orangeBg, borderWidth: 1.5, borderColor: B.orangeBorder, borderRadius: 14, padding: 16, marginBottom: 16 },
  focusLbl: { color: B.orange, fontSize: 11, fontWeight: "900" as any, letterSpacing: 1, marginBottom: 6 },
  focusTxt: { color: B.text1, fontSize: 15, lineHeight: 21, fontWeight: "600" as any },
  secTit: { color: B.text3, fontSize: 12, fontWeight: "800" as any, letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  eventWrap: { flexDirection: "row", flexWrap: "wrap" as any, gap: 6, marginBottom: 10 },
  eventChip: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  eventTxt: { color: B.text2, fontSize: 12 },
  hotCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  hotRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  hotFire: { fontSize: 14, marginRight: 8 }, hotTxt: { color: B.text1, fontSize: 13, flex: 1, lineHeight: 18 },
  predCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.border, borderRadius: 14, padding: 15, marginBottom: 10 },
  predHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  predCat: { color: B.text1, fontSize: 15, fontWeight: "900" as any, flex: 1 },
  predConf: { fontSize: 11, fontWeight: "800" as any, textTransform: "uppercase" as any },
  predMain: { color: B.text1, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  predMeta: { color: B.text3, fontSize: 12, marginBottom: 8, fontStyle: "italic" as any },
  predStats: { flexDirection: "row", gap: 14, marginBottom: 10 },
  predStat: {}, predStatVal: { color: B.text1, fontSize: 14, fontWeight: "800" as any }, predStatLbl: { color: B.text4, fontSize: 10, marginTop: 1 },
  actionBox: { backgroundColor: B.bg, borderRadius: 10, padding: 11, marginBottom: 6 },
  actionLbl: { color: B.orange, fontSize: 10, fontWeight: "900" as any, letterSpacing: 1, marginBottom: 3 },
  actionTxt: { color: B.text1, fontSize: 13, lineHeight: 18 },
  predBuy: { color: B.profit, fontSize: 12, marginTop: 2 },
  predSell: { color: B.info, fontSize: 12, marginTop: 2 },
  secretCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.info + "40", borderRadius: 12, padding: 14, marginTop: 6, marginBottom: 10 },
  secretLbl: { color: B.info, fontSize: 11, fontWeight: "900" as any, letterSpacing: 0.5, marginBottom: 6 },
  secretTxt: { color: B.text1, fontSize: 13, lineHeight: 19 },
  avoidCard: { backgroundColor: B.surface, borderWidth: 1, borderColor: B.loss + "40", borderRadius: 12, padding: 14, marginBottom: 10 },
  avoidLbl: { color: B.loss, fontSize: 11, fontWeight: "900" as any, letterSpacing: 0.5, marginBottom: 6 },
  avoidTxt: { color: B.text2, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: "center", marginTop: 50, paddingHorizontal: 30 },
  emptyTxt: { color: B.text2, fontSize: 14, textAlign: "center" as any },
  disclaimer: { color: B.text4, fontSize: 10, lineHeight: 15, fontStyle: "italic" as any, marginTop: 6 },
});
