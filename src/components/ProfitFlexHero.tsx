// ProfitFlexHero.tsx — the lens result's flex-first hero: leads with the
// profit outcome and reacts to the outcome tier (killer/rare/solid/skip),
// replacing a single "don't pay more than" number with uniform styling
// regardless of magnitude. The killer tier reuses FlexRevealCard's glow +
// count-up building blocks rather than reinventing motion for a second
// "big number" moment.
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
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
  heroProfit: number;
  dataTag: string;       // "● REAL DATA" / "Based on N listings" / "ESTIMATE"
  dataTagColor: string;
  secondaryStats: SecondaryStat[]; // pay-max, sell price, ROI, days
  footNote: string;
}

const GLOW_W = 340;
const GLOW_H = 200;

function money(n: number): string {
  return (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString();
}

export default function ProfitFlexHero({ outcome, heroProfit, dataTag, dataTagColor, secondaryStats, footNote }: ProfitFlexHeroProps) {
  const isKiller = outcome.tier === "killer";
  const count = useCountUp(Math.round(heroProfit), isKiller, 900);
  const heroText = isKiller ? money(count) : money(heroProfit);
  const heroLabel = outcome.tier === "skip" && heroProfit <= 0 ? "you'd lose" : "net profit";

  // Subtle pulse on the tier badge — the only continuous motion, and only
  // for the tier that's supposed to feel like a banger.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isKiller) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isKiller]);
  const pulseStyle: any = { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) };

  return (
    <View style={[st.card, { borderColor: outcome.accent + "55", backgroundColor: outcome.accent + "0f" }]}>
      {isKiller && (
        <View style={st.glowWrap} pointerEvents="none">
          <Svg width={GLOW_W} height={GLOW_H}>
            <Defs>
              <RadialGradient id="killerGlow" cx="50%" cy="30%" r="65%">
                <Stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                <Stop offset="100%" stopColor={C.green} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={GLOW_W} height={GLOW_H} fill="url(#killerGlow)" />
          </Svg>
        </View>
      )}

      <View style={st.top}>
        {isKiller ? (
          <Animated.Text style={[st.badge, { color: outcome.accent }, pulseStyle]} numberOfLines={1}>
            {outcome.emoji} {outcome.label}
          </Animated.Text>
        ) : (
          <Text style={[st.badge, { color: outcome.accent }]} numberOfLines={1}>{outcome.emoji} {outcome.label}</Text>
        )}
        <Text style={[st.tag, { color: dataTagColor }]} numberOfLines={1}>{dataTag}</Text>
      </View>

      <Text style={[st.hero, { color: outcome.accent }]} numberOfLines={1} adjustsFontSizeToFit>{heroText}</Text>
      <Text style={st.heroLabel}>{heroLabel}</Text>
      <Text style={[st.copy, { color: outcome.accent }]}>{outcome.copy}</Text>

      <View style={st.statsRow}>
        {secondaryStats.map((stat) => (
          <View key={stat.label} style={st.stat}>
            <Text style={st.statVal} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
            <Text style={st.statLbl}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {footNote ? <Text style={st.foot}>{footNote}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 18, padding: 18, marginBottom: 14, overflow: "hidden" },
  glowWrap: { position: "absolute", top: -10, left: -10 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  badge: { fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  tag: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  hero: { fontSize: 52, fontWeight: "900", letterSpacing: -1.5, marginTop: 2 },
  heroLabel: { color: C.text4, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: -4, marginBottom: 8 },
  copy: { fontSize: 14, fontWeight: "700", marginBottom: 14 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginBottom: 2 },
  stat: { flex: 1, alignItems: "center" },
  statVal: { color: C.text1, fontSize: 16, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" },
  foot: { color: C.text4, fontSize: 11, fontStyle: "italic", marginTop: 8 },
});
