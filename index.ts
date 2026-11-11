// DIAGNOSTIC (2026-11-11, OTA crash incident) - MUST be the very first
// thing evaluated in this file, before even disableFontScaling below.
// Plain require(), not `import`: a top-level `import` would still be
// hoisted correctly here since it's already the first line, but this
// makes the ordering requirement impossible for a future edit to break by
// accident (an import added above this line would still be fine; one
// added without noticing this comment wouldn't be, which is exactly the
// failure mode a plain require() at the true top of the file avoids -
// nothing can be hoisted above a statement that's already first). See
// startupErrorTrap.ts's own header for what this installs and why.
require('./src/lib/startupErrorTrap');

// MUST be the very first import - see its own header comment for why
// ordering matters (it patches react-native's Text/TextInput submodules
// in place before anything else in the app can require them).
import './src/lib/disableFontScaling';

import React from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import StartupErrorBoundary from './src/components/StartupErrorBoundary';

// DIAGNOSTIC (2026-11-11, OTA crash incident) - wraps the real root so a
// fatal error startupErrorTrap.ts caught (and swallowed) earlier this
// launch gets shown on screen instead of leaving the app to limp along
// silently. React.createElement, not JSX - this file stays .ts (not
// .tsx), same as before this change, since index.ts's filename is wired
// into package.json/Expo's entry resolution and renaming it is out of
// scope for a diagnostic.
function Root() {
  return React.createElement(StartupErrorBoundary, null, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately,
registerRootComponent(Root);
