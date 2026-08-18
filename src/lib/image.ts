import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload, capping the LONGEST edge
 * (not just width) at ~1024px so a portrait phone photo (common for a quick
 * shelf snap) doesn't slip through at ~1024x1365+. Real phone photos run
 * 3-5MB at full resolution; this is the single biggest lever on both upload
 * time and the vision model's own processing time for the identify call,
 * with no meaningful loss in recognition accuracy at 1024px/80% quality.
 * Falls back to the original on any error.
 */
export async function compressPhoto(base64: string, origWidth?: number, origHeight?: number): Promise<string> {
  try {
    const isPortrait = !!origWidth && !!origHeight && origHeight > origWidth;
    const resizeAction = isPortrait ? { resize: { height: 1024 } } : { resize: { width: 1024 } };
    const out = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      [resizeAction],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return out.base64 || base64;
  } catch {
    return base64;
  }
}
