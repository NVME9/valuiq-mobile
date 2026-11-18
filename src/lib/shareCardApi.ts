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

export type SharePhoto = { base64: string } | { url: string };

export type ResolvePhotoResult = { photo: SharePhoto } | { error: string };

// Prefers photoBase64 (raw, no data: prefix - the shape a fresh scan's own
// capture state is already in). Falls back to photoUri, which may itself be
// a data: URI (strip it to base64) or a real https URL - the {url} shape is
// only ever sent when that URL is on our OWN Supabase Storage host, per the
// API contract; any other remote URL has no local bytes to read, so it's
// treated as "no photo" rather than fetched (no new upload/download
// plumbing for a case this app doesn't actually produce today).
export async function resolveSharePhoto(photoBase64: string | null, photoUri: string | null): Promise<ResolvePhotoResult> {
  if (photoUri && /^https?:\/\//i.test(photoUri) && photoUri.startsWith(`${SUPABASE_URL}/storage/`)) {
    return { photo: { url: photoUri } };
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
  ms: number;
  bodyPreview?: string;
}

// POSTs the payload, writes a successful image/png response to a cache
// file (SDK 54's File class - see AGENTS.md's "Expo HAS CHANGED" note),
// and returns its local uri. Any non-OK/non-PNG response is read back as
// text so the caller's error box can show real status/stage/body, never a
// blank failure.
export async function fetchShareCardPng(
  payload: ShareCardPayload & { photo: SharePhoto },
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
      try { stage = JSON.parse(text)?.stage; } catch {}
      return { ok: false, status: r.status, stage, ms, bodyPreview: text.slice(0, 120) };
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
