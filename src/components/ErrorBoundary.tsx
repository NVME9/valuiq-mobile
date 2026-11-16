// ErrorBoundary.tsx (2026-10-19) — generic, reusable React error boundary.
// First use: wrapping ScannerScreen's price-entry/tag-confirm block (the
// newest, most-edited piece of that screen this session) so a crash there
// degrades to a plain fallback instead of taking down the whole result
// screen - the rest of the scan (photo, verdict, profit numbers already
// rendered above it) stays usable. Class component because React error
// boundaries require componentDidCatch/getDerivedStateFromError, which
// have no hook equivalent.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { appendFailureLog } from "../lib/failureLog";
import { getLastScanResultSummary } from "../lib/lastScanResult";

interface Props {
  children: React.ReactNode;
  // Shown in place of the crashed subtree - keep it short, this is a
  // degraded state, not a dead end (the rest of the screen still works).
  fallbackMessage?: string;
  // TOP-LEVEL SCAN->RESULT WRAP (2026-11-10, proof-screen): true wraps the
  // fallback in its own SafeAreaView - needed when this boundary replaces a
  // subtree that itself STARTED with the screen's own outer SafeAreaView
  // (e.g. ScannerScreen's whole result-step render), so losing that subtree
  // doesn't also lose notch/home-indicator safe-area insets. False (default)
  // for every other, narrower use - those already sit inside a parent
  // SafeAreaView and would just double-wrap.
  fallbackInSafeArea?: boolean;
  // CRASH HARDENING (2026-11-08, scan->result flow crash): optional - when
  // given, the fallback renders a retry button that calls this instead of
  // dead-ending. The caller is responsible for actually recovering (e.g.
  // bumping a key so this boundary remounts) - this component has no way
  // to know what "retry" means for its children.
  onRetry?: () => void;
  // Fire-and-forget crash reporting - never let a THROWING reporter take
  // down the fallback render itself, so this call is wrapped below.
  onError?: (error: Error, info: React.ErrorInfo) => void;
  // CRASH CAPTURE (2026-11-14, item 5): opt-in - only the App.tsx top-level
  // boundary passes these. Gated on isOwner because the failure log lives
  // in THIS DEVICE's own AsyncStorage, never synced anywhere - logging a
  // random user's crash to their own local storage that the owner (Nate)
  // will never see has no value, so there is nothing to capture unless the
  // person hitting the crash IS the owner reviewing it on their own device.
  // Every other ErrorBoundary use (the narrower price-field/result-card
  // wraps) simply never passes isOwner, so they get none of this - same
  // behavior as before this fix.
  isOwner?: boolean;
  // Whichever screen was active when the crash happened (App.tsx's own
  // `screen` state) - meaningless/omitted for a narrower boundary that
  // already knows its own context some other way.
  currentScreen?: string;
}
interface State { hasError: boolean; lastError: Error | null; lastComponentStack?: string | null }

// COMPONENT STACK, OWNER-ONLY (2026-11-15, item 3): the plain
// "TypeError: Cannot read property 'tier' of undefined" owner line gave no
// hint WHERE in the tree a crash happened - every crash on this screen
// looked identical. React's componentStack is a newline-separated list
// like "\n    in ProfitFlexHero (at ScannerScreen.tsx:2730)\n    in View
// ..." - innermost component first. Pulls just the component name off
// each of the first few lines so the owner sees "ProfitFlexHero <
// ScrollView < View < ScannerScreen" at a glance instead of a multi-line
// dump with file/line noise.
function componentNamesFromStack(componentStack: string | null, maxLines = 4): string[] {
  if (!componentStack) return [];
  return componentStack
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map(line => {
      const m = line.match(/^in\s+(\S+)/);
      return m ? m[1] : line;
    });
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, lastError: null, lastComponentStack: null };
  }
  // OWNER LINE FIX (2026-11-14, crash-reporting item 2): this used to set
  // `this.lastError` as a plain instance field inside componentDidCatch,
  // which runs in the COMMIT phase - AFTER React already called render()
  // off the state update from getDerivedStateFromError (the RENDER phase).
  // That first (and, since mutating a plain field triggers no re-render,
  // ONLY) render of the fallback always ran with lastError still null, so
  // the owner-only line below never appeared - not a gating bug (isOwner
  // was fine), a lifecycle-ordering one. Capturing the error here instead,
  // as part of the SAME state update that flips hasError true, means the
  // one render that actually paints the fallback already has it.
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, lastError: error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // ON-SCREEN, NOT CONSOLE (per this session's own rule: owner-only
    // on-screen debug readouts instead of console logs) - this still logs
    // to the console in dev (React Native's default behavior for any
    // uncaught error, unrelated to this component), but the actual
    // user-facing signal is the fallback text below, not a console line
    // only a developer plugged into Metro would ever see.
    try { this.props.onError?.(error, info); } catch {}
    if (this.props.isOwner) {
      // SAME LIFECYCLE-ORDERING FIX AS lastError (see this class's own
      // comment above getDerivedStateFromError): componentStack only
      // arrives here, in the COMMIT-phase componentDidCatch, one render
      // after getDerivedStateFromError already painted the fallback - so
      // it has to go through its own setState to reach the screen, same as
      // the error name/message would if captured this late instead.
      try { this.setState({ lastComponentStack: info?.componentStack || null }); } catch {}
      try {
        appendFailureLog({
          at: Date.now(),
          kind: "crash",
          name: error?.name || "Error",
          message: error?.message || String(error),
          // First 1500 chars only - a minified bundle's stack can run
          // several KB, and this is going into AsyncStorage (capped at 20
          // entries total) for a quick on-device read, not a full report.
          stack: (error?.stack || "").slice(0, 1500),
          componentStack: info?.componentStack || "",
          screen: this.props.currentScreen,
          resultSummary: getLastScanResultSummary(),
        }).catch(() => {});
      } catch {}
    }
  }
  render() {
    if (this.state.hasError) {
      const body = (
        <View style={st.wrap}>
          <Text style={st.text}>{this.props.fallbackMessage || "Something went wrong showing this section."}</Text>
          {/* OWNER DIAGNOSTIC (2026-11-14, item 5): same isOwner gate as the
              capture above - non-owners see only the friendly message. */}
          {this.props.isOwner && this.state.lastError && (
            <Text style={st.ownerLine}>{this.state.lastError.name}: {this.state.lastError.message}</Text>
          )}
          {/* OWNER-ONLY COMPONENT STACK (item 3): first 4 component names,
              innermost first - identifies WHICH crash this is on screen,
              without digging through the failure log. */}
          {this.props.isOwner && this.state.lastComponentStack && (
            <Text style={st.ownerLine}>
              {componentNamesFromStack(this.state.lastComponentStack).join(" < ")}
            </Text>
          )}
          {this.props.onRetry && (
            <TouchableOpacity style={st.retryBtn} onPress={this.props.onRetry}>
              <Text style={st.retryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      );
      return this.props.fallbackInSafeArea ? (
        <SafeAreaView style={st.safeFallback} edges={["top", "left", "right"]}>
          {body}
        </SafeAreaView>
      ) : body;
    }
    return this.props.children;
  }
}

const st = StyleSheet.create({
  safeFallback: { flex: 1, backgroundColor: C.bg, justifyContent: "center" },
  wrap: { padding: 14, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginVertical: 8, marginHorizontal: 16 },
  text: { color: C.text3, fontSize: 13, textAlign: "center" as const },
  ownerLine: { color: C.text4, fontSize: 10.5, fontFamily: "monospace" as any, textAlign: "center" as const, marginTop: 8 },
  retryBtn: { marginTop: 10, alignSelf: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: C.green },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" as const },
});
