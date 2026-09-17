// ProfitFlexHero.tsx — the scan result's ONE hero: verdict + profit + max-buy
// + key stats, reconciled into a single card instead of a separate verdict
// card stacked on top of a separate Profit Oracle card. Reacts to the
// outcome tier (hot/solid/skip), which is the single source of
// truth for the verdict - this component never independently decides
// buy-vs-skip, it only renders what classifyOutcome() already decided.
// The hot tier reuses FlexRevealCard's glow + count-up building blocks
// rather than reinventing motion for a second "big number" moment.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, Image, TouchableOpacity } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { C } from "../lib/theme";
import { OutcomeTierInfo } from "../lib/outcomeTier";
import { useCountUp } from "./FlexRevealCard";
import FlashHighlight from "./FlashHighlight";

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

  // TWO-STAGE SCAN RENDER (2026-09-11): bumped by ScannerScreen ONLY when a
  // background /refine call actually landed corrected numbers - triggers a
  // one-shot "sharpen into focus" flash on the hero number/badge/max-buy
  // (see FlashHighlight) so the update reads as the number resolving, not
  // silently swapping. 0/unset = no flash (default, normal render).
  flashSeq?: number;
}

const GLOW_W = 340;
const GLOW_H = 200;

// RECONCILE FIX (2026-09-17): used to always round to the nearest dollar
// ("$5.52" -> "$6"), which was the actual cause of a "$6 profit / 138% ROI
// don't cross-check" report - heroProfit and heroRoi were computed off the
// SAME number the whole time (see ScannerScreen.tsx's ONE CANONICAL SELL
// PRICE comment), the ROI stat just showed it unrounded-to-the-percent
// while this rounded the dollar figure to a DIFFERENT precision, so two
// legitimate roundings of one consistent number looked like disagreeing
// math. Now shows cents whenever they're nonzero ("$5.52") and stays
// clean whole-dollar ("$6") only when the value genuinely IS $6.00 - no
// ".00" clutter on the common case, no silently-dropped fee cents on the
// uncommon one.
function money(n: number): string {
  const abs = Math.abs(n);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return (n < 0 ? "-$" : "$") + formatted;
}

export default function ProfitFlexHero({
  outcome, itemName, categoryLine, photoBase64, onEdit, isSkip,
  heroProfit = 0, profitLabel = "profit", maxBuy, maxBuyReasoning, dataTag, dataTagColor, secondaryStats = [], footNote,
  skipDetail, flashSeq = 0,
}: ProfitFlexHeroProps) {
  // MEASURED BUG: a long AI-generated item name ("American Flag with Fish
  // Trucker Hat (likely...") had no way to be seen in full - numberOfLines
  // capped it with no expand affordance anywhere on the result screen.
  // Tap the title (or the toggle line under it) to see the whole thing.
  const [titleExpanded, setTitleExpanded] = useState(false);
  const isHot = outcome.tier === "hot";
  // RECONCILE FIX (2026-09-17): useCountUp animates and DISPLAYS only
  // whole integers internally (FlexRevealCard.tsx's listener rounds every
  // tick) - a real constraint of that shared hook, not something to widen
  // here since it's also used for plain integer stats elsewhere. A hot-
  // tier item is exactly the case that broke ("138% ROI" requires
  // ROI_HOT_MIN=75%+, so the reported $6/138% scan WAS hot-tier) - if
  // heroProfit carries cents, animating Math.round(heroProfit) would
  // silently re-introduce the same rounding-seam bug money() above just
  // fixed, just one line up. So the animated count-up (a deliberate
  // flourish, unrelated to this fix) only runs for a whole-dollar hot
  // profit; a hot profit with cents skips the animation and renders the
  // exact money(heroProfit) directly, same as every other tier.
  const heroHasCents = Math.round(Math.abs(heroProfit) * 100) % 100 !== 0;
  const animateHero = isHot && !heroHasCents;
  const count = useCountUp(Math.round(heroProfit), animateHero, 900);
  const heroText = animateHero ? money(count) : money(heroProfit);

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

      <FlashHighlight flashSeq={flashSeq}>
        <View style={st.top}>
          {isHot ? (
            <Animated.Text style={[st.badge, { color: outcome.accent }, pulseStyle]} numberOfLines={1}>
              {outcome.emoji} {outcome.label}
            </Animated.Text>
          ) : (
            <Text style={[st.badge, { color: outcome.accent }]} numberOfLines={1}>{outcome.emoji} {outcome.label}</Text>
          )}
          {/* MEASURED BUG (2026-09-10): "● REAL DATA · SMALL SAMPLE" clipped
              mid-word ("SAMP…") - `top` was a single non-wrapping row with
              justifyContent:"space-between", so a long badge label left the
              tag too little width before its own numberOfLines={1} ellipsized
              it. flexWrap lets the tag drop to its own full-width line
              instead of fighting the badge for room on one line. */}
          {dataTag ? <Text style={[st.tag, { color: dataTagColor }]}>{dataTag}</Text> : null}
        </View>
      </FlashHighlight>

      <TouchableOpacity onPress={() => setTitleExpanded(v => !v)} activeOpacity={0.7}>
        <Text style={st.itemName} numberOfLines={titleExpanded ? undefined : 2}>{itemName}</Text>
        <Text style={st.itemNameToggle}>{titleExpanded ? "▲ Show less" : "▼ Tap to see full name"}</Text>
      </TouchableOpacity>
      {categoryLine ? <Text style={st.itemMeta}>{categoryLine}</Text> : null}

      {isSkip ? (
        <>
          <Text style={[st.skipReason, { color: outcome.accent }]}>{outcome.copy}</Text>
          {skipDetail ? <Text style={st.skipDetail}>{skipDetail}</Text> : null}
        </>
      ) : (
        <>
          <FlashHighlight flashSeq={flashSeq}>
            <Text style={[st.hero, { color: outcome.accent }]} numberOfLines={1} adjustsFontSizeToFit>{heroText}</Text>
          </FlashHighlight>
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
        <FlashHighlight flashSeq={flashSeq}>
          <View style={st.maxBuyBox}>
            <Text style={st.maxBuyHeadline}>Max buy: {money(maxBuy)}</Text>
            {maxBuyReasoning ? <Text style={st.maxBuyReasoning}>{maxBuyReasoning}</Text> : null}
          </View>
        </FlashHighlight>
      )}

      {footNote ? <Text style={st.foot}>{footNote}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  // MEASURED BUG: the skip-tier reason text ("Sells for about $14. Enter
  // what you'd pay...") was rendering clipped mid-sentence at the card's
  // bottom edge. Not a numberOfLines cap - there wasn't one - but this
  // card's overflow:"hidden" (needed to clip the hot-tier glow SVG to the
  // rounded corners) paired with skipReason's lineHeight sitting too close
  // to its fontSize for bold text's real rendered height on Android, which
  // shaved off the last line's descenders. paddingBottom bumped so any
  // multi-line content in this card has real room before that clip
  // boundary, regardless of which tier is showing.
  card: { borderWidth: 1.5, borderRadius: 18, padding: 18, paddingBottom: 24, marginBottom: 14, overflow: "hidden" },
  glowWrap: { position: "absolute", top: -10, left: -10 },
  editBtn: { position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", zIndex: 2 },
  editBtnIcon: { fontSize: 16 },
  photo: { width: "100%", height: 150, borderRadius: 10, marginBottom: 12 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 2, marginBottom: 8 },
  badge: { fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  tag: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  itemName: { color: C.text1, fontSize: 16, fontWeight: "700", marginBottom: 2 },
  itemNameToggle: { color: C.text4, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  itemMeta: { color: C.text3, fontSize: 12, marginBottom: 12 },
  hero: { fontSize: 48, fontWeight: "900", letterSpacing: -1.5, marginTop: 2 },
  heroLabel: { color: C.text4, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: -4, marginBottom: 8 },
  copy: { fontSize: 14, fontWeight: "700", marginBottom: 14 },
  skipReason: { fontSize: 16, fontWeight: "800", lineHeight: 24, marginBottom: 8 },
  skipDetail: { color: C.text3, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginBottom: 2 },
  stat: { flex: 1, alignItems: "center" },
  statVal: { color: C.text1, fontSize: 16, fontWeight: "800" },
  statLbl: { color: C.text4, fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" },
  maxBuyBox: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  maxBuyHeadline: { color: C.text1, fontSize: 13, fontWeight: "800", marginBottom: 3 },
  maxBuyReasoning: { color: C.text3, fontSize: 12, lineHeight: 17 },
  foot: { color: C.text4, fontSize: 11, fontStyle: "italic", marginTop: 8 },
});
