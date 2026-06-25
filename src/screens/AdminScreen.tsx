import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, Alert, TextInput, Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token: string; plan: string; scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void; onBack?: () => void; onLogout: () => void;
}

const SUPER_ADMINS = [
  "NVisionsinc@gmail.com","nvisionsinc@gmail.com",
  "Natev9@comcast.net","natev9@comcast.net",
  "NathanRussell9@outlook.com","nathanrussell9@outlook.com",
];
const PLANS = ["free","seller","pro","titan","lifetime","vip","tester"];
const PLAN_COLORS: Record<string,string> = { free:C.text4, seller:C.green, pro:C.orange, lifetime:"#ff6b6b", titan:"#c084fc" };
type Tab = "metrics"|"users"|"refunds"|"access";

export default function AdminScreen({ token, onNavigate, onBack }: Props) {
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [adminEmail,    setAdminEmail]    = useState("");
  const [authorized,    setAuthorized]    = useState(false);
  const [stats,         setStats]         = useState<any>(null);
  const [tab,           setTab]           = useState<Tab>("metrics");
  const [metricFilter, setMetricFilter] = useState<string|null>(null);
  const [users,         setUsers]         = useState<any[]>([]);
  const [usersLoading,  setUsersLoading]  = useState(false);
  const [search,        setSearch]        = useState("");
  const [selectedUser,  setSelectedUser]  = useState<any>(null);
  const [planModal,     setPlanModal]     = useState(false);
  const [refundReason,  setRefundReason]  = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [grantEmail,    setGrantEmail]    = useState("");
  const [grantPlan,     setGrantPlan]     = useState("pro");
  const [grantLoading,  setGrantLoading]  = useState(false);
  const [expandedUser,  setExpandedUser]  = useState<string|null>(null);
  const [rawError,      setRawError]      = useState("");

  useEffect(() => { load(); }, []);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setRawError("");
    try {
      const r = await fetch(`${API_BASE}/api/admin?token=${token}`);
      const d = await r.json();
      if (d.authorized || d.email) {
        setAuthorized(true);
        setAdminEmail(d.email || "");
        setStats(d);
        if (d.users?.length > 0) {
          setUsers(d.users);
          computeLocalStats(d.users);
        } else {
          loadUsers();
        }
      } else {
        setAuthorized(false);
        setAdminEmail(d.email || "");
        setRawError(d.error || JSON.stringify(d).slice(0,200));
      }
    } catch (e: any) { setRawError(e.message || "Network error"); }
    setLoading(false); setRefreshing(false);
  }

  async function loadUsers(q = "") {
    setUsersLoading(true);
    setRawError("");
    try {
      // Strategy 1: Web API
      const url = q
        ? `${API_BASE}/api/admin?token=${token}&search=${encodeURIComponent(q)}`
        : `${API_BASE}/api/admin?token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.users && d.users.length > 0) {
        setUsers(d.users);
        if (d.totalUsers || d.mrr) setStats((p:any) => ({...p, ...d}));
        setUsersLoading(false);
        return;
      }
      // Strategy 2: Direct Supabase with user's JWT (bypasses RLS for service role)
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = require("../lib/api");
      const sr = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?select=id,email,plan,created_at,scans_count&order=created_at.desc&limit=500`,
        { headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json",
        }}
      );
      const profiles = await sr.json();
      if (Array.isArray(profiles) && profiles.length > 0) {
        setUsers(profiles);
        computeLocalStats(profiles);
        setUsersLoading(false);
        return;
      }
      // Strategy 3: Try auth.users via REST
      const ar = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?select=*&limit=500`,
        { headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + token,
        }}
      );
      const au = await ar.json();
      if (Array.isArray(au)) {
        setUsers(au);
        computeLocalStats(au);
      } else {
        setRawError("API response: " + JSON.stringify(d).slice(0,150) + " | Supabase: " + JSON.stringify(profiles).slice(0,150));
      }
    } catch (e:any) { setRawError(e.message || "Load failed"); }
    setUsersLoading(false);
  }

  function computeLocalStats(profiles: any[]) {
    const paid = profiles.filter(u => u.plan && u.plan !== "free" && u.plan !== null);
    const mrr = paid.reduce((sum:number, u:any) => {
      if (u.plan==="seller") return sum+14.99;
      if (u.plan==="pro") return sum+34.99;
      if (u.plan==="titan") return sum+79;
      return sum;
    }, 0);
    const breakdown: Record<string,number> = {};
    profiles.forEach((u:any) => { const p=u.plan||"free"; breakdown[p]=(breakdown[p]||0)+1; });
    setStats((prev:any) => ({
      ...prev,
      totalUsers: profiles.length,
      paidUsers: paid.length,
      freeUsers: profiles.length - paid.length,
      mrr,
      planBreakdown: Object.entries(breakdown).map(([plan,count])=>({plan,count})),
    }));
  }

  async function changePlan(userId: string, newPlan: string) {
    try {
      const r = await fetch(`${API_BASE}/api/admin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId, newPlan }),
      });
      const d = await r.json();
      if (d.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan: newPlan } : u));
        if (selectedUser?.id === userId) setSelectedUser((p: any) => ({ ...p, plan: newPlan }));
        Alert.alert("Done", "Plan changed to " + newPlan);
        setPlanModal(false);
      } else Alert.alert("Error", d.error || "Failed");
    } catch { Alert.alert("Error", "Network error"); }
  }

  async function deleteUser(u: any) {
    Alert.alert("Delete Account", `Permanently delete ${u.email}?\n\nThis cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          const r = await fetch(`${API_BASE}/api/admin?token=${token}`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, userId: u.id }),
          });
          const d = await r.json();
          if (d.success) { setUsers(prev => prev.filter(x => x.id !== u.id)); Alert.alert("Deleted"); }
          else Alert.alert("Error", d.error || "Failed");
        } catch { Alert.alert("Error", "Network error"); }
      }},
    ]);
  }

  async function issueRefund(prorated: boolean) {
    if (!selectedUser) return;
    setRefundLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/refund`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId: selectedUser.id, reason: refundReason, prorated }),
      });
      const d = await r.json();
      if (d.success) { Alert.alert("Refund Issued", d.message || "Done"); setRefundReason(""); }
      else Alert.alert("Error", d.error || "Refund failed");
    } catch { Alert.alert("Error", "Network error"); }
    setRefundLoading(false);
  }

  async function grantAccess() {
    if (!grantEmail.trim()) { Alert.alert("Error", "Enter an email"); return; }
    setGrantLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/grant-access`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: grantEmail.trim(), plan: grantPlan }),
      });
      const d = await r.json();
      if (d.success) { Alert.alert("Done", `${grantPlan} access granted to ${grantEmail}`); setGrantEmail(""); }
      else Alert.alert("Error", d.error || "Failed");
    } catch { Alert.alert("Error", "Network error"); }
    setGrantLoading(false);
  }

  if (loading) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}><ActivityIndicator color={C.green} size="large"/>
        <Text style={{color:C.text3,marginTop:12,fontSize:13}}>Loading admin...</Text>
      </View>
    </SafeAreaView>
  );

  if (!authorized) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{fontSize:48,marginBottom:16}}>o</Text>
        <Text style={s.h2}>Access Denied</Text>
        <Text style={[s.body,{textAlign:"center",marginBottom:8}]}>Admin access required.</Text>
        <Text style={[s.body,{color:C.text4,fontSize:11,marginBottom:8}]}>Email: {adminEmail||"not loaded"}</Text>
        {rawError ? <View style={{backgroundColor:"#1a0505",borderRadius:8,padding:10,marginBottom:12,maxWidth:"90%"}}>
          <Text style={{color:C.red,fontSize:10}}>{rawError}</Text>
        </View> : null}
        <TouchableOpacity style={s.btn} onPress={onBack||(() => onNavigate("dashboard"))}>
          <Text style={s.btnTxt}> Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const metrics = stats ? [
    { key:"total", label:"Total Users",  value: stats.totalUsers||0,      color:C.text1  },
    { key:"mrr",   label:"MRR",          value:"$"+(stats.mrr||0).toFixed(0), color:C.green },
    { key:"paid",  label:"Paid Users",   value: stats.paidUsers||0,       color:C.green  },
    { key:"free",  label:"Free Users",   value: stats.freeUsers||0,       color:C.text3  },
    { key:"today", label:"Scans Today",  value: stats.scansToday||0,      color:C.orange },
    { key:"month", label:"Scans/Month",  value: stats.scansMonth||0,      color:C.yellow },
  ] : [];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack||(() => onNavigate("dashboard"))} style={s.backBtn}>
          <Text style={s.backTxt}></Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Admin Panel</Text>
        <TouchableOpacity onPress={() => load(true)} style={s.refreshBtn}>
          <Text style={s.refreshTxt}>o</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {(["metrics","users","refunds","access"] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn,tab===t&&s.tabActive]} onPress={()=>setTab(t)}>
            <Text style={s.tabIcon}>{t==="metrics"?"":t==="users"?"":t==="refunds"?"":""}</Text>
            <Text style={[s.tabLbl,tab===t&&s.tabLblOn]}>
              {t==="metrics"?"Metrics":t==="users"?"Users":t==="refunds"?"Refunds":"Access"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:60}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={C.green}/>}>

        {/* METRICS */}
        {tab==="metrics" && (
          <>
            {stats?.mrr > 0 && (
              <View style={s.mrrHero}>
                <Text style={s.mrrLabel}>MONTHLY RECURRING REVENUE</Text>
                <Text style={s.mrrVal}>${(stats.mrr||0).toFixed(2)}</Text>
                <Text style={s.mrrSub}>ARR: ${((stats.mrr||0)*12).toFixed(0)}</Text>
              </View>
            )}
            <Text style={s.sLbl}>KEY METRICS</Text>
            <View style={s.grid}>
              {metrics.map(m => (
                <TouchableOpacity key={m.key} style={s.mCard} activeOpacity={0.8} onPress={()=>{ if(m.key==="today"||m.key==="month"){setMetricFilter(null);} else {setMetricFilter(m.key); setTab("users"); setSearch("");} }}>
                  <Text style={[s.mVal,{color:m.color}]}>{m.value}</Text>
                  <Text style={s.mLbl}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(stats?.planBreakdown||[]).length>0&&(
              <>
                <Text style={[s.sLbl,{marginTop:20}]}>PLAN BREAKDOWN</Text>
                {(stats.planBreakdown||[]).map((p:any)=>(
                  <View key={p.plan} style={s.row}>
                    <View style={[s.planDot,{backgroundColor:PLAN_COLORS[p.plan]||C.text4}]}/>
                    <Text style={{color:C.text1,fontWeight:"700",textTransform:"capitalize",flex:1}}>{p.plan}</Text>
                    <Text style={{color:PLAN_COLORS[p.plan]||C.green,fontWeight:"700"}}>{p.count} users</Text>
                    {(p.revenue||0)>0&&<Text style={{color:C.text4,fontSize:11,marginLeft:8}}>${(p.revenue||0).toFixed(0)}/mo</Text>}
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* USERS */}
        {tab==="users" && (
          <>
            <Text style={s.sLbl}>{metricFilter==="paid"?"PAID USERS":metricFilter==="free"?"FREE USERS":metricFilter==="mrr"?"REVENUE USERS":"ALL USERS"} ({(metricFilter==="paid"?users.filter(u=>["seller","pro","lifetime","titan","business"].includes(u.plan)):metricFilter==="free"?users.filter(u=>!["seller","pro","lifetime","titan","business"].includes(u.plan)):users).length})</Text>{metricFilter&&(<View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:10}}>{(stats?.planBreakdown||[]).map((pb:any)=>(<Text key={pb.plan} style={{color:PLAN_COLORS[pb.plan]||C.text3,fontSize:12,fontWeight:"700"}}>{pb.plan}: {pb.count}{pb.revenue?" ($"+pb.revenue+"/mo)":""}</Text>))}<TouchableOpacity onPress={()=>setMetricFilter(null)}><Text style={{color:C.text4,fontSize:12}}>Clear filter</Text></TouchableOpacity></View>)}
            <View style={s.searchRow}>
              <TextInput style={s.searchInput} placeholder="Search email or plan..."
                placeholderTextColor={C.text4} value={search} onChangeText={setSearch}
                autoCapitalize="none" returnKeyType="search"
                onSubmitEditing={()=>loadUsers(search)}/>
              <TouchableOpacity style={s.searchBtn} onPress={()=>loadUsers(search)}>
                <Text style={{color:C.greenDark,fontWeight:"900",fontSize:13}}>Search</Text>
              </TouchableOpacity>
            </View>
            {search.length>0&&(
              <TouchableOpacity onPress={()=>{setSearch("");loadUsers("");}} style={{marginBottom:10}}>
                <Text style={{color:C.text4,fontSize:12}}>Clear  Show all</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.btn,{marginBottom:12}]} onPress={()=>loadUsers(search)}>
              <Text style={s.btnTxt}>Refresh Users</Text>
            </TouchableOpacity>
            {usersLoading&&<ActivityIndicator color={C.green} style={{margin:20}}/>}
            {!usersLoading&&users.length===0&&(
              <Text style={[s.body,{textAlign:"center",marginTop:30}]}>No users found - tap Refresh Users</Text>
            )}
            {(metricFilter==="paid"?users.filter(u=>["seller","pro","lifetime","titan","business"].includes(u.plan)):metricFilter==="free"?users.filter(u=>!["seller","pro","lifetime","titan","business"].includes(u.plan)):users).map(u=>(
              <TouchableOpacity key={u.id} style={s.userCard}
                onPress={()=>setExpandedUser(expandedUser===u.id?null:u.id)} activeOpacity={0.85}>
                <View style={{flexDirection:"row",alignItems:"center"}}>
                  <View style={{flex:1,marginRight:8}}>
                    <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
                    <View style={{flexDirection:"row",gap:6,marginTop:4,alignItems:"center"}}>
                      <View style={[s.planBadge,{
                        backgroundColor:(PLAN_COLORS[u.plan||"free"]||C.text4)+"15",
                        borderColor:(PLAN_COLORS[u.plan||"free"]||C.text4)+"50",
                      }]}>
                        <Text style={{color:PLAN_COLORS[u.plan||"free"]||C.text4,fontSize:10,fontWeight:"800"}}>
                          {(u.plan||"free").toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{color:C.text4,fontSize:10}}>
                        {new Date(u.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={{color:C.text4,fontSize:16}}>{expandedUser===u.id?"":""}</Text>
                </View>
                {expandedUser===u.id&&(
                  <View style={{marginTop:12,gap:8}}>
                    <View style={{flexDirection:"row",gap:8,flexWrap:"wrap"}}>
                      <TouchableOpacity style={[s.actBtn,{backgroundColor:C.green+"15",borderColor:C.green+"40"}]}
                        onPress={()=>{setSelectedUser(u);setPlanModal(true);}}>
                        <Text style={{color:C.green,fontWeight:"800",fontSize:12}}>Change Plan</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actBtn,{backgroundColor:"#ff1a1a10",borderColor:"#ff5a5a40"}]}
                        onPress={()=>{setSelectedUser(u);setTab("refunds");}}>
                        <Text style={{color:C.red,fontWeight:"800",fontSize:12}}>Refund</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actBtn,{backgroundColor:"#ff1a1a10",borderColor:"#ff5a5a40"}]}
                        onPress={()=>deleteUser(u)}>
                        <Text style={{color:C.red,fontWeight:"700",fontSize:12}}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* REFUNDS */}
        {tab==="refunds" && (
          <>
            <Text style={s.sLbl}>ISSUE REFUND</Text>
            {selectedUser ? (
              <View style={[s.userCard,{marginBottom:16}]}>
                <Text style={s.userEmail}>{selectedUser.email}</Text>
                <Text style={{color:PLAN_COLORS[selectedUser.plan]||C.text4,fontSize:12,marginTop:4}}>
                  {(selectedUser.plan||"free").toUpperCase()}
                </Text>
              </View>
            ) : (
              <Text style={[s.body,{marginBottom:16}]}>Select a user from the Users tab first</Text>
            )}
            <Text style={[s.sLbl,{marginBottom:8}]}>REFUND REASON</Text>
            <TextInput style={[s.input,{minHeight:80,textAlignVertical:"top",marginBottom:12}]}
              value={refundReason} onChangeText={setRefundReason}
              placeholder="Reason for refund..." placeholderTextColor={C.text4} multiline/>
            <View style={{flexDirection:"row",gap:10}}>
              <TouchableOpacity style={[s.btn,{flex:1}]} disabled={refundLoading||!selectedUser}
                onPress={()=>issueRefund(false)}>
                {refundLoading?<ActivityIndicator color={C.greenDark}/>:
                  <Text style={s.btnTxt}>Full Refund</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn,{flex:1,backgroundColor:C.surface}]} disabled={refundLoading||!selectedUser}
                onPress={()=>issueRefund(true)}>
                {refundLoading?<ActivityIndicator color={C.green}/>:
                  <Text style={[s.btnTxt,{color:C.green}]}>Prorated</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ACCESS */}
        {tab==="access" && (
          <>
            <Text style={s.sLbl}>GRANT ACCESS</Text>
            <Text style={[s.body,{marginBottom:16}]}>Give a user free access to any plan - for influencers, testers, or VIPs.</Text>
            <View><Text style={s.label}>Email Address</Text>
              <TextInput style={s.input} value={grantEmail} onChangeText={setGrantEmail}
                placeholder="user@example.com" placeholderTextColor={C.text4}
                autoCapitalize="none" keyboardType="email-address"/>
            </View>
            <View style={{marginVertical:12}}>
              <Text style={s.label}>Plan to Grant</Text>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:6}}>
                {PLANS.filter(p=>p!=="free").map(p=>(
                  <TouchableOpacity key={p} style={[s.planChip,grantPlan===p&&{backgroundColor:PLAN_COLORS[p]+"20",borderColor:PLAN_COLORS[p]+"60"}]}
                    onPress={()=>setGrantPlan(p)}>
                    <Text style={{color:grantPlan===p?(PLAN_COLORS[p]||C.green):C.text3,fontWeight:"700",textTransform:"capitalize"}}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.btn} onPress={grantAccess} disabled={grantLoading||!grantEmail.trim()}>
              {grantLoading?<ActivityIndicator color={C.greenDark}/>:
                <Text style={s.btnTxt}>Grant {grantPlan} Access</Text>}
            </TouchableOpacity>

            <Text style={[s.sLbl,{marginTop:28}]}>SUPER ADMINS</Text>
            {SUPER_ADMINS.filter((_,i)=>i%2===0).map(e=>(
              <View key={e} style={s.row}>
                <Text style={{color:C.text3,fontSize:12}}> {e}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Plan Modal */}
      <Modal visible={planModal} transparent animationType="slide" onRequestClose={()=>setPlanModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Change Plan</Text>
            <Text style={{color:C.text3,fontSize:13,marginBottom:16}}>{selectedUser?.email}</Text>
            {PLANS.map(p=>(
              <TouchableOpacity key={p} style={[s.planOption,selectedUser?.plan===p&&{borderColor:PLAN_COLORS[p]||C.green,backgroundColor:(PLAN_COLORS[p]||C.green)+"15"}]}
                onPress={()=>changePlan(selectedUser?.id,p)}>
                <Text style={{color:selectedUser?.plan===p?(PLAN_COLORS[p]||C.green):C.text2,fontWeight:"700",textTransform:"capitalize"}}>{p}</Text>
                {selectedUser?.plan===p&&<Text style={{color:PLAN_COLORS[p]||C.green,fontSize:11}}>Current</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.actBtn,{marginTop:12,padding:14,alignItems:"center"}]} onPress={()=>setPlanModal(false)}>
              <Text style={{color:C.text3,fontWeight:"700"}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex:1, backgroundColor:C.bg },
  center:        { flex:1, alignItems:"center", justifyContent:"center" },
  header:        { flexDirection:"row", alignItems:"center", paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:       { width:36, height:36, alignItems:"center", justifyContent:"center" },
  backTxt:       { color:C.text1, fontSize:28, lineHeight:32 },
  headerTitle:   { flex:1, textAlign:"center", color:C.text1, fontSize:16, fontWeight:"800" },
  refreshBtn:    { width:36, height:36, alignItems:"center", justifyContent:"center" },
  refreshTxt:    { color:C.green, fontSize:22 },
  tabs:          { flexDirection:"row", borderBottomWidth:1, borderBottomColor:C.border },
  tabBtn:        { flex:1, alignItems:"center", paddingVertical:10, gap:2 },
  tabActive:     { borderBottomWidth:2, borderBottomColor:C.green },
  tabIcon:       { fontSize:16 },
  tabLbl:        { color:C.text4, fontSize:9, fontWeight:"700" },
  tabLblOn:      { color:C.green },
  sLbl:          { color:C.text4, fontSize:10, fontWeight:"800", letterSpacing:1.5, textTransform:"uppercase", marginBottom:10 },
  mrrHero:       { backgroundColor:"#050d00", borderWidth:1.5, borderColor:C.green+"40", borderRadius:16, padding:18, alignItems:"center", marginBottom:16 },
  mrrLabel:      { color:C.text4, fontSize:9, fontWeight:"800", letterSpacing:1, marginBottom:6 },
  mrrVal:        { color:C.green, fontSize:42, fontWeight:"900", letterSpacing:-2 },
  mrrSub:        { color:C.text3, fontSize:12, marginTop:4 },
  grid:          { flexDirection:"row", flexWrap:"wrap", gap:10, marginBottom:16 },
  mCard:         { width:"30.5%", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:12, alignItems:"center" },
  mVal:          { fontSize:22, fontWeight:"900" },
  mLbl:          { color:C.text4, fontSize:9, fontWeight:"700", textAlign:"center", marginTop:2 },
  row:           { flexDirection:"row", alignItems:"center", gap:10, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:10, padding:12, marginBottom:6 },
  planDot:       { width:8, height:8, borderRadius:4 },
  searchRow:     { flexDirection:"row", alignItems:"center", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, marginBottom:8, overflow:"hidden" },
  searchInput:   { flex:1, padding:12, color:C.text1, fontSize:14 },
  searchBtn:     { backgroundColor:C.green, paddingHorizontal:14, paddingVertical:12 },
  userCard:      { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:13, padding:14, marginBottom:8 },
  userEmail:     { color:C.text1, fontSize:13, fontWeight:"700" },
  planBadge:     { borderWidth:1, borderRadius:100, paddingHorizontal:8, paddingVertical:3 },
  actBtn:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:12, paddingVertical:8 },
  btn:           { backgroundColor:C.green, borderRadius:12, paddingVertical:14, alignItems:"center" },
  btnTxt:        { color:C.greenDark, fontWeight:"900", fontSize:14 },
  h2:            { color:C.text1, fontSize:22, fontWeight:"900", marginBottom:8 },
  body:          { color:C.text2, fontSize:14, lineHeight:21 },
  label:         { color:C.text3, fontSize:13, fontWeight:"700", marginBottom:6 },
  input:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, color:C.text1, fontSize:14, marginBottom:12 },
  planChip:      { borderWidth:1, borderColor:C.border, borderRadius:100, paddingHorizontal:14, paddingVertical:8 },
  modalOverlay:  { flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"flex-end" },
  modalBox:      { backgroundColor:C.bg, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingBottom:40, borderTopWidth:1, borderColor:C.border },
  modalTitle:    { color:C.text1, fontSize:18, fontWeight:"900", marginBottom:6 },
  planOption:    { borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, marginBottom:8, flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
});







