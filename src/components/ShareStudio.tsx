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
  PhotoMode, DEFAULT_PHOTO_ADJUST, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, FOCUS_STEP, clampZoom, clampFocus,
  ACCENT_SWATCHES, isValidAccentHex,
} from "../lib/shareStudio";
import { buildShareCardPayload, ShareCardTone } from "../lib/shareCardPayload";
import { resolveSharePhoto, fetchShareCardPng } from "../lib/shareCardApi";
import { loadStudioPrefs, saveStudioPrefs, StudioPrefs } from "../lib/studioPrefs";
import { logEvent } from "../lib/api";
import { HeroVerdict } from "../lib/outcomeTier";

// OTA-SAFE IMPORTS: Sharing resolves its native module at module scope via
// a guarded require (not a static import), same convention the rest of
// this app's share code uses, so a missing module can't crash app launch.
let Sharing: typeof import("expo-sharing") | null = null;
try { Sharing = require("expo-sharing"); } catch { Sharing = null; }

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Preview is capped at ~40% of screen height (contain, never cropped) so the
// compact control rows below it always fit an iPhone-13-size screen without
// needing their own scroll - see this file's "controls area was unusable"
// layout fix.
const PREVIEW_MAX_H = SCREEN_H * 0.4;
const PREVIEW_PAD_H = 16;

// scale:0.5 for every live-preview request (debounced on each control
// change) - fast enough to feel instant. The actual Share tap always
// re-requests at scale:1, even if the on-screen preview already matches
// the current controls (it's still the half-size render) - see share().
const PREVIEW_SCALE = 0.5;
const FINAL_SCALE = 1;

const CUSTOM_HOOK_MAX = 40;
const CAPTION_TAGLINE = "Search ValuIQ — free resale scanner · iOS + Android";

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

  const [format, setFormat] = useState<StudioFormat>("story");
  // Hook defaults ON ("Would you flip it?") rather than null/off - see
  // studioPrefs.ts's DEFAULT_HOOK. The effect below overwrites this with
  // whatever AsyncStorage actually remembers the instant it resolves, but
  // starting here (not null) avoids a flash of "no hook selected" on open.
  const [hook, setHook] = useState<string | null>(DEFAULT_HOOK);
  const [customHookOpen, setCustomHookOpen] = useState(false);
  const [customHookText, setCustomHookText] = useState("");
  const [handleEnabled, setHandleEnabled] = useState(false);
  const [handle, setHandle] = useState("");
  const [handleEditOpen, setHandleEditOpen] = useState(false);
  const [hidePrice, setHidePrice] = useState(false);

  // Photo: mode is persisted (studioPrefs.ts); zoom/focus are session-only -
  // always start back at these defaults on a fresh open, per spec.
  const [photoMode, setPhotoMode] = useState<PhotoMode>(DEFAULT_PHOTO_ADJUST.mode);
  const [zoom, setZoom] = useState(DEFAULT_PHOTO_ADJUST.zoom);
  const [fx, setFx] = useState(DEFAULT_PHOTO_ADJUST.fx);
  const [fy, setFy] = useState(DEFAULT_PHOTO_ADJUST.fy);

  // Color: null = "Auto" (card's own verdict color, no accent field sent).
  const [accent, setAccent] = useState<string | null>(null);
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

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const openedLoggedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    loadStudioPrefs(displayName).then((p) => {
      setHandleEnabled(p.handleEnabled);
      setHandle(p.handle);
      // Win variant's hook default is driven by the sale's profit sign
      // (set synchronously below), never by the generic persisted
      // preference - a sale-outcome card's default pitch is a different
      // decision than a fresh-scan share's.
      if (!isWin) setHook(p.hook);
      setPhotoMode(p.photoMode ?? DEFAULT_PHOTO_ADJUST.mode);
      setAccent(p.accent ?? null);
    });
    setFormat("story");
    setHook(isWin ? (winData && winData.profit > 0 ? WIN_PROFIT_HOOK : null) : DEFAULT_HOOK);
    setCustomHookOpen(false);
    setCustomHookText("");
    setHandleEditOpen(false);
    setHidePrice(false);
    // Zoom/focus are session-only - always back to centered/unzoomed on a
    // fresh open, regardless of what the last session left them at.
    setZoom(DEFAULT_PHOTO_ADJUST.zoom);
    setFx(DEFAULT_PHOTO_ADJUST.fx);
    setFy(DEFAULT_PHOTO_ADJUST.fy);
    setHexOpen(false);
    setHexText("");
    setHexError(false);
    setPreviewUri(null);
    setFetchError(null);
    setShareStatus(null);
    setRenderStatus("idle");
    setRenderMs(null);
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
    setHook((cur) => {
      const next = cur === h ? null : h;
      persistPrefs({ hook: next });
      return next;
    });
    setCustomHookOpen(false);
  }

  function commitCustomHook() {
    const t = customHookText.trim();
    const next = t ? t : null;
    setHook(next);
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
    setHandleEnabled(next);
    persistPrefs({ handleEnabled: next });
  }

  function choosePhotoMode(mode: PhotoMode) {
    setPhotoMode(mode);
    persistPrefs({ photoMode: mode });
    // Zoom/focus only mean anything in Fill - switching back to Whole drops
    // any in-progress crop rather than silently carrying it forward unseen.
    if (mode === "whole") {
      setZoom(DEFAULT_PHOTO_ADJUST.zoom);
      setFx(DEFAULT_PHOTO_ADJUST.fx);
      setFy(DEFAULT_PHOTO_ADJUST.fy);
    }
  }

  function nudgeZoom(delta: number) {
    setZoom((z) => clampZoom(z + delta));
  }

  function nudgeFocus(dx: number, dy: number) {
    if (dx) setFx((f) => clampFocus(f + dx));
    if (dy) setFy((f) => clampFocus(f + dy));
  }

  function resetPhotoAdjust() {
    setZoom(DEFAULT_PHOTO_ADJUST.zoom);
    setFx(DEFAULT_PHOTO_ADJUST.fx);
    setFy(DEFAULT_PHOTO_ADJUST.fy);
  }

  function chooseAccent(hex: string | null) {
    setAccent(hex);
    setHexOpen(false);
    setHexError(false);
    persistPrefs({ accent: hex });
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

  const aspect = useMemo(() => {
    const { w, h } = FORMAT_SIZES[format];
    return w / h;
  }, [format]);

  // The exact box the preview image renders at - computed in JS (not pure
  // CSS aspectRatio+maxHeight, which can't reliably pick "shrink by width
  // vs shrink by height" for every format) so every format (tall Story,
  // square, wide-ish Feed) is guaranteed to fit inside the ~52%-height cap
  // AND the screen width, centered, with nothing ever cropped.
  const previewBox = useMemo(() => {
    const availW = SCREEN_W - PREVIEW_PAD_H * 2;
    const byWidth = { width: availW, height: availW / aspect };
    if (byWidth.height <= PREVIEW_MAX_H) return byWidth;
    return { width: PREVIEW_MAX_H * aspect, height: PREVIEW_MAX_H };
  }, [aspect]);

  if (!visible) return null;

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

        <View style={st.previewArea}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              resizeMode="contain"
              style={[st.previewImg, previewBox, loading && st.previewImgDimmed]}
            />
          ) : (
            <View style={[st.previewPlaceholder, previewBox]} />
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
        <Text style={st.renderReadout}>render {renderMs ?? "—"} ms · {renderStatus}</Text>

        {/* Compact control ROWS, not a tall stacked form - every row fits an
            iPhone-13-size screen without scrolling now that the preview
            above is capped at ~40% of screen height. The outer ScrollView
            is a fallback only (an accessibility-scaled font or a very short
            phone), never the normal path. */}
        <ScrollView
          style={st.controlsScroll}
          contentContainerStyle={st.controlsContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ROW 1 — format */}
          <View style={st.segmentRow}>
            {(["story", "feed", "square"] as StudioFormat[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[st.segment, format === f && st.segmentActive]}
                onPress={() => setFormat(f)}
              >
                <Text style={[st.segmentText, format === f && st.segmentTextActive]} numberOfLines={1}>{FORMAT_LABELS[f]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ROW 2 — hook, single horizontal scroller (no wrap -> no extra
              vertical height, however many presets there are). */}
          <Text style={st.sectionLabel}>HOOK</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipScrollRow}>
            {HOOK_PRESETS.map((h) => {
              const selected = hook === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[st.chip, selected && st.chipActive]}
                  onPress={() => openPreset(h)}
                >
                  <Text style={[st.chipText, selected && st.chipTextActive]} numberOfLines={1}>{h}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[st.chip, hook == null && st.chipActive]}
              onPress={() => { setHook(null); setCustomHookOpen(false); persistPrefs({ hook: null }); }}
            >
              <Text style={[st.chipText, hook == null && st.chipTextActive]}>None</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.chip, hook != null && !HOOK_PRESETS.includes(hook) && st.chipActive]}
              onPress={() => { setCustomHookText(hook && !HOOK_PRESETS.includes(hook) ? hook : ""); setCustomHookOpen(true); }}
            >
              <Text style={[st.chipText, hook != null && !HOOK_PRESETS.includes(hook) && st.chipTextActive]} numberOfLines={1}>
                {hook != null && !HOOK_PRESETS.includes(hook) ? hook : "Custom…"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
          {customHookOpen ? (
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
              />
              <TouchableOpacity onPress={commitCustomHook} style={st.inlineInputDone}>
                <Text style={st.inlineInputDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ROW 3 — handle / hide-price toggle chips */}
          <View style={st.toggleChipRow}>
            <TouchableOpacity
              style={[st.chip, handleEnabled && st.chipActive]}
              onPress={() => toggleHandleEnabled(!handleEnabled)}
            >
              <Text style={[st.chipText, handleEnabled && st.chipTextActive]} numberOfLines={1}>Handle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.chip, hidePrice && st.chipActive]}
              onPress={() => setHidePrice((v) => !v)}
            >
              <Text style={[st.chipText, hidePrice && st.chipTextActive]} numberOfLines={1}>Hide price</Text>
            </TouchableOpacity>
          </View>
          {handleEnabled ? (
            handleEditOpen ? (
              <View style={st.inlineInputRow}>
                <TextInput
                  style={st.inlineInput}
                  value={handle}
                  onChangeText={setHandle}
                  placeholder="@yourname"
                  placeholderTextColor={C.text4}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={commitHandle}
                />
                <TouchableOpacity onPress={commitHandle} style={st.inlineInputDone}>
                  <Text style={st.inlineInputDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={st.handlePill} onPress={() => setHandleEditOpen(true)}>
                <Text style={st.handlePillText} numberOfLines={1}>{handle || "+ Add your @handle"}</Text>
              </TouchableOpacity>
            )
          ) : null}

          {/* ROW 4 — photo: Whole/Fill, with zoom/focus/reset only in Fill */}
          <Text style={st.sectionLabel}>PHOTO</Text>
          <View style={st.photoModeRow}>
            {(["whole", "fill"] as PhotoMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[st.photoModeBtn, photoMode === m && st.chipActive]}
                onPress={() => choosePhotoMode(m)}
              >
                <Text style={[st.chipText, photoMode === m && st.chipTextActive]} numberOfLines={1}>
                  {m === "whole" ? "Whole" : "Fill"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {photoMode === "fill" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.photoAdjustRow}>
              <View style={st.adjustGroup}>
                <TouchableOpacity style={st.adjustBtn} onPress={() => nudgeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
                  <Text style={st.adjustBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={st.zoomValue} numberOfLines={1}>{zoom.toFixed(2)}x</Text>
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
                <Text style={st.resetBtnText}>Reset</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          {/* ROW 5 — color, single horizontal scroller of round swatches */}
          <Text style={st.sectionLabel}>COLOR</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.swatchRow}>
            <TouchableOpacity
              style={[st.swatch, { backgroundColor: C.surfaceHigh }, accent == null && st.swatchSelected]}
              onPress={() => chooseAccent(null)}
            >
              <Text style={st.swatchAutoText}>Auto</Text>
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
          {hexOpen ? (
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
              />
              <TouchableOpacity onPress={commitHex} style={st.inlineInputDone}>
                <Text style={st.inlineInputDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {hexError ? <Text style={st.hexErrorText}>Enter a 6-digit hex color, like #A3E635.</Text> : null}

          {isOwner && debugBytes != null ? (
            <Text style={st.debugLine}>
              export {FORMAT_SIZES[format].w}×{FORMAT_SIZES[format].h} · {formatFileSize(debugBytes)}
            </Text>
          ) : null}
        </ScrollView>

        {/* Pinned footer, OUTSIDE the ScrollView - Share is always visible,
            full width, above the home indicator, never pushed below the
            fold regardless of how much the controls above grow. */}
        <View style={st.footer}>
          {shareStatus ? (
            <Text style={[st.statusText, shareStatus.kind === "fail" && st.statusTextFail]} numberOfLines={2}>{shareStatus.text}</Text>
          ) : null}
          <TouchableOpacity style={st.copyBtn} onPress={copyCaption}>
            <Text style={st.copyBtnText}>{copied ? "Copied!" : "Copy caption"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.shareBtn, (!previewUri || sharing) && st.shareBtnDisabled]}
            onPress={share}
            disabled={!previewUri || sharing}
            activeOpacity={0.85}
          >
            {sharing ? (
              <View style={st.shareBtnPreparing}>
                <ActivityIndicator color={C.greenDark} />
                <Text style={st.shareBtnText}>Preparing…</Text>
              </View>
            ) : <Text style={st.shareBtnText}>Share</Text>}
          </TouchableOpacity>
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

  // Fixed height (not minHeight) - "at most ~40% of the screen", contain +
  // centered. previewBox (computed in JS from the format's aspect ratio)
  // sizes the actual image/placeholder to fit inside this without cropping.
  previewArea: { height: PREVIEW_MAX_H, alignItems: "center", justifyContent: "center", paddingHorizontal: PREVIEW_PAD_H, position: "relative" },
  previewImg: { borderRadius: 12 },
  previewImgDimmed: { opacity: 0.45 },
  previewPlaceholder: { borderRadius: 12, backgroundColor: C.surfaceHigh },
  previewSpinner: { position: "absolute" },
  previewShimmer: { position: "absolute", top: 8, left: PREVIEW_PAD_H + 8, right: PREVIEW_PAD_H + 8, height: 3, borderRadius: 2, backgroundColor: C.green },
  errorBox: { position: "absolute", left: 16, right: 16, bottom: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.red + "50", borderRadius: 12, padding: 14 },
  errorTitle: { color: C.red, fontSize: 14, fontWeight: "800", marginBottom: 4 },
  errorDetail: { color: C.text3, fontSize: 11, fontFamily: "monospace" as any, marginBottom: 4 },
  errorBody: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginBottom: 10 },
  retryBtn: { alignSelf: "flex-start", backgroundColor: C.red + "20", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryBtnText: { color: C.red, fontSize: 13, fontWeight: "800" },
  renderReadout: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, textAlign: "center", paddingVertical: 4 },

  controlsScroll: { flex: 1 },
  // No bottom padding needed for the Share button anymore - it's pinned in
  // its own footer below the ScrollView, not scrolled content.
  controlsContent: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  segmentRow: { flexDirection: "row", gap: 8, width: "100%" },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  segmentActive: { borderColor: C.green, backgroundColor: C.greenBg },
  segmentText: { color: C.text3, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: C.green },

  sectionLabel: { color: C.green, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: 12, marginBottom: 8 },
  // Hook/color rows are single horizontal scrollers (not flexWrap) so
  // however many chips/swatches exist, they add zero extra row height.
  chipScrollRow: { flexDirection: "row", gap: 8, paddingRight: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: C.greenDark, fontWeight: "900" },

  inlineInputRow: { flexDirection: "row", alignItems: "center", marginTop: 8, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.green, borderRadius: 100, paddingLeft: 16, paddingRight: 8, minHeight: 44 },
  inlineInput: { flex: 1, color: C.text1, fontSize: 14, fontWeight: "600", paddingVertical: Platform.OS === "ios" ? 10 : 6 },
  inlineInputDone: { paddingHorizontal: 10, paddingVertical: 8 },
  inlineInputDoneText: { color: C.green, fontSize: 13, fontWeight: "800" },
  hexErrorText: { color: C.red, fontSize: 11, fontWeight: "600", marginTop: 6 },

  // ROW 3 — handle/hide-price toggle chips, side by side.
  toggleChipRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  handlePill: { marginTop: 8, minHeight: 44, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, alignSelf: "flex-start" },
  handlePillText: { color: C.text2, fontSize: 14, fontWeight: "700" },

  // ROW 4 — photo mode + (Fill-only) zoom/focus/reset.
  photoModeRow: { flexDirection: "row", gap: 8 },
  photoModeBtn: { minHeight: 40, minWidth: 72, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  photoAdjustRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10, paddingRight: 8 },
  adjustGroup: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderRadius: 100, paddingHorizontal: 4 },
  adjustBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  adjustBtnText: { color: C.text1, fontSize: 16, fontWeight: "800" },
  zoomValue: { color: C.text2, fontSize: 12, fontWeight: "700", minWidth: 44, textAlign: "center" },
  resetBtn: { paddingHorizontal: 12, minHeight: 36, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  resetBtnText: { color: C.text3, fontSize: 12, fontWeight: "700" },

  // ROW 5 — color swatches, >=36pt round tap targets, white ring on the
  // selected one (Auto included).
  swatchRow: { flexDirection: "row", gap: 10, paddingRight: 8, paddingVertical: 2 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.border },
  swatchSelected: { borderWidth: 2, borderColor: C.text1 },
  swatchAutoText: { color: C.text2, fontSize: 10, fontWeight: "800" },

  debugLine: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginTop: 14, textAlign: "center" },

  // Pinned footer - outside the ScrollView, above the home indicator, Share
  // always full-width and visible regardless of scroll position above.
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 30 : 18, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  statusText: { color: C.text2, fontSize: 12, textAlign: "center", marginBottom: 8 },
  statusTextFail: { color: C.red },
  shareBtn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 17, alignItems: "center" },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnPreparing: { flexDirection: "row", alignItems: "center", gap: 8 },
  shareBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  copyBtn: { alignItems: "center", paddingVertical: 8, marginBottom: 2 },
  copyBtnText: { color: C.text3, fontSize: 13, fontWeight: "700" },
});
