import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

const ENABLED_KEY = "@valuiq_bio_enabled";
const EMAIL_KEY   = "@valuiq_bio_email";
const TOKEN_KEY   = "@valuiq_bio_refresh";

export async function isBiometricAvailable(): Promise<{ available: boolean; type: string }> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return { available: false, type: "none" };
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return { available: false, type: "none" };
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const type = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? "face" : "fingerprint";
    return { available: true, type };
  } catch { return { available: false, type: "none" }; }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ENABLED_KEY)) === "true"; } catch { return false; }
}

export async function enableBiometric(email: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ENABLED_KEY, "true"],
    [EMAIL_KEY, email],
    [TOKEN_KEY, refreshToken],
  ]);
}

export async function disableBiometric(): Promise<void> {
  await AsyncStorage.multiRemove([ENABLED_KEY, EMAIL_KEY, TOKEN_KEY]);
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
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Sign in to ValuIQ",
      fallbackLabel: "Use Password",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return { success: result.success };
  } catch { return { success: false }; }
}
