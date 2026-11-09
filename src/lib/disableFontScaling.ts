// Forces every <Text>/<TextInput> (and anything built on top of them, e.g.
// <Animated.Text>) to render at a fixed size, ignoring the device's system
// text-size setting (iOS Dynamic Type / Android font scale) - the app must
// look the same on every phone regardless of that setting, not just at one
// tester's current size.
//
// React 19 removed defaultProps support for function components, and RN
// 0.81's Text/TextInput are plain function components that read
// allowFontScaling out of their own props - so the classic
// `Text.defaultProps.allowFontScaling = false` trick is a silent no-op on
// this stack (verified against node_modules/react-native's actual Text.js/
// TextInput.js: both destructure allowFontScaling directly, never touching
// a defaultProps object). react-native's own index.js re-requires each
// component's submodule on every property access (`get Text() { return
// require('./Libraries/Text/Text').default }`), so mutating that
// submodule's exported default in place - BEFORE anything else in the app
// requires react-native - reaches every caller (including Animated.Text)
// without editing a single screen file. Must stay the very first import in
// index.ts for that ordering guarantee.
import * as React from "react";

type AnyProps = Record<string, any>;

function withFixedFontScale(Component: React.ComponentType<AnyProps>): React.ComponentType<AnyProps> {
  function FixedFontScale(props: AnyProps) {
    return React.createElement(Component, {
      allowFontScaling: false,
      maxFontSizeMultiplier: 1,
      ...props,
    });
  }
  FixedFontScale.displayName = `FixedFontScale(${Component.displayName || Component.name || "Component"})`;
  return FixedFontScale;
}

const TextModule = require("react-native/Libraries/Text/Text");
const TextInputModule = require("react-native/Libraries/Components/TextInput/TextInput");

TextModule.default = withFixedFontScale(TextModule.default);
TextInputModule.default = withFixedFontScale(TextInputModule.default);
