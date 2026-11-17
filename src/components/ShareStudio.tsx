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
  Modal, View, Text, StyleSheet, TouchableOpacity, Image,
  Dimensions, TextInput, ScrollView, ActivityIndicator, Switch, Keyboard, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { C } from "../lib/theme";
import { FORMAT_SIZES, FORMAT_LABELS, StudioFormat, StudioConfidence, formatFileSize } from "../lib/shareStudio";
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

const { height: SCREEN_H } = Dimensions.get("window");
const PREVIEW_MIN_H = SCREEN_H * 0.6;

const HOOK_PRESETS = ["Would you flip it?", "Pass or buy?", "Real find, real numbers."];
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

export default function ShareStudio(props: ShareStudioProps) {
  const {
    visible, onClose, token, scanId, itemName, photoBase64, photoUri,
    paidPrice, sellPrice, profitConfidence, heroVerdict, toneOverride,
    displayName, isOwner, winData,
  } = props;
  const isWin = !!winData;

  const [format, setFormat] = useState<StudioFormat>("story");
  const [hook, setHook] = useState<string | null>(null);
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
    });
    setFormat("story");
    setHook(null);
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

  function persistHandlePrefs(next: Partial<StudioPrefs>) {
    const merged = { handleEnabled, handle, ...next };
    saveStudioPrefs(merged);
  }

  async function runFetch() {
    const resolved = resolveSharePhoto(photoBase64, photoUri ?? null);
    const seq = ++requestSeqRef.current;
    if (abortRef.current) abortRef.current.abort();

    if ("error" in resolved) {
      setLoading(false);
      setRenderStatus("failed");
      setFetchError({ ms: 0, message: resolved.error });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setFetchError(null);

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

    const result = await fetchShareCardPng({ ...base, photo: resolved.photo }, token, controller.signal);
    if (seq !== requestSeqRef.current) return; // superseded by a newer request
    setLoading(false);
    setRenderMs(result.ms);
    if (result.ok && result.uri) {
      setRenderStatus("ok");
      setPreviewUri(result.uri);
      setFetchError(null);
      if (isOwner) setDebugBytes(result.size ?? null);
    } else if (result.stage !== "aborted") {
      setRenderStatus("failed");
      setFetchError({
        status: result.status, stage: result.stage, ms: result.ms,
        bodyPreview: result.bodyPreview, message: "Couldn't load the preview.",
      });
    }
  }

  // Debounced re-request on every control change - cancels any in-flight
  // request (runFetch itself aborts the previous one) and keeps showing the
  // last successful preview, dimmed, until the new one lands.
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { runFetch(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, format, hook, handleEnabled, handle, hidePrice]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

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

  function commitHandle() {
    setHandleEditOpen(false);
    persistHandlePrefs({ handle });
    Keyboard.dismiss();
  }

  function toggleHandleEnabled(next: boolean) {
    setHandleEnabled(next);
    persistHandlePrefs({ handleEnabled: next });
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
      const available = Sharing ? await Sharing.isAvailableAsync() : false;
      if (!available || !Sharing) {
        setShareStatus({ kind: "fail", text: "Sharing isn't available on this device." });
        return;
      }
      await Sharing.shareAsync(previewUri, { mimeType: "image/png", dialogTitle: "Share your ValuIQ find" });
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

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={st.root}>
        <View style={st.topBar}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.closeHit}>
            <Text style={st.closeText}>Close</Text>
          </TouchableOpacity>
          <Text style={st.topTitle} numberOfLines={1}>Share Studio</Text>
          <View style={st.closeHit} />
        </View>

        <View style={st.previewArea}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              resizeMode="contain"
              style={[st.previewImg, { aspectRatio: aspect }, loading && st.previewImgDimmed]}
            />
          ) : (
            <View style={[st.previewPlaceholder, { aspectRatio: aspect }]} />
          )}
          {loading ? <ActivityIndicator style={st.previewSpinner} color={C.green} size="large" /> : null}
          {fetchError ? (
            <View style={st.errorBox}>
              <Text style={st.errorTitle}>Couldn't load the preview</Text>
              <Text style={st.errorDetail}>
                {fetchError.status ? `HTTP ${fetchError.status}` : "network error"} · {fetchError.stage || "—"} · {fetchError.ms}ms
              </Text>
              {fetchError.bodyPreview ? (
                <Text style={st.errorBody} numberOfLines={3}>{fetchError.bodyPreview}</Text>
              ) : null}
              <TouchableOpacity style={st.retryBtn} onPress={runFetch}>
                <Text style={st.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <Text style={st.renderReadout}>render {renderMs ?? "—"} ms · {renderStatus}</Text>

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
              onPress={() => { setHook(null); setCustomHookOpen(false); }}
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

          {shareStatus ? (
            <Text style={[st.statusText, shareStatus.kind === "fail" && st.statusTextFail]} numberOfLines={2}>{shareStatus.text}</Text>
          ) : null}
          <TouchableOpacity
            style={[st.shareBtn, (!previewUri || sharing) && st.shareBtnDisabled]}
            onPress={share}
            disabled={!previewUri || sharing}
            activeOpacity={0.85}
          >
            {sharing ? <ActivityIndicator color={C.greenDark} /> : <Text style={st.shareBtnText}>Share</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={st.copyBtn} onPress={copyCaption}>
            <Text style={st.copyBtnText}>{copied ? "Copied!" : "Copy caption"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 16, paddingBottom: 10 },
  closeHit: { width: 56, minWidth: 56 },
  closeText: { color: C.text3, fontSize: 15, fontWeight: "700" },
  topTitle: { color: C.text1, fontSize: 15, fontWeight: "800", flexShrink: 1, textAlign: "center" },

  previewArea: { minHeight: PREVIEW_MIN_H, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, position: "relative" },
  previewImg: { width: "100%", maxHeight: "100%", borderRadius: 12 },
  previewImgDimmed: { opacity: 0.45 },
  previewPlaceholder: { width: "100%", maxHeight: "100%", borderRadius: 12, backgroundColor: C.surfaceHigh },
  previewSpinner: { position: "absolute" },
  errorBox: { position: "absolute", left: 16, right: 16, bottom: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.red + "50", borderRadius: 12, padding: 14 },
  errorTitle: { color: C.red, fontSize: 14, fontWeight: "800", marginBottom: 4 },
  errorDetail: { color: C.text3, fontSize: 11, fontFamily: "monospace" as any, marginBottom: 4 },
  errorBody: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginBottom: 10 },
  retryBtn: { alignSelf: "flex-start", backgroundColor: C.red + "20", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  retryBtnText: { color: C.red, fontSize: 13, fontWeight: "800" },
  renderReadout: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, textAlign: "center", paddingVertical: 4 },

  controlsScroll: { flex: 1 },
  controlsContent: { paddingHorizontal: 16, paddingBottom: 30, paddingTop: 4 },
  segmentRow: { flexDirection: "row", gap: 8, width: "100%" },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: "center" },
  segmentActive: { borderColor: C.green, backgroundColor: C.greenBg },
  segmentText: { color: C.text3, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: C.green },

  sectionLabel: { color: C.green, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },
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

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  toggleLabel: { color: C.text2, fontSize: 14, fontWeight: "700" },
  handlePill: { marginTop: 8, minHeight: 44, borderRadius: 100, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, alignSelf: "flex-start" },
  handlePillText: { color: C.text2, fontSize: 14, fontWeight: "700" },

  debugLine: { color: C.text4, fontSize: 10, fontFamily: "monospace" as any, marginTop: 14, textAlign: "center" },
  statusText: { color: C.text2, fontSize: 12, textAlign: "center", marginTop: 16 },
  statusTextFail: { color: C.red },
  shareBtn: { marginTop: 16, backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  copyBtn: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  copyBtnText: { color: C.text3, fontSize: 13, fontWeight: "700" },
});
