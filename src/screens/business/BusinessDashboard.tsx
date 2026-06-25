import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token:string; plan:string; userEmail:string; onNavigate:(s:string)=>void; onLogout:()=>void; }

const TOOLS = [
  // 💎 THE, DIAMONDS — Features no other app has,
  { id:"vendor-intel",   icon:"🔬", title:"Vendor Intelligence",   desc:"Know if a vendor over-grades before buying",  badge:"🔥" as const, isDiamond:true },
  { id:"trend-predictor",icon:"📈", title:"Trend Predictor",       desc:"Know what's hot BEFORE everyone else",        badge:"🔥" as const, isDiamond:true },
  { id:"fake-detector",  icon:"🛡️", title:"Fake Detector",        desc:"Photo authentication — prevent account bans", badge:"🔥" as const, isDiamond:true },
  // ⚔️ CORE, WEAPONS,
  { id:"manifest-beast", icon:"📋", title:"Manifest Beast",        desc:"Score whole lots, get your max bid",             badge:"LIVE" as const },
  { id:"reseller-cfo",  icon:"💰", title:"The Reseller's CFO",   desc:"Your true margin by category + month-end forecast", badge:"NEW" as const, isDiamond:true },
  { id:"cashflow",       icon:"💰", title:"Cash Flow Oracle",       desc:"30/60/90 day forecast",                       badge:null },
  { id:"competitor",     icon:"🏹", title:"Competitor Intel",  desc:"Analyze top sellers in your category",          badge:null },
  // 🏢 TEAM & OPERATIONS,
  { id:"tax",            icon:"📊", title:"Tax Export",            desc:"Schedule C ready — accountant-approved",      badge:null },
  // 📱 CONSUMER, TOOLS (full access)
  { id:"scanner",        icon:"📷", title:"Item Scanner",          desc:"Scan any item",                               badge:null },
  { id:"deal-hunter",    icon:"🤖", title:"Deal Hunter",           desc:"Find deals across marketplaces",                        badge:null },
  { id:"viral-content",  icon:"📱", title:"Viral Content Engine",  desc:"TikTok scripts from your finds",              badge:"NEW" as const },
  { id:"sourcing-trip",  icon:"🗺️", title:"Sourcing Intel",        desc:"Where and what to source for profit",             badge:"NEW" as const },
  { id:"bundle",         icon:"📦", title:"Bundle Builder",   desc:"Bundle items for higher margins",             badge:null },
  { id:"ai-coach",       icon:"🎯", title:"AI Coach",              desc:"Personal analysis from your data",            badge:null },
];

export default function BusinessDashboard({ token, userEmail, onNavigate, onLogout }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hr = new Date().getHours();
  const g = hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const r = await fetch(`${API_BASE}/api/business/stats?token=${token}`);
      const d = await r.json();
      if (d.success) setStats(d);
    } catch {}
    setLoading(false); setRefreshing(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg}/>
      <View style={s.hdr}>
        <View>
          <Text style={s.greet}>{g}</Text>
          <Text style={s.hdrTitle}>Command Center</Text>
        </View>
        <View style={s.badgeRow}>
          <View style={s.badge}><Text style={s.badgeTxt}>💼 BUSINESS</Text></View>
          <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
            <Text style={s.logoutTxt}>↩</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} tintColor={B.orange} onRefresh={()=>{setRefreshing(true);load();}}/>}>
        {/* KPI, Strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:14}}>
          {[
            ["Scans Today",  stats?.scansToday||0,              B.text1],
            ["Profit Found", `$${stats?.profitFound||0}`,        B.profit],
            ["Active Jobs",  stats?.activeJobs||0,               B.orange],
            ["Deals Today",  stats?.dealsQueued||0,              B.warning],
            ["Team",         (stats?.teamCount||1) + " member" + ((stats?.teamCount||1)>1?"s":""), B.info],
          ].map(([l,v,c])=>(
            <View key={l as string} style={s.kpi}>
              <Text style={[s.kpiV,{color:c as string}]}>{v as string}</Text>
              <Text style={s.kpiL}>{l as string}</Text>
            </View>
          ))}
        </ScrollView>


        {/* Tools */}
        <Text style={s.secTit}>YOUR TITAN TOOLKIT</Text>
        <View style={s.grid}>
          {TOOLS.map(t=>(
            <TouchableOpacity key={t.id} style={[(t as any).isDiamond ? s.diamondCard : s.toolCard]} onPress={()=>onNavigate(t.id)} activeOpacity={0.8}>
              {(t as any).isDiamond && (
                <View style={s.diamondBadge}><Text style={s.diamondTxt}>💎 TITAN FEATURE</Text></View>
              )}
              {t.badge && t.badge !== "🔥" && (
                <View style={[s.tbadge,t.badge==="LIVE"||t.badge==="ON"?s.tbadgeLive:s.tbadgeNew]}>
                  {(t.badge==="LIVE"||t.badge==="ON")&&<View style={s.tdot}/>}
                  <Text style={[s.tbadgeTxt,t.badge==="LIVE"||t.badge==="ON"?{color:B.profit}:{color:B.orange}]}>{t.badge}</Text>
                </View>
              )}
              <Text style={s.tIcon}>{t.icon}</Text>
              <Text style={s.tName}>{t.title}</Text>
              <Text style={s.tDesc}>{t.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent, Deals */}
        {(stats?.recentDeals||[]).length > 0 && (
          <>
            <Text style={s.secTit}>LATEST INTELLIGENCE</Text>
            {stats.recentDeals.slice(0,3).map((d:any,i:number)=>(
              <TouchableOpacity key={i} style={s.dealCard} onPress={()=>onNavigate("deal-hunter")}>
                <View style={[s.score,{backgroundColor:d.score>=85?B.profit+"20":B.warning+"15"}]}>
                  <Text style={[s.scoreNum,{color:d.score>=85?B.profit:B.warning}]}>{d.score}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={s.dealTit} numberOfLines={1}>{d.title||"Deal"}</Text>
                  <Text style={s.dealMeta}>{d.source} · +${Math.round(d.profit||0)} est.</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      {flex:1,backgroundColor:B.bg},
  hdr:       {flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",paddingHorizontal:20,paddingTop:16,paddingBottom:14,borderBottomWidth:1,borderBottomColor:B.border},
  greet:     {color:B.text3,fontSize:11,fontWeight:"700" as any,textTransform:"uppercase" as any,letterSpacing:1},
  hdrTitle:  {color:B.text1,fontSize:22,fontWeight:"900" as any,letterSpacing:-0.5,marginTop:2},
  badgeRow:  {flexDirection:"row",alignItems:"center",gap:10},
  badge:     {backgroundColor:B.orangeBg,borderWidth:1,borderColor:B.orangeBorder,borderRadius:100,paddingHorizontal:10,paddingVertical:4},
  badgeTxt:  {color:B.orange,fontSize:9,fontWeight:"900" as any,letterSpacing:1},
  logoutBtn: {padding:4},
  logoutTxt: {color:B.text3,fontSize:18},
  scroll:    {padding:16,paddingBottom:100},
  kpi:       {backgroundColor:B.surface,borderWidth:1,borderColor:B.border,borderRadius:12,padding:12,minWidth:100,alignItems:"center"},
  kpiV:      {fontSize:20,fontWeight:"900" as any,letterSpacing:-0.5},
  kpiL:      {color:B.text3,fontSize:9,fontWeight:"700" as any,textTransform:"uppercase" as any,marginTop:3,letterSpacing:0.5},
  scoutBar:  {backgroundColor:B.surface,borderWidth:1.5,borderColor:"#00d08430",borderRadius:14,padding:13,flexDirection:"row",alignItems:"center",gap:10,marginBottom:16},
  dot:       {width:10,height:10,borderRadius:5,backgroundColor:B.profit},
  scoutTit:  {color:B.text1,fontSize:13,fontWeight:"700" as any},
  scoutSub:  {color:B.text3,fontSize:11,marginTop:2},
  secTit:    {color:B.text3,fontSize:10,fontWeight:"800" as any,letterSpacing:2,textTransform:"uppercase" as any,marginBottom:10,marginTop:4},
  grid:      {flexDirection:"row",flexWrap:"wrap" as any,gap:8,marginBottom:16},
  toolCard:  {backgroundColor:B.surface,borderWidth:1,borderColor:B.border,borderRadius:13,padding:13,width:"47.5%",position:"relative" as any},
  diamondCard:  {backgroundColor:"#0d0800",borderWidth:2,borderColor:"#ff8c42",borderRadius:13,padding:13,width:"47.5%",position:"relative" as any},
  diamondBadge: {backgroundColor:"#ff8c4220",borderRadius:100,paddingHorizontal:7,paddingVertical:3,alignSelf:"flex-start" as any,marginBottom:7,borderWidth:1,borderColor:"#ff8c4250"},
  diamondTxt:   {color:"#ff8c42",fontSize:8,fontWeight:"900" as any,letterSpacing:0.5},
  tbadge:    {flexDirection:"row",alignItems:"center",gap:4,borderWidth:1,borderRadius:100,paddingHorizontal:7,paddingVertical:3,alignSelf:"flex-start" as any,marginBottom:7},
  tbadgeLive:{backgroundColor:"#00d08415",borderColor:"#00d08440"},
  tbadgeNew: {backgroundColor:B.orangeBg,borderColor:B.orangeBorder},
  tdot:      {width:5,height:5,borderRadius:3,backgroundColor:B.profit},
  tbadgeTxt: {fontSize:8,fontWeight:"900" as any},
  tIcon:     {fontSize:24,marginBottom:5},
  tName:     {color:B.text1,fontSize:12,fontWeight:"800" as any,marginBottom:2},
  tDesc:     {color:B.text3,fontSize:10,lineHeight:14},
  dealCard:  {backgroundColor:B.surface,borderWidth:1,borderColor:B.border,borderRadius:11,padding:12,flexDirection:"row",alignItems:"center",gap:10,marginBottom:6},
  score:     {width:42,height:42,borderRadius:10,alignItems:"center",justifyContent:"center"},
  scoreNum:  {fontSize:17,fontWeight:"900" as any},
  dealTit:   {color:B.text1,fontSize:13,fontWeight:"600" as any},
  dealMeta:  {color:B.text3,fontSize:11,marginTop:2} });
