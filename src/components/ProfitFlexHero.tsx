// ProfitFlexHero.tsx — the scan result's ONE hero: verdict + profit + max-buy
// + key stats, reconciled into a single card instead of a separate verdict
// card stacked on top of a separate Profit Oracle card. Reacts to the
// outcome tier (hot/solid/skip), which is the single source of
// truth for the verdict - this component never independently decides
// buy-vs-skip, it only renders what classifyOutcome() already decided.
// The hot tier reuses FlexRevealCard's glow + count-up building blocks
// rather than reinventing motion for a second "big number" moment.
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image, TouchableOpacity } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { C } from "../lib/theme";
import { OutcomeTierInfo } from "../lib/outcomeTier";
import { useCountUp } from "./FlexRevealCard";

interface SecondaryStat {
  label: string;
  value: string;
}

interface ProfitFlexHeroProps {
  outcome: OutcomeTierInfo;
  itemName: string;
  categoryLine: string | null;
  photoBase64?: string | null;
  onEdit: () => void;
  isSkip: boolean;

  // BUY-path fields (killer/rare/solid)
  heroProfit?: number;
  profitLabel?: string;         // "actual profit" | "projected profit"
  maxBuy?: number | null;
  maxBuyReasoning?: string;      // ALWAYS shown alongside max-buy, self-explaining
  dataTag?: string;               // "● REAL DATA" / "Based on N listings" / "ESTIMATE"
  dataTagColor?: string;
  secondaryStats?: SecondaryStat[]; // ROI, sell-time
  footNote?: string;

  // SKIP-path fields
  skipDetail?: string | null;    // lens's own reasoning, shown as secondary context under the one-line reason
}

const GLOW_W = 340;
const GLOW_H = 200;

function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

export default function ProfitFlexHero({
  outcome, itemName, categoryLine, photoBase64, onEdit, isSkip,
  heroProfit = 0, profitLabel = "profit", maxBuy, maxBuyReasoning, dataTag, dataTagColor, secondaryStats = [], footNote,
  skipDetail,
}: ProfitFlexHeroProps) {
  const isHot = outcome.tier === "hot";
  const count = useCountUp(Math.round(heroProfit), isHot, 900);
  const heroText = isHot ? money(count) : money(heroProfit);

  // Subtle pulse on the tier badge — the only continuous motion, and only
  // for the tier that's supposed to feel like a banger.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isHot) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isHot]);
  const pulseStyle: any = { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) };

  return (
    <View style={[st.card, { borderColor: outcome.accent + "55", backgroundColor: outcome.accent + "0f" }]}>
      {isHot && (
        <View style={st.glowWrap} pointerEvents="none">
          <Svg width={GLOW_W} height={GLOW_H}>
            <Defs>
              <RadialGradient id="hotGlow" cx="50%" cy="30%" r="65%">
                <Stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                <Stop offset="100%" stopColor={C.green} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={GLOW_W} height={GLOW_H} fill="url(#hotGlow)" />
          </Svg>
        </View>
      )}

      <TouchableOpacity style={st.editBtn} onPress={onEdit} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={st.editBtnIcon}>✏️</Text>
      </TouchableOpacity>

      {photoBase64 ? (
        <Image source={{ uri: `data:image/jpeg;base64,${photoBase64}` }} style={st.photo} resizeMode="cover" />
      ) : null}

      <View style={st.top}>
        {isHot ? (
          <Animated.Text style={[st.badge, { color: outcome.accent }, pulseStyle]} numberOfLines={1}>
            {outcome.emoji} {outcome.label}
          </Animated.Text>
        ) : (
          <Text style={[st.badge, { color: outcome.accent }]} numberOfLines={1}>{outcome.emoji} {outcome.label}</Text>
        )}
        {dataTag ? <Text style={[st.tag, { color: dataTagColor }]} numberOfLines={1}>{dataTag}</Text> : null}
      </View>

      <Text style={st.itemName} numberOfLines={2}>{itemName}</Text>
      {categoryLine ? <Text style={st.itemMeta}>{categoryLine}</Text> : null}

      {isSkip ? (
        <>
          <Text style={[st.skipReason, { color: outcome.accent }]}>{outcome.copy}</Text>
          {skipDetail ? <Text style={st.skipDetail}>{skipDetail}</Text> : null}
        </>
      ) : (
        <>
          <Text style={[st.hero, { color: outcome.accent }]} numberOfLines={1} adjustsFontSizeToFit>{heroText}</Text>
          <Text style={st.heroLabel}>{profitLabel}</Text>
          <Text style={[st.copy, { color: outcome.accent }]}>{outcome.copy}</Text>

          {secondaryStats.length > 0 && (
            <View style={st.statsRow}>
              {secondaryStats.map((stat) => (
                <View key={stat.label} style={st.stat}>
                  <Text style={st.statVal} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                  <Text style={st.statLbl}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Max-buy: ALWAYS shown, in both BUY and SKIP layouts, and always
          paired with the reasoning that explains it - never a bare number
          asking for trust. */}
      {maxBuy != null && (
        <View style={st.maxBuyBox}>
          <Text style={st.maxBuyHeadline}>Max buy: {money(maxBuy)}</Text>
          {maxBuyReasoning ? <Text style={st.maxBuyReasoning}>{maxBuyReasoning}</Text> : null}
        </View>
      )}

      {footNote ? <Text style={st.foot}>{footNote}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 18, padding: 18, marginBottom: 14, overflow: "hidden" },
  glowWrap: { position: "absolute", top: -10, left: -10 },
  editBtn: { position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", zIndex: 2 },
  editBtnIcon: { fontSize: 16 },
  photo: { width: "100%", height: 150, borderRadius: 10, marginBottom: 12 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  badge: { fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  tag: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  itemName: { color: C.text1, fontSize: 16, fontWeight: "700", marginBottom: 2 },
  itemMeta: { color: C.text3, fontSize: 12, marginBottom: 12 },
  hero: { fontSize: 48, fontWeight: "900", letterSpacing: -1.5, marginTop: 2 },
  heroLabel: { color: C.text4, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: -4, marginBottom: 8 },
  copy: { fontSize: 14, fontWeight: "700", marginBottom: 14 },
  skipReason: { fontSize: 16, fontWeight: "800", lineHeight: 22, marginBottom: 6 },
  skipDetail: { color: C.text3, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginBottom: 2 },
  stat: { flex: 1, alignItems: "center" },
  statVal: { color: C.text1, fontSize: 16, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" },
  maxBuyBox: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  maxBuyHeadline: { color: C.text1, fontSize: 13, fontWeight: "800", marginBottom: 3 },
  maxBuyReasoning: { color: C.text3, fontSize: 12, lineHeight: 17 },
  foot: { color: C.text4, fontSize: 11, fontStyle: "italic", marginTop: 8 },
});
