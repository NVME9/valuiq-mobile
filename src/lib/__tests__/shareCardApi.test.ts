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
    get size() { return mockFileSize; }
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
  mockGetSize.mockReset();
});

describe("normalizePhotoOrientation - the crop screen's single source of truth for natural size", () => {

  test("a portrait-PIXEL photo that is actually painted landscape (the founder's hat photo) comes back as the ORIENTED (landscape) size, not the raw pixel size", async () => {
    // Raw sensor pixels are 667x1280 (portrait) - mockManipulateAsync bakes in
    // the EXIF rotation flag and reports the PAINTED size, 1280x667
    // (landscape), exactly the founder's device screenshot's hat photo.
    mockManipulateAsync.mockResolvedValue({ uri: "file:///cache/normalized.jpg", width: 1280, height: 667 });

    const result = await normalizePhotoOrientation("file:///var/mobile/original.jpg");

    expect(result).toEqual({ uri: "file:///cache/normalized.jpg", width: 1280, height: 667 });
    // Never asked mockManipulateAsync to resize/rotate - a zero-op pass is
    // enough to bake in orientation.
    expect(mockManipulateAsync).toHaveBeenCalledWith("file:///var/mobile/original.jpg", [], { compress: 0.92, format: "jpeg" });
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

    expect(result).toEqual({ uri: "file:///var/mobile/original.jpg", width: 1000, height: 1920 });
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

    expect(result).toEqual({ uri: "file:///cache/normalized.jpg", width: 1000, height: 1920 });
    expect(mockGetSize).not.toHaveBeenCalled();
  });
});
