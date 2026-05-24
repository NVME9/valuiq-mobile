import React, { useState } from "react";
import {
  View, Linking, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, StatusBar, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { C } from "../lib/theme";
import { signInWithGoogle, signInWithApple } from "../lib/oauth";
import {
  isBiometricAvailable, isBiometricEnabled, enableBiometric,
  authenticateWithBiometrics, getBiometricEmail, getBiometricLabel,
} from "../lib/biometrics";
import { signIn, signUp, sendMagicLink, saveSession, Session, SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/api";

type Mode = "signin" | "signup" | "magic";

interface Props { onLogin: (session: Session) => void; }

export default function LoginScreen({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google"|"apple"|null>(null);
  const [biometricType, setBiometricType] = useState<"face"|"fingerprint"|"none">("none");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleForgotPassword() {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    setForgotLoading(true); setError("");
    try {
      // Call our web endpoint which handles PKCE correctly server-side
      const r = await fetch(`${API_BASE}/api/request-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        pwdWrapper:    { flexDirection:"row", alignItems:"center", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, marginBottom:4, overflow:"hidden" as any },
  pwdInput:      { flex:1, padding:13, color:C.text1, fontSize:14 },
  eyeBtn:        { padding:13, alignItems:"center", justifyContent:"center" },
  eyeIcon:       { fontSize:18 },
  appleBtn:       { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:10, backgroundColor:"#000", borderRadius:14, padding:15, marginBottom:10 },
  appleBtnIcon:   { fontSize:18 },
  appleBtnTxt:    { color:"#fff", fontSize:15, fontWeight:"700" as any },
  googleBtn:      { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:10, backgroundColor:"#fff", borderRadius:14, padding:15, marginBottom:10, borderWidth:1, borderColor:"#e0e0e0" },
  googleBtnIcon:  { fontSize:16, fontWeight:"900" as any, color:"#4285F4", width:24, textAlign:"center" as any },
  googleBtnTxt:   { color:"#333", fontSize:15, fontWeight:"700" as any },
  dividerRow:     { flexDirection:"row", alignItems:"center", gap:10, marginVertical:16 },
  dividerLine:    { flex:1, height:1, backgroundColor:C.border },
  dividerTxt:     { color:C.text4, fontSize:12, fontWeight:"600" as any },
  biometricBtn:   { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:10, backgroundColor:C.surface, borderWidth:1.5, borderColor:C.greenBorder, borderRadius:14, padding:16, marginBottom:10 },
  biometricIcon:  { fontSize:24 },
  biometricTxt:   { color:C.green, fontSize:15, fontWeight:"800" as any },
  tosRowRequired: { borderWidth:1, borderColor:"#ff5a5a30", borderRadius:10, padding:8, marginHorizontal:-8 },
  tosRow:        { flexDirection:"row", alignItems:"flex-start", gap:10, marginBottom:14, paddingHorizontal:2 },
  tosBox:        { width:22, height:22, borderRadius:6, borderWidth:2, borderColor:"#555250", alignItems:"center", justifyContent:"center", marginTop:1, flexShrink:0 },
  tosBoxChecked: { backgroundColor:"#a8e63d", borderColor:"#a8e63d" },
  tosCheck:      { color:"#0f1500", fontSize:14, fontWeight:"900" },
  tosTxt:        { color:"#a09b94", fontSize:12, lineHeight:18, flex:1 },
  tosLink:       { color:"#a8e63d", textDecorationLine:"underline" },
});
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed to send reset email. Try again.");
      }
      setForgotSent(true);
    } catch (e: any) {
      setError("Failed to send. Check your connection.");
    }
    setForgotLoading(false);
  }


  async function handleGoogleSignIn() {
    setSocialLoading("google");
    setError("");
    try {
      const result = await signInWithGoogle();
      if (result.success && result.session) {
        onLogin(result.session);
      } else if (result.error !== "cancelled") {
        setError("Google sign-in failed. Please try again.");
      }
    } catch {
      setError("Google sign-in failed. Please try again.");
    }
    setSocialLoading(null);
  }

  async function handleAppleSignIn() {
    setSocialLoading("apple");
    setError("");
    try {
      const result = await signInWithApple();
      if (result.success && result.session) {
        onLogin(result.session);
      } else if (result.error !== "cancelled") {
        setError("Apple sign-in failed. Please try again.");
      }
    } catch {
      setError("Apple sign-in failed. Please try again.");
    }
    setSocialLoading(null);
  }

  async function tryBiometricSignIn() {
    const { available } = await isBiometricAvailable();
    if (!available) return;
    const enabled = await isBiometricEnabled();
    if (!enabled) return;
    const result = await authenticateWithBiometrics();
    if (result.success) {
      const storedEmail = await getBiometricEmail();
      if (storedEmail) setEmail(storedEmail);
    }
  }

  async function promptEnableBiometricFn(userEmail: string) {
    const { available, type } = await isBiometricAvailable();
    if (!available) return;
    const alreadyEnabled = await isBiometricEnabled();
    if (alreadyEnabled) return;
    Alert.alert(
      `Enable ${getBiometricLabel(type)}?`,
      `Sign in instantly next time with ${getBiometricLabel(type)}.`,
      [
        { text: "Not Now", style: "cancel" },
        { text: `Enable ${getBiometricLabel(type)}`, onPress: async () => {
          await enableBiometric(userEmail);
          setBiometricEnabled(true);
        }},
      ]
    );
  }

    async function handleSubmit() {
    setError("");
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (mode !== "magic" && !password) { setError("Please enter your password."); return; }

    setLoading(true);
    try {
      if (mode === "magic") {
        await sendMagicLink(email.trim());
        setMagicSent(true);
      } else if (mode === "signup") {
        if (!tosAccepted) { setError("Please accept the Terms of Service to continue."); setLoading(false); return; }
        const session = await signUp(email.trim(), password);
        await saveSession(session);
        if (mode === "signup") {
          fetch(`${API_BASE}/api/email-sequences`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ type:"welcome", email: email.trim() }),
          }).catch(()=>{});
        }
        onLogin(session);
      } else {
        const session = await signIn(email.trim(), password);
        await saveSession(session);
        promptEnableBiometricFn(email.trim());
        onLogin(session);
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  if (magicSent) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 20 }}>📧</Text>
        <Text style={s.h2}>Check your email</Text>
        <Text style={[s.body, { textAlign: "center" }]}>
          We sent a sign-in link to{"\n"}
          <Text style={{ color: C.text1, fontWeight: "700" }}>{email}</Text>
        </Text>
        <Text style={[s.caption, { marginTop: 12, textAlign: "center" }]}>
          Tap the link in the email to sign in.{"\n"}
          Check your spam folder if you don't see it.
        </Text>
        <TouchableOpacity style={[s.outlineBtn, { marginTop: 24 }]} onPress={() => setMagicSent(false)}>
          <Text style={s.outlineBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={s.logoRow}>
            <View style={s.logoIcon}>
              <Text style={s.logoIconText}>V</Text>
            </View>
            <Text style={s.logoText}>ValuIQ</Text>
          </View>

          {/* Headline */}
          <Text style={s.tagline}>Point. Shoot. Profit.</Text>
          <Text style={s.sub}>Sign in to start scanning for profit.</Text>

          {/* Mode tabs */}
          <View style={s.tabs}>
            {(["signin", "signup", "magic"] as Mode[]).map(m => (
              <TouchableOpacity key={m} style={[s.tab, mode === m && s.tabActive]}
                onPress={() => { setMode(m); setError(""); }}>
                <Text style={[s.tabText, mode === m && s.tabTextActive]}>
                  {m === "signin" ? "Sign In" : m === "signup" ? "Sign Up" : "Magic Link"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error */}
          {error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={s.form}>
            {/* Social Sign-In */}
            {mode !== "magic" && (
              <>
                <TouchableOpacity
                  style={s.appleBtn}
                  onPress={handleAppleSignIn}
                  disabled={socialLoading !== null}
                  activeOpacity={0.85}
                >
                  {socialLoading === "apple"
                    ? <ActivityIndicator color="#fff" size="small"/>
                    : <>
                        <Text style={s.appleBtnIcon}>🍎</Text>
                        <Text style={s.appleBtnTxt}>Continue with Apple</Text>
                      </>
                  }
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.googleBtn}
                  onPress={handleGoogleSignIn}
                  disabled={socialLoading !== null}
                  activeOpacity={0.85}
                >
                  {socialLoading === "google"
                    ? <ActivityIndicator color="#333" size="small"/>
                    : <>
                        <Text style={s.googleBtnIcon}>G</Text>
                        <Text style={s.googleBtnTxt}>Continue with Google</Text>
                      </>
                  }
                </TouchableOpacity>

                {/* Divider */}
                <View style={s.dividerRow}>
                  <View style={s.dividerLine}/>
                  <Text style={s.dividerTxt}>or continue with email</Text>
                  <View style={s.dividerLine}/>
                </View>
              </>
            )}

            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input} value={email} onChangeText={setEmail}
              placeholder="you@example.com" placeholderTextColor={C.text4}
              autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
            />

            {mode !== "magic" && (
              <>
                <Text style={s.label}>Password</Text>
                <TextInput
                  style={s.input} value={password} onChangeText={setPassword}
                  placeholder={mode === "signup" ? "Choose a password (6+ chars)" : "Your password"}
                  placeholderTextColor={C.text4}
                  secureTextEntry={!showPassword}
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                >
                  <Text style={s.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
                </TouchableOpacity>
              </>
            )}

            {mode === "magic" && (
              <Text style={s.caption}>
                We'll send a sign-in link to your email. No password needed.
              </Text>
            )}

            {mode === "signup" && (
        <TouchableOpacity
          style={[s.tosRow, !tosAccepted && s.tosRowRequired]}
          onPress={() => setTosAccepted(v => !v)}
          activeOpacity={0.7}
        >
          <View style={[s.tosBox, tosAccepted && s.tosBoxChecked]}>
            {tosAccepted && <Text style={s.tosCheck}>✓</Text>}
          </View>
          <Text style={s.tosTxt}>
            I agree to the{" "}
            <Text style={s.tosLink} onPress={(e) => { e.stopPropagation(); Linking.openURL("https://www.getvaluiq.com/terms"); }}>
              Terms of Service
            </Text>
            {" "}— estimates only, all sales final.
          </Text>
        </TouchableOpacity>
      )}
            <TouchableOpacity style={s.btn} onPress={handleSubmit} disabled={loading}>
              {loading
                ? <ActivityIndicator color={C.greenDark} size="small" />
                : <Text style={s.btnText}>
                    {mode === "signin" ? "Sign In →" : mode === "signup" ? "Create Account →" : "Send Magic Link →"}
                  </Text>
              }
            </TouchableOpacity>

            {mode === "signin" && (
              forgotSent ? (
                <Text style={[s.caption, { textAlign: "center", color: C.green, marginTop: 10 }]}>
                  ✓ Reset email sent — check your inbox
                </Text>
              ) : (
                <TouchableOpacity onPress={handleForgotPassword} disabled={forgotLoading}
                  style={{ alignItems: "center", marginTop: 12 }}>
                  <Text style={{ color: C.text4, fontSize: 13 }}>
                    {forgotLoading ? "Sending..." : "Forgot password?"}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>

          <Text style={[s.caption, { textAlign: "center", marginTop: 24 }]}>
            10 free scans/month · No credit card required
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  scroll:         { padding: 24, paddingBottom: 48 },
  logoRow:        { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 28 },
  logoIcon:       { width: 30, height: 30, backgroundColor: C.green, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  logoIconText:   { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  logoText:       { color: C.text1, fontSize: 17, fontWeight: "800", letterSpacing: -0.5 },
  tagline:        { color: C.text1, fontSize: 30, fontWeight: "900", letterSpacing: -1, marginBottom: 6 },
  sub:            { color: C.text3, fontSize: 15, marginBottom: 24 },
  tabs:           { flexDirection: "row", gap: 6, marginBottom: 20, backgroundColor: C.surface, borderRadius: 12, padding: 4 },
  tab:            { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabActive:      { backgroundColor: C.bg },
  tabText:        { color: C.text4, fontSize: 13, fontWeight: "600" },
  tabTextActive:  { color: C.text1, fontWeight: "700" },
  errorBox:       { backgroundColor: "#1a0505", borderWidth: 1, borderColor: C.red + "40", borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText:      { color: C.red, fontSize: 13, lineHeight: 19 },
  form:           { gap: 8 },
  label:          { color: C.text3, fontSize: 13, fontWeight: "700", marginTop: 6 },
  input:          { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, color: C.text1, fontSize: 15 },
  btn:            { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnText:        { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  outlineBtn:     { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  outlineBtnText: { color: C.text3, fontSize: 14, fontWeight: "600" },
  h2:             { color: C.text1, fontSize: 22, fontWeight: "800", marginBottom: 10 },
  body:           { color: C.text3, fontSize: 15, lineHeight: 22 },
  caption:        { color: C.text4, fontSize: 12, lineHeight: 18 },
});
