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
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, Alert, Share,
} from "react-native";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { C } from "../lib/theme";
import { FlexStat, money } from "../lib/flexReveal";
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

export function useCountUp(target: number, active: boolean, duration = 1000): number {
  // Lazy initializer: an inactive caller (ViewShot's off-screen, animate=
  // false capture twin; ProfitFlexHero on a non-hot tier) should never even
  // flash a 0 on its first render - start already at the final value.
  const [display, setDisplay] = useState(() => (active ? 0 : target));
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      // MEASURED BUG: this used to just `return` here, which meant
      // setDisplay was NEVER called for an inactive caller - display stayed
      // frozen at its useState(0) initial value forever. That's invisible
      // on-screen (ProfitFlexHero ignores `count` on its non-hot branch,
      // rendering heroProfit directly instead), but it's exactly what made
      // the off-screen ViewShot share-image capture (animate=false) render
      // "0th flip"/"$0" for every numeric-headline tier instead of the real
      // resolved number - the twin was never animating TO the target, it
      // just wasn't animating, full stop, and rendered its start value.
      setDisplay(target);
      return;
    }
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

// Returns false until `active` has been continuously true for delayMs -
// resets to false the instant `active` goes false, and clears its timer on
// unmount/dep-change. Used to gate the loading shimmer: the common case
// (fetchFlexStat resolves in a few hundred ms) should never show it at all -
// only a genuinely slow fetch (still unresolved past the threshold) earns a
// loading indicator.
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [flag, setFlag] = useState(false);
  useEffect(() => {
    if (!active) { setFlag(false); return; }
    const t = setTimeout(() => setFlag(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return flag;
}

// A subtle pulse where the hero number will land - never a blank gap, never
// implies a specific number is coming, just "this is still loading."
function HeroShimmer() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[s.heroShimmer, { opacity: pulse }]} />;
}

interface FlexRevealContentProps {
  // null while the crowd-comparison stat is still in flight - the card
  // renders instantly regardless (glow, brand, item name, and a real
  // placeholder line already known from the row), never blocking on network
  // before showing SOMETHING. See loadingSubStat.
  stat: FlexStat | null;
  itemName?: string | null;
  brand?: string | null;
  animate?: boolean; // false when used for a future off-screen capture snapshot
  // The row's own real profit/days line (flexReveal.ts's concreteLine()),
  // shown under a shimmering hero placeholder while stat is null - never a
  // fabricated number, just the true one shown before the crowd comparison
  // that decides the WINNING stat has come back.
  loadingSubStat?: string;
  // Overrides for the empty-Wins demo reveal (a REAL but not-this-user's
  // flip) - default text ("LOGGED" / "Real data. Your flip.") implies this
  // is the viewer's own sale, which a demo card must never claim. Every
  // other caller (a real logged sale) omits these and gets the unchanged
  // original copy.
  eyebrowOverride?: string;
  footerOverride?: string;
  // MEASURED BUG: every isLoss-gated element below used to read
  // `!!stat?.isLoss`, which is FALSE while `stat` is still null - i.e. for
  // the entire window between the reveal opening and fetchFlexStat()
  // resolving (a plain fetch with no timeout - see flexReveal.ts - so on a
  // slow/cold backend this window could last indefinitely). A real loss
  // rendered fully celebratory (green glow, "Share your win", "Real data.
  // Your flip.") for that whole window because nothing ever told the card
  // it was a loss until the network said so. knownNetProfit is the row's
  // OWN net_profit, already on hand with zero network call the instant the
  // reveal opens (SaleCaptureCard's save response / HistoryScreen's row) -
  // used as the isLoss source of truth until/unless stat resolves and
  // confirms it (the two can never disagree: stat.isLoss is computed from
  // this exact same column server-side).
  knownNetProfit?: number | null;
}

export function FlexRevealContent({ stat, itemName, brand, animate = true, loadingSubStat, eyebrowOverride, footerOverride, knownNetProfit }: FlexRevealContentProps) {
  // Scoped to THIS mount - the key={stat ? "resolved" : "loading"} switch
  // one level up (see FlexRevealBody) unmounts the "loading" instance the
  // moment stat resolves, which tears this timer down via the effect's own
  // cleanup before it could ever fire late or bleed into the next item.
  const showShimmer = useDelayedFlag(!stat, 450);
  // Resellers take losses - a negative net profit isn't a "win" and must
  // never get the same celebratory treatment (green glow, achievement
  // badge, fire-emoji streak ribbon) as a real profit. Prefers the resolved
  // stat once it lands, but never waits on it to know a LOSS - see
  // knownNetProfit above.
  const isLoss = stat ? !!stat.isLoss : (knownNetProfit != null && knownNetProfit < 0);
  const parsed = stat ? parseHeadlineNumber(stat.headline) : null;
  const count = useCountUp(parsed?.target ?? 0, animate && !!parsed, 1100);
  const headlineText = parsed
    ? `${parsed.prefix}${count.toLocaleString()}${parsed.suffix}`
    : (stat?.headline ?? "");

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
      {/* Glow behind the hero stat - react-native-svg, already linked, no new
          dependency. Muted red instead of the celebratory green when this
          stat is a loss - still a glow (this is still real data worth
          logging), just not a triumphant one. */}
      <View style={s.glowWrap} pointerEvents="none">
        <Svg width={CARD_W} height={420}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="45%" r="55%">
              <Stop offset="0%" stopColor={isLoss ? C.red : C.green} stopOpacity={isLoss ? 0.16 : 0.35} />
              <Stop offset="100%" stopColor={isLoss ? C.red : C.green} stopOpacity={0} />
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
        {/* A loss never earns tier bragging copy ("PERSONAL RECORD", "BEAT
            78%") even on the rare edge case a badge condition unrelated to
            money (fastest sale, streak count) technically qualified - falls
            back to the same neutral "LOGGED" a no-stat/loading state shows.
            An explicit eyebrowOverride (e.g. community-flip's "COMMUNITY
            FLIP") always wins regardless of win/loss. */}
        <Text style={[s.eyebrow, isLoss && s.eyebrowLoss]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{eyebrowOverride ?? (isLoss ? "LOGGED" : (stat ? TIER_LABEL[stat.tier] : "LOGGED"))}</Text>
        {/* No numberOfLines cap here on purpose: this is the FULL-detail
            reveal, opened from a short/truncated card - the one place the
            complete item name has to show, however many lines that takes.
            A cap + adjustsFontSizeToFit (the old approach) still truncates
            once a name is long enough to blow past the shrink floor; wrapping
            with no cap never does. */}
        {title ? <Text style={s.itemName}>{title}</Text> : null}

        {stat ? (
          <Text style={[s.hero, isLoss && s.heroLoss]} numberOfLines={1} adjustsFontSizeToFit>{headlineText}</Text>
        ) : isLoss ? (
          // Known loss, stat not resolved yet: the real signed amount is
          // already on hand (knownNetProfit) and a loss never earns tier
          // bragging copy anyway (see the eyebrow/badge/ribbon suppression
          // below), so there is nothing left to wait on the network for -
          // show the honest number now instead of shimmering on a number
          // we already know.
          <Text style={[s.hero, s.heroLoss]} numberOfLines={1} adjustsFontSizeToFit>{money(knownNetProfit as number)}</Text>
        ) : showShimmer ? (
          <HeroShimmer />
        ) : (
          // First 450ms of a load: reserve the exact same box, fully
          // transparent - no pulse, no visible loading element at all. The
          // common case (fetch resolves before this ever shows) goes
          // straight from nothing to the real number, no flash in between.
          <View style={[s.heroShimmer, { opacity: 0 }]} />
        )}

        {/* Badge and streak ribbon are achievement/celebration language
            ("PERSONAL BEST", "🔥 5th flip this month") - suppressed outright
            on a loss rather than shown in some muted color, since there's no
            honest way to badge-stamp a card that lost money without it
            reading as a mixed signal. */}
        {stat?.badge && !isLoss ? (
          <Animated.View style={[s.badge, stampStyle]}>
            <Text style={s.badgeText}>{stat.badge}</Text>
          </Animated.View>
        ) : null}

        {(stat ? stat.subStat : loadingSubStat) ? (
          <Text style={s.subStat}>{stat ? stat.subStat : loadingSubStat}</Text>
        ) : null}

        {stat?.streakRibbon && !isLoss ? (
          <Animated.View style={[s.ribbon, ribbonStyle]}>
            <Text style={s.ribbonText}>{stat.streakRibbon}</Text>
          </Animated.View>
        ) : null}
      </View>

      <Text style={s.footer}>{footerOverride ?? (isLoss ? "Real numbers, logged." : "Real data. Your flip.")}</Text>
    </View>
  );
}

const CARD_W = Math.min(SCREEN_W, 480);

interface FlexRevealBodyProps {
  stat: FlexStat | null;
  itemName?: string | null;
  brand?: string | null;
  loadingSubStat?: string;
  eyebrowOverride?: string;
  footerOverride?: string;
  onClose: () => void;
  onShare?: () => void;
  onLeaderboard?: () => void;
  // Demo reveal (empty-Wins teaser) has nothing of the viewer's own to
  // share - overriding just the primary button's label (and pairing it with
  // an onShare override that routes somewhere useful instead of the image-
  // share flow) keeps this component's real-flip behavior byte-for-byte
  // unchanged for every other caller.
  primaryLabelOverride?: string;
  // Community-flip reveal (CommunityScreen) has no leaderboard rank of its
  // own to jump to - the viewer is already IN the community feed the
  // leaderboard button would send them to. Every other caller (the user's
  // own logged win) omits this and keeps the real leaderboard button.
  hideLeaderboardButton?: boolean;
  // See FlexRevealContentProps.knownNetProfit - same fallback, needed again
  // here since this component's own isLoss (below) drives the primary
  // button's label/action independently of FlexRevealContent's copy.
  knownNetProfit?: number | null;
}

// The reveal screen's content, with no Modal of its own - meant to be
// embedded inside whatever single Modal is already presenting the sale-log
// flow (LogSaleModal), never mounted alongside a second native Modal. The
// entrance animation triggers on mount, since mounting IS becoming visible
// here (no separate `visible` prop to watch).
export function FlexRevealBody({ stat, itemName, brand, loadingSubStat, eyebrowOverride, footerOverride, onClose, onShare, onLeaderboard, primaryLabelOverride, hideLeaderboardButton, knownNetProfit }: FlexRevealBodyProps) {
  const entrance = useRef(new Animated.Value(0)).current;
  const shareCardRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);
  // Same stat-or-local fallback as FlexRevealContent (see knownNetProfit) -
  // this used to be `!!stat?.isLoss` alone, which is why a known loss could
  // still get the "Share your win ->" button/action while fetchFlexStat was
  // in flight (or never resolved on a slow backend).
  const isLoss = stat ? !!stat.isLoss : (knownNetProfit != null && knownNetProfit < 0);

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

  const shareCaption = stat
    ? `${stat.headline} · ${stat.subStat}\n\nFlipped it with ValuIQ 📲`
    : "Flipped it with ValuIQ 📲";

  // Self-contained by default (no onShare prop needed from any caller) -
  // captures the off-screen, unanimated copy of the SAME card the user is
  // looking at (see the hidden ViewShot below) into a PNG and opens the
  // native share sheet, mirroring ScannerScreen.tsx's shareResultImage() for
  // ShareCard exactly. Gives immediate feedback on tap (button label swaps
  // to "Preparing…" via `sharing`) rather than sitting dead until the
  // capture resolves.
  async function shareFlexImage() {
    if (sharing) return;
    if (!stat) {
      Alert.alert("Hang on", "Still loading your stats — try again in a moment.");
      return;
    }
    setSharing(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available || !shareCardRef.current?.capture) {
        // No native share sheet on this device/platform - fall back to a
        // plain-text share rather than a dead button.
        await Share.share({ message: shareCaption });
        return;
      }
      const uri = await shareCardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your ValuIQ win" });
    } catch {
      // Capture/share failed - never crash, fall back to plain text so the
      // tap still DOES something.
      try { await Share.share({ message: shareCaption }); } catch {}
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={s.screen}>
      <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={s.closeBtnText}>Done</Text>
      </TouchableOpacity>

      <View style={s.center}>
        <Animated.View style={entranceStyle}>
          {/* key forces a remount (not just a prop update) the moment stat
              resolves from null - loading to real, so the count-up/badge-
              stamp/ribbon entrance animations replay for the real numbers
              instead of silently snapping in, since their own effects are
              keyed to mount, not to `stat` changing. */}
          <FlexRevealContent key={stat ? "resolved" : "loading"} stat={stat} itemName={itemName} brand={brand} loadingSubStat={loadingSubStat} eyebrowOverride={eyebrowOverride} footerOverride={footerOverride} knownNetProfit={knownNetProfit} />
        </Animated.View>
      </View>

      {/* Off-screen, unanimated twin of the card above - captured (never
          displayed) for the share image, exactly the way ScannerScreen.tsx
          captures ShareCard off-screen. Using a second static instance
          (animate=false) rather than capturing the live/animated one avoids
          ever snapshotting a mid-count-up frame, and keeps the Done/Share
          buttons (siblings of the card, not part of it) out of the image. */}
      <View style={{ position: "absolute", top: 0, left: -9999 }} pointerEvents="none">
        <ViewShot ref={shareCardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
          <FlexRevealContent stat={stat} itemName={itemName} brand={brand} animate={false} eyebrowOverride={eyebrowOverride} footerOverride={footerOverride} knownNetProfit={knownNetProfit} />
        </ViewShot>
      </View>

      <View style={s.actions}>
        <TouchableOpacity
          style={s.primaryBtn}
          // A loss isn't a "win" to share - a caller that already customized
          // this button (community-flip's onShare->navigate, WinsDemoCard's
          // onShare->onScanNow) always keeps ITS OWN explicit choice
          // regardless of win/loss; only the plain "share my actual sale"
          // default (no onShare/primaryLabelOverride passed at all - the
          // real personal-win path) swaps to closing the card instead of
          // generating a share image for a financial loss.
          onPress={onShare ?? (isLoss ? onClose : shareFlexImage)}
          disabled={sharing}
        >
          {/* numberOfLines+adjustsFontSizeToFit as a backstop against
              wrapping/overflow on narrow screens - same guard applied across
              this sweep, not a copy change (that's a separate, undecided fix). */}
          <Text style={s.primaryBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {sharing ? "Preparing…" : (primaryLabelOverride ?? (isLoss ? "Done" : "Share your win →"))}
          </Text>
        </TouchableOpacity>
        {hideLeaderboardButton ? null : (
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={onLeaderboard ?? (() => Alert.alert("Coming soon", "The leaderboard is next up."))}
          >
            <Text style={s.secondaryBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>See the leaderboard →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

interface FlexRevealCardProps {
  visible: boolean;
  // null is a valid, expected state here now - "visible but still loading",
  // not "nothing to show". Gate on `visible`, not on `stat`.
  stat: FlexStat | null;
  itemName?: string | null;
  brand?: string | null;
  loadingSubStat?: string;
  eyebrowOverride?: string;
  footerOverride?: string;
  primaryLabelOverride?: string;
  hideLeaderboardButton?: boolean;
  onClose: () => void;
  onShare?: () => void;
  onLeaderboard?: () => void;
  knownNetProfit?: number | null;
}

// Standalone Modal-wrapped version, for any future spot that wants to show
// the reveal on its own (not mid-flow after LogSaleModal - that path renders
// FlexRevealBody directly instead, see LogSaleModal.tsx).
export default function FlexRevealCard({
  visible, stat, itemName, brand, loadingSubStat, eyebrowOverride, footerOverride, primaryLabelOverride, hideLeaderboardButton, onClose, onShare, onLeaderboard, knownNetProfit,
}: FlexRevealCardProps) {
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <FlexRevealBody stat={stat} itemName={itemName} brand={brand} loadingSubStat={loadingSubStat} eyebrowOverride={eyebrowOverride} footerOverride={footerOverride} primaryLabelOverride={primaryLabelOverride} hideLeaderboardButton={hideLeaderboardButton} onClose={onClose} onShare={onShare} onLeaderboard={onLeaderboard} knownNetProfit={knownNetProfit} />
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
  // Muted gray instead of the celebratory green - even neutral "LOGGED" copy
  // still reads as a win if it's rendered in the app's money-success color.
  eyebrowLoss: { color: C.text3 },
  itemName: { color: C.text2, fontSize: 16, fontWeight: "600", textAlign: "center", marginBottom: 18, maxWidth: 280 },
  hero: {
    color: C.text1, fontSize: 76, fontWeight: "900", letterSpacing: -2, textAlign: "center",
    textShadowColor: C.green + "55", textShadowRadius: 30, textShadowOffset: { width: 0, height: 0 },
  },
  heroLoss: {
    color: C.red,
    textShadowColor: C.red + "40",
  },
  heroShimmer: {
    width: 190, height: 66, borderRadius: 16, backgroundColor: C.surfaceHigh,
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
