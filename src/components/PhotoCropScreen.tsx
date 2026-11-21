// PhotoCropScreen.tsx — the dedicated full-screen crop editor for Share
// Studio's Photo tab. Shows the ORIGINAL photo behind a fixed frame (the
// card's photo box for the current format) and moves/zooms the PHOTO under
// it, Instagram-crop style - a real render only ever happens once, when the
// user taps Done (see ShareStudio.tsx).
//
// Rendered as a plain absolutely-positioned View INSIDE ShareStudio's own
// Modal (never a second native Modal - same "no nested Modal" convention
// FlexRevealCard.tsx's header comment documents for this codebase).
//
// All position/zoom math is lib/photoCrop.ts (pure, unit-tested) - this
// file only wires PanResponder touches into that reducer and mirrors its
// result onto four Animated.Value style props imperatively (no React
// re-render per touch-move).
//
// v8 ROOT-CAUSE FIX (founder device screenshot: src=data:image/jpeg (210KB)
// natural=667x1280 container=430x932 frame=28,104,374,299
// imageRect=0,-224,374,748 - what was actually ON SCREEN: the frame was
// drawn at x=0, vertically centered, NOT at the computed x=28/y=104, and a
// LANDSCAPE-painted photo read natural=667x1280 PORTRAIT):
//
// (1) LAYOUT - the frame/dim views were never position:'absolute'. They
// were a flex row (dimSide/frame/dimSide) inside a flex column (dim/
// frameRow/dim) and the code just TRUSTED flexbox to land them at the same
// numbers the debug text computed arithmetically - v8's own fixture test
// (photoCrop.test.ts's "container 430x932, upright photo 1280x667" suite)
// proves that arithmetic was always correct (left=28, width=374,
// height=299 for exactly this screen size), so the only explanation for an
// x=0 frame is that flex layout never actually applied those numbers. Fixed
// by computing the frame rect once (lib/photoCrop.ts's computeFrameRect,
// from the STAGE's own onLayout) and setting it directly as
// position:'absolute' left/top/width/height - no flex centering anywhere
// near the frame, dim bands, or image.
//
// (2) ORIENTATION - natural size used to come from the <Image>'s own onLoad
// event (nativeEvent.source.width/height), which reports the DECODED PIXEL
// size BEFORE the EXIF orientation flag is applied for painting on some
// platforms - exactly how a landscape-painted photo can read natural=
// 667x1280 (portrait). Fixed by normalizing the photo ONCE, in ShareStudio.
// tsx, via expo-image-manipulator's manipulateAsync (which bakes EXIF
// orientation into the output pixels) and threading its uri/width/height
// down here as the `natural` prop - the single source of truth for BOTH
// this screen's crop math and the payload photo (see shareCardApi.ts's
// normalizePhotoOrientation). The onLoad probe below is now only a
// fallback for the rare case normalization hasn't produced a result yet.
//
// (3) STALE GESTURE CLOSURE - v6/v7 built the PanResponder once via useRef,
// but its handlers read `natural`/`frameW`/`frameH` as plain consts closed
// over at the FIRST render (before the frame was ever measured) - so pan/
// pinch math could stay pinned to the pre-measurement fallback size for the
// screen's entire lifetime even though the frame visually resized. Fixed by
// reading both through refs that an effect keeps current every render.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, PanResponder, ActivityIndicator, LayoutChangeEvent } from "react-native";
import { C } from "../lib/theme";
import {
  cropDisplayRect, initCropGestureState, cropGestureReducer, CropGestureState,
  computeFrameRect, FRAME_MARGIN, clampZoom, clampFocusToBounds, CropRect,
} from "../lib/photoCrop";
import { MIN_NORMALIZED_EDGE_PX } from "../lib/shareCardApi";

// OTA-SAFE IMPORT (same convention shareCardApi.ts uses) - only needed here
// for the owner debug readout's file-size probe, never for real crop logic.
let FileSystem: typeof import("expo-file-system") | null = null;
try { FileSystem = require("expo-file-system"); } catch { FileSystem = null; }

export interface PhotoCropScreenProps {
  photoUri: string | null;
  box: { w: number; h: number }; // PHOTO_BOX for the current format - aspect ratio is what matters
  initial: { fx: number; fy: number; zoom: number };
  // v8: the orientation-normalized size (expo-image-manipulator's returned
  // width/height, baking in EXIF rotation) - the single source of truth for
  // BOTH this screen and the payload photo. When omitted (normalization
  // still in flight, or failed), this screen falls back to the <Image>'s
  // own onLoad event, same as v6/v7.
  natural?: { w: number; h: number } | null;
  isOwner?: boolean;
  // v9, requirement 1 ("payload=") - a label for whatever resolveSharePhoto
  // resolved to on the last card render, shown in the owner readout next to
  // this screen's own src=/natural= for a side-by-side repro.
  payloadDebug?: string;
  // v10, requirement 3 - the payload's own resolved pixel size (parsed out
  // of payloadDebug would be fragile - this travels structured), so the
  // readout can print a direct crop-screen-vs-payload comparison instead of
  // just the payload's byte count on its own.
  payloadDims?: { w: number; h: number } | null;
  // v10, requirement 1 - every stage normalizePhotoOrientation went through
  // for the CURRENT photoUri (source/materialize/manipulate/valid/fallback),
  // same instrumentation for a fresh scan or a History/win-reveal row -
  // shown as the owner readout's last line.
  normalizeDebug?: string[];
  // v9, requirement 3 - wired to the error state's "Use original" button;
  // omitted (no button rendered) for a caller that has no original to fall
  // back to.
  onUseOriginal?: () => void;
  onCancel: () => void;
  onDone: (adjust: { fx: number; fy: number; zoom: number }) => void;
}

const DOUBLE_TAP_MS = 300;
const ZOOM_STEP = 0.25;

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

// Owner-readout ONLY, requirement 1 - the uri's last 30 chars, so a repro
// can tell two file:// cache paths apart at a glance without the whole uri.
function last30(uri: string | null): string {
  if (!uri) return "none";
  return uri.length <= 30 ? uri : `…${uri.slice(-30)}`;
}

export default function PhotoCropScreen({
  photoUri, box, initial, natural, isOwner, payloadDebug, payloadDims, normalizeDebug, onUseOriginal, onCancel, onDone,
}: PhotoCropScreenProps) {
  const [loadedNatural, setLoadedNatural] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  // DECODED size, from the <Image>'s own onLoad event - captured for EVERY
  // load, even when `natural` was already supplied (unlike loadedNatural
  // below, which is only a fallback). This is requirement 1's "decoded
  // size reported by the rendered <Image> onLoad" AND requirement 3's tiny-
  // decode check - both need to see what actually got painted, not just
  // what the caller claimed it normalized to.
  const [decodedSize, setDecodedSize] = useState<{ w: number; h: number } | null>(null);
  // Actual on-disk byte size of `photoUri` - requirement 1. null for a
  // data:/remote uri (no local file to stat) or while the probe is still
  // running; never blocks rendering.
  const [fileBytes, setFileBytes] = useState<number | null>(null);
  // A NEW photoUri (e.g. the owner just tapped "Use original") deserves a
  // fresh load attempt, not yesterday's error/decoded-size readout.
  useEffect(() => {
    setLoadError(false);
    setDecodedSize(null);
  }, [photoUri]);
  useEffect(() => {
    setFileBytes(null);
    if (!photoUri) return;
    if (photoUri.startsWith("data:")) {
      setFileBytes(Math.floor((photoUri.length * 3) / 4));
      return;
    }
    if (!FileSystem || !photoUri.startsWith("file://")) return;
    try {
      const size = (new (FileSystem as any).File(photoUri)).size;
      if (typeof size === "number") setFileBytes(size);
    } catch {
      // owner-readout only - a failed stat just leaves fileBytes at null
    }
  }, [photoUri]);
  // Fallback natural size ONLY used when the caller hasn't normalized the
  // photo yet (see this file's header comment, item 2) - once `natural` is
  // passed in, the onLoad handler below never overwrites it.
  const effectiveNatural = natural ?? loadedNatural;
  // v9, requirement 3 - a visible error state (readout + "Use original"),
  // decoupled from `ready` below: `ready` only checks that SOME natural
  // size and frame rect exist, which stays true even when the normalized
  // photo's own self-reported dimensions are the bad data (see shareCardApi
  // .ts's normalizePhotoOrientation header comment) - this instead looks at
  // what the <Image> actually decoded, the one thing that can't lie.
  const decodeFailed = loadError || (!!decodedSize && (decodedSize.w < MIN_NORMALIZED_EDGE_PX || decodedSize.h < MIN_NORMALIZED_EDGE_PX));

  const boxAspect = box.w / box.h;

  // STAGE SIZE comes from the stage View's own onLayout - the area between
  // the header and footer, position:'relative' so the frame/dim/touch
  // layers inside it can be position:'absolute' against IT, not the whole
  // screen (see header comment, item 1).
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setStageSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  // FRAME RECT - computed, not measured - see lib/photoCrop.ts's
  // computeFrameRect. This is what actually gets applied as the frame's
  // position:'absolute' left/top/width/height below.
  const frameRect: CropRect | null = useMemo(
    () => (stageSize ? computeFrameRect(stageSize.w, stageSize.h, boxAspect, FRAME_MARGIN) : null),
    [stageSize, boxAspect]
  );

  // MEASURED frame rect, from the frame View's OWN onLayout - owner-readout
  // ONLY (never fed into crop math), so a future repro can see "measured"
  // and "computed" side by side instead of trusting one blindly (requirement
  // 2: "measured vs computed must match; print both").
  const [measuredFrameRect, setMeasuredFrameRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    setMeasuredFrameRect({ x, y, w: width, h: height });
  }, []);

  const ready = !!(effectiveNatural && frameRect && frameRect.width > 0 && frameRect.height > 0);

  const aLeft = useRef(new Animated.Value(0)).current;
  const aTop = useRef(new Animated.Value(0)).current;
  const aWidth = useRef(new Animated.Value(1)).current;
  const aHeight = useRef(new Animated.Value(1)).current;

  const gestureRef = useRef<CropGestureState>(initCropGestureState(initial.fx, initial.fy, initial.zoom));
  const [debugState, setDebugState] = useState(gestureRef.current);
  const lastTapRef = useRef<{ t: number } | null>(null);
  const [debugRect, setDebugRect] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // LATEST-STATE REFS (header comment, item 3) - the PanResponder below is
  // built exactly once via useRef, so its handlers must read the CURRENT
  // natural size/frame rect through refs an effect keeps in sync every
  // render, never through plain consts closed over at creation time.
  const naturalRef = useRef(effectiveNatural);
  const frameRectRef = useRef(frameRect);
  useEffect(() => { naturalRef.current = effectiveNatural; }, [effectiveNatural]);
  useEffect(() => { frameRectRef.current = frameRect; }, [frameRect]);

  function applyDisplay(fx: number, fy: number, zoom: number) {
    const n = naturalRef.current;
    const r = frameRectRef.current;
    if (!n || !r) return;
    const rect = cropDisplayRect(fx, fy, zoom, n.w, n.h, r.width, r.height);
    aLeft.setValue(rect.left);
    aTop.setValue(rect.top);
    aWidth.setValue(rect.width);
    aHeight.setValue(rect.height);
    setDebugRect(rect);
  }

  // RE-SEED ONCE READY (both the stage's measured layout AND the natural
  // size are known).
  useEffect(() => {
    if (!ready) return;
    gestureRef.current = initCropGestureState(initial.fx, initial.fy, initial.zoom);
    applyDisplay(initial.fx, initial.fy, initial.zoom);
    setDebugState(gestureRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (!naturalRef.current || !frameRectRef.current) return;
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
        const n = naturalRef.current;
        const r = frameRectRef.current;
        if (!n || !r) return;
        const touches = evt.nativeEvent.touches;
        const count = touches ? touches.length : 1;
        let pinchDist: number | undefined;
        if (touches && touches.length >= 2) {
          const [t0, t1] = touches;
          pinchDist = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
        }
        gestureRef.current = cropGestureReducer(gestureRef.current, {
          type: "move", touches: count, dx: gs.dx, dy: gs.dy, pinchDist,
          iw: n.w, ih: n.h, frameW: r.width, frameH: r.height,
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

  // CENTER (requirement 3's secondary control row) - recenters the pan at
  // the CURRENT zoom, distinct from the footer's full Reset (zoom back to
  // 1x too). Useful after a +/- zoom step drifts off-frame.
  function handleCenter() {
    const n = naturalRef.current;
    const r = frameRectRef.current;
    if (!n || !r) return;
    const s = gestureRef.current;
    const { fx, fy } = clampFocusToBounds(0.5, 0.5, n.w, n.h, r.width, r.height, s.zoom);
    gestureRef.current = { ...s, fx, fy, baseFx: fx, baseFy: fy, phase: "end" };
    applyDisplay(fx, fy, s.zoom);
    setDebugState(gestureRef.current);
  }

  // +/- ZOOM BUTTONS (requirement 3) - a fallback control so zoom works
  // even if pinch fails on a given device.
  function bumpZoom(delta: number) {
    const n = naturalRef.current;
    const r = frameRectRef.current;
    if (!n || !r) return;
    const s = gestureRef.current;
    const nextZoom = clampZoom(s.zoom + delta);
    const { fx, fy } = clampFocusToBounds(s.fx, s.fy, n.w, n.h, r.width, r.height, nextZoom);
    gestureRef.current = { ...s, zoom: nextZoom, fx, fy, baseZoom: nextZoom, baseFx: fx, baseFy: fy, phase: "end" };
    applyDisplay(fx, fy, nextZoom);
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

      {/* STAGE - flex:1 fills the space between header/footer; position:
          'relative' + overflow:'hidden' so every child below can be
          position:'absolute' against IT (header comment, item 1) - no flex
          centering anywhere near the frame/dim/touch layers. */}
      <View style={st.stage} onLayout={onStageLayout}>
        {frameRect && stageSize ? (
          <>
            {/* DIM BANDS - four absolutely positioned Views covering
                everything OUTSIDE the frame, instead of a flex row's
                dimSide siblings. */}
            <View pointerEvents="none" style={[st.dim, { left: 0, top: 0, width: stageSize.w, height: frameRect.top }]} />
            <View pointerEvents="none" style={[st.dim, { left: 0, top: frameRect.top + frameRect.height, width: stageSize.w, height: Math.max(0, stageSize.h - frameRect.top - frameRect.height) }]} />
            <View pointerEvents="none" style={[st.dim, { left: 0, top: frameRect.top, width: frameRect.left, height: frameRect.height }]} />
            <View pointerEvents="none" style={[st.dim, { left: frameRect.left + frameRect.width, top: frameRect.top, width: Math.max(0, stageSize.w - frameRect.left - frameRect.width), height: frameRect.height }]} />

            {/* FRAME - position:'absolute' at the COMPUTED rect (v8 fix) -
                fixed aspect of the card's photo box, with a visible 2px
                lime border so it's unmistakably the crop boundary. */}
            <View
              style={[st.frame, { left: frameRect.left, top: frameRect.top, width: frameRect.width, height: frameRect.height }]}
              onLayout={onFrameLayout}
            >
              {photoUri ? (
                <Animated.Image
                  source={{ uri: photoUri }}
                  resizeMode="cover"
                  onLoad={(e) => {
                    const src = e.nativeEvent?.source;
                    if (src && src.width > 0 && src.height > 0) {
                      setDecodedSize({ w: src.width, h: src.height });
                      if (!natural) setLoadedNatural({ w: src.width, h: src.height }); // already normalized upstream - never override
                    }
                  }}
                  onError={() => setLoadError(true)}
                  style={{
                    position: "absolute",
                    left: aLeft, top: aTop, width: aWidth, height: aHeight,
                    opacity: ready && !decodeFailed ? 1 : 0,
                  }}
                />
              ) : null}
              {!ready && !decodeFailed ? (
                <View style={st.loadingBox}>
                  <ActivityIndicator color={C.green} />
                </View>
              ) : null}
              {decodeFailed ? (
                <View style={st.loadingBox}>
                  <Text style={st.loadErrorText}>
                    Couldn't load the photo.{"\n"}
                    {loadError ? "Image failed to decode" : `Decoded too small (${decodedSize?.w}×${decodedSize?.h})`}
                  </Text>
                  {onUseOriginal ? (
                    <TouchableOpacity style={st.useOriginalBtn} onPress={onUseOriginal}>
                      <Text style={st.useOriginalBtnText}>Use original</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* TOUCH LAYER (requirement 3) - one transparent, absolutely
                positioned View over the WHOLE stage, zIndex high,
                pointerEvents 'box-only' so it is a single hit box
                regardless of what's rendered beneath it. Holds the
                PanResponder - drag/pinch work anywhere in the stage, not
                just directly over the frame. Skipped entirely while
                decodeFailed (v9) - it would otherwise sit on top of the
                error state's "Use original" button (inside frame, a lower
                sibling) and swallow the tap meant for it; panning/zooming a
                photo that failed to decode has nothing useful to do anyway. */}
            {!decodeFailed ? (
              <View
                style={st.touchLayer}
                pointerEvents="box-only"
                {...responder.panHandlers}
              />
            ) : null}
          </>
        ) : (
          <View style={st.loadingBox}>
            <ActivityIndicator color={C.green} />
          </View>
        )}
      </View>

      {/* ZOOM ROW (requirement 3) - works even if pinch fails. Disabled
          while decodeFailed too (v9) - nothing useful to pan/zoom on a
          photo that failed to decode. */}
      <View style={st.zoomRow}>
        <TouchableOpacity style={st.zoomBtn} onPress={() => bumpZoom(-ZOOM_STEP)} disabled={!ready || decodeFailed}>
          <Text style={st.zoomBtnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.centerBtn} onPress={handleCenter} disabled={!ready || decodeFailed}>
          <Text style={st.centerBtnText}>Center</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.zoomBtn} onPress={() => bumpZoom(ZOOM_STEP)} disabled={!ready || decodeFailed}>
          <Text style={st.zoomBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {isOwner ? (
        <Text style={st.debugText} numberOfLines={16}>
          src={describeUriSource(photoUri)} tail={last30(photoUri)} bytes={fileBytes != null ? fileBytes : "—"} natural={effectiveNatural ? `${effectiveNatural.w}x${effectiveNatural.h}` : "—"} decoded={decodedSize ? `${decodedSize.w}x${decodedSize.h}` : "—"} stage={stageSize ? `${Math.round(stageSize.w)}x${Math.round(stageSize.h)}` : "—"}
          {"\n"}blurRadius=none resizeMode=cover defaultSource=none payload={payloadDebug ?? "none"}
          {/* v10, requirement 3 - crop-screen vs payload dims/bytes, side by
              side, so a mismatch (the founder repro's 43KB payload next to a
              344KB "Use original" crop screen) is visible on-screen without
              a repro + source dive. */}
          {"\n"}compare crop={effectiveNatural ? `${effectiveNatural.w}x${effectiveNatural.h}` : "—"} payload={payloadDims ? `${payloadDims.w}x${payloadDims.h}` : "—"} match={effectiveNatural && payloadDims ? (effectiveNatural.w === payloadDims.w && effectiveNatural.h === payloadDims.h ? "yes" : "NO") : "—"}
          {"\n"}frame computed={frameRect ? `${Math.round(frameRect.left)},${Math.round(frameRect.top)},${Math.round(frameRect.width)},${Math.round(frameRect.height)}` : "—"} measured={measuredFrameRect ? `${Math.round(measuredFrameRect.x)},${Math.round(measuredFrameRect.y)},${Math.round(measuredFrameRect.w)},${Math.round(measuredFrameRect.h)}` : "—"}
          {"\n"}imageRect={`${Math.round(debugRect.left)},${Math.round(debugRect.top)},${Math.round(debugRect.width)},${Math.round(debugRect.height)}`}
          {"\n"}gesture: {debugState.phase} touches={debugState.touches} dx={debugState.dx.toFixed(2)} dy={debugState.dy.toFixed(2)} scale={debugState.scale.toFixed(2)} fx={debugState.fx.toFixed(2)} fy={debugState.fy.toFixed(2)} zoom={debugState.zoom.toFixed(2)}
          {/* v10, requirement 1 - every normalizePhotoOrientation stage for
              THIS photo (works the same for a fresh scan's photoBase64 and
              a History/win-reveal row's photoUri). */}
          {normalizeDebug && normalizeDebug.length ? `\nnormalize: ${normalizeDebug.join(" | ")}` : null}
        </Text>
      ) : null}

      <View style={st.footer}>
        <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
          <Text style={st.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.resetBtn} onPress={handleReset}>
          <Text style={st.resetBtnText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.doneBtn} onPress={handleDone} disabled={!ready || decodeFailed}>
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
  // STAGE (v8 fix, item 1) - position:'relative' + overflow:'hidden' is the
  // anchor every child below is position:'absolute' against. No flex
  // centering anywhere in this subtree.
  stage: { flex: 1, position: "relative", overflow: "hidden", backgroundColor: "#000" },
  dim: { position: "absolute", backgroundColor: "rgba(0,0,0,0.85)" },
  // FRAME (v8 fix) - position:'absolute', left/top/width/height set inline
  // from the computed rect at the JSX call site above.
  frame: { position: "absolute", overflow: "hidden", backgroundColor: "#111", borderWidth: 2, borderColor: C.green },
  // TOUCH LAYER (requirement 3) - transparent, covers the whole stage,
  // above the frame/dim views (zIndex), box-only so it alone is the hit
  // target for the PanResponder.
  touchLayer: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 50 },
  loadingBox: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 14 },
  loadErrorText: { color: C.text3, fontSize: 13, fontWeight: "700", textAlign: "center", paddingHorizontal: 20 },
  // "Use original" button (v9, requirement 3) - inside the error state's
  // loadingBox, above the (now un-rendered) touch layer so it's reliably
  // tappable - see the touchLayer comment above.
  useOriginalBtn: { minHeight: 44, minWidth: 140, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  useOriginalBtnText: { color: C.greenDark, fontSize: 14, fontWeight: "800" },
  zoomRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, justifyContent: "center" },
  zoomBtn: { minWidth: 50, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  zoomBtnText: { color: C.text2, fontSize: 20, fontWeight: "800" },
  centerBtn: { minWidth: 90, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  centerBtnText: { color: C.text2, fontSize: 13, fontWeight: "800" },
  debugText: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, textAlign: "center", paddingVertical: 4, paddingHorizontal: 12 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30 },
  cancelBtn: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  cancelBtnText: { color: C.text3, fontSize: 15, fontWeight: "800" },
  resetBtn: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  resetBtnText: { color: C.text3, fontSize: 15, fontWeight: "800" },
  doneBtn: { flex: 1.4, minHeight: 50, borderRadius: 14, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  doneBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },
});
