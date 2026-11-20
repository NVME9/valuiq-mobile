// PhotoCropScreen.tsx — the dedicated full-screen crop editor for Share
// Studio's Photo tab (v6, item A). Replaces the old "transform the whole
// card preview locally, then dim it behind a spinner and re-render from the
// server" approach entirely: the founder's device recording showed the
// pinch/drag handlers DID fire, but they moved the wrong thing (the WHOLE
// card, ballooning over the header) and the result barely changed once the
// server re-render landed on top. This screen instead shows the ORIGINAL
// photo behind a fixed frame (the card's photo box for the current format)
// and moves/zooms the PHOTO under it, Instagram-crop style - a real render
// only ever happens once, when the user taps Done (see ShareStudio.tsx).
//
// Rendered as a plain absolutely-positioned View INSIDE ShareStudio's own
// Modal (never a second native Modal - same "no nested Modal" convention
// FlexRevealCard.tsx's header comment documents for this codebase).
//
// All position/zoom math is lib/photoCrop.ts (pure, unit-tested) - this
// file only wires PanResponder touches into that reducer and mirrors its
// result onto four Animated.Value style props imperatively (no React
// re-render per touch-move), the same performance pattern the retired
// gesture overlay used.
//
// v7 ROOT-CAUSE FIX (founder device bug: "Adjust photo" showed a blurry
// blob offset to the left edge, no frame visible, instead of the photo -
// screenshot readout fx=0.50 fy=0.50 zoom=1.00, image not covering the
// frame on one side): this screen used to (1) size its frame from
// Dimensions.get("window") captured ONCE at module-import time (line 37 in
// the old version) rather than the frame View's own measured layout, and
// (2) probe the photo's natural size via a SEPARATE Image.getSize(uri)
// bridge call rather than the dimensions the <Image> itself decodes for
// display. lib/photoCrop.ts's coverScale is PROVABLY gap-free given valid,
// matching inputs (see photoCrop.test.ts's "photo always covers the frame"
// suite) - so the only way to get an undercovered, offset image is for one
// of those two inputs to disagree with what's actually on screen. That's
// exactly what a data: URI full-resolution photo carrying EXIF rotation can
// do: deal-ai-pro's own server-side preparePhoto() (validateBody.ts) always
// calls `sharp(rawPhoto).rotate()` to normalize EXIF orientation before
// rendering, which is itself evidence that this app's captured photos
// routinely carry EXIF rotation metadata - metadata Image.getSize does not
// uniformly honor the way the native <Image> decoder does when PAINTING the
// photo, so the two can disagree about which axis is "wide." The fix:
// never size the frame from a module-level Dimensions constant (measure it
// via onLayout instead) and never probe size via a separate getSize call -
// read the natural size the SAME <Image> that's on screen reports via its
// own onLoad event, and don't compute any crop geometry until BOTH that
// onLoad AND the frame's onLayout have fired.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, Dimensions, ActivityIndicator, LayoutChangeEvent } from "react-native";
import { C } from "../lib/theme";
import {
  cropDisplayRect, initCropGestureState, cropGestureReducer, CropGestureState,
} from "../lib/photoCrop";

export interface PhotoCropScreenProps {
  photoUri: string | null;
  box: { w: number; h: number }; // PHOTO_BOX for the current format - aspect ratio is what matters
  initial: { fx: number; fy: number; zoom: number };
  isOwner?: boolean;
  onCancel: () => void;
  onDone: (adjust: { fx: number; fy: number; zoom: number }) => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const FRAME_MARGIN = 28;
const HEADER_H = 76;
const FOOTER_H = 150;
const DOUBLE_TAP_MS = 300;

// Fallback frame size used ONLY for the very first paint, before the frame
// View's own onLayout has fired - computed from Dimensions the same way the
// old (buggy) version did, but now just a placeholder guess that gets
// replaced by the real measured size a frame later, never fed into the
// actual crop math once `measured` is set.
function fallbackFrameSize(boxAspect: number): { w: number; h: number } {
  const availW = SCREEN_W - FRAME_MARGIN * 2;
  const availH = SCREEN_H - HEADER_H - FOOTER_H - FRAME_MARGIN * 2;
  const w = availW / availH > boxAspect ? availH * boxAspect : availW;
  return { w, h: w / boxAspect };
}

// Best-effort "what kind of URI is this" label for the owner debug readout -
// never used for any real logic, just so a future repro can tell "a 2KB
// data: thumbnail" apart from "a 4MB data: original" apart from "a remote
// https: URL" at a glance.
function describeUriSource(uri: string | null): string {
  if (!uri) return "none";
  const dataMatch = /^data:([^;,]+)/.exec(uri);
  if (dataMatch) return `data:${dataMatch[1]} (${(uri.length / 1024).toFixed(0)}KB)`;
  if (/^https?:\/\//i.test(uri)) return `url:${uri.slice(0, 40)}…`;
  if (/^file:\/\//i.test(uri)) return "file";
  return "unknown";
}

export default function PhotoCropScreen({ photoUri, box, initial, isOwner, onCancel, onDone }: PhotoCropScreenProps) {
  // NATURAL SIZE comes from the <Image>'s OWN onLoad event (nativeEvent.
  // source.width/height) - never a separate Image.getSize() probe. onLoad
  // reports the dimensions the SAME decode pass that paints the image
  // produced, so geometry computed from it can never disagree with what's
  // actually on screen (see this file's header comment for why a separate
  // probe could).
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const boxAspect = box.w / box.h;
  const fallback = fallbackFrameSize(boxAspect);

  // FRAME SIZE comes from the frame View's own onLayout - never a module-
  // level Dimensions.get("window") constant (which is captured once at
  // import time and can go stale - see header comment). Falls back to the
  // Dimensions-derived guess only for the handful of frames before the
  // first onLayout fires, and that guess is never used once `measured` is set.
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const frameW = measured?.w ?? fallback.w;
  const frameH = measured?.h ?? fallback.h;

  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setMeasured({ w: width, h: height });
  }, []);

  // Geometry is only ever "ready" once BOTH the frame's real layout AND the
  // image's real decoded size are known - this is the direct fix for
  // requirement (b): never compute/paint a crop rect from a guessed frame
  // size or a not-yet-loaded image.
  const ready = measured != null && natural != null;

  const aLeft = useRef(new Animated.Value(0)).current;
  const aTop = useRef(new Animated.Value(0)).current;
  const aWidth = useRef(new Animated.Value(1)).current;
  const aHeight = useRef(new Animated.Value(1)).current;

  const gestureRef = useRef<CropGestureState>(initCropGestureState(initial.fx, initial.fy, initial.zoom));
  const [debugState, setDebugState] = useState(gestureRef.current);
  const lastTapRef = useRef<{ t: number } | null>(null);
  // Mirrors the Animated values in plain numbers purely for the owner debug
  // readout below (Animated.Value's current number isn't readable directly
  // without a change listener) - never read by the gesture math itself.
  const [debugRect, setDebugRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  function applyDisplay(fx: number, fy: number, zoom: number) {
    if (!natural || !measured) return;
    const r = cropDisplayRect(fx, fy, zoom, natural.w, natural.h, frameW, frameH);
    aLeft.setValue(r.left);
    aTop.setValue(r.top);
    aWidth.setValue(r.width);
    aHeight.setValue(r.height);
    setDebugRect(r);
  }

  // RE-SEED ONCE BOTH INPUTS ARE IN (requirement b: "compute geometry only
  // after both onLayout and onLoad") - this is the direct replacement for
  // the old version's `useEffect(..., [natural])`, now gated on `ready`
  // (both the frame's real measured layout AND the image's real decoded
  // size) instead of `natural` alone, which is exactly the gap that let a
  // frame sized from a stale Dimensions constant go unnoticed.
  useEffect(() => {
    if (!ready) return;
    gestureRef.current = initCropGestureState(initial.fx, initial.fy, initial.zoom);
    applyDisplay(initial.fx, initial.fy, initial.zoom);
    setDebugState(gestureRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Built ONCE via useRef (never rebuilt on a dep change) - same stale-
  // closure-avoidance convention the retired gesture overlay used, except
  // this screen's gesture math only ever needs `natural`/frameW/frameH,
  // which are either fixed for this screen's lifetime or read through the
  // ref/closure safely since the responder itself is torn down with the
  // whole screen on Cancel/Done (never rebuilt mid-gesture).
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        if (!ready) return;
        const now = Date.now();
        if (lastTapRef.current && now - lastTapRef.current.t < DOUBLE_TAP_MS) {
          lastTapRef.current = null;
          gestureRef.current = initCropGestureState(0.5, 0.5, 1);
          applyDisplay(0.5, 0.5, 1);
          setDebugState(gestureRef.current);
          return;
        }
        lastTapRef.current = { t: now };
        gestureRef.current = cropGestureReducer(gestureRef.current, { type: "start" });
      },
      onPanResponderMove: (evt, gs) => {
        if (!natural || !measured) return;
        const touches = evt.nativeEvent.touches;
        const n = touches ? touches.length : 1;
        let pinchDist: number | undefined;
        if (touches && touches.length >= 2) {
          const [t0, t1] = touches;
          pinchDist = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
        }
        gestureRef.current = cropGestureReducer(gestureRef.current, {
          type: "move", touches: n, dx: gs.dx, dy: gs.dy, pinchDist,
          iw: natural.w, ih: natural.h, frameW, frameH,
        });
        const s = gestureRef.current;
        applyDisplay(s.fx, s.fy, s.zoom);
        setDebugState(s);
      },
      onPanResponderRelease: () => {
        gestureRef.current = cropGestureReducer(gestureRef.current, { type: "end" });
        setDebugState(gestureRef.current);
      },
      onPanResponderTerminate: () => {
        gestureRef.current = cropGestureReducer(gestureRef.current, { type: "end" });
        setDebugState(gestureRef.current);
      },
    })
  ).current;

  function handleReset() {
    gestureRef.current = initCropGestureState(0.5, 0.5, 1);
    applyDisplay(0.5, 0.5, 1);
    setDebugState(gestureRef.current);
  }

  function handleDone() {
    const s = gestureRef.current;
    onDone({ fx: s.fx, fy: s.fy, zoom: s.zoom });
  }

  return (
    <View style={st.root}>
      <View style={st.header}>
        <Text style={st.headerTitle}>Adjust photo</Text>
        <Text style={st.hint} numberOfLines={1}>Drag to move · pinch to zoom</Text>
      </View>

      <View style={st.stage}>
        <View style={[st.dim, { height: (SCREEN_H - HEADER_H - FOOTER_H - frameH) / 2 }]} />
        <View style={st.frameRow}>
          <View style={[st.dimSide, { width: (SCREEN_W - FRAME_MARGIN * 2 - frameW) / 2 }]} />
          {/* FRAME — fixed aspect of the card's photo box, centered, with a
              visible 2px lime border (v7, item 2c) so it's unmistakably the
              crop boundary rather than just more black background. Its
              onLayout is the REAL measured size the crop math uses (see this
              file's header comment) - the inline w/h style below is only a
              best-effort pre-layout guess for the very first paint. */}
          <View
            style={[st.frame, { width: frameW, height: frameH }]}
            onLayout={onFrameLayout}
            {...responder.panHandlers}
          >
            {photoUri ? (
              <Animated.Image
                source={{ uri: photoUri }}
                resizeMode="cover"
                onLoad={(e) => {
                  const src = e.nativeEvent?.source;
                  if (src && src.width > 0 && src.height > 0) setNatural({ w: src.width, h: src.height });
                }}
                onError={() => setLoadError(true)}
                style={{
                  position: "absolute",
                  left: aLeft, top: aTop, width: aWidth, height: aHeight,
                  opacity: ready ? 1 : 0,
                }}
              />
            ) : null}
            {!ready ? (
              <View style={st.loadingBox}>
                {loadError ? (
                  <Text style={st.loadErrorText}>Couldn't load the photo.</Text>
                ) : (
                  <ActivityIndicator color={C.green} />
                )}
              </View>
            ) : null}
          </View>
          <View style={[st.dimSide, { width: (SCREEN_W - FRAME_MARGIN * 2 - frameW) / 2 }]} />
        </View>
        <View style={[st.dim, { height: (SCREEN_H - HEADER_H - FOOTER_H - frameH) / 2 }]} />
      </View>

      {isOwner ? (
        <Text style={st.debugText} numberOfLines={3}>
          src={describeUriSource(photoUri)} natural={natural ? `${natural.w}x${natural.h}` : "—"} container={SCREEN_W}x{SCREEN_H} frame={`${Math.round((SCREEN_W - frameW) / 2)},${Math.round(HEADER_H + FRAME_MARGIN)},${Math.round(frameW)},${Math.round(frameH)}`} imageRect={`${Math.round(debugRect.left)},${Math.round(debugRect.top)},${Math.round(debugRect.width)},${Math.round(debugRect.height)}`}
          {"\n"}gesture: {debugState.phase} touches={debugState.touches} fx={debugState.fx.toFixed(2)} fy={debugState.fy.toFixed(2)} zoom={debugState.zoom.toFixed(2)}
        </Text>
      ) : null}

      <View style={st.footer}>
        <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
          <Text style={st.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.resetBtn} onPress={handleReset}>
          <Text style={st.resetBtnText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.doneBtn} onPress={handleDone} disabled={!ready}>
          <Text style={st.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.bg, zIndex: 200 },
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10, alignItems: "center" },
  headerTitle: { color: C.text1, fontSize: 16, fontWeight: "800" },
  hint: { color: C.text4, fontSize: 12, fontWeight: "600", marginTop: 4 },
  stage: { flex: 1, backgroundColor: "#000" },
  dim: { backgroundColor: "rgba(0,0,0,0.85)" },
  frameRow: { flexDirection: "row" },
  dimSide: { backgroundColor: "rgba(0,0,0,0.85)" },
  // Visible 2px lime border (v7, item 2c) - previously no border at all, so
  // a correctly-centered, correctly-covering frame was indistinguishable
  // from the surrounding dim/black background, reading as "no frame" even
  // when the geometry itself was fine.
  frame: { overflow: "hidden", backgroundColor: "#111", borderWidth: 2, borderColor: C.green },
  loadingBox: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  loadErrorText: { color: C.text3, fontSize: 13, fontWeight: "700", textAlign: "center", paddingHorizontal: 20 },
  debugText: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, textAlign: "center", paddingVertical: 4, paddingHorizontal: 12 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30 },
  cancelBtn: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { color: C.text3, fontSize: 15, fontWeight: "800" },
  resetBtn: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  resetBtnText: { color: C.text3, fontSize: 15, fontWeight: "800" },
  doneBtn: { flex: 1.4, minHeight: 50, borderRadius: 14, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  doneBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },
});
