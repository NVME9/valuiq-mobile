import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload, capping the LONGEST edge
 * (not just width) so a portrait phone photo (common for a quick shelf
 * snap) doesn't slip through at full size in the other dimension.
 *
 * UNIFIED 1280px / 0.6 QUALITY, 300KB TARGET (2026-11-14, honest-scan-
 * progress item 2 - replaces the 2026-11-08 1280px/0.7 pass): a fast-WiFi
 * scan was still sitting on "Uploading your photos" for the whole wait
 * because the payload itself was bigger than it needed to be - this drops
 * quality one notch further and, when a single compress pass still lands
 * over TARGET_BYTES (a busy/high-detail shot that compresses less), retries
 * at progressively lower quality rather than shipping whatever the first
 * pass produced. Still falls back to the original on any error - a photo
 * that fails to compress still uploads at full size rather than being
 * dropped.
 */
const LONG_EDGE = 1280;
const JPEG_QUALITY = 0.6;
const QUALITY_RETRIES = [0.45, 0.3];
const TARGET_BYTES = 300 * 1024;

// Base64 has no padding-aware exactness needed here - a rough estimate is
// plenty to decide "try again at lower quality," never used for anything
// billed or reported as exact.
function estimateBytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

export type PhotoRole = "primary" | "secondary";

export async function compressPhoto(base64: string, origWidth?: number, origHeight?: number, _role: PhotoRole = "primary"): Promise<string> {
  try {
    const isPortrait = !!origWidth && !!origHeight && origHeight > origWidth;
    const resizeAction = isPortrait ? { resize: { height: LONG_EDGE } } : { resize: { width: LONG_EDGE } };
    const src = `data:image/jpeg;base64,${base64}`;
    const out = await ImageManipulator.manipulateAsync(
      src,
      [resizeAction],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    let best = out.base64 || base64;
    for (let i = 0; i < QUALITY_RETRIES.length && estimateBytes(best) > TARGET_BYTES; i++) {
      try {
        const retry = await ImageManipulator.manipulateAsync(
          src,
          [resizeAction],
          { compress: QUALITY_RETRIES[i], format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (retry.base64) best = retry.base64;
      } catch {
        break;
      }
    }
    return best;
  } catch {
    return base64;
  }
}
