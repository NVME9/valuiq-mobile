// ShareStudio.tsx — the single post-scan share screen, replacing
// RevealScreen.tsx/RevealPhotoEditor.tsx (both removed). One full-screen
// Modal with exactly two modes: the main screen (format + look + preview +
// two buttons + Share) and a dedicated full-screen "Adjust photo" mode for
// crop gestures. Neither mode uses a ScrollView - the main screen's preview
// is a fixed flex:1 region measured via onLayout, and Adjust mode is its
// own full-screen view, so nothing can push the preview off-screen and
// nothing can swallow a pinch/pan gesture into scroll momentum.
//
// PREVIEW == EXPORT (structural, not just "should match"): the card is
// built once, in lib/shareStudio.ts's zonesForFormat(), as a fixed
// 1080-wide-canvas layout with absolutely positioned, non-overlapping
// zones. StudioCardContent takes a `scale` prop and multiplies every zone
// y/h and font size by it - the on-screen preview passes scale=previewScale
// (<1), the off-screen capture passes scale=1 (the real 1080px canvas).
// Same component, same formula, two different multipliers - there is no
// second code path that could drift from the first.
//
// NO GESTURE-HANDLER, NO REANIMATED, NO MEDIA-LIBRARY (build #46 audit -
// scripts/native-modules-build46.json): pinch/pan/double-tap is plain
// PanResponder + plain React state, same posture RevealPhotoEditor.tsx
// used. There is no Save button - expo-media-library isn't in the binary -
// the system share sheet (expo-sharing) already offers "Save Image" for a
// shared PNG, so Save degrades to that instead of a broken button.
//
// OTA-SAFE IMPORTS: ViewShot/Sharing/FileSystem resolve native modules at
// module scope - a guarded require (not a static import) keeps a missing
// module from crashing the whole app at launch, same convention the file
// this replaced used.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Image,
  Dimensions, Share, TextInput, ActivityIndicator, Switch, PanResponder,
  KeyboardAvoidingView, Platform, LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";
import Wordmark from "./Wordmark";
import {
  StudioFormat, StudioLook, StudioConfidence, StudioHeroVerdict, Size, Point,
  FORMAT_SIZES, FORMAT_LABELS, LOOK_LABELS,
  frameSizeForFormat, frameSizeForRatio, photoZoneSize, zonesForFormat, scaleZones,
  coverScale, clampZoomScale, stepZoomScale, clampPanTranslate, imagePlacement,
  stampForHeroVerdict, buildPriceBlock, buildWinCardText, PriceBlock, WinCardText,
  formatFileSize,
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
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;

// Text wrapper used for EVERY piece of text on the card itself - hard-codes
// allowFontScaling to false with no way for a caller to override it, so a
// device with a large system text size (item 2's own root cause) can never
// blow up the card layout. ellipsizeMode defaults to "clip" (never "tail"/
// "head"/"middle", which print "...") - overflow is handled exclusively by
// adjustsFontSizeToFit shrinking the font, never by truncating characters.
function CardText({ style, numberOfLines, adjustsFontSizeToFit, minimumFontScale, children }: {
  style?: any; numberOfLines?: number; adjustsFontSizeToFit?: boolean; minimumFontScale?: number; children?: React.ReactNode;
}) {
  return (
    <Text
      allowFontScaling={false}
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      ellipsizeMode="clip"
    >
      {children}
    </Text>
  );
}

function CloseIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M7 7 L25 25" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Path d="M25 7 L7 25" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

const LOOKS: Record<StudioLook, { bg: string; card: string; text: string; sub: string; accent: string; chip: string; onAccent: string; bigPrice?: boolean }> = {
  dark: { bg: "#0a0906", card: "#17150f", text: "#f5f2ed", sub: "#bdb8b0", accent: C.green, chip: "rgba(255,255,255,0.08)", onAccent: C.greenDark },
  // MEASURED: light's accent is a dark green ("#2c7a1f") for readable
  // contrast on a light panel - the other looks' near-black greenDark
  // label would be low-contrast there, so the Share button label is white.
  light: { bg: "#f0ece3", card: "#ffffff", text: "#1c1a17", sub: "#6b655c", accent: "#2c7a1f", chip: "rgba(0,0,0,0.06)", onAccent: "#ffffff" },
  bold: { bg: "#120a00", card: "#0c0600", text: "#fff6e0", sub: "#e8c26b", accent: C.gold, chip: "rgba(255,255,255,0.1)", onAccent: "#2a1c00", bigPrice: true },
};

const HOOK_PRESETS = ["Would you flip it?", "Found this at the thrift", "Pass or buy?", "Real find, real numbers."];

export interface ShareStudioWinData {
  boughtPrice: number;
  soldPrice: number;
  profit: number;
}

interface CropState { scale: number; translate: Point }
const DEFAULT_CROP: CropState = { scale: 1, translate: { x: 0, y: 0 } };

interface StudioCardContentProps {
  format: StudioFormat;
  scale: number;
  look: StudioLook;
  photoUri: string | null;
  imgSize: Size | null;
  crop: CropState;
  handle: string;
  hook: string | null;
  isWin: boolean;
  winText?: WinCardText;
  stampText: string | null;
  priceBlock: PriceBlock;
  itemName: string;
  isLoss: boolean;
}

// The exported/previewed card itself - every number here is zones/geometry
// from lib/shareStudio.ts multiplied by `scale`. Nothing is hardcoded to a
// device size, and nothing here can overlap another zone (zonesForFormat's
// own header comment explains why that's structural, not incidental).
export function StudioCardContent({ format, scale, look, photoUri, imgSize, crop, handle, hook, isWin, winText, stampText, priceBlock, itemName, isLoss }: StudioCardContentProps) {
  const palette = LOOKS[look];
  const canvas = FORMAT_SIZES[format];
  const W = canvas.w * scale;
  const H = canvas.h * scale;
  const zones = scaleZones(zonesForFormat(format), scale);
  const nativePhoto = photoZoneSize(format);
  const accent = isLoss ? C.red : palette.accent;
  const place = imgSize ? imagePlacement(imgSize, nativePhoto, crop, scale) : null;
  const priceFontSize = (palette.bigPrice ? 104 : 88) * scale;
  const showStamp = isWin || !!stampText;

  return (
    <View style={[st.card, { width: W, height: H, backgroundColor: palette.card, borderRadius: 18 * scale }]}>
      {/* PHOTO ZONE */}
      <View style={{ position: "absolute", top: zones.photo.y, left: 0, width: W, height: zones.photo.h, overflow: "hidden", backgroundColor: C.surfaceHigh }}>
        {photoUri && place ? (
          <Image source={{ uri: photoUri }} resizeMode="cover" style={{ position: "absolute", width: place.w, height: place.h, left: place.left, top: place.top }} />
        ) : null}
        <View style={[st.wordmarkPill, { paddingHorizontal: 10 * scale, paddingVertical: 5 * scale, top: 14 * scale, left: 14 * scale, gap: 5 * scale }]}>
          <ValuIQLogo accent={C.green} size={13 * scale} />
          <CardText style={{ color: "#fff", fontSize: 11 * scale, fontWeight: "800", letterSpacing: 0.5 }}>ValuIQ</CardText>
        </View>
        {hook ? (
          <View style={{ position: "absolute", left: 14 * scale, right: 14 * scale, bottom: 12 * scale, alignItems: "center" }}>
            <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10 * scale, paddingHorizontal: 12 * scale, paddingVertical: 7 * scale, maxWidth: "100%" }}>
              <CardText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: "#fff", fontSize: 22 * scale, fontWeight: "800", textAlign: "center" }}>
                {hook}
              </CardText>
            </View>
          </View>
        ) : null}
      </View>

      {/* STAMP ZONE */}
      <View style={{ position: "absolute", top: zones.stamp.y, left: 0, width: W, height: zones.stamp.h, alignItems: "center", justifyContent: "center" }}>
        {showStamp ? (
          <View style={{ borderWidth: 3 * scale, borderColor: accent, borderRadius: 8 * scale, paddingHorizontal: 18 * scale, paddingVertical: 8 * scale, transform: [{ rotate: "-6deg" }] }}>
            <CardText numberOfLines={1} style={{ color: accent, fontSize: 28 * scale, fontWeight: "900", letterSpacing: 1.5 * scale }}>
              {isWin ? "SOLD" : stampText}
            </CardText>
          </View>
        ) : null}
      </View>

      {/* PRICE ZONE */}
      <View style={{ position: "absolute", top: zones.price.y, left: 0, width: W, height: zones.price.h, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 * scale }}>
        {isWin && winText ? (
          <>
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: palette.sub, fontSize: 30 * scale, fontWeight: "700" }}>
              {winText.subLine}
            </CardText>
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: accent, fontSize: priceFontSize, fontWeight: "900", marginTop: 4 * scale }}>
              {winText.bigLine}
            </CardText>
          </>
        ) : (
          <>
            {priceBlock.paidLine ? (
              <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: palette.sub, fontSize: 30 * scale, fontWeight: "700" }}>
                {priceBlock.paidLine}
              </CardText>
            ) : null}
            {priceBlock.bigLine ? (
              <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: accent, fontSize: priceFontSize, fontWeight: "900", marginTop: 4 * scale }}>
                {priceBlock.bigLine}
              </CardText>
            ) : null}
            {priceBlock.caption ? (
              <CardText numberOfLines={1} style={{ color: palette.sub, fontSize: 22 * scale, fontWeight: "600", marginTop: 2 * scale }}>
                {priceBlock.caption}
              </CardText>
            ) : null}
            {priceBlock.profitLine ? (
              <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: accent, fontSize: 34 * scale, fontWeight: "900", marginTop: 6 * scale }}>
                {priceBlock.profitLine}
              </CardText>
            ) : null}
          </>
        )}
      </View>

      {/* NAME ZONE - numberOfLines=2 + adjustsFontSizeToFit + a minimumFontScale
          floor is what replaces the old single-line "American Flag and I..."
          truncation: the font shrinks until two lines hold the whole name,
          it is never cut off with an ellipsis. */}
      <View style={{ position: "absolute", top: zones.name.y, left: 0, width: W, height: zones.name.h, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 * scale }}>
        <CardText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: palette.text, fontSize: 40 * scale, fontWeight: "800", textAlign: "center", lineHeight: 46 * scale }}>
          {itemName}
        </CardText>
      </View>

      {/* FOOTER ZONE - handle (if set) + the wordmark mark, nothing else. */}
      <View style={{ position: "absolute", top: zones.footer.y, left: 0, width: W, height: zones.footer.h, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 * scale }}>
        {handle ? <CardText numberOfLines={1} style={{ color: palette.sub, fontSize: 22 * scale, fontWeight: "700" }}>{handle}</CardText> : null}
        {handle ? <View style={{ width: 1, height: 16 * scale, backgroundColor: palette.sub, opacity: 0.4 }} /> : null}
        <ValuIQLogo accent={palette.accent} size={14 * scale} />
        <Wordmark style={{ fontSize: 13 * scale, fontWeight: "800", letterSpacing: 1 * scale, color: palette.sub }} />
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
  heroVerdict: StudioHeroVerdict;
  displayName?: string | null;
  isOwner?: boolean;
  winData?: ShareStudioWinData | null;
}

export default function ShareStudio(props: ShareStudioProps) {
  const {
    visible, onClose, token, scanId, itemName, photoBase64, paidPrice, sellPrice,
    profit, roi, profitConfidence, heroVerdict, displayName, isOwner, winData,
  } = props;

  const [prefs, setPrefs] = useState<StudioPrefs>({ handle: "", look: "dark", format: "story", hidePrice: false });
  const [isWin, setIsWin] = useState(false);
  const [hook, setHook] = useState<string | null>(null);
  const [mode, setMode] = useState<"main" | "adjust">("main");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [imgSize, setImgSize] = useState<Size | null>(null);
  const [cropByFormat, setCropByFormat] = useState<Record<StudioFormat, CropState>>({
    story: DEFAULT_CROP, feed: DEFAULT_CROP, square: DEFAULT_CROP,
  });
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);
  const [debug, setDebug] = useState<{ w: number; h: number; bytes: number; scale: number } | null>(null);
  const [previewBox, setPreviewBox] = useState<Size>({ w: SCREEN_W - 32, h: Math.min(SCREEN_H * 0.5, 520) });
  const [adjustBox, setAdjustBox] = useState<Size>({ w: SCREEN_W - 32, h: SCREEN_H * 0.6 });
  const [touchCount, setTouchCount] = useState(0);

  const shareCardRef = useRef<InstanceType<NonNullable<typeof ViewShot>>>(null);
  const openedLoggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    loadStudioPrefs(displayName).then(setPrefs);
    setImgSize(null);
    setCropByFormat({ story: DEFAULT_CROP, feed: DEFAULT_CROP, square: DEFAULT_CROP });
    setIsWin(!!winData);
    setHook(null);
    setMode("main");
    setCustomizeOpen(false);
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
  const previewFrame = useMemo(() => frameSizeForFormat(prefs.format, previewBox.w, previewBox.h), [prefs.format, previewBox.w, previewBox.h]);
  const previewScale = previewFrame.w / FORMAT_SIZES[prefs.format].w;
  const nativePhoto = useMemo(() => photoZoneSize(prefs.format), [prefs.format]);
  const adjustFrame = useMemo(() => frameSizeForRatio(nativePhoto.w / nativePhoto.h, adjustBox.w, adjustBox.h), [nativePhoto, adjustBox.w, adjustBox.h]);
  const adjustScale = adjustFrame.w / nativePhoto.w;
  const crop = cropByFormat[prefs.format];

  const isLoss = (winData ? winData.profit : profit) != null && (winData ? winData.profit : profit)! < 0;

  const priceBlock = useMemo(
    () => buildPriceBlock({ paidPrice, sellPrice, profit, roi, confidence: profitConfidence, hidePrice: prefs.hidePrice }),
    [paidPrice, sellPrice, profit, roi, profitConfidence, prefs.hidePrice]
  );
  const stampText = useMemo(() => stampForHeroVerdict(heroVerdict), [heroVerdict]);
  const winText = useMemo(() => (winData ? buildWinCardText(winData) : undefined), [winData]);

  // ---- pinch / pan / double-tap (PanResponder - no gesture-handler), only
  // live in "Adjust photo" mode. liveRef (MEASURED: stale-closure bug) -
  // PanResponder.create runs ONCE inside useRef's lazy initializer, so its
  // handlers close over whatever `crop`/`imgSize`/`adjustScale`/`format`
  // were on the FIRST render forever after - mutated directly in the render
  // body (not an effect) so every callback reads the current values.
  const liveRef = useRef({ format: prefs.format, crop, imgSize, nativePhoto, adjustScale });
  liveRef.current = { format: prefs.format, crop, imgSize, nativePhoto, adjustScale };

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
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        panStart.current = null;
        pinchStartDist.current = null;
        touchStartedAt.current = Date.now();
        touchMoved.current = false;
      },
      onPanResponderMove: (evt: any) => {
        const { crop: liveCrop, imgSize: liveImg, nativePhoto: liveFrame, adjustScale: liveAdjScale, format } = liveRef.current;
        const touches = evt.nativeEvent.touches;
        setTouchCount(touches.length);
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
          const dxScreen = t.pageX - panStart.current.x;
          const dyScreen = t.pageY - panStart.current.y;
          if (Math.abs(dxScreen) > TAP_SLOP || Math.abs(dyScreen) > TAP_SLOP) touchMoved.current = true;
          // Convert on-screen pixel movement into NATIVE (scale=1) units by
          // dividing out the Adjust screen's own display scale, so the
          // stored crop is resolution-independent and reusable, unchanged,
          // by the card's photo zone at ITS OWN scale (previewScale or 1).
          const dxNative = dxScreen / liveAdjScale;
          const dyNative = dyScreen / liveAdjScale;
          const nextTranslate = liveImg
            ? clampPanTranslate({ x: panStart.current.tx + dxNative, y: panStart.current.ty + dyNative }, liveCrop.scale, liveImg, liveFrame)
            : liveCrop.translate;
          setCropByFormat((c) => ({ ...c, [format]: { scale: liveCrop.scale, translate: nextTranslate } }));
        }
      },
      onPanResponderRelease: (evt: any) => {
        setTouchCount(0);
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
        setTouchCount(0);
        panStart.current = null;
        pinchStartDist.current = null;
      },
    })
  ).current;

  function zoomBy(direction: 1 | -1) {
    const format = prefs.format;
    setCropByFormat((c) => {
      const cur = c[format];
      const nextScale = stepZoomScale(cur.scale, direction);
      const nextTranslate = imgSize ? clampPanTranslate(cur.translate, nextScale, imgSize, nativePhoto) : cur.translate;
      return { ...c, [format]: { scale: nextScale, translate: nextTranslate } };
    });
  }

  function resetCrop() {
    const format = prefs.format;
    setCropByFormat((c) => ({ ...c, [format]: { ...DEFAULT_CROP } }));
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

  function onPreviewLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setPreviewBox({ w: width - 16, h: height - 16 });
  }
  function onAdjustLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setAdjustBox({ w: width - 16, h: height - 16 });
  }

  const hiddenImageLoader = photoUri && !imgSize ? (
    <Image
      source={{ uri: photoUri }}
      style={{ width: 1, height: 1, opacity: 0, position: "absolute", top: 0, left: -9999 }}
      onLoad={(e) => setImgSize({ w: e.nativeEvent.source.width, h: e.nativeEvent.source.height })}
    />
  ) : null;

  const adjustPlace = imgSize ? imagePlacement(imgSize, nativePhoto, crop, adjustScale) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[st.root, { backgroundColor: palette.bg }]}>
        {hiddenImageLoader}

        {mode === "adjust" ? (
          <View style={st.root}>
            <View style={st.adjustTopBar}>
              <TouchableOpacity onPress={resetCrop} style={st.adjustTopBtn}>
                <Text style={st.adjustTopBtnText}>Reset</Text>
              </TouchableOpacity>
              <Text style={st.topTitle} numberOfLines={1}>Adjust photo</Text>
              <TouchableOpacity onPress={() => setMode("main")} style={st.adjustTopBtn}>
                <Text style={[st.adjustTopBtnText, { color: palette.accent }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onLayout={onAdjustLayout}>
              <View {...panResponder.panHandlers} style={[st.adjustFrame, { width: adjustFrame.w, height: adjustFrame.h, borderColor: palette.accent }]}>
                {photoUri && adjustPlace ? (
                  <Image source={{ uri: photoUri }} resizeMode="cover" style={{ position: "absolute", width: adjustPlace.w, height: adjustPlace.h, left: adjustPlace.left, top: adjustPlace.top }} />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.surfaceHigh }]} />
                )}
              </View>
            </View>
            <View style={st.zoomRow}>
              <TouchableOpacity style={st.zoomBtn} onPress={() => zoomBy(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={st.zoomBtnText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.zoomResetBtn} onPress={resetCrop}>
                <Text style={st.zoomResetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.zoomBtn} onPress={() => zoomBy(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={st.zoomBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[st.doneBtn, { backgroundColor: palette.accent }]} onPress={() => setMode("main")}>
              <Text style={[st.doneBtnText, { color: palette.onAccent }]}>Done</Text>
            </TouchableOpacity>
            {isOwner ? (
              <Text style={st.debugLine}>
                touches {touchCount} · scale {crop.scale.toFixed(2)} · dx {crop.translate.x.toFixed(0)} · dy {crop.translate.y.toFixed(0)}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={st.root}>
            <View style={st.topBar}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={st.closeHit}>
                <CloseIcon color={C.text2} size={20} />
              </TouchableOpacity>
              <Text style={st.topTitle} numberOfLines={1}>Share studio</Text>
              <View style={st.closeHit} />
            </View>

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

            <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }} onLayout={onPreviewLayout}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setMode("adjust")} style={[st.cardShadow, { width: previewFrame.w, height: previewFrame.h }]}>
                <StudioCardContent
                  format={prefs.format}
                  scale={previewScale}
                  look={prefs.look}
                  photoUri={photoUri}
                  imgSize={imgSize}
                  crop={crop}
                  handle={prefs.handle}
                  hook={hook}
                  isWin={isWin}
                  winText={winText}
                  stampText={stampText}
                  priceBlock={priceBlock}
                  itemName={itemName}
                  isLoss={isLoss}
                />
              </TouchableOpacity>
            </View>

            <View style={st.lookRow}>
              {(["dark", "light", "bold"] as StudioLook[]).map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[st.lookPill, { backgroundColor: LOOKS[l].card, borderColor: prefs.look === l ? LOOKS[l].accent : C.border }]}
                  onPress={() => updatePrefs({ look: l })}
                >
                  <Text style={{ color: LOOKS[l].text, fontSize: 12, fontWeight: "800" }}>{LOOK_LABELS[l]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={st.actionRow}>
              <TouchableOpacity style={st.actionBtn} onPress={() => setMode("adjust")}>
                <Text style={st.actionBtnText}>Adjust photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.actionBtn} onPress={() => setCustomizeOpen(true)}>
                <Text style={st.actionBtnText}>Customize</Text>
              </TouchableOpacity>
            </View>

            {isOwner && debug ? (
              <Text style={st.debugLine}>
                export {debug.w}×{debug.h} · {debug.bytes > 0 ? formatFileSize(debug.bytes) : "size n/a"} · crop {debug.scale.toFixed(2)}×
              </Text>
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
        )}

        {/* Off-screen capture - the SAME StudioCardContent at scale=1, the
            real 1080px-wide canvas, never a small copy resized up. ViewShot's
            width/height option pins the raster to exactly FORMAT_SIZES
            pixels regardless of device pixel ratio. */}
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
                format={prefs.format}
                scale={1}
                look={prefs.look}
                photoUri={photoUri}
                imgSize={imgSize}
                crop={crop}
                handle={prefs.handle}
                hook={hook}
                isWin={isWin}
                winText={winText}
                stampText={stampText}
                priceBlock={priceBlock}
                itemName={itemName}
                isLoss={isLoss}
              />
            </ViewShot>
          </View>
        ) : null}

        {customizeOpen ? (
          <KeyboardAvoidingView style={StyleSheet.absoluteFillObject} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={st.sheetBackdrop}>
              <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setCustomizeOpen(false)} />
              <View style={st.sheet}>
                <View style={st.sheetHeader}>
                  <Text style={st.sheetTitle}>Customize</Text>
                  <TouchableOpacity onPress={() => setCustomizeOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={[st.sheetDoneText, { color: palette.accent }]}>Done</Text>
                  </TouchableOpacity>
                </View>

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

                <Text style={st.fieldLabel}>Hook (tap to set, tap again to clear)</Text>
                <View style={st.chipRow}>
                  {HOOK_PRESETS.map((h) => (
                    <TouchableOpacity
                      key={h}
                      style={[st.chip, hook === h && { borderColor: palette.accent, backgroundColor: palette.chip }]}
                      onPress={() => setHook((cur) => (cur === h ? null : h))}
                    >
                      <Text style={[st.chipText, hook === h && { color: palette.accent }]} numberOfLines={1}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={st.toggleRow}>
                  <Text style={st.fieldLabel}>Hide price</Text>
                  <Switch value={prefs.hidePrice} onValueChange={(v) => updatePrefs({ hidePrice: v })} trackColor={{ true: palette.accent }} />
                </View>

                {winData ? (
                  <View style={st.toggleRow}>
                    <Text style={st.fieldLabel}>Show as Win card</Text>
                    <Switch value={isWin} onValueChange={setIsWin} trackColor={{ true: palette.accent }} />
                  </View>
                ) : null}
              </View>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  card: { overflow: "hidden", borderWidth: 1, borderColor: C.border },
  wordmarkPill: { position: "absolute", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 100 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8 },
  closeHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { color: C.text1, fontSize: 16, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  segmentRow: { flexDirection: "row", gap: 6, width: "100%", paddingHorizontal: 16 },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 9, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  segmentText: { fontSize: 12, fontWeight: "800" },
  cardShadow: { borderRadius: 18, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  lookRow: { flexDirection: "row", gap: 8, width: "100%", paddingHorizontal: 16, marginTop: 8 },
  lookPill: { flex: 1, paddingVertical: 9, borderRadius: 100, borderWidth: 1.5, alignItems: "center" },
  actionRow: { flexDirection: "row", gap: 8, width: "100%", paddingHorizontal: 16, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  actionBtnText: { color: C.text1, fontSize: 13, fontWeight: "800" },
  debugLine: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginTop: 8, textAlign: "center", paddingHorizontal: 16 },
  bottomBar: { paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10, gap: 8 },
  statusText: { color: C.text2, fontSize: 12, textAlign: "center" },
  statusTextFail: { color: C.red },
  shareBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  shareBtnText: { fontSize: 16, fontWeight: "900" },

  // Adjust-photo mode
  adjustTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8 },
  adjustTopBtn: { minWidth: 60, paddingVertical: 8 },
  adjustTopBtnText: { color: C.text2, fontSize: 14, fontWeight: "700", textAlign: "center" },
  adjustFrame: { borderWidth: 2, borderRadius: 4, overflow: "hidden", backgroundColor: C.surfaceHigh },
  zoomRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 14 },
  zoomBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  zoomBtnText: { color: C.text1, fontSize: 24, fontWeight: "700", lineHeight: 26 },
  zoomResetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, borderWidth: 1.5, borderColor: C.border },
  zoomResetText: { color: C.text2, fontSize: 13, fontWeight: "800" },
  doneBtn: { marginHorizontal: 20, marginBottom: 30, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  doneBtnText: { fontSize: 15, fontWeight: "900" },

  // Customize sheet
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 34, borderTopWidth: 1, borderColor: C.border },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { color: C.text1, fontSize: 16, fontWeight: "800" },
  sheetDoneText: { fontSize: 14, fontWeight: "800" },
  fieldLabel: { color: C.text4, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text1, fontSize: 14, padding: 11 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: C.text2, fontSize: 12, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
});
