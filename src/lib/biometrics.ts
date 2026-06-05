import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "@valuiq_bio_enabled";
const EMAIL_KEY   = "@valuiq_bio_email";
const TOKEN_KEY   = "@valuiq_bio_refresh";

// Lazy load to prevent crash  if not available in this Expo Go version
let LA: any = null;
try { LA = require("expo-local-authentication"); } catch {}

export async function isBiometricAvailable(): Promise<{ available: boolean; type: string }> {
  if (!LA) return { available: false, type: "none" };
  try {
    const compatible = await LA.hasHardwareAsync();
    if (!compatible) return { available: false, type: "none" };
    const enrolled = await LA.isEnrolledAsync();
    if (!enrolled) return { available: false, type: "none" };
    const types = await LA.supportedAuthenticationTypesAsync();
    const type = types.includes(LA.AuthenticationType?.FACIAL_RECOGNITION) ? "face" : "fingerprint";
    return { available: true, type };
  } catch { return { available: false, type: "none" }; }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ENABLED_KEY)) === "true"; } catch { return false; }
}

export async function enableBiometric(email: string, refreshToken: string): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [ENABLED_KEY, "true"],
      [EMAIL_KEY, email],
      [TOKEN_KEY, refreshToken],
    ]);
  } catch {}
}

export async function disableBiometric(): Promise<void> {
  try { await AsyncStorage.multiRemove([ENABLED_KEY, EMAIL_KEY, TOKEN_KEY]); } catch {}
}

export async function getBiometricEmail(): Promise<string | null> {
  try { return await AsyncStorage.getItem(EMAIL_KEY); } catch { return null; }
}

export async function getBiometricRefreshToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export async function saveBiometricRefreshToken(token: string): Promise<void> {
  try { await AsyncStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function getBiometricLabel(type: string): string {
  return type === "face" ? "Face ID" : "Touch ID";
}

export async function authenticateWithBiometrics(): Promise<{ success: boolean }> {
  if (!LA) return { success: false };
  try {
    const result = await LA.authenticateAsync({
      promptMessage: "Sign in to ValuIQ",
      fallbackLabel: "Use Password",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return { success: result.success };
  } catch { return { success: false }; }
}
