import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity, Text, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import BusinessDashboard from "./BusinessDashboard";
import ManifestBeast from "./ManifestBeast";
import ResellerCFO from "./ResellerCFO";
import VendorIntel from "./VendorIntel";
import CompetitorIntel from "./CompetitorIntel";
import TrendPredictor from "./TrendPredictor";
import FakeDetector from "./FakeDetector";
import TaxExport from "./TaxExport";
import SourcingIntelScreen from "../SourcingIntelScreen";
import CashFlowScreen from "../CashFlowScreen";
import ViralContentScreen from "../ViralContentScreen";
import BundleBuilderScreen from "../BundleBuilderScreen";

// Consumer screens - Business users get ALL of them too,
import ScannerScreen from "../ScannerScreen";
import DashboardScreen from "../DashboardScreen";
import PriceBattleScreen from "../PriceBattleScreen";
import ThriftRunScreen from "../ThriftRunScreen";
import DeathPileScreen from "../DeathPileScreen";
import DealHunterScreen from "../DealHunterScreen";
import ManifestScreen from "../ManifestScreen";
import ArbitrageScreen from "../ArbitrageScreen";
import SpecialtyScreen from "../SpecialtyScreen";
import ProfileScreen from "../ProfileScreen";
import HistoryScreen from "../HistoryScreen";
import FAQScreen from "../FAQScreen";
import AICoachScreen from "../AICoachScreen";
import InventoryScreen from "../InventoryScreen";
import CommunityScreen from "../CommunityScreen";

interface Props {
  token: string;
  plan: string;
  userEmail: string;
  scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onLogout: () => void;
}

type BizScreen = "biz-dashboard" | "manifest-beast" | "reseller-cfo" | "vendor-intel" | "competitor" | "trend-predictor" | "fake-detector" | "tax" | 
  "scanner"|"dashboard"|"price-battle"|"thrift-run"|"deathpile"|
  "deal-hunter"|"manifest"|"arbitrage"|"specialty"|"profile"|
  "history"|"faq"|"ai-coach"|"inventory"|"community"|"cashflow"|"viral-content"|"bundle"|"sourcing-trip";

export default function BusinessApp({ token, plan, userEmail, scansLeft, setScansLeft, onLogout }: Props) {
  const [screen, setScreen]   = useState<BizScreen>("biz-dashboard");
  const [history, setHistory] = useState<BizScreen[]>([]);
  const [mode, setMode]       = useState<"business"|"tools">("business");

  function navigate(s: string) {
    setHistory(prev => [...prev, screen]);
    setScreen(s as BizScreen);
  }

  function goBack() {
    const prev = history[history.length-1] || "biz-dashboard";
    setHistory(h => h.slice(0,-1));
    setScreen(prev);
  }

  const consumerProps = {
  token, plan, scansLeft, setScansLeft,
    onNavigate: navigate, onBack: goBack, onLogout };

  const isBizScreen = screen === "biz-dashboard" || screen === "manifest-beast" || screen === "reseller-cfo" || screen === "vendor-intel" || screen === "competitor" || screen === "trend-predictor" || screen === "fake-detector" || screen === "tax";

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Mode switcher - always visible at top of business screens */}
      {isBizScreen && (
        <View style={s.modeSwitcher}>
          <StatusBar barStyle="light-content" backgroundColor={B.bg}/>
          <View style={s.modeBar}>
            <TouchableOpacity
              style={[s.modeBtn, mode==="business"&&s.modeBtnActive]}
              onPress={()=>{ setMode("business"); setScreen("biz-dashboard"); }}
            >
              <Text style={[s.modeTxt, mode==="business"&&s.modeTxtActive]}>💼 Command Center</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeBtn, mode==="tools"&&s.modeBtnActive]}
              onPress={()=>{ setMode("tools"); navigate("scanner"); }}
            >
              <Text style={[s.modeTxt, mode==="tools"&&s.modeTxtActive]}>📷 All Tools</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Business screens */}
      {screen === "biz-dashboard" && <BusinessDashboard token={token} plan={plan} userEmail={userEmail} onNavigate={navigate} onLogout={onLogout}/>}
      {screen === "manifest-beast" && <ManifestBeast token={token} onBack={goBack}/>}
      {screen === "reseller-cfo" && <ResellerCFO token={token} onBack={goBack}/>}
      {screen === "vendor-intel" && <VendorIntel token={token} onBack={goBack}/>}
      {screen === "competitor" && <CompetitorIntel token={token} onBack={goBack}/>}
      {screen === "trend-predictor" && <TrendPredictor token={token} onBack={goBack}/>}
      {screen === "fake-detector" && <FakeDetector token={token} onBack={goBack}/>}
      {screen === "tax" && <TaxExport token={token} onBack={goBack}/>}
      
      {/* Consumer screens - full access for Business users */}
      {screen === "scanner"      && <ScannerScreen   {...consumerProps}/>}
      {screen === "dashboard"    && <DashboardScreen  {...consumerProps}/>}
      {screen === "price-battle" && <PriceBattleScreen {...consumerProps}/>}
      {screen === "thrift-run"   && <ThriftRunScreen  {...consumerProps}/>}
      {screen === "deathpile"    && <DeathPileScreen  {...consumerProps}/>}
      {screen === "deal-hunter"  && <DealHunterScreen {...consumerProps}/>}
      {screen === "manifest"     && <ManifestScreen   {...consumerProps}/>}
      {screen === "arbitrage"    && <ArbitrageScreen  {...consumerProps}/>}
      {screen === "specialty"    && <SpecialtyScreen  {...consumerProps}/>}
      {screen === "profile"      && <ProfileScreen    {...consumerProps}/>}
      {screen === "history"      && <HistoryScreen    {...consumerProps}/>}
      {screen === "faq"          && <FAQScreen        {...consumerProps}/>}
      {screen === "ai-coach"     && <AICoachScreen    {...consumerProps}/>}
      {screen === "cashflow"      && <CashFlowScreen     {...consumerProps}/>}
      {screen === "viral-content" && <ViralContentScreen {...consumerProps}/>}
      {screen === "bundle"        && <BundleBuilderScreen {...consumerProps}/>}
      {screen === "sourcing-trip" && <SourcingIntelScreen {...consumerProps}/>}
      {screen === "inventory"    && <InventoryScreen  {...consumerProps}/>}
      {screen === "community"    && <CommunityScreen  {...consumerProps}/>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     {flex:1, backgroundColor:B.bg},
  modeSwitcher:  {backgroundColor:B.bg, borderBottomWidth:1, borderBottomColor:B.border},
  modeBar:       {flexDirection:"row", padding:8, gap:6},
  modeBtn:       {flex:1, paddingVertical:8, borderRadius:10, alignItems:"center", backgroundColor:B.surface, borderWidth:1, borderColor:B.border},
  modeBtnActive: {backgroundColor:B.orange, borderColor:B.orange},
  modeTxt:       {color:B.text3, fontSize:12, fontWeight:"700" as any},
  modeTxtActive: {color:"#000", fontWeight:"900" as any} });
