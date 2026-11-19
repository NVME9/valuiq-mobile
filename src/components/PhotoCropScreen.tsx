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
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, PanResponder, Dimensions, ActivityIndicator } from "react-native";
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

export default function PhotoCropScreen({ photoUri, box, initial, isOwner, onCancel, onDone }: PhotoCropScreenProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!photoUri) { setLoadError(true); return; }
    let cancelled = false;
    setNatural(null);
    setLoadError(false);
    Image.getSize(
      photoUri,
      (w, h) => { if (!cancelled) setNatural({ w, h }); },
      () => { if (!cancelled) setLoadError(true); }
    );
    return () => { cancelled = true; };
  }, [photoUri]);

  // Largest same-aspect frame that fits the available screen area - same
  // "cover vs. contain" family of math photoCrop.ts's own functions use,
  // just picking a SCREEN box here instead of a crop region.
  const availW = SCREEN_W - FRAME_MARGIN * 2;
  const availH = SCREEN_H - HEADER_H - FOOTER_H - FRAME_MARGIN * 2;
  const boxAspect = box.w / box.h;
  const frameW = availW / availH > boxAspect ? availH * boxAspect : availW;
  const frameH = frameW / boxAspect;

  const aLeft = useRef(new Animated.Value(0)).current;
  const aTop = useRef(new Animated.Value(0)).current;
  const aWidth = useRef(new Animated.Value(1)).current;
  const aHeight = useRef(new Animated.Value(1)).current;

  const gestureRef = useRef<CropGestureState>(initCropGestureState(initial.fx, initial.fy, initial.zoom));
  const [debugState, setDebugState] = useState(gestureRef.current);
  const lastTapRef = useRef<{ t: number } | null>(null);

  function applyDisplay(fx: number, fy: number, zoom: number) {
    if (!natural) return;
    const r = cropDisplayRect(fx, fy, zoom, natural.w, natural.h, frameW, frameH);
    aLeft.setValue(r.left);
    aTop.setValue(r.top);
    aWidth.setValue(r.width);
    aHeight.setValue(r.height);
  }

  // Re-seed the gesture baseline (and paint the initial position) as soon
  // as the photo's real pixel size is known - frameW/frameH are stable for
  // this screen's whole lifetime (derived from Dimensions + the fixed box
  // aspect, never from live layout), so `natural` resolving is the only
  // thing this needs to wait on.
  useEffect(() => {
    if (!natural) return;
    gestureRef.current = initCropGestureState(initial.fx, initial.fy, initial.zoom);
    applyDisplay(initial.fx, initial.fy, initial.zoom);
    setDebugState(gestureRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

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
        if (!natural) return;
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
          <View style={[st.dimSide, { width: (availW - frameW) / 2 }]} />
          <View style={[st.frame, { width: frameW, height: frameH }]} {...responder.panHandlers}>
            {natural && photoUri ? (
              <Animated.Image
                source={{ uri: photoUri }}
                style={{ position: "absolute", left: aLeft, top: aTop, width: aWidth, height: aHeight }}
              />
            ) : (
              <View style={st.loadingBox}>
                {loadError ? (
                  <Text style={st.loadErrorText}>Couldn't load the photo.</Text>
                ) : (
                  <ActivityIndicator color={C.green} />
                )}
              </View>
            )}
          </View>
          <View style={[st.dimSide, { width: (availW - frameW) / 2 }]} />
        </View>
        <View style={[st.dim, { height: (SCREEN_H - HEADER_H - FOOTER_H - frameH) / 2 }]} />
      </View>

      {isOwner ? (
        <Text style={st.debugText} numberOfLines={2}>
          gesture: {debugState.phase} touches={debugState.touches} fx={debugState.fx.toFixed(2)} fy={debugState.fy.toFixed(2)} zoom={debugState.zoom.toFixed(2)}
        </Text>
      ) : null}

      <View style={st.footer}>
        <TouchableOpacity style={st.cancelBtn} onPress={onCancel}>
          <Text style={st.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.resetBtn} onPress={handleReset}>
          <Text style={st.resetBtnText}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.doneBtn} onPress={handleDone} disabled={!natural}>
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
  frame: { overflow: "hidden", backgroundColor: "#111" },
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
