import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, StatusBar, Platform,
  ActivityIndicator, TouchableOpacity, Animated, Dimensions, AppState
} from "react-native";
import { C } from "./src/lib/theme";
import LogoBadge from "./src/components/LogoBadge";
import ScopeBackground from "./src/components/ScopeBackground";
import { Session, loadSession, saveSession, clearSession, getPlan, getScanCount, refreshToken, isTokenNearExpiry, hasProAccess, hydrateAvatarCache } from "./src/lib/api";
import { supabase } from "./src/lib/supabase";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isBiometricEnabled, saveBiometricRefreshToken } from "./src/lib/biometrics";
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
import AIConsentScreen from "./src/screens/AIConsentScreen";
import AICoachScreen from "./src/screens/AICoachScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import FAQScreen from "./src/screens/FAQScreen";
import AdminScreen from "./src/screens/AdminScreen";
import BusinessApp from "./src/screens/business/BusinessApp";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export type Screen =
  "scanner"|"dashboard"|"thrift-run"|
  "specialty"|"manifest"|"deathpile"|"community"|
  "profile"|"relist"|"hot-now"|"arbitrage"|"upgrade"|
  "bundle"|"alerts"|"leaderboard"|"inventory"|"profit-tracker"|"deal-hunter"|"ai-coach"|"history"|"faq"|"admin"|"titan"|"import-sales";

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
});

// ── MAIN, APP ─────────────────────────────────────────────────
// Warm up browser for faster OAuth on iOS,


export default function App() {
  const [session, setSession]       = useState<Session|null>(null);
  const [plan, setPlan]             = useState("free");
  const [planLoaded, setPlanLoaded] = useState(false);
  const [scansLeft, setScansLeft]   = useState<number|null>(null);
  const [screen, setScreen]         = useState<Screen>("dashboard");
  const [history, setHistory]       = useState<Screen[]>([]);
  const [navData, setNavData]       = useState<any>(null);
  const [appReady, setAppReady]     = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [aiConsented, setAiConsented] = useState(false);
  const [firstScanNudge, setFirstScanNudge] = useState(false); // one-line prompt shown on the Scan screen, first launch only
  const firstScanAutoFired = useRef(false);  // auto-drop-into-Scan fires at most once per app session
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
      if (state === "active") {
        try {
          const saved = await loadSession();
          if (saved && saved.refresh_token) {
            if (!isTokenNearExpiry(saved.access_token)) return;
            const refreshed = await refreshToken(saved.refresh_token);
            await saveSession(refreshed);
            await syncBiometricToken(refreshed);
            setSession(refreshed);
            await loadUserData(refreshed.access_token);
          }
        } catch (e) {
          // On failure, do NOT clear the session here â€” a transient refresh
          // failure on resume must not log the user out or drop them to free.
          console.log("[DIAG resume] refresh skipped:", String(e));
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

  async function init() {
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
      try {
        // refreshToken is timeout-bounded (see api.ts) so this can never hang
        // the launch screen on a cold/slow backend.
        const refreshed = await refreshToken(saved.refresh_token); console.log("[DIAG init] refresh OK len=", (refreshed && refreshed.access_token ? refreshed.access_token.length : 0));
        await saveSession(refreshed);
        await syncBiometricToken(refreshed);
        setSession(refreshed);
        // Deliberately NOT awaited: plan/scan-count are UI-fill-in data, not
        // launch-blocking data. The main UI must render as soon as the
        // session itself is known - loadUserData resolves in the background
        // and updates plan/scansLeft in place once it lands (or times out).
        loadUserData(refreshed.access_token);
        // Also not awaited - warms the synchronous avatar mirror from disk
        // so Dashboard's very first mount this session (before any
        // /api/profile fetch has landed) can still show a real avatar
        // instead of the generic placeholder. See peekAvatar/
        // hydrateAvatarCache in lib/api.ts.
        hydrateAvatarCache(refreshed.access_token);
      } catch (e) { console.log("[DIAG init] refresh FAILED -> clearSession. error=", String(e)); await clearSession(); }
    }
    setAppReady(true);
  }

  async function loadUserData(token:string) {
    // getPlan/getScanCount are independent reads - running them in parallel
    // (was sequential) roughly halves the common-case wait before the
    // dashboard's plan badge/scan counter can resolve.
    let [p, count] = await Promise.all([getPlan(token), getScanCount(token)]);
    if (p === null) { await new Promise(r=>setTimeout(r,1200)); p = await getPlan(token); }
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
    setSession(s);
    await loadUserData(s.access_token);
  }

  async function handleLogout() {
    await clearSession();
    try { await AsyncStorage.removeItem(LAST_PLAN_KEY); } catch {}
    setSession(null); setPlan("free"); setPlanLoaded(false); setScansLeft(null); setScreen("dashboard");
  }

  const token = session?.access_token || "";

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

  const props = { token, plan, planLoaded, scansLeft, setScansLeft, onNavigate:navigate, onBack:goBack, onLogout:handleLogout, navData, firstScanNudge, onDismissFirstScanNudge: dismissFirstScanNudge, previewNewUser, onTogglePreviewNewUser: togglePreviewNewUser };

  const SCREENS: Record<Screen,React.ReactNode> = {
    "scanner":      <ScannerScreen {...props} />,
    "dashboard":    <DashboardScreen {...props} />,
    "thrift-run":   <ThriftRunScreen {...props} />,
    "specialty":    <SpecialtyScreen {...props} />,
    "import-sales": <ImportSalesScreen {...props} />,
    "deathpile":    <DeathPileScreen {...props} />,
    "community":    <CommunityScreen {...props} />,
    "profile":      <ProfileScreen {...props} />,
    "upgrade":      <UpgradeScreen token={token} plan={plan} onNavigate={navigate} onBack={goBack} />,
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
    "faq":          <FAQScreen {...props} />,
    "admin":        <AdminScreen {...props} />,
    "titan":     hasProAccess(plan) ? <BusinessApp token={token} plan={plan} userEmail={session?.user?.email || ""} scansLeft={scansLeft} setScansLeft={setScansLeft} onLogout={handleLogout} /> : <UpgradeScreen {...props} />,
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

  return (
    <SafeAreaProvider>
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {/* Gated on splashDone/appReady ONLY - never on planLoaded. planLoaded
          depends on a backend call (getPlan/getScanCount) that can be slow
          on a cold start; the main UI must render with default plan="free"/
          scansLeft=null and fill in once loadUserData resolves, instead of
          holding a black screen (the splash animation itself fades to
          opacity 0 well before appReady could ever depend on the network). */}
      {(!splashDone || !appReady) && <SplashScreen onDone={()=>setSplashDone(true)} />}
      <Animated.View style={[{flex:1}, {opacity:fadeIn}]}>
        {previewNewUser && previewStep === "value" && session && aiConsented ? (
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
        ) : (
          <View style={s.root}>
            <View style={{flex:1}}>{SCREENS[screen]}</View>
            <SafeAreaView style={{backgroundColor:C.surface}}>
              <View style={s.tabBar}>
                {TABS.map(t => {
                  const active = activeTab === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id} style={s.tabItem}
                      onPress={()=>setScreen(t.id)}
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

