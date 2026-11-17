// ShareStudio.tsx — the single post-scan share screen, replacing
// RevealScreen.tsx/RevealPhotoEditor.tsx (both removed), and now also the
// one Studio screen the post-sale win flow and the Wins-tab per-row share
// navigate into (see ScannerScreen.tsx/HistoryScreen.tsx/LogSaleModal.tsx) -
// the scan and win flows share this exact screen and its exact controls;
// only the card CONTENT variant differs (isWin/winData).
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
// PanResponder + plain React state. There is no Save button -
// expo-media-library isn't in the binary - the system share sheet
// (expo-sharing) already offers "Save Image" for a shared PNG.
//
// OTA-SAFE IMPORTS: ViewShot/Sharing/FileSystem resolve native modules at
// module scope - a guarded require (not a static import) keeps a missing
// module from crashing the whole app at launch.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Image,
  Dimensions, Share, TextInput, ActivityIndicator, PanResponder,
  Platform, LayoutChangeEvent, ScrollView, Keyboard,
} from "react-native";
import Svg, { Path, Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";
import Wordmark from "./Wordmark";
import { ScanFrameBackground, ScanCorners } from "./ScanFrameBackground";
import { doneFieldProps } from "./KeyboardDoneBar";
import {
  StudioFormat, StudioLook, StudioConfidence, StudioHeroVerdict, Size, Point,
  FORMAT_SIZES, FORMAT_LABELS, LOOK_LABELS, PHOTO_FRAME_INSET,
  frameSizeForFormat, frameSizeForRatio, photoZoneSize, zonesForFormat, scaleZones,
  clampZoomScale, stepZoomScale, clampPanTranslate, imagePlacement,
  minCropScale, defaultCropScale,
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
// device with a large system text size can never blow up the card layout.
// ellipsizeMode defaults to "clip" (never "tail"/"head"/"middle", which
// print "...") - overflow is handled exclusively by adjustsFontSizeToFit
// shrinking the font, never by truncating characters.
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

function AdjustIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7 h10 M4 17 h6" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M20 7 h-2 M20 17 h-4" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M14 4.5 v5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M8 14.5 v5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

// Colors only differ between looks - same grid/corners/zone structure for
// all three (per the card spec: "Looks (colors only)"). bg/card/grid are
// the near-black-plus-lime default for "dark"; "light"/"bold" swap the
// palette but keep the exact same ScanFrameBackground+ScanCorners+glow
// treatment, just in different colors.
const LOOKS: Record<StudioLook, { bg: string; card: string; gridBg: string; text: string; sub: string; accent: string; chip: string; chipFilled: string; divider: string; onAccent: string }> = {
  dark: { bg: "#0a0906", card: "#0c0c0a", gridBg: "#0c0c0a", text: "#f5f2ed", sub: "#bdb8b0", accent: C.green, chip: "rgba(255,255,255,0.08)", chipFilled: C.green, divider: "rgba(255,255,255,0.1)", onAccent: C.greenDark },
  // MEASURED: light's accent is a dark green ("#2c7a1f") for readable
  // contrast on a light panel - the other looks' near-black greenDark
  // label would be low-contrast there, so the Share button label is white.
  light: { bg: "#f0ece3", card: "#f5f2ea", gridBg: "#f5f2ea", text: "#1c1a17", sub: "#6b655c", accent: "#2c7a1f", chip: "rgba(0,0,0,0.06)", chipFilled: "#2c7a1f", divider: "rgba(0,0,0,0.1)", onAccent: "#ffffff" },
  bold: { bg: "#120a00", card: "#0e0800", gridBg: "#0e0800", text: "#fff6e0", sub: "#e8c26b", accent: C.gold, chip: "rgba(255,255,255,0.1)", chipFilled: C.gold, divider: "rgba(255,255,255,0.12)", onAccent: "#2a1c00" },
};

const HOOK_PRESETS = ["Would you flip it?", "Found this at the thrift", "Pass or buy?", "Real find, real numbers."];
const CUSTOM_HOOK_MAX = 40;

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

// Font sizes below are a FRACTION of their own zone's height, not a fixed
// px number - a zone given more room gets a visibly bigger hero number for
// free. Multipliers are tuned so the tallest realistic stack (paid + big +
// profit, or big + caption) stays inside the zone with margin to spare.
function priceFonts(priceH: number) {
  return { paid: priceH * 0.11, big: priceH * 0.42, caption: priceH * 0.09, profit: priceH * 0.14 };
}
function nameFontSize(nameH: number) {
  return nameH * 0.38;
}
function stampFontSize(stampH: number) {
  return stampH * 0.3;
}

// The exported/previewed card itself - every number here is zones/geometry
// from lib/shareStudio.ts multiplied by `scale`. Nothing is hardcoded to a
// device size, and nothing here can overlap another zone (zonesForFormat's
// own header comment explains why that's structural, not incidental) - the
// one deliberate exception is the STAMP, which breaks out of its own zone
// to visually overlap the photo frame's bottom-left corner (see below).
export function StudioCardContent({ format, scale, look, photoUri, imgSize, crop, handle, hook, isWin, winText, stampText, priceBlock, itemName, isLoss }: StudioCardContentProps) {
  const palette = LOOKS[look];
  const canvas = FORMAT_SIZES[format];
  const W = canvas.w * scale;
  const H = canvas.h * scale;
  const zones = scaleZones(zonesForFormat(format), scale);
  const nativePhoto = photoZoneSize(format);
  const accent = isLoss ? C.red : palette.accent;
  // Photo frame: inset 72px from the SIDES only (card spec) - fills the
  // whole photo zone's height (zones.photo.h IS the frame height - see
  // lib/shareStudio.ts's PHOTO_FRAME_INSET/photoZoneSize comment), so the
  // frame-height-share tuning (Story ~52%/Feed ~50%/Square ~46%) is exactly
  // this box's own height, not a looser zone reservation around it.
  const inset = PHOTO_FRAME_INSET * scale;
  const frameX = inset;
  const frameW = W - inset * 2;
  const frameY = zones.photo.y;
  const frameH = zones.photo.h;
  // place/backdropPlace are computed against nativePhoto (photoZoneSize -
  // already inset-aware: w = 1080 - 72*2), at displayScale=scale, so their
  // left/top are relative to a container of EXACTLY (frameW, frameH) at
  // displayScale=scale - i.e. relative to the frame box itself, no further
  // offset needed when rendering inside a View positioned at (frameX, frameY).
  const place = imgSize ? imagePlacement(imgSize, nativePhoto, crop, scale) : null;
  // ALWAYS-cover-filled backdrop copy, blurred (Image blurRadius - RN core,
  // no new native module) and dimmed, sitting behind the real (contain-by-
  // default, so usually letterboxed) crop - the photo frame is never left
  // showing raw flat background in the gaps a contain crop leaves.
  const backdropPlace = imgSize ? imagePlacement(imgSize, nativePhoto, { scale: 1, translate: { x: 0, y: 0 } }, scale) : null;
  const showStamp = isWin || !!stampText;
  const priceFont = priceFonts(zones.price.h);
  const nameFont = nameFontSize(zones.name.h);
  const stampFont = stampFontSize(zones.stamp.h);
  const glowColor = isLoss ? C.red : palette.accent;
  const stampPillH = zones.stamp.h * 0.72;

  return (
    <View style={[st.card, { width: W, height: H, backgroundColor: palette.card, borderRadius: 18 * scale }]}>
      {/* BACKGROUND - near-black + faint lime grid, the exact same look
          (ScanFrameBackground) the app splash screen uses, across the
          WHOLE canvas (not just the photo frame). */}
      <ScanFrameBackground width={W} height={H} bg={palette.gridBg} accent={palette.accent} cellSize={60 * scale} opacity={0.08} strokeWidth={Math.max(1, scale)} />

      {/* PHOTO ZONE - photo "contain" by default (whole photo visible,
          never cut off - see lib/shareStudio.ts's defaultCropScale) over a
          blurred, cover-filled copy of itself so there are no empty bars. */}
      <View style={{ position: "absolute", top: frameY, left: frameX, width: frameW, height: frameH, overflow: "hidden", backgroundColor: C.surfaceHigh, borderRadius: 6 * scale }}>
        {photoUri && backdropPlace ? (
          <Image
            source={{ uri: photoUri }}
            resizeMode="cover"
            blurRadius={Platform.OS === "android" ? 14 : 30}
            style={{ position: "absolute", width: backdropPlace.w, height: backdropPlace.h, left: backdropPlace.left, top: backdropPlace.top }}
          />
        ) : null}
        {photoUri && backdropPlace ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.4)" }]} />
        ) : null}
        {photoUri && place ? (
          <Image
            source={{ uri: photoUri }}
            resizeMode="contain"
            style={{ position: "absolute", width: place.w, height: place.h, left: place.left, top: place.top }}
          />
        ) : null}
        <View style={[st.wordmarkPill, { paddingHorizontal: 10 * scale, paddingVertical: 5 * scale, top: 14 * scale, left: 14 * scale, gap: 5 * scale }]}>
          <ValuIQLogo accent={C.green} size={13 * scale} />
          <CardText style={{ color: "#fff", fontSize: 11 * scale, fontWeight: "800", letterSpacing: 0.5 }}>ValuIQ</CardText>
        </View>
        {hook ? (
          <View style={{ position: "absolute", left: 14 * scale, right: 14 * scale, top: "38%", alignItems: "center" }}>
            <View style={{ backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10 * scale, paddingHorizontal: 12 * scale, paddingVertical: 7 * scale, maxWidth: "100%" }}>
              <CardText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: "#fff", fontSize: 26 * scale, fontWeight: "900", textAlign: "center" }}>
                {hook}
              </CardText>
            </View>
          </View>
        ) : null}
      </View>

      {/* FRAME CORNERS - four lime L-brackets AT the photo frame's inset
          box, the "viewfinder" look (same ScanCorners the splash uses). */}
      <ScanCorners x={frameX} y={frameY} w={frameW} h={frameH} armLength={90 * scale} thickness={8 * scale} color={accent} />

      {/* STAMP - tilted -6deg, outlined, deliberately positioned to
          OVERLAP the photo frame's bottom-left corner (not confined to its
          own "stamp" zone below the photo) - the zone itself still reserves
          the vertical space that pushes price/name/footer down, this view
          just breaks out of it via absolute positioning centered on the
          photo/stamp zone boundary. */}
      {showStamp ? (
        <View style={{ position: "absolute", left: frameX + 4 * scale, top: frameY + frameH - stampPillH / 2, alignItems: "flex-start" }}>
          <View style={{ borderWidth: 3 * scale, borderColor: accent, backgroundColor: palette.card, borderRadius: 8 * scale, paddingHorizontal: 16 * scale, paddingVertical: 7 * scale, transform: [{ rotate: "-6deg" }] }}>
            <CardText numberOfLines={1} style={{ color: accent, fontSize: stampFont, fontWeight: "900", letterSpacing: 1.5 * scale }}>
              {isWin ? "SOLD" : stampText}
            </CardText>
          </View>
        </View>
      ) : null}

      {/* PRICE ZONE - the hero moment: a soft radial glow behind a huge,
          bold price figure. */}
      <View style={{ position: "absolute", top: zones.price.y, left: 0, width: W, height: zones.price.h, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 * scale, overflow: "hidden" }}>
        <View style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
          <Svg width={W} height={zones.price.h}>
            <Defs>
              <RadialGradient id="priceGlow" cx="50%" cy="48%" r="60%">
                <Stop offset="0%" stopColor={glowColor} stopOpacity={0.3} />
                <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={W} height={zones.price.h} fill="url(#priceGlow)" />
          </Svg>
        </View>
        {isWin && winText ? (
          <>
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: accent, fontSize: priceFont.big, fontWeight: "900", textShadowColor: glowColor + "80", textShadowRadius: 24 * scale, textShadowOffset: { width: 0, height: 0 } }}>
              {winText.bigLine}
            </CardText>
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: palette.sub, fontSize: priceFont.paid, fontWeight: "700", marginTop: 6 * scale }}>
              {winText.subLine}
            </CardText>
          </>
        ) : (
          <>
            {priceBlock.paidLine ? (
              <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: palette.sub, fontSize: priceFont.paid, fontWeight: "700" }}>
                {priceBlock.paidLine}
              </CardText>
            ) : null}
            {priceBlock.bigLine ? (
              <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: accent, fontSize: priceFont.big, fontWeight: "900", marginTop: 4 * scale, textShadowColor: glowColor + "80", textShadowRadius: 24 * scale, textShadowOffset: { width: 0, height: 0 } }}>
                {priceBlock.bigLine}
              </CardText>
            ) : null}
            {priceBlock.caption ? (
              <CardText numberOfLines={1} style={{ color: palette.sub, fontSize: priceFont.caption, fontWeight: "600", marginTop: 2 * scale }}>
                {priceBlock.caption}
              </CardText>
            ) : null}
            {priceBlock.profitLine ? (
              <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: accent, fontSize: priceFont.profit, fontWeight: "900", marginTop: 6 * scale }}>
                {priceBlock.profitLine}
              </CardText>
            ) : null}
          </>
        )}
      </View>

      {/* NAME ZONE - numberOfLines=2 + adjustsFontSizeToFit + a
          minimumFontScale floor: the font shrinks until two lines hold the
          whole name, never cut off with an ellipsis. */}
      <View style={{ position: "absolute", top: zones.name.y, left: 0, width: W, height: zones.name.h, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 * scale, overflow: "hidden" }}>
        <CardText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: palette.text, fontSize: nameFont, fontWeight: "800", textAlign: "center", lineHeight: nameFont * 1.15 }}>
          {itemName}
        </CardText>
      </View>

      {/* FOOTER ZONE - one line: handle (if set) + wordmark. No tall
          footer band, no empty dark block - zones tile the canvas. */}
      <View style={{ position: "absolute", top: zones.footer.y, left: 0, width: W, height: zones.footer.h, alignItems: "center", justifyContent: "center", borderTopWidth: 1 * scale, borderTopColor: palette.divider }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 * scale }}>
          {handle ? <CardText numberOfLines={1} style={{ color: palette.sub, fontSize: 22 * scale, fontWeight: "700" }}>{handle}</CardText> : null}
          {handle ? <View style={{ width: 1, height: 16 * scale, backgroundColor: palette.sub, opacity: 0.4 }} /> : null}
          <ValuIQLogo accent={palette.accent} size={14 * scale} />
          <Wordmark style={{ fontSize: 13 * scale, fontWeight: "800", letterSpacing: 1 * scale, color: palette.sub }} />
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
  // Alternative to photoBase64 for callers that only have a remote URI on
  // hand (e.g. History re-sharing an already-logged row, which stores
  // image_url, not a base64 payload) - photoBase64 wins if both are passed.
  photoUri?: string | null;
  paidPrice: number | null;
  sellPrice: number | null;
  profit: number | null;
  roi: number | null;
  profitConfidence: StudioConfidence;
  heroVerdict: StudioHeroVerdict;
  displayName?: string | null;
  isOwner?: boolean;
  winData?: ShareStudioWinData | null;
  onLeaderboard?: () => void;
}

export default function ShareStudio(props: ShareStudioProps) {
  const {
    visible, onClose, token, scanId, itemName, photoBase64, photoUri: photoUriProp, paidPrice, sellPrice,
    profit, roi, profitConfidence, heroVerdict, displayName, isOwner, winData, onLeaderboard,
  } = props;

  const [prefs, setPrefs] = useState<StudioPrefs>({ handle: "", look: "dark", format: "story", hidePrice: false });
  const isWin = !!winData;
  const [hook, setHook] = useState<string | null>(null);
  const [customHookOpen, setCustomHookOpen] = useState(false);
  const [customHookText, setCustomHookText] = useState("");
  const [handleEditOpen, setHandleEditOpen] = useState(false);
  const [mode, setMode] = useState<"main" | "adjust">("main");
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

  // The crop a format should land on before any touch - always
  // defaultCropScale (contain-by-default on every format - see
  // lib/shareStudio.ts). Falls back to plain cover when imgSize isn't
  // known yet (e.g. "Reset" tapped mid-load) rather than guessing.
  function smartDefaultCrop(format: StudioFormat, img: Size | null): CropState {
    return { scale: img ? defaultCropScale(format, img) : 1, translate: { x: 0, y: 0 } };
  }

  useEffect(() => {
    if (!visible) return;
    loadStudioPrefs(displayName).then(setPrefs);
    setImgSize(null);
    setCropByFormat({ story: DEFAULT_CROP, feed: DEFAULT_CROP, square: DEFAULT_CROP });
    setHook(null);
    setCustomHookOpen(false);
    setCustomHookText("");
    setHandleEditOpen(false);
    setMode("main");
    setStatus(null);
    const openKey = `${scanId ?? "none"}:${Date.now()}`;
    if (openedLoggedFor.current !== openKey) {
      openedLoggedFor.current = openKey;
      logEvent(token, "share_studio_opened", { scanId, isWin }).catch(() => {});
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

  const photoUri = photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : (photoUriProp || null);
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

  // Applies the smart default crop to the CURRENT format the first time its
  // real image size is known - guarded on the crop still being untouched
  // (scale===1, no pan) so a user's own pinch/pan/zoom is never overwritten.
  useEffect(() => {
    if (!imgSize) return;
    setCropByFormat((c) => {
      const cur = c[prefs.format];
      if (cur.scale !== 1 || cur.translate.x !== 0 || cur.translate.y !== 0) return c;
      const next = smartDefaultCrop(prefs.format, imgSize);
      if (next.scale === cur.scale) return c;
      return { ...c, [prefs.format]: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.format, imgSize]);

  // ---- pinch / pan / double-tap (PanResponder - no gesture-handler), only
  // live in "Adjust photo" mode. liveRef (stale-closure guard) - mutated
  // directly in the render body so every callback reads current values.
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
          const minScale = liveImg ? minCropScale(liveImg, liveFrame) : 1;
          const nextScale = clampZoomScale(pinchStartScale.current * (dist / pinchStartDist.current), minScale);
          const nextTranslate = liveImg ? clampPanTranslate(liveCrop.translate, nextScale, liveImg, liveFrame) : liveCrop.translate;
          setCropByFormat((c) => ({ ...c, [format]: { scale: nextScale, translate: nextTranslate } }));
        } else if (touches.length === 1) {
          pinchStartDist.current = null;
          const t = touches[0];
          if (!panStart.current) panStart.current = { x: t.pageX, y: t.pageY, tx: liveCrop.translate.x, ty: liveCrop.translate.y };
          const dxScreen = t.pageX - panStart.current.x;
          const dyScreen = t.pageY - panStart.current.y;
          if (Math.abs(dxScreen) > TAP_SLOP || Math.abs(dyScreen) > TAP_SLOP) touchMoved.current = true;
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
            const { format, imgSize: liveImg2 } = liveRef.current;
            setCropByFormat((c) => ({ ...c, [format]: smartDefaultCrop(format, liveImg2) }));
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
      const minScale = imgSize ? minCropScale(imgSize, nativePhoto) : 1;
      const nextScale = stepZoomScale(cur.scale, direction, undefined, minScale);
      const nextTranslate = imgSize ? clampPanTranslate(cur.translate, nextScale, imgSize, nativePhoto) : cur.translate;
      return { ...c, [format]: { scale: nextScale, translate: nextTranslate } };
    });
  }

  function resetCrop() {
    const format = prefs.format;
    setCropByFormat((c) => ({ ...c, [format]: smartDefaultCrop(format, imgSize) }));
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
    if (width > 0 && height > 0) setPreviewBox({ w: width - 24, h: height });
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

  function openPreset(h: string) {
    setHook((cur) => (cur === h ? null : h));
    setCustomHookOpen(false);
  }

  function commitCustomHook() {
    const t = customHookText.trim();
    setHook(t ? t : null);
    setCustomHookOpen(false);
    Keyboard.dismiss();
  }

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
            {/* Top bar: X icon (left) + the Story|Feed|Square control
                filling the rest - no "Share studio" title eating a row. */}
            <View style={st.topBar}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={st.closeHit}>
                <CloseIcon color={C.text2} size={20} />
              </TouchableOpacity>
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
            </View>

            {/* The preview takes ALL remaining height above the controls -
                scaled to fit with 12px side margins (onPreviewLayout).
                Tapping anywhere on it ALSO opens Adjust photo - the pill
                button is a second, more discoverable way in. */}
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
                <TouchableOpacity
                  style={[st.adjustPill, { backgroundColor: palette.accent }]}
                  onPress={() => setMode("adjust")}
                  activeOpacity={0.85}
                >
                  <AdjustIcon color={palette.onAccent} size={15} />
                  <Text style={[st.adjustPillText, { color: palette.onAccent }]}>Adjust photo</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* ROW 1: Dark | Light | Bold look pills. */}
            <View style={st.lookRow}>
              {(["dark", "light", "bold"] as StudioLook[]).map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[st.lookPill, { backgroundColor: LOOKS[l].card, borderColor: prefs.look === l ? LOOKS[l].accent : C.border }]}
                  onPress={() => updatePrefs({ look: l })}
                >
                  <Text style={{ color: LOOKS[l].text, fontSize: 13, fontWeight: "800" }} numberOfLines={1}>{LOOK_LABELS[l]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ROW 2: PERSONALIZE - always visible, never collapsed behind
                a sheet/dropdown. One horizontally-scrolling row of pills:
                4 hook presets, a Custom hook pill (opens an inline text
                input), the handle pill (shows the saved handle, opens an
                inline text input), and the Hide price toggle pill. */}
            <Text style={st.personalizeLabel}>PERSONALIZE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={st.personalizeRow}
              style={st.personalizeScroll}
            >
              {HOOK_PRESETS.map((h) => {
                const selected = hook === h;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[st.personalizePill, selected && { backgroundColor: palette.chipFilled, borderColor: palette.chipFilled }]}
                    onPress={() => openPreset(h)}
                  >
                    <Text style={[st.personalizePillText, selected && { color: palette.onAccent, fontWeight: "900" }]} numberOfLines={1}>{h}</Text>
                  </TouchableOpacity>
                );
              })}

              {customHookOpen ? (
                <View style={[st.personalizePill, st.personalizeInputPill, { borderColor: palette.accent }]}>
                  <TextInput
                    style={st.personalizeInput}
                    value={customHookText}
                    onChangeText={(t) => setCustomHookText(t.slice(0, CUSTOM_HOOK_MAX))}
                    placeholder="Your hook..."
                    placeholderTextColor={C.text4}
                    autoFocus
                    maxLength={CUSTOM_HOOK_MAX}
                    {...doneFieldProps()}
                    onSubmitEditing={commitCustomHook}
                  />
                  <TouchableOpacity onPress={commitCustomHook} style={st.personalizeInputDone}>
                    <Text style={[st.personalizeInputDoneText, { color: palette.accent }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[st.personalizePill, hook != null && !HOOK_PRESETS.includes(hook) && { backgroundColor: palette.chipFilled, borderColor: palette.chipFilled }]}
                  onPress={() => { setCustomHookText(hook && !HOOK_PRESETS.includes(hook) ? hook : ""); setCustomHookOpen(true); }}
                >
                  <Text style={[st.personalizePillText, hook != null && !HOOK_PRESETS.includes(hook) && { color: palette.onAccent, fontWeight: "900" }]} numberOfLines={1}>
                    {hook != null && !HOOK_PRESETS.includes(hook) ? hook : "Custom hook"}
                  </Text>
                </TouchableOpacity>
              )}

              {handleEditOpen ? (
                <View style={[st.personalizePill, st.personalizeInputPill, { borderColor: palette.accent }]}>
                  <TextInput
                    style={st.personalizeInput}
                    value={prefs.handle}
                    onChangeText={(t) => updatePrefs({ handle: t })}
                    placeholder="@yourname"
                    placeholderTextColor={C.text4}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    {...doneFieldProps()}
                    onSubmitEditing={() => { setHandleEditOpen(false); Keyboard.dismiss(); }}
                  />
                  <TouchableOpacity onPress={() => { setHandleEditOpen(false); Keyboard.dismiss(); }} style={st.personalizeInputDone}>
                    <Text style={[st.personalizeInputDoneText, { color: palette.accent }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={st.personalizePill} onPress={() => setHandleEditOpen(true)}>
                  <Text style={st.personalizePillText} numberOfLines={1}>{prefs.handle ? prefs.handle : "+ Add your @handle"}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[st.personalizePill, prefs.hidePrice && { backgroundColor: palette.chipFilled, borderColor: palette.chipFilled }]}
                onPress={() => updatePrefs({ hidePrice: !prefs.hidePrice })}
              >
                <Text style={[st.personalizePillText, prefs.hidePrice && { color: palette.onAccent, fontWeight: "900" }]} numberOfLines={1}>
                  {prefs.hidePrice ? "Price hidden" : "Hide price"}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {isOwner && debug ? (
              <Text style={st.debugLine}>
                export {debug.w}×{debug.h} · {debug.bytes > 0 ? formatFileSize(debug.bytes) : "size n/a"} · crop {debug.scale.toFixed(2)}×
              </Text>
            ) : null}

            {/* ROW 3: Share. Win variant adds a small "See the leaderboard"
                link underneath. */}
            <View style={st.bottomBar}>
              {status ? (
                <Text style={[st.statusText, status.kind === "fail" && st.statusTextFail]} numberOfLines={2}>{status.text}</Text>
              ) : null}
              <TouchableOpacity style={[st.shareBtn, { backgroundColor: palette.accent }]} onPress={share} disabled={sharing} activeOpacity={0.85}>
                {sharing ? <ActivityIndicator color={palette.onAccent} /> : <Text style={[st.shareBtnText, { color: palette.onAccent }]}>Share</Text>}
              </TouchableOpacity>
              {isWin && onLeaderboard ? (
                <TouchableOpacity onPress={onLeaderboard} style={st.leaderboardLink}>
                  <Text style={[st.leaderboardLinkText, { color: palette.sub }]}>See the leaderboard →</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {/* Off-screen capture - the SAME StudioCardContent at scale=1, the
            real 1080px-wide canvas, never a small copy resized up. */}
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
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  card: { overflow: "hidden", borderWidth: 1, borderColor: C.border },
  wordmarkPill: { position: "absolute", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 100 },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8 },
  closeHit: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topTitle: { color: C.text1, fontSize: 16, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  segmentRow: { flex: 1, flexDirection: "row", gap: 6 },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 9, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  segmentText: { fontSize: 12, fontWeight: "800" },
  cardShadow: { borderRadius: 18, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  // "Adjust photo" pill, ON the preview (bottom-right corner), min 44px tall.
  adjustPill: { position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 100, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  adjustPillText: { fontSize: 13, fontWeight: "800" },
  // ROW 1: look pills.
  lookRow: { flexDirection: "row", gap: 8, width: "100%", paddingHorizontal: 16, marginTop: 10 },
  lookPill: { flex: 1, paddingVertical: 10, borderRadius: 100, borderWidth: 1.5, alignItems: "center" },
  // ROW 2: Personalize - always-visible horizontal pill scroller, never a
  // sheet/dropdown/collapse.
  personalizeLabel: { color: C.green, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: 14, marginLeft: 16, marginBottom: 6 },
  personalizeScroll: { width: "100%" },
  personalizeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, alignItems: "center" },
  personalizePill: { minHeight: 44, paddingHorizontal: 16, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  personalizePillText: { color: C.text2, fontSize: 14, fontWeight: "700" },
  personalizeInputPill: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, minWidth: 180 },
  personalizeInput: { color: C.text1, fontSize: 14, fontWeight: "600", minWidth: 100, paddingVertical: 0 },
  personalizeInputDone: { paddingHorizontal: 8, paddingVertical: 6 },
  personalizeInputDoneText: { fontSize: 13, fontWeight: "800" },
  debugLine: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginTop: 8, textAlign: "center", paddingHorizontal: 16 },
  // ROW 3: Share.
  bottomBar: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 14, gap: 8 },
  statusText: { color: C.text2, fontSize: 12, textAlign: "center" },
  statusTextFail: { color: C.red },
  shareBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  shareBtnText: { fontSize: 16, fontWeight: "900" },
  leaderboardLink: { alignItems: "center", paddingVertical: 4 },
  leaderboardLinkText: { fontSize: 13, fontWeight: "700" },

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
});
