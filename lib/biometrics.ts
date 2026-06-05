import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

const ENABLED_KEY = "@valuiq_biometric_enabled";
const EMAIL_KEY   = "@valuiq_biometric_email";

export async function isBiometricAvailable(): Promise<{ available: boolean; type: string }> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return { available: false, type: "none" };
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return { available: false, type: "none" };
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const type = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? "face"
      : "fingerprint";
    return { available: true, type };
  } catch {
    return { available: false, type: "none" };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ENABLED_KEY)) === "true"; } catch { return false; }
}

export async function enableBiometric(email: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, "true");
    await AsyncStorage.setItem(EMAIL_KEY, email);
    return true;
  } catch { return false; }
}

export async function disableBiometric(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ENABLED_KEY);
    await AsyncStorage.removeItem(EMAIL_KEY);
  } catch {}
}

export async function getBiometricEmail(): Promise<string | null> {
  try { return await AsyncStorage.getItem(EMAIL_KEY); } catch { return null; }
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
    });
    return { success: result.success };
  } catch {
    return { success: false };
  }
}
