// RevealPhotoEditor.tsx — crop/rotate/straighten/flip editor for the "Share
// reveal" card's photo ONLY. The caller (RevealScreen) keeps its own
// original base64 untouched - this component receives whatever the reveal
// photo currently is, and returns a NEW base64 on save; it never mutates
// the scan's own saved image in any way.
//
// NO GESTURE-HANDLER, NO REANIMATED (2026-11-11, OTA-only build): neither
// is in this binary (see feat/reveal-share's own native-module audit) - all
// pinch/drag here is plain React Native core PanResponder + useState, the
// same "no new native module" posture FlexRevealCard.tsx/ProfitFlexHero.tsx
// already use for their own Animated work.
//
// EAGER BAKE, LAZY CROP: rotate-90/flip/straighten each call
// expo-image-manipulator IMMEDIATELY and replace the working image - this
// is the industry-standard "straighten by rotating then over-zooming to
// crop the corners" technique, and it means the ONLY math `save()` ever has
// to do is pan+zoom against an image that's already fully oriented (no
// rotation term to fold into the crop rectangle). Crop itself (free-form
// rect, or the fixed 9:16 frame) is resolved once, on Save, from the
// on-screen pan/zoom state - never a running 60fps native crop.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, PanResponder, Dimensions, ActivityIndicator, Modal } from "react-native";
import type * as ImageManipulatorNS from "expo-image-manipulator";
import { C } from "../lib/theme";

// OTA-SAFE IMPORT (2026-11-11, crash incident): expo-image-manipulator's
// native entry point resolves its native module at MODULE SCOPE - a static
// top-level `import` can't be wrapped in try/catch (Metro evaluates it
// unconditionally), so a missing native module would crash the whole app
// at launch, not just this editor (this file is reachable from
// RevealScreen.tsx, which ScannerScreen - eagerly imported by App.tsx -
// always mounts). PHOTO_EDITOR_AVAILABLE lets RevealScreen hide the "Edit
// photo" entry point entirely when this is null, rather than opening an
// editor whose rotate/flip/crop buttons would throw on tap.
export let ImageManipulator: typeof ImageManipulatorNS | null = null;
try { ImageManipulator = require("expo-image-manipulator"); } catch { ImageManipulator = null; }
export const PHOTO_EDITOR_AVAILABLE = ImageManipulator != null;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const VIEWPORT_W = SCREEN_W - 32;
const VIEWPORT_H = SCREEN_H - 320; // leaves room for the top toolbar + bottom controls
const MAX_ZOOM = 4;
const MIN_FRAME = 90; // px - a free-form frame can never shrink below this
const STRAIGHTEN_RANGE = 15; // degrees, -15..15 - "fine" on purpose, not a full rotate

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function fixedFrameSize(): { w: number; h: number } {
  // 9:16, as large as fits the viewport in both dimensions.
  let w = VIEWPORT_W;
  let h = (w * 16) / 9;
  if (h > VIEWPORT_H) { h = VIEWPORT_H; w = (h * 9) / 16; }
  return { w, h };
}

interface Props {
  visible: boolean;
  sourceBase64: string; // the CURRENT reveal photo (may already reflect a prior edit)
  originalBase64: string; // the scan's untouched photo - what "Reset" returns to
  onCancel: () => void;
  onSave: (newBase64: string) => void;
}

export default function RevealPhotoEditor({ visible, sourceBase64, originalBase64, onCancel, onSave }: Props) {
  // workingUri: the fully-baked (rotate/flip/straighten already applied)
  // current image - what pan/zoom/crop operate against. Re-seeded from
  // sourceBase64 every time the editor opens.
  const [workingUri, setWorkingUri] = useState(`data:image/jpeg;base64,${sourceBase64}`);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const [cropMode, setCropMode] = useState<"fixed916" | "free">("fixed916");
  const [frame, setFrame] = useState(fixedFrameSize());
  const [userScale, setUserScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [straighten, setStraighten] = useState(0); // live slider position, degrees, resets to 0 after each bake
  const [flipped, setFlipped] = useState(false); // display-only indicator; the actual flip is already baked into workingUri

  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);

  // AUTO-FIT TO 9:16 ON OPEN (item 4): re-seed everything from the source
  // photo whenever the editor is (re-)opened - never carries stale edit
  // state from a previous open into a new one.
  useEffect(() => {
    if (!visible) return;
    setWorkingUri(`data:image/jpeg;base64,${sourceBase64}`);
    setCropMode("fixed916");
    setFrame(fixedFrameSize());
    setStraighten(0);
    setFlipped(false);
    setImgSize(null); // forces the Image onLoad below to re-measure and auto-fit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sourceBase64]);

  function coverScale(size: { w: number; h: number }, fr: { w: number; h: number }) {
    return Math.max(fr.w / size.w, fr.h / size.h);
  }

  function autoFit(size: { w: number; h: number }, fr: { w: number; h: number }) {
    setImgSize(size);
    setUserScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  function clampTranslate(t: { x: number; y: number }, scale: number, size = imgSize, fr = frame) {
    if (!size) return t;
    const abs = coverScale(size, fr) * scale;
    const maxX = Math.max(0, (size.w * abs - fr.w) / 2);
    const maxY = Math.max(0, (size.h * abs - fr.h) / 2);
    return { x: clamp(t.x, -maxX, maxX), y: clamp(t.y, -maxY, maxY) };
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStart.current = null;
        pinchStartDist.current = null;
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          panStart.current = null;
          const [a, b] = touches;
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          if (pinchStartDist.current == null) {
            pinchStartDist.current = dist;
            pinchStartScale.current = userScale;
          }
          const next = clamp(pinchStartScale.current * (dist / pinchStartDist.current), 1, MAX_ZOOM);
          setUserScale(next);
          setTranslate((t) => clampTranslate(t, next));
        } else if (touches.length === 1) {
          pinchStartDist.current = null;
          const t = touches[0];
          if (!panStart.current) panStart.current = { x: t.pageX, y: t.pageY, tx: translate.x, ty: translate.y };
          const dx = t.pageX - panStart.current.x;
          const dy = t.pageY - panStart.current.y;
          setTranslate(clampTranslate({ x: panStart.current.tx + dx, y: panStart.current.ty + dy }, userScale));
        }
      },
      onPanResponderRelease: () => { panStart.current = null; pinchStartDist.current = null; },
      onPanResponderTerminate: () => { panStart.current = null; pinchStartDist.current = null; },
    })
  ).current;

  // Straighten slider - a small horizontal track, dragged with its own
  // PanResponder. Live rotation is preview-only (CSS-style transform on the
  // Image, layered ON TOP of the pan/zoom transform below) until release,
  // when it's baked for real (see bakeStraighten) - see this file's header
  // comment for why eager-bake keeps the crop math simple.
  const straightenTrackW = VIEWPORT_W - 80;
  const straightenStart = useRef(0);
  const straightenResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { straightenStart.current = straighten; },
      onPanResponderMove: (_evt, g) => {
        const degPerPx = (STRAIGHTEN_RANGE * 2) / straightenTrackW;
        setStraighten(clamp(straightenStart.current + g.dx * degPerPx, -STRAIGHTEN_RANGE, STRAIGHTEN_RANGE));
      },
      onPanResponderRelease: () => { bakeStraighten(); },
      onPanResponderTerminate: () => { bakeStraighten(); },
    })
  ).current;

  async function bake(actions: ImageManipulatorNS.Action[]) {
    if (!ImageManipulator) return;
    setBusy(true);
    try {
      const out = await ImageManipulator.manipulateAsync(workingUri, actions, {
        base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.9,
      });
      setWorkingUri(`data:image/jpeg;base64,${out.base64}`);
      autoFit({ w: out.width, h: out.height }, frame);
    } catch {
      // Bake failed (corrupt intermediate, OOM on a huge photo, etc.) - keep
      // whatever was already working rather than losing the user's edit.
    } finally {
      setBusy(false);
    }
  }

  function bakeStraighten() {
    if (Math.abs(straighten) < 0.5) { setStraighten(0); return; } // not worth a round trip for a near-zero nudge
    const deg = straighten;
    setStraighten(0);
    bake([{ rotate: deg }]);
  }

  function rotate90() { bake([{ rotate: 90 }]); }
  function flip() {
    if (!ImageManipulator) return;
    setFlipped((f) => !f);
    bake([{ flip: ImageManipulator.FlipType.Horizontal }]);
  }
  function reset() {
    setWorkingUri(`data:image/jpeg;base64,${originalBase64}`);
    setCropMode("fixed916");
    setFrame(fixedFrameSize());
    setStraighten(0);
    setFlipped(false);
    setImgSize(null);
  }

  function setMode(mode: "fixed916" | "free") {
    setCropMode(mode);
    if (mode === "fixed916") {
      const fr = fixedFrameSize();
      setFrame(fr);
      if (imgSize) setTranslate((t) => clampTranslate(t, userScale, imgSize, fr));
    }
    // "free" keeps whatever size the frame currently is - the handles below
    // just become draggable from here, no implicit resize on switching.
  }

  // Free-form corner handle - drags the frame's bottom-right corner;
  // top-left stays anchored so the crop window never jumps around under
  // the user's finger.
  const freeDragStart = useRef({ w: 0, h: 0 });
  const freeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { freeDragStart.current = { w: frame.w, h: frame.h }; },
      onPanResponderMove: (_evt, g) => {
        const w = clamp(freeDragStart.current.w + g.dx, MIN_FRAME, VIEWPORT_W);
        const h = clamp(freeDragStart.current.h + g.dy, MIN_FRAME, VIEWPORT_H);
        setFrame({ w, h });
        if (imgSize) setTranslate((t) => clampTranslate(t, userScale, imgSize, { w, h }));
      },
    })
  ).current;

  function save() {
    if (!imgSize || !ImageManipulator) { onSave(workingUri.replace(/^data:image\/\w+;base64,/, "")); return; }
    const abs = coverScale(imgSize, frame) * userScale;
    // Visible window, in the image's OWN (unrotated-by-anything-further)
    // pixel space - see this file's header comment for why no rotation
    // term is needed here (straighten/rotate-90/flip are already baked
    // into workingUri by the time Save runs).
    const originX = clamp((imgSize.w * abs - frame.w) / 2 / abs - translate.x / abs, 0, Math.max(0, imgSize.w - frame.w / abs));
    const originY = clamp((imgSize.h * abs - frame.h) / 2 / abs - translate.y / abs, 0, Math.max(0, imgSize.h - frame.h / abs));
    const width = clamp(frame.w / abs, 1, imgSize.w - originX);
    const height = clamp(frame.h / abs, 1, imgSize.h - originY);
    setBusy(true);
    ImageManipulator.manipulateAsync(
      workingUri,
      [{ crop: { originX: Math.round(originX), originY: Math.round(originY), width: Math.round(width), height: Math.round(height) } }],
      { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
    )
      .then((out) => { setBusy(false); onSave(out.base64 || workingUri.replace(/^data:image\/\w+;base64,/, "")); })
      .catch(() => { setBusy(false); onSave(workingUri.replace(/^data:image\/\w+;base64,/, "")); });
  }

  if (!visible) return null;

  const abs = imgSize ? coverScale(imgSize, frame) * userScale : 1;
  const displayW = imgSize ? imgSize.w * abs : frame.w;
  const displayH = imgSize ? imgSize.h * abs : frame.h;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
      <View style={st.root}>
        <View style={st.topBar}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={st.topBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={st.topTitle}>Edit Photo</Text>
          <TouchableOpacity onPress={save} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[st.topBtnText, st.topBtnPrimary]}>{busy ? "…" : "Done"}</Text>
          </TouchableOpacity>
        </View>

        <View style={st.viewport}>
          <View
            style={[st.frame, { width: frame.w, height: frame.h }]}
            {...responder.panHandlers}
          >
            <Image
              source={{ uri: workingUri }}
              onLoad={(e) => {
                if (!imgSize) autoFit({ w: e.nativeEvent.source.width, h: e.nativeEvent.source.height }, frame);
              }}
              style={{
                position: "absolute",
                width: displayW,
                height: displayH,
                left: frame.w / 2 - displayW / 2 + translate.x,
                top: frame.h / 2 - displayH / 2 + translate.y,
                transform: straighten ? [{ rotate: `${straighten}deg` }] : undefined,
              }}
              resizeMode="cover"
            />
          </View>
          {/* Free-form resize handle - bottom-right corner only (top-left is
              the fixed anchor), hidden in fixed-9:16 mode. */}
          {cropMode === "free" && (
            <View
              style={[st.handle, { left: frame.w - 14, top: frame.h - 14 }]}
              {...freeResponder.panHandlers}
            >
              <View style={st.handleDot} />
            </View>
          )}
          {busy && (
            <View style={st.busyOverlay}>
              <ActivityIndicator color={C.green} size="large" />
            </View>
          )}
        </View>

        <View style={st.controls}>
          <View style={st.modeRow}>
            <TouchableOpacity style={[st.modeBtn, cropMode === "fixed916" && st.modeBtnActive]} onPress={() => setMode("fixed916")}>
              <Text style={[st.modeBtnText, cropMode === "fixed916" && st.modeBtnTextActive]}>9:16</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.modeBtn, cropMode === "free" && st.modeBtnActive]} onPress={() => setMode("free")}>
              <Text style={[st.modeBtnText, cropMode === "free" && st.modeBtnTextActive]}>Free</Text>
            </TouchableOpacity>
          </View>

          <View style={st.straightenRow}>
            <Text style={st.straightenLabel}>Straighten</Text>
            <View style={st.straightenTrack} {...straightenResponder.panHandlers}>
              <View style={st.straightenTick} />
              <View style={[st.straightenThumb, { left: ((straighten + STRAIGHTEN_RANGE) / (STRAIGHTEN_RANGE * 2)) * straightenTrackW - 10 }]} />
            </View>
            <Text style={st.straightenValue}>{straighten > 0 ? "+" : ""}{straighten.toFixed(0)}°</Text>
          </View>

          <View style={st.toolRow}>
            <TouchableOpacity style={st.toolBtn} onPress={rotate90} disabled={busy}>
              <Text style={st.toolBtnText}>↻ Rotate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.toolBtn} onPress={flip} disabled={busy}>
              <Text style={st.toolBtnText}>⇄ Flip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.toolBtn} onPress={reset} disabled={busy}>
              <Text style={st.toolBtnText}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 20, paddingBottom: 14 },
  topBtnText: { color: C.text3, fontSize: 15, fontWeight: "700" },
  topBtnPrimary: { color: C.green, fontWeight: "900" },
  topTitle: { color: C.text1, fontSize: 15, fontWeight: "800" },
  viewport: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { overflow: "hidden", backgroundColor: "#000", borderRadius: 4, borderWidth: 1, borderColor: C.border },
  handle: { position: "absolute", width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  handleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.green, borderWidth: 2, borderColor: "#fff" },
  busyOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  controls: { paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10, gap: 16 },
  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  modeBtnActive: { borderColor: C.green, backgroundColor: C.greenBg },
  modeBtnText: { color: C.text3, fontSize: 13, fontWeight: "700" },
  modeBtnTextActive: { color: C.green },
  straightenRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  straightenLabel: { color: C.text3, fontSize: 12, fontWeight: "700", width: 72 },
  straightenTrack: { flex: 1, height: 28, justifyContent: "center" },
  straightenTick: { height: 2, backgroundColor: C.border, borderRadius: 1 },
  straightenThumb: { position: "absolute", top: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: C.green },
  straightenValue: { color: C.text3, fontSize: 12, fontWeight: "700", width: 40, textAlign: "right" },
  toolRow: { flexDirection: "row", gap: 10 },
  toolBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  toolBtnText: { color: C.text1, fontSize: 13, fontWeight: "700" },
});
