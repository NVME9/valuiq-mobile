// disableFontScaling.ts — forces every <Text>/<TextInput> (and anything
// built on top of them, e.g. <Animated.Text>) toward a fixed size,
// ignoring the device's system text-size setting (iOS Dynamic Type /
// Android font scale), so the app looks the same on every phone
// regardless of that setting.
//
// STARTUP-SAFE REWRITE (2026-11-11, bisect): the previous version of this
// file ran at MODULE SCOPE, required as the very first import in
// index.ts, before registerRootComponent/App ever ran - and did
// `require("react-native/Libraries/Text/Text")` / `.../TextInput/TextInput`,
// a DEEP internal require of react-native's own guts (forcing Text.js's
// whole transitive dependency graph - View/StyleSheet/Platform/etc. - to
// evaluate before react-native's own bootstrap sequence would normally
// reach it), then mutated `.default` on those submodules in place. That
// was the prime suspect in this app's OTA launch-crash bisect (the app had
// only ever shipped OTA bundles as plain JS text before; once Hermes
// bytecode finally exported correctly, every update built on top of this
// commit crashed 0.3-1.6s after launch, before the JS-level startup trap
// ever caught anything - consistent with something failing during module
// evaluation, outside any catchable JS exception). A worktree test
// confirmed: removing only this file's import from index.ts was the
// change that let the OTA apply instead of crash.
//
// This version: no deep requires, nothing at module scope, only the
// PUBLIC `Text`/`TextInput` exports from "react-native", called explicitly
// from App.tsx's own mount effect (after first render, not before it),
// wrapped in try/catch.
//
// HONEST CAVEAT (kept because it was already measured once): the file this
// replaces found that RN 0.81's Text/TextInput are plain function
// components that destructure `allowFontScaling`/`maxFontSizeMultiplier`
// directly out of their own props - React 19 removed defaultProps support
// for function components entirely, so `Text.defaultProps = {...}` does
// NOT inject those props into what actually renders on this stack. Setting
// it below is still harmless and forward-compatible (a future RN/React
// version, or any class-based override, could pick it up), and it is what
// was explicitly asked for here - but it is not expected to visibly change
// rendered font scaling the way the old file's deep-patch HOC did. If that
// behavior needs to come back for real, the safe path is passing
// allowFontScaling={false}/maxFontSizeMultiplier={1} explicitly at each
// call site, not another module-scope patch of react-native's internals.
import { Text, TextInput } from "react-native";

export function disableFontScaling(): void {
  try {
    (Text as any).defaultProps = {
      ...(Text as any).defaultProps,
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
    };
    (TextInput as any).defaultProps = {
      ...(TextInput as any).defaultProps,
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
    };
  } catch {}
}
