import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl } from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function SourcingAlertsScreen({ token, plan, onNavigate, onBack }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isPaid = ["seller","pro","lifetime"].includes(plan);

  useEffect(()=>{ if(isPaid) load(); else setLoading(false); },[]);

  async function load() {
    try {
      const r = await fetch(`${API_BASE}/api/alerts?token=${token}`);
      const d = await r.json();
      setAlerts(d.alerts||[]);
      setMatches(d.matches||[]);
    } catch {}
    setLoading(false);
  }

  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function saveAlert() {
    if (!keywords.trim()) { setError("Enter keywords."); return; }
    setSaving(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/alerts`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ token, keywords:keywords.trim(), maxPrice:Number(maxPrice)||0, minProfit:Number(minProfit)||0 }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error||"Failed");
      setKeywords(""); setMaxPrice(""); setMinProfit(""); setCreating(false);
      await load();
    } catch(e:any) { setError(e.message); }
    setSaving(false);
  }

  async function deleteAlert(id: string) {
    await fetch(`${API_BASE}/api/alerts/${id}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({token}) });
    await load();
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        {isPaid&&<TouchableOpacity onPress={()=>setCreating(v=>!v)} style={[s.navBtn,{marginLeft:"auto" as any,borderColor:C.green+"40"}]}><Text style={[s.navBtnText,{color:C.green}]}>+ New Alert</Text></TouchableOpacity>}
      </View>
      <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green}/>}>
        <Text style={s.h1}>🔔 Sourcing Alerts</Text>
        <Text style={[s.body,{marginBottom:20}]}>ValuIQ monitors eBay 24/7 and emails you when deals matching your criteria appear.</Text>

        {!isPaid&&<View style={s.lockedCard}><Text style={{fontSize:36,marginBottom:10}}>🔒</Text><Text style={s.lockedTitle}>Seller Plan Required</Text><Text style={s.lockedBody}>Upgrade to set alerts and get notified before anyone else sees the deals.</Text></View>}

        {isPaid&&creating&&(
          <View style={s.createCard}>
            <Text style={s.createTitle}>New Alert</Text>
            {error?<View style={s.errBox}><Text style={s.errText}>{error}</Text></View>:null}
            <Text style={s.label}>Keywords *</Text>
            <TextInput style={s.input} value={keywords} onChangeText={setKeywords} placeholder="e.g. Nike Dunk Low, Stanley Cup, Vitamix" placeholderTextColor={C.text4}/>
            <View style={{flexDirection:"row",gap:10,marginTop:10}}>
              <View style={{flex:1}}><Text style={s.label}>Max Buy Price</Text><TextInput style={s.input} value={maxPrice} onChangeText={setMaxPrice} placeholder="$50" placeholderTextColor={C.text4} keyboardType="decimal-pad"/></View>
              <View style={{flex:1}}><Text style={s.label}>Min Profit</Text><TextInput style={s.input} value={minProfit} onChangeText={setMinProfit} placeholder="$20" placeholderTextColor={C.text4} keyboardType="decimal-pad"/></View>
            </View>
            <View style={{flexDirection:"row",gap:10,marginTop:14}}>
              <TouchableOpacity style={[s.greenBtn,{flex:1}]} onPress={saveAlert} disabled={saving}>
                {saving?<ActivityIndicator color={C.greenDark} size="small"/>:<Text style={s.greenBtnText}>Save Alert</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setCreating(false)} style={s.cancelBtn}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {isPaid&&!loading&&(
          <>
            {alerts.length>0&&(
              <View style={{marginBottom:20}}>
                <Text style={s.sectionLabel}>Your Alerts ({alerts.length})</Text>
                {alerts.map((a:any)=>(
                  <View key={a.id} style={s.alertCard}>
                    <View style={{flex:1}}>
                      <Text style={s.alertKeywords}>{a.keywords}</Text>
                      <Text style={s.alertMeta}>{a.maxPrice?`Max $${a.maxPrice}`:""}{a.minProfit?` · Min profit $${a.minProfit}`:""}</Text>
                    </View>
                    <TouchableOpacity onPress={()=>deleteAlert(a.id)} style={s.deleteBtn}><Text style={{color:C.red,fontSize:18}}>✕</Text></TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {alerts.length===0&&!creating&&(
              <View style={s.emptyCard}><Text style={{fontSize:36,marginBottom:10}}>🔔</Text><Text style={s.emptyTitle}>No alerts yet</Text><Text style={s.emptyBody}>Tap "+ New Alert" to start monitoring eBay 24/7</Text></View>
            )}
            {matches.length>0&&(
              <View>
                <Text style={s.sectionLabel}>Recent Matches ({matches.length})</Text>
                {matches.map((m:any,i:number)=>(
                  <View key={i} style={[s.matchCard,{borderColor:C.green+"30"}]}>
                    <View style={{flex:1}}>
                      <Text style={s.matchTitle} numberOfLines={2}>{m.title}</Text>
                      <Text style={s.matchMeta}>Alert: {m.alert_keywords}</Text>
                    </View>
                    <View style={{alignItems:"flex-end"}}>
                      <Text style={{color:C.yellow,fontSize:16,fontWeight:"900"}}>${m.price}</Text>
                      <Text style={{color:C.green,fontSize:13,fontWeight:"700"}}>+${m.profit}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        {loading&&<View style={{alignItems:"center",padding:32}}><ActivityIndicator color={C.green} size="large"/></View>}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingVertical:14,gap:8},
  navBack:{padding:4},navBackText:{color:C.text3,fontSize:24,lineHeight:24},
  logoRow:{flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:{width:26,height:26,backgroundColor:C.green,borderRadius:7,alignItems:"center",justifyContent:"center"},
  logoIconText:{color:C.greenDark,fontSize:13,fontWeight:"900"},
  logoText:{color:C.text1,fontSize:16,fontWeight:"800",letterSpacing:-0.5},
  navBtn:{borderWidth:1,borderColor:C.border,borderRadius:7,paddingHorizontal:10,paddingVertical:5},
  navBtnText:{color:C.text3,fontSize:12,fontWeight:"600"},
  h1:{color:C.text1,fontSize:24,fontWeight:"900",letterSpacing:-0.5,marginBottom:4},
  body:{color:C.text2,fontSize:14,lineHeight:21},
  sectionLabel:{color:C.text4,fontSize:11,fontWeight:"700",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10},
  label:{color:C.text3,fontSize:13,fontWeight:"700",marginBottom:6},
  input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:13,color:C.text1,fontSize:14},
  greenBtn:{backgroundColor:C.green,borderRadius:14,paddingVertical:14,alignItems:"center"},
  greenBtnText:{color:C.greenDark,fontSize:15,fontWeight:"900"},
  cancelBtn:{borderWidth:1,borderColor:C.border,borderRadius:14,paddingVertical:14,paddingHorizontal:18},
  cancelBtnText:{color:C.text4,fontSize:14},
  errBox:{backgroundColor:"#1a0505",borderWidth:1,borderColor:C.red+"40",borderRadius:10,padding:12,marginBottom:12},
  errText:{color:C.red,fontSize:13},
  lockedCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  lockedTitle:{color:C.text1,fontSize:18,fontWeight:"800",marginBottom:6},
  lockedBody:{color:C.text3,fontSize:13,textAlign:"center"},
  createCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:18,marginBottom:16},
  createTitle:{color:C.text1,fontSize:16,fontWeight:"800",marginBottom:14},
  alertCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,marginBottom:8,flexDirection:"row",alignItems:"center"},
  alertKeywords:{color:C.text1,fontSize:14,fontWeight:"700",marginBottom:2},
  alertMeta:{color:C.text4,fontSize:12},
  deleteBtn:{padding:8},
  emptyCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:36,alignItems:"center"},
  emptyTitle:{color:C.text1,fontSize:16,fontWeight:"700",marginBottom:6},
  emptyBody:{color:C.text3,fontSize:13,textAlign:"center"},
  matchCard:{backgroundColor:C.surface,borderWidth:1.5,borderRadius:12,padding:14,marginBottom:8,flexDirection:"row",alignItems:"center"},
  matchTitle:{color:C.text1,fontSize:13,fontWeight:"700",marginBottom:2},
  matchMeta:{color:C.text4,fontSize:11},
});
