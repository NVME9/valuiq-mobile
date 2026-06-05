import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, RefreshControl, ActivityIndicator,
  Animated, Dimensions, Image,
} from "react-native";
import { SafeAreaView as SAV } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

const { width } = Dimensions.get("window");

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

function planLevel(p: string) {
  if (p === "titan") return 4;
  if (p === "lifetime") return 3;
  if (p === "pro") return 2;
  if (p === "seller") return 1;
  return 0;
}
function planLabel(p: string) {
  const m: Record<string,string> = { business:"💼 Business", lifetime:"♾️ Lifetime", pro:"🔥 Pro", seller:"💪 Seller", free:"🆓 Free" };
  return m[p] || "🆓 Free";
}
function planColor(p: string) {
  const m: Record<string,string> = { business:C.orange, lifetime:C.yellow, pro:C.orange, seller:C.green };
  return m[p] || C.text3;
}

const LIVE_FEED = [
  { emoji:"🤑", text:"+$340 profit found on Whatnot", time:"2m" },
  { emoji:"💰", text:"Nike Dunk Low → +$185 on eBay", time:"4m" },
  { emoji:"🔥", text:"Thrift Run: 3 BUY finds in 12 min", time:"7m" },
  { emoji:"⚡", text:"Deal Hunter: B-Stock electronics 87/100", time:"11m" },
  { emoji:"🏆", text:"Top flipper: $2,840 profit this week", time:"18m" },
  { emoji:"💎", text:"Pyrex set: paid $8 → sells for $145", time:"22m" },
];

const TOOLS = [
  { id:"scanner",       icon:"📷", name:"Scan Item",        desc:"Point camera → instant profit",         minPlan:0, accent:C.green   },
  { id:"price-battle",  icon:"⚡", name:"Price Battle",     desc:"12 platforms compared instantly",       minPlan:0, accent:C.orange  },
  { id:"community",     icon:"🏆", name:"Community",        desc:"Top flips from real resellers",         minPlan:0, accent:"#ff6b6b" },
  { id:"thrift-run",    icon:"🛍️", name:"Thrift Run",       desc:"Rapid-scan a full store",               minPlan:1, accent:C.green   },
  { id:"deathpile",     icon:"💀", name:"Death Pile",       desc:"Diagnose stuck inventory",              minPlan:1, accent:"#a09b94" },
  { id:"hot-now",       icon:"🔥", name:"Hot Right Now",    desc:"What's selling best this week",         minPlan:1, accent:C.red     },
  { id:"relist",        icon:"✏️",  name:"Auto-Relist",      desc:"Refresh dying listings",               minPlan:1, accent:C.orange  },
  { id:"deal-hunter",   icon:"🤖", name:"Deal Hunter AI",   desc:"24/7 alerts from 17 sources",           minPlan:2, accent:"#b066ff" },
  { id:"manifest",      icon:"📋", name:"Manifest Analyzer",desc:"Score liquidation lots",                minPlan:2, accent:C.yellow  },
  { id:"specialty",     icon:"🎯", name:"Specialty Scanner",desc:"Sneakers, cards, vinyl & luxury",       minPlan:2, accent:"#b066ff" },
  { id:"arbitrage",     icon:"📈", name:"Arbitrage Finder", desc:"Underpriced items hiding in plain sight",minPlan:2, accent:C.green  },
  { id:"ai-coach",      icon:"🧠", name:"AI Coach",         desc:"Personal insights from your history",   minPlan:2, accent:"#b066ff" },
  { id:"inventory",     icon:"📦", name:"Inventory",        desc:"Track everything you own",              minPlan:1, accent:C.text3   },
  { id:"profit-tracker",icon:"💰", name:"Profit Tracker",   desc:"Your real P&L every flip",             minPlan:2, accent:C.green   },
];

const COMING_SOON = [
  { icon:"💼", name:"ValuIQ Business",    desc:"Manifest Beast, Auto-Scout, Pallet Prophet + exclusive AI tools", badge:"Coming Soon", color:"#ff8c42" },
  { icon:"📸", name:"Photo IQ",           desc:"AI critiques your listing photos vs top sellers", badge:"Q3 2026", color:"#b066ff" },
  { icon:"⏱️", name:"True Hourly Rate",   desc:"Your REAL hourly rate per category — most resellers are shocked", badge:"Q3 2026", color:C.green },
  { icon:"💨", name:"Cash Velocity",      desc:"Dollars per day held — the metric that rewires sourcing", badge:"Q3 2026", color:C.yellow },
  { icon:"🗓️", name:"Perfect Timing",    desc:"Exact day and time to list for 43% higher sale prices", badge:"Q4 2026", color:"#4db8ff" },
  { icon:"⚠️", name:"Safe To Sell",       desc:"CPSC recall + counterfeit check before you list", badge:"Q4 2026", color:C.red },
];

function SectionHeader({ title, expanded, onToggle }: { title:string; expanded:boolean; onToggle:()=>void }) {
  return (
    <TouchableOpacity style={sh.row} onPress={onToggle} activeOpacity={0.8}>
      <Text style={sh.title}>{title}</Text>
      <Text style={[sh.chevron, expanded && {transform:[{rotate:"180deg"}]}]}>⌄</Text>
    </TouchableOpacity>
  );
}
const sh = StyleSheet.create({
  row:     { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingTop:16, paddingBottom:10, marginBottom:4 },
  title:   { color:C.text4, fontSize:9, fontWeight:"800", letterSpacing:2, textTransform:"uppercase" },
  chevron: { color:C.text4, fontSize:18, fontWeight:"900" },
});

export default function DashboardScreen({ token, plan, scansLeft, onNavigate, onLogout }: Props) {
  const [scans, setScans]         = useState<any[]>([]);
  const [stats, setStats]         = useState<any>(null);
  const [refreshing, setRefresh]  = useState(false);
  const [liveIdx, setLiveIdx]     = useState(0);
  const [showTools, setShowTools] = useState(true);
  const [showScans, setShowScans] = useState(true);
  const [showSoon,  setShowSoon]  = useState(false);
  const [showAI,    setShowAI]    = useState(false);
  const scanPulse                 = useRef(new Animated.Value(1)).current;
  const liveFade                  = useRef(new Animated.Value(1)).current;

  const level  = planLevel(plan);
  const isFree = level === 0;
  const isPro  = level >= 2;

  useEffect(() => {
    loadData();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(scanPulse, { toValue:1.02, duration:1200, useNativeDriver:true }),
      Animated.timing(scanPulse, { toValue:1,    duration:1200, useNativeDriver:true }),
    ]));
    pulse.start();
    const interval = setInterval(() => {
      Animated.timing(liveFade, { toValue:0, duration:250, useNativeDriver:true }).start(() => {
        setLiveIdx(i => (i+1) % LIVE_FEED.length);
        Animated.timing(liveFade, { toValue:1, duration:300, useNativeDriver:true }).start();
      });
    }, 4000);
    return () => { pulse.stop(); clearInterval(interval); };
  }, []);

  async function loadData() {
    try {
      const r = await fetch(`${API_BASE}/api/scan-history?token=${token}&limit=5`);
      const d = await r.json();
      if (d.scans) {
        setScans(d.scans);
        const buys = d.scans.filter((s: any) => s.decision === "BUY");
        setStats({
          totalScans: d.total || d.scans.length,
          profitFound: buys.reduce((sum: number, s: any) => sum + (s.net_profit || 0), 0),
          buys: buys.length,
        });
      }
    } catch {}
    setRefresh(false);
  }

  const myTools    = TOOLS.filter(t => t.minPlan <= level);
  const lockedTools = TOOLS.filter(t => t.minPlan > level);
  const activity   = LIVE_FEED[liveIdx];

  return (
    <SAV style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* Nav */}
      <View style={s.nav}>
        <View style={s.logoRow}>
          <View style={s.logoBox}><Text style={s.logoV}>V</Text></View>
          <Text style={s.logoTxt}>ValuIQ</Text>
        </View>
        <View style={s.navRight}>
          <View style={[s.planBadge, {borderColor:planColor(plan)+"50", backgroundColor:planColor(plan)+"15"}]}>
            <Text style={[s.planBadgeTxt, {color:planColor(plan)}]}>{planLabel(plan)}</Text>
          </View>
          {isFree && scansLeft !== null && (
            <View style={s.scansBadge}><Text style={s.scansBadgeTxt}>{scansLeft}/10</Text></View>
          )}
          <TouchableOpacity onPress={() => onNavigate("profile")}>
            <Text style={{fontSize:22}}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green}
          onRefresh={() => { setRefresh(true); loadData(); }}/>}
      >

        {/* HERO SCAN BUTTON */}
        <Animated.View style={{transform:[{scale:scanPulse}]}}>
          <TouchableOpacity style={s.hero} onPress={() => onNavigate("scanner")} activeOpacity={0.9}>
            <View style={{flex:1}}>
              <Text style={s.heroEye}>SCAN ANYTHING · GET INSTANT PROFIT</Text>
              <Text style={s.heroTitle}>Point. Shoot. Profit.</Text>
              <Text style={s.heroSub}>Find your next flip in seconds →</Text>
            </View>
            <Text style={{fontSize:44}}>📷</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* LIVE FEED */}
        <TouchableOpacity style={s.liveBar} onPress={() => onNavigate("community")} activeOpacity={0.85}>
          <View style={s.liveDot}/>
          <Text style={s.liveLbl}>LIVE</Text>
          <Animated.Text style={[s.liveTxt, {opacity:liveFade}]} numberOfLines={2}>
            {activity.emoji} {activity.text}
          </Animated.Text>
          <Text style={s.liveTime}>{activity.time}</Text>
        </TouchableOpacity>

        {/* STATS */}
        {stats && stats.totalScans > 0 && (
          <View style={s.statsRow}>
            {[
              [stats.totalScans, "Total Scans"],
              [`$${Math.round(stats.profitFound)}`, "Profit Found"],
              [stats.buys, "BUY Finds"],
            ].map(([val, label]) => (
              <View key={label as string} style={s.statCard}>
                <Text style={[s.statVal, {color:C.green}]}>{val}</Text>
                <Text style={s.statLbl}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* FREE UPGRADE NUDGE */}
        {isFree && (
          <TouchableOpacity style={s.upgradeNudge} onPress={() => onNavigate("upgrade")} activeOpacity={0.88}>
            <View style={{flex:1}}>
              <Text style={s.nudgeEye}>FREE PLAN</Text>
              <Text style={s.nudgeTitle}>You have {scansLeft ?? 10} scans left this month</Text>
              <Text style={s.nudgeSub}>Seller is $14.99/month. One flip pays for 3 months.</Text>
            </View>
            <Text style={{color:C.green, fontSize:22}}>→</Text>
          </TouchableOpacity>
        )}

        {/* SPECIALTY SCANNER HERO */}
        <TouchableOpacity style={s.specialtyHero} onPress={() => onNavigate("specialty")} activeOpacity={0.88}>
          <View style={s.specialtyLeft}>
            <View style={s.specialtyBadge}><Text style={s.specialtyBadgeTxt}>🎯 SPECIALTY SCANNER</Text></View>
            <Text style={s.specialtyTitle}>Expert AI for{"\n"}Rare & Luxury Items</Text>
            <Text style={s.specialtySubtitle}>Sneakers · Watches · Cards · Wine · Designer & 20 categories</Text>
            <View style={s.specialtyPill}><Text style={s.specialtyPillTxt}>10x deeper than standard scan →</Text></View>
          </View>
          <View style={s.specialtyRight}>
            {["👟","⌚","🃏","🍷","👜","🎸"].map((e,i) => (
              <Text key={i} style={[s.specialtyEmoji, {opacity:1-i*0.12}]}>{e}</Text>
            ))}
          </View>
        </TouchableOpacity>

        {/* YOUR TOOLS - collapsible */}
        <SectionHeader title="YOUR TOOLS" expanded={showTools} onToggle={() => setShowTools(v => !v)}/>
        {showTools && (
          <View style={s.toolGrid}>
            {myTools.map(tool => (
              <TouchableOpacity
                key={tool.id}
                style={[s.toolCard, {borderColor:tool.accent+"30"}]}
                onPress={() => onNavigate(tool.id)}
                activeOpacity={0.82}
              >
                <View style={[s.toolIconBox, {backgroundColor:tool.accent+"15"}]}>
                  <Text style={{fontSize:22}}>{tool.icon}</Text>
                </View>
                <Text style={s.toolName}>{tool.name}</Text>
                <Text style={s.toolDesc}>{tool.desc}</Text>
              </TouchableOpacity>
            ))}
            {lockedTools.length > 0 && (
              <TouchableOpacity style={[s.toolCard, s.lockedCard]} onPress={() => onNavigate("upgrade")} activeOpacity={0.82}>
                <View style={[s.toolIconBox, {backgroundColor:C.border}]}>
                  <Text style={{fontSize:22}}>🔒</Text>
                </View>
                <Text style={[s.toolName, {color:C.text4}]}>{lockedTools.length} More Tools</Text>
                <Text style={[s.toolDesc, {color:C.text4}]}>Upgrade to unlock →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* AI UNFAIR ADVANTAGE - collapsible, Pro+ only */}
        {isPro ? (
          <>
            <SectionHeader title="⚡ AI UNFAIR ADVANTAGE" expanded={showAI} onToggle={() => setShowAI(v => !v)}/>
            {showAI && (
              <View style={[s.aiSection, {marginBottom:14}]}>
                <View style={s.aiHeader}>
                  <Text style={s.aiHeaderTxt}>12 AI tools in development — exclusive to Pro & Lifetime members. Every one included at no extra cost when they launch.</Text>
                </View>
                {[
                  { icon:"⏱️", name:"True Hourly Rate", color:C.green, badge:"Q3 2026" },
                  { icon:"📸", name:"Photo IQ", color:"#b066ff", badge:"Q3 2026" },
                  { icon:"💨", name:"Cash Velocity Score", color:C.yellow, badge:"Q3 2026" },
                  { icon:"🎯", name:"Condition Grader AI", color:C.orange, badge:"Q4 2026" },
                  { icon:"🗓️", name:"Perfect Timing Engine", color:"#4db8ff", badge:"Q4 2026" },
                  { icon:"🔮", name:"Return Rate Predictor", color:"#ff6b6b", badge:"2027" },
                ].map((w,i) => (
                  <View key={i} style={[s.aiItem, {borderColor:w.color+"20"}]}>
                    <Text style={{fontSize:18}}>{w.icon}</Text>
                    <Text style={[s.aiItemName, {color:w.color}]}>{w.name}</Text>
                    <View style={[s.aiBadge, {backgroundColor:w.color+"20"}]}>
                      <Text style={[s.aiBadgeTxt, {color:w.color}]}>{w.badge}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <TouchableOpacity style={s.aiTeaser} onPress={() => onNavigate("upgrade")} activeOpacity={0.88}>
            <View style={{flex:1}}>
              <Text style={s.aiTeaserEye}>PRO & LIFETIME EXCLUSIVE</Text>
              <Text style={s.aiTeaserTitle}>⚡ The Unfair Advantage</Text>
              <Text style={s.aiTeaserSub}>12 AI tools no other resale app has. Unlock at Pro.</Text>
            </View>
            <Text style={{color:"#b066ff", fontSize:18, marginLeft:12}}>→</Text>
          </TouchableOpacity>
        )}

        {/* COMING SOON - collapsible */}
        <SectionHeader title="COMING SOON" expanded={showSoon} onToggle={() => setShowSoon(v => !v)}/>
        {showSoon && (
          <View style={{marginBottom:14}}>
            {COMING_SOON.map((item, i) => (
              <View key={i} style={[s.csCard, {borderColor:item.color+"25"}]}>
                <Text style={{fontSize:22, marginRight:10}}>{item.icon}</Text>
                <View style={{flex:1}}>
                  <Text style={[s.csName, {color:item.color}]}>{item.name}</Text>
                  <Text style={s.csDesc}>{item.desc}</Text>
                </View>
                <View style={[s.csBadge, {backgroundColor:item.color+"20", borderColor:item.color+"40"}]}>
                  <Text style={[s.csBadgeTxt, {color:item.color}]}>{item.badge}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* RECENT SCANS - collapsible */}
        <SectionHeader title="RECENT SCANS" expanded={showScans} onToggle={() => setShowScans(v => !v)}/>
        {showScans && (
          <>
            {scans.length === 0 ? (
              <TouchableOpacity style={s.emptyCard} onPress={() => onNavigate("scanner")} activeOpacity={0.88}>
                <Text style={{fontSize:40, marginBottom:10}}>📷</Text>
                <Text style={s.emptyTitle}>No scans yet — find your first flip</Text>
                <Text style={s.emptyBtn}>Scan an Item →</Text>
              </TouchableOpacity>
            ) : (
              <>
                {scans.map((scan: any, i: number) => (
                  <TouchableOpacity key={i} style={s.scanRow} onPress={() => onNavigate("history")} activeOpacity={0.8}>
                    {scan.photo_url ? (
                      <Image source={{uri: scan.photo_url}} style={s.scanThumb}/>
                    ) : (
                      <View style={[s.scanThumb, {backgroundColor:C.surface, alignItems:"center", justifyContent:"center"}]}>
                        <Text style={{fontSize:20}}>📷</Text>
                      </View>
                    )}
                    <View style={[s.verdict, {
                      backgroundColor:scan.decision==="BUY"?C.green+"20":scan.decision==="WATCH"?C.yellow+"20":"#ff6b6b20"
                    }]}>
                      <Text style={[s.verdictTxt, {
                        color:scan.decision==="BUY"?C.green:scan.decision==="WATCH"?C.yellow:C.red
                      }]}>{scan.decision==="BUY"?"BUY":scan.decision==="WATCH"?"WATCH":"PASS"}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={s.scanName} numberOfLines={1}>{scan.item_name || "Item"}</Text>
                      <Text style={s.scanMeta}>
                        {scan.decision==="BUY"? "+$" + (Math.round(scan.net_profit||0)) + " · " :""}
                        {(scan.best_platform||"").split("|||")[0]}
                      </Text>
                    </View>
                    <Text style={{color:C.text4, fontSize:18}}>›</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={s.viewAll} onPress={() => onNavigate("history")}>
                  <Text style={s.viewAllTxt}>View full scan history →</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

      </ScrollView>
    </SAV>
  );
}

const s = StyleSheet.create({
  safe:          { flex:1, backgroundColor:C.bg },
  nav:           { flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, borderBottomWidth:1, borderBottomColor:C.border },
  logoRow:       { flexDirection:"row", alignItems:"center", gap:8 },
  logoBox:       { width:32, height:32, borderRadius:9, backgroundColor:C.green, alignItems:"center", justifyContent:"center" },
  logoV:         { color:C.greenDark, fontSize:18, fontWeight:"900" },
  logoTxt:       { color:C.text1, fontSize:19, fontWeight:"900", letterSpacing:-0.5 },
  navRight:      { flexDirection:"row", alignItems:"center", gap:8 },
  planBadge:     { borderRadius:100, borderWidth:1, paddingHorizontal:10, paddingVertical:4 },
  planBadgeTxt:  { fontSize:10, fontWeight:"800" },
  scansBadge:    { backgroundColor:C.greenBg, borderRadius:100, paddingHorizontal:8, paddingTop:16, paddingBottom:10, borderWidth:1, borderColor:C.greenBorder },
  scansBadgeTxt: { color:C.green, fontSize:10, fontWeight:"700" },
  scroll:        { padding:16, paddingBottom:100 },
  // Hero
  hero:          { backgroundColor:C.greenBg, borderWidth:2, borderColor:C.green+"60", borderRadius:22, padding:22, flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:12 },
  heroEye:       { color:C.green, fontSize:8, fontWeight:"900", letterSpacing:2, marginBottom:6 },
  heroTitle:     { color:C.text1, fontSize:26, fontWeight:"900", letterSpacing:-0.8, marginBottom:4 },
  heroSub:       { color:C.text3, fontSize:13 },
  // Live
  liveBar:       { backgroundColor:"#130a00", borderWidth:1.5, borderColor:"#ff6b6b50", borderRadius:16, padding:16, marginBottom:16 },
  liveTopRow:    { flexDirection:"row", alignItems:"center", gap:8, marginBottom:10 },
  livePulse:     { flexDirection:"row", alignItems:"center", gap:6 },
  liveDot:       { width:9, height:9, borderRadius:5, backgroundColor:C.red },
  liveLbl:       { color:C.red, fontSize:11, fontWeight:"900", letterSpacing:1 },
  liveTime:      { color:C.text4, fontSize:10, marginLeft:"auto" as any },
  liveSeeAll:    { color:C.orange, fontSize:11, fontWeight:"700", marginLeft:8 },
  liveTxt:       { color:C.text1, fontSize:14, fontWeight:"700", lineHeight:20, marginBottom:2 },
  liveSubtxt:    { color:C.text4, fontSize:11 },
  // Specialty Hero
  specialtyHero:      { backgroundColor:"#0a0d08", borderWidth:1.5, borderColor:C.green+"40", borderRadius:18, padding:18, marginBottom:16, flexDirection:"row", alignItems:"center", overflow:"hidden" },
  specialtyLeft:      { flex:1, gap:6 },
  specialtyBadge:     { backgroundColor:C.green+"15", borderRadius:100, paddingHorizontal:10, paddingVertical:4, alignSelf:"flex-start" as any },
  specialtyBadgeTxt:  { color:C.green, fontSize:9, fontWeight:"900", letterSpacing:1 },
  specialtyTitle:     { color:C.text1, fontSize:18, fontWeight:"900", letterSpacing:-0.5, lineHeight:24 },
  specialtySubtitle:  { color:C.text3, fontSize:11, lineHeight:16 },
  specialtyPill:      { backgroundColor:C.green+"20", borderRadius:8, paddingHorizontal:10, paddingVertical:6, alignSelf:"flex-start" as any, marginTop:4 },
  specialtyPillTxt:   { color:C.green, fontSize:11, fontWeight:"800" },
  specialtyRight:     { flexDirection:"column", gap:2, paddingLeft:10, alignItems:"center" },
  specialtyEmoji:     { fontSize:20 },
  // Stats
  statsRow:      { flexDirection:"row", gap:8, marginBottom:14 },
  statCard:      { flex:1, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:12, alignItems:"center" },
  statVal:       { fontSize:20, fontWeight:"900", letterSpacing:-0.5 },
  statLbl:       { color:C.text4, fontSize:9, fontWeight:"700", textTransform:"uppercase", marginTop:3, letterSpacing:0.5 },
  // Upgrade nudge
  upgradeNudge:  { backgroundColor:"#0a1500", borderWidth:1.5, borderColor:C.greenBorder, borderRadius:14, padding:16, flexDirection:"row", alignItems:"center", marginBottom:14 },
  nudgeEye:      { color:C.green, fontSize:8, fontWeight:"900", letterSpacing:2, marginBottom:4 },
  nudgeTitle:    { color:C.text1, fontSize:14, fontWeight:"800", marginBottom:4 },
  nudgeSub:      { color:C.text3, fontSize:12, lineHeight:17 },
  // Tools
  toolGrid:      { flexDirection:"row", flexWrap:"wrap", gap:8, marginBottom:6 },
  toolCard:      { width:"47.5%", backgroundColor:C.surface, borderWidth:1, borderRadius:14, padding:13 },
  lockedCard:    { opacity:0.5, borderColor:C.border },
  toolIconBox:   { width:40, height:40, borderRadius:11, alignItems:"center", justifyContent:"center", marginBottom:8 },
  toolName:      { color:C.text1, fontSize:12, fontWeight:"800", marginBottom:3 },
  toolDesc:      { color:C.text3, fontSize:10, lineHeight:14 },
  // AI section
  aiSection:     { backgroundColor:C.surface, borderWidth:1, borderColor:"#b066ff30", borderRadius:14 },
  aiHeader:      { padding:14, borderBottomWidth:1, borderBottomColor:C.border },
  aiHeaderTxt:   { color:C.text3, fontSize:12, lineHeight:17 },
  aiItem:        { flexDirection:"row", alignItems:"center", padding:12, borderBottomWidth:1, borderBottomColor:C.border, gap:10 },
  aiItemName:    { flex:1, fontSize:13, fontWeight:"700" },
  aiBadge:       { borderRadius:100, paddingHorizontal:8, paddingVertical:2 },
  aiBadgeTxt:    { fontSize:9, fontWeight:"700" },
  aiTeaser:      { backgroundColor:C.surface, borderWidth:1, borderColor:"#b066ff30", borderRadius:14, padding:14, flexDirection:"row", alignItems:"center", marginBottom:14 },
  aiTeaserEye:   { color:"#b066ff", fontSize:8, fontWeight:"900", letterSpacing:1.5, marginBottom:4 },
  aiTeaserTitle: { color:C.text1, fontSize:15, fontWeight:"900", marginBottom:4 },
  aiTeaserSub:   { color:C.text3, fontSize:12, lineHeight:17 },
  // Coming soon
  csCard:        { backgroundColor:C.surface, borderWidth:1, borderRadius:14, padding:14, flexDirection:"row", alignItems:"flex-start", marginBottom:8 },
  csName:        { fontSize:13, fontWeight:"800", marginBottom:3 },
  csDesc:        { color:C.text3, fontSize:11, lineHeight:15 },
  csBadge:       { borderWidth:1, borderRadius:100, paddingHorizontal:8, paddingTop:16, paddingBottom:10, marginLeft:8, flexShrink:0 },
  csBadgeTxt:    { fontSize:8, fontWeight:"900" },
  // Scans
  emptyCard:     { backgroundColor:C.surface, borderRadius:14, padding:28, alignItems:"center", marginBottom:8 },
  emptyTitle:    { color:C.text2, fontSize:14, fontWeight:"600", textAlign:"center", marginBottom:12 },
  emptyBtn:      { color:C.green, fontSize:14, fontWeight:"800" },
  scanRow:       { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:10, flexDirection:"row", alignItems:"center", gap:10, marginBottom:6 },
  scanThumb:     { width:48, height:48, borderRadius:8, flexShrink:0 },
  verdict:       { borderRadius:8, paddingHorizontal:8, paddingTop:16, paddingBottom:10, minWidth:48, alignItems:"center", flexShrink:0 },
  verdictTxt:    { fontSize:9, fontWeight:"900", letterSpacing:0.5 },
  scanName:      { color:C.text1, fontSize:13, fontWeight:"600", marginBottom:2 },
  scanMeta:      { color:C.text3, fontSize:11 },
  viewAll:       { alignItems:"center", paddingTop: 16, paddingBottom: 10 },
  viewAllTxt:    { color:C.green, fontSize:13, fontWeight:"600" },
});
