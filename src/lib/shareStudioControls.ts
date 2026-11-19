// shareStudioControls.ts — pure state-transition helpers for ShareStudio's
// format/tab/hook/photo/color controls. Extracted so the one rule that
// matters here — switching the export format or the selected tab must never
// reset another control's already-dialed-in choice (hook/photo mode/color) —
// has a unit test independent of the component tree, same pattern as
// checkItemCard.ts/profitBanner.ts. No React, no network, no file I/O.
import {
  StudioFormat, PhotoMode, DEFAULT_PHOTO_ADJUST, clampZoom, clampFocus,
} from "./shareStudio";

export type StudioTab = "hook" | "photo" | "color" | "more";

export interface StudioControlsState {
  format: StudioFormat;
  activeTab: StudioTab;
  hook: string | null;
  handleEnabled: boolean;
  handle: string;
  hidePrice: boolean;
  photoMode: PhotoMode;
  zoom: number;
  fx: number;
  fy: number;
  accent: string | null;
}

export interface InitialControlsInput {
  hook: string | null;
  handleEnabled: boolean;
  handle: string;
  photoMode: PhotoMode;
  accent: string | null;
}

// Every fresh Studio open (or reopen with a different scan) starts back at
// format:"story" / tab:"hook" / zoom-focus centered - only hook/handleEnabled/
// handle/photoMode/accent come from the caller (persisted prefs, or a win
// variant's profit-driven hook default).
export function initialStudioControls(opts: InitialControlsInput): StudioControlsState {
  return {
    format: "story",
    activeTab: "hook",
    hook: opts.hook,
    handleEnabled: opts.handleEnabled,
    handle: opts.handle,
    hidePrice: false,
    photoMode: opts.photoMode,
    zoom: DEFAULT_PHOTO_ADJUST.zoom,
    fx: DEFAULT_PHOTO_ADJUST.fx,
    fy: DEFAULT_PHOTO_ADJUST.fy,
    accent: opts.accent,
  };
}

// FORMAT/TAB INDEPENDENCE (layout-v3 fix): changing which export format or
// which control tab is open only ever touches its own field below - never
// hook, photoMode, zoom/fx/fy, or accent. MEASURED clunky-controls bug: the
// v2 layout's single scrolling ScrollView made it easy to lose track of
// which row belonged to which state; these setters make the "switching
// tabs/format can't disturb other controls" rule explicit and testable.
export function setFormat(state: StudioControlsState, format: StudioFormat): StudioControlsState {
  return { ...state, format };
}

export function setActiveTab(state: StudioControlsState, tab: StudioTab): StudioControlsState {
  return { ...state, activeTab: tab };
}

export function setHook(state: StudioControlsState, hook: string | null): StudioControlsState {
  return { ...state, hook };
}

export function toggleHandleEnabled(state: StudioControlsState, enabled: boolean): StudioControlsState {
  return { ...state, handleEnabled: enabled };
}

export function setHandle(state: StudioControlsState, handle: string): StudioControlsState {
  return { ...state, handle };
}

export function setHidePrice(state: StudioControlsState, hidePrice: boolean): StudioControlsState {
  return { ...state, hidePrice };
}

// Switching back to Whole drops any in-progress Fill crop rather than
// silently carrying it forward unseen - same rule the component always had.
export function setPhotoMode(state: StudioControlsState, mode: PhotoMode): StudioControlsState {
  if (mode === "whole") {
    return { ...state, photoMode: mode, zoom: DEFAULT_PHOTO_ADJUST.zoom, fx: DEFAULT_PHOTO_ADJUST.fx, fy: DEFAULT_PHOTO_ADJUST.fy };
  }
  return { ...state, photoMode: mode };
}

export function resetPhotoAdjust(state: StudioControlsState): StudioControlsState {
  return { ...state, zoom: DEFAULT_PHOTO_ADJUST.zoom, fx: DEFAULT_PHOTO_ADJUST.fx, fy: DEFAULT_PHOTO_ADJUST.fy };
}

// DIRECT MANIPULATION COMMIT (v4, replaces nudgeZoom/nudgeFocus's button-tap
// steps) - applies an absolute gesture result (pan-drag's new fx/fy,
// pinch's new zoom) on gesture release. Each field is independently
// optional so a pure pan (zoom untouched) and a pure pinch (fx/fy
// untouched) can both call this same setter. Values are clamped here too
// (not just at the gesture-math call site) so this setter can never write
// an out-of-range value regardless of caller.
export function setPhotoAdjust(
  state: StudioControlsState,
  adjust: { zoom?: number; fx?: number; fy?: number }
): StudioControlsState {
  return {
    ...state,
    zoom: adjust.zoom != null ? clampZoom(adjust.zoom) : state.zoom,
    fx: adjust.fx != null ? clampFocus(adjust.fx) : state.fx,
    fy: adjust.fy != null ? clampFocus(adjust.fy) : state.fy,
  };
}

export function setAccent(state: StudioControlsState, hex: string | null): StudioControlsState {
  return { ...state, accent: hex };
}
