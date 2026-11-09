// MUST be the very first import - see its own header comment for why
// ordering matters (it patches react-native's Text/TextInput submodules
// in place before anything else in the app can require them).
import './src/lib/disableFontScaling';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately,
registerRootComponent(App);
