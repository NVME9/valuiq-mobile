import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

interface Alert {
  id: string; source: string; title: string; category: string;
  buyPrice: number; estimatedSell: number; profit: number; roi: number;
  score: number; bestPlatform: string; condition: string; timeToSell: string;
  riskLevel: string; reasoning: string; hotTip?: string; url: string;
  isAuction: boolean; isArbitrage: boolean; isLiquidation: boolean;
  endTime?: string; watchers?: number;
}

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  ebay_bin:           { label: "eBay, BIN",      color: "#3665f3", icon: "🛒" },
  ebay_auction:       { label: "⚡ Auction",    color: C.red,     icon: "🔨" },
  ebay_arbitrage:     { label: "📈 Arbitrage",  color: C.orange,  icon: "💹" },
  craigslist:         { label: "Craigslist",    color: "#7C3AED", icon: "📍" },
  shopgoodwill:       { label: "Goodwill",      color: C.green,   icon: "♻️"  },
  bulq:               { label: "BULQ, Lot",      color: C.yellow,  icon: "📦" },
  offerup:            { label: "OfferUp",       color: "#00BF4D", icon: "🤝" },
  "liquidation.com":  { label: "Liquidation",   color: C.orange,  icon: "🏭" },
  poshmark_arb:       { label: "Posh→eBay",     color: "#F05B82", icon: "👗" },
  mercari_arb:        { label: "Mercari→eBay",  color: "#2FBFDE", icon: "🔄" },
  govdeals:           { label: "Gov, Surplus",   color: "#1B4FBE", icon: "🏛️" },
  auctionzip:         { label: "Estate, Auction",color: "#8B6914", icon: "🏺" },
  bstock:             { label: "B-Stock",       color: "#FF6600", icon: "📬" },
  whatnot:            { label: "Whatnot",       color: "#FF3A50", icon: "📺" },
  stockx:             { label: "StockX",        color: "#1B1B1B", icon: "👟" },
  goat:               { label: "GOAT",          color: "#1B1B1B", icon: "🐐" },
  direct_liquidation: { label: "Direct, Liq.",   color: "#FF8C00", icon: "🏗️" } };

const RISK_COLOR: Record<string, string> = {
  "Very, Low": C.green, "Low": C.green, "Medium": C.yellow,
  "High": C.orange, "Very, High": C.red };

const CATEGORIES = ["All","Clothing","Shoes","Electronics","Collectibles","Home","Tools","Vintage","Arbitrage"];

export default function DealHunterScreen({ token, plan, onNavigate, onBack }: Props) {
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory]   = useState("All");
  const [sortBy, setSortBy]       = useState<"score"|"profit"|"roi">("score");
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const isPro = ["pro","lifetime"].includes(plan);

  const load = useCallback(async (forceRefresh = false) => {
    try {
      const cat = category === "All" ? "all" : category.toLowerCase();
      const url = `${API_BASE}/api/deal-hunter?token=${token}&category=${cat}&limit=30${forceRefresh ? "&refresh=true" : ""}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.success) {
        setAlerts(d.alerts || []);
        setLastRefresh(d.metadata?.generatedAt ? new Date(d.metadata.generatedAt).toLocaleTimeString() : "");
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token, category]);

  useEffect(() => { load(); }, [category]);

  const sorted = [...alerts].sort((a, b) =>
    sortBy === "score" ? b.score - a.score :
    sortBy === "profit" ? b.profit - a.profit : b.roi - a.roi,
  );

  const scoreColor = (s: number) => s >= 85 ? C.green : s >= 70 ? C.yellow : C.orange;
  const srcInfo = (src: string) => SOURCE_LABELS[src] || { label: src, color: C.text3, icon: "📡" };

  if (!isPro) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>Deal Hunter AI</Text>
          <View style={{ width: 40 }}/>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View style={s.lockedCard}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🤖</Text>
            <Text style={s.lockedTitle}>Deal Hunter AI</Text>
            <Text style={s.lockedBody}>
              24/7 AI agent that monitors eBay, Craigslist Goodwill auctions,
              BULQ liquidation lots, and arbitrage gaps — then scores every,
              opportunity and alerts you before anyone else sees it.
            </Text>
            <View style={s.lockedFeatures}>
              {[
                "🔨 eBay auction sniper alerts",
                "📈 Platform arbitrage gaps",
                "📦 BULQ liquidation lot scoring",
                "♻️ Goodwill auction underpricing",
                "📍 Craigslist local deal alerts",
                "🔔 Custom keyword + price alerts",
              ].map((f, i) => (
                <View key={i} style={s.lockedFeatureRow}>
                  <Text style={s.lockedFeatureTxt}>{f}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.upgradeBtn} onPress={() => onNavigate("upgrade")}>
              <Text style={s.upgradeBtnTxt}>Unlock with Pro — $49/mo →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.navTitle}>🤖 Deal Hunter AI</Text>
          {lastRefresh ? <Text style={s.navSub}>Updated {lastRefresh}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => { setLoading(true); load(true); }} style={s.refreshBtn}>
          <Text style={s.refreshBtnTxt}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.catScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            onPress={() => { setCategory(cat); setLoading(true); }}
            style={[s.catChip, category === cat && s.catChipActive]}
          >
            <Text style={[s.catTxt, category === cat && s.catTxtActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort bar */}
      <View style={s.sortBar}>
        <Text style={s.sortLabel}>Sort by:</Text>
        {(["score","profit","roi"] as const).map(opt => (
          <TouchableOpacity key={opt} onPress={() => setSortBy(opt)}
            style={[s.sortBtn, sortBy === opt && s.sortBtnActive]}>
            <Text style={[s.sortTxt, sortBy === opt && s.sortTxtActive]}>
              {opt === "score" ? "🎯 Score" : opt === "profit" ? "💰 Profit" : "📈 ROI"}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={s.countTxt}>{sorted.length} deals</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={C.green}
            onRefresh={() => { setRefreshing(true); load(true); }}/>
        }
      >
        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.green} size="large"/>
            <Text style={s.loadingTxt}>Scanning {CATEGORIES.length - 1} sources...</Text>
            <Text style={s.loadingSub}>eBay · B-Stock · Whatnot · Craigslist · Goodwill · BULQ · Mercari · StockX · OfferUp · Liquidation.com & more</Text>
          </View>
        ) : sorted.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
            <Text style={s.emptyTitle}>No deals found right now</Text>
            <Text style={s.emptySub}>Pull down to refresh — new deals appear every few hours</Text>
          </View>
        ) : sorted.map(alert => {
          const src = srcInfo(alert.source);
          const isOpen = expanded === alert.id;
          return (
            <TouchableOpacity key={alert.id}
              style={[s.card, isOpen && { borderColor: scoreColor(alert.score) + "50" }]}
              onPress={() => setExpanded(isOpen ? null : alert.id)}
              activeOpacity={0.85}
            >
              {/* Score badge */}
              <View style={[s.scoreBadge, { backgroundColor: scoreColor(alert.score) + "20",
                borderColor: scoreColor(alert.score) + "60" }]}>
                <Text style={[s.scoreNum, { color: scoreColor(alert.score) }]}>{alert.score}</Text>
                <Text style={s.scoreLabel}>SCORE</Text>
              </View>

              {/* Source tag */}
              <View style={[s.srcTag, { backgroundColor: src.color + "20" }]}>
                <Text style={[s.srcTxt, { color: src.color }]}>{src.icon} {src.label}</Text>
              </View>

              {/* Title */}
              <Text style={s.cardTitle} numberOfLines={isOpen ? 3 : 2}>{alert.title}</Text>
              <Text style={s.cardCat}>{alert.category} · {alert.condition}</Text>

              {/* Numbers row */}
              <View style={s.numbersRow}>
                <View style={s.numBox}>
                  <Text style={s.numLabel}>BUY</Text>
                  <Text style={[s.numVal, { color: C.text1 }]}>${Math.round(alert.buyPrice)}</Text>
                </View>
                <Text style={s.numArrow}>→</Text>
                <View style={s.numBox}>
                  <Text style={s.numLabel}>SELL</Text>
                  <Text style={[s.numVal, { color: C.text1 }]}>${Math.round(alert.estimatedSell)}</Text>
                </View>
                <Text style={s.numArrow}>→</Text>
                <View style={s.numBox}>
                  <Text style={s.numLabel}>PROFIT</Text>
                  <Text style={[s.numVal, { color: C.green }]}>+${Math.round(alert.profit)}</Text>
                </View>
                <View style={s.numBox}>
                  <Text style={s.numLabel}>ROI</Text>
                  <Text style={[s.numVal, { color: C.green }]}>{alert.roi}%</Text>
                </View>
              </View>

              {/* Tags row */}
              <View style={s.tagsRow}>
                <View style={[s.tag, { borderColor: C.border }]}>
                  <Text style={s.tagTxt}>⚡ {alert.bestPlatform}</Text>
                </View>
                <View style={[s.tag, { borderColor: C.border }]}>
                  <Text style={s.tagTxt}>⏱ {alert.timeToSell}</Text>
                </View>
                <View style={[s.tag, { borderColor: RISK_COLOR[alert.riskLevel] + "40",
                  backgroundColor: RISK_COLOR[alert.riskLevel] + "10" }]}>
                  <Text style={[s.tagTxt, { color: RISK_COLOR[alert.riskLevel] }]}>
                    {alert.riskLevel} Risk,
                  </Text>
                </View>
                {alert.isAuction && (
                  <View style={[s.tag, { borderColor: C.red + "50", backgroundColor: C.red + "10" }]}>
                    <Text style={[s.tagTxt, { color: C.red }]}>🔨 AUCTION</Text>
                  </View>
                )}
              </View>

              {/* Expanded details */}
              {isOpen && (
                <View style={s.expanded}>
                  <View style={s.reasoningBox}>
                    <Text style={s.reasoningLabel}>AI, Analysis</Text>
                    <Text style={s.reasoningTxt}>{alert.reasoning}</Text>
                  </View>
                  {alert.hotTip && (
                    <View style={s.hotTipBox}>
                      <Text style={s.hotTipLabel}>🔥 Hot Tip</Text>
                      <Text style={s.hotTipTxt}>{alert.hotTip}</Text>
                    </View>
                  )}
                  {alert.url ? (
                    <TouchableOpacity style={s.viewBtn}
                      onPress={() => Linking.openURL(alert.url)}>
                      <Text style={s.viewBtnTxt}>View Listing →</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex:1, backgroundColor:C.bg },
  nav:            { flexDirection:"row", alignItems:"center", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:        { width:36, height:36, justifyContent:"center" },
  backTxt:        { color:C.text3, fontSize:22 },
  navTitle:       { color:C.text1, fontSize:16, fontWeight:"800" },
  navSub:         { color:C.text4, fontSize:11, marginTop:1 },
  refreshBtn:     { width:36, height:36, alignItems:"center", justifyContent:"center" },
  refreshBtnTxt:  { color:C.green, fontSize:22, fontWeight:"700" },
  catScroll:      { maxHeight:48, paddingVertical:8, borderBottomWidth:1, borderBottomColor:C.border },
  catChip:        { paddingHorizontal:14, paddingVertical:6, borderRadius:100, backgroundColor:C.surface, borderWidth:1, borderColor:C.border },
  catChipActive:  { backgroundColor:C.green, borderColor:C.green },
  catTxt:         { color:C.text3, fontSize:12, fontWeight:"600" },
  catTxtActive:   { color:C.greenDark, fontWeight:"800" },
  sortBar:        { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:8, gap:6, borderBottomWidth:1, borderBottomColor:C.border },
  sortLabel:      { color:C.text4, fontSize:11 },
  sortBtn:        { paddingHorizontal:10, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:C.border },
  sortBtnActive:  { backgroundColor:C.surface, borderColor:C.green },
  sortTxt:        { color:C.text4, fontSize:11 },
  sortTxtActive:  { color:C.green, fontWeight:"700" },
  countTxt:       { color:C.text4, fontSize:11, marginLeft:"auto" as any },
  list:           { padding:14, paddingBottom:60, gap:10 },
  loadingBox:     { alignItems:"center", paddingTop:60 },
  loadingTxt:     { color:C.text1, fontSize:16, fontWeight:"700", marginTop:16, marginBottom:4 },
  loadingSub:     { color:C.text4, fontSize:12 },
  emptyBox:       { alignItems:"center", paddingTop:60 },
  emptyTitle:     { color:C.text1, fontSize:16, fontWeight:"700", marginBottom:6 },
  emptySub:       { color:C.text3, fontSize:13, textAlign:"center" as any },
  card:           { backgroundColor:C.surface, borderWidth:1.5, borderColor:C.border, borderRadius:16, padding:14 },
  scoreBadge:     { alignSelf:"flex-start" as any, borderWidth:1, borderRadius:10, paddingHorizontal:10, paddingVertical:4, marginBottom:8, flexDirection:"row", alignItems:"baseline", gap:4 },
  scoreNum:       { fontSize:20, fontWeight:"900", letterSpacing:-0.5 },
  scoreLabel:     { fontSize:9, fontWeight:"800", textTransform:"uppercase" as any, letterSpacing:1 },
  srcTag:         { alignSelf:"flex-start" as any, borderRadius:100, paddingHorizontal:8, paddingVertical:3, marginBottom:8 },
  srcTxt:         { fontSize:11, fontWeight:"700" },
  cardTitle:      { color:C.text1, fontSize:14, fontWeight:"700", marginBottom:4, lineHeight:19 },
  cardCat:        { color:C.text4, fontSize:11, marginBottom:12 },
  numbersRow:     { flexDirection:"row", alignItems:"center", backgroundColor:C.bg, borderRadius:10, padding:10, marginBottom:10, gap:4 },
  numBox:         { flex:1, alignItems:"center" },
  numLabel:       { color:C.text4, fontSize:8, fontWeight:"700", textTransform:"uppercase" as any, letterSpacing:0.5, marginBottom:3 },
  numVal:         { fontSize:15, fontWeight:"900", letterSpacing:-0.3 },
  numArrow:       { color:C.text4, fontSize:14 },
  tagsRow:        { flexDirection:"row", flexWrap:"wrap" as any, gap:5 },
  tag:            { borderWidth:1, borderRadius:100, paddingHorizontal:8, paddingVertical:4 },
  tagTxt:         { color:C.text3, fontSize:10, fontWeight:"600" },
  expanded:       { marginTop:14, gap:10 },
  reasoningBox:   { backgroundColor:C.bg, borderRadius:10, padding:12 },
  reasoningLabel: { color:C.text4, fontSize:10, fontWeight:"800", textTransform:"uppercase" as any, marginBottom:5, letterSpacing:0.5 },
  reasoningTxt:   { color:C.text2, fontSize:13, lineHeight:18 },
  hotTipBox:      { backgroundColor:"#1e2a08", borderWidth:1, borderColor:"#3a5010", borderRadius:10, padding:12 },
  hotTipLabel:    { color:C.green, fontSize:10, fontWeight:"800", textTransform:"uppercase" as any, marginBottom:5 },
  hotTipTxt:      { color:C.text1, fontSize:13, lineHeight:18 },
  viewBtn:        { backgroundColor:C.green, borderRadius:10, padding:12, alignItems:"center" },
  viewBtnTxt:     { color:C.greenDark, fontSize:14, fontWeight:"900" },
  lockedCard:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:18, padding:24, alignItems:"center" },
  lockedTitle:    { color:C.text1, fontSize:22, fontWeight:"900", marginBottom:10 },
  lockedBody:     { color:C.text3, fontSize:14, lineHeight:21, textAlign:"center" as any, marginBottom:20 },
  lockedFeatures: { width:"100%", gap:8, marginBottom:24 },
  lockedFeatureRow:{ backgroundColor:C.bg, borderRadius:10, padding:12 },
  lockedFeatureTxt:{ color:C.text2, fontSize:13 },
  upgradeBtn:     { backgroundColor:C.orange, borderRadius:13, padding:16, alignItems:"center", width:"100%" },
  upgradeBtnTxt:  { color:"#000", fontSize:15, fontWeight:"900" } });
