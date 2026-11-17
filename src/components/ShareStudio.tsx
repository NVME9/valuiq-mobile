// ShareStudio.tsx — the single post-scan share screen, replacing
// RevealScreen.tsx/RevealPhotoEditor.tsx (both removed). One full-screen
// Modal: pick a format (Story/Feed/Square) and a look (Dark/Light/Bold/
// Clean), pinch/pan/double-tap the photo to crop, personalize (handle +
// caption chips + hide-price), then Share. The on-screen preview and the
// off-screen capture render the exact same StudioCardContent at the same
// aspect ratio, just at different pixel sizes - react-native-view-shot's
// own width/height resize option (see CaptureOptions) is what guarantees
// the exported PNG is pixel-identical in composition to what's on screen,
// always exactly 1080px wide (item 2/7).
//
// NO GESTURE-HANDLER, NO REANIMATED, NO MEDIA-LIBRARY (build #46 audit -
// scripts/native-modules-build46.json): pinch/pan/double-tap is plain
// PanResponder + Animated (core RN), same posture RevealPhotoEditor.tsx
// used. There is no Save button - expo-media-library isn't in the binary -
// the system share sheet (expo-sharing) already offers "Save Image" for a
// shared PNG, so Save degrades to that instead of a broken button.
//
// OTA-SAFE IMPORTS: ViewShot/Sharing/FileSystem resolve native modules at
// module scope - a guarded require (not a static import) keeps a missing
// module from crashing the whole app at launch, same convention the file
// this replaces used. Clipboard/AsyncStorage are statically imported, same
// as every other screen that already uses them directly.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Image,
  Dimensions, Share, TextInput, ScrollView, ActivityIndicator, Switch, PanResponder,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";
import Wordmark from "./Wordmark";
import {
  StudioFormat, StudioLook, StudioConfidence, Size, Point,
  FORMAT_SIZES, FORMAT_LABELS, LOOK_LABELS,
  frameSizeForFormat, coverScale, clampZoomScale, clampPanTranslate,
  buildCardText, buildWinCardText, formatFileSize,
} from "../lib/shareStudio";
import { loadStudioPrefs, saveStudioPrefs, StudioPrefs } from "../lib/studioPrefs";
import { logEvent } from "../lib/api";

let ViewShot: typeof import("react-native-view-shot").default | null = null;
try { ViewShot = require("react-native-view-shot").default; } catch { ViewShot = null; }
let Sharing: typeof import("expo-sharing") | null = null;
try { Sharing = require("expo-sharing"); } catch { Sharing = null; }
let FileSystem: typeof import("expo-file-system") | null = null;
try { FileSystem = require("expo-file-system"); } catch { FileSystem = null; }

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const VIEWPORT_W = SCREEN_W - 40;
const VIEWPORT_H = Math.min(SCREEN_H * 0.52, 520);
const NOMINAL_W = 360; // off-screen capture's own CSS width - ViewShot resizes the raster to FORMAT_SIZES, this is just the layout size
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;

const LOOKS: Record<StudioLook, { bg: string; card: string; text: string; sub: string; accent: string; chip: string; onAccent: string; variant: "standard" | "bold" | "clean" }> = {
  // onAccent is the Share button's own label color against that look's
  // accent background - MEASURED: "light"'s accent is a dark green
  // ("#2c7a1f"), so the other three looks' near-black greenDark label read
  // as low-contrast there and needed a white label instead.
  dark: { bg: "#0a0906", card: "#17150f", text: "#f5f2ed", sub: "#bdb8b0", accent: C.green, chip: "rgba(255,255,255,0.08)", onAccent: C.greenDark, variant: "standard" },
  light: { bg: "#f0ece3", card: "#ffffff", text: "#1c1a17", sub: "#6b655c", accent: "#2c7a1f", chip: "rgba(0,0,0,0.06)", onAccent: "#ffffff", variant: "standard" },
  bold: { bg: "#120a00", card: "#0c0600", text: "#fff6e0", sub: "#e8c26b", accent: C.gold, chip: "rgba(255,255,255,0.1)", onAccent: "#2a1c00", variant: "bold" },
  clean: { bg: "#f5f5f3", card: "#ffffff", text: "#161513", sub: "#78746c", accent: C.green, chip: "rgba(0,0,0,0.05)", onAccent: C.greenDark, variant: "clean" },
};

const CAPTION_PRESETS = ["Found this at the thrift", "Would you flip it?", "Pass or buy?", "Real find, real numbers."];

export interface ShareStudioWinData {
  boughtPrice: number;
  soldPrice: number;
  profit: number;
}

interface CropState { scale: number; translate: Point }
const DEFAULT_CROP: CropState = { scale: 1, translate: { x: 0, y: 0 } };

interface StudioCardContentProps {
  look: StudioLook;
  frame: Size;
  photoUri: string | null;
  imgSize: Size | null;
  crop: CropState;
  handle: string;
  isWin: boolean;
  winHeadline?: string;
  cardText: { itemName: string; verdictText: string | null; priceLine: string | null; statsLine: string | null };
  isLoss: boolean;
}

export function StudioCardContent({ look, frame, photoUri, imgSize, crop, handle, isWin, winHeadline, cardText, isLoss }: StudioCardContentProps) {
  const palette = LOOKS[look];
  const abs = imgSize ? coverScale(imgSize, frame) * crop.scale : 1;
  const displayW = imgSize ? imgSize.w * abs : frame.w;
  const displayH = imgSize ? imgSize.h * abs : frame.h;
  const accent = isLoss ? C.red : palette.accent;
  // "clean" reserves most of the frame for the photo; everything else sits
  // in a slim strip underneath, never over the image (item 8: no overlap).
  const photoH = palette.variant === "clean" ? Math.round(frame.h * 0.74) : Math.round(frame.h * 0.56);

  return (
    <View style={[cs.card, { width: frame.w, height: frame.h, backgroundColor: palette.card }]}>
      <View style={[cs.photoWrap, { height: photoH }]}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ position: "absolute", width: displayW, height: displayH, left: frame.w / 2 - displayW / 2 + crop.translate.x, top: photoH / 2 - displayH / 2 + crop.translate.y }}
            resizeMode="cover"
          />
        ) : (
          <View style={[cs.photo, { backgroundColor: C.surfaceHigh }]} />
        )}
        {handle ? (
          <View style={cs.handleChip}>
            <Text style={cs.handleText} numberOfLines={1}>{handle}</Text>
          </View>
        ) : null}
      </View>

      <View style={[cs.body, palette.variant === "bold" && cs.bodyBold]}>
        {isWin ? (
          <Text
            style={[cs.winHeadline, { color: accent }, palette.variant === "bold" && cs.winHeadlineBold]}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            ellipsizeMode="clip"
          >
            {winHeadline}
          </Text>
        ) : (
          <>
            {cardText.verdictText ? (
              <Text
                style={[
                  cs.verdict,
                  { color: accent },
                  palette.variant === "bold" && cs.verdictBold,
                  palette.variant === "clean" && cs.verdictClean,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {cardText.verdictText}
              </Text>
            ) : null}
            <Text
              style={[cs.itemName, { color: palette.text }, palette.variant === "clean" && cs.itemNameClean]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              ellipsizeMode="clip"
            >
              {cardText.itemName}
            </Text>
            {cardText.priceLine ? (
              <Text style={[cs.priceLine, { color: palette.sub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} ellipsizeMode="clip">
                {cardText.priceLine}
              </Text>
            ) : null}
            {cardText.statsLine && palette.variant !== "bold" ? (
              <Text style={[cs.statsLine, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {cardText.statsLine}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={cs.footer}>
        <View style={cs.footerMark}>
          <ValuIQLogo accent={palette.accent} size={12} />
          <Wordmark style={[cs.footerWordmark, { color: palette.sub }]} />
        </View>
      </View>
    </View>
  );
}

export interface ShareStudioProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  scanId: string | null;
  itemName: string;
  photoBase64: string | null;
  paidPrice: number | null;
  sellPrice: number | null;
  profit: number | null;
  roi: number | null;
  profitConfidence: StudioConfidence;
  verdictEmoji?: string | null;
  verdictLabel?: string | null;
  displayName?: string | null;
  isOwner?: boolean;
  winData?: ShareStudioWinData | null;
}

export default function ShareStudio(props: ShareStudioProps) {
  const {
    visible, onClose, token, scanId, itemName, photoBase64, paidPrice, sellPrice,
    profit, roi, profitConfidence, verdictEmoji, verdictLabel, displayName, isOwner, winData,
  } = props;

  const [prefs, setPrefs] = useState<StudioPrefs>({ handle: "", look: "dark", format: "story", hidePrice: false });
  const [isWin, setIsWin] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [imgSize, setImgSize] = useState<Size | null>(null);
  const [cropByFormat, setCropByFormat] = useState<Record<StudioFormat, CropState>>({
    story: DEFAULT_CROP, feed: DEFAULT_CROP, square: DEFAULT_CROP,
  });
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);
  const [copiedChip, setCopiedChip] = useState<string | null>(null);
  const [debug, setDebug] = useState<{ w: number; h: number; bytes: number; scale: number } | null>(null);

  const shareCardRef = useRef<InstanceType<NonNullable<typeof ViewShot>>>(null);
  const openedLoggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    loadStudioPrefs(displayName).then(setPrefs);
    setImgSize(null);
    setCropByFormat({ story: DEFAULT_CROP, feed: DEFAULT_CROP, square: DEFAULT_CROP });
    setIsWin(!!winData);
    setStatus(null);
    const openKey = `${scanId ?? "none"}:${Date.now()}`;
    if (openedLoggedFor.current !== openKey) {
      openedLoggedFor.current = openKey;
      logEvent(token, "share_studio_opened", { scanId }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function updatePrefs(next: Partial<StudioPrefs>) {
    setPrefs((p) => {
      const merged = { ...p, ...next };
      saveStudioPrefs(merged);
      return merged;
    });
  }

  const photoUri = photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : null;
  const previewFrame = useMemo(() => frameSizeForFormat(prefs.format, VIEWPORT_W, VIEWPORT_H), [prefs.format]);
  const nominalFrame = useMemo(() => {
    const { w: fw, h: fh } = FORMAT_SIZES[prefs.format];
    return { w: NOMINAL_W, h: Math.round((NOMINAL_W * fh) / fw) };
  }, [prefs.format]);
  const crop = cropByFormat[prefs.format];

  const isLoss = (winData ? winData.profit : profit) != null && (winData ? winData.profit : profit)! < 0;

  const cardText = useMemo(
    () => buildCardText({
      itemName,
      verdictEmoji,
      verdictLabel: verdictLabel ?? null,
      paidPrice,
      sellPrice,
      profit,
      roi,
      confidence: profitConfidence,
      hidePrice: prefs.hidePrice,
    }),
    [itemName, verdictEmoji, verdictLabel, paidPrice, sellPrice, profit, roi, profitConfidence, prefs.hidePrice]
  );
  const winHeadline = winData ? buildWinCardText(winData).headline : undefined;

  // ---- pinch / pan / double-tap (PanResponder - no gesture-handler) ----
  // liveRef (2026-11-17, MEASURED: stale-closure bug) - PanResponder.create
  // is called ONCE inside useRef's lazy initializer, so its handlers close
  // over whatever `crop`/`imgSize`/`previewFrame`/`format` were on the
  // FIRST render forever after - without this ref, every pinch/pan would
  // compute against the format the Studio opened on (always "story", scale
  // 1, translate 0,0) no matter what the user later switched to or already
  // dragged to. Mutated directly in the render body (not an effect) so it's
  // always current by the time any touch callback fires.
  const liveRef = useRef({ format: prefs.format, crop, imgSize, previewFrame });
  liveRef.current = { format: prefs.format, crop, imgSize, previewFrame };

  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const touchStartedAt = useRef(0);
  const touchMoved = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStart.current = null;
        pinchStartDist.current = null;
        touchStartedAt.current = Date.now();
        touchMoved.current = false;
      },
      onPanResponderMove: (evt: any) => {
        const { crop: liveCrop, imgSize: liveImg, previewFrame: liveFrame, format } = liveRef.current;
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          touchMoved.current = true;
          panStart.current = null;
          const [a, b] = touches;
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          if (pinchStartDist.current == null) {
            pinchStartDist.current = dist;
            pinchStartScale.current = liveCrop.scale;
          }
          const nextScale = clampZoomScale(pinchStartScale.current * (dist / pinchStartDist.current));
          const nextTranslate = liveImg ? clampPanTranslate(liveCrop.translate, nextScale, liveImg, liveFrame) : liveCrop.translate;
          setCropByFormat((c) => ({ ...c, [format]: { scale: nextScale, translate: nextTranslate } }));
        } else if (touches.length === 1) {
          pinchStartDist.current = null;
          const t = touches[0];
          if (!panStart.current) panStart.current = { x: t.pageX, y: t.pageY, tx: liveCrop.translate.x, ty: liveCrop.translate.y };
          const dx = t.pageX - panStart.current.x;
          const dy = t.pageY - panStart.current.y;
          if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) touchMoved.current = true;
          const nextTranslate = liveImg
            ? clampPanTranslate({ x: panStart.current.tx + dx, y: panStart.current.ty + dy }, liveCrop.scale, liveImg, liveFrame)
            : liveCrop.translate;
          setCropByFormat((c) => ({ ...c, [format]: { scale: liveCrop.scale, translate: nextTranslate } }));
        }
      },
      onPanResponderRelease: (evt: any) => {
        const wasTap = !touchMoved.current && Date.now() - touchStartedAt.current < 400;
        if (wasTap) {
          const t = evt.nativeEvent.changedTouches?.[0] || evt.nativeEvent;
          const now = Date.now();
          const prev = lastTap.current;
          if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot((t.pageX ?? 0) - prev.x, (t.pageY ?? 0) - prev.y) < 40) {
            const { format } = liveRef.current;
            setCropByFormat((c) => ({ ...c, [format]: { ...DEFAULT_CROP } }));
            lastTap.current = null;
          } else {
            lastTap.current = { t: now, x: t.pageX ?? 0, y: t.pageY ?? 0 };
          }
        }
        panStart.current = null;
        pinchStartDist.current = null;
      },
      onPanResponderTerminate: () => {
        panStart.current = null;
        pinchStartDist.current = null;
      },
    })
  ).current;

  async function copyCaption(text: string) {
    try {
      await Clipboard.setStringAsync(text);
      setCopiedChip(text);
      setTimeout(() => setCopiedChip((c) => (c === text ? null : c)), 1400);
    } catch {}
  }

  async function share() {
    if (sharing) return;
    setSharing(true);
    setStatus(null);
    try {
      const available = Sharing ? await Sharing.isAvailableAsync() : false;
      if (!available || !Sharing || !shareCardRef.current?.capture) {
        await Share.share({ message: "Check this out — ValuIQ" });
        setStatus({ kind: "ok", text: "Shared." });
      } else {
        const uri = await shareCardRef.current.capture();
        if (isOwner) {
          const target = FORMAT_SIZES[prefs.format];
          let bytes = 0;
          // SDK 54's expo-file-system dropped getInfoAsync for a synchronous
          // File class (new File(uri).size) - see this repo's own AGENTS.md
          // note to check the versioned docs before touching anything here.
          if (FileSystem) {
            try {
              bytes = new (FileSystem as any).File(uri).size || 0;
            } catch {}
          }
          setDebug({ w: target.w, h: target.h, bytes, scale: crop.scale });
        }
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your ValuIQ find" });
        setStatus({ kind: "ok", text: "Opened the share sheet — use \"Save Image\" there to save it." });
      }
      logEvent(token, "share_studio_shared", { scanId, format: prefs.format, look: prefs.look, isWin }).catch(() => {});
    } catch {
      setStatus({ kind: "fail", text: "Couldn't share that image. Try again." });
    } finally {
      setSharing(false);
    }
  }

  if (!visible) return null;
  const palette = LOOKS[prefs.look];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[st.root, { backgroundColor: palette.bg }]}>
        <View style={st.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.closeHit}>
            <Text style={st.closeText} numberOfLines={1}>Close</Text>
          </TouchableOpacity>
          <Text style={st.topTitle} numberOfLines={1}>Share Studio</Text>
          <View style={st.closeHit} />
        </View>

        <ScrollView contentContainerStyle={st.scrollBody} keyboardShouldPersistTaps="handled">
          <View style={st.segmentRow}>
            {(["story", "feed", "square"] as StudioFormat[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[st.segment, prefs.format === f && { borderColor: palette.accent, backgroundColor: palette.chip }]}
                onPress={() => updatePrefs({ format: f })}
              >
                <Text style={[st.segmentText, { color: prefs.format === f ? palette.accent : C.text3 }]} numberOfLines={1}>{FORMAT_LABELS[f]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {winData ? (
            <View style={st.winToggleRow}>
              <Text style={st.winToggleLabel}>Show as Win card</Text>
              <Switch value={isWin} onValueChange={setIsWin} trackColor={{ true: palette.accent }} />
            </View>
          ) : null}

          <View {...panResponder.panHandlers} style={{ marginTop: 10 }}>
            <View style={[st.cardShadow, { width: previewFrame.w, height: previewFrame.h }]}>
              <StudioCardContent
                look={prefs.look}
                frame={previewFrame}
                photoUri={photoUri}
                imgSize={imgSize}
                crop={crop}
                handle={prefs.handle}
                isWin={isWin}
                winHeadline={winHeadline}
                cardText={cardText}
                isLoss={isLoss}
              />
            </View>
            {photoUri && !imgSize ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: 1, height: 1, opacity: 0, position: "absolute" }}
                onLoad={(e) => setImgSize({ w: e.nativeEvent.source.width, h: e.nativeEvent.source.height })}
              />
            ) : null}
          </View>
          <Text style={st.hint}>Pinch to zoom · drag to pan · double-tap to reset</Text>

          <View style={st.lookRow}>
            {(["dark", "light", "bold", "clean"] as StudioLook[]).map((l) => (
              <TouchableOpacity
                key={l}
                style={[st.lookSwatch, { backgroundColor: LOOKS[l].card, borderColor: prefs.look === l ? LOOKS[l].accent : C.border }]}
                onPress={() => updatePrefs({ look: l })}
              >
                <Text style={{ color: LOOKS[l].text, fontSize: 11, fontWeight: "800" }}>{LOOK_LABELS[l]}</Text>
              </TouchableOpacity>
            ))}
          </View>

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
                placeholder="@yourname (optional)"
                placeholderTextColor={C.text4}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={st.fieldLabel}>Captions (tap to copy)</Text>
              <View style={st.chipRow}>
                {CAPTION_PRESETS.map((c) => (
                  <TouchableOpacity key={c} style={st.chip} onPress={() => copyCaption(c)}>
                    <Text style={st.chipText} numberOfLines={1}>{copiedChip === c ? "Copied!" : c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={st.hidePriceRow}>
                <Text style={st.fieldLabel}>Hide price</Text>
                <Switch value={prefs.hidePrice} onValueChange={(v) => updatePrefs({ hidePrice: v })} trackColor={{ true: palette.accent }} />
              </View>
            </View>
          )}

          {isOwner && debug ? (
            <Text style={st.debugLine}>
              export {debug.w}×{debug.h} · {debug.bytes > 0 ? formatFileSize(debug.bytes) : "size n/a"} · crop {debug.scale.toFixed(2)}×
            </Text>
          ) : null}
        </ScrollView>

        {/* Off-screen capture twin - same content, nominal CSS size, resized
            to the real export pixels by ViewShot's width/height option. The
            translate scales by (nominal/preview) so the crop composition is
            pixel-identical to what's on screen (see this file's header
            comment). */}
        {ViewShot ? (
          <View style={{ position: "absolute", top: 0, left: -9999 }} pointerEvents="none">
            <ViewShot
              ref={shareCardRef}
              options={{
                format: "png",
                quality: 0.92,
                result: "tmpfile",
                width: FORMAT_SIZES[prefs.format].w,
                height: FORMAT_SIZES[prefs.format].h,
              }}
            >
              <StudioCardContent
                look={prefs.look}
                frame={nominalFrame}
                photoUri={photoUri}
                imgSize={imgSize}
                crop={{ scale: crop.scale, translate: { x: crop.translate.x * (nominalFrame.w / previewFrame.w), y: crop.translate.y * (nominalFrame.w / previewFrame.w) } }}
                handle={prefs.handle}
                isWin={isWin}
                winHeadline={winHeadline}
                cardText={cardText}
                isLoss={isLoss}
              />
            </ViewShot>
          </View>
        ) : null}

        <View style={st.bottomBar}>
          {status ? (
            <Text style={[st.statusText, status.kind === "fail" && st.statusTextFail]} numberOfLines={2}>{status.text}</Text>
          ) : null}
          <TouchableOpacity style={[st.shareBtn, { backgroundColor: palette.accent }]} onPress={share} disabled={sharing} activeOpacity={0.85}>
            {sharing ? <ActivityIndicator color={palette.onAccent} /> : <Text style={[st.shareBtnText, { color: palette.onAccent }]}>Share →</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const cs = StyleSheet.create({
  card: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: C.border },
  photoWrap: { width: "100%", position: "relative", overflow: "hidden" },
  photo: { width: "100%", height: "100%" },
  handleChip: { position: "absolute", left: 10, bottom: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3 },
  handleText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  body: { flex: 1, paddingHorizontal: 14, paddingTop: 10, alignItems: "center", justifyContent: "center" },
  bodyBold: { paddingVertical: 4 },
  verdict: { fontSize: 20, fontWeight: "900", letterSpacing: 0.5, marginBottom: 4, textAlign: "center" },
  verdictBold: { fontSize: 30 },
  verdictClean: { fontSize: 14 },
  itemName: { fontSize: 14, fontWeight: "800", textAlign: "center", marginBottom: 4, maxWidth: "100%" },
  itemNameClean: { fontSize: 12 },
  priceLine: { fontSize: 12, fontWeight: "700", marginTop: 2, textAlign: "center" },
  statsLine: { fontSize: 13, fontWeight: "900", marginTop: 2, textAlign: "center" },
  winHeadline: { fontSize: 18, fontWeight: "900", textAlign: "center", lineHeight: 24 },
  winHeadlineBold: { fontSize: 24 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  footerMark: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerWordmark: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});

const st = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10 },
  closeHit: { width: 56, minWidth: 56 },
  closeText: { color: C.text3, fontSize: 15, fontWeight: "700" },
  topTitle: { color: C.text1, fontSize: 15, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  scrollBody: { alignItems: "center", paddingBottom: 20, paddingHorizontal: 16 },
  segmentRow: { flexDirection: "row", gap: 8, width: "100%" },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  segmentText: { fontSize: 13, fontWeight: "800" },
  winToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 12, paddingHorizontal: 4 },
  winToggleLabel: { color: C.text2, fontSize: 13, fontWeight: "700" },
  cardShadow: { borderRadius: 18, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  hint: { color: C.text4, fontSize: 11, marginTop: 8, marginBottom: 6 },
  lookRow: { flexDirection: "row", gap: 8, width: "100%", marginTop: 6 },
  lookSwatch: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
  personalizeHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, width: "100%", justifyContent: "center" },
  personalizeHeaderText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  personalizeChevron: { color: C.text4, fontSize: 11 },
  personalizePanel: { width: "100%" },
  fieldLabel: { color: C.text4, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text1, fontSize: 14, padding: 11 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: C.text2, fontSize: 12, fontWeight: "700" },
  hidePriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  debugLine: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginTop: 14, textAlign: "center" },
  bottomBar: { paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10, gap: 8 },
  statusText: { color: C.text2, fontSize: 12, textAlign: "center" },
  statusTextFail: { color: C.red },
  shareBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  shareBtnText: { fontSize: 16, fontWeight: "900" },
});
