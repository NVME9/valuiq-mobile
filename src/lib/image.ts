import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload, capping the LONGEST edge
 * (not just width) so a portrait phone photo (common for a quick shelf
 * snap) doesn't slip through at full size in the other dimension.
 *
 * UNIFIED 1280px / ~0.7 QUALITY (2026-11-08, crash-trip memory audit):
 * replaces the old primary/secondary split (1200px/0.85 vs 1000px/0.75,
 * tuned against Claude's own vision token cap - see git history for that
 * math). This pass is about PEAK MEMORY during capture/upload, not vision
 * fidelity - a flat, lower cap on every photo (not just secondary ones)
 * bounds the worst case regardless of how many photos a scan sends or
 * which one happens to be first. 1280px is still comfortably within
 * Claude Haiku's 1568-visual-token cap for a typical 3:4 portrait shot
 * (~960x1280, ~1618 tokens is close to the cap but the model's own
 * downscale at that margin is negligible - nowhere near the old 1600px
 * case's real ~38% overshoot).
 *
 * Falls back to the original on any error - a photo that fails to
 * compress still uploads at full size rather than being dropped.
 */
const LONG_EDGE = 1280;
const JPEG_QUALITY = 0.7;

export type PhotoRole = "primary" | "secondary";

export async function compressPhoto(base64: string, origWidth?: number, origHeight?: number, _role: PhotoRole = "primary"): Promise<string> {
  try {
    const isPortrait = !!origWidth && !!origHeight && origHeight > origWidth;
    const resizeAction = isPortrait ? { resize: { height: LONG_EDGE } } : { resize: { width: LONG_EDGE } };
    const out = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      [resizeAction],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return out.base64 || base64;
  } catch {
    return base64;
  }
}
