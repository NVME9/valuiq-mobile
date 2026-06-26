import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, StatusBar, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import {
  isBiometricAvailable, isBiometricEnabled, enableBiometric,
  authenticateWithBiometrics, getBiometricEmail, getBiometricLabel,
  getBiometricRefreshToken, saveBiometricRefreshToken,
} from "../lib/biometrics";
import {
  signIn, signUp, resetPasswordForEmail, confirmPasswordReset,
  saveSession, Session, API_BASE, refreshSessionWithToken,
  signInWithApple, signInWithGoogle,
} from "../lib/api";

type Mode = "signin" | "signup" | "forgot" | "reset";

interface Props {
  onLogin: (session: Session) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [mode, setMode]                 = useState<Mode>("signin");
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [tosAccepted, setTos]           = useState(false);
  const [loading, setLoading]           = useState(false);
  const [forgotLoading, setForgotLoad]  = useState(false);
  const [forgotSent, setForgotSent]     = useState(false);
  const [resetCode, setResetCode]       = useState("");
  const [newPassword, setNewPassword]   = useState("");
  const [error, setError]               = useState("");
  const [biometricType, setBioType]     = useState<"face"|"fingerprint"|"none">("none");
  const [biometricEnabled, setBioEn]    = useState(false);

  useEffect(() => {
    (async () => {
      const { available, type } = await isBiometricAvailable();
      if (available) {
        setBioType(type as any);
        const en = await isBiometricEnabled();
        setBioEn(en);
        if (en) {
          const storedEmail = await getBiometricEmail();
          const storedToken = await getBiometricRefreshToken();
          if (storedEmail && storedToken) { handleBiometric(); }
        }
      }
    })();
  }, []);

  async function handleBiometric() {
    const storedEmail = await getBiometricEmail();
    if (!storedEmail) return;
    const result = await authenticateWithBiometrics();
    if (!result.success) return;
    setLoading(true);
    try {
      const storedToken = await getBiometricRefreshToken();
      if (!storedToken) {
        setLoading(false);
        setEmail(storedEmail);
        setError("Please sign in with your password once to re-enable Face ID.");
        return;
      }
      const session = await refreshSessionWithToken(storedToken);
      if (session?.access_token) {
        if (session.refresh_token) await saveBiometricRefreshToken(session.refresh_token);
        await saveSession(session);
        onLogin(session);
        return;
      }
      setLoading(false);
      setEmail(storedEmail);
      setError("Session expired. Please sign in with your password.");
    } catch {
      setLoading(false);
      setEmail(storedEmail);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (!password) { setError("Please enter your password."); return; }
    if (mode === "signup" && !tosAccepted) {
      setError("Please accept the Terms of Service to continue.");
      return;
    }
    setLoading(true);
    try {
      const session = mode === "signup"
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);
      await saveSession(session);
      if (mode === "signup") {
        fetch(`${API_BASE}/api/email-sequences`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "welcome", email: email.trim() }),
        }).catch(() => {});
      }
      // Offer biometrics — show prompt then call onLogin regardless of choice
      const { available, type: detectedType } = await isBiometricAvailable();
      const alreadyEnabled = available ? await isBiometricEnabled() : true;
      if (available && !alreadyEnabled) {
        const label = detectedType === "face" ? "Face ID" : "Touch ID";
        Alert.alert(
          `Enable ${label}?`,
          `Sign in faster next time with ${label}.`,
          [
            { text: "Not Now", style: "cancel", onPress: () => onLogin(session) },
            {
              text: "Enable",
              onPress: async () => {
                await enableBiometric(email.trim(), session.refresh_token || "");
                onLogin(session);
              }
            }
          ]
        );
      } else {
        onLogin(session);
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    setForgotLoad(true); setError("");
    try {
      await resetPasswordForEmail(email.trim());
      setMode("reset");
    } catch (e: any) {
      setError(e?.message || "Failed to send reset code. Try again.");
    }
    setForgotLoad(false);
  }

  async function handleConfirmReset() {
    if (!resetCode.trim()) { setError("Enter the 6-digit code from your email."); return; }
    if (newPassword.length < 6) { setError("New password must be at least 6 characters."); return; }
    setForgotLoad(true); setError("");
    try {
      await confirmPasswordReset(email.trim(), resetCode.trim(), newPassword);
      setMode("signin");
      setResetCode(""); setNewPassword(""); setPassword("");
      setError("");
      Alert.alert("Password Reset", "Your password has been updated. Sign in with your new password.");
    } catch (e: any) {
      setError(e?.message || "Could not reset password. Check your code and try again.");
    }
    setForgotLoad(false);
  }


  // ── FORGOT SENT SCREEN ──────────────────────────────────────────
  if (forgotSent) return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 20 }}>📧</Text>
        <Text style={s.h2}>Check your email</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 8 }]}>
          {"We sent a reset link to "}{email}
        </Text>
        <Text style={[s.caption, { textAlign: "center", marginBottom: 24 }]}>
          {"Check your spam folder if you don't see it."}
        </Text>
        <TouchableOpacity style={s.outlineBtn} onPress={() => { setForgotSent(false); setMode("signin"); }}>
          <Text style={s.outlineBtnText}>← Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // ── MAIN LOGIN SCREEN ──────────────────────────────────────────
  async function handleAppleSignIn() {
    setError("");
    setLoading(true);
    try {
      const session = await signInWithApple();
      await saveSession(session);
      onLogin(session);
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED" && !String(e?.message||"").includes("cancel")) {
        setError(e?.message || "Apple sign in failed");
      }
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const session = await signInWithGoogle();
      await saveSession(session);
      onLogin(session);
    } catch (e: any) {
      if (!String(e?.message||"").includes("cancel")) {
        setError(e?.message || "Google sign in failed");
      }
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>

          {/* Logo */}
          <View style={s.logoRow}>
            <View style={s.logoIcon}>
              <Text style={s.logoIconText}>V</Text>
            </View>
            <Text style={s.logoText}>ValuIQ</Text>
          </View>

          <Text style={s.h2}>{mode === "signup" ? "Create Account" : mode === "forgot" ? "Reset Password" : mode === "reset" ? "Enter Reset Code" : "Welcome Back"}</Text>
          <Text style={s.sub}>{mode === "signup" ? "Start finding profitable flips today." : mode === "forgot" ? "Enter your email to receive a 6-digit code." : mode === "reset" ? "Enter the code we emailed you and your new password." : "Sign in to your account."}</Text>

          {error ? <View style={s.errorBox}><Text style={s.errorTxt}>{error}</Text></View> : null}

          {/* Email */}
          {mode !== "reset" && <TextInput
            style={s.input}
            placeholder="Email address"
            placeholderTextColor={C.text4}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />}

          {/* Reset code + new password - reset mode only */}
          {mode === "reset" && (
            <>
              <TextInput
                style={s.input}
                placeholder="6-digit code"
                placeholderTextColor={C.text4}
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                maxLength={6}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={s.pwdRow}>
                <TextInput
                  style={s.pwdInput}
                  placeholder="New password"
                  placeholderTextColor={C.text4}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw(v => !v)}>
                  <Text style={s.eyeIcon}>{showPw ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Password - not shown for forgot or reset */}
          {mode !== "forgot" && mode !== "reset" && (
            <View style={s.pwdRow}>
              <TextInput
                style={s.pwdInput}
                placeholder="Password"
                placeholderTextColor={C.text4}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                autoCapitalize="none"
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw(v => !v)}>
                <Text style={s.eyeIcon}>{showPw ? "🔒" : "👁"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TOS - signup only */}
          {mode === "signup" && (
            <TouchableOpacity style={s.tosRow} onPress={() => setTos(v => !v)} activeOpacity={0.8}>
              <View style={[s.checkbox, tosAccepted && s.checkboxOn]}>
                {tosAccepted && <Text style={s.checkmark}>✓</Text>}
              </View>
              <Text style={s.tosTxt}>
                I agree to the{" "}
                <Text style={s.tosLink} onPress={() => require("react-native").Linking.openURL("https://www.getvaluiq.com/terms")}>
                  Terms of Service,
                </Text>
                {". "}Profit estimates reflect real sold listings and platform fees.
              </Text>
            </TouchableOpacity>
          )}

          {/* Main CTA */}
          {mode === "forgot" ? (
            <TouchableOpacity style={s.btn} onPress={handleForgotPassword} disabled={forgotLoading} activeOpacity={0.88}>
              {forgotLoading
                ? <ActivityIndicator color={C.greenDark} size="small"/>
                : <Text style={s.btnTxt}>Send Code</Text>
              }
            </TouchableOpacity>
          ) : mode === "reset" ? (
            <TouchableOpacity style={s.btn} onPress={handleConfirmReset} disabled={forgotLoading} activeOpacity={0.88}>
              {forgotLoading
                ? <ActivityIndicator color={C.greenDark} size="small"/>
                : <Text style={s.btnTxt}>Reset Password</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading} activeOpacity={0.88}>
              {loading
                ? <ActivityIndicator color={C.greenDark} size="small"/>
                : <Text style={s.btnTxt}>{mode === "signup" ? "Create Account →" : "Sign In →"}</Text>
              }
            </TouchableOpacity>
          )}

          {/* OAuth buttons - only on signin/signup */}
          {(mode === "signin" || mode === "signup") && (
            <>
              <View style={s.orRow}>
                <View style={s.orLine} />
                <Text style={s.orTxt}>or</Text>
                <View style={s.orLine} />
              </View>
              {Platform.OS === "ios" && (
                <TouchableOpacity style={s.appleBtn} onPress={handleAppleSignIn} disabled={loading} activeOpacity={0.85}>
                  <Text style={s.appleBtnTxt}>{"\uF8FF"}  Sign in with Apple</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.googleBtn} onPress={handleGoogleSignIn} disabled={loading} activeOpacity={0.85}>
                <View style={s.googleBadge}><Text style={s.googleBadgeTxt}>G</Text></View>
                <Text style={s.googleBtnTxt}>Sign in with Google</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Mode switcher */}
          <View style={s.switchRow}>
            {mode === "signin" ? (
              <>
                <TouchableOpacity onPress={() => { setMode("forgot"); setError(""); }}>
                  <Text style={s.switchLink}>Forgot password?</Text>
                </TouchableOpacity>
                <Text style={s.switchSep}>·</Text>
                <TouchableOpacity onPress={() => { setMode("signup"); setError(""); }}>
                  <Text style={s.switchLink}>Create account</Text>
                </TouchableOpacity>
              </>
            ) : mode === "signup" ? (
              <TouchableOpacity onPress={() => { setMode("signin"); setError(""); }}>
                <Text style={s.switchLink}>Already have an account? Sign in</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { setMode("signin"); setError(""); }}>
                <Text style={s.switchLink}>← Back to Sign In</Text>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  scroll:        { flexGrow: 1, padding: 24, paddingTop: 40 },
  center:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  logoRow:       { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 32 },
  logoIcon:      { width: 40, height: 40, borderRadius: 12, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  logoIconText:  { color: C.greenDark, fontSize: 22, fontWeight: "900" },
  logoText:      { color: C.text1, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  h2:            { color: C.text1, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, marginBottom: 6 },
  sub:           { color: C.text3, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  body:          { color: C.text3, fontSize: 15, lineHeight: 22 },
  caption:       { color: C.text4, fontSize: 12, lineHeight: 18 },
  errorBox:      { backgroundColor: "#1a0505", borderWidth: 1, borderColor: "#ff5a5a40", borderRadius: 10, padding: 12, marginBottom: 14 },
  errorTxt:      { color: C.red, fontSize: 13, lineHeight: 18 },
  // Social,
  orRow:         { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  orLine:        { flex: 1, height: 1, backgroundColor: "#333" },
  orTxt:         { color: "#777", fontSize: 13, marginHorizontal: 12, fontWeight: "600" },
  appleBtn:      { backgroundColor: "#1a1a1a", borderRadius: 14, padding: 15, alignItems: "center", marginBottom: 10, borderWidth: 1.5, borderColor: "#555", flexDirection: "row", justifyContent: "center", gap: 10 },
  appleBtnTxt:   { color: "#fff", fontSize: 15, fontWeight: "700" },
  googleBtn:     { backgroundColor: "#fff", borderRadius: 14, padding: 15, alignItems: "center", marginBottom: 10, borderWidth: 1.5, borderColor: "#ddd", flexDirection: "row", justifyContent: "center", gap: 10 },
  googleBadge:   { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  googleBadgeTxt:{ color: "#EA4335", fontSize: 13, fontWeight: "900" },
  googleBtnTxt:  { color: "#444", fontSize: 15, fontWeight: "700" },
  divider:       { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dividerLine:   { flex: 1, height: 1, backgroundColor: C.border },
  dividerTxt:    { color: C.text4, fontSize: 12 },
  // Inputs,
  input:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, color: C.text1, fontSize: 15, marginBottom: 12 },
  pwdRow:        { flexDirection: "row", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, marginBottom: 12, alignItems: "center" },
  pwdInput:      { flex: 1, padding: 14, color: C.text1, fontSize: 15 },
  eyeBtn:        { padding: 14 },
  eyeIcon:       { fontSize: 18 },
  // TOS,
  tosRow:        { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 16 },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#555", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  checkboxOn:    { backgroundColor: C.green, borderColor: C.green },
  checkmark:     { color: C.greenDark, fontSize: 13, fontWeight: "900" },
  tosTxt:        { color: C.text3, fontSize: 12, lineHeight: 18, flex: 1 },
  tosLink:       { color: C.green, textDecorationLine: "underline" },
  // Buttons,
  btn:           { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: "center", marginBottom: 12 },
  btnTxt:        { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  outlineBtn:    { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 12 },
  outlineBtnTxt: { color: C.text2, fontSize: 15, fontWeight: "600" },
  outlineBtnText:{ color: C.text2, fontSize: 15, fontWeight: "600" },
  bioBtn:        { borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 12, backgroundColor: C.greenBg },
  bioBtnTxt:     { color: C.green, fontSize: 15, fontWeight: "700" },
  // Switch,
  switchRow:     { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" },
  switchLink:    { color: C.green, fontSize: 13, fontWeight: "600" },
  switchSep:     { color: C.text4, fontSize: 13 },
});
