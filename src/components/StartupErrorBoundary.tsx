// StartupErrorBoundary.tsx — DIAGNOSTIC (2026-11-11, OTA crash incident).
// Wraps the whole app (see index.ts). Two ways this shows its full-screen
// readout:
//   1. A genuine React render crash right now (componentDidCatch) - the
//      normal error-boundary path.
//   2. startupErrorTrap.ts already caught and SWALLOWED a fatal error
//      earlier this same launch (checked on mount, via its in-memory
//      fallback and AsyncStorage) - the app may have kept running in a
//      half-broken state after that, so this surfaces the real root cause
//      proactively instead of waiting for (or never getting) a second,
//      secondary crash to actually trigger case 1.
// Deliberately plain: white background, black text, selectable (so the
// error/stack can be copied off the device by hand), a single Reload
// button. No dependency on this app's own theme/components - if ANY of
// those are what's broken, this screen still has to render.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { getFallbackStartupError, StartupError } from "../lib/startupErrorTrap";

interface Props {
  children: React.ReactNode;
}
interface State {
  show: boolean;
  error: StartupError | { message: string; name: string; stack: string } | null;
}

export default class StartupErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { show: false, error: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { show: true };
  }

  componentDidCatch(error: Error) {
    this.setState((s) => ({
      show: true,
      // A live render crash is the SYMPTOM - prefer the stored startup
      // error (the root cause this whole trap exists to capture) when one
      // is on file; only fall back to the error just caught if there
      // isn't one.
      error: s.error || {
        message: error?.message != null ? String(error.message) : String(error),
        name: error?.name ? String(error.name) : "Error",
        stack: (error?.stack || "").split("\n").slice(0, 15).join("\n"),
      },
    }));
  }

  componentDidMount() {
    try {
      const fromFallback = getFallbackStartupError();
      if (fromFallback) {
        this.setState({ show: true, error: fromFallback });
        return;
      }
    } catch {}
    (async () => {
      try {
        const AsyncStorage = require("@react-native-async-storage/async-storage").default;
        const raw = await AsyncStorage.getItem("lastStartupError");
        if (raw) {
          const parsed = JSON.parse(raw);
          this.setState((s) => (s.show ? s : { show: true, error: parsed }));
        }
      } catch {}
    })();
  }

  reload = () => {
    try {
      const Updates = require("expo-updates");
      if (Updates && typeof Updates.reloadAsync === "function") {
        Updates.reloadAsync().catch(() => {
          this.setState({ show: false, error: null });
        });
        return;
      }
    } catch {}
    // No expo-updates reloadAsync available - best effort, just drop the
    // boundary's own state so its children get a fresh mount.
    this.setState({ show: false, error: null });
  };

  render() {
    if (this.state.show) {
      const err = this.state.error;
      return (
        <View style={st.root}>
          <ScrollView contentContainerStyle={st.scroll}>
            <Text style={st.title} selectable>
              Startup error
            </Text>
            <Text style={st.label} selectable>
              {err ? `${err.name}: ${err.message}` : "An error occurred, but no details were captured."}
            </Text>
            {err?.stack ? (
              <Text style={st.stack} selectable>
                {err.stack}
              </Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={st.button} onPress={this.reload}>
            <Text style={st.buttonText}>Reload</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  scroll: { padding: 20, paddingTop: 60 },
  title: { color: "#000000", fontSize: 20, fontWeight: "800", marginBottom: 16 },
  label: { color: "#000000", fontSize: 14, fontWeight: "700", marginBottom: 12 },
  stack: { color: "#000000", fontSize: 12, fontFamily: "Courier" },
  button: { backgroundColor: "#000000", paddingVertical: 16, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
