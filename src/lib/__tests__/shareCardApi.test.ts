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

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args: any[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = `file:///cache/normalized-${Math.random()}`;
    }
    create = mockFileCreate;
    write = mockFileWrite;
  }
  return { File, Paths: { cache: "file:///cache" } };
});

// shareCardApi.ts's only reason to import ./api is API_BASE/SUPABASE_URL -
// stubbing it keeps this suite from pulling in the real api.ts's
// supabase/expo-apple-authentication/expo-web-browser dependency tree,
// none of which normalizePhotoOrientation touches.
jest.mock("../api", () => ({ API_BASE: "https://example.test", SUPABASE_URL: "https://supabase.example.test" }));

import { normalizePhotoOrientation } from "../shareCardApi";

describe("normalizePhotoOrientation - the crop screen's single source of truth for natural size", () => {
  beforeEach(() => {
    mockManipulateAsync.mockReset();
    mockFileWrite.mockClear();
    mockFileCreate.mockClear();
  });

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
