import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload.
 * Cuts payload ~5x (faster uploads + faster AI analysis) with no meaningful
 * loss in recognition accuracy. Falls back to the original on any error.
 */
export async function compressPhoto(base64: string): Promise<string> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      [{ resize: { width: 1024 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return out.base64 || base64;
  } catch {
    return base64;
  }
}