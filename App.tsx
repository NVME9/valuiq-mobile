import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, StatusBar, Platform,
  ActivityIndicator, TouchableOpacity, Animated, Dimensions,
} from "react-native";
import { C } from "./src/lib/theme";
import { Session, loadSession, saveSession, clearSession, getPlan, getScanCount, refreshToken } from "./src/lib/api";
import { supabase } from "./src/lib/supabase";
import LoginScreen from "./src/screens/LoginScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import ThriftRunScreen from "./src/screens/ThriftRunScreen";
import SpecialtyScreen from "./src/screens/SpecialtyScreen";
import ManifestScreen from "./src/screens/ManifestScreen";
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
import DealHunterScreen from "./src/screens/DealHunterScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import AIConsentScreen from "./src/screens/AIConsentScreen";
import AICoachScreen from "./src/screens/AICoachScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import FAQScreen from "./src/screens/FAQScreen";
import AdminScreen from "./src/screens/AdminScreen";
import BusinessScreen from "./src/screens/BusinessScreen";
import BusinessApp from "./src/screens/business/BusinessApp";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export type Screen =
  "scanner"|"dashboard"|"thrift-run"|
  "specialty"|"manifest"|"deathpile"|"community"|
  "profile"|"relist"|"hot-now"|"arbitrage"|"upgrade"|
  "bundle"|"alerts"|"leaderboard"|"inventory"|"profit-tracker"|"deal-hunter"|"ai-coach"|"history"|"faq"|"admin"|"titan";

const { height } = Dimensions.get("window");

// ── PLAN, DISPLAY HELPERS ─────────────────────────────────────
const PLAN_LABEL: Record<string,string> = {
  free:"Free", seller:"Seller", pro:"Pro", lifetime:"Lifetime ♾️"
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
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Logo block */}
      <Animated.View style={{ alignItems:"center", transform:[{ scale }] }}>
        <View style={{ width:120, height:120, alignItems:"center", justifyContent:"center", marginBottom:6 }}>
          {/* scope corners */}
          <View style={{ position:"absolute", top:0, left:0, width:22, height:22, borderTopWidth:3, borderLeftWidth:3, borderColor:C.green }}/>
          <View style={{ position:"absolute", top:0, right:0, width:22, height:22, borderTopWidth:3, borderRightWidth:3, borderColor:C.green }}/>
          <View style={{ position:"absolute", bottom:0, left:0, width:22, height:22, borderBottomWidth:3, borderLeftWidth:3, borderColor:C.green }}/>
          <View style={{ position:"absolute", bottom:0, right:0, width:22, height:22, borderBottomWidth:3, borderRightWidth:3, borderColor:C.green }}/>
          <View style={ss.logoBox}>
            <Text style={ss.logoV}>V</Text>
          </View>
        </View>
        <Text style={ss.logoName}>ValuIQ</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[ss.tagline, { opacity: fade2 }]}>
        Point. Shoot. Profit.
      </Animated.Text>
      <Animated.Text style={[ss.tagSub, { opacity: fade2 }]}>
        The unfair advantage every reseller needs,
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
    </Animated.View>
  );
}

const ss = StyleSheet.create({
  splash:   { position:"absolute" as any, top:0, left:0, right:0, bottom:0, zIndex:100, backgroundColor:C.bg, alignItems:"center", justifyContent:"center", paddingHorizontal:32 },
  logoBox:  { width:86, height:86, backgroundColor:C.green, borderRadius:22, alignItems:"center", justifyContent:"center", marginBottom:14, shadowColor:C.green, shadowOpacity:0.45, shadowRadius:22, shadowOffset:{width:0,height:0}, elevation:10 },
  logoV:    { color:C.greenDark, fontSize:50, fontWeight:"900", lineHeight:54 },
  logoName: { color:C.text1, fontSize:38, fontWeight:"900", letterSpacing:-2, marginBottom:18 },
  tagline:  { color:C.text1, fontSize:22, fontWeight:"800", textAlign:"center", marginBottom:6 },
  tagSub:   { color:C.text3, fontSize:14, textAlign:"center", marginBottom:36 },
  pills:    { gap:14, width:"100%" },
  pill:     { flexDirection:"row", alignItems:"center", gap:12 },
  pillIcon: { fontSize:22, width:30, textAlign:"center" as any },
  pillText: { color:C.text2, fontSize:14, lineHeight:20, flex:1 },
});

// ── MAIN, APP ─────────────────────────────────────────────────
// Warm up browser for faster OAuth on iOS,


export default function App() {
  const [session, setSession]       = useState<Session|null>(null);
  const [plan, setPlan]             = useState("free");
  const [scansLeft, setScansLeft]   = useState<number|null>(null);
  const [screen, setScreen]         = useState<Screen>("dashboard");
  const [history, setHistory]       = useState<Screen[]>([]);
  const [navData, setNavData]       = useState<any>(null);
  const [appReady, setAppReady]     = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [aiConsented, setAiConsented] = useState(false);
  const fadeIn = useRef(new Animated.Value(0)).current;

  

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (splashDone && appReady) {
      Animated.timing(fadeIn, { toValue:1, duration:300, useNativeDriver:true }).start();
    }
  }, [splashDone, appReady]);

  async function init() {
    // Check if user has seen onboarding,
    try {
      const seen = await AsyncStorage.getItem("@valuiq_onboarded");
      if (seen === "true") setOnboarded(true);
      const consent = await AsyncStorage.getItem("@valuiq_ai_consent");
      if (consent === "true") setAiConsented(true);
    } catch {}
    const saved = await loadSession();
    if (saved) {
      try {
        const refreshed = await refreshToken(saved.refresh_token);
        await saveSession(refreshed);
        setSession(refreshed);
        await loadUserData(refreshed.access_token);
      } catch { await clearSession(); }
    }
    setAppReady(true);
  }

  async function loadUserData(token:string) {
    let p = await getPlan(token);
    if (p === null) { await new Promise(r=>setTimeout(r,1200)); p = await getPlan(token); }
    const count = await getScanCount(token);
    if (p !== null) {
      setPlan(p);
      const paid = ["seller","pro","lifetime","titan"].includes(p);
      setScansLeft(paid ? null : Math.max(0, 10 - count));
    }
  }

  async function handleLogin(s:Session) {
    setSession(s);
    await loadUserData(s.access_token);
    setScreen("dashboard");
  }

  async function handleLogout() {
    await clearSession();
    setSession(null); setPlan("free"); setScansLeft(null); setScreen("dashboard");
  }

  const token = session?.access_token || "";
  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  function navigate(s: Screen, data?: any) {
    setNavData(data ?? null);
    // Tab bar screens reset history; tool screens push to stack,
    const TAB_SCREENS: Screen[] = ["scanner","dashboard","community","profile","upgrade"];
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

  const props = { token, plan, scansLeft, setScansLeft, onNavigate:navigate, onBack:goBack, onLogout:handleLogout, navData };

  const SCREENS: Record<Screen,React.ReactNode> = {
    "scanner":      <ScannerScreen {...props} />,
    "dashboard":    <DashboardScreen {...props} />,
    "thrift-run":   <ThriftRunScreen {...props} />,
    "specialty":    <SpecialtyScreen {...props} />,
    "manifest":     <ManifestScreen {...props} />,
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
    "deal-hunter":  <DealHunterScreen {...props} />,
    "ai-coach":     <AICoachScreen {...props} />,
    "profit-tracker": <ProfitTrackerScreen {...props} />,
    "history":      <HistoryScreen {...props} />,
    "faq":          <FAQScreen {...props} />,
    "admin":        <AdminScreen {...props} />,
    "titan":     <BusinessScreen {...props} />,
  };

  const TAB_SCREENS: Screen[] = ["scanner","dashboard","community","profile"];
  const activeTab = TAB_SCREENS.includes(screen) ? screen : null;

  const TABS = [
    { id:"scanner"   as Screen, icon:"📷", label:"Scan"      },
    { id:"dashboard" as Screen, icon:"⚡", label:"Dashboard" },
    { id:"community" as Screen, icon:"🔥", label:"Feed"      },
    { id:"profile"   as Screen, icon:"👤", label:"Profile"   },
    { id:"upgrade"   as Screen, icon:"🚀", label:"Upgrade",  highlight:!isPaid },
  ];

  return (
    <SafeAreaProvider>
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {(!splashDone || !appReady) && <SplashScreen onDone={()=>setSplashDone(true)} />}
      <Animated.View style={[{flex:1}, {opacity:fadeIn}]}>
        {!session ? (
            !onboarded
              ? <OnboardingScreen onComplete={async () => {
                try { await AsyncStorage.setItem("@valuiq_onboarded","true"); } catch {}
                setOnboarded(true);
              }} />
              : <LoginScreen onLogin={handleLogin} />
        ) : !aiConsented ? (
          <AIConsentScreen onAgree={async () => {
            try { await AsyncStorage.setItem("@valuiq_ai_consent","true"); } catch {}
            setAiConsented(true);
          }} />
        ) : (
          <View style={s.root}>
            <View style={{flex:1}}>{SCREENS[screen]}</View>
            <SafeAreaView style={{backgroundColor:C.surface}}>
              <View style={s.tabBar}>
                {TABS.map(t => {
                  // Hide upgrade tab for paid users,
                  if (t.highlight === false || (t.id === "upgrade" && isPaid)) return null;
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
                      <Text style={[s.tabIcon, t.highlight && {opacity:1}]}>{t.icon}</Text>
                      <Text style={[
                        s.tabLabel,
                        active && {color:C.green, fontWeight:"700"},
                        t.highlight && {color:C.yellow, fontWeight:"700"},
                      ]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      {active && !t.highlight && <View style={s.tabDot}/>}
                      {t.highlight && <View style={[s.tabDot, {backgroundColor:C.yellow}]}/>}
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
  tabBar:  { flexDirection:"row", borderTopWidth:1, borderTopColor:C.border, paddingTop:6, paddingBottom:Platform.OS==="ios"?0:6, paddingHorizontal:2 },
  tabItem: { flex:1, alignItems:"center", paddingBottom:4, paddingHorizontal:1 },
  tabIcon: { fontSize:18, marginBottom:1 },
  tabLabel:{ color:C.text4, fontSize:8, fontWeight:"600" },
  tabDot:  { width:3, height:3, borderRadius:1.5, backgroundColor:C.green, marginTop:2 },
});

