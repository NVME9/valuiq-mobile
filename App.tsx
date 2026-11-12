import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, StatusBar, Platform,
  ActivityIndicator, TouchableOpacity, Animated, Dimensions, AppState
} from "react-native";
import { C } from "./src/lib/theme";
import LogoBadge from "./src/components/LogoBadge";
import ScopeBackground from "./src/components/ScopeBackground";
import { Session, loadSession, saveSession, clearSession, getPlan, getScanCount, refreshToken, isTokenNearExpiry, hasProAccess, hydrateAvatarCache, getScanById, invalidateScanHistoryCache, SessionRestoreNetworkError, logClientError, logEvent } from "./src/lib/api";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { readScanStage, clearScanStage } from "./src/lib/scanStage";
import { disableFontScaling } from "./src/lib/disableFontScaling";
import { supabase } from "./src/lib/supabase";
import { addSaleCheckInTapListener } from "./src/lib/notifications";
import LogSaleModal from "./src/components/LogSaleModal";
import { toPendingScan } from "./src/lib/saleCapture";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isBiometricEnabled, isBiometricAvailable, authenticateWithBiometrics, saveBiometricRefreshToken } from "./src/lib/biometrics";
import LoginScreen from "./src/screens/LoginScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import ThriftRunScreen from "./src/screens/ThriftRunScreen";
import SpecialtyScreen from "./src/screens/SpecialtyScreen";
import ImportSalesScreen from "./src/screens/ImportSalesScreen";
import DeathPileScreen from "./src/screens/DeathPileScreen";
import CommunityScreen from "./src/screens/CommunityScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import UpgradeScreen from "./src/screens/UpgradeScreen";
import RelisterScreen from "./src/screens/RelisterScreen";
import HotNowScreen from "./src/screens/HotNowScreen";
import DemandRadarScreen from "./src/screens/DemandRadarScreen";
import ResellerGPSScreen from "./src/screens/ResellerGPSScreen";
import CashFlowScreen from "./src/screens/CashFlowScreen";
import ListingWriterScreen from "./src/screens/ListingWriterScreen";
import ViralContentScreen from "./src/screens/ViralContentScreen";
import PriceBattleScreen from "./src/screens/PriceBattleScreen";
import NegotiateScreen from "./src/screens/NegotiateScreen";
import SourcingIntelScreen from "./src/screens/SourcingIntelScreen";
import ArbitrageScreen from "./src/screens/ArbitrageScreen";
import BundleBuilderScreen from "./src/screens/BundleBuilderScreen";
import FlipScoreScreen from "./src/screens/FlipScoreScreen";
import SourcingAlertsScreen from "./src/screens/SourcingAlertsScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import ProfitTrackerScreen from "./src/screens/ProfitTrackerScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import ReferralCodeEntry from "./src/components/ReferralCodeEntry";
import AIConsentScreen from "./src/screens/AIConsentScreen";
import AICoachScreen from "./src/screens/AICoachScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import ScanConfirmScreen from "./src/screens/ScanConfirmScreen";
import FAQScreen from "./src/screens/FAQScreen";
import AdminScreen from "./src/screens/AdminScreen";
// SPIKE (branch spike/ebay-sold-fetch, 2026-10-07) - owner-only debug
// screen for the eBay-sold-data-via-fetch pipeline (no native modules -
// plain fetch() + regex HTML parsing, see ebaySoldFetch.ts). Deferred via
// require() rather than a static top-level import purely as a hygiene
// habit (this screen has no native-module dependency today, so nothing
// here is OTA-unsafe the way the earlier WebView-based spike was - see
// spike/ebay-sold-webview - but keeping debug-only code out of the eager
// import graph costs nothing and holds if that ever changes).
function renderSoldDataDebugScreen(props: { token: string; onBack?: () => void }) {
  const SoldDataDebugScreen = require("./src/screens/SoldDataDebugScreen").default;
  return <SoldDataDebugScreen {...props} />;
}
import BusinessApp from "./src/screens/business/BusinessApp";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export type Screen =
  "scanner"|"dashboard"|"thrift-run"|
  "specialty"|"manifest"|"deathpile"|"community"|
  "profile"|"relist"|"hot-now"|"arbitrage"|"upgrade"|
  "bundle"|"alerts"|"leaderboard"|"inventory"|"profit-tracker"|"deal-hunter"|"ai-coach"|"history"|"faq"|"admin"|"titan"|"import-sales"|"sold-data-debug"|"scan-confirm";

const { height } = Dimensions.get("window");

// Races any promise against a timeout - used for the expo-updates check on
// launch (see init()) so a slow/unreachable update service can never hang
// first paint the way an un-timed backend call did earlier in this app's
// history (see api.ts).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// Mirrors ProfileScreen.tsx's OWNER_EMAILS - gates the session-restore debug
// readout below (elapsed time on the connecting/splash screen) the same way
// that file gates its dev-only tools: an account allowlist, not __DEV__,
// since this ships to real users over OTA where __DEV__ is always false.
const OWNER_EMAILS = ["natev9@comcast.net", "nvisionsinc@gmail.com", "nathanrussell9@outlook.com"];

// MEASURED BUG: LoginScreen's biometric quick-login reads its OWN separately-
// stored refresh token (biometrics.ts's saveBiometricRefreshToken), written
// only at the moment biometrics are enabled/last used - every OTHER refresh
// (init()'s session-restore, the AppState foreground-resume listener) only
// updated the MAIN session storage, leaving the biometric copy silently
// stale. A user who then hit the LoginScreen for any reason (including the
// refresh-token race this same incident surfaced) got auto-logged-in via
// biometrics using that stale token, which Supabase rejects as already-
// rotated - surfacing the alarming "Session expired. Please sign in with
// your password." even though their real session was fine. Called after
// every successful saveSession(refreshed) below to keep the two in sync.
async function syncBiometricToken(refreshed: Session) {
  try {
    if (await isBiometricEnabled()) await saveBiometricRefreshToken(refreshed.refresh_token);
  } catch {}
}

// Last plan successfully resolved from the backend - purely a local, instant
// starting guess for the badge on next launch (see init()); loadUserData
// always re-fetches and corrects it, this is never used for feature-gating.
const LAST_PLAN_KEY = "@valuiq_last_plan";

// ── PLAN, DISPLAY HELPERS ─────────────────────────────────────
const PLAN_LABEL: Record<string,string> = {
  free:"Free", seller:"Seller", pro:"Pro", titan:"Titan", lifetime:"Lifetime ♾️"
};
const PLAN_COLOR: Record<string,string> = {
  free:C.text4, seller:C.green, pro:C.orange, lifetime:C.yellow,
};

// ── SPLASH ───────────────────────────────────────────────────
function SplashScreen({ onDone }: { onDone:()=>void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.82)).current;
  const fade2   = useRef(new Animated.Value(0)).current;
  const fade3   = useRef(new Animated.Value(0)).current;

  // Listen to Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      if (event === "SIGNED_IN" && sbSession && !session) {
        const s: Session = {
          access_token: sbSession.access_token,
          refresh_token: sbSession.refresh_token,
          user: { id: sbSession.user.id, email: sbSession.user.email || "" },
        };
        await saveSession(s);
        await handleLogin(s);
      } else if (event === "SIGNED_OUT") {
        await handleLogout();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue:1, duration:500, useNativeDriver:true }),
        Animated.spring(scale,   { toValue:1, tension:75, friction:8, useNativeDriver:true }),
      ]),
      Animated.timing(fade2, { toValue:1, duration:450, useNativeDriver:true }),
      Animated.delay(150),
      Animated.timing(fade3, { toValue:1, duration:400, useNativeDriver:true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue:0, duration:400, useNativeDriver:true }),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View style={[ss.splash, { opacity }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bgDeep} />
      <ScopeBackground accent={C.green} botInset={70} />

      <View style={ss.content}>
        {/* Logo block */}
        <Animated.View style={{ alignItems:"center", transform:[{ scale }] }}>
          <LogoBadge accent={C.green} style={{ marginBottom:6 }}/>
          <Text style={ss.logoName}>ValuIQ</Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.Text style={[ss.tagline, { opacity: fade2 }]}>
          Point. Shoot. Profit.
        </Animated.Text>
        <Animated.Text style={[ss.tagSub, { opacity: fade2 }]}>
          Real sold prices from actual resellers — not guesses.
        </Animated.Text>

        {/* Three feature lines - NOT buttons */}
        <Animated.View style={[ss.pills, { opacity: fade3 }]}>
          {[
            { icon:"📷", text:"Scan any item — photo, barcode, or text" },
            { icon:"💰", text:"Profit after every fee on every platform" },
            { icon:"⚡", text:"Beat everyone to the best deals" },
          ].map((item,i)=>(
            <View key={i} style={ss.pill}>
              <Text style={ss.pillIcon}>{item.icon}</Text>
              <Text style={ss.pillText}>{item.text}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── LOADING GATE ─────────────────────────────────────────────
// Covers the gap between SplashScreen's own fixed-length brand animation
// finishing and session restore actually resolving - WITHOUT this, that gap
// rendered nothing (SplashScreen's own opacity had already animated to 0,
// and the main content's fadeIn hadn't started yet), i.e. a blank screen,
// on any cold restore slower than the splash animation. Only ever shown for
// a few seconds at most - see App()'s MAX_ATTEMPTS (bounded to one silent
// retry) below.
function LoadingGate({ elapsedMs, showDebug }: { elapsedMs: number; showDebug: boolean }) {
  return (
    <View style={ss.splash}>
      <StatusBar barStyle="light-content" backgroundColor={C.bgDeep} />
      <View style={ss.content}>
        <ActivityIndicator size="large" color={C.green} />
        {showDebug && (
          <Text style={ss.debugLine}>session restore: {elapsedMs}ms</Text>
        )}
      </View>
    </View>
  );
}

// ── RECONNECTING (small, non-blocking) ──────────────────────
// COLD-LAUNCH FIX (2026-10-06): this used to be a full-screen gate shown
// INSTEAD OF the main app while a stored session's refresh was in flight
// or failing - on a slow backend (measured: 8019ms, backfill write load
// hammering the same DB auth sits on) that meant a real, valid session sat
// on "Connecting…" for 8+ seconds, which read as a hang and took a third
// force-close to escape. Restore is now OPTIMISTIC (attemptSessionRestore
// below renders Home immediately with the stored session, refreshes in
// the background) - this badge is just a small, non-blocking corner
// indicator for "the background refresh hasn't confirmed yet / is having
// network trouble," never a thing the user has to wait out to use the app.
function ReconnectingBadge({ elapsedMs, retrying, onRetry, showDebug }:
  { elapsedMs: number; retrying: boolean; onRetry: () => void; showDebug: boolean }) {
  return (
    <SafeAreaView style={ss.reconnectWrap} pointerEvents="box-none">
      <TouchableOpacity style={ss.reconnectPill} onPress={onRetry} disabled={retrying} activeOpacity={0.8}>
        <ActivityIndicator size="small" color={C.text2} style={{ marginRight: 8 }} />
        <Text style={ss.reconnectText}>{retrying ? "Reconnecting…" : "Reconnecting — tap to retry"}</Text>
      </TouchableOpacity>
      {showDebug && (
        <Text style={[ss.debugLine, { marginTop: 4 }]}>session restore: {elapsedMs}ms{retrying ? " (retrying…)" : ""}</Text>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  splash:   { position:"absolute" as any, top:0, left:0, right:0, bottom:0, zIndex:100, backgroundColor:C.bgDeep },
  content:  { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:32 },
  logoName: { color:C.text1, fontSize:38, fontWeight:"900", letterSpacing:-2, marginBottom:18 },
  tagline:  { color:C.text1, fontSize:22, fontWeight:"800", textAlign:"center", marginBottom:6 },
  tagSub:   { color:C.text3, fontSize:14, textAlign:"center", marginBottom:36 },
  pills:    { gap:14, width:"100%" },
  pill:     { flexDirection:"row", alignItems:"center", gap:12 },
  pillIcon: { fontSize:22, width:34, lineHeight:28, textAlign:"center" as any },
  pillText: { color:C.text2, fontSize:14, lineHeight:20, flex:1 },
  retryBtn: { backgroundColor:C.green, paddingHorizontal:36, paddingVertical:13, borderRadius:12, minWidth:120, alignItems:"center" },
  retryBtnText: { color:C.bgDeep, fontSize:15, fontWeight:"800" },
  // Owner-only (OWNER_EMAILS) - Nate can't see console logs on a device
  // build, this is the only way to see how long a restore attempt actually
  // took without plugging into a debugger.
  debugLine: { color:C.text4, fontSize:11, marginTop:18, fontFamily:Platform.OS==="ios"?"Menlo":"monospace" },
  reconnectWrap: { position:"absolute" as any, top:0, left:0, right:0, zIndex:90, alignItems:"center" },
  reconnectPill: { flexDirection:"row", alignItems:"center", backgroundColor:C.surface, paddingHorizontal:14, paddingVertical:8, borderRadius:20, marginTop:6, shadowColor:"#000", shadowOpacity:0.15, shadowRadius:6, shadowOffset:{width:0,height:2}, elevation:3 },
  reconnectText: { color:C.text2, fontSize:12, fontWeight:"600" },
});

// ── MAIN, APP ─────────────────────────────────────────────────
// Warm up browser for faster OAuth on iOS,


export default function App() {
  const [session, setSession]       = useState<Session|null>(null);
  const [plan, setPlan]             = useState("free");
  const [planLoaded, setPlanLoaded] = useState(false);
  const [scansLeft, setScansLeft]   = useState<number|null>(null);
  const [screen, setScreen]         = useState<Screen>("dashboard");
  // CRASH HARDENING (2026-11-08, scan->result flow crash): bumped by the
  // ErrorBoundary's retry button below to force React to remount the
  // crashed screen (same `screen` value, so React alone won't remount it -
  // getDerivedStateFromError's hasError otherwise stays true forever).
  const [screenCrashResetKey, setScreenCrashResetKey] = useState(0);
  const [history, setHistory]       = useState<Screen[]>([]);
  const [navData, setNavData]       = useState<any>(null);
  const [appReady, setAppReady]     = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  // APP-LOCK BIOMETRIC GATE (2026-10-22, NEW FEATURE - see runBiometricGate's
  // own header comment below for why this is new, not a regression fix).
  // biometricLocked blocks the render chain (see the return() below) until
  // a real Face ID/Touch ID success; biometricChecking only toggles the
  // lock screen's own copy/button while a prompt is actually in flight.
  const [biometricLocked, setBiometricLocked]     = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  // LOOP FIX (2026-10-22, MEASURED: owner stuck on "Waiting for Face ID…"
  // forever). Root cause: the native Face ID system dialog itself drives
  // AppState through inactive->active (iOS treats the overlay as the app
  // losing/regaining focus) - the OLD AppState listener called
  // runBiometricGate() on EVERY "active" event unconditionally, so the
  // dialog closing after a GENUINE success immediately fired a SECOND,
  // fully independent invocation that set biometricLocked back to true and
  // prompted again, forever. Fixed with three independent guards (see
  // runBiometricGate + the AppState listener below):
  //   1. inFlightRef - only one prompt in flight at a time, a second
  //      invocation while one is already running is a pure no-op.
  //   2. lastPromptEndRef + POST_PROMPT_COOLDOWN_MS - an "active" event
  //      landing within 3s of a prompt finishing (exactly what the dialog's
  //      own close does) is ignored outright.
  //   3. wentBackgroundAtRef + BACKGROUND_LOCK_THRESHOLD_MS - the AppState
  //      listener itself only ever re-triggers the gate on a REAL
  //      background->active return of 30s+ (tracked separately from
  //      "inactive", which the Face ID dialog produces but true
  //      backgrounding does not skip) - never on "inactive" at all.
  // promptTimestampsRef + MAX_PROMPTS_PER_WINDOW is a belt-and-suspenders
  // loop breaker on top of the three guards above: even if something else
  // re-triggers the gate, more than 2 AUTOMATIC prompts within 20s trips
  // loopBroken, which stops all automatic prompting and hands control to
  // the lock screen's own "Try Face ID"/"Sign Out" buttons - only a manual
  // tap (runBiometricGate({manual: true})) clears it and tries again.
  const BACKGROUND_LOCK_THRESHOLD_MS = 30000;
  const POST_PROMPT_COOLDOWN_MS = 3000;
  const MAX_PROMPTS_PER_WINDOW = 2;
  const PROMPT_WINDOW_MS = 20000;
  const inFlightRef = useRef(false);
  const lastPromptEndRef = useRef(0);
  const wentBackgroundAtRef = useRef<number | null>(null);
  const promptTimestampsRef = useRef<number[]>([]);
  const [loopBroken, setLoopBroken] = useState(false);
  // See attemptSessionRestore() below: true whenever a background refresh
  // (cold-launch restore OR foreground-resume) is failing for a reason that
  // says nothing about whether the session is actually valid (timeout/
  // network/5xx) - never set on a genuine rejection, which clears the
  // session and routes to sign-in instead. Purely cosmetic (ReconnectingBadge)
  // - never blocks rendering the main app, which is already showing.
  const [reconnecting, setReconnecting] = useState(false);
  const [retrying, setRetrying]     = useState(false);
  const [restoreElapsedMs, setRestoreElapsedMs] = useState(0);
  const restoreStartRef = useRef<number | null>(null);
  const restoreTickRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // The stored (pre-refresh) session kept around purely so the Retry button
  // on ReconnectingBadge has a refresh_token to retry with.
  const savedSessionRef = useRef<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [aiConsented, setAiConsented] = useState(false);
  const [firstScanNudge, setFirstScanNudge] = useState(false); // one-line prompt shown on the Scan screen, first launch only
  const firstScanAutoFired = useRef(false);  // auto-drop-into-Scan fires at most once per app session
  // CREATOR PARTNER PROGRAM (2026-11-09): skippable "have a code from a
  // creator?" step, sequenced right after AI consent and before the main
  // app - same one-shot-per-signup semantics as justSignedUpRef above (set
  // true only in handleLogin when justSignedUp is true; never persisted to
  // AsyncStorage, so a returning session reload never shows it). Entirely
  // independent of justSignedUpRef/maybeStartFirstScan - this never touches
  // or is touched by the Scan-nudge consumption below.
  const [referralPromptPending, setReferralPromptPending] = useState(false);
  // MEASURED BUG: this used to be set for ANY fresh login (sign-in OR
  // sign-up), gated only by the separate @valuiq_tour_done AsyncStorage flag
  // - that flag is unreliable (cleared by a dev reset, a reinstall, or a
  // delayed write losing a race with a force-quit), so a RETURNING user
  // could land on Scan instead of Home just because that flag happened to
  // be missing. Renamed + narrowed to true ONLY for the instant span between
  // a just-completed CREATE ACCOUNT (LoginScreen's justSignedUp, passed
  // through handleLogin) and maybeStartFirstScan consuming it - sign-in,
  // biometric quick-login, Apple/Google, and a session silently restored on
  // app boot or refreshed on foreground-resume all leave this false, so none
  // of them can ever route to Scan.
  const justSignedUpRef = useRef(false);
  // Dev-only "preview new-user flow" (Profile screen) - lets an existing
  // user with real scans/wins walk the whole first-run experience WITHOUT
  // touching their real data or signing out. previewStep drives whether the
  // preview is currently showing the value screen or is "active" (main app,
  // with preview-only overrides live - see HistoryScreen's previewNewUser
  // prop and dismissFirstScanNudge below).
  const [previewNewUser, setPreviewNewUser] = useState(false);
  const [previewStep, setPreviewStep] = useState<"value"|"active">("value");
  const fadeIn = useRef(new Animated.Value(0)).current;

  

  useEffect(() => { init(); }, []);

  // Fires once the user is fully in (logged in + consented), not just the
  // instant they agree to AI consent. Safe to re-run on every session/
  // aiConsented change (a foreground-resume refresh, for instance) -
  // maybeStartFirstScan no-ops unless justSignedUpRef is set (a CREATE
  // ACCOUNT that JUST happened via handleLogin), so a plain restart, a
  // sign-in, or a background-resume refresh can never trigger it.
  useEffect(() => {
    if (session && aiConsented) maybeStartFirstScan();
  }, [session, aiConsented]);

  // Re-verify identity when the app returns from the background.
  // Without this, the access token goes stale while backgrounded and the
  // app falls back to a generic profile (no name / no admin / free plan).
  //
  // MEASURED BUG (2026-08-31): this used to call refreshToken() on EVERY
  // foreground resume, unconditionally - Supabase always mints a brand-new
  // access_token JWT on that grant, even when the current one still had
  // most of its life left. Every client-side cache in lib/api.ts (profile/
  // scan-history/thrift-runs) is now keyed on the stable user id rather
  // than the raw token (see stableIdFromToken), so a refresh no longer
  // orphans it - but refreshing a token that's nowhere near expiry is still
  // pointless network + latency on every single app-switch. Now only
  // actually refreshes when the CURRENT token is within 5 minutes of
  // expiring (isTokenNearExpiry, decoded locally from the JWT - no network
  // call needed to check).
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      // Real backgrounding only - NEVER "inactive", which is exactly what
      // the native Face ID system dialog itself produces as it overlays the
      // app (see the LOOP FIX comment above biometricLocked's declaration).
      // Tracking this separately from "active" below is what lets the gate
      // tell "the user actually left and came back" apart from "the Face ID
      // prompt itself just blipped focus."
      if (state === "background") {
        wentBackgroundAtRef.current = Date.now();
        return;
      }
      if (state === "active") {
        try {
          const saved = await loadSession();
          if (saved && saved.refresh_token) {
            savedSessionRef.current = saved;
            // RESUME - see runBiometricGate's header comment. Only an
            // actual background->active return of BACKGROUND_LOCK_
            // THRESHOLD_MS+ re-triggers the gate - never "inactive" (the
            // Face ID dialog's own blip), and never a brief app-switcher
            // peek under the threshold. One real success stays unlocked
            // until the app has genuinely been away this long.
            const bgAt = wentBackgroundAtRef.current;
            wentBackgroundAtRef.current = null;
            if (bgAt != null && Date.now() - bgAt >= BACKGROUND_LOCK_THRESHOLD_MS) {
              runBiometricGate();
            }
            if (!isTokenNearExpiry(saved.access_token)) return;
            const refreshed = await refreshToken(saved.refresh_token);
            await saveSession(refreshed);
            await syncBiometricToken(refreshed);
            setSession(refreshed);
            setReconnecting(false);
            await loadUserData(refreshed.access_token);
          }
        } catch (e) {
          // On a genuine rejection, the session really is dead - same rule
          // as attemptSessionRestore. On anything network-shaped, do NOT
          // clear the session - a transient refresh failure on resume must
          // never log the user out or drop them to free; surface the small
          // badge instead.
          if (e instanceof SessionRestoreNetworkError) {
            console.log("[DIAG resume] refresh network trouble:", String(e));
            setReconnecting(true);
          } else {
            console.log("[DIAG resume] refresh rejected, signing out:", String(e));
            await clearSession();
            setSession(null);
          }
        }
      }
    });
    return () => { sub.remove(); };
  }, []);

  useEffect(() => {
    if (splashDone && appReady) {
      Animated.timing(fadeIn, { toValue:1, duration:300, useNativeDriver:true }).start();
    }
  }, [splashDone, appReady]);

  // ── SESSION RESTORE TIMER (owner-only debug readout) ────────────────────
  function startRestoreTimer() {
    restoreStartRef.current = Date.now();
    setRestoreElapsedMs(0);
    if (restoreTickRef.current) clearInterval(restoreTickRef.current);
    restoreTickRef.current = setInterval(() => {
      if (restoreStartRef.current != null) setRestoreElapsedMs(Date.now() - restoreStartRef.current);
    }, 200);
  }
  function stopRestoreTimer() {
    if (restoreTickRef.current) { clearInterval(restoreTickRef.current); restoreTickRef.current = null; }
    if (restoreStartRef.current != null) setRestoreElapsedMs(Date.now() - restoreStartRef.current);
  }

  // INCIDENT (2026-10-06): Supabase Auth going unhealthy made refreshToken()
  // time out on every cold launch - the old code BLOCKED first paint on
  // that refresh (LoadingGate, then a full-screen "Connecting…" gate),
  // so a slow backend (measured: 8019ms, the moat backfill's write load
  // hammering the same DB auth sits on) looked exactly like a hang and
  // took a third force-close to escape. Fix, two parts:
  //   1. OPTIMISTIC RESTORE - a stored session renders Home IMMEDIATELY
  //      (setSession+setAppReady before any network call), never blocked
  //      on refreshToken() resolving at all. The refresh still happens,
  //      just in the background.
  //   2. Only a GENUINE rejection (expired/revoked/invalid refresh token)
  //      ever signs the user out. Anything network-shaped (timeout,
  //      unreachable, 5xx - refreshToken() throws SessionRestoreNetworkError
  //      for all of these, never for a real rejection) leaves the already-
  //      rendered session exactly as it is and shows the small, non-
  //      blocking ReconnectingBadge instead - never routes to sign-in.
  //
  // Bounded to ONE silent retry, never more - see HOUSEKEEPING.md's
  // "Refresh now" retry-loop incident for why an uncapped auto-retry here
  // would be the same mistake again, just moved to a different button.
  // APP-LOCK BIOMETRIC GATE (2026-10-22, NEW - not a regression fix. MEASURED:
  // authenticateWithBiometrics() (src/lib/biometrics.ts) has never, in this
  // app's entire git history, been called from App.tsx - it was only ever
  // reachable from the SIGNED-OUT LoginScreen's own quick-login button
  // (src/screens/LoginScreen.tsx:68). A restored session (attemptSessionRestore
  // below) skips LoginScreen entirely, so nothing has ever prompted Face ID
  // on a normal cold start or background->foreground resume with a saved
  // session - "the app goes straight into the signed-in account" is this
  // feature's absence, not a broken wire. This closes that gap: runs on
  // cold start (attemptSessionRestore, once a session exists) and on every
  // background->active transition (the AppState listener below) whenever
  // the user has Face ID enabled (ProfileScreen.tsx's toggle, src/lib/
  // biometrics.ts's isBiometricEnabled()).
  //
  // Device hardware/enrollment changing AFTER the toggle was enabled (Face
  // ID turned off in iOS Settings, say) can't be enforced from here -
  // gracefully skips the lock rather than trapping the user with no way
  // in. A genuine prompt on available hardware that fails or is cancelled,
  // however, never clears the lock - biometricLocked only ever goes false
  // on a real authenticateWithBiometrics() success (or the "Sign Out"
  // escape hatch on the lock screen itself, which routes to LoginScreen,
  // never into the account).
  async function runBiometricGate(opts?: { manual?: boolean }) {
    const manual = !!opts?.manual;

    // GUARD 1 - only one prompt in flight at a time. A second invocation
    // (e.g. the AppState listener firing again while the first is still
    // awaiting authenticateWithBiometrics()) is a pure no-op, never a second
    // overlapping prompt.
    if (inFlightRef.current) return;
    // GUARD 2 - a cooldown after a prompt just finished. This is what
    // actually breaks the loop: the Face ID system dialog closing drives
    // AppState to "active" within milliseconds of this function's own
    // finally block running, and that re-fire must never start a fresh
    // prompt. A MANUAL tap (the lock screen's own button) bypasses this -
    // the user asking again is never "too soon."
    if (!manual && Date.now() - lastPromptEndRef.current < POST_PROMPT_COOLDOWN_MS) return;

    try {
      const enabled = await isBiometricEnabled();
      if (!enabled) { setBiometricLocked(false); return; }
      const avail = await isBiometricAvailable();
      if (!avail.available) { setBiometricLocked(false); return; }

      if (manual) {
        // A deliberate user tap always gets a clean attempt - never trips
        // or stays tripped by the loop breaker below.
        promptTimestampsRef.current = [];
        setLoopBroken(false);
      } else {
        // GUARD 3/LOOP BREAKER - belt-and-suspenders on top of Guards 1/2:
        // more than MAX_PROMPTS_PER_WINDOW AUTOMATIC prompts inside
        // PROMPT_WINDOW_MS stops auto-prompting entirely and hands control
        // to the lock screen's own "Try Face ID"/"Sign Out" buttons - never
        // another automatic prompt until the user taps one.
        const now = Date.now();
        promptTimestampsRef.current = promptTimestampsRef.current.filter(t => now - t < PROMPT_WINDOW_MS);
        if (promptTimestampsRef.current.length >= MAX_PROMPTS_PER_WINDOW) {
          setBiometricLocked(true);
          setLoopBroken(true);
          return;
        }
      }
      promptTimestampsRef.current.push(Date.now());

      inFlightRef.current = true;
      setBiometricLocked(true);
      setBiometricChecking(true);
      const auth = await authenticateWithBiometrics();
      if (auth.success) setBiometricLocked(false);
      // else: stays locked - the lock screen's own "Try Face ID" is the
      // only thing that re-invokes this function from here (manual:true).
    } finally {
      inFlightRef.current = false;
      lastPromptEndRef.current = Date.now();
      setBiometricChecking(false);
    }
  }

  async function attemptSessionRestore(saved: Session) {
    savedSessionRef.current = saved;
    // Render NOW, optimistically, with whatever's on disk - a stale access
    // token for a few seconds is a far better failure mode than a blocked
    // launch. loadUserData/hydrateAvatarCache below re-fire once the
    // refresh actually confirms, correcting anything that was stale.
    setSession(saved);
    setAppReady(true);
    setReconnecting(false);
    startRestoreTimer();
    // COLD START - not awaited: manages its own state (biometricLocked)
    // and must never block the token-refresh work below it.
    runBiometricGate();
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const refreshed = await refreshToken(saved.refresh_token);
        console.log("[DIAG init] refresh OK len=", refreshed?.access_token?.length || 0);
        await saveSession(refreshed);
        await syncBiometricToken(refreshed);
        setSession(refreshed);
        setReconnecting(false);
        // Deliberately NOT awaited: plan/scan-count are UI-fill-in data, not
        // launch-blocking data - see loadUserData's own comment.
        loadUserData(refreshed.access_token);
        hydrateAvatarCache(refreshed.access_token);
        stopRestoreTimer();
        return;
      } catch (e) {
        const networkTrouble = e instanceof SessionRestoreNetworkError;
        console.log(`[DIAG init] refresh attempt ${attempt} failed (networkTrouble=${networkTrouble}):`, String(e));
        if (networkTrouble && attempt < MAX_ATTEMPTS) continue; // one silent retry, no delay needed - fetchWithTimeout already spent 4s
        stopRestoreTimer();
        if (networkTrouble) {
          // Can't reach the server - NOT a verdict on this session, and
          // Home is already showing (optimistic render above). Small badge
          // only, never a route to sign-in.
          setReconnecting(true);
        } else {
          // Genuine rejection - the ONLY case that signs the user out.
          setReconnecting(false);
          await clearSession();
          setSession(null);
        }
        return;
      }
    }
  }

  async function handleRetryConnect() {
    if (!savedSessionRef.current || retrying) return;
    setRetrying(true);
    try {
      await attemptSessionRestore(savedSessionRef.current);
    } finally {
      setRetrying(false);
    }
  }

  async function init() {
    // FIXED FONT SCALE (2026-11-11, bisect) - moved out of index.ts's
    // module scope into here (after first render - init() runs from a
    // mount useEffect, which fires post-paint) deliberately: see
    // disableFontScaling.ts's own header for why its old module-scope,
    // deep-require version was the prime suspect in this app's OTA
    // launch-crash bisect.
    disableFontScaling();
    // SUSPECTED-CRASH CHECK (2026-11-08, crash-trip audit) - this app has
    // no native crash reporter (no Sentry/Bugsnag/Crashlytics), so a true
    // native crash (OOM/watchdog) is otherwise completely invisible - it
    // never runs any JS, so it can't log anything AT the moment it
    // happens. src/lib/scanStage.ts's marker is written at each scan
    // stage and cleared on a clean result/New Scan/caught error
    // (ScannerScreen.tsx) - if it's STILL set on this cold launch, the
    // previous session died mid-scan without reaching any of those clean
    // end states. Fire-and-forget, never blocks first paint - reads and
    // clears the marker regardless of whether the report itself lands.
    (async () => {
      const suspected = await readScanStage();
      if (!suspected) return;
      await clearScanStage();
      logEvent("", "client_crash_suspected", {
        stage: suspected.stage,
        msSinceMarked: Date.now() - suspected.at,
        updateId: Updates.updateId || null,
        channel: Updates.channel || null,
        runtimeVersion: Updates.runtimeVersion || null,
        platform: `${Platform.OS} ${Platform.Version}`,
      }).catch(() => {});
    })();
    // STARTUP ERROR TRAP REPORT (2026-11-11, OTA crash incident) -
    // startupErrorTrap.ts (index.ts, required before anything else) stores
    // whatever it caught in AsyncStorage key "lastStartupError" and
    // StartupErrorBoundary shows it on screen if present. This is the
    // THIRD leg: once this line runs, the app has clearly survived past
    // its own startup window, so report what was caught (if anything) to
    // the same telemetry every other crash signal here uses, then clear
    // it - never re-reported on a later launch that didn't repeat it.
    // Fire-and-forget, same posture as the block above.
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("lastStartupError");
        if (!raw) return;
        await AsyncStorage.removeItem("lastStartupError");
        const parsed = JSON.parse(raw);
        const err = new Error(parsed?.message || "startup error (no message captured)");
        err.name = parsed?.name || "Error";
        err.stack = parsed?.stack || "";
        logClientError("", err, {
          context: "startup_error_trap",
          isFatal: parsed?.isFatal ?? null,
          startupUpdateId: parsed?.updateId ?? null,
          startupIsEmbeddedLaunch: parsed?.isEmbeddedLaunch ?? null,
          startupTimestamp: parsed?.timestamp ?? null,
        });
      } catch {}
    })();
    // MEASURED BUG: this app had zero custom expo-updates code anywhere,
    // running purely on the SDK default (checkAutomatically: "ON_LOAD") -
    // that mode checks for and DOWNLOADS an update on a cold launch, but
    // only APPLIES it on the launch AFTER that one. Three separate OTA
    // publishes each looked like "did nothing" because testing was one
    // relaunch per publish - the fix was silently sitting downloaded,
    // waiting for a second relaunch that never came. Explicitly checking
    // and, if found, fetching + reloading BEFORE anything else renders
    // means an update applies on the very next launch after it's
    // published, not the one after that. Skipped entirely in dev (Expo Go/
    // dev client have no embedded update channel and checkForUpdateAsync
    // throws immediately there anyway - caught below, but skipping is
    // cheaper and avoids a pointless network round trip every dev reload).
    if (!__DEV__) {
      try {
        // Bounded the same way every other network call in this file is
        // (see api.ts's INCIDENT comment) - an unreachable/slow update
        // service must never hang first paint. A missed check here just
        // means this launch runs on the current bundle and tries again
        // next launch, which is the ORIGINAL (acceptable) behavior -
        // strictly better than reintroducing a black-screen-on-launch bug
        // for the sake of applying updates one launch sooner.
        const check = await withTimeout(Updates.checkForUpdateAsync(), 3000);
        if (check.isAvailable) {
          await withTimeout(Updates.fetchUpdateAsync(), 8000);
          await Updates.reloadAsync();
          return; // reloadAsync restarts the JS runtime - nothing below this line will run
        }
      } catch (e) {
        console.log("[DIAG update-check] failed:", String(e));
        // Only console.log'd before this - invisible in production, so a
        // check that silently fails on every launch (network, store policy,
        // timeout) looked identical to "no update published yet" with no
        // way to tell them apart after the fact. Reported the same
        // best-effort way as the crash-suspected check above.
        logClientError("", e instanceof Error ? e : new Error(String(e)), {
          context: "ota_update_check",
          updateId: Updates.updateId || null,
          channel: Updates.channel || null,
          runtimeVersion: Updates.runtimeVersion || null,
        });
      }
    }
    // Check if user has seen onboarding,
    try {
      const seen = await AsyncStorage.getItem("@valuiq_onboarded");
      if (seen === "true") setOnboarded(true);
      const consent = await AsyncStorage.getItem("@valuiq_ai_consent");
      console.log("[DIAG init] consent read =", consent); if (consent === "true") setAiConsented(true);
      const preview = await AsyncStorage.getItem("@valuiq_preview_new_user");
      if (preview === "true") { setPreviewNewUser(true); setPreviewStep("value"); }
    } catch {}
    const saved = await loadSession(); console.log("[DIAG init] loadSession =", saved ? "FOUND" : "NONE");
    if (saved) {
      // MEASURED BUG: DashboardScreen's plan badge used to sit on a
      // textless skeleton pill for however long loadUserData's getPlan/
      // getScanCount took to resolve - up to ~25s in the worst case (two
      // sequential timeouts + a retry delay) on a cold backend, a
      // conspicuously "stalled" oval for a returning user whose plan we
      // already know from last time. A local, instantly-available last-
      // known plan (written by loadUserData whenever it succeeds) lets a
      // RETURNING user skip the skeleton entirely - loadUserData below still
      // fires and corrects it moments later if the plan actually changed
      // since last launch. Scoped inside `if (saved)` (a session is actually
      // about to be restored) and cleared on logout (handleLogout) so it can
      // never leak one account's plan onto a different account's fresh
      // login on a shared device.
      try {
        const lastPlan = await AsyncStorage.getItem(LAST_PLAN_KEY);
        if (lastPlan) { setPlan(lastPlan); setPlanLoaded(true); }
      } catch {}
      // Sets appReady itself once it reaches a verdict (signed in, really
      // logged out, or connecting-trouble) - see attemptSessionRestore above.
      await attemptSessionRestore(saved);
      return;
    }
    setAppReady(true);
  }

  async function loadUserData(token:string) {
    // getPlan/getScanCount are independent reads - running them in parallel
    // (was sequential) roughly halves the common-case wait before the
    // dashboard's plan badge/scan counter can resolve.
    //
    // OUTAGE FIX (2026-10-07): this used to retry getPlan once after a
    // 1200ms delay on a null result - a second request-fail-no-backoff
    // round trip during exactly the moment the backend is already
    // struggling. Fail once, show whatever's cached/stale (same honest-
    // degradation rule getProfileData/getScanHistory already follow) -
    // getPlan itself still gets deduped against any other in-flight call
    // for the same user (see lib/api.ts's dedupedCall).
    const [p, count] = await Promise.all([getPlan(token), getScanCount(token)]);
    if (p !== null) {
      setPlan(p);
      try { await AsyncStorage.setItem(LAST_PLAN_KEY, p); } catch {}
      const paid = ["seller","pro","lifetime","titan"].includes(p);
      setScansLeft(paid ? null : Math.max(0, 10 - count));
    }
    setPlanLoaded(true);
  }

  async function handleLogin(s:Session, justSignedUp?: boolean) {
    // No explicit setScreen("dashboard") here: `screen` already defaults to
    // "dashboard" and handleLogout already resets it there too, so this was
    // redundant - and, worse, racing the first-scan effect below (both fire
    // off the same `session` change) meant it could stomp a same-tick
    // navigate("scanner") for an already-consented user replaying first
    // launch via the dev reset.
    justSignedUpRef.current = !!justSignedUp;
    if (justSignedUp) setReferralPromptPending(true);
    setSession(s);
    await loadUserData(s.access_token);
  }

  async function handleLogout() {
    await clearSession();
    try { await AsyncStorage.removeItem(LAST_PLAN_KEY); } catch {}
    setSession(null); setPlan("free"); setPlanLoaded(false); setScansLeft(null); setScreen("dashboard");
  }

  const token = session?.access_token || "";

  // SALE-CAPTURE MOAT: the notification-tap half of the loop. Registered
  // once at app root (matches the AppState listener above) so a tap routes
  // to the capture form no matter which screen is currently active - the
  // scan-history row is fetched fresh (not read off any screen's local
  // state) since the tapped notification can be up to ~12 days old and the
  // app may have been killed and relaunched since it fired.
  const [tapScan, setTapScan] = useState<any|null>(null);
  useEffect(() => {
    const sub = addSaleCheckInTapListener(async (scanId) => {
      if (!token) return;
      const row = await getScanById(token, scanId);
      if (row) setTapScan(row);
    });
    return () => sub.remove();
  }, [token]);

  // First scan (shutter press, barcode capture, or Analyze) has happened -
  // retire the nudge for good so it never shows again on this install.
  // In preview mode this must NOT touch the real @valuiq_tour_done flag -
  // that flag belongs to the tester's actual account, and preview is
  // explicitly promised to leave real state untouched.
  async function dismissFirstScanNudge() {
    setFirstScanNudge(false);
    if (previewNewUser) return;
    try { await AsyncStorage.setItem("@valuiq_tour_done", "true"); } catch {}
  }
  // Toggled from Profile's dev-only "Preview new-user flow" button. Turning
  // it ON resets the LOCAL preview state machine (back to the value screen)
  // without clearing any real AsyncStorage flag or deleting any real data -
  // turning it OFF just drops the override, instantly restoring the
  // tester's normal view (nothing to re-fetch, their real state was never
  // touched). Persisted so backgrounding/reopening mid-preview doesn't lose it.
  async function togglePreviewNewUser() {
    const next = !previewNewUser;
    setPreviewNewUser(next);
    setPreviewStep("value");
    if (!next) setFirstScanNudge(false);
    try { await AsyncStorage.setItem("@valuiq_preview_new_user", next ? "true" : "false"); } catch {}
  }
  // Brand-new users land straight on Scan (not Dashboard) with the nudge,
  // right after AI consent - fires at most once per app session.
  function maybeStartFirstScan() {
    if (firstScanAutoFired.current) return;
    // Consume-and-clear: only a CREATE ACCOUNT that JUST happened
    // (LoginScreen's justSignedUp -> handleLogin -> justSignedUpRef) can
    // route to Scan. Sign-in, biometric quick-login, Apple/Google, a
    // silently-restored session (app restart), and a foreground-resume
    // refresh all leave this false, so none of them can trigger it - a
    // RETURNING user always lands on Home/Dashboard. No AsyncStorage flag
    // involved anymore (the old @valuiq_tour_done gate was unreliable -
    // cleared by a dev reset/reinstall/lost race with a force-quit - and a
    // missing local flag must never look like a brand-new account).
    const justSignedUp = justSignedUpRef.current;
    justSignedUpRef.current = false;
    if (!justSignedUp) return;
    firstScanAutoFired.current = true;
    setFirstScanNudge(true);
    navigate("scanner");
  }
  function navigate(s: Screen, data?: any) {
    setNavData(data ?? null);
    // Tab bar screens reset history; tool screens push to stack,
    const TAB_SCREENS: Screen[] = ["scanner","dashboard","history","community","profile","upgrade"];
    if (TAB_SCREENS.includes(s)) {
      setHistory([]);
    } else {
      setHistory(prev => [...prev, screen]);
    }
    setScreen(s);
  }

  function goBack() {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(h => h.slice(0, -1));
      setScreen(prev);
    } else {
      setScreen("dashboard");
    }
  }

  const props = { token, refreshToken: session?.refresh_token || "", plan, planLoaded, userId: session?.user?.id, scansLeft, setScansLeft, onNavigate:navigate, onBack:goBack, onLogout:handleLogout, navData, firstScanNudge, onDismissFirstScanNudge: dismissFirstScanNudge, previewNewUser, onTogglePreviewNewUser: togglePreviewNewUser };

  const SCREENS: Record<Screen,React.ReactNode> = {
    "scanner":      <ScannerScreen {...props} />,
    "dashboard":    <DashboardScreen {...props} />,
    "thrift-run":   <ThriftRunScreen {...props} />,
    "specialty":    <SpecialtyScreen {...props} />,
    "import-sales": <ImportSalesScreen {...props} />,
    "deathpile":    <DeathPileScreen {...props} />,
    "community":    <CommunityScreen {...props} />,
    "profile":      <ProfileScreen {...props} />,
    "upgrade":      <UpgradeScreen token={token} plan={plan} userId={session?.user?.id} onNavigate={navigate} onBack={goBack} />,
    "relist":       <RelisterScreen {...props} />,
    "hot-now":      <HotNowScreen {...props} />,
      "demand-radar": <DemandRadarScreen {...props} />,
      "reseller-gps": <ResellerGPSScreen {...props} />,
      "cashflow": <CashFlowScreen {...props} />,
      "listing-writer": <ListingWriterScreen {...props} />,
      "viral-content": <ViralContentScreen {...props} />,
      "price-battle": <PriceBattleScreen {...props} />,
      "negotiate": <NegotiateScreen {...props} />,
      "sourcing-intel": <SourcingIntelScreen {...props} />,
      "bundle-builder": <BundleBuilderScreen {...props} />,
      "flip-score": <FlipScoreScreen {...props} />,
    "arbitrage":    <ArbitrageScreen {...props} />,
    "bundle":       <BundleBuilderScreen {...props} />,
    "alerts":       <SourcingAlertsScreen {...props} />,
    "leaderboard":  <CommunityScreen {...props} />,
    "inventory":    <InventoryScreen {...props} />,
    "profit-tracker":<ProfitTrackerScreen {...props} />,
    "ai-coach":     <AICoachScreen {...props} />,
    "profit-tracker": <ProfitTrackerScreen {...props} />,
    "history":      <HistoryScreen {...props} />,
    "scan-confirm": <ScanConfirmScreen {...props} />,
    "faq":          <FAQScreen {...props} />,
    "admin":        <AdminScreen {...props} />,
    "sold-data-debug": screen === "sold-data-debug" ? renderSoldDataDebugScreen({ token, onBack: goBack }) : null,
    "titan":     hasProAccess(plan) ? <BusinessApp token={token} refreshToken={session?.refresh_token || ""} plan={plan} userEmail={session?.user?.email || ""} scansLeft={scansLeft} setScansLeft={setScansLeft} onLogout={handleLogout} /> : <UpgradeScreen {...props} />,
  };

  const TAB_SCREENS: Screen[] = ["scanner","dashboard","history","community","profile"];
  const activeTab = TAB_SCREENS.includes(screen) ? screen : null;

  // "Upgrade" removed from the tab bar - it stays fully routable (Profile's
  // upgrade card, Dashboard's upgrade nudge, and feature-gate paywall
  // prompts all still call onNavigate("upgrade")), just no longer a
  // permanent slot in a now-6-wide bar. "Dashboard" -> "Home" since it was
  // the one label actually truncating at 6 tabs (now 5).
  const TABS = [
    { id:"scanner"   as Screen, icon:"📷", label:"Scan"    },
    { id:"dashboard" as Screen, icon:"⚡", label:"Home"    },
    { id:"history"   as Screen, icon:"🏆", label:"Wins"    },
    { id:"community" as Screen, icon:"🔥", label:"Feed"    },
    { id:"profile"   as Screen, icon:"👤", label:"Profile" },
  ];

  // Gates the owner-only elapsed-time readout on LoadingGate/ReconnectingBadge
  // - checked against whichever session we actually know about right now
  // (the stored pre-refresh one while still restoring, the live one once
  // signed in).
  const isOwner = OWNER_EMAILS.includes((savedSessionRef.current?.user?.email || session?.user?.email || "").toLowerCase());

  return (
    <SafeAreaProvider>
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {/* SplashScreen only for its own fixed-length brand animation; once
          that's done, if session restore is STILL not resolved, LoadingGate
          takes over instead of going blank (SplashScreen's own opacity has
          already animated to 0 by the time its animation completes,
          independent of appReady) - see LoadingGate's comment. Neither is
          gated on planLoaded: that depends on a backend call (getPlan/
          getScanCount) that can be slow on a cold start, and the main UI
          must render with default plan="free"/scansLeft=null, filling in
          once loadUserData resolves. */}
      {!splashDone && <SplashScreen onDone={()=>setSplashDone(true)} />}
      {splashDone && !appReady && <LoadingGate elapsedMs={restoreElapsedMs} showDebug={isOwner} />}
      {/* Non-blocking - a background refresh having trouble never hides the
          app underneath it (see attemptSessionRestore's optimistic restore). */}
      {reconnecting && (
        <ReconnectingBadge
          elapsedMs={restoreElapsedMs}
          retrying={retrying}
          onRetry={handleRetryConnect}
          showDebug={isOwner}
        />
      )}
      <Animated.View style={[{flex:1}, {opacity:fadeIn}]}>
        {biometricLocked && session ? (
          // APP-LOCK BIOMETRIC GATE - see runBiometricGate's header comment.
          // Takes priority over every other branch below (preview/
          // onboarding/consent/main app) whenever it's true - nothing past
          // this point renders until a real Face ID/Touch ID success.
          <View style={{flex:1, backgroundColor:C.bg, alignItems:"center", justifyContent:"center", padding:24}}>
            <Text style={{fontSize:40, marginBottom:16}}>{"🔐"}</Text>
            <Text style={{color:C.text1, fontSize:18, fontWeight:"800", marginBottom:8, textAlign:"center"}}>Unlock ValuIQ</Text>
            <Text style={{color:C.text3, fontSize:13, marginBottom:24, textAlign:"center"}}>
              {biometricChecking
                ? "Waiting for Face ID…"
                : loopBroken
                  ? "Face ID kept re-prompting - tap below to try again when you're ready."
                  : "Face ID is required to continue."}
            </Text>
            {!biometricChecking && (
              <TouchableOpacity
                style={{backgroundColor:C.green, borderRadius:14, paddingVertical:14, paddingHorizontal:32, marginBottom:12}}
                onPress={() => runBiometricGate({ manual: true })}
              >
                <Text style={{color:C.greenDark, fontWeight:"900", fontSize:15}}>Try Face ID</Text>
              </TouchableOpacity>
            )}
            {/* Escape hatch - never a route INTO the account, only out to
                LoginScreen. Without this, a device whose Face ID genuinely
                stops working after being enabled would have no recovery.
                Always rendered (no biometricChecking gate) - the lock screen
                must never be able to strand the user without this, loop or
                no loop. */}
            <TouchableOpacity onPress={async () => { await clearSession(); setSession(null); setBiometricLocked(false); setLoopBroken(false); }}>
              <Text style={{color:C.text4, fontSize:13, fontWeight:"700"}}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : previewNewUser && previewStep === "value" && session && aiConsented ? (
          // PREVIEW: the real value screen, shown on top of an already-
          // logged-in/consented session - onComplete here advances the
          // LOCAL preview state machine only (never touches @valuiq_onboarded
          // or @valuiq_tour_done), then drops straight into Scan with the
          // guided-first-scan nudge live, exactly like a true first launch.
          <OnboardingScreen onComplete={() => {
            setPreviewStep("active");
            setFirstScanNudge(true);
            navigate("scanner");
          }} />
        ) : !session ? (
            !onboarded
              ? <OnboardingScreen onComplete={async () => {
                try { await AsyncStorage.setItem("@valuiq_onboarded","true"); } catch {}
                setOnboarded(true);
              }} />
              : <LoginScreen onLogin={handleLogin} />
        ) : !aiConsented ? (
          <AIConsentScreen onAgree={async () => {
            try {
              await AsyncStorage.setItem("@valuiq_ai_consent", "true");
              const chk = await AsyncStorage.getItem("@valuiq_ai_consent");
              if (chk !== "true") await AsyncStorage.setItem("@valuiq_ai_consent", "true");
            } catch (e) { console.warn("consent save failed", e); }
            setAiConsented(true);
          }} />
        ) : referralPromptPending && !previewNewUser ? (
          // Preview mode skips this too (previewNewUser guard) - same
          // reasoning as dismissFirstScanNudge: preview must never show
          // one-time real-account UI to a tester walking the preview flow.
          <ReferralCodeEntry token={token} mode="screen" onDone={() => setReferralPromptPending(false)} />
        ) : (
          <View style={s.root}>
            <View style={{flex:1}}>
              {/* CRASH HARDENING (2026-11-08, scan->result flow crash):
                  a bad/unexpected field in a scan result (or any other
                  screen) now degrades to a retry fallback instead of
                  taking the whole app down. Scoped per-screen (key
                  includes `screen`) so switching tabs always gets a clean
                  mount; screenCrashResetKey lets the retry button force a
                  remount of the SAME screen without navigating away. */}
              <ErrorBoundary
                key={`${screen}-${screenCrashResetKey}`}
                fallbackMessage="Couldn't read that one. Try again."
                // SAFE-AREA FIX (2026-11-12, scan-retry item 5): this
                // boundary wraps the WHOLE active tab, replacing every
                // screen's own top SafeAreaView the instant it falls back -
                // without this, the fallback card rendered flush against
                // the physical top of the screen, under the status
                // bar/clock, since fallbackInSafeArea defaults false (the
                // right default for every OTHER, narrower ErrorBoundary use
                // that still sits inside a parent SafeAreaView).
                fallbackInSafeArea
                onRetry={() => setScreenCrashResetKey(k => k + 1)}
                onError={(error, info) => logClientError(token || "", error, { screen, componentStack: info?.componentStack?.slice(0, 1000) })}
              >
                {SCREENS[screen]}
              </ErrorBoundary>
            </View>
            {/* GRAY BAND FIX (2026-11-06, item 2): this SafeAreaView had no
                `edges` prop, so react-native-safe-area-context's default
                (all four sides) padded its TOP by insets.top too - a chunk
                of ITS OWN C.surface background sitting above the actual tab
                icons, on every screen, below whatever content each screen
                scrolled. Only the bottom inset is real here; top/left/right
                insets belong to each screen's own SafeAreaView above. */}
            <SafeAreaView edges={["bottom","left","right"]} style={{backgroundColor:C.surface}}>
              <View style={s.tabBar}>
                {TABS.map(t => {
                  const active = activeTab === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id} style={s.tabItem}
                      // HISTORY RESULTS REUSE (stale-state fix): was a bare
                      // setScreen(t.id), which left `navData` exactly as it
                      // was - so tapping the Scan tab after ScannerScreen
                      // had been opened with { viewScan } (History's "View
                      // result", or a just-completed re-run) silently
                      // reopened that SAME saved result instead of a fresh
                      // camera, on the very next remount (App.tsx renders
                      // SCREENS[screen], one screen node at a time, so
                      // ScannerScreen remounts here and reads whatever
                      // navData still holds). navigate() already resets
                      // both navData and the back-stack for every tab
                      // screen (see its own comment) - using it here
                      // instead makes a direct tab tap behave the same as
                      // every other way of reaching a tab.
                      onPress={()=>navigate(t.id)}
                      onLongPress={t.id === "profile" ? () => {
                        const { Alert } = require("react-native");
                        Alert.alert("Sign Out", "Sign out of ValuIQ?", [
                          { text: "Cancel", style: "cancel" },
                          { text: "Sign Out", style: "destructive", onPress: handleLogout }
                        ]);
                      } : undefined}
                      activeOpacity={0.7}
                    >
                      {/* Nav bar Profile tab is ALWAYS the generic icon -
                          never the user's photo. The photo shows only in
                          the Dashboard header and the Profile card; putting
                          it here too was what broke the tab bar's
                          uniformity in the first place. */}
                      <Text style={s.tabIcon}>{t.icon}</Text>
                      <Text style={[s.tabLabel, active && {color:C.green, fontWeight:"700"}]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {t.label}
                      </Text>
                      {active && <View style={s.tabDot}/>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SafeAreaView>
            {/* Global: a tapped "Did it sell?" notification opens straight to
                the capture form for that scan, regardless of which tab is
                active underneath. onSaved only clears caches - onClose is
                the sole place `tapScan` is nulled (see LogSaleModal's own
                comment on why: clearing `scan` mid-reveal would unmount the
                Modal underneath the reveal it just opened). */}
            <LogSaleModal
              visible={!!tapScan}
              token={token}
              scan={tapScan ? toPendingScan(tapScan) : null}
              onClose={() => setTapScan(null)}
              onSaved={() => invalidateScanHistoryCache(token)}
            />
          </View>
        )}
      </Animated.View>
    </View>
  </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root:    { flex:1, backgroundColor:C.bg },
  // paddingHorizontal on both dropped to 0 (was 2/1) when this went from 5
  // to 6 tabs - reclaims a few px per tab rather than shrinking icon/label
  // font sizes, which were already near the floor for legibility.
  tabBar:  { flexDirection:"row", borderTopWidth:1, borderTopColor:C.border, paddingTop:6, paddingBottom:Platform.OS==="ios"?0:6, paddingHorizontal:0 },
  tabItem: { flex:1, alignItems:"center", paddingBottom:4, paddingHorizontal:0 },
  tabIcon: { fontSize:18, marginBottom:1 },
  tabLabel:{ color:C.text4, fontSize:8, fontWeight:"600" },
  tabDot:  { width:3, height:3, borderRadius:1.5, backgroundColor:C.green, marginTop:2 },
});

