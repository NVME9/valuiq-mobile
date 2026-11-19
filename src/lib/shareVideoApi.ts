// shareVideoApi.ts — the "Make video" network call: POST the same body
// shape /api/share-card takes (see lib/shareCardPayload.ts's
// buildShareVideoPayload, format always forced to "story") to
// /api/share-video and get back a finished MP4, written to a cache file via
// SDK 54's expo-file-system File class (AGENTS.md's "Expo HAS CHANGED"
// note) - same download-to-cache-file convention shareCardApi.ts's
// fetchShareCardPng already uses for the PNG. Not pure (network + file I/O).
import { API_BASE } from "./api";
import { ShareCardPayload } from "./shareCardPayload";
import { SharePhoto } from "./shareCardApi";

let FileSystem: typeof import("expo-file-system") | null = null;
try { FileSystem = require("expo-file-system"); } catch { FileSystem = null; }

// Server-side video rendering is the slowest render this app makes - the
// button's own copy says "up to 20 s", so a client-side abort at 30s (well
// past that) is purely a crash-proofing ceiling against a genuinely hung
// request, never expected to fire on a healthy server.
const VIDEO_TIMEOUT_MS = 30000;

export interface ShareVideoFetchResult {
  ok: boolean;
  uri?: string;
  size?: number;
  status?: number;
  stage?: string;
  ms: number;
  bodyPreview?: string;
}

export async function fetchShareVideoMp4(
  payload: ShareCardPayload & { photo: SharePhoto },
  token: string | null,
  signal: AbortSignal
): Promise<ShareVideoFetchResult> {
  const t0 = Date.now();
  const timeoutController = new AbortController();
  const onAbort = () => timeoutController.abort();
  signal.addEventListener("abort", onAbort);
  const timeoutId = setTimeout(() => timeoutController.abort(), VIDEO_TIMEOUT_MS);
  try {
    const r = await fetch(`${API_BASE}/api/share-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, userToken: token || undefined }),
      signal: timeoutController.signal,
    });
    const ms = Date.now() - t0;
    const contentType = r.headers.get("content-type") || "";
    if (!r.ok || !contentType.includes("video/mp4")) {
      const text = await r.text().catch(() => "");
      let stage: string | undefined;
      try { stage = JSON.parse(text)?.stage; } catch {}
      return { ok: false, status: r.status, stage, ms, bodyPreview: text.slice(0, 120) };
    }
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (!FileSystem) return { ok: false, ms, stage: "file-system-unavailable" };
    const file = new (FileSystem as any).File((FileSystem as any).Paths.cache, `share-video-${Date.now()}.mp4`);
    file.create({ overwrite: true, intermediates: true });
    await file.write(bytes);
    return { ok: true, uri: file.uri, size: bytes.length, ms };
  } catch (e: any) {
    const ms = Date.now() - t0;
    if (timeoutController.signal.aborted && !signal.aborted) return { ok: false, ms, stage: "timeout" };
    if (e?.name === "AbortError") return { ok: false, ms, stage: "aborted" };
    return { ok: false, ms, stage: "network", bodyPreview: String(e?.message || e).slice(0, 120) };
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", onAbort);
  }
}
