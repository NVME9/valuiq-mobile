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
import { C } from "../lib/theme";

interface Props {
  children: React.ReactNode;
  // Shown in place of the crashed subtree - keep it short, this is a
  // degraded state, not a dead end (the rest of the screen still works).
  fallbackMessage?: string;
  // CRASH HARDENING (2026-11-08, scan->result flow crash): optional - when
  // given, the fallback renders a retry button that calls this instead of
  // dead-ending. The caller is responsible for actually recovering (e.g.
  // bumping a key so this boundary remounts) - this component has no way
  // to know what "retry" means for its children.
  onRetry?: () => void;
  // Fire-and-forget crash reporting - never let a THROWING reporter take
  // down the fallback render itself, so this call is wrapped below.
  onError?: (error: Error, info: React.ErrorInfo) => void;
}
interface State { hasError: boolean }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // ON-SCREEN, NOT CONSOLE (per this session's own rule: owner-only
    // on-screen debug readouts instead of console logs) - this still logs
    // to the console in dev (React Native's default behavior for any
    // uncaught error, unrelated to this component), but the actual
    // user-facing signal is the fallback text below, not a console line
    // only a developer plugged into Metro would ever see.
    this.lastError = error;
    try { this.props.onError?.(error, info); } catch {}
  }
  lastError: Error | null = null;
  render() {
    if (this.state.hasError) {
      return (
        <View style={st.wrap}>
          <Text style={st.text}>{this.props.fallbackMessage || "Something went wrong showing this section."}</Text>
          {this.props.onRetry && (
            <TouchableOpacity style={st.retryBtn} onPress={this.props.onRetry}>
              <Text style={st.retryText}>Try again</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

const st = StyleSheet.create({
  wrap: { padding: 14, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginVertical: 8 },
  text: { color: C.text3, fontSize: 13, textAlign: "center" as const },
  retryBtn: { marginTop: 10, alignSelf: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: C.green },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" as const },
});
