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
  Dimensions, TextInput, ScrollView, ActivityIndicator, Switch, Keyboard, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { C } from "../lib/theme";
import { FORMAT_SIZES, FORMAT_LABELS, StudioFormat, StudioConfidence, formatFileSize, HOOK_PRESETS, DEFAULT_HOOK } from "../lib/shareStudio";
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
// Preview is capped at ~52% of screen height (contain, never cropped) so
// the controls + pinned Share button are never pushed below the fold on a
// smaller phone - see this file's AGENTS.md-mandated layout fix.
const PREVIEW_MAX_H = SCREEN_H * 0.52;
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
      setHook(p.hook);
    });
    setFormat("story");
    setHook(DEFAULT_HOOK);
    setCustomHookOpen(false);
    setCustomHookText("");
    setHandleEditOpen(false);
    setHidePrice(false);
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
    const merged = { handleEnabled, handle, hook, ...next };
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
    const base = isWin
      ? buildShareCardPayload({
          variant: "win", format, itemName,
          boughtPrice: winData!.boughtPrice, soldPrice: winData!.soldPrice, profit: winData!.profit,
          hook, handle: effectiveHandle, hidePrice,
        })
      : buildShareCardPayload({
          variant: "scan", format, itemName,
          paidPrice: paidPrice ?? null, heroSellPrice: sellPrice ?? null,
          verdict: heroVerdict ?? null, toneOverride,
          isEstimate: profitConfidence === "estimate",
          hook, handle: effectiveHandle, hidePrice,
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
  }, [visible, format, hook, handleEnabled, handle, hidePrice]);

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

        {/* Format tabs + hook chips directly under the preview, inside the
            scroll area - sized/ordered so both are visible without
            scrolling on an iPhone 13-size screen even though the preview
            above is now capped at ~52% of the screen height. Handle/hide-
            price controls follow below, scrollable. */}
        <ScrollView
          style={st.controlsScroll}
          contentContainerStyle={st.controlsContent}
          keyboardShouldPersistTaps="handled"
        >
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

          <Text style={st.sectionLabel}>HOOK</Text>
          <View style={st.chipRow}>
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
          </View>
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
          ) : (
            <TouchableOpacity
              style={[st.chip, st.customHookChip, hook != null && !HOOK_PRESETS.includes(hook) && st.chipActive]}
              onPress={() => { setCustomHookText(hook && !HOOK_PRESETS.includes(hook) ? hook : ""); setCustomHookOpen(true); }}
            >
              <Text style={[st.chipText, hook != null && !HOOK_PRESETS.includes(hook) && st.chipTextActive]} numberOfLines={1}>
                {hook != null && !HOOK_PRESETS.includes(hook) ? hook : "Custom hook…"}
              </Text>
            </TouchableOpacity>
          )}

          <View style={st.toggleRow}>
            <Text style={st.toggleLabel}>Show handle</Text>
            <Switch value={handleEnabled} onValueChange={toggleHandleEnabled} trackColor={{ true: C.green }} />
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

          <View style={st.toggleRow}>
            <Text style={st.toggleLabel}>Hide price</Text>
            <Switch value={hidePrice} onValueChange={setHidePrice} trackColor={{ true: C.green }} />
          </View>

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

  // Fixed height (not minHeight) - "at most ~52% of the screen", contain +
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: C.green, borderColor: C.green },
  chipText: { color: C.text2, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: C.greenDark, fontWeight: "900" },
  customHookChip: { marginTop: 8, alignSelf: "flex-start" },

  inlineInputRow: { flexDirection: "row", alignItems: "center", marginTop: 8, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.green, borderRadius: 100, paddingLeft: 16, paddingRight: 8, minHeight: 44 },
  inlineInput: { flex: 1, color: C.text1, fontSize: 14, fontWeight: "600", paddingVertical: Platform.OS === "ios" ? 10 : 6 },
  inlineInputDone: { paddingHorizontal: 10, paddingVertical: 8 },
  inlineInputDoneText: { color: C.green, fontSize: 13, fontWeight: "800" },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  toggleLabel: { color: C.text2, fontSize: 14, fontWeight: "700" },
  handlePill: { marginTop: 8, minHeight: 44, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, alignSelf: "flex-start" },
  handlePillText: { color: C.text2, fontSize: 14, fontWeight: "700" },

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
