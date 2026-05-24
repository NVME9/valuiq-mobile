import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl } from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

const GRADE_CLR: Record<string,string> = { A:C.green, B:C.green, C:C.yellow, D:C.orange, F:C.red };
const TYPE_CFG: Record<string,{color:string;icon:string}> = {
  strength:    { color:C.green,  icon:"💪" },
  warning:     { color:C.red,    icon:"⚠️"  },
  opportunity: { color:C.yellow, icon:"💡" },
  tip:         { color:C.orange, icon:"🎯" },
};

export default function AICoachScreen({ token, plan, onNavigate, onBack }: Props) {
  const [data, setData]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isPaid = ["seller","pro","lifetime"].includes(plan);

  useEffect(() => { if (isPaid) load(); else setLoading(false); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/ai-coach?token=${token}`);
      const d = await r.json();
      if (d.success) setData(d);
    } catch {}
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.back}><Text style={s.backTxt}>←</Text></TouchableOpacity>
        <Text style={s.navTitle}>🎯 AI Coach</Text>
        <View style={{width:36}}/>
      </View>

      {!isPaid ? (
        <ScrollView contentContainerStyle={{padding:24}}>
          <View style={s.lockedCard}>
            <Text style={{fontSize:48,marginBottom:16}}>🎯</Text>
            <Text style={s.lockedTitle}>Your Personal AI Coach</Text>
            <Text style={s.lockedBody}>Analyzes your scan patterns — what you overpay for, your best categories, projected monthly profit, and exactly what to do differently.</Text>
            <TouchableOpacity style={s.upgradeBtn} onPress={()=>onNavigate("upgrade")}>
              <Text style={s.upgradeTxt}>Unlock with Seller Plan →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green} onRefresh={async()=>{setRefreshing(true);await load();setRefreshing(false);}}/>}>
          {loading ? (
            <View style={s.center}><ActivityIndicator color={C.green} size="large"/><Text style={s.loadTxt}>Analyzing your scan history...</Text></View>
          ) : !data?.hasEnoughData ? (
            <View style={s.emptyCard}>
              <Text style={{fontSize:40,marginBottom:12}}>📊</Text>
              <Text style={s.emptyTitle}>Need more data</Text>
              <Text style={s.emptySub}>{data?.message || "Scan more items to unlock coach insights."}</Text>
              {(data?.scansNeeded||0) > 0 && <Text style={[s.emptySub,{color:C.green,marginTop:8,fontWeight:"700" as any}]}>{data.scansNeeded} more scan{data.scansNeeded>1?"s":""} to unlock</Text>}
              <TouchableOpacity style={[s.upgradeBtn,{marginTop:16}]} onPress={()=>onNavigate("scanner")}><Text style={s.upgradeTxt}>Start Scanning →</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[s.gradeCard,{borderColor:(GRADE_CLR[data.coaching?.overallGrade||"C"])+"50"}]}>
                <View style={s.gradeLeft}>
                  <Text style={[s.gradeLetter,{color:GRADE_CLR[data.coaching?.overallGrade||"C"]}]}>{data.coaching?.overallGrade||"—"}</Text>
                  <Text style={s.gradeLbl}>Grade</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={s.gradeReason}>{data.coaching?.gradeReasoning}</Text>
                  <View style={s.statsRow}>
                    {([[data.stats?.totalScans,"Scans",C.text1],[data.stats?.buyFinds,"Finds",C.green],[data.stats?.buyRate+"%","Buy Rate",C.green],["$"+data.stats?.avgProfit,"Avg Profit",C.green]] as any[]).map(([v,l,c]:any)=>(
                      <View key={l} style={s.mini}><Text style={[s.miniVal,{color:c}]}>{v}</Text><Text style={s.miniLbl}>{l}</Text></View>
                    ))}
                  </View>
                </View>
              </View>

              {data.coaching?.weeklyGoal && (
                <View style={s.goalCard}>
                  <Text style={s.goalLbl}>📌 This Week's Goal</Text>
                  <Text style={s.goalTxt}>{data.coaching.weeklyGoal}</Text>
                </View>
              )}

              {(data.coaching?.insights||[]).map((ins:any,i:number)=>{
                const cfg = TYPE_CFG[ins.type]||TYPE_CFG.tip;
                return (
                  <View key={i} style={[s.insCard,{borderColor:cfg.color+"30"}]}>
                    <View style={s.insHeader}><Text style={{fontSize:20}}>{cfg.icon}</Text><Text style={[s.insTitle,{color:cfg.color}]}>{ins.title}</Text></View>
                    <Text style={s.insBody}>{ins.body}</Text>
                    {ins.metric && <View style={[s.metric,{backgroundColor:cfg.color+"15"}]}><Text style={[s.metricTxt,{color:cfg.color}]}>📊 {ins.metric}</Text></View>}
                  </View>
                );
              })}

              {data.coaching?.profitProjection && (
                <View style={s.projCard}>
                  <Text style={s.projLbl}>💰 Monthly Projection</Text>
                  <Text style={s.projAmt}>${data.coaching.profitProjection.monthly?.toLocaleString()}</Text>
                  <Text style={s.projReason}>{data.coaching.profitProjection.reasoning}</Text>
                </View>
              )}

              {(data.coaching?.categoryRecommendation || data.coaching?.platformRecommendation) && (
                <View style={s.recCard}>
                  <Text style={s.recTitle}>Focus Here</Text>
                  {data.coaching?.categoryRecommendation && <View style={s.recRow}><Text style={{fontSize:16}}>🗂️</Text><Text style={s.recTxt}>{data.coaching.categoryRecommendation}</Text></View>}
                  {data.coaching?.platformRecommendation && <View style={s.recRow}><Text style={{fontSize:16}}>📱</Text><Text style={s.recTxt}>{data.coaching.platformRecommendation}</Text></View>}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       {flex:1,backgroundColor:C.bg},
  nav:        {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border},
  back:       {width:36,height:36,justifyContent:"center"},
  backTxt:    {color:C.text3,fontSize:22},
  navTitle:   {color:C.text1,fontSize:16,fontWeight:"800" as any},
  scroll:     {padding:16,paddingBottom:60},
  center:     {alignItems:"center",paddingTop:60},
  loadTxt:    {color:C.text3,fontSize:14,marginTop:16},
  gradeCard:  {backgroundColor:C.surface,borderWidth:2,borderRadius:18,padding:16,marginBottom:12,flexDirection:"row",gap:16,alignItems:"flex-start"},
  gradeLeft:  {alignItems:"center",minWidth:60},
  gradeLetter:{fontSize:56,fontWeight:"900" as any,lineHeight:60},
  gradeLbl:   {color:C.text4,fontSize:10,fontWeight:"700" as any,textTransform:"uppercase" as any,marginTop:2},
  gradeReason:{color:C.text2,fontSize:13,lineHeight:18,marginBottom:10},
  statsRow:   {flexDirection:"row",flexWrap:"wrap" as any,gap:6},
  mini:       {alignItems:"center",backgroundColor:C.bg,borderRadius:8,paddingHorizontal:8,paddingVertical:5},
  miniVal:    {fontSize:13,fontWeight:"900" as any},
  miniLbl:    {color:C.text4,fontSize:9,fontWeight:"700" as any,textTransform:"uppercase" as any,marginTop:1},
  goalCard:   {backgroundColor:"#1e2a08",borderWidth:1,borderColor:C.greenBorder,borderRadius:14,padding:16,marginBottom:12},
  goalLbl:    {color:C.green,fontSize:11,fontWeight:"800" as any,textTransform:"uppercase" as any,letterSpacing:0.5,marginBottom:6},
  goalTxt:    {color:C.text1,fontSize:14,lineHeight:20,fontWeight:"600" as any},
  insCard:    {backgroundColor:C.surface,borderWidth:1,borderRadius:14,padding:14,marginBottom:10},
  insHeader:  {flexDirection:"row",alignItems:"center",gap:8,marginBottom:8},
  insTitle:   {fontSize:14,fontWeight:"800" as any,flex:1},
  insBody:    {color:C.text2,fontSize:13,lineHeight:19},
  metric:     {borderRadius:8,paddingHorizontal:10,paddingVertical:5,marginTop:8,alignSelf:"flex-start" as any},
  metricTxt:  {fontSize:12,fontWeight:"700" as any},
  projCard:   {backgroundColor:C.surface,borderWidth:1,borderColor:C.green+"30",borderRadius:14,padding:16,marginBottom:10,alignItems:"center"},
  projLbl:    {color:C.text4,fontSize:11,fontWeight:"700" as any,textTransform:"uppercase" as any,marginBottom:6},
  projAmt:    {color:C.green,fontSize:42,fontWeight:"900" as any,letterSpacing:-1},
  projReason: {color:C.text3,fontSize:12,textAlign:"center" as any,marginTop:6,lineHeight:17},
  recCard:    {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:16,marginBottom:10},
  recTitle:   {color:C.text1,fontSize:14,fontWeight:"800" as any,marginBottom:10},
  recRow:     {flexDirection:"row",gap:10,alignItems:"flex-start",marginBottom:8},
  recTxt:     {color:C.text2,fontSize:13,flex:1,lineHeight:18},
  lockedCard: {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:18,padding:24,alignItems:"center"},
  lockedTitle:{color:C.text1,fontSize:20,fontWeight:"900" as any,marginBottom:10},
  lockedBody: {color:C.text3,fontSize:14,lineHeight:21,textAlign:"center" as any,marginBottom:20},
  upgradeBtn: {backgroundColor:C.green,borderRadius:13,padding:16,alignItems:"center" as any,width:"100%" as any},
  upgradeTxt: {color:C.greenDark,fontSize:15,fontWeight:"900" as any},
  emptyCard:  {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  emptyTitle: {color:C.text1,fontSize:18,fontWeight:"700" as any,marginBottom:8},
  emptySub:   {color:C.text3,fontSize:13,textAlign:"center" as any,lineHeight:19},
});
