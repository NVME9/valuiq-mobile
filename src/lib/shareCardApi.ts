// shareCardApi.ts — the one network call Share Studio makes: POST a built
// payload + photo to /api/share-card and get back a finished PNG, written
// to a cache file the component can hand straight to <Image>/expo-sharing.
// Not pure (network + file I/O) - see shareCardPayload.ts for the testable
// payload-building half of this feature.
import { Image } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { API_BASE, SUPABASE_URL } from "./api";
import { ShareCardPayload } from "./shareCardPayload";

// OTA-SAFE IMPORT (same convention the rest of this app's share code uses):
// a guarded require, not a static import, so a missing native module can't
// crash the whole app at launch.
let FileSystem: typeof import("expo-file-system") | null = null;
try { FileSystem = require("expo-file-system"); } catch { FileSystem = null; }

// expo-image-manipulator IS in build 46 (scripts/native-modules-build46.json)
// - used here to downscale the photo before it ever leaves the device, same
// 1400px-longest-edge/q0.85 budget lib/image.ts's compressPhoto uses for the
// scan upload itself. The old flat "reject over 5MB" rule now only applies
// as a FALLBACK, if manipulation itself throws (missing/broken module) -
// the normal path never needs it, since the downscaled photo is always small.
const MAX_LONG_EDGE = 1400;
const JPEG_QUALITY = 0.85;
const LOCAL_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function estimateBase64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function stripDataUriPrefix(value: string): string {
  return value.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

export interface NormalizedPhoto {
  uri: string;
  width: number;
  height: number;
}

// Writes a data: URI's base64 payload to a cache file FIRST (v8, item 1) -
// manipulateAsync technically accepts a data: URI directly, but a full-
// resolution photo's base64 string can run into native-bridge size trouble
// on some devices/platforms, so this app never hands manipulateAsync a raw
// data: URI when it can hand it a short file:// path instead. No-op for
// any URI that isn't a data: URI already.
async function materializeDataUri(uri: string): Promise<string> {
  if (!uri.startsWith("data:") || !FileSystem) return uri;
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(uri);
  if (!match) return uri;
  const ext = /png/i.test(match[1]) ? "png" : "jpg";
  const file = new (FileSystem as any).File((FileSystem as any).Paths.cache, `share-photo-src-${Date.now()}.${ext}`);
  file.create({ overwrite: true, intermediates: true });
  await file.write(match[2], { encoding: "base64" });
  return file.uri;
}

// NORMALIZE ORIENTATION ONCE (v8, item 1) - the root-cause fix for the
// founder's crop-screen bug (natural=667x1280 reported for a photo painted
// LANDSCAPE): a zero-op manipulateAsync pass bakes the photo's EXIF
// orientation into its actual pixels, so its RETURNED width/height always
// agree with how it's painted - no probe (Image.getSize, <Image>'s onLoad)
// can disagree with that ever again, because nothing downstream reads raw
// sensor pixels anymore. The caller (ShareStudio.tsx) threads this single
// result into BOTH the crop screen (as its `natural` prop) and the final
// share payload (via resolveSharePhoto's `normalized` param below), so the
// server's own sharp(...).rotate() has nothing left to do.
export async function normalizePhotoOrientation(uri: string): Promise<NormalizedPhoto> {
  const srcUri = await materializeDataUri(uri);
  const out = await ImageManipulator.manipulateAsync(srcUri, [], {
    compress: 0.92, format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: out.uri, width: out.width, height: out.height };
}

// Downscales ONLY when the photo's longest edge actually exceeds the
// budget (never upscales a smaller photo) - probes the real dimensions
// first (Image.getSize works on a data: URI same as a file one) so a
// photo that's already small just gets re-encoded at the target quality,
// no resize action. Throws on any failure - the caller decides the
// fallback (see resolveSharePhoto below).
async function downscalePhoto(base64Raw: string): Promise<string> {
  const src = `data:image/jpeg;base64,${base64Raw}`;
  const { width, height } = await getImageSize(src);
  const longEdge = Math.max(width, height);
  const actions = longEdge > MAX_LONG_EDGE
    ? [width >= height ? { resize: { width: MAX_LONG_EDGE } } : { resize: { height: MAX_LONG_EDGE } }]
    : [];
  const out = await ImageManipulator.manipulateAsync(src, actions, {
    compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  if (!out.base64) throw new Error("manipulateAsync produced no base64");
  return out.base64;
}

// Same downscale budget as downscalePhoto above, but starting from an
// already-normalized {uri, width, height} (v8, item 1) - no Image.getSize
// probe needed, since the caller's width/height ALREADY agree with how the
// photo paints (that's the whole point of normalizePhotoOrientation).
async function downscaleFromNormalized(uri: string, width: number, height: number): Promise<string> {
  const longEdge = Math.max(width, height);
  const actions = longEdge > MAX_LONG_EDGE
    ? [width >= height ? { resize: { width: MAX_LONG_EDGE } } : { resize: { height: MAX_LONG_EDGE } }]
    : [];
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  if (!out.base64) throw new Error("manipulateAsync produced no base64");
  return out.base64;
}

// Shared with ShareStudio.tsx so it knows NOT to bother normalizing a photo
// that's already a remote asset on our own Storage host (no local pixels to
// normalize - see resolveSharePhoto's {url} passthrough branch below).
export function isRemoteShareUrl(uri: string | null): boolean {
  return !!uri && /^https?:\/\//i.test(uri) && uri.startsWith(`${SUPABASE_URL}/storage/`);
}

export type SharePhoto = { base64: string } | { url: string };

export type ResolvePhotoResult = { photo: SharePhoto } | { error: string };

// Prefers photoBase64 (raw, no data: prefix - the shape a fresh scan's own
// capture state is already in). Falls back to photoUri, which may itself be
// a data: URI (strip it to base64) or a real https URL - the {url} shape is
// only ever sent when that URL is on our OWN Supabase Storage host, per the
// API contract; any other remote URL has no local bytes to read, so it's
// treated as "no photo" rather than fetched (no new upload/download
// plumbing for a case this app doesn't actually produce today).
export async function resolveSharePhoto(
  photoBase64: string | null, photoUri: string | null,
  // v8, item 1: when the caller already normalized the photo's orientation
  // (ShareStudio.tsx's normalizedPhoto state), use ITS uri/width/height
  // directly instead of re-deriving raw base64 and re-probing size below -
  // this is what makes "editor's natural size == payload's natural size"
  // true, so the server's sharp(...).rotate() is a no-op. Falls through to
  // the legacy raw-bytes path if omitted, or if normalization itself fails.
  normalized?: NormalizedPhoto | null
): Promise<ResolvePhotoResult> {
  if (isRemoteShareUrl(photoUri)) {
    return { photo: { url: photoUri as string } };
  }
  if (normalized) {
    try {
      const base64 = await downscaleFromNormalized(normalized.uri, normalized.width, normalized.height);
      return { photo: { base64 } };
    } catch {
      // fall through to the legacy raw-bytes path below as a last resort
    }
  }
  const raw = photoBase64
    ? stripDataUriPrefix(photoBase64)
    : (photoUri && /^data:image\//i.test(photoUri) ? stripDataUriPrefix(photoUri) : null);
  if (!raw) return { error: "No photo available to share." };

  try {
    const base64 = await downscalePhoto(raw);
    return { photo: { base64 } };
  } catch {
    // Manipulation itself threw - fall back to the ORIGINAL bytes, still
    // capped so a huge, un-shrunk photo never ships either way.
    if (estimateBase64Bytes(raw) > LOCAL_PHOTO_MAX_BYTES) {
      return { error: "That photo is too large to share (over 5 MB)." };
    }
    return { photo: { base64: raw } };
  }
}

export interface ShareCardFetchResult {
  ok: boolean;
  uri?: string;
  size?: number;
  status?: number;
  stage?: string;
  // Parsed `error` field off a non-OK JSON body (e.g. "cutout_unavailable" -
  // see the 501 gate in deal-ai-pro's app/api/share-card/route.ts) - distinct
  // from `stage` (a different field on the same error body, only ever set
  // by the decode/render failure paths) so a caller can tell "feature not
  // available" apart from "something broke" without string-matching bodyPreview.
  errorCode?: string;
  ms: number;
  bodyPreview?: string;
}

// POSTs the payload, writes a successful image/png response to a cache
// file (SDK 54's File class - see AGENTS.md's "Expo HAS CHANGED" note),
// and returns its local uri. Any non-OK/non-PNG response is read back as
// text so the caller's error box can show real status/stage/body, never a
// blank failure.
export async function fetchShareCardPng(
  // `scale` lets the live-preview loop ask the server for a half-size
  // render (faster, plenty sharp for the in-app preview) while the actual
  // Share tap always asks for a fresh scale:1 image - see ShareStudio.tsx's
  // runFetch/share.
  payload: ShareCardPayload & { photo: SharePhoto; scale?: number },
  token: string | null,
  signal: AbortSignal
): Promise<ShareCardFetchResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${API_BASE}/api/share-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, userToken: token || undefined }),
      signal,
    });
    const ms = Date.now() - t0;
    const contentType = r.headers.get("content-type") || "";
    if (!r.ok || !contentType.includes("image/png")) {
      const text = await r.text().catch(() => "");
      let stage: string | undefined;
      let errorCode: string | undefined;
      try {
        const parsed = JSON.parse(text);
        stage = parsed?.stage;
        errorCode = typeof parsed?.error === "string" ? parsed.error : undefined;
      } catch {}
      return { ok: false, status: r.status, stage, errorCode, ms, bodyPreview: text.slice(0, 120) };
    }
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (!FileSystem) return { ok: false, ms, stage: "file-system-unavailable" };
    const file = new (FileSystem as any).File((FileSystem as any).Paths.cache, `share-card-${Date.now()}.png`);
    file.create({ overwrite: true, intermediates: true });
    await file.write(bytes);
    return { ok: true, uri: file.uri, size: bytes.length, ms };
  } catch (e: any) {
    const ms = Date.now() - t0;
    if (e?.name === "AbortError") return { ok: false, ms, stage: "aborted" };
    return { ok: false, ms, stage: "network", bodyPreview: String(e?.message || e).slice(0, 120) };
  }
}
