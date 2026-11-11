// startupErrorTrap.ts — DIAGNOSTIC (2026-11-11, OTA crash incident).
//
// MUST be require()'d first, before anything else in index.ts evaluates -
// see that file's own comment. Static analysis found no missing native
// module and no module-scope throw in the two commits that crashed build
// 46 (SIGABRT via expo-updates ErrorRecovery re-raising a fatal JS error,
// 0.3-1.6s after launch - see this incident's own diagnosis). This
// instruments the actual exception instead of guessing again: for 15
// seconds after this module loads (effectively "launch"), every error
// (fatal or not) reaching React Native's global error handler is recorded,
// and a FATAL one is swallowed instead of forwarded to the original
// handler - so the native abort this is trying to observe never actually
// happens, and the app survives long enough to report what it caught.
// After 15s the original handler is fully restored; this is a one-time
// diagnostic window, never a permanent change to how errors are handled.
//
// Every single thing in this file is wrapped in try/catch - a trap that
// can itself throw during the exact window it's watching would be worse
// than no trap at all.
const STARTUP_WINDOW_MS = 15000;
const STORAGE_KEY = "lastStartupError";
// Separate from STORAGE_KEY on purpose: App.tsx's init() reports STORAGE_KEY
// through logClientError and clears it almost immediately on every launch
// (so a startup error is never double-reported), which would otherwise
// race the Profile footer's Debug row empty well before a user could ever
// navigate there and see it. This copy is never cleared by that report -
// only ever overwritten by the NEXT startup error - so it's what the
// Profile screen reads.
const ARCHIVE_KEY = "lastStartupErrorArchive";
const loadedAt = Date.now();

export interface StartupError {
  message: string;
  name: string;
  stack: string; // first 15 lines only
  isFatal: boolean;
  updateId: string | null;
  isEmbeddedLaunch: boolean | null;
  timestamp: number;
}

// Fallback store - the one copy guaranteed to exist if AsyncStorage itself
// is what fails (the trap can't only depend on the thing it's working
// around actually being healthy).
let fallbackError: StartupError | null = null;

export function getFallbackStartupError(): StartupError | null {
  return fallbackError;
}

function firstLines(stack: unknown, n: number): string {
  if (typeof stack !== "string" || !stack) return "";
  return stack.split("\n").slice(0, n).join("\n");
}

function buildRecord(error: any, isFatal: boolean): StartupError {
  let updateId: string | null = null;
  let isEmbeddedLaunch: boolean | null = null;
  try {
    // Deferred require, not a top-level import - expo-updates must never
    // be the thing that makes THIS file throw.
    const Updates = require("expo-updates");
    updateId = Updates && typeof Updates.updateId === "string" ? Updates.updateId : null;
    isEmbeddedLaunch = Updates && typeof Updates.isEmbeddedLaunch === "boolean" ? Updates.isEmbeddedLaunch : null;
  } catch {}
  let message = "";
  let name = "Error";
  try {
    message = error && error.message != null ? String(error.message) : String(error);
    name = error && error.name ? String(error.name) : "Error";
  } catch {}
  return {
    message,
    name,
    stack: firstLines(error && error.stack, 15),
    isFatal: !!isFatal,
    updateId,
    isEmbeddedLaunch,
    timestamp: Date.now(),
  };
}

function store(record: StartupError) {
  fallbackError = record; // always set first - zero-cost, synchronous, can't fail
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    const json = JSON.stringify(record);
    AsyncStorage.setItem(STORAGE_KEY, json).catch(() => {});
    AsyncStorage.setItem(ARCHIVE_KEY, json).catch(() => {});
  } catch {}
}

export function installStartupErrorTrap() {
  try {
    const g: any = global as any;
    if (!g || !g.ErrorUtils || typeof g.ErrorUtils.getGlobalHandler !== "function" || typeof g.ErrorUtils.setGlobalHandler !== "function") {
      return;
    }
    const originalHandler = g.ErrorUtils.getGlobalHandler();
    let restored = false;

    g.ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
      let withinWindow = false;
      try {
        withinWindow = Date.now() - loadedAt < STARTUP_WINDOW_MS;
      } catch {}
      if (withinWindow) {
        try { store(buildRecord(error, isFatal)); } catch {}
        if (isFatal) return; // the one thing this trap exists to prevent
      }
      try {
        if (typeof originalHandler === "function") originalHandler(error, isFatal);
      } catch {}
    });

    setTimeout(() => {
      if (restored) return;
      restored = true;
      try {
        g.ErrorUtils.setGlobalHandler(originalHandler);
      } catch {}
    }, STARTUP_WINDOW_MS);
  } catch {}
}

installStartupErrorTrap();
