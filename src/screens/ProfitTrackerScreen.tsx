import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function ProfitTrackerScreen({ token, plan, onNavigate, onBack }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<"week"|"month"|"year"|"all">("month");
  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  useEffect(()=>{ if(isPaid) load(); else setLoading(false); },[period]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/profit-tracker?token=${token}&period=${period}`);
      const d = await r.json();
      if (d.success) setData(d);
    } catch {}
    setLoading(false);
  }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const pColor = (n: number) => n > 0 ? C.green : n < 0 ? C.red : C.text3;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>Profit Tracker</Text></View>
      </View>
      <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green}/>}>
        <Text style={s.h1}>📊 Profit Tracker</Text>
        <Text style={[s.body,{marginBottom:16}]}>Your real P&L. Buy price vs sell price vs fees — the actual number in your pocket.</Text>

        {!isPaid && (
          <View style={s.lockedCard}><Text style={{fontSize:36,marginBottom:10}}>🔒</Text><Text style={s.lockedTitle}>Seller Plan Required</Text>
            <TouchableOpacity style={[s.greenBtn,{marginTop:12}]} onPress={()=>onNavigate("upgrade")}><Text style={s.greenBtnText}>Upgrade →</Text></TouchableOpacity>
          </View>
        )}

        {isPaid && (
          <>
            {/* Period selector */}
            <View style={s.periodRow}>
              {(["week","month","year","all"] as const).map(p=>(
                <TouchableOpacity key={p} onPress={()=>setPeriod(p)} style={[s.periodBtn,period===p&&s.periodBtnActive]}>
                  <Text style={[s.periodText,period===p&&s.periodTextActive]}>
                    {p==="week"?"7D":p==="month"?"30D":p==="year"?"1Y":"All"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? <ActivityIndicator color={C.green} style={{padding:32}}/>
            : data ? (
              <>
                {/* Hero P&L */}
                <View style={[s.heroCard,{borderColor:pColor(data.summary?.netProfit||0)+"30"}]}>
                  <Text style={s.heroLabel}>NET PROFIT</Text>
                  <Text style={[s.heroAmount,{color:pColor(data.summary?.netProfit||0)}]}>
                    {(data.summary?.netProfit||0)>=0?"+":""}${Math.round(Math.abs(data.summary?.netProfit||0))}
                  </Text>
                  <Text style={s.heroSub}>{period==="week"?"Last 7 days":period==="month"?"Last 30 days":period==="year"?"Last year":"All time"}</Text>
                </View>

                {/* Breakdown */}
                <View style={s.breakdownCard}>
                  {[
                    ["Revenue","$"+Math.round(data.summary?.totalRevenue||0),C.green],
                    ["Cost of Goods","$"+Math.round(data.summary?.totalCogs||0),C.red],
                    ["Platform Fees","$"+Math.round(data.summary?.totalFees||0),C.orange],
                    ["Net Profit","$"+Math.round(data.summary?.netProfit||0),pColor(data.summary?.netProfit||0)],
                    ["ROI",Math.round(data.summary?.roi||0)+"%",pColor(data.summary?.netProfit||0)],
                    ["Items Sold",String(data.summary?.itemsSold||0),C.text1],
                    ["Avg Profit/Item","$"+Math.round(data.summary?.avgProfitPerItem||0),C.green],
                    ["Avg Days to Sell",String(data.summary?.avgDaysToSell||0)+" days",C.text3],
                  ].map(([label,value,color])=>(
                    <View key={label as string} style={s.breakdownRow}>
                      <Text style={s.breakdownLabel}>{label as string}</Text>
                      <Text style={[s.breakdownValue,{color:color as string}]}>{value as string}</Text>
                    </View>
                  ))}
                </View>

                {/* Platform breakdown */}
                {data.byPlatform?.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>By Platform</Text>
                    {data.byPlatform.map((p:any)=>(
                      <View key={p.platform} style={s.platformRow}>
                        <View style={{flex:1}}>
                          <Text style={s.platformName}>{p.platform}</Text>
                          <Text style={s.platformMeta}>{p.count} sales · avg {p.avgDays}d to sell</Text>
                        </View>
                        <View style={{alignItems:"flex-end"}}>
                          <Text style={[s.platformProfit,{color:pColor(p.profit)}]}>${Math.round(p.profit)}</Text>
                          <Text style={s.platformRoi}>{p.roi}% ROI</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {/* Recent sold */}
                {data.recentSales?.length > 0 && (
                  <>
                    <Text style={[s.sectionLabel,{marginTop:8}]}>Recent Sales</Text>
                    {data.recentSales.slice(0,10).map((sale:any,i:number)=>{
                      const profit = (Number(sale.sold_price)||0) - (Number(sale.bought_price)||0);
                      return (
                        <View key={i} style={s.saleRow}>
                          <Text style={s.saleName} numberOfLines={1}>{sale.item_name}</Text>
                          <Text style={[s.saleProfit,{color:pColor(profit)}]}>{profit>=0?"+":""}${Math.round(profit)}</Text>
                        </View>
                      );
                    })}
                  </>
                )}

                {data.summary?.itemsSold===0 && (
                  <View style={s.emptyCard}><Text style={{fontSize:36,marginBottom:10}}>📊</Text><Text style={s.emptyTitle}>No sales yet</Text><Text style={s.emptyBody}>Mark items as "Sold" in Inventory to track your P&L here</Text>
                    <TouchableOpacity style={[s.greenBtn,{marginTop:12}]} onPress={()=>onNavigate("inventory")}><Text style={s.greenBtnText}>Go to Inventory →</Text></TouchableOpacity>
                  </View>
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingTop: 16, paddingBottom: 10,gap:8},
  navBack:{padding:4},navBackText:{color:C.text3,fontSize:24,lineHeight:24},
  logoRow:{flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:{width:26,height:26,backgroundColor:C.green,borderRadius:7,alignItems:"center",justifyContent:"center"},
  logoIconText:{color:C.greenDark,fontSize:13,fontWeight:"900"},
  logoText:{color:C.text1,fontSize:16,fontWeight:"800",letterSpacing:-0.5},
  h1:{color:C.text1,fontSize:24,fontWeight:"900",letterSpacing:-0.5,marginBottom:4},
  body:{color:C.text2,fontSize:14,lineHeight:21},
  sectionLabel:{color:C.text4,fontSize:11,fontWeight:"700",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10},
  periodRow:{flexDirection:"row",backgroundColor:C.surface,borderRadius:12,padding:4,marginBottom:20,borderWidth:1,borderColor:C.border},
  periodBtn:{flex:1,paddingTop:16, paddingBottom:10,borderRadius:9,alignItems:"center"},
  periodBtnActive:{backgroundColor:C.bg},
  periodText:{color:C.text4,fontSize:13,fontWeight:"600"},
  periodTextActive:{color:C.text1,fontWeight:"800"},
  heroCard:{backgroundColor:"rgba(0,0,0,0.3)",borderWidth:2,borderRadius:20,padding:24,alignItems:"center",marginBottom:14},
  heroLabel:{color:C.text4,fontSize:11,fontWeight:"700",textTransform:"uppercase",letterSpacing:1,marginBottom:8},
  heroAmount:{fontSize:56,fontWeight:"900",letterSpacing:-2,lineHeight:60},
  heroSub:{color:C.text4,fontSize:13,marginTop:6},
  breakdownCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:4,marginBottom:14,overflow:"hidden"},
  breakdownRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",padding:12,borderBottomWidth:1,borderBottomColor:C.border},
  breakdownLabel:{color:C.text3,fontSize:13},
  breakdownValue:{fontSize:14,fontWeight:"700"},
  platformRow:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,marginBottom:8,flexDirection:"row",alignItems:"center"},
  platformName:{color:C.text1,fontSize:14,fontWeight:"700"},
  platformMeta:{color:C.text4,fontSize:11,marginTop:2},
  platformProfit:{fontSize:18,fontWeight:"900"},
  platformRoi:{color:C.text4,fontSize:11,marginTop:2},
  saleRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:10,padding:12,marginBottom:6},
  saleName:{color:C.text1,fontSize:13,fontWeight:"600",flex:1,paddingRight:12},
  saleProfit:{fontSize:15,fontWeight:"900"},
  greenBtn:{backgroundColor:C.green,borderRadius:14,paddingTop:16, paddingBottom:10,alignItems:"center"},
  greenBtnText:{color:C.greenDark,fontSize:15,fontWeight:"900"},
  lockedCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  lockedTitle:{color:C.text1,fontSize:18,fontWeight:"800"},
  emptyCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:36,alignItems:"center"},
  emptyTitle:{color:C.text1,fontSize:16,fontWeight:"700",marginBottom:6},
  emptyBody:{color:C.text3,fontSize:13,textAlign:"center"} });
