// ShareStudio.tsx — the single post-scan/post-sale share screen. The card
// image is now rendered SERVER-SIDE (POST /api/share-card returns a
// finished PNG for the chosen format/variant) - this component's only job
// is to build the right payload, show the big preview it gets back, and
// let the user tweak format/hook/handle/hide-price (each change re-requests
// the PNG, debounced). There is no on-device drawing, crop, or theme
// picker anymore - see lib/shareCardPayload.ts (pure payload builder) and
// lib/shareCardApi.ts (the fetch + cache-file write).
//
// ONE screen for BOTH variants: a fresh/re-shared scan ("scan") and a
// logged sale ("win", only ever opened when profit > 0 - see
// shareCardPayload.ts's canShareWin and LogSaleModal.tsx).
//
// LAYOUT v3 (2026-11-19, founder screenshot fixes): the old layout was a
// single tall ScrollView of stacked rows - "Pass or buy?" cut off, the
// "Auto" swatch label truncated to "Aut", the whole controls area read as a
// tiny scrolling window on anything shorter than an iPhone 14. Replaced with
// a fully DETERMINISTIC layout that never scrolls vertically: header / format
// segmented control / flexible preview (min 38% of screen) / a 4-tab strip
// (Hook, Photo, Color, More) / ONE fixed-height content row for whichever
// tab is selected (horizontal scroll only, so however many chips/swatches
// exist never add vertical height) / a pinned footer (Copy caption link,
// then Share + Make video side by side). Hook/photo-mode/color/handle/
// hide-price state lives in lib/shareStudioControls.ts's pure setters so
// "switching format or tabs never resets another control" is unit-testable
// independent of this component tree.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing,
  Dimensions, TextInput, ScrollView, ActivityIndicator, Keyboard, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { C } from "../lib/theme";
import {
  FORMAT_SIZES, FORMAT_LABELS, StudioFormat, StudioConfidence, formatFileSize,
  HOOK_PRESETS, DEFAULT_HOOK, WIN_PROFIT_HOOK,
  PhotoMode, DEFAULT_PHOTO_ADJUST, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, FOCUS_STEP,
  ACCENT_SWATCHES, isValidAccentHex,
} from "../lib/shareStudio";
import {
  StudioTab, StudioControlsState, initialStudioControls,
  setFormat as csSetFormat, setActiveTab as csSetActiveTab, setHook as csSetHook,
  toggleHandleEnabled as csToggleHandleEnabled, setHandle as csSetHandle,
  setHidePrice as csSetHidePrice, setPhotoMode as csSetPhotoMode,
  nudgeZoom as csNudgeZoom, nudgeFocus as csNudgeFocus, resetPhotoAdjust as csResetPhotoAdjust,
  setAccent as csSetAccent,
} from "../lib/shareStudioControls";
import { buildShareCardPayload, buildShareVideoPayload, ShareCardTone } from "../lib/shareCardPayload";
import { resolveSharePhoto, fetchShareCardPng } from "../lib/shareCardApi";
import { fetchShareVideoMp4 } from "../lib/shareVideoApi";
import { loadStudioPrefs, saveStudioPrefs, StudioPrefs } from "../lib/studioPrefs";
import { logEvent } from "../lib/api";
import { HeroVerdict } from "../lib/outcomeTier";

// OTA-SAFE IMPORTS: Sharing resolves its native module at module scope via
// a guarded require (not a static import), same convention the rest of
// this app's share code uses, so a missing module can't crash app launch.
let Sharing: typeof import("expo-sharing") | null = null;
try { Sharing = require("expo-sharing"); } catch { Sharing = null; }

const { height: SCREEN_H } = Dimensions.get("window");
// Preview is a FLEXIBLE box (flex:1, contain) with a floor of 38% of screen
// height - it grows to fill whatever room the fixed-height rows below it
// don't need, but never shrinks past this, on any screen.
const PREVIEW_MIN_H = SCREEN_H * 0.38;
const PREVIEW_PAD_H = 16;
// The ONE fixed-height content row every tab's controls render into -
// however many chips/swatches/buttons a tab has, they scroll horizontally
// inside this row rather than ever adding vertical height.
const TAB_CONTENT_H = 68;
// Controls are capped at 1.3x system font scale (not the full accessibility
// range) so a maxed-out system font still fits this row's fixed height
// without truncating or forcing a second line.
const CONTROL_FONT_SCALE = 1.3;

// scale:0.5 for every live-preview request (debounced on each control
// change) - fast enough to feel instant. The actual Share tap always
// re-requests at scale:1, even if the on-screen preview already matches
// the current controls (it's still the half-size render) - see share().
const PREVIEW_SCALE = 0.5;
const FINAL_SCALE = 1;

const CUSTOM_HOOK_MAX = 40;
const CAPTION_TAGLINE = "Search ValuIQ — free resale scanner · iOS + Android";

const TABS: { key: StudioTab; label: string }[] = [
  { key: "hook", label: "Hook" },
  { key: "photo", label: "Photo" },
  { key: "color", label: "Color" },
  { key: "more", label: "More" },
];

export interface ShareStudioWinData {
  boughtPrice: number;
  soldPrice: number;
  profit: number;
}

export interface ShareStudioProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  scanId: string | null;
  itemName: string;
  photoBase64: string | null;
  // Alternative to photoBase64 for a caller that only has a URI on hand
  // (e.g. History re-sharing an already-saved row, which stores a data:
  // URI in image_url, not a raw base64 string).
  photoUri?: string | null;
  // Scan-variant inputs (ignored when winData is set).
  paidPrice?: number | null;
  sellPrice?: number | null;
  profitConfidence?: StudioConfidence;
  heroVerdict?: HeroVerdict;
  // History's re-share of a not-yet-sold row only has the coarser decision
  // enum, never a real HeroVerdict - it passes a pre-resolved tone here
  // instead of heroVerdict.
  toneOverride?: ShareCardTone;
  displayName?: string | null;
  isOwner?: boolean;
  // Win-variant input. Presence alone selects the Win variant.
  winData?: ShareStudioWinData | null;
}

interface FetchError {
  status?: number;
  stage?: string;
  ms: number;
  bodyPreview?: string;
  message: string;
}

type VideoState = "idle" | "making" | "failed";

// Thin pulsing bar across the top of the preview while a render is in
// flight - a lighter-weight loading signal than the centered spinner alone,
// visible even once a previous preview is already showing (dimmed) behind it.
function PreviewShimmer() {
  const pulse = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[st.previewShimmer, { opacity: pulse }]} />;
}

export default function ShareStudio(props: ShareStudioProps) {
  const {
    visible, onClose, token, scanId, itemName, photoBase64, photoUri,
    paidPrice, sellPrice, profitConfidence, heroVerdict, toneOverride,
    displayName, isOwner, winData,
  } = props;
  const isWin = !!winData;

  const [controls, setControls] = useState<StudioControlsState>(() => initialStudioControls({
    hook: isWin ? (winData && winData.profit > 0 ? WIN_PROFIT_HOOK : null) : DEFAULT_HOOK,
    handleEnabled: false, handle: "", photoMode: DEFAULT_PHOTO_ADJUST.mode, accent: null,
  }));
  const {
    format, activeTab, hook, handleEnabled, handle, hidePrice, photoMode, zoom, fx, fy, accent,
  } = controls;

  // Ephemeral inline-editor UI state only - not part of the persisted/
  // testable controls state above.
  const [customHookOpen, setCustomHookOpen] = useState(false);
  const [customHookText, setCustomHookText] = useState("");
  const [handleEditOpen, setHandleEditOpen] = useState(false);
  const [hexOpen, setHexOpen] = useState(false);
  const [hexText, setHexText] = useState("");
  const [hexError, setHexError] = useState(false);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [renderStatus, setRenderStatus] = useState<"idle" | "ok" | "failed">("idle");
  const [fetchError, setFetchError] = useState<FetchError | null>(null);
  const [debugBytes, setDebugBytes] = useState<number | null>(null);

  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [videoState, setVideoState] = useState<VideoState>("idle");
  const [videoError, setVideoError] = useState<FetchError | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const openedLoggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // First paint (the synchronous reset below) lands before any saved
    // prefs can possibly resolve, so there's never a gap showing stale
    // controls from whatever scan the Studio last had open.
    setControls(initialStudioControls({
      hook: isWin ? (winData && winData.profit > 0 ? WIN_PROFIT_HOOK : null) : DEFAULT_HOOK,
      handleEnabled: false, handle: "", photoMode: DEFAULT_PHOTO_ADJUST.mode, accent: null,
    }));
    loadStudioPrefs(displayName).then((p) => {
      setControls((prev) => ({
        ...prev,
        handleEnabled: p.handleEnabled,
        handle: p.handle,
        // Win variant's hook default is driven by the sale's profit sign
        // (set synchronously above), never by the generic persisted
        // preference - a sale-outcome card's default pitch is a different
        // decision than a fresh-scan share's.
        hook: isWin ? prev.hook : p.hook,
        photoMode: p.photoMode ?? DEFAULT_PHOTO_ADJUST.mode,
        accent: p.accent ?? null,
      }));
    });
    setCustomHookOpen(false);
    setCustomHookText("");
    setHandleEditOpen(false);
    setHexOpen(false);
    setHexText("");
    setHexError(false);
    setPreviewUri(null);
    setFetchError(null);
    setShareStatus(null);
    setRenderStatus("idle");
    setRenderMs(null);
    setVideoState("idle");
    setVideoError(null);
    // First paint shows a spinner on a dark box immediately - the debounced
    // fetch below doesn't fire for another 350ms, but there's never a gap
    // where this screen shows nothing at all.
    setLoading(true);
    const openKey = `${scanId ?? "none"}:${Date.now()}`;
    if (openedLoggedFor.current !== openKey) {
      openedLoggedFor.current = openKey;
      logEvent(token, "share_studio_opened", { scanId, isWin }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function persistPrefs(next: Partial<StudioPrefs>) {
    const merged = { handleEnabled, handle, hook, photoMode, accent, ...next };
    saveStudioPrefs(merged);
  }

  // Returns the resulting local file uri on success (null on failure/
  // supersession) so share() below can grab the fresh scale:1 render
  // directly, without relying on previewUri state (which may still be
  // showing the stale scale:0.5 image when this resolves).
  async function runFetch(opts?: { scale?: number }): Promise<string | null> {
    const requestedScale = opts?.scale ?? PREVIEW_SCALE;
    const seq = ++requestSeqRef.current;
    if (abortRef.current) abortRef.current.abort();
    setLoading(true);
    setFetchError(null);

    // Downscale happens here too (expo-image-manipulator, async) - a stale
    // request can still be superseded while this is in flight, same as the
    // network fetch below.
    const resolved = await resolveSharePhoto(photoBase64, photoUri ?? null);
    if (seq !== requestSeqRef.current) return null; // superseded while resolving the photo

    if ("error" in resolved) {
      setLoading(false);
      setRenderStatus("failed");
      setFetchError({ ms: 0, message: resolved.error });
      return null;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const effectiveHandle = handleEnabled ? handle : null;
    const photoAdjust = { mode: photoMode, zoom, fx, fy };
    const base = isWin
      ? buildShareCardPayload({
          variant: "win", format, itemName,
          boughtPrice: winData!.boughtPrice, soldPrice: winData!.soldPrice, profit: winData!.profit,
          hook, handle: effectiveHandle, hidePrice, accent, photoAdjust,
        })
      : buildShareCardPayload({
          variant: "scan", format, itemName,
          paidPrice: paidPrice ?? null, heroSellPrice: sellPrice ?? null,
          verdict: heroVerdict ?? null, toneOverride,
          isEstimate: profitConfidence === "estimate",
          hook, handle: effectiveHandle, hidePrice, accent, photoAdjust,
        });

    const result = await fetchShareCardPng({ ...base, photo: resolved.photo, scale: requestedScale }, token, controller.signal);
    if (seq !== requestSeqRef.current) return null; // superseded by a newer request
    setLoading(false);
    setRenderMs(result.ms);
    if (result.ok && result.uri) {
      setRenderStatus("ok");
      setPreviewUri(result.uri);
      setFetchError(null);
      if (isOwner) setDebugBytes(result.size ?? null);
      return result.uri;
    } else if (result.stage !== "aborted") {
      setRenderStatus("failed");
      setFetchError({
        status: result.status, stage: result.stage, ms: result.ms,
        bodyPreview: result.bodyPreview, message: "Couldn't load the preview.",
      });
    }
    return null;
  }

  // Debounced re-request on every control change - cancels any in-flight
  // request (runFetch itself aborts the previous one) and keeps showing the
  // last successful preview, dimmed, until the new one lands. Always the
  // fast scale:0.5 preview - see share() for the scale:1 final render.
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runFetch(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, format, hook, handleEnabled, handle, hidePrice, photoMode, zoom, fx, fy, accent]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  function openPreset(h: string) {
    setControls((prev) => {
      const next = prev.hook === h ? null : h;
      persistPrefs({ hook: next });
      return csSetHook(prev, next);
    });
    setCustomHookOpen(false);
  }

  function commitCustomHook() {
    const t = customHookText.trim();
    const next = t ? t : null;
    setControls((prev) => csSetHook(prev, next));
    setCustomHookOpen(false);
    persistPrefs({ hook: next });
    Keyboard.dismiss();
  }

  function commitHandle() {
    setHandleEditOpen(false);
    persistPrefs({ handle });
    Keyboard.dismiss();
  }

  function toggleHandleEnabled(next: boolean) {
    setControls((prev) => csToggleHandleEnabled(prev, next));
    persistPrefs({ handleEnabled: next });
  }

  function choosePhotoMode(mode: PhotoMode) {
    setControls((prev) => csSetPhotoMode(prev, mode));
    persistPrefs({ photoMode: mode });
  }

  function nudgeZoom(delta: number) {
    setControls((prev) => csNudgeZoom(prev, delta));
  }

  function nudgeFocus(dx: number, dy: number) {
    setControls((prev) => csNudgeFocus(prev, dx, dy));
  }

  function resetPhotoAdjust() {
    setControls((prev) => csResetPhotoAdjust(prev));
  }

  function chooseAccent(hexVal: string | null) {
    setControls((prev) => csSetAccent(prev, hexVal));
    setHexOpen(false);
    setHexError(false);
    persistPrefs({ accent: hexVal });
  }

  function openHexEditor() {
    setHexText(accent ?? "");
    setHexError(false);
    setHexOpen(true);
  }

  function commitHex() {
    let v = hexText.trim();
    if (v && !v.startsWith("#")) v = `#${v}`;
    if (isValidAccentHex(v)) {
      chooseAccent(v.toLowerCase());
    } else {
      setHexError(true);
    }
    Keyboard.dismiss();
  }

  async function copyCaption() {
    const text = hook ? `${hook}\n\n${CAPTION_TAGLINE}` : CAPTION_TAGLINE;
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  async function share() {
    if (sharing || !previewUri) return;
    setSharing(true);
    setShareStatus(null);
    try {
      // Always fetch a fresh scale:1 render for the actual share, even if
      // the on-screen preview already reflects every current control - that
      // preview is still the fast scale:0.5 one, never sharp enough to hand
      // off as the real exported image. Button shows "Preparing…" for this.
      const finalUri = await runFetch({ scale: FINAL_SCALE });
      if (!finalUri) {
        setShareStatus({ kind: "fail", text: "Couldn't prepare the image to share." });
        return;
      }
      const available = Sharing ? await Sharing.isAvailableAsync() : false;
      if (!available || !Sharing) {
        setShareStatus({ kind: "fail", text: "Sharing isn't available on this device." });
        return;
      }
      await Sharing.shareAsync(finalUri, { mimeType: "image/png", dialogTitle: "Share your ValuIQ find" });
      setShareStatus({ kind: "ok", text: "Opened the share sheet — use \"Save Image\" there to save it." });
      logEvent(token, "share_studio_shared", { scanId, format, isWin }).catch(() => {});
    } catch {
      setShareStatus({ kind: "fail", text: "Couldn't open the share sheet. Try again." });
    } finally {
      setSharing(false);
    }
  }

  // MAKE VIDEO (Story only) - same payload shape as the image call (format
  // forced to "story" by buildShareVideoPayload regardless of the format
  // tab currently selected), downloaded via the SDK 54 File class and
  // handed to expo-sharing as an MP4. Independent of the image preview's
  // loading/error state - a failed video attempt never disturbs the image
  // preview already on screen.
  async function makeVideo() {
    if (videoState === "making" || format !== "story") return;
    setVideoState("making");
    setVideoError(null);
    try {
      const resolved = await resolveSharePhoto(photoBase64, photoUri ?? null);
      if ("error" in resolved) {
        setVideoState("failed");
        setVideoError({ ms: 0, message: resolved.error });
        return;
      }
      const effectiveHandle = handleEnabled ? handle : null;
      const photoAdjust = { mode: photoMode, zoom, fx, fy };
      const base = isWin
        ? buildShareVideoPayload({
            variant: "win", format, itemName,
            boughtPrice: winData!.boughtPrice, soldPrice: winData!.soldPrice, profit: winData!.profit,
            hook, handle: effectiveHandle, hidePrice, accent, photoAdjust,
          })
        : buildShareVideoPayload({
            variant: "scan", format, itemName,
            paidPrice: paidPrice ?? null, heroSellPrice: sellPrice ?? null,
            verdict: heroVerdict ?? null, toneOverride,
            isEstimate: profitConfidence === "estimate",
            hook, handle: effectiveHandle, hidePrice, accent, photoAdjust,
          });
      const controller = new AbortController();
      const result = await fetchShareVideoMp4({ ...base, photo: resolved.photo }, token, controller.signal);
      if (result.ok && result.uri) {
        const available = Sharing ? await Sharing.isAvailableAsync() : false;
        if (!available || !Sharing) {
          setVideoState("failed");
          setVideoError({ ms: result.ms, message: "Sharing isn't available on this device." });
          return;
        }
        await Sharing.shareAsync(result.uri, {
          mimeType: "video/mp4", UTI: "public.mpeg-4", dialogTitle: "Share your ValuIQ video",
        });
        logEvent(token, "share_studio_shared", { scanId, format: "story", isWin, kind: "video" }).catch(() => {});
        setVideoState("idle");
      } else {
        setVideoState("failed");
        setVideoError({
          status: result.status, stage: result.stage, ms: result.ms,
          bodyPreview: result.bodyPreview, message: "Couldn't make the video.",
        });
      }
    } catch {
      setVideoState("failed");
      setVideoError({ ms: 0, message: "Couldn't make the video." });
    }
  }

  const aspect = useMemo(() => {
    const { w, h } = FORMAT_SIZES[format];
    return w / h;
  }, [format]);

  if (!visible) return null;

  const isCustomHookActive = hook != null && !HOOK_PRESETS.includes(hook);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={st.root}>
        <View style={st.topBar}>
          {/* "Close" must never wrap ("Clo/se") - fixed-width hit area,
              single line, and a capped font-scale multiplier so an
              accessibility-large system font still fits on one line. The
              title shrinks instead, via adjustsFontSizeToFit. */}
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.closeHit}>
            <Text style={st.closeText} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.2}>Close</Text>
          </TouchableOpacity>
          <Text style={st.topTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Share Studio</Text>
          <View style={st.closeHit} />
        </View>

        {/* ROW — format segmented control. */}
        <View style={st.segmentRow}>
          {(["story", "feed", "square"] as StudioFormat[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[st.segment, format === f && st.segmentActive]}
              onPress={() => setControls((prev) => csSetFormat(prev, f))}
            >
              <Text style={[st.segmentText, format === f && st.segmentTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>
                {FORMAT_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* PREVIEW — flex:1, contain, floor of 38% of screen height. */}
        <View style={st.previewArea}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              resizeMode="contain"
              style={[st.previewImg, loading && st.previewImgDimmed]}
            />
          ) : (
            <View style={st.previewPlaceholder} />
          )}
          {loading ? (
            <>
              <PreviewShimmer />
              <ActivityIndicator style={st.previewSpinner} color={C.green} size="large" />
            </>
          ) : null}
          {fetchError ? (
            <View style={st.errorBox}>
              <Text style={st.errorTitle}>Couldn't load the preview</Text>
              <Text style={st.errorDetail}>
                {fetchError.status ? `HTTP ${fetchError.status}` : "network error"} · {fetchError.stage || "—"} · {fetchError.ms}ms
              </Text>
              {fetchError.bodyPreview ? (
                <Text style={st.errorBody} numberOfLines={3}>{fetchError.bodyPreview}</Text>
              ) : null}
              <TouchableOpacity style={st.retryBtn} onPress={() => runFetch()}>
                <Text style={st.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {isOwner ? (
          <Text style={st.renderReadout}>
            render {renderMs ?? "—"} ms · {renderStatus}
            {debugBytes != null ? ` · export ${FORMAT_SIZES[format].w}×${FORMAT_SIZES[format].h} · ${formatFileSize(debugBytes)}` : ""}
          </Text>
        ) : null}

        {/* TAB STRIP — Hook / Photo / Color / More. */}
        <View style={st.tabStrip}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[st.tabBtn, activeTab === t.key && st.tabBtnActive]}
              onPress={() => setControls((prev) => csSetActiveTab(prev, t.key))}
            >
              <Text style={[st.tabBtnText, activeTab === t.key && st.tabBtnTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ONE fixed-height content row for whichever tab is selected -
            horizontal scroll only, so however many chips/swatches/buttons a
            tab has, the screen's overall layout never changes height. */}
        <View style={st.tabContent}>
          {activeTab === "hook" ? (
            customHookOpen ? (
              <View style={st.inlineInputRow}>
                <TextInput
                  style={st.inlineInput}
                  value={customHookText}
                  onChangeText={(t) => setCustomHookText(t.slice(0, CUSTOM_HOOK_MAX))}
                  placeholder="Your own hook…"
                  placeholderTextColor={C.text4}
                  autoFocus
                  maxLength={CUSTOM_HOOK_MAX}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={commitCustomHook}
                  maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                />
                <TouchableOpacity onPress={commitCustomHook} style={st.inlineInputDone}>
                  <Text style={st.inlineInputDoneText} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.rowScrollContent}>
                {HOOK_PRESETS.map((h) => {
                  const selected = hook === h;
                  return (
                    <TouchableOpacity key={h} style={[st.chip, selected && st.chipActive]} onPress={() => openPreset(h)}>
                      <Text style={[st.chipText, selected && st.chipTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>{h}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[st.chip, hook == null && st.chipActive]}
                  onPress={() => { setControls((prev) => csSetHook(prev, null)); setCustomHookOpen(false); persistPrefs({ hook: null }); }}
                >
                  <Text style={[st.chipText, hook == null && st.chipTextActive]} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>None</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.chip, isCustomHookActive && st.chipActive]}
                  onPress={() => { setCustomHookText(isCustomHookActive ? (hook as string) : ""); setCustomHookOpen(true); }}
                >
                  <Text style={[st.chipText, isCustomHookActive && st.chipTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>
                    {isCustomHookActive ? hook : "Custom…"}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )
          ) : null}

          {activeTab === "photo" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.rowScrollContent}>
              {(["whole", "fill"] as PhotoMode[]).map((m) => (
                <TouchableOpacity key={m} style={[st.chip, photoMode === m && st.chipActive]} onPress={() => choosePhotoMode(m)}>
                  <Text style={[st.chipText, photoMode === m && st.chipTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>
                    {m === "whole" ? "Whole" : "Fill"}
                  </Text>
                </TouchableOpacity>
              ))}
              {photoMode === "fill" ? (
                <>
                  <View style={st.adjustGroup}>
                    <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
                      <Text style={st.adjustBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={st.zoomValue} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>{zoom.toFixed(2)}x</Text>
                    <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
                      <Text style={st.adjustBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={st.adjustGroup}>
                    <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeFocus(-FOCUS_STEP, 0)}>
                      <Text style={st.adjustBtnText}>←</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeFocus(0, -FOCUS_STEP)}>
                      <Text style={st.adjustBtnText}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeFocus(0, FOCUS_STEP)}>
                      <Text style={st.adjustBtnText}>↓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeFocus(FOCUS_STEP, 0)}>
                      <Text style={st.adjustBtnText}>→</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={st.resetBtn} onPress={resetPhotoAdjust}>
                    <Text style={st.resetBtnText} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Reset</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </ScrollView>
          ) : null}

          {activeTab === "color" ? (
            hexOpen ? (
              <View style={st.inlineInputRow}>
                <TextInput
                  style={st.inlineInput}
                  value={hexText}
                  onChangeText={(t) => { setHexText(t.slice(0, 7)); setHexError(false); }}
                  placeholder="#a3e635"
                  placeholderTextColor={C.text4}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={7}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={commitHex}
                  maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                />
                <TouchableOpacity onPress={commitHex} style={st.inlineInputDone}>
                  <Text style={st.inlineInputDoneText} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.rowScrollContent}>
                <TouchableOpacity
                  style={[st.autoPill, accent == null && st.swatchSelected]}
                  onPress={() => chooseAccent(null)}
                >
                  <Text style={st.autoPillText} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Auto</Text>
                </TouchableOpacity>
                {ACCENT_SWATCHES.map((sw) => (
                  <TouchableOpacity
                    key={sw.id}
                    style={[st.swatch, { backgroundColor: sw.hex }, accent === sw.hex && st.swatchSelected]}
                    onPress={() => chooseAccent(sw.hex)}
                    accessibilityLabel={sw.label}
                  />
                ))}
                <TouchableOpacity
                  style={[
                    st.swatch,
                    { backgroundColor: accent != null && !ACCENT_SWATCHES.some((sw) => sw.hex === accent) ? accent : C.surfaceHigh },
                    accent != null && !ACCENT_SWATCHES.some((sw) => sw.hex === accent) && st.swatchSelected,
                  ]}
                  onPress={openHexEditor}
                >
                  <Text style={st.swatchAutoText}>#</Text>
                </TouchableOpacity>
              </ScrollView>
            )
          ) : null}

          {activeTab === "more" ? (
            handleEditOpen ? (
              <View style={st.inlineInputRow}>
                <TextInput
                  style={st.inlineInput}
                  value={handle}
                  onChangeText={(t) => setControls((prev) => csSetHandle(prev, t))}
                  placeholder="@yourname"
                  placeholderTextColor={C.text4}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={commitHandle}
                  maxFontSizeMultiplier={CONTROL_FONT_SCALE}
                />
                <TouchableOpacity onPress={commitHandle} style={st.inlineInputDone}>
                  <Text style={st.inlineInputDoneText} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.rowScrollContent}>
                <TouchableOpacity style={[st.chip, handleEnabled && st.chipActive]} onPress={() => toggleHandleEnabled(!handleEnabled)}>
                  <Text style={[st.chipText, handleEnabled && st.chipTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Handle</Text>
                </TouchableOpacity>
                {handleEnabled ? (
                  <TouchableOpacity style={st.handlePill} onPress={() => setHandleEditOpen(true)}>
                    <Text style={st.handlePillText} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>{handle || "+ Add your @handle"}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[st.chip, hidePrice && st.chipActive]}
                  onPress={() => setControls((prev) => csSetHidePrice(prev, !prev.hidePrice))}
                >
                  <Text style={[st.chipText, hidePrice && st.chipTextActive]} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Hide price</Text>
                </TouchableOpacity>
              </ScrollView>
            )
          ) : null}
          {hexError ? <Text style={st.hexErrorText}>Enter a 6-digit hex color, like #A3E635.</Text> : null}
        </View>

        {/* Pinned footer, OUTSIDE any scroll view - Copy caption link, then
            Share + Make video side by side, always visible above the home
            indicator regardless of which tab/content is showing above. */}
        <View style={st.footer}>
          {shareStatus ? (
            <Text style={[st.statusText, shareStatus.kind === "fail" && st.statusTextFail]} numberOfLines={2}>{shareStatus.text}</Text>
          ) : null}
          {videoError ? (
            <View style={st.videoErrorBox}>
              <Text style={st.errorTitle} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>{videoError.message}</Text>
              <Text style={st.errorDetail} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>
                {videoError.status ? `HTTP ${videoError.status}` : "network error"} · {videoError.stage || "—"} · {videoError.ms}ms
              </Text>
            </View>
          ) : null}
          <TouchableOpacity style={st.copyBtn} onPress={copyCaption}>
            <Text style={st.copyBtnText} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>{copied ? "Copied!" : "Copy caption"}</Text>
          </TouchableOpacity>
          <View style={st.footerBtnRow}>
            <TouchableOpacity
              style={[st.shareBtn, (!previewUri || sharing) && st.shareBtnDisabled]}
              onPress={share}
              disabled={!previewUri || sharing}
              activeOpacity={0.85}
            >
              {sharing ? (
                <View style={st.shareBtnPreparing}>
                  <ActivityIndicator color={C.greenDark} />
                  <Text style={st.shareBtnText} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Preparing…</Text>
                </View>
              ) : <Text style={st.shareBtnText} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Share</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.videoBtn, (format !== "story" || videoState === "making") && st.videoBtnDisabled]}
              onPress={makeVideo}
              disabled={format !== "story" || videoState === "making"}
              activeOpacity={0.85}
            >
              {videoState === "making" ? (
                <View style={st.shareBtnPreparing}>
                  <ActivityIndicator color={C.green} />
                  <Text style={st.videoBtnText} numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Making your video… up to 20 s</Text>
                </View>
              ) : <Text style={st.videoBtnText} numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Make video</Text>}
            </TouchableOpacity>
          </View>
          {format !== "story" ? (
            <Text style={st.videoHint} maxFontSizeMultiplier={CONTROL_FONT_SCALE}>Video is Story only</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10 },
  // minWidth (not just width) + flexShrink:0 - "Close" must keep its own
  // box even under a squeeze from a long/scaled-up title next to it, so it
  // can never be forced into two lines.
  closeHit: { width: 56, minWidth: 56, flexShrink: 0 },
  closeText: { color: C.text3, fontSize: 15, fontWeight: "700", flexShrink: 0 },
  topTitle: { color: C.text1, fontSize: 15, fontWeight: "800", flexShrink: 1, flexGrow: 1, textAlign: "center" },

  segmentRow: { flexDirection: "row", gap: 8, width: "100%", paddingHorizontal: 16, paddingBottom: 10 },
  segment: { flex: 1, minHeight: 44, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  segmentActive: { borderColor: C.green, backgroundColor: C.greenBg },
  segmentText: { color: C.text3, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: C.green },

  // PREVIEW — flex:1 so it absorbs whatever room the fixed-height rows below
  // it don't need, floored at 38% of screen height so a short device never
  // squeezes it away to nothing.
  previewArea: { flex: 1, minHeight: PREVIEW_MIN_H, alignItems: "center", justifyContent: "center", paddingHorizontal: PREVIEW_PAD_H, position: "relative" },
  previewImg: { width: "100%", height: "100%", borderRadius: 12 },
  previewImgDimmed: { opacity: 0.45 },
  previewPlaceholder: { width: "100%", height: "100%", borderRadius: 12, backgroundColor: C.surfaceHigh },
  previewSpinner: { position: "absolute" },
  previewShimmer: { position: "absolute", top: 8, left: PREVIEW_PAD_H + 8, right: PREVIEW_PAD_H + 8, height: 3, borderRadius: 2, backgroundColor: C.green },
  errorBox: { position: "absolute", left: 16, right: 16, bottom: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.red + "50", borderRadius: 12, padding: 14 },
  errorTitle: { color: C.red, fontSize: 14, fontWeight: "800", marginBottom: 4 },
  errorDetail: { color: C.text3, fontSize: 11, fontFamily: "monospace" as any, marginBottom: 4 },
  errorBody: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginBottom: 10 },
  retryBtn: { alignSelf: "flex-start", backgroundColor: C.red + "20", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryBtnText: { color: C.red, fontSize: 13, fontWeight: "800" },
  // Owner-only debug readout - never shown to real users (was unconditional
  // before, a stray internal readout on every user's screen).
  renderReadout: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, textAlign: "center", paddingVertical: 4 },

  // TAB STRIP — four equal tabs, each >=44pt tall.
  tabStrip: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 16 },
  tabBtn: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: C.green },
  tabBtnText: { color: C.text3, fontSize: 13, fontWeight: "700" },
  tabBtnTextActive: { color: C.green, fontWeight: "900" },

  // ONE fixed-height content row (64-72pt) for whichever tab is active -
  // horizontal scroll only, so this never grows the screen's overall layout.
  tabContent: { height: TAB_CONTENT_H, paddingHorizontal: 16, justifyContent: "center" },
  rowScrollContent: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 },

  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: C.greenDark, fontWeight: "900" },

  inlineInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.green, borderRadius: 100, paddingLeft: 16, paddingRight: 8, minHeight: 44, height: 44 },
  inlineInput: { flex: 1, color: C.text1, fontSize: 14, fontWeight: "600", paddingVertical: Platform.OS === "ios" ? 10 : 6 },
  inlineInputDone: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  inlineInputDoneText: { color: C.green, fontSize: 13, fontWeight: "800" },
  hexErrorText: { color: C.red, fontSize: 11, fontWeight: "600", position: "absolute", bottom: -2, left: 16 },

  handlePill: { minHeight: 44, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  handlePillText: { color: C.text2, fontSize: 14, fontWeight: "700" },

  adjustGroup: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 100, paddingHorizontal: 6, minHeight: 44 },
  adjustBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  adjustBtnText: { color: C.text1, fontSize: 16, fontWeight: "800" },
  zoomValue: { color: C.text2, fontSize: 12, fontWeight: "700", minWidth: 48, textAlign: "center" },
  resetBtn: { paddingHorizontal: 14, minHeight: 44, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  resetBtnText: { color: C.text3, fontSize: 12, fontWeight: "700" },

  // COLOR — Auto is a wide pill so the full word "Auto" always fits (never
  // the old truncated-to-"Aut" circle); the 12 presets + hex stay 44pt
  // circles, >=44pt tap target.
  autoPill: { minHeight: 44, minWidth: 64, paddingHorizontal: 16, borderRadius: 100, backgroundColor: C.surfaceHigh, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.border },
  autoPillText: { color: C.text2, fontSize: 13, fontWeight: "800" },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.border },
  swatchSelected: { borderWidth: 2, borderColor: C.text1 },
  swatchAutoText: { color: C.text2, fontSize: 12, fontWeight: "800" },

  // Pinned footer - outside any scroll view, above the home indicator,
  // always visible regardless of which tab/content is showing above.
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 30 : 18, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  statusText: { color: C.text2, fontSize: 12, textAlign: "center", marginBottom: 8 },
  statusTextFail: { color: C.red },
  videoErrorBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.red + "50", borderRadius: 10, padding: 10, marginBottom: 8 },
  footerBtnRow: { flexDirection: "row", gap: 10 },
  shareBtn: { flex: 1, backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, minHeight: 50, alignItems: "center", justifyContent: "center" },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnPreparing: { flexDirection: "row", alignItems: "center", gap: 8 },
  shareBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  videoBtn: { flex: 1, backgroundColor: "transparent", borderWidth: 1.5, borderColor: C.green, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 6, minHeight: 50, alignItems: "center", justifyContent: "center" },
  videoBtnDisabled: { opacity: 0.4, borderColor: C.border },
  videoBtnText: { color: C.green, fontSize: 14, fontWeight: "900", textAlign: "center" },
  videoHint: { color: C.text4, fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 6 },
  copyBtn: { alignItems: "center", paddingVertical: 8, marginBottom: 2 },
  copyBtnText: { color: C.text3, fontSize: 13, fontWeight: "700" },
});
