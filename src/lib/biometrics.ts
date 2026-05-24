// Biometrics stub - native module removed for stability
// Will be re-added in a future update with proper native configuration
import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "@valuiq_biometric_enabled";
const EMAIL_KEY   = "@valuiq_biometric_email";

export async function isBiometricAvailable() {
  return { available: false, type: "none" as const };
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === "true";
  } catch { return false; }
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

export async function authenticateWithBiometrics() {
  return { success: false, error: "Biometrics not available in this version" };
}

export function getBiometricLabel(type: string): string {
  return type === "face" ? "Face ID" : "Touch ID";
}
