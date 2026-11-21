// shareCardApi.test.ts — coverage for normalizePhotoOrientation (v8, item
// 1): the fix for the founder's crop-screen bug (owner readout natural=
// 667x1280 PORTRAIT for a photo painted LANDSCAPE). The headline guarantee
// this suite exists to prove: this function's returned width/height always
// match whatever expo-image-manipulator's mockManipulateAsync says AFTER baking
// in EXIF orientation - never the raw, orientation-blind pixel size - and a
// data: URI input gets written to a cache file BEFORE mockManipulateAsync ever
// sees it (never handed the raw base64 string directly).
const mockManipulateAsync = jest.fn();
const mockFileWrite = jest.fn().mockResolvedValue(undefined);
const mockFileCreate = jest.fn();
// Byte size reported by `new File(uri).size` for whatever uri
// normalizePhotoOrientation stats (v9's tiny/corrupt-output guard) -
// defaults to "plenty big" so every pre-v9 test above keeps passing
// without caring about file size at all; tests for the v9 guard itself
// override it per-case.
let mockFileSize: number | null = 999999;
// v10, requirement 2's ratio guard needs the ORIGINAL file and the
// normalized OUTPUT file to report DIFFERENT sizes (that's the whole
// point) - keyed by uri, falling back to mockFileSize when a uri has no
// specific entry, so every pre-v10 test above keeps working unchanged.
let mockFileSizeByUri: Record<string, number> = {};

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args: any[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: any[]) {
      // normalizedFileBytes (v9) constructs `new File(existingUri)` - a
      // single string arg - to STAT an existing output; materializeDataUri
      // constructs `new File(Paths.cache, filename)` - two args - to CREATE
      // a new one. Only the former should echo its uri back (so stat reads
      // the uri the caller actually asked about).
      this.uri = parts.length === 1 && typeof parts[0] === "string" ? parts[0] : `file:///cache/normalized-${Math.random()}`;
    }
    create = mockFileCreate;
    write = mockFileWrite;
    get size() { return this.uri in mockFileSizeByUri ? mockFileSizeByUri[this.uri] : mockFileSize; }
  }
  return { File, Paths: { cache: "file:///cache" } };
});

// shareCardApi.ts's only reason to import ./api is API_BASE/SUPABASE_URL -
// stubbing it keeps this suite from pulling in the real api.ts's
// supabase/expo-apple-authentication/expo-web-browser dependency tree,
// none of which normalizePhotoOrientation touches.
jest.mock("../api", () => ({ API_BASE: "https://example.test", SUPABASE_URL: "https://supabase.example.test" }));

import { Image } from "react-native";
import { normalizePhotoOrientation, isNormalizedPhotoValid, MIN_NORMALIZED_EDGE_PX } from "../shareCardApi";

// jest-expo already mocks react-native's Image module - spying on its
// getSize (rather than jest.mock-ing the whole "react-native" module,
// which fights the preset's own native-module shims) is enough to stub the
// v9 reject-and-fall-back path's dimension probe of the ORIGINAL uri.
const mockGetSize = jest.spyOn(Image, "getSize");

// Shared across every describe block below - several of them assert
// mockGetSize's call count, which must never carry over from a PRIOR test.
beforeEach(() => {
  mockManipulateAsync.mockReset();
  mockFileWrite.mockClear();
  mockFileCreate.mockClear();
  mockFileSize = 999999;
  mockFileSizeByUri = {};
  mockGetSize.mockReset();
});

describe("normalizePhotoOrientation - the crop screen's single source of truth for natural size", () => {

  test("a portrait-PIXEL photo that is actually painted landscape (the founder's hat photo) comes back as the ORIENTED (landscape) size, not the raw pixel size", async () => {
    // Raw sensor pixels are 667x1280 (portrait) - mockManipulateAsync bakes in
    // the EXIF rotation flag and reports the PAINTED size, 1280x667
    // (landscape), exactly the founder's device screenshot's hat photo.
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 1280, height: 667 });

    const result = await normalizePhotoOrientation("file:///var/mobile/original.jpg");

    expect(result).toEqual({ uri: "file:///cache/normalized.jpg", width: 1280, height: 667, bytes: 999999, usedOriginal: false });
    // Never asked mockManipulateAsync to resize/rotate - a zero-op pass is
    // enough to bake in orientation.
    expect(mockManipulateAsync).toHaveBeenCalledWith("file:///var/mobile/original.jpg", [], { compress: 0.92, format: "jpeg" });
  });

  // v10, requirement 1 - the onStage instrumentation callback: every stage
  // this function goes through, for a caller (ShareStudio.tsx) to fold into
  // the owner readout.
  test("reports every stage through onStage - source bytes, the manipulate result, and the valid verdict", async () => {
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 1280, height: 667 });
    const stages: string[] = [];

    await normalizePhotoOrientation("file:///var/mobile/original.jpg", (line) => stages.push(line));

    expect(stages).toEqual([
      "original: bytes=999999",
      "manipulate: 1280x667 bytes=999999",
      "valid: true",
    ]);
  });

  test("a data: URI is written to a cache file FIRST - mockManipulateAsync is never handed the raw base64 string", async () => {
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 1280, height: 667 });
    const dataUri = `data:image/jpeg;base64,${"QQ==".repeat(1000)}`;

    await normalizePhotoOrientation(dataUri);

    expect(mockFileCreate).toHaveBeenCalledWith({ overwrite: true, intermediates: true });
    expect(mockFileWrite).toHaveBeenCalledWith(expect.any(String), { encoding: "base64" });
    const [calledUri] = mockManipulateAsync.mock.calls[0];
    expect(calledUri).not.toContain("base64");
    expect(calledUri.startsWith("file://")).toBe(true);
  });

  test("a file:// URI is passed straight through to mockManipulateAsync with no materialization", async () => {
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 800, height: 600 });

    await normalizePhotoOrientation("file:///var/mobile/original.jpg");

    expect(mockFileWrite).not.toHaveBeenCalled();
    expect(mockManipulateAsync).toHaveBeenCalledWith("file:///var/mobile/original.jpg", [], expect.any(Object));
  });
});

describe("isNormalizedPhotoValid - the v9 tiny/corrupt-output guard", () => {
  test("rejects a result whose width is under the minimum edge", () => {
    expect(isNormalizedPhotoValid(MIN_NORMALIZED_EDGE_PX - 1, 1000, null)).toBe(false);
  });

  test("rejects a result whose height is under the minimum edge", () => {
    expect(isNormalizedPhotoValid(1000, MIN_NORMALIZED_EDGE_PX - 1, null)).toBe(false);
  });

  test("rejects a result backed by a suspiciously tiny file even though width/height look fine", () => {
    // The founder device bug: manipulateAsync's returned {width,height} is
    // read off the JPEG header, which survives a truncated/corrupt write -
    // a real re-encode at quality 0.92 is never this small.
    expect(isNormalizedPhotoValid(1000, 1920, 200)).toBe(false);
  });

  test("accepts a plausible real photo with no way to check file size (remote/data: uri)", () => {
    expect(isNormalizedPhotoValid(1000, 1920, null)).toBe(true);
  });

  test("accepts a plausible real photo with a plausible file size", () => {
    expect(isNormalizedPhotoValid(1000, 1920, 250000)).toBe(true);
  });
});

describe("normalizePhotoOrientation - v9 reject-and-fall-back-to-original (founder device: blurry brown smudge)", () => {
  test("a tiny decoded size is rejected - falls back to the ORIGINAL uri, probed via Image.getSize, never the bad decode's own dimensions", async () => {
    // manipulateAsync reports a technically-valid-looking result, but one
    // of its edges is under the floor - e.g. a truncated write that still
    // has enough header bytes to report SOME size.
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 120, height: 80 });
    mockGetSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(1000, 1920));

    const result = await normalizePhotoOrientation("file:///var/mobile/original.jpg");

    expect(result).toEqual({ uri: "file:///var/mobile/original.jpg", width: 1000, height: 1920, bytes: 999999, usedOriginal: true });
    expect(mockGetSize).toHaveBeenCalledWith("file:///var/mobile/original.jpg", expect.any(Function), expect.any(Function));
  });

  test("a suspiciously tiny output FILE is rejected even though its reported width/height look fine", async () => {
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 1000, height: 1920 });
    mockFileSize = 200; // a truncated/corrupt write - far smaller than any real q0.92 re-encode
    mockGetSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(1000, 1920));

    const result = await normalizePhotoOrientation("file:///var/mobile/original.jpg");

    expect(result.uri).toBe("file:///var/mobile/original.jpg"); // NOT the rejected file:///cache/normalized.jpg
  });

  test("a valid, plausibly-sized output is kept as-is - Image.getSize is never consulted", async () => {
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 1000, height: 1920 });
    mockFileSize = 250000;

    const result = await normalizePhotoOrientation("file:///var/mobile/original.jpg");

    expect(result).toEqual({ uri: "file:///cache/normalized.jpg", width: 1000, height: 1920, bytes: 250000, usedOriginal: false });
    expect(mockGetSize).not.toHaveBeenCalled();
  });
});

// v10, requirement 2 - the AUTOMATIC fallback (no tap needed): a normalize
// result that's technically valid by the old (edge/absolute-size) rules
// alone, but is still a tiny fraction of the ORIGINAL's own byte size, when
// that original was substantial. Generalizes the founder's "Studio photo
// shrunk to 3x6" repro - a thumbnail-grade source standing in for the full
// photo - beyond just "under 300px."
describe("isNormalizedPhotoValid - v10 ratio guard (normalized output vs the ORIGINAL's own size)", () => {
  test("rejects a normalized output under 25% of a substantial (>300KB) original's size", () => {
    const originalBytes = 400 * 1024; // 400KB original
    const normalizedBytes = 50 * 1024; // 50KB output - 12.5% of the original
    expect(isNormalizedPhotoValid(1000, 1920, normalizedBytes, originalBytes)).toBe(false);
  });

  test("accepts a normalized output at/above 25% of a substantial original's size", () => {
    const originalBytes = 400 * 1024;
    const normalizedBytes = 120 * 1024; // 30% of the original
    expect(isNormalizedPhotoValid(1000, 1920, normalizedBytes, originalBytes)).toBe(true);
  });

  test("never applies the ratio check when the original itself was small (<=300KB)", () => {
    const originalBytes = 200 * 1024; // 200KB original - genuinely small to begin with
    const normalizedBytes = 10 * 1024; // 5% of the original, but nothing's wrong here
    expect(isNormalizedPhotoValid(1000, 1920, normalizedBytes, originalBytes)).toBe(true);
  });

  test("never applies the ratio check when originalBytes is unknown (remote/data: uri with no local stat)", () => {
    expect(isNormalizedPhotoValid(1000, 1920, 10 * 1024, null)).toBe(true);
  });
});

describe("normalizePhotoOrientation - v10 ratio guard wired end to end", () => {
  test("a valid-dimension output that's still a fraction of a substantial original falls back to the original automatically, no tap needed", async () => {
    const originalUri = "file:///var/mobile/original.jpg";
    const outputUri = "file:///cache/normalized.jpg";
    // Original is a real 480KB photo (the founder's "Use original" repro).
    mockFileSizeByUri[originalUri] = 480 * 1024;
    // Output passes the old edge/absolute-size checks (1000x1920, not
    // microscopic) but is only 50KB - 10% of the 480KB original.
    mockFileSizeByUri[outputUri] = 50 * 1024;
    mockManipulateAsync.mockResolvedValue({ uri: outputUri, width: 1000, height: 1920 });
    mockGetSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(1000, 1920));

    const result = await normalizePhotoOrientation(originalUri);

    expect(result?.usedOriginal).toBe(true);
    expect(result?.uri).toBe(originalUri);
  });
});

// v10 ROOT-CAUSE FIX - see shareCardApi.ts's normalizePhotoOrientation
// header comment: the fallback probe (Image.getSize on the ORIGINAL uri)
// used to be unguarded, so its rejection propagated straight out of this
// function - which ShareStudio.tsx's `.catch(() => setNormalizedPhoto(null))`
// then swallowed into a PERMANENT null indistinguishable from "still
// normalizing" (the founder device's "natural=—"). This function must never
// throw; the ONLY way to land in the error state is this resolved null.
describe("normalizePhotoOrientation - v10 never throws, even when BOTH the manipulate attempt and the original-uri fallback fail", () => {
  test("manipulateAsync throwing AND the fallback Image.getSize rejecting resolves to null, never an unhandled rejection", async () => {
    mockManipulateAsync.mockRejectedValue(new Error("native module crashed"));
    mockGetSize.mockImplementation((_uri: string, _success: any, failure: (e: any) => void) => failure(new Error("bridge message too large")));

    const result = await normalizePhotoOrientation("data:image/jpeg;base64,/9j/4AAQSkZJRg==");

    expect(result).toBeNull();
  });

  test("a rejecting fallback is still reported via onStage, not silently dropped", async () => {
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 10, height: 10 }); // rejected on edge size
    mockGetSize.mockImplementation((_uri: string, _success: any, failure: (e: any) => void) => failure(new Error("bridge message too large")));
    const stages: string[] = [];

    const result = await normalizePhotoOrientation("file:///var/mobile/original.jpg", (line) => stages.push(line));

    expect(result).toBeNull();
    expect(stages.some((s) => s.includes("fallback getImageSize: failed"))).toBe(true);
  });
});
