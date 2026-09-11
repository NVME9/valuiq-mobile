import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload, capping the LONGEST edge
 * (not just width) so a portrait phone photo (common for a quick shelf
 * snap) doesn't slip through at full size in the other dimension.
 *
 * PRIMARY 1600px -> 1200px (2026-09-11, MEASURED against Anthropic's own
 * documented vision limits): Claude Haiku (Standard tier) caps an image at
 * 1568 visual tokens (⌈w/28⌉x⌈h/28⌉) - a 3:4 portrait photo hits that cap
 * around ~938x1250px. A 1600px-long-edge primary (1200x1600, 2494 tokens)
 * EXCEEDS the cap and gets silently downscaled by Anthropic to ~952x1269
 * (1564 tokens) before the model ever sees it - so every pixel between
 * ~1250px and 1600px was pure upload/decode cost for zero fidelity gain,
 * every single scan. 1200px (900x1200, 1419 tokens) stays under the cap -
 * sent at FULL resolution, no server-side downscale - while being within
 * ~9% of the token budget Claude already effectively used at 1600px. Net:
 * same effective resolution reaching the model, meaningfully smaller
 * upload. Do not push below ~1200px without a legibility regression check
 * (1000px/972 tokens is a real ~38% cut from the 1600px-era effective
 * resolution, not fidelity-neutral like 1200px is - see the identifyMs
 * latency investigation this change came out of for the full token math).
 *
 * "secondary" stays at 1000px (750x1000, 972 tokens - already comfortably
 * under the 1568-token cap, nothing to gain there) and 0.75 quality -
 * still well above typical OCR legibility thresholds for anything but the
 * finest print, while its payload is already a fraction of primary's.
 *
 * Falls back to the original on any error.
 */
const PRIMARY_LONG_EDGE = 1200;
const SECONDARY_LONG_EDGE = 1000;

export type PhotoRole = "primary" | "secondary";

export async function compressPhoto(base64: string, origWidth?: number, origHeight?: number, role: PhotoRole = "primary"): Promise<string> {
  try {
    const longEdge = role === "primary" ? PRIMARY_LONG_EDGE : SECONDARY_LONG_EDGE;
    const isPortrait = !!origWidth && !!origHeight && origHeight > origWidth;
    const resizeAction = isPortrait ? { resize: { height: longEdge } } : { resize: { width: longEdge } };
    const out = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      [resizeAction],
      { compress: role === "primary" ? 0.85 : 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return out.base64 || base64;
  } catch {
    return base64;
  }
}
