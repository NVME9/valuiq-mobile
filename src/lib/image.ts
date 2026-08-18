import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload, capping the LONGEST edge
 * (not just width) so a portrait phone photo (common for a quick shelf
 * snap) doesn't slip through at full size in the other dimension.
 *
 * MEASURED: identify itself is fast now (~2.4s model time, once the
 * vision call actually got a fast model + concurrency), but with multiple
 * 1600px photos in one request, upload≈8.4s dominates - a 4-photo request
 * base64-encodes to several MB over a real connection. Only ONE photo
 * actually needs full resolution for brand-tag legibility; the rest only
 * need to show item shape/condition for the model's broader identification
 * context, not resolve embroidery-level text. "primary" stays at 1600px
 * (the legibility fix - do not lower this again without a legibility
 * regression check); "secondary" drops to 1000px, which is still well
 * above typical OCR legibility thresholds for anything but the finest
 * print, while cutting that photo's payload roughly in half.
 *
 * Falls back to the original on any error.
 */
const PRIMARY_LONG_EDGE = 1600;
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
