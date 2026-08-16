// FlexRevealCard.tsx — the full-screen animated trophy card that fires the
// instant a sale is logged. This screen IS the product: it has to feel
// premium, not like a dashboard tile or a toast.
//
// Three exports:
//   FlexRevealContent - pure presentational card (hero stat, badge, streak
//     ribbon, brand mark). No Modal, no backdrop. Structured like
//     ShareCard.tsx so a future step can wrap THIS in <ViewShot> and capture
//     it off-screen exactly the way ScannerScreen.tsx does for ShareCard.
//   FlexRevealBody - the interactive reveal screen (entrance/count-up/stamp
//     animations, close + action buttons) with no Modal of its own, meant to
//     be embedded inside an already-open Modal (see LogSaleModal.tsx) so a
//     sale-log flow never presents a second native Modal mid-flow.
//   FlexRevealCard (default) - FlexRevealBody wrapped in its own Modal, for
//     any spot that wants to show the reveal standalone.
//
// Animation is built entirely on React Native core's Animated API (already
// used elsewhere in this app, e.g. DashboardScreen.tsx) plus react-native-svg
// (already linked) for the glow behind the hero stat. No Reanimated, no
// Haptics, no new native module - this ships over-the-air.
import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, Alert,
} from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { C } from "../lib/theme";
import { FlexStat } from "../lib/flexReveal";
import { buildDisplayTitle } from "../lib/saleCapture";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ---- count-up: extracts the numeric run inside a headline ("$52" / "9
// days" / "Beat 78%" / "#3 this week" / "5th flip") and animates just that
// number, reconstructing the surrounding text exactly. Returns null when a
// headline has no number at all ("Logged!") so the caller can skip animating.
function parseHeadlineNumber(headline: string): { prefix: string; target: number; suffix: string } | null {
  const m = headline.match(/^([^\d]*)([\d,]+)(.*)$/);
  if (!m) return null;
  const target = parseInt(m[2].replace(/,/g, ""), 10);
  if (!Number.isFinite(target)) return null;
  return { prefix: m[1], target, suffix: m[3] };
}

function useCountUp(target: number, active: boolean, duration = 1000): number {
  const [display, setDisplay] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // driving displayed text, not a transform - native driver can't do this
    }).start();
    return () => anim.removeListener(id);
  }, [target, active]);
  return display;
}

const TIER_LABEL: Record<FlexStat["tier"], string> = {
  personal_record: "PERSONAL RECORD",
  segment_percentile: "REAL RESELLER DATA",
  weekly_rarity: "THIS WEEK",
  streak_milestone: "MILESTONE",
  fallback: "LOGGED",
};

interface FlexRevealContentProps {
  stat: FlexStat;
  itemName?: string | null;
  brand?: string | null;
  animate?: boolean; // false when used for a future off-screen capture snapshot
}

export function FlexRevealContent({ stat, itemName, brand, animate = true }: FlexRevealContentProps) {
  const parsed = parseHeadlineNumber(stat.headline);
  const count = useCountUp(parsed?.target ?? 0, animate && !!parsed, 1100);
  const headlineText = parsed
    ? `${parsed.prefix}${count.toLocaleString()}${parsed.suffix}`
    : stat.headline;

  // Badge "stamp" drop: falls in from above with a slight overshoot rotate,
  // timed just after the count-up gets moving so it reads as a sequence,
  // not simultaneous clutter.
  const stampAnim = useRef(new Animated.Value(0)).current;
  const ribbonAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) { stampAnim.setValue(1); ribbonAnim.setValue(1); return; }
    Animated.sequence([
      Animated.delay(280),
      Animated.spring(stampAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.delay(560),
      Animated.timing(ribbonAnim, { toValue: 1, duration: 380, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [animate]);

  // RN's Animated typings don't cleanly narrow a transform array mixing
  // different keys (translateY/rotate/scale) once it's built as a standalone
  // object instead of written inline in JSX - a known typings gap, not a
  // real type error (this project already runs with strict:false). Cast at
  // the one definition site rather than sprinkling casts at each usage.
  const stampStyle: any = {
    opacity: stampAnim,
    transform: [
      { translateY: stampAnim.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }) },
      { rotate: stampAnim.interpolate({ inputRange: [0, 1], outputRange: ["-10deg", "-4deg"] }) },
      { scale: stampAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 1.08, 1] }) },
    ],
  };
  const ribbonStyle: any = {
    opacity: ribbonAnim,
    transform: [{ translateY: ribbonAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  const title = buildDisplayTitle(itemName, brand);

  return (
    <View style={s.card}>
      {/* Glow behind the hero stat - react-native-svg, already linked, no new dependency */}
      <View style={s.glowWrap} pointerEvents="none">
        <Svg width={CARD_W} height={420}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="45%" r="55%">
              <Stop offset="0%" stopColor={C.green} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={C.green} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={CARD_W} height={420} fill="url(#glow)" />
        </Svg>
      </View>

      <View style={s.brandRow}>
        <View style={s.brandDot} />
        <Text style={s.brandWord}>VALUIQ</Text>
      </View>

      <View style={s.body}>
        <Text style={s.eyebrow}>{TIER_LABEL[stat.tier]}</Text>
        {title ? <Text style={s.itemName} numberOfLines={2}>{title}</Text> : null}

        <Text style={s.hero} numberOfLines={1} adjustsFontSizeToFit>{headlineText}</Text>

        {stat.badge ? (
          <Animated.View style={[s.badge, stampStyle]}>
            <Text style={s.badgeText}>{stat.badge}</Text>
          </Animated.View>
        ) : null}

        <Text style={s.subStat}>{stat.subStat}</Text>

        {stat.streakRibbon ? (
          <Animated.View style={[s.ribbon, ribbonStyle]}>
            <Text style={s.ribbonText}>{stat.streakRibbon}</Text>
          </Animated.View>
        ) : null}
      </View>

      <Text style={s.footer}>Real data. Your flip.</Text>
    </View>
  );
}

const CARD_W = Math.min(SCREEN_W, 480);

interface FlexRevealBodyProps {
  stat: FlexStat;
  itemName?: string | null;
  brand?: string | null;
  onClose: () => void;
  onShare?: () => void;
  onLeaderboard?: () => void;
}

// The reveal screen's content, with no Modal of its own - meant to be
// embedded inside whatever single Modal is already presenting the sale-log
// flow (LogSaleModal), never mounted alongside a second native Modal. The
// entrance animation triggers on mount, since mounting IS becoming visible
// here (no separate `visible` prop to watch).
export function FlexRevealBody({ stat, itemName, brand, onClose, onShare, onLeaderboard }: FlexRevealBodyProps) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }).start();
  }, []);

  const entranceStyle: any = {
    opacity: entrance,
    transform: [
      { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
      { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
    ],
  };

  return (
    <View style={s.screen}>
      <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={s.closeBtnText}>Done</Text>
      </TouchableOpacity>

      <View style={s.center}>
        <Animated.View style={entranceStyle}>
          <FlexRevealContent stat={stat} itemName={itemName} brand={brand} />
        </Animated.View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={onShare ?? (() => Alert.alert("Coming soon", "Sharing your flex is next up."))}
        >
          <Text style={s.primaryBtnText}>Share your flex →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={onLeaderboard ?? (() => Alert.alert("Coming soon", "The leaderboard is next up."))}
        >
          <Text style={s.secondaryBtnText}>See the leaderboard →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface FlexRevealCardProps {
  visible: boolean;
  stat: FlexStat | null;
  itemName?: string | null;
  brand?: string | null;
  onClose: () => void;
  onShare?: () => void;
  onLeaderboard?: () => void;
}

// Standalone Modal-wrapped version, for any future spot that wants to show
// the reveal on its own (not mid-flow after LogSaleModal - that path renders
// FlexRevealBody directly instead, see LogSaleModal.tsx).
export default function FlexRevealCard({
  visible, stat, itemName, brand, onClose, onShare, onLeaderboard,
}: FlexRevealCardProps) {
  if (!stat) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <FlexRevealBody stat={stat} itemName={itemName} brand={brand} onClose={onClose} onShare={onShare} onLeaderboard={onLeaderboard} />
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  closeBtn: { position: "absolute", top: 56, right: 22, zIndex: 10, padding: 6 },
  closeBtnText: { color: C.text3, fontSize: 15, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", width: "100%" },
  actions: { width: "100%", paddingHorizontal: 28, paddingBottom: 40, gap: 12 },
  primaryBtn: {
    backgroundColor: C.green, borderRadius: 16, paddingVertical: 18, alignItems: "center",
    shadowColor: C.green, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  primaryBtnText: { color: C.greenDark, fontSize: 17, fontWeight: "900" },
  secondaryBtn: {
    borderRadius: 16, paddingVertical: 16, alignItems: "center",
    borderWidth: 1, borderColor: C.borderHigh, backgroundColor: C.surface,
  },
  secondaryBtnText: { color: C.text2, fontSize: 15, fontWeight: "700" },

  card: { width: CARD_W, paddingHorizontal: 28, alignItems: "center" },
  glowWrap: { position: "absolute", top: -20, left: 0, alignItems: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 30 },
  brandDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.green, shadowColor: C.green, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  brandWord: { color: C.text2, fontSize: 15, fontWeight: "800", letterSpacing: 3 },
  body: { alignItems: "center" },
  eyebrow: { color: C.green, fontSize: 13, fontWeight: "800", letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" },
  itemName: { color: C.text2, fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 18, maxWidth: 280 },
  hero: {
    color: C.text1, fontSize: 76, fontWeight: "900", letterSpacing: -2, textAlign: "center",
    textShadowColor: C.green + "55", textShadowRadius: 30, textShadowOffset: { width: 0, height: 0 },
  },
  badge: {
    marginTop: 18, backgroundColor: C.greenBg, borderColor: C.green, borderWidth: 1.5,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
  },
  badgeText: { color: C.green, fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
  subStat: { color: C.text3, fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 22, maxWidth: 300 },
  ribbon: {
    marginTop: 16, backgroundColor: C.surfaceHigh, borderRadius: 100, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  ribbonText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  footer: { color: C.text4, fontSize: 11, fontWeight: "600", letterSpacing: 1, marginTop: 34, textTransform: "uppercase" },
});
