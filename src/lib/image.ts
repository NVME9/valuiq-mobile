import * as ImageManipulator from "expo-image-manipulator";

/**
 * Resize + compress a base64 image before upload, capping the LONGEST edge
 * (not just width) so a portrait phone photo (common for a quick shelf
 * snap) doesn't slip through at full size in the other dimension.
 *
 * RESOLVED IN FAVOR OF LEGIBILITY, NOT SPEED: a prior version of this
 * function dropped to 768px specifically to cut the vision model's image-
 * token cost after identify measured 6s+ on real photos. But 768px is too
 * aggressive for reading small embroidered/printed brand text (exactly the
 * "Columbia PFG" patch problem this exists to solve) - a fast scan with
 * the wrong brand is worthless, since brand is the #1 pricing signal. Speed
 * is addressed via model tier (Haiku, already the fastest Claude vision
 * tier) and concurrency (identify/comps/narrative already run in parallel
 * where they can - see deal-ai-pro app/api/lens/route.ts), NOT by starving
 * the vision model of the pixels it needs to read a tag. 1600px longest
 * edge is the new target; if brand extraction is still missing a clearly-
 * legible-to-the-eye patch at 1600px, go to 2048px next - accuracy wins
 * over the marginal latency cost either way.
 *
 * Falls back to the original on any error.
 */
const IDENTIFY_LONG_EDGE = 1600;

export async function compressPhoto(base64: string, origWidth?: number, origHeight?: number): Promise<string> {
  try {
    const isPortrait = !!origWidth && !!origHeight && origHeight > origWidth;
    const resizeAction = isPortrait ? { resize: { height: IDENTIFY_LONG_EDGE } } : { resize: { width: IDENTIFY_LONG_EDGE } };
    const out = await ImageManipulator.manipulateAsync(
      `data:image/jpeg;base64,${base64}`,
      [resizeAction],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return out.base64 || base64;
  } catch {
    return base64;
  }
}
