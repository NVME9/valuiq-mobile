// RevealScreen.tsx — "Share reveal": a 9:16 animated reveal card for ANY
// scan (buy or skip, priced or not - this is acquisition, see
// ScannerScreen.tsx's own "Share reveal" button comment), built the same
// no-new-native-module way FlexRevealCard.tsx/ProfitFlexHero.tsx already
// are - Animated (core RN) for the count-up/entrance, react-native-view-shot
// + expo-sharing for export. No Reanimated, no gesture-handler, no audio.
//
// NUMBERS ARE READ-ONLY (item 2): every number this screen shows comes
// straight from props the caller (ScannerScreen) computed off the real
// scan - this component never recomputes, edits, or second-guesses them,
// and never renders a number the caller didn't already decide is unlocked
// (see ScannerScreen's own "only pass what's unlocked" comment at its call
// site). Personalization (handle/caption/look) and the reveal PHOTO are the
// only things a user can change here - both are presentation, saved only
// on-device (lib/revealPrefs.ts), never altering the underlying scan.
import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing,
  Dimensions, Share, TextInput, ScrollView, ActivityIndicator,
} from "react-native";
import type ViewShotRef from "react-native-view-shot";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";
import Wordmark from "./Wordmark";
import { useCountUp } from "./FlexRevealCard";
import { money } from "../lib/flexReveal";
import { loadRevealPrefs, saveRevealPrefs, RevealPrefs, RevealLook } from "../lib/revealPrefs";
import { logEvent } from "../lib/api";
import RevealPhotoEditor, { PHOTO_EDITOR_AVAILABLE } from "./RevealPhotoEditor";

// OTA-SAFE IMPORTS (2026-11-11, crash incident): react-native-view-shot's
// and expo-sharing's native entry points both resolve their native module
// at MODULE SCOPE (react-native-view-shot via
// TurboModuleRegistry.getEnforcing, which throws outright if missing) -
// a static top-level `import` of either can't be wrapped in try/catch
// (Metro evaluates it unconditionally, before this file's own code runs),
// so a missing native module would crash the WHOLE APP at launch, not just
// this screen - this screen is reachable from ScannerScreen, which is
// eagerly imported by App.tsx. A guarded require() can be wrapped, and
// every call site below already null-checks and falls back to the plain
// text Share.share() (core RN, never native-module-dependent) when either
// is unavailable - see share() and the off-screen ViewShot render below.
let ViewShot: typeof import("react-native-view-shot").default | null = null;
try { ViewShot = require("react-native-view-shot").default; } catch { ViewShot = null; }
let Sharing: typeof import("expo-sharing") | null = null;
try { Sharing = require("expo-sharing"); } catch { Sharing = null; }

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = Math.min(SCREEN_W - 56, 300);
const CARD_H = Math.round((CARD_W * 16) / 9);

// Zero-choice defaults (item 3): "dark" matches the app's own theme, so a
// first-ever share with no personalization still looks intentional, not
// like an unfinished generic template.
const LOOKS: Record<RevealLook, { bg: string; card: string; text: string; sub: string; accent: string; isLight: boolean }> = {
  dark:  { bg: "#0a0906", card: "#17150f", text: "#f5f2ed", sub: "#bdb8b0", accent: C.green, isLight: false },
  light: { bg: "#f0ece3", card: "#ffffff", text: "#1c1a17", sub: "#6b655c", accent: "#2c7a1f", isLight: true },
  bold:  { bg: "#120a00", card: "#201200", text: "#fff6e0", sub: "#e8c26b", accent: C.gold, isLight: false },
};

function useDelayedActive(delayMs: number): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setActive(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return active;
}

interface RevealScreenProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  scanId: string | null;
  itemName: string;
  // The scan's ORIGINAL photo - read-only source. The reveal photo the user
  // edits (RevealPhotoEditor) is this component's OWN local state, seeded
  // from this prop but never written back to it.
  photoBase64: string | null;
  enteredPrice: number | null;
  typicalPrice: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  // null when withheld (locked plan, thin-sample withholding, etc.) - this
  // screen then simply skips that beat rather than showing a placeholder.
  profitAfterFees: number | null;
  profitLabel: string;
  verdictLabel: string | null;
  verdictAccent: string;
  displayName?: string | null;
  creatorCode?: string | null;
}

interface CardContentProps {
  look: RevealLook;
  handle: string;
  caption: string;
  photoUri: string | null;
  itemName: string;
  enteredPrice: number | null;
  typicalPrice: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  profitAfterFees: number | null;
  profitLabel: string;
  verdictLabel: string | null;
  verdictAccent: string;
  creatorCode?: string | null;
  animate: boolean;
}

function RevealCardContent({
  look, handle, caption, photoUri, itemName, enteredPrice, typicalPrice, priceLow, priceHigh,
  profitAfterFees, profitLabel, verdictLabel, verdictAccent, creatorCode, animate,
}: CardContentProps) {
  const palette = LOOKS[look];
  const hasRange = priceLow != null && priceHigh != null;
  // "Worth" target: when a tag price was entered, the first beat's big
  // number is the worth/typical value (the markup reveal); when it wasn't,
  // the spec calls for the SAME typical-sale-and-range beat, just with no
  // "you paid" line above it (see this file's own header comment).
  const worthTarget = typicalPrice ?? priceHigh ?? 0;
  const beat2Active = useDelayedActive(animate ? 1050 : 0);
  const paidCount = useCountUp(enteredPrice ?? 0, animate && enteredPrice != null, 700);
  const worthCount = useCountUp(worthTarget, animate, 900);
  const profitCount = useCountUp(Math.round(Math.abs(profitAfterFees ?? 0)), beat2Active && profitAfterFees != null, 900);
  const profitSign = (profitAfterFees ?? 0) < 0 ? "-" : "+";
  const profitColor = (profitAfterFees ?? 0) < 0 ? C.red : palette.accent;

  const beat2Fade = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(beat2Fade, { toValue: 1, duration: 500, delay: 950, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [animate]);

  return (
    <View style={[st.card, { width: CARD_W, height: CARD_H, backgroundColor: palette.card }]}>
      <View style={[st.photoWrap, { height: Math.round(CARD_H * 0.52) }]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={st.photo} resizeMode="cover" />
        ) : (
          <View style={[st.photo, st.photoPlaceholder]} />
        )}
        <View style={st.photoShade} />
        {handle ? <Text style={st.handle} numberOfLines={1}>{handle}</Text> : null}
      </View>

      <View style={st.body}>
        {caption ? <Text style={[st.caption, { color: palette.sub }]} numberOfLines={2}>{caption}</Text> : null}
        <Text style={[st.itemName, { color: palette.text }]} numberOfLines={1}>{itemName}</Text>

        {verdictLabel ? (
          <View style={[st.badge, { borderColor: verdictAccent, backgroundColor: verdictAccent + "1f" }]}>
            <Text style={[st.badgeText, { color: verdictAccent }]} numberOfLines={1}>{verdictLabel}</Text>
          </View>
        ) : null}

        {enteredPrice != null ? (
          <Text style={[st.paidLine, { color: palette.sub }]}>You paid {money(paidCount)}</Text>
        ) : (
          <Text style={[st.paidLine, { color: palette.sub }]}>Typical sale</Text>
        )}
        <Text style={[st.worth, { color: palette.text }]} numberOfLines={1} adjustsFontSizeToFit>{money(worthCount)}</Text>
        {hasRange ? (
          <Text style={[st.rangeLine, { color: palette.sub }]}>${priceLow}–${priceHigh} range</Text>
        ) : null}

        {profitAfterFees != null ? (
          <Animated.View style={{ opacity: beat2Fade, marginTop: 14 }}>
            <Text style={[st.profit, { color: profitColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {profitSign}{money(profitCount)}
            </Text>
            <Text style={[st.profitLabel, { color: palette.sub }]}>{profitLabel}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={st.footer}>
        <View style={st.footerMark}>
          <ValuIQLogo accent={palette.accent} size={13} />
          <Wordmark style={[st.footerWordmark, { color: palette.sub }]} />
        </View>
        {creatorCode ? <Text style={[st.footerCode, { color: palette.sub }]} numberOfLines={1}>Code: {creatorCode}</Text> : null}
      </View>
    </View>
  );
}

export default function RevealScreen(props: RevealScreenProps) {
  const {
    visible, onClose, token, scanId, itemName, photoBase64, enteredPrice, typicalPrice,
    priceLow, priceHigh, profitAfterFees, profitLabel, verdictLabel, verdictAccent, displayName, creatorCode,
  } = props;

  const [prefs, setPrefs] = useState<RevealPrefs>({ handle: "", caption: "", look: "dark" });
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  // The reveal photo - starts as the scan's own photo, but is THIS screen's
  // own copy from here on (see RevealPhotoEditor's header comment) - the
  // original scan photo prop is never reassigned.
  const [revealPhoto, setRevealPhoto] = useState<string | null>(photoBase64);
  const [playKey, setPlayKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<ViewShotRef>(null);
  const openedLoggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRevealPhoto(photoBase64);
    setPlayKey((k) => k + 1);
    loadRevealPrefs(displayName).then(setPrefs);
    // LOG reveal_opened (item 7) - once per open, not once per re-render;
    // openedLoggedFor guards a re-render (e.g. prefs loading) from firing a
    // second event for the same open.
    const openKey = `${scanId ?? "none"}:${Date.now()}`;
    if (openedLoggedFor.current !== openKey) {
      openedLoggedFor.current = openKey;
      logEvent(token, "reveal_opened", { scanId }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function updatePrefs(next: Partial<RevealPrefs>) {
    setPrefs((p) => {
      const merged = { ...p, ...next };
      saveRevealPrefs(merged);
      return merged;
    });
  }

  async function share() {
    if (sharing) return;
    setSharing(true);
    try {
      const available = Sharing ? await Sharing.isAvailableAsync() : false;
      if (!available || !Sharing || !shareCardRef.current?.capture) {
        await Share.share({ message: prefs.caption || "Check this out — ValuIQ" });
      } else {
        const uri = await shareCardRef.current.capture();
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your ValuIQ reveal" });
      }
      logEvent(token, "reveal_shared", { scanId }).catch(() => {});
    } catch {
      try { await Share.share({ message: prefs.caption || "Check this out — ValuIQ" }); } catch {}
    } finally {
      setSharing(false);
    }
  }

  if (!visible) return null;

  const cardProps = {
    look: prefs.look, handle: prefs.handle, caption: prefs.caption,
    photoUri: revealPhoto ? `data:image/jpeg;base64,${revealPhoto}` : null,
    itemName, enteredPrice, typicalPrice, priceLow, priceHigh, profitAfterFees, profitLabel,
    verdictLabel, verdictAccent, creatorCode,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[st.root, { backgroundColor: LOOKS[prefs.look].bg }]}>
        <View style={st.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={st.closeText}>Close</Text>
          </TouchableOpacity>
          <Text style={st.topTitle}>Share reveal</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView contentContainerStyle={st.scrollBody} keyboardShouldPersistTaps="handled">
          {/* Tap-to-replay (easy to screen-record, item 5): a viewer who
              starts recording AFTER opening this screen can just tap the
              card to re-trigger the count-up sequence cleanly, instead of
              re-opening the whole screen. */}
          <TouchableOpacity activeOpacity={0.9} onPress={() => setPlayKey((k) => k + 1)}>
            <RevealCardContent key={`live-${playKey}`} {...cardProps} animate />
          </TouchableOpacity>
          <Text style={st.replayHint}>Tap the card to replay</Text>

          {PHOTO_EDITOR_AVAILABLE ? (
            <TouchableOpacity style={st.editPhotoBtn} onPress={() => setEditorOpen(true)}>
              <Text style={st.editPhotoText}>✏️  Edit photo</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={st.personalizeHeader} onPress={() => setPersonalizeOpen((v) => !v)}>
            <Text style={st.personalizeHeaderText}>Personalize</Text>
            <Text style={st.personalizeChevron}>{personalizeOpen ? "▲" : "▼"}</Text>
          </TouchableOpacity>
          {personalizeOpen && (
            <View style={st.personalizePanel}>
              <Text style={st.fieldLabel}>Handle</Text>
              <TextInput
                style={st.input}
                value={prefs.handle}
                onChangeText={(t) => updatePrefs({ handle: t })}
                placeholder="@yourname"
                placeholderTextColor={C.text4}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={st.fieldLabel}>Caption</Text>
              <TextInput
                style={st.input}
                value={prefs.caption}
                onChangeText={(t) => updatePrefs({ caption: t })}
                placeholder="Real find, real numbers."
                placeholderTextColor={C.text4}
                maxLength={80}
              />
              <Text style={st.fieldLabel}>Look</Text>
              <View style={st.lookRow}>
                {(["dark", "light", "bold"] as RevealLook[]).map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[st.lookSwatch, { backgroundColor: LOOKS[l].card, borderColor: prefs.look === l ? LOOKS[l].accent : C.border }]}
                    onPress={() => updatePrefs({ look: l })}
                  >
                    <Text style={{ color: LOOKS[l].text, fontSize: 11, fontWeight: "800" }}>{l[0].toUpperCase() + l.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Off-screen, unanimated twin - captured for export, never shown.
            Same pattern FlexRevealCard.tsx uses for its own share image, so
            the exported PNG always shows the fully-resolved numbers, never
            a mid-count-up frame. */}
        {ViewShot ? (
          <View style={{ position: "absolute", top: 0, left: -9999 }} pointerEvents="none">
            <ViewShot ref={shareCardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
              <RevealCardContent {...cardProps} animate={false} />
            </ViewShot>
          </View>
        ) : null}

        <View style={st.bottomBar}>
          <TouchableOpacity style={st.shareBtn} onPress={share} disabled={sharing} activeOpacity={0.85}>
            {sharing ? <ActivityIndicator color={C.greenDark} /> : <Text style={st.shareBtnText}>Share reveal →</Text>}
          </TouchableOpacity>
        </View>

        <RevealPhotoEditor
          visible={editorOpen}
          sourceBase64={revealPhoto || photoBase64 || ""}
          originalBase64={photoBase64 || ""}
          onCancel={() => setEditorOpen(false)}
          onSave={(b64) => { setRevealPhoto(b64); setEditorOpen(false); }}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 20, paddingBottom: 10 },
  closeText: { color: C.text3, fontSize: 15, fontWeight: "700", width: 48 },
  topTitle: { color: C.text1, fontSize: 15, fontWeight: "800" },
  scrollBody: { alignItems: "center", paddingBottom: 20 },
  replayHint: { color: C.text4, fontSize: 11, marginTop: 8, marginBottom: 14 },
  editPhotoBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, marginBottom: 14 },
  editPhotoText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  personalizeHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 18 },
  personalizeHeaderText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  personalizeChevron: { color: C.text4, fontSize: 11 },
  personalizePanel: { width: CARD_W + 24, paddingHorizontal: 18, paddingTop: 4 },
  fieldLabel: { color: C.text4, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text1, fontSize: 14, padding: 11 },
  lookRow: { flexDirection: "row", gap: 10 },
  lookSwatch: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  bottomBar: { paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10 },
  shareBtn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  shareBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },

  card: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: C.border },
  photoWrap: { width: "100%", position: "relative" },
  photo: { width: "100%", height: "100%" },
  photoPlaceholder: { backgroundColor: C.surfaceHigh },
  photoShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "45%", backgroundColor: "rgba(0,0,0,0.35)" },
  handle: { position: "absolute", left: 12, bottom: 10, color: "#fff", fontSize: 13, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12, alignItems: "center" },
  caption: { fontSize: 11, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  itemName: { fontSize: 13, fontWeight: "800", textAlign: "center", marginBottom: 8, maxWidth: CARD_W - 32 },
  badge: { borderWidth: 1.2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  badgeText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  paidLine: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  worth: { fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 2 },
  rangeLine: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  profit: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5, textAlign: "center" },
  profitLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingBottom: 10, paddingTop: 4 },
  footerMark: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerWordmark: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  footerCode: { fontSize: 9, fontWeight: "700" },
});
