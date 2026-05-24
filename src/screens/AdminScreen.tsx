import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, ActivityIndicator, Alert, TextInput,
} from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

const ADMIN_EMAIL = "Natev9@comcast.net";

export default function AdminScreen({ token, plan, onNavigate, onBack }: Props) {
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<"dashboard"|"users"|"deals"|"emails">("dashboard");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody]   = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    try {
      const r = await fetch(`${API_BASE}/api/admin?token=${token}`);
      const d = await r.json();
      if (d.authorized) setStats(d);
      else Alert.alert("Access Denied", "Admin access required.");
    } catch {}
    setLoading(false);
  }

  async function sendPushToAll() {
    Alert.alert("Send Push Notification", "Send a deal alert to all Pro users?", [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: async () => {
        setSending(true);
        try {
          await fetch(`${API_BASE}/api/push/send?secret=valuiq-cron-2024`);
          Alert.alert("✅ Sent", "Push notification sent to Pro users.");
        } catch { Alert.alert("Error", "Failed to send."); }
        setSending(false);
      }},
    ]);
  }

  async function triggerDealHunter() {
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/api/deal-hunter?refresh=true&token=${token}`);
      const d = await r.json();
      Alert.alert("✅ Deal Hunter", `Found ${d.total || 0} deals from ${Object.keys(d.breakdown||{}).length} sources.`);
    } catch { Alert.alert("Error", "Failed to run Deal Hunter."); }
    setSending(false);
  }

  async function sendWeeklyDigest() {
    setSending(true);
    try {
      await fetch(`${API_BASE}/api/email-sequences?action=weekly`);
      Alert.alert("✅ Sent", "Weekly digest triggered for all subscribers.");
    } catch { Alert.alert("Error", "Failed to send."); }
    setSending(false);
  }

  async function changePlan(user: any) {
    Alert.alert(
      `Change Plan: ${user.email}`,
      `Current plan: ${user.plan || "free"}`,
      [
        { text: "❌ Cancel", style: "cancel" },
        { text: "🆓 Free", onPress: () => applyPlanChange(user, "free") },
        { text: "💪 Seller", onPress: () => applyPlanChange(user, "seller") },
        { text: "🔥 Pro", onPress: () => applyPlanChange(user, "pro") },
        { text: "♾️ Lifetime", onPress: () => applyPlanChange(user, "lifetime") },
      ]
    );
  }

  async function applyPlanChange(user: any, newPlan: string) {
    if (!user.id) {
      Alert.alert("Error", "No user ID — cannot change plan.");
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, userId: user.id, newPlan }),
      });
      const d = await r.json();
      if (d.success) {
        Alert.alert("✅ Done", `${user.email} → ${newPlan}`);
        loadStats(); // refresh
      } else {
        Alert.alert("Error", d.error || "Failed to change plan.");
      }
    } catch {
      Alert.alert("Error", "Network error.");
    }
    setSending(false);
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color={C.green} size="large"/>
          <Text style={{color:C.text3,marginTop:12}}>Loading admin panel...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
            <Text style={s.backTxt}>←</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>Admin</Text>
          <View style={{width:36}}/>
        </View>
        <View style={s.center}>
          <Text style={{fontSize:40,marginBottom:12}}>🔒</Text>
          <Text style={{color:C.text1,fontSize:18,fontWeight:"800" as any}}>Access Denied</Text>
          <Text style={{color:C.text3,fontSize:13,marginTop:8}}>Admin access only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>⚙️ Admin Panel</Text>
        <View style={{width:36}}/>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.tabScroll} contentContainerStyle={{paddingHorizontal:16,gap:8}}>
        {(["dashboard","users","deals","emails"] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[s.tabBtn, tab===t && s.tabActive]}>
            <Text style={[s.tabTxt, tab===t && s.tabActiveTxt]}>
              {t==="dashboard"?"📊 Stats":t==="users"?"👥 Users":t==="deals"?"🤖 Deals":"📧 Emails"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll}>

        {/* DASHBOARD TAB */}
        {tab === "dashboard" && (
          <>
            <Text style={s.sectionTitle}>Key Metrics</Text>
            <View style={s.grid}>
              {[
                ["Total Users", stats.totalUsers||0, C.text1],
                ["Paid Users", stats.paidUsers||0, C.green],
                ["MRR", `$${stats.mrr||0}`, C.green],
                ["Scans Today", stats.scansToday||0, C.orange],
                ["Scans This Month", stats.scansMonth||0, C.orange],
                ["Free Users", stats.freeUsers||0, C.text3],
              ].map(([label,val,color]) => (
                <View key={label as string} style={s.metricCard}>
                  <Text style={[s.metricVal,{color:color as string}]}>{val as string|number}</Text>
                  <Text style={s.metricLabel}>{label as string}</Text>
                </View>
              ))}
            </View>

            <Text style={s.sectionTitle}>Plan Breakdown</Text>
            {(stats.planBreakdown||[]).map((p:any) => (
              <View key={p.plan} style={s.planRow}>
                <Text style={s.planName}>{p.plan}</Text>
                <Text style={s.planCount}>{p.count} users</Text>
                <Text style={[s.planRevenue,{color:C.green}]}>${p.revenue}/mo</Text>
              </View>
            ))}

            <Text style={s.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity style={s.actionCard} onPress={triggerDealHunter} disabled={sending}>
              <Text style={s.actionIcon}>🤖</Text>
              <View style={{flex:1}}>
                <Text style={s.actionTitle}>Run Deal Hunter</Text>
                <Text style={s.actionSub}>Refresh all 17 sources now</Text>
              </View>
              {sending ? <ActivityIndicator color={C.green} size="small"/> : <Text style={{color:C.green}}>▶</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.actionCard} onPress={sendPushToAll} disabled={sending}>
              <Text style={s.actionIcon}>🔔</Text>
              <View style={{flex:1}}>
                <Text style={s.actionTitle}>Send Deal Alert</Text>
                <Text style={s.actionSub}>Push top deal to Pro users</Text>
              </View>
              <Text style={{color:C.orange}}>▶</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionCard} onPress={sendWeeklyDigest} disabled={sending}>
              <Text style={s.actionIcon}>📧</Text>
              <View style={{flex:1}}>
                <Text style={s.actionTitle}>Send Weekly Digest</Text>
                <Text style={s.actionSub}>Email top wins to all subscribers</Text>
              </View>
              <Text style={{color:C.yellow}}>▶</Text>
            </TouchableOpacity>
          </>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <>
            <Text style={s.sectionTitle}>Recent Signups</Text>
            <Text style={s.sectionSub}>Tap a plan badge to change tier</Text>
            {(stats.recentUsers||[]).map((u:any, i:number) => (
              <View key={i} style={s.userRow}>
                <View style={s.userAvatar}>
                  <Text style={s.userAvatarTxt}>{(u.email||"?")[0].toUpperCase()}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
                  <Text style={s.userMeta}>
                    {u.plan} · joined {new Date(u.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.planBadge,{
                    backgroundColor: u.plan==="pro"||u.plan==="lifetime"?C.orange+"20":
                      u.plan==="seller"?C.green+"20":C.border
                  }]}
                  onPress={() => changePlan(u)}
                >
                  <Text style={{
                    color:u.plan==="pro"||u.plan==="lifetime"?C.orange:
                      u.plan==="seller"?C.green:C.text4,
                    fontSize:10,fontWeight:"800" as any
                  }}>{(u.plan||"free").toUpperCase()} ✏️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* DEALS TAB */}
        {tab === "deals" && (
          <>
            <Text style={s.sectionTitle}>Recent Deal Hunter Finds</Text>
            <Text style={s.sectionSub}>Last 24 hours · score 70+</Text>
            {(stats.recentDeals||[]).map((d:any, i:number) => (
              <View key={i} style={s.dealCard}>
                <View style={s.dealHeader}>
                  <Text style={[s.dealScore,{color:d.score>=85?C.green:C.yellow}]}>{d.score}</Text>
                  <Text style={s.dealTitle} numberOfLines={2}>{d.title}</Text>
                </View>
                <View style={s.dealNums}>
                  <Text style={s.dealNum}>Buy ${Math.round(d.buy_price||0)}</Text>
                  <Text style={{color:C.text4}}>→</Text>
                  <Text style={[s.dealNum,{color:C.green}]}>+${Math.round(d.profit||0)}</Text>
                  <Text style={s.dealNum}>{d.roi||0}% ROI</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* EMAILS TAB */}
        {tab === "emails" && (
          <>
            <Text style={s.sectionTitle}>Email Stats</Text>
            {[
              ["Welcome emails sent", stats.emailStats?.welcome||0],
              ["Weekly digests sent", stats.emailStats?.weekly||0],
              ["Scan limit emails", stats.emailStats?.scanLimit||0],
            ].map(([label,val]) => (
              <View key={label as string} style={s.emailStatRow}>
                <Text style={s.emailStatLabel}>{label as string}</Text>
                <Text style={s.emailStatVal}>{val as number}</Text>
              </View>
            ))}

            <Text style={[s.sectionTitle,{marginTop:16}]}>Send Manual Email</Text>
            <TextInput style={s.emailInput} value={emailSubject}
              onChangeText={setEmailSubject} placeholder="Subject"
              placeholderTextColor={C.text4}/>
            <TextInput style={[s.emailInput,{height:100,textAlignVertical:"top" as any}]}
              value={emailBody} onChangeText={setEmailBody}
              placeholder="Message body..." placeholderTextColor={C.text4} multiline/>
            <TouchableOpacity style={s.sendBtn} disabled={!emailSubject||!emailBody||sending}>
              <Text style={s.sendBtnTxt}>Send to All Subscribers →</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          {flex:1,backgroundColor:C.bg},
  nav:           {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border},
  backBtn:       {width:36,height:36,justifyContent:"center"},
  backTxt:       {color:C.text3,fontSize:22},
  navTitle:      {color:C.text1,fontSize:16,fontWeight:"800" as any},
  center:        {flex:1,alignItems:"center",justifyContent:"center"},
  tabScroll:     {maxHeight:48,borderBottomWidth:1,borderBottomColor:C.border},
  tabBtn:        {paddingHorizontal:16,paddingVertical:12,borderBottomWidth:2,borderBottomColor:"transparent"},
  tabActive:     {borderBottomColor:C.green},
  tabTxt:        {color:C.text4,fontSize:13,fontWeight:"600" as any},
  tabActiveTxt:  {color:C.green,fontWeight:"800" as any},
  scroll:        {padding:16,paddingBottom:60},
  sectionTitle:  {color:C.text1,fontSize:14,fontWeight:"800" as any,marginBottom:4,marginTop:8},
  sectionSub:    {color:C.text4,fontSize:11,marginBottom:10},
  grid:          {flexDirection:"row",flexWrap:"wrap" as any,gap:8,marginBottom:16},
  metricCard:    {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,width:"47.5%",alignItems:"center"},
  metricVal:     {fontSize:24,fontWeight:"900" as any,letterSpacing:-0.5},
  metricLabel:   {color:C.text4,fontSize:10,fontWeight:"700" as any,textTransform:"uppercase" as any,marginTop:4,textAlign:"center" as any},
  planRow:       {flexDirection:"row",alignItems:"center",backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:10,padding:12,marginBottom:6},
  planName:      {color:C.text1,fontSize:13,fontWeight:"700" as any,flex:1,textTransform:"capitalize" as any},
  planCount:     {color:C.text3,fontSize:12,marginRight:12},
  planRevenue:   {fontSize:13,fontWeight:"800" as any},
  actionCard:    {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:13,padding:14,marginBottom:8,flexDirection:"row",alignItems:"center",gap:12},
  actionIcon:    {fontSize:24},
  actionTitle:   {color:C.text1,fontSize:14,fontWeight:"700" as any},
  actionSub:     {color:C.text4,fontSize:12,marginTop:2},
  userRow:       {flexDirection:"row",alignItems:"center",backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:11,padding:12,marginBottom:6,gap:10},
  userAvatar:    {width:36,height:36,backgroundColor:C.green+"30",borderRadius:18,alignItems:"center",justifyContent:"center"},
  userAvatarTxt: {color:C.green,fontSize:16,fontWeight:"900" as any},
  userEmail:     {color:C.text1,fontSize:13,fontWeight:"600" as any},
  userMeta:      {color:C.text4,fontSize:11,marginTop:2},
  planBadge:     {borderRadius:100,paddingHorizontal:8,paddingVertical:4},
  dealCard:      {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:11,padding:12,marginBottom:6},
  dealHeader:    {flexDirection:"row",alignItems:"flex-start",gap:10,marginBottom:8},
  dealScore:     {fontSize:22,fontWeight:"900" as any,width:40},
  dealTitle:     {color:C.text1,fontSize:13,fontWeight:"600" as any,flex:1,lineHeight:18},
  dealNums:      {flexDirection:"row",gap:12,alignItems:"center"},
  dealNum:       {color:C.text3,fontSize:12},
  emailStatRow:  {flexDirection:"row",justifyContent:"space-between",backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:10,padding:12,marginBottom:6},
  emailStatLabel:{color:C.text2,fontSize:13},
  emailStatVal:  {color:C.text1,fontSize:14,fontWeight:"800" as any},
  emailInput:    {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:13,color:C.text1,fontSize:14,marginBottom:8},
  sendBtn:       {backgroundColor:C.green,borderRadius:12,padding:15,alignItems:"center"},
  sendBtnTxt:    {color:C.greenDark,fontSize:14,fontWeight:"900" as any},
});
