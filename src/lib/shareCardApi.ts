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
//
// v10, requirement 3 ("payload must match the crop screen's photo"): tries
// 1400px first, same as before, but if THAT still lands over
// PAYLOAD_MAX_BYTES it steps the long edge down (1200, then 1000 - never
// lower, per requirement 3's "long edge at least 1000px unless the original
// is smaller") at the SAME quality (0.85 - requirement 3 forbids trading
// quality away to hit the budget). A photo that's still too big at 1000px/
// 0.85 ships at 1000px anyway - the floor wins over the budget.
const LONG_EDGE_STEPS = [1400, 1200, 1000];
const MIN_LONG_EDGE_FLOOR = 1000;
const JPEG_QUALITY = 0.85;
const PAYLOAD_MAX_BYTES = 4 * 1024 * 1024;
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
  // v10, requirement 1 - the on-disk/base64 byte size backing `uri`, null
  // for a remote uri or when the probe itself failed. Lets a caller show
  // (and the ratio guard below compare) real bytes, not just a dimension.
  bytes: number | null;
  // v10, requirement 2 - true when this is the ORIGINAL photo (the
  // oriented re-encode was rejected, or manipulation/materialization threw
  // outright) rather than the freshly oriented output.
  usedOriginal: boolean;
}

// v9 - REJECT A BAD NORMALIZATION OUTPUT (founder device: owner readout
// showed frame positioned correctly and a plausible natural=1000x1920, but
// the crop screen painted a blurry brown smudge instead of the hat photo -
// while the SAME photo rendered sharp in the server-side card preview).
// manipulateAsync's returned {width,height} is read straight off the output
// JPEG's header, which survives even when the actual scan data after it is
// tiny/truncated/corrupt (a bad write to the materialized cache file, a
// starved disk, etc.) - so the header alone can't prove the pixels are
// real. A real re-encoded photo (quality 0.92) is always far bigger than a
// few KB, and this app never deals in sub-300px source photos, so a result
// landing under either bar is treated as untrustworthy and discarded by
// normalizePhotoOrientation below, which falls back to the ORIGINAL uri -
// never to a different decode's dimensions.
export const MIN_NORMALIZED_EDGE_PX = 300;
const MIN_NORMALIZED_FILE_BYTES = 4096;
// v10, requirement 2 (AUTOMATIC fallback, no tap needed) - founder device:
// a technically-valid-looking normalize (edges >=300, file not microscopic)
// that is STILL a fraction of the original's own byte size - the "Studio
// photo shrunk to 3x6" repro's general shape, a thumbnail-grade source
// quietly standing in for the full photo. Only applies once the original
// itself was substantial (a genuinely small original has nothing wrong with
// also producing a small, honest re-encode).
export const MIN_NORMALIZED_RATIO = 0.25;
export const RATIO_CHECK_MIN_ORIGINAL_BYTES = 300 * 1024;

export function isNormalizedPhotoValid(
  width: number, height: number, bytes: number | null,
  originalBytes: number | null = null
): boolean {
  if (!(width >= MIN_NORMALIZED_EDGE_PX) || !(height >= MIN_NORMALIZED_EDGE_PX)) return false;
  if (bytes != null && bytes < MIN_NORMALIZED_FILE_BYTES) return false;
  if (
    bytes != null && originalBytes != null &&
    originalBytes > RATIO_CHECK_MIN_ORIGINAL_BYTES &&
    bytes < originalBytes * MIN_NORMALIZED_RATIO
  ) return false;
  return true;
}

// Reads the normalized output's actual on-disk size via SDK 54's File class
// (see AGENTS.md's "Expo HAS CHANGED" note - the legacy FileSystem.
// getInfoAsync this app used pre-54 is gone from the default import).
// Returns null (never throws) for anything that isn't a local file - a
// remote/data: uri has no local byte count to read, and the caller treats
// "unknown" as "can't disprove it," not as a reason to reject.
function normalizedFileBytes(uri: string): number | null {
  if (!FileSystem || !uri.startsWith("file://")) return null;
  try {
    return (new (FileSystem as any).File(uri)).size ?? null;
  } catch {
    return null;
  }
}

// v10, requirement 1/2 - byte size of ANY photo uri (data: or file://),
// used to probe the ORIGINAL before normalization touches it, so the ratio
// guard above has something real to compare the normalized output against.
// null (never throws) for a remote uri or a failed stat - "unknown," not a
// reason to reject.
function photoByteSize(uri: string): number | null {
  if (uri.startsWith("data:")) {
    const match = /^data:[^;,]+;base64,([\s\S]*)$/.exec(uri);
    return match ? estimateBase64Bytes(match[1]) : null;
  }
  return normalizedFileBytes(uri);
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
// v10 ROOT-CAUSE FIX (founder device: owner readout natural=— decoded=3x6 -
// the crop screen and the share payload both silently painted a degraded
// photo with NO error shown): this function used to let the fallback probe
// below (Image.getSize on the ORIGINAL uri) throw straight out of the
// function. A large original photo is a sizeable base64 string, and
// Image.getSize on some devices/platforms can reject on exactly that (the
// same native-bridge-size concern materializeDataUri's own comment already
// documents for manipulateAsync) - when it did, the rejection propagated
// out of normalizePhotoOrientation uncaught, and ShareStudio.tsx's
// `.catch(() => setNormalizedPhoto(null))` swallowed it into a PERMANENT
// null that looks identical to "still normalizing" (natural=—) - so
// `effectiveNormalizedPhoto` stayed null for the rest of the session and
// every caller quietly fell through to whatever degraded bytes were sitting
// in photoBase64/photoUri (here, nothing new was ever retried - natural=—,
// decoded=3x6). Fixed by never letting ANY step throw out of this function:
// both the manipulate attempt and the fallback probe are now individually
// guarded, each stage is reported via `onStage` (requirement 1's
// instrumentation), and only when BOTH genuinely fail does this resolve to
// null - the one case PhotoCropScreen's own "Use original" error state is
// still for (requirement 2's last sentence).
export async function normalizePhotoOrientation(
  uri: string,
  onStage?: (line: string) => void
): Promise<NormalizedPhoto | null> {
  const log = onStage || (() => {});
  let originalBytes: number | null = null;
  try { originalBytes = photoByteSize(uri); } catch { originalBytes = null; }
  log(`original: bytes=${originalBytes ?? "—"}`);

  let srcUri = uri;
  try {
    srcUri = await materializeDataUri(uri);
  } catch (e: any) {
    log(`materialize: failed (${String(e?.message || e)}) - using raw uri`);
    srcUri = uri;
  }

  try {
    const out = await ImageManipulator.manipulateAsync(srcUri, [], {
      compress: 0.92, format: ImageManipulator.SaveFormat.JPEG,
    });
    const outBytes = normalizedFileBytes(out.uri);
    log(`manipulate: ${out.width}x${out.height} bytes=${outBytes ?? "—"}`);
    if (isNormalizedPhotoValid(out.width, out.height, outBytes, originalBytes)) {
      log("valid: true");
      return { uri: out.uri, width: out.width, height: out.height, bytes: outBytes, usedOriginal: false };
    }
    log("valid: false - falling back to original");
  } catch (e: any) {
    log(`manipulate: failed (${String(e?.message || e)}) - falling back to original`);
  }

  // REJECTED/FAILED - fall back to the ORIGINAL uri (never the materialized
  // srcUri, which can carry the same bad write) and probe ITS dimensions
  // independently via Image.getSize, so the crop screen and the payload
  // both end up painting the same real photo instead of the broken file.
  // GUARDED (the actual v10 fix - see header comment): a failure here no
  // longer propagates out of this function.
  try {
    const size = await getImageSize(uri);
    log(`fallback getImageSize: ${size.width}x${size.height}`);
    return { uri, width: size.width, height: size.height, bytes: originalBytes, usedOriginal: true };
  } catch (e: any) {
    log(`fallback getImageSize: failed (${String(e?.message || e)})`);
    return null;
  }
}

export interface DownscaledPhoto {
  base64: string;
  width: number;
  height: number;
}

// Downscales ONLY when the photo's longest edge actually exceeds the
// current step's target (never upscales a smaller photo) - probes the real
// dimensions first (Image.getSize works on a data: URI same as a file one)
// so a photo that's already small just gets re-encoded at the target
// quality, no resize action. Throws on any failure - the caller decides the
// fallback (see resolveSharePhoto below).
//
// v10, requirement 3: steps the long edge down (LONG_EDGE_STEPS) at a FIXED
// 0.85 quality until the result fits PAYLOAD_MAX_BYTES or hits the 1000px
// floor - never trades quality for size, never goes below 1000px (or the
// original's own size, if that's smaller to begin with).
async function downscalePhoto(base64Raw: string): Promise<DownscaledPhoto> {
  const src = `data:image/jpeg;base64,${base64Raw}`;
  const { width, height } = await getImageSize(src);
  return downscaleToStep(src, width, height);
}

// Same downscale budget as downscalePhoto above, but starting from an
// already-normalized {uri, width, height} (v8, item 1) - no Image.getSize
// probe needed, since the caller's width/height ALREADY agree with how the
// photo paints (that's the whole point of normalizePhotoOrientation).
async function downscaleFromNormalized(uri: string, width: number, height: number): Promise<DownscaledPhoto> {
  return downscaleToStep(uri, width, height);
}

async function downscaleToStep(src: string, width: number, height: number): Promise<DownscaledPhoto> {
  const longEdge = Math.max(width, height);
  let last: { base64: string; width: number; height: number } | null = null;
  for (const target of LONG_EDGE_STEPS) {
    const actions = longEdge > target
      ? [width >= height ? { resize: { width: target } } : { resize: { height: target } }]
      : [];
    const out = await ImageManipulator.manipulateAsync(src, actions, {
      compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true,
    });
    if (!out.base64) throw new Error("manipulateAsync produced no base64");
    last = { base64: out.base64, width: out.width, height: out.height };
    if (estimateBase64Bytes(out.base64) <= PAYLOAD_MAX_BYTES || target <= MIN_LONG_EDGE_FLOOR) {
      return last;
    }
  }
  return last as DownscaledPhoto;
}

// Shared with ShareStudio.tsx so it knows NOT to bother normalizing a photo
// that's already a remote asset on our own Storage host (no local pixels to
// normalize - see resolveSharePhoto's {url} passthrough branch below).
export function isRemoteShareUrl(uri: string | null): boolean {
  return !!uri && /^https?:\/\//i.test(uri) && uri.startsWith(`${SUPABASE_URL}/storage/`);
}

export type SharePhoto = { base64: string } | { url: string };

// v10, requirement 3 - the payload's own resolved pixel size travels
// alongside `photo` (NOT inside it - `photo` is sent to the server
// verbatim, see fetchShareCardPng, so it never carries debug-only fields),
// so a caller can compare it against the crop screen's `natural` for the
// "crop-screen vs payload" readout line. null width/height for a {url}
// photo (no local pixels resolved) or the rare total-failure last resort.
export type ResolvePhotoResult =
  | { photo: SharePhoto; width: number | null; height: number | null }
  | { error: string };

// Owner-readout ONLY (v9, requirement 1's `payload=`) - a short label for
// whatever resolveSharePhoto actually resolved to, so a repro can compare
// it against the crop screen's own src=/natural= on the same screen instead
// of trusting that the two code paths used the same bytes.
export function describeSharePhoto(result: ResolvePhotoResult | null): string {
  if (!result || "error" in result) return "none";
  const photo = result.photo;
  if ("url" in photo) return `url:${photo.url.slice(-30)}`;
  const dims = result.width != null && result.height != null ? `${result.width}x${result.height} ` : "";
  return `base64 ${dims}(${(estimateBase64Bytes(photo.base64) / 1024).toFixed(0)}KB)`;
}

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
    return { photo: { url: photoUri as string }, width: null, height: null };
  }
  if (normalized) {
    try {
      const { base64, width, height } = await downscaleFromNormalized(normalized.uri, normalized.width, normalized.height);
      return { photo: { base64 }, width, height };
    } catch {
      // fall through to the legacy raw-bytes path below as a last resort
    }
  }
  const raw = photoBase64
    ? stripDataUriPrefix(photoBase64)
    : (photoUri && /^data:image\//i.test(photoUri) ? stripDataUriPrefix(photoUri) : null);
  if (!raw) return { error: "No photo available to share." };

  try {
    const { base64, width, height } = await downscalePhoto(raw);
    return { photo: { base64 }, width, height };
  } catch {
    // Manipulation itself threw - fall back to the ORIGINAL bytes, still
    // capped so a huge, un-shrunk photo never ships either way.
    if (estimateBase64Bytes(raw) > LOCAL_PHOTO_MAX_BYTES) {
      return { error: "That photo is too large to share (over 5 MB)." };
    }
    let width: number | null = null, height: number | null = null;
    try {
      const size = await getImageSize(`data:image/jpeg;base64,${raw}`);
      width = size.width; height = size.height;
    } catch {
      // last-resort dims probe failed too - owner readout just shows "—"
    }
    return { photo: { base64: raw }, width, height };
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
