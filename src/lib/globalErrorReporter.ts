// globalErrorReporter.ts (2026-11-14, crash-reporting item 1) — a
// PERMANENT wrapper around ErrorUtils.setGlobalHandler that reports every
// otherwise-uncaught JS error (fatal or not) via reportClientError(), then
// always forwards to whatever handler was already registered - never
// swallows an error, unlike startupErrorTrap.ts's deliberately time-boxed
// (15s) fatal-swallowing trap.
//
// INSTALL TIMING: startupErrorTrap.ts (index.ts, required before anything
// else) installs its OWN temporary handler for exactly 15 seconds, then
// calls g.ErrorUtils.setGlobalHandler(originalHandler) directly - that's a
// blind REPLACE, not a compose, so whoever is registered at that instant
// gets discarded outright. Installing this wrapper any earlier than that
// window would just get silently uninstalled the moment startupErrorTrap
// restores the original handler. INSTALL_DELAY_MS waits comfortably past
// that restore before wrapping whatever handler is current at that point
// (by then, always the true React Native/expo-updates default) - nothing
// else in this app ever touches ErrorUtils after that, so this is the last
// writer and stays installed for the rest of the app's life.
const INSTALL_DELAY_MS = 16000;

let installed = false;

export function installGlobalErrorReporter(report: (error: any, isFatal: boolean) => void) {
  if (installed) return; // idempotent - App.tsx's init() can run more than once in a session (e.g. a dev reload)
  installed = true;
  try {
    const g: any = global as any;
    if (!g || !g.ErrorUtils || typeof g.ErrorUtils.getGlobalHandler !== "function" || typeof g.ErrorUtils.setGlobalHandler !== "function") {
      return;
    }
    setTimeout(() => {
      try {
        const previousHandler = g.ErrorUtils.getGlobalHandler();
        g.ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
          try { report(error, isFatal); } catch {}
          // NEVER swallow - this wrapper exists to ADD visibility, not to
          // change how the app actually handles the error (fatal recovery,
          // dev RedBox, etc. - all of that still belongs to whatever was
          // already there).
          try {
            if (typeof previousHandler === "function") previousHandler(error, isFatal);
          } catch {}
        });
      } catch {}
    }, INSTALL_DELAY_MS);
  } catch {}
}
