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
import Svg, { Path, Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";
import Wordmark from "./Wordmark";
import {
  StudioFormat, StudioLook, StudioConfidence, StudioHeroVerdict, Size, Point,
  FORMAT_SIZES, FORMAT_LABELS, LOOK_LABELS,
  frameSizeForFormat, frameSizeForRatio, photoZoneSize, zonesForFormat, scaleZones,
  coverScale, clampZoomScale, stepZoomScale, clampPanTranslate, imagePlacement,
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

// bg/card here are the SAME dark near-black ValuIQ uses for the real win
// card (ShareCard.tsx's C.bg/C.surface, FlexRevealCard's C.bg) - "dark" is
// deliberately the closest match to that existing look, which is why it
// stays the default (see studioPrefs.ts). divider is the footer panel's
// top-border tint (ShareCard's footer bar divider), tuned per look so it
// reads on both a near-black and a white card.
const LOOKS: Record<StudioLook, { bg: string; card: string; text: string; sub: string; accent: string; chip: string; divider: string; onAccent: string; bigPrice?: boolean }> = {
  dark: { bg: "#0a0906", card: "#17150f", text: "#f5f2ed", sub: "#bdb8b0", accent: C.green, chip: "rgba(255,255,255,0.08)", divider: "rgba(255,255,255,0.1)", onAccent: C.greenDark },
  // MEASURED: light's accent is a dark green ("#2c7a1f") for readable
  // contrast on a light panel - the other looks' near-black greenDark
  // label would be low-contrast there, so the Share button label is white.
  light: { bg: "#f0ece3", card: "#ffffff", text: "#1c1a17", sub: "#6b655c", accent: "#2c7a1f", chip: "rgba(0,0,0,0.06)", divider: "rgba(0,0,0,0.1)", onAccent: "#ffffff" },
  bold: { bg: "#120a00", card: "#0c0600", text: "#fff6e0", sub: "#e8c26b", accent: C.gold, chip: "rgba(255,255,255,0.1)", divider: "rgba(255,255,255,0.12)", onAccent: "#2a1c00", bigPrice: true },
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

// Font sizes below are a FRACTION of their own zone's height, not a fixed
// px number - a zone given more room (e.g. Story's bigger price zone) gets
// a visibly bigger hero number for free, and nothing is ever stuck looking
// small inside a tall box (the old fixed-88px price in a ~400px-tall zone
// was most of what read as "tiny text, empty space" - see AGENTS.md's
// Studio problem report). Multipliers are tuned so the tallest realistic
// stack (paid + big + profit, or big + caption) stays inside the zone with
// margin to spare (checked by hand against every STORY_ZONE_H/ZONE_FRACTIONS
// combination in lib/shareStudio.ts).
function priceFonts(priceH: number) {
  return { paid: priceH * 0.11, big: priceH * 0.42, caption: priceH * 0.09, profit: priceH * 0.14 };
}
function nameFontSize(nameH: number) {
  return nameH * 0.38;
}
function stampFontSize(stampH: number) {
  return stampH * 0.34;
}

// The exported/previewed card itself - every number here is zones/geometry
// from lib/shareStudio.ts multiplied by `scale`. Nothing is hardcoded to a
// device size, and nothing here can overlap another zone (zonesForFormat's
// own header comment explains why that's structural, not incidental).
//
// LOOK BORROWED FROM THE REAL WIN CARD (ShareCard.tsx / FlexRevealCard.tsx):
// full-bleed photo up top, a bordered rotated verdict "stamp" pill, a huge
// glowing hero number (FlexRevealCard's radial-gradient glow treatment,
// just applied to this card's price zone instead of a photo-less screen),
// the item name below it, and a divided footer bar carrying the brand mark
// + handle - same bones ShareCard's header/photo/body/footer used, just
// mapped onto the fixed zone geometry every Studio format already shares.
export function StudioCardContent({ format, scale, look, photoUri, imgSize, crop, handle, hook, isWin, winText, stampText, priceBlock, itemName, isLoss }: StudioCardContentProps) {
  const palette = LOOKS[look];
  const canvas = FORMAT_SIZES[format];
  const W = canvas.w * scale;
  const H = canvas.h * scale;
  const zones = scaleZones(zonesForFormat(format), scale);
  const nativePhoto = photoZoneSize(format);
  const accent = isLoss ? C.red : palette.accent;
  const place = imgSize ? imagePlacement(imgSize, nativePhoto, crop, scale) : null;
  // The ALWAYS-cover-filled backdrop copy, dimmed, sitting behind the real
  // (possibly "contain"/letterboxed) crop - so the photo zone is never left
  // showing raw flat background in the gaps a contain crop leaves. A plain
  // dark dim rather than a true gaussian blur (no new native module in
  // build #46 - see scripts/native-modules-build46.json) but it reads the
  // same way: a soft, out-of-focus-looking fill, never empty.
  const backdropPlace = imgSize ? imagePlacement(imgSize, nativePhoto, { scale: 1, translate: { x: 0, y: 0 } }, scale) : null;
  const showStamp = isWin || !!stampText;
  const priceFont = priceFonts(zones.price.h);
  const nameFont = nameFontSize(zones.name.h);
  const stampFont = stampFontSize(zones.stamp.h);
  const glowColor = isLoss ? C.red : palette.accent;

  return (
    <View style={[st.card, { width: W, height: H, backgroundColor: palette.card, borderRadius: 18 * scale }]}>
      {/* PHOTO ZONE - as large as the win-card-style layout allows for this
          format (see zonesForFormat's own comment). */}
      <View style={{ position: "absolute", top: zones.photo.y, left: 0, width: W, height: zones.photo.h, overflow: "hidden", backgroundColor: C.surfaceHigh }}>
        {photoUri && backdropPlace ? (
          <Image source={{ uri: photoUri }} resizeMode="cover" style={{ position: "absolute", width: backdropPlace.w, height: backdropPlace.h, left: backdropPlace.left, top: backdropPlace.top, opacity: 0.45 }} />
        ) : null}
        {photoUri && backdropPlace ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.35)" }]} />
        ) : null}
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

      {/* STAMP ZONE - ShareCard's bordered verdict pill, tilted like
          FlexRevealCard's achievement badge. */}
      <View style={{ position: "absolute", top: zones.stamp.y, left: 0, width: W, height: zones.stamp.h, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {showStamp ? (
          <View style={{ borderWidth: 3 * scale, borderColor: accent, borderRadius: 8 * scale, paddingHorizontal: 18 * scale, paddingVertical: 8 * scale, transform: [{ rotate: "-6deg" }] }}>
            <CardText numberOfLines={1} style={{ color: accent, fontSize: stampFont, fontWeight: "900", letterSpacing: 1.5 * scale }}>
              {isWin ? "SOLD" : stampText}
            </CardText>
          </View>
        ) : null}
      </View>

      {/* PRICE ZONE - the hero moment, styled after FlexRevealCard's glow-
          backed count-up number: a soft radial glow behind a huge, bold
          price figure instead of a flat small number on a bare panel. */}
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
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: palette.sub, fontSize: priceFont.paid, fontWeight: "700" }}>
              {winText.subLine}
            </CardText>
            <CardText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: accent, fontSize: priceFont.big, fontWeight: "900", marginTop: 4 * scale, textShadowColor: glowColor + "80", textShadowRadius: 24 * scale, textShadowOffset: { width: 0, height: 0 } }}>
              {winText.bigLine}
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

      {/* NAME ZONE - numberOfLines=2 + adjustsFontSizeToFit + a minimumFontScale
          floor is what replaces the old single-line "American Flag and I..."
          truncation: the font shrinks until two lines hold the whole name,
          it is never cut off with an ellipsis. Font size is a fraction of
          the zone's own height (nameFontSize), so it reads big and bold
          like the win card's item-name line, not the old fixed 40px. */}
      <View style={{ position: "absolute", top: zones.name.y, left: 0, width: W, height: zones.name.h, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 * scale, overflow: "hidden" }}>
        <CardText numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: palette.text, fontSize: nameFont, fontWeight: "800", textAlign: "center", lineHeight: nameFont * 1.15 }}>
          {itemName}
        </CardText>
      </View>

      {/* FOOTER ZONE - ShareCard's footer-bar treatment: a divided panel
          (top border, subtly different tint) rather than bare canvas, so
          Story's reserved bottom safe-zone strip reads as an intentional
          brand footer, not dead space. Story has enough room here to also
          carry ShareCard's own tagline; Feed/Square keep just the
          handle/wordmark row their shorter footer always had. */}
      <View style={{ position: "absolute", top: zones.footer.y, left: 0, width: W, height: zones.footer.h, alignItems: "center", justifyContent: "center", backgroundColor: palette.chip, borderTopWidth: 1 * scale, borderTopColor: palette.divider }}>
        {format === "story" ? (
          <CardText numberOfLines={1} style={{ color: palette.sub, fontSize: 20 * scale, fontWeight: "600", letterSpacing: 0.5 * scale, marginBottom: 14 * scale }}>
            what resellers actually made
          </CardText>
        ) : null}
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

  // The crop a format should land on before any touch - defaultCropScale
  // (contain-biased on Feed/Square for a wider-than-tall photo, cover
  // otherwise). Falls back to plain cover when imgSize isn't known yet
  // (e.g. "Reset" tapped mid-load) rather than guessing.
  function smartDefaultCrop(format: StudioFormat, img: Size | null): CropState {
    return { scale: img ? defaultCropScale(format, img) : 1, translate: { x: 0, y: 0 } };
  }

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

  // Applies the smart (contain-biased where it matters) default crop to
  // the CURRENT format the first time its real image size is known -
  // guarded on the crop still being untouched (scale===1, no pan) so a
  // user's own pinch/pan/zoom is never overwritten. Runs again on every
  // format switch so a format visited for the first time after imgSize is
  // already known (the common case - imgSize usually resolves almost
  // instantly) gets its own smart default too, not just whichever format
  // happened to be active when imgSize first loaded.
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
          // Minimum zoom is "contain" (whole photo visible), not a flat 1
          // (= cover, forced crop) - see minCropScale's own header comment.
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
    // 12px side margins only (the preview's own flex:1 box already excludes
    // the top bar, controls row, and Share button above/below it).
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
            {/* Top bar: just the close icon + the format segmented control
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

            {/* The preview takes ALL remaining height above the controls
                row + Share button, scaled to fit with 12px side margins
                (onPreviewLayout). Tapping it opens Adjust photo. */}
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

            {/* ONE controls row: 3 look pills + Adjust + Customize. */}
            <View style={st.controlsRow}>
              {(["dark", "light", "bold"] as StudioLook[]).map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[st.lookPill, { backgroundColor: LOOKS[l].card, borderColor: prefs.look === l ? LOOKS[l].accent : C.border }]}
                  onPress={() => updatePrefs({ look: l })}
                >
                  <Text style={{ color: LOOKS[l].text, fontSize: 11, fontWeight: "800" }} numberOfLines={1}>{LOOK_LABELS[l]}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={st.controlBtn} onPress={() => setMode("adjust")}>
                <Text style={st.controlBtnText} numberOfLines={1}>Adjust</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.controlBtn} onPress={() => setCustomizeOpen(true)}>
                <Text style={st.controlBtnText} numberOfLines={1}>Customize</Text>
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
  // Top bar: X icon + the segmented control filling the rest of the row -
  // no title (TASK 3: a bigger, simpler Studio screen).
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8 },
  closeHit: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topTitle: { color: C.text1, fontSize: 16, fontWeight: "800", flexShrink: 1, textAlign: "center" },
  segmentRow: { flex: 1, flexDirection: "row", gap: 6 },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 9, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  segmentText: { fontSize: 12, fontWeight: "800" },
  cardShadow: { borderRadius: 18, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  // ONE controls row: 3 look pills + Adjust + Customize (TASK 3).
  controlsRow: { flexDirection: "row", gap: 6, width: "100%", paddingHorizontal: 16, marginTop: 8 },
  lookPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 100, borderWidth: 1.5, alignItems: "center" },
  controlBtn: { flex: 1, paddingVertical: 9, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  controlBtnText: { color: C.text1, fontSize: 12, fontWeight: "800" },
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
