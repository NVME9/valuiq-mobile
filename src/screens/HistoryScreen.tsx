import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator, RefreshControl, Alert, Image,
} from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

interface ScanItem {
  id:string; item_name:string; verdict?:string; decision?:string;
  profit:number; roi:number; best_platform:string; category:string;
  sell_price:number; buy_price:number; brand:string; condition:string;
  image_url?:string; created_at:string;
}

const FILTERS = ["All","BUY","WATCH","PASS"];

export default function HistoryScreen({ token, plan, onNavigate, onBack }: Props) {
  const [scans, setScans]       = useState<ScanItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]     = useState("All");
  const [deleting, setDeleting] = useState<string|null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/scan-history?token=${token}&limit=50`);
      const d = await r.json();
      setScans(Array.isArray(d) ? d : d.scans || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, []);

  async function deleteScan(id: string) {
    Alert.alert("Delete Scan", "Remove this scan from your history?", [
      { text:"Cancel", style:"cancel" },
      { text:"Delete", style:"destructive", onPress: async () => {
        setDeleting(id);
        try {
          await fetch(`${API_BASE}/api/scan-history?token=${token}&id=${id}`, { method:"DELETE" });
          setScans(prev => prev.filter(s => s.id !== id));
        } catch {}
        setDeleting(null);
      }},
    ]);
  }

  function rescan(scan: ScanItem) {
    // Navigate to scanner with pre-filled item name
    onNavigate("scanner");
  }

  const filtered = scans.filter(s => {
    if (filter === "All") return true;
    const v = s.verdict || s.decision || "";
    return v.toUpperCase() === filter;
  });

  const verdictColor = (v?: string) => {
    const vv = (v||"").toUpperCase();
    return vv === "BUY" ? C.green : vv === "WATCH" ? C.yellow : C.red;
  };

  const totalProfit = scans
    .filter(s => (s.verdict||s.decision||"").toUpperCase() === "BUY")
    .reduce((sum,s) => sum + (s.profit||0), 0);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>📋 Scan History</Text>
        <View style={{width:36}}/>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statVal}>{scans.length}</Text>
          <Text style={s.statLbl}>Total Scans</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statVal,{color:C.green}]}>
            {scans.filter(s=>(s.verdict||s.decision||"").toUpperCase()==="BUY").length}
          </Text>
          <Text style={s.statLbl}>BUY Finds</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statVal,{color:C.green}]}>${Math.round(totalProfit)}</Text>
          <Text style={s.statLbl}>Total Profit</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[s.filterBtn, filter===f && s.filterActive]}>
            <Text style={[s.filterTxt, filter===f && s.filterActiveTxt]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green}
          onRefresh={() => { setRefreshing(true); load(); }}/>}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator color={C.green} size="large"/></View>
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={{fontSize:40,marginBottom:12}}>📷</Text>
            <Text style={s.emptyTitle}>{filter === "All" ? "No scans yet" : `No ${filter} results`}</Text>
            <Text style={s.emptySub}>
              {filter === "All"
                ? "Scans you run appear here with full details"
                : `You have no ${filter} results yet`}
            </Text>
            {filter === "All" && (
              <TouchableOpacity style={s.scanBtn} onPress={() => onNavigate("scanner")}>
                <Text style={s.scanBtnTxt}>Start Scanning →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filtered.map(scan => {
            const vc = verdictColor(scan.verdict||scan.decision);
            const verdict = (scan.verdict||scan.decision||"?").toUpperCase();
            const isDeleting = deleting === scan.id;

            return (
              <View key={scan.id} style={[s.card, {borderColor:vc+"20"}]}>
                <View style={s.cardTop}>
                  {/* Image thumbnail if available */}
                  {scan.image_url ? (
                    <Image source={{uri:scan.image_url}} style={s.thumb}/>
                  ) : (
                    <View style={[s.thumbPlaceholder,{backgroundColor:vc+"15"}]}>
                      <Text style={{fontSize:22}}>
                        {verdict==="BUY"?"💰":verdict==="WATCH"?"👀":"🚫"}
                      </Text>
                    </View>
                  )}

                  <View style={{flex:1}}>
                    <View style={s.cardTitleRow}>
                      <Text style={s.itemName} numberOfLines={2}>{scan.item_name}</Text>
                      <View style={[s.verdictBadge,{backgroundColor:vc+"20",borderColor:vc+"50"}]}>
                        <Text style={[s.verdictTxt,{color:vc}]}>{verdict}</Text>
                      </View>
                    </View>
                    <Text style={s.itemMeta}>
                      {scan.brand && scan.brand !== "Unknown" ? scan.brand+" · " : ""}
                      {scan.category} · {scan.condition}
                    </Text>
                    <Text style={s.itemDate}>
                      {new Date(scan.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                    </Text>
                  </View>
                </View>

                {/* Numbers */}
                <View style={s.numbers}>
                  <View style={s.numBox}>
                    <Text style={s.numLabel}>SELL</Text>
                    <Text style={s.numVal}>${Math.round(scan.sell_price||0)}</Text>
                  </View>
                  <View style={s.numDivider}/>
                  <View style={s.numBox}>
                    <Text style={s.numLabel}>PROFIT</Text>
                    <Text style={[s.numVal,{color:C.green}]}>+${Math.round(scan.profit||0)}</Text>
                  </View>
                  <View style={s.numDivider}/>
                  <View style={s.numBox}>
                    <Text style={s.numLabel}>ROI</Text>
                    <Text style={[s.numVal,{color:C.green}]}>{Math.round(scan.roi||0)}%</Text>
                  </View>
                  <View style={s.numDivider}/>
                  <View style={s.numBox}>
                    <Text style={s.numLabel}>PLATFORM</Text>
                    <Text style={s.numVal} numberOfLines={1}>
                      {(scan.best_platform||"eBay").split("|||")[0]}
                    </Text>
                  </View>
                </View>

                {/* Actions */}
                <View style={s.actions}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => rescan(scan)}>
                    <Text style={s.actionTxt}>🔄 Rescan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => onNavigate("deathpile")}>
                    <Text style={s.actionTxt}>💀 Rescue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.actionBtn, s.deleteBtn, isDeleting && {opacity:0.5}]}
                    onPress={() => deleteScan(scan.id)}
                    disabled={isDeleting}
                  >
                    {isDeleting
                      ? <ActivityIndicator color={C.red} size="small"/>
                      : <Text style={s.deleteTxt}>🗑️ Delete</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         {flex:1,backgroundColor:C.bg},
  nav:          {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:C.border},
  backBtn:      {width:36,height:36,justifyContent:"center"},
  backTxt:      {color:C.text3,fontSize:22},
  navTitle:     {color:C.text1,fontSize:16,fontWeight:"800" as any},
  statsRow:     {flexDirection:"row",borderBottomWidth:1,borderBottomColor:C.border},
  statCard:     {flex:1,padding:14,alignItems:"center",borderRightWidth:1,borderRightColor:C.border},
  statVal:      {color:C.text1,fontSize:20,fontWeight:"900" as any,letterSpacing:-0.5},
  statLbl:      {color:C.text4,fontSize:10,fontWeight:"700" as any,marginTop:2,textTransform:"uppercase" as any},
  filterRow:    {flexDirection:"row",padding:12,gap:6,borderBottomWidth:1,borderBottomColor:C.border},
  filterBtn:    {flex:1,paddingVertical:8,borderRadius:8,alignItems:"center",backgroundColor:C.surface,borderWidth:1,borderColor:C.border},
  filterActive: {backgroundColor:C.greenBg,borderColor:C.greenBorder},
  filterTxt:    {color:C.text4,fontSize:12,fontWeight:"600" as any},
  filterActiveTxt:{color:C.green,fontWeight:"800" as any},
  list:         {padding:14,paddingBottom:60,gap:10},
  center:       {alignItems:"center",paddingTop:60},
  empty:        {alignItems:"center",paddingTop:60},
  emptyTitle:   {color:C.text1,fontSize:18,fontWeight:"700" as any,marginBottom:6},
  emptySub:     {color:C.text3,fontSize:13,textAlign:"center" as any,lineHeight:19,marginBottom:20},
  scanBtn:      {backgroundColor:C.green,borderRadius:12,paddingVertical:12,paddingHorizontal:24},
  scanBtnTxt:   {color:C.greenDark,fontSize:14,fontWeight:"900" as any},
  card:         {backgroundColor:C.surface,borderWidth:1,borderRadius:14,padding:14},
  cardTop:      {flexDirection:"row",gap:12,marginBottom:12},
  thumb:        {width:60,height:60,borderRadius:10,backgroundColor:C.bg},
  thumbPlaceholder:{width:60,height:60,borderRadius:10,alignItems:"center",justifyContent:"center"},
  cardTitleRow: {flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:4},
  itemName:     {color:C.text1,fontSize:14,fontWeight:"700" as any,flex:1,lineHeight:19},
  verdictBadge: {borderWidth:1,borderRadius:100,paddingHorizontal:8,paddingVertical:3,flexShrink:0},
  verdictTxt:   {fontSize:10,fontWeight:"900" as any},
  itemMeta:     {color:C.text4,fontSize:11,marginBottom:2},
  itemDate:     {color:C.text4,fontSize:11},
  numbers:      {flexDirection:"row",backgroundColor:C.bg,borderRadius:10,padding:10,marginBottom:10},
  numBox:       {flex:1,alignItems:"center"},
  numDivider:   {width:1,backgroundColor:C.border},
  numLabel:     {color:C.text4,fontSize:8,fontWeight:"700" as any,textTransform:"uppercase" as any,marginBottom:3,letterSpacing:0.5},
  numVal:       {color:C.text1,fontSize:13,fontWeight:"800" as any},
  actions:      {flexDirection:"row",gap:6},
  actionBtn:    {flex:1,borderWidth:1,borderColor:C.border,borderRadius:9,paddingVertical:8,alignItems:"center"},
  actionTxt:    {color:C.text3,fontSize:12,fontWeight:"600" as any},
  deleteBtn:    {borderColor:C.red+"40"},
  deleteTxt:    {color:C.red,fontSize:12,fontWeight:"600" as any},
});
