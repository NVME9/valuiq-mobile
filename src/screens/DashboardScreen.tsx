import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, SafeAreaView, StatusBar, ActivityIndicator,
} from "react-native";
import { C } from "../lib/theme";
import { getScanHistory } from "../lib/api";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

function planLevel(p:string) { return {free:0,seller:1,pro:2,lifetime:3}[p]||0; }

const FREE_TOOLS = [
  { id:"price-battle", icon:"⚡", title:"Price Battle",     desc:"Compare all 12 platforms",       color:C.orange },
  { id:"community",    icon:"🔥", title:"Community Wins",   desc:"See what others are flipping",   color:"#ff6b6b" },
  { id:"leaderboard",  icon:"🏆", title:"Leaderboard",      desc:"Top flippers this week",         color:C.yellow  },
];

const SELLER_TOOLS = [
  { id:"thrift-run",   icon:"🛍️", title:"Thrift Run",       desc:"Rapid-scan a whole store",       color:C.green   },
  { id:"deathpile",    icon:"💀", title:"Death Pile Rescuer",desc:"Fix stuck inventory",            color:"#a09b94" },
  { id:"relist",       icon:"✏️", title:"Auto-Relister",    desc:"AI listings for every platform", color:C.green   },
  { id:"hot-now",      icon:"🔥", title:"Hot Right Now",    desc:"What's selling fast this week",  color:"#ff6b6b" },
];

const PRO_TOOLS = [
  { id:"manifest",      icon:"📋", title:"Manifest Analyzer",  desc:"Score liquidation lots",         color:C.yellow  },
  { id:"arbitrage",     icon:"📈", title:"Arbitrage Search",   desc:"Find underpriced eBay items",    color:C.green   },
  { id:"bundle",        icon:"📦", title:"Bundle Builder",     desc:"Group items, higher price",      color:C.green   },
  { id:"alerts",        icon:"🔔", title:"Sourcing Alerts",    desc:"24/7 eBay deal monitor",        color:C.orange  },
  { id:"inventory",     icon:"🗂️", title:"Inventory Tracker",  desc:"Track every item buy to sold",  color:C.text3   },
  { id:"profit-tracker",icon:"📊", title:"Profit Tracker",     desc:"Real P&L — your true profit",   color:C.green   },
  { id:"specialty",     icon:"🏺", title:"Specialty Scanner",  desc:"Wine, Coins, Cards, Art & more",color:"#b066ff" },
];

const COMING_SOON = [
  { icon:"🤖", title:"Deal Hunter AI",        desc:"24/7 autonomous deal-finding agent — scours every platform while you sleep", badge:"Coming Soon" },
  { icon:"🏭", title:"Liquidation Lot Finder",desc:"Live feed of profitable lots from B-Stock, BULQ, Liquidation.com",           badge:"Coming Soon" },
  { icon:"📱", title:"Live Auction Intel",     desc:"Real-time Whatnot auction data — know what's selling before you go live",   badge:"Coming Soon" },
];

export default function DashboardScreen({ token, plan, scansLeft, onNavigate, onLogout }: Props) {
  const [scans, setScans]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userLevel = planLevel(plan);
  const isPaid    = userLevel >= 1;
  const isSeller  = userLevel >= 1;
  const isPro     = userLevel >= 2;
  const planColor = ({lifetime:C.yellow,pro:C.orange,seller:C.green} as any)[plan]||C.text4;
  const planLabel = plan==="lifetime"?"♾️ Lifetime":plan==="pro"?"🔥 Pro":plan==="seller"?"💪 Seller":"Free";

  useEffect(()=>{ load(); },[]);
  async function load() { const h = await getScanHistory(token).catch(()=>[]); setScans(h); setLoading(false); }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const vc = (v:string) => v==="BUY"?C.green:v==="WATCH"?C.yellow:C.red;
  const totalProfit = scans.filter(s=>s.verdict==="BUY").reduce((sum,s)=>sum+(s.profit||0),0);

  const sellerToolIds = ["thrift-run","deathpile","relist","hot-now"];
  function ToolCard({ tool, locked }: { tool:any; locked:boolean }) {
    return (
      <TouchableOpacity
        style={[s.toolCard, locked&&{opacity:0.45}]}
        onPress={()=>locked?onNavigate("upgrade"):onNavigate(tool.id)}
        activeOpacity={0.75}
      >
        {locked && <View style={[s.lockPip,{backgroundColor:sellerToolIds.includes(tool.id)?C.green:C.orange}]}><Text style={{fontSize:8,color:"#000",fontWeight:"900"}}>{sellerToolIds.includes(tool.id)?"SELLER":"PRO"}</Text></View>}
        <Text style={s.toolIcon}>{tool.icon}</Text>
        <Text style={[s.toolTitle,{color:locked?C.text4:tool.color}]} numberOfLines={1}>{tool.title}</Text>
        <Text style={s.toolDesc} numberOfLines={2}>{tool.desc}</Text>
      </TouchableOpacity>
    );
  }

  function SectionHeader({ title, subtitle, locked, requiredPlan }:
    { title:string; subtitle?:string; locked:boolean; requiredPlan?:string }) {
    return (
      <View style={s.sectionHeader}>
        <View style={{flex:1}}>
          <Text style={[s.sectionTitle,locked&&{color:C.text4}]}>{title}</Text>
          {subtitle&&<Text style={s.sectionSub}>{subtitle}</Text>}
        </View>
        {locked&&requiredPlan&&(
          <TouchableOpacity onPress={()=>onNavigate("upgrade")} style={s.unlockBtn}>
            <Text style={s.unlockBtnTxt}>Unlock {requiredPlan} →</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <ScrollView
        contentContainerStyle={s.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green}/>}
      >
        {/* Nav */}
        <View style={s.nav}>
          <View style={s.logoRow}>
            <View style={s.logoIcon}><Text style={s.logoIconTxt}>V</Text></View>
            <Text style={s.logoTxt}>ValuIQ</Text>
          </View>
          <View style={{flexDirection:"row",alignItems:"center",gap:14}}>
            <TouchableOpacity onPress={()=>onNavigate("profile")}><Text style={{fontSize:22}}>👤</Text></TouchableOpacity>
            <TouchableOpacity onPress={onLogout}><Text style={{color:C.text4,fontSize:13}}>Sign out</Text></TouchableOpacity>
          </View>
        </View>

        {/* Plan badge */}
        <View style={[s.planRow,{borderColor:planColor+"40",backgroundColor:planColor+"10"}]}>
          <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
            <View style={[s.planDot,{backgroundColor:planColor}]}/>
            <Text style={{color:planColor,fontSize:13,fontWeight:"700"}}>{planLabel} Plan</Text>
          </View>
          {!isPaid&&(
            <TouchableOpacity onPress={()=>onNavigate("upgrade")}>
              <Text style={{color:C.green,fontSize:13,fontWeight:"700"}}>Upgrade →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            [scans.length.toString(), "Scans",    C.text1],
            [scans.filter(s=>s.verdict==="BUY").length.toString(), "BUY Finds", C.green],
            ["$"+Math.round(totalProfit), "Profit", C.green],
          ].map(([val,label,color])=>(
            <View key={label as string} style={s.statCard}>
              <Text style={[s.statVal,{color:color as string}]}>{val as string}</Text>
              <Text style={s.statLabel}>{label as string}</Text>
            </View>
          ))}
        </View>

        {/* Upgrade banner */}
        {!isPaid&&(
          <TouchableOpacity style={s.upgBanner} onPress={()=>onNavigate("upgrade")} activeOpacity={0.85}>
            <View style={{flex:1}}>
              <Text style={s.upgTitle}>🚀 Upgrade for unlimited scans</Text>
              <Text style={s.upgSub}>Seller $19/mo · Pro $49/mo · Lifetime $197 early-bird</Text>
            </View>
            <Text style={{color:C.green,fontSize:20,fontWeight:"900",paddingLeft:8}}>→</Text>
          </TouchableOpacity>
        )}

        {/* ── SCANNER CTA — always at top ── */}
        <TouchableOpacity style={s.scannerCard} onPress={()=>onNavigate("scanner")} activeOpacity={0.85}>
          <View style={{flex:1}}>
            <Text style={s.scannerTitle}>📷 Start Scanning</Text>
            <Text style={s.scannerSub} numberOfLines={1}>
              {!isPaid
                ? `${scansLeft!==null?scansLeft:10} free scans remaining this month`
                : "Unlimited scans · tap to start"}
            </Text>
          </View>
          <View style={s.scannerBtn}><Text style={s.scannerBtnTxt}>Scan →</Text></View>
        </TouchableOpacity>

        {/* ── SPECIALTY TEASER — visible to all, gated ── */}
        <TouchableOpacity
          style={[s.specialtyTeaser, isPro&&{borderColor:"#b066ff60"}]}
          onPress={()=>isPro?onNavigate("specialty"):onNavigate("upgrade")}
          activeOpacity={0.85}
        >
          <View style={{flex:1}}>
            <View style={{flexDirection:"row",alignItems:"center",gap:8,marginBottom:4}}>
              <Text style={{fontSize:20}}>🏺</Text>
              <Text style={s.specialtyTeaserTitle}>Specialty Scanner</Text>
              {!isPro&&<View style={s.proBadge}><Text style={s.proBadgeTxt}>PRO ONLY</Text></View>}
            </View>
            <Text style={s.specialtyTeaserDesc}>Expert AI for Wine, Coins, Cards, Jewelry, Antiques & more — categories that need deep knowledge</Text>
          </View>
          <Text style={{color:isPro?"#b066ff":C.text4,fontSize:20,paddingLeft:8}}>→</Text>
        </TouchableOpacity>

        {/* ── FREE TIER TOOLS ── */}
        <SectionHeader
          title="🆓 Free Tools"
          subtitle="Available on all plans"
          locked={false}
        />
        <View style={s.toolsGrid}>
          {FREE_TOOLS.map(t=><ToolCard key={t.id} tool={t} locked={false}/>)}
        </View>

        {/* ── SELLER TOOLS ── */}
        <SectionHeader
          title="💪 Seller Tools"
          subtitle={isSeller?"Your plan includes these":"Unlock with Seller plan — $19/mo"}
          locked={!isSeller}
          requiredPlan="Seller"
        />
        <View style={[s.toolsGrid,!isSeller&&s.lockedSection]}>
          {SELLER_TOOLS.map(t=><ToolCard key={t.id} tool={t} locked={!isSeller}/>)}
        </View>

        {/* ── PRO TOOLS ── */}
        <SectionHeader
          title="⚡ Pro Power Tools"
          subtitle={isPro?"Your plan includes these":"Unlock with Pro plan — $49/mo"}
          locked={!isPro}
          requiredPlan="Pro"
        />
        <View style={[s.toolsGrid,!isPro&&s.lockedSection]}>
          {PRO_TOOLS.map(t=><ToolCard key={t.id} tool={t} locked={!isPro}/>)}
        </View>

        {/* ── BUSINESS TIER PROMO ── */}
        <TouchableOpacity
          style={s.businessBanner}
          onPress={() => onNavigate("business")}
          activeOpacity={0.85}
        >
          <View style={{flex:1}}>
            <View style={{flexDirection:"row",alignItems:"center",gap:8,marginBottom:4}}>
              <Text style={{fontSize:20}}>💼</Text>
              <Text style={s.businessBannerTitle}>ValuIQ Business</Text>
              <View style={s.businessBadge}><Text style={s.businessBadgeTxt}>$149/MO</Text></View>
            </View>
            <Text style={s.businessBannerDesc}>Bulk scan, team accounts, tax export, demand forecasting, competitor intel</Text>
          </View>
          <Text style={{color:C.orange,fontSize:20,paddingLeft:8}}>→</Text>
        </TouchableOpacity>

        {/* ── COMING SOON ── */}
        <SectionHeader
          title="🔮 Coming Soon"
          subtitle="Next-level tools in development"
          locked={false}
        />
        {COMING_SOON.map((item,i)=>(
          <View key={i} style={s.comingSoonCard}>
            <View style={s.csBadge}><Text style={s.csBadgeTxt}>{item.badge}</Text></View>
            <View style={{flexDirection:"row",alignItems:"flex-start",gap:12}}>
              <Text style={{fontSize:28}}>{item.icon}</Text>
              <View style={{flex:1}}>
                <Text style={s.csTitle}>{item.title}</Text>
                <Text style={s.csDesc}>{item.desc}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* ── RECENT SCANS ── */}
        <Text style={[s.sectionTitle,{marginTop:4,marginBottom:10}]}>Recent Scans</Text>
        {loading
          ? <View style={s.emptyCard}><ActivityIndicator color={C.green}/></View>
          : scans.length===0
            ? <View style={s.emptyCard}>
                <Text style={{fontSize:32,marginBottom:10}}>📷</Text>
                <Text style={s.emptyTitle}>No scans yet</Text>
                <Text style={s.emptyBody}>Tap the Scan card above to find your first profitable item</Text>
              </View>
            : scans.slice(0,10).map((scan,i)=>(
                <View key={scan.id||i} style={s.scanCard}>
                  <View style={{flex:1,paddingRight:12}}>
                    <Text style={s.scanName} numberOfLines={1}>{scan.item_name||"Unknown Item"}</Text>
                    <Text style={s.scanPlat}>{scan.best_platform?.split("|||")[0]||"—"}</Text>
                  </View>
                  <View style={{alignItems:"flex-end",gap:4}}>
                    <View style={[s.vBadge,{backgroundColor:vc(scan.verdict)+"15",borderColor:vc(scan.verdict)+"40"}]}>
                      <Text style={[s.vBadgeTxt,{color:vc(scan.verdict)}]}>{scan.verdict}</Text>
                    </View>
                    <Text style={s.scanProfit}>${Math.round(scan.profit||0)}</Text>
                  </View>
                </View>
              ))
        }
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            {flex:1,backgroundColor:C.bg},
  container:       {padding:20,paddingBottom:60},
  nav:             {flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:16},
  logoRow:         {flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:        {width:30,height:30,backgroundColor:C.green,borderRadius:8,alignItems:"center",justifyContent:"center"},
  logoIconTxt:     {color:C.greenDark,fontSize:15,fontWeight:"900"},
  logoTxt:         {color:C.text1,fontSize:17,fontWeight:"800",letterSpacing:-0.5},
  planRow:         {flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderRadius:12,paddingHorizontal:14,paddingVertical:10,marginBottom:16},
  planDot:         {width:8,height:8,borderRadius:4},
  statsRow:        {flexDirection:"row",gap:8,marginBottom:16},
  statCard:        {flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:14,alignItems:"center"},
  statVal:         {fontSize:20,fontWeight:"900",marginBottom:4},
  statLabel:       {color:C.text4,fontSize:10,fontWeight:"700",textTransform:"uppercase" as any,textAlign:"center" as any},
  upgBanner:       {backgroundColor:"#1e2a08",borderWidth:1,borderColor:"#3a5010",borderRadius:14,padding:16,marginBottom:14,flexDirection:"row",alignItems:"center"},
  upgTitle:        {color:C.green,fontSize:14,fontWeight:"800",marginBottom:3},
  upgSub:          {color:C.text3,fontSize:12},
  // Scanner CTA
  scannerCard:     {backgroundColor:C.greenBg,borderWidth:1.5,borderColor:C.greenBorder,borderRadius:14,padding:16,flexDirection:"row",alignItems:"center",marginBottom:12},
  scannerTitle:    {color:C.green,fontSize:15,fontWeight:"800",marginBottom:3},
  scannerSub:      {color:C.text3,fontSize:12},
  scannerBtn:      {backgroundColor:C.green,borderRadius:10,paddingVertical:10,paddingHorizontal:14,marginLeft:10},
  scannerBtnTxt:   {color:C.greenDark,fontSize:13,fontWeight:"900"},
  // Specialty teaser
  specialtyTeaser: {backgroundColor:"#0d0514",borderWidth:1.5,borderColor:"#b066ff30",borderRadius:14,padding:16,flexDirection:"row",alignItems:"center",marginBottom:20},
  specialtyTeaserTitle:{color:C.text1,fontSize:15,fontWeight:"800"},
  specialtyTeaserDesc: {color:C.text3,fontSize:12,lineHeight:17,marginTop:3},
  proBadge:        {backgroundColor:"#b066ff20",borderRadius:100,paddingHorizontal:8,paddingVertical:3,borderWidth:1,borderColor:"#b066ff50"},
  proBadgeTxt:     {color:"#b066ff",fontSize:9,fontWeight:"900"},
  // Section headers
  sectionHeader:   {flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,marginTop:4},
  sectionTitle:    {color:C.text1,fontSize:13,fontWeight:"800",letterSpacing:0.2},
  sectionSub:      {color:C.text4,fontSize:11,marginTop:2},
  unlockBtn:       {borderWidth:1,borderColor:C.green+"50",borderRadius:8,paddingHorizontal:10,paddingVertical:4,marginLeft:8},
  unlockBtnTxt:    {color:C.green,fontSize:11,fontWeight:"700"},
  // Tool grid
  toolsGrid:       {flexDirection:"row",flexWrap:"wrap" as any,gap:8,marginBottom:20},
  lockedSection:   {opacity:0.6},
  toolCard:        {width:"47.5%",backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:14,minHeight:90,position:"relative" as any},
  lockPip:         {position:"absolute" as any,top:8,right:8,backgroundColor:C.orange,borderRadius:100,paddingHorizontal:5,paddingVertical:2},
  toolIcon:        {fontSize:22,marginBottom:7},
  toolTitle:       {fontSize:13,fontWeight:"800",marginBottom:3},
  toolDesc:        {color:C.text4,fontSize:11,lineHeight:15},
  // Coming soon
  businessBanner:      { backgroundColor:"#0d0800", borderWidth:1.5, borderColor:C.orange+"40", borderRadius:14, padding:16, flexDirection:"row", alignItems:"center", marginBottom:8 },
  businessBannerTitle: { color:C.orange, fontSize:15, fontWeight:"800" as any },
  businessBannerDesc:  { color:C.text3, fontSize:12, lineHeight:17, marginTop:2 },
  businessBadge:       { backgroundColor:C.orange+"20", borderRadius:100, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:C.orange+"50" },
  businessBadgeTxt:    { color:C.orange, fontSize:9, fontWeight:"900" as any },
  comingSoonCard:  {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:16,marginBottom:10,position:"relative" as any},
  csBadge:         {position:"absolute" as any,top:12,right:12,backgroundColor:"#1a1a2e",borderRadius:100,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:"#4040a0"},
  csBadgeTxt:      {color:"#ffffff",fontSize:9,fontWeight:"900"},
  csTitle:         {color:C.text1,fontSize:16,fontWeight:"900",marginBottom:5},
  csDesc:          {color:C.text2,fontSize:14,lineHeight:20},
  // Recent scans
  emptyCard:       {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:36,alignItems:"center"},
  emptyTitle:      {color:C.text1,fontSize:16,fontWeight:"700",marginBottom:6},
  emptyBody:       {color:C.text3,fontSize:13,textAlign:"center" as any,lineHeight:20},
  scanCard:        {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:13,padding:14,marginBottom:8,flexDirection:"row",alignItems:"center"},
  scanName:        {color:C.text1,fontSize:14,fontWeight:"700",marginBottom:4},
  scanPlat:        {color:C.text4,fontSize:12},
  vBadge:          {borderWidth:1,borderRadius:100,paddingHorizontal:10,paddingVertical:3},
  vBadgeTxt:       {fontSize:11,fontWeight:"800"},
  scanProfit:      {color:C.text1,fontSize:14,fontWeight:"800"},
});
