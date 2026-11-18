// shareStudio.ts — shared format metadata for the Share Studio screen. The
// card itself is now rendered server-side (POST /api/share-card returns a
// finished PNG - see ShareStudio.tsx and lib/shareCardPayload.ts/
// shareCardApi.ts), so this file no longer has any crop/zone/theme math -
// just the export sizes/labels the format tabs share with the payload
// builder, and the owner debug byte readout.
export type StudioFormat = "story" | "feed" | "square";
export type StudioConfidence = "estimate" | "sold-backed";

export interface Size { w: number; h: number }

// Export pixel sizes: always 1080 wide, height set by format.
export const FORMAT_SIZES: Record<StudioFormat, Size> = {
  story: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
};

export const FORMAT_LABELS: Record<StudioFormat, string> = {
  story: "Story",
  feed: "Feed",
  square: "Square",
};

// Hook presets shared between the Studio UI and studioPrefs.ts's default -
// DEFAULT_HOOK is what a first-ever open (no saved prefs yet) starts with,
// per the "hook ON by default" product decision.
export const HOOK_PRESETS = ["Would you flip it?", "Pass or buy?", "Real find, real numbers."];
export const DEFAULT_HOOK = HOOK_PRESETS[0];

// File-size readout for the owner debug line.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
