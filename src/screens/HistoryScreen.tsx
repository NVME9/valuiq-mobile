import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Alert, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

type HistoryTab = "scans" | "thrift" | "battles";

const PLAN_LIMITS: Record<string, Record<string, number>> = {
  free:     { thrift: 3,   battles: 3   },
  seller:   { thrift: 10,  battles: 20  },
  pro:      { thrift: 999, battles: 999 },
  lifetime: { thrift: 999, battles: 999 },
  business: { thrift: 999, battles: 999 },
};

function verdictColor(v: string) {
  if (v === "BUY") return C.green;
  if (v === "WATCH") return C.yellow;
  return C.red;
}

export default function HistoryScreen({ token, plan, onNavigate, onBack }: Props) {
  const [tab, setTab]               = useState<HistoryTab>("scans");
  const [scans, setScans]           = useState<any[]>([]);
  const [thriftRuns, setThriftRuns] = useState<any[]>([]);
  const [battles, setBattles]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll]       = useState(false);
  const [expanded, setExpanded]     = useState<string|null>(null);

  const loadData = useCallback(async () => {
    try {
      const [scanRes, thriftRes, battleRes] = await Promise.all([
        fetch(`${API_BASE}/api/scan-history?token=${token}&limit=50`),
        fetch(`${API_BASE}/api/scan-history?token=${token}&limit=50`),
        fetch(`${API_BASE}/api/scan-history?token=${token}&limit=50`),
      ]);
      const [scanData, thriftData, battleData] = await Promise.all([
        scanRes.json(), thriftRes.json(), battleRes.json()
      ]);
      setScans(Array.isArray(scanData) ? scanData : scanData.items || []);
      setThriftRuns([]);
      setBattles([]);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { loadData(); }, []);

  async function deleteItem(id: string, type: string, name: string) {
    Alert.alert("Delete", `Remove "${name}" from history?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_BASE}/api/scan-history?token=${token}&id=${id}`, { method: "DELETE" });
            if (type === "scan") setScans(prev => prev.filter(s => s.id !== id));
            else if (type === "thrift") setThriftRuns(prev => prev.filter(s => s.id !== id));
            else if (type === "battle") setBattles(prev => prev.filter(s => s.id !== id));
          } catch {}
        }
      }
    ]);
  }

  const displayScans   = showAll ? scans   : scans.slice(0, 10);
  const displayThrift  = thriftRuns;
  const displayBattles = battles;

  // Stats
  const buyScans    = scans.filter(s => (s.verdict||s.decision||"").toUpperCase() === "BUY");
  const totalProfit = buyScans.reduce((sum, s) => sum + (s.profit || s.net_profit || 0), 0);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack || (() => onNavigate("dashboard"))}>
          <Text style={s.back}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>History</Text>
        <View style={{width:30}}/>
      </View>

      {/* Summary stats */}
      <View style={s.statsBar}>
        {[
          [scans.length, "Scans"],
          [buyScans.length, "BUY Finds"],
          [`$${Math.round(totalProfit)}`, "Profit"],
          [thriftRuns.length, "Runs"],
        ].map(([val, label]) => (
          <View key={label as string} style={s.statItem}>
            <Text style={[s.statVal, {color:C.green}]}>{val}</Text>
            <Text style={s.statLbl}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(["scans","thrift","battles"] as HistoryTab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab===t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab===t && s.tabActiveTxt]}>
              {t==="scans"?"📷 Scans":t==="thrift"?"🛍️ Thrift":"⚡ Battles"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.green} style={{marginTop:40}}/>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green}
            onRefresh={() => { setRefreshing(true); loadData(); }}/>}
        >

          {/* SCANS TAB */}
          {tab === "scans" && (
            <>
              {displayScans.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{fontSize:40,marginBottom:12}}>📷</Text>
                  <Text style={s.emptyTxt}>No scans yet</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => onNavigate("scanner")}>
                    <Text style={s.emptyBtnTxt}>Scan Your First Item →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                displayScans.map(scan => (
                  <TouchableOpacity
                    key={scan.id}
                    style={s.card}
                    onPress={() => setExpanded(expanded === scan.id ? null : scan.id)}
                    activeOpacity={0.85}
                  >
                    {/* Card header */}
                    <View style={s.cardHeader}>
                      {scan.image_url ? (
                        <Image source={{uri: scan.image_url}} style={s.thumb}/>
                      ) : (
                        <View style={[s.thumb, {backgroundColor:C.surface, alignItems:"center", justifyContent:"center"}]}>
                          <Text style={{fontSize:22}}>📷</Text>
                        </View>
                      )}
                      <View style={{flex:1}}>
                        <Text style={s.cardName} numberOfLines={1}>{scan.item_name || "Item"}</Text>
                        <Text style={s.cardMeta}>{new Date(scan.created_at).toLocaleDateString()}</Text>
                        {scan.best_platform && (
                          <Text style={s.cardPlatform} numberOfLines={1}>
                            {(scan.best_platform||"").split("|||")[0]}
                          </Text>
                        )}
                      </View>
                      <View style={s.cardRight}>
                        <View style={[s.verdict, {backgroundColor:verdictColor(scan.verdict||scan.decision||"PASS")+"20"}]}>
                          <Text style={[s.verdictTxt, {color:verdictColor(scan.verdict||scan.decision||"PASS")}]}>
                            {(scan.verdict||scan.decision||"PASS").toUpperCase()}
                          </Text>
                        </View>
                        {(scan.profit||scan.net_profit||0) > 0 && (
                          <Text style={s.profit}>+${Math.round(scan.profit||scan.net_profit||0)}</Text>
                        )}
                      </View>
                    </View>

                    {/* Expanded detail */}
                    {expanded === scan.id && (
                      <View style={s.expanded}>
                        <View style={s.expandedRow}>
                          {[
                            ["Max Pay", scan.buy_price ? "$" + (scan.buy_price) : "—", C.yellow],
                            ["Sell For", scan.sell_price ? "$" + (scan.sell_price) : "—", C.text1],
                            ["Profit", scan.profit||scan.net_profit ? "$" + (Math.round(scan.profit||scan.net_profit||0)) : "—", C.green],
                            ["ROI", scan.roi ? (Math.round(scan.roi)) + "%" : "—", C.green],
                          ].map(([label, val, color]) => (
                            <View key={label as string} style={s.expandedStat}>
                              <Text style={[s.expandedVal, {color: color as string}]}>{val}</Text>
                              <Text style={s.expandedLbl}>{label}</Text>
                            </View>
                          ))}
                        </View>
                        {/* Platform & reasoning */}
                        {scan.best_platform && (
                          <Text style={{color:C.text3,fontSize:12,marginBottom:8}}>
                            Best platform: <Text style={{color:C.text1,fontWeight:"700"}}>{(scan.best_platform||"").split("|||")[0]}</Text>
                          </Text>
                        )}
                        <View style={s.expandedActions}>
                          <TouchableOpacity
                            style={[s.actionBtn,{flex:1}]}
                            onPress={() => {
                              onNavigate("price-battle");
                            }}
                          >
                            <Text style={s.actionBtnTxt}>⚡ Price Battle</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn,{flex:1}]}
                            onPress={() => onNavigate("scanner")}
                          >
                            <Text style={s.actionBtnTxt}>🔄 Rescan</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, {backgroundColor:"#ff5a5a15", borderColor:"#ff5a5a30"}]}
                            onPress={() => deleteItem(scan.id, "scan", scan.item_name||"Item")}
                          >
                            <Text style={[s.actionBtnTxt, {color:C.red}]}>🗑</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}

              {/* Show more */}
              {scans.length > 10 && (
                <TouchableOpacity style={s.showMore} onPress={() => setShowAll(v => !v)}>
                  <Text style={s.showMoreTxt}>
                    {showAll ? "Show Less ↑" : `Show ${scans.length - 10} More →`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* THRIFT RUNS TAB */}
          {tab === "thrift" && (
            <>
              <View style={s.limitBanner}>
                <Text style={s.limitTxt}>
                  {plan === "free"
                    ? `Free plan: 3 Thrift Runs/month · ${thriftRuns.length} used`
                    : plan === "seller"
                    ? "Seller plan: 10 Thrift Runs/month" : "Unlimited Thrift Runs"}
                </Text>
              </View>
              {displayThrift.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{fontSize:40,marginBottom:12}}>🛍️</Text>
                  <Text style={s.emptyTxt}>No Thrift Runs yet</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => onNavigate("thrift-run")}>
                    <Text style={s.emptyBtnTxt}>Start a Thrift Run →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                displayThrift.map(run => {
                  const items = (() => { try { return JSON.parse(run.items||"[]"); } catch { return []; } })();
                  return (
                    <TouchableOpacity
                      key={run.id}
                      style={s.card}
                      onPress={() => setExpanded(expanded === run.id ? null : run.id)}
                      activeOpacity={0.85}
                    >
                      <View style={s.cardHeader}>
                        <View style={[s.thumb, {backgroundColor:"#0a1500", alignItems:"center", justifyContent:"center"}]}>
                          <Text style={{fontSize:26}}>🛍️</Text>
                        </View>
                        <View style={{flex:1}}>
                          <Text style={s.cardName}>{run.store_name || "Thrift Run"}</Text>
                          <Text style={s.cardMeta}>{new Date(run.created_at).toLocaleDateString()}</Text>
                          <Text style={s.cardPlatform}>{run.item_count || items.length} items scanned</Text>
                        </View>
                        <View style={s.cardRight}>
                          <Text style={[s.profit, {fontSize:16}]}>+${Math.round(run.total_profit||0)}</Text>
                          <Text style={{color:C.green, fontSize:11, fontWeight:"700"}}>{run.buy_count||0} BUY</Text>
                        </View>
                      </View>
                      {expanded === run.id && (
                        <View style={s.expanded}>
                          <Text style={[s.expandedLbl, {marginBottom:8}]}>Items scanned this run:</Text>
                          {items.slice(0,8).map((item: any, i: number) => (
                            <View key={i} style={s.runItem}>
                              {item.photo ? (
                                <Image source={{uri:`data:image/jpeg;base64,${item.photo}`}} style={s.runThumb}/>
                              ) : (
                                <View style={[s.runThumb, {backgroundColor:C.surface, alignItems:"center", justifyContent:"center"}]}>
                                  <Text style={{fontSize:14}}>📷</Text>
                                </View>
                              )}
                              <View style={{flex:1}}>
                                <Text style={{color:C.text1,fontSize:12,fontWeight:"600"}} numberOfLines={1}>{item.name||"Item"}</Text>
                                <Text style={{color:C.text4,fontSize:10}}>{item.platform?.split("|||")[0]||"—"}</Text>
                              </View>
                              <View style={[s.verdict, {backgroundColor:verdictColor(item.decision||"PASS")+"20"}]}>
                                <Text style={[s.verdictTxt, {color:verdictColor(item.decision||"PASS"), fontSize:8}]}>
                                  {(item.decision||"PASS")}
                                </Text>
                              </View>
                              <Text style={{color:C.green,fontSize:12,fontWeight:"700",marginLeft:6}}>
                                {item.profit > 0 ? "$" + (Math.round(item.profit)) : ""}
                              </Text>
                            </View>
                          ))}
                          {items.length > 8 && <Text style={{color:C.text4,fontSize:12,marginTop:4}}>+{items.length-8} more items</Text>}
                          <TouchableOpacity
                            style={[s.actionBtn, {marginTop:10, backgroundColor:"#ff5a5a15", borderColor:"#ff5a5a30"}]}
                            onPress={() => deleteItem(run.id, "thrift", run.store_name||"Thrift Run")}
                          >
                            <Text style={[s.actionBtnTxt, {color:C.red}]}>🗑 Delete Run</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {/* PRICE BATTLES TAB */}
          {tab === "battles" && (
            <>
              {displayBattles.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{fontSize:40,marginBottom:12}}>⚡</Text>
                  <Text style={s.emptyTxt}>No Price Battles yet</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => onNavigate("price-battle")}>
                    <Text style={s.emptyBtnTxt}>Start a Price Battle →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                displayBattles.map(battle => {
                  const results = (() => { try { return JSON.parse(battle.results||"[]"); } catch { return []; } })();
                  return (
                    <TouchableOpacity
                      key={battle.id}
                      style={s.card}
                      onPress={() => setExpanded(expanded === battle.id ? null : battle.id)}
                      activeOpacity={0.85}
                    >
                      <View style={s.cardHeader}>
                        {battle.image_url ? (
                          <Image source={{uri: battle.image_url}} style={s.thumb}/>
                        ) : (
                          <View style={[s.thumb, {backgroundColor:"#1a0f00", alignItems:"center", justifyContent:"center"}]}>
                            <Text style={{fontSize:26}}>⚡</Text>
                          </View>
                        )}
                        <View style={{flex:1}}>
                          <Text style={s.cardName} numberOfLines={1}>{battle.item_name || "Item"}</Text>
                          <Text style={s.cardMeta}>{new Date(battle.created_at).toLocaleDateString()}</Text>
                          {battle.top_platform && (
                            <Text style={s.cardPlatform}>Best: {battle.top_platform}</Text>
                          )}
                        </View>
                        <View style={s.cardRight}>
                          {battle.top_price && (
                            <Text style={[s.profit, {color:C.orange}]}>${battle.top_price}</Text>
                          )}
                          <Text style={{color:C.text4,fontSize:11}}>{results.length} platforms</Text>
                        </View>
                      </View>
                      {expanded === battle.id && (
                        <View style={s.expanded}>
                          {results.slice(0,6).map((r: any, i: number) => (
                            <View key={i} style={[s.runItem, {paddingVertical:6}]}>
                              <Text style={{flex:1, color:C.text1, fontSize:12, fontWeight:"600"}}>{r.platform}</Text>
                              <Text style={{color:C.green, fontSize:13, fontWeight:"800"}}>${r.price || r.netProfit || "—"}</Text>
                            </View>
                          ))}
                          <View style={s.expandedActions}>
                            <TouchableOpacity style={s.actionBtn} onPress={() => onNavigate("price-battle")}>
                              <Text style={s.actionBtnTxt}>⚡ New Battle</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.actionBtn, {backgroundColor:"#ff5a5a15", borderColor:"#ff5a5a30"}]}
                              onPress={() => deleteItem(battle.id, "battle", battle.item_name||"Battle")}
                            >
                              <Text style={[s.actionBtnTxt, {color:C.red}]}>🗑 Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex:1, backgroundColor:C.bg },
  header:        { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingTop:16, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.border },
  back:          { color:C.text3, fontSize:28 },
  headerTitle:   { color:C.text1, fontSize:17, fontWeight:"800" },
  statsBar:      { flexDirection:"row", backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border },
  statItem:      { flex:1, alignItems:"center", paddingVertical:10 },
  statVal:       { fontSize:17, fontWeight:"900", letterSpacing:-0.5 },
  statLbl:       { color:C.text4, fontSize:9, fontWeight:"700", textTransform:"uppercase", marginTop:2 },
  tabs:          { flexDirection:"row", borderBottomWidth:1, borderBottomColor:C.border },
  tabBtn:        { flex:1, paddingTop:16, paddingBottom:10, alignItems:"center" },
  tabActive:     { borderBottomWidth:2, borderBottomColor:C.green },
  tabTxt:        { color:C.text4, fontSize:11, fontWeight:"700" },
  tabActiveTxt:  { color:C.green },
  scroll:        { padding:14, paddingBottom:80 },
  limitBanner:   { backgroundColor:C.greenBg, borderRadius:10, padding:10, marginBottom:12, borderWidth:1, borderColor:C.greenBorder },
  limitTxt:      { color:C.green, fontSize:12, fontWeight:"600", textAlign:"center" },
  empty:         { alignItems:"center", paddingVertical:48 },
  emptyTxt:      { color:C.text3, fontSize:15, fontWeight:"600", marginBottom:16 },
  emptyBtn:      { backgroundColor:C.greenBg, borderRadius:12, paddingHorizontal:20, paddingTop:16, paddingBottom:10, borderWidth:1, borderColor:C.greenBorder },
  emptyBtnTxt:   { color:C.green, fontSize:14, fontWeight:"700" },
  card:          { backgroundColor:C.surface, borderRadius:14, marginBottom:10, borderWidth:1, borderColor:C.border, overflow:"hidden" },
  cardHeader:    { flexDirection:"row", alignItems:"center", padding:12, gap:10 },
  thumb:         { width:56, height:56, borderRadius:10, flexShrink:0 },
  cardName:      { color:C.text1, fontSize:14, fontWeight:"700", marginBottom:2 },
  cardMeta:      { color:C.text4, fontSize:11 },
  cardPlatform:  { color:C.text3, fontSize:11, marginTop:2 },
  cardRight:     { alignItems:"flex-end", gap:4 },
  verdict:       { borderRadius:8, paddingHorizontal:8, paddingVertical:4 },
  verdictTxt:    { fontSize:9, fontWeight:"900" },
  profit:        { color:C.green, fontSize:15, fontWeight:"800" },
  expanded:      { borderTopWidth:1, borderTopColor:C.border, padding:14 },
  expandedRow:   { flexDirection:"row", justifyContent:"space-around", marginBottom:14 },
  expandedStat:  { alignItems:"center" },
  expandedVal:   { fontSize:16, fontWeight:"800" },
  expandedLbl:   { color:C.text4, fontSize:10, marginTop:2 },
  expandedActions:{ flexDirection:"row", gap:8 },
  actionBtn:     { flex:1, backgroundColor:C.greenBg, borderRadius:10, padding:10, alignItems:"center", borderWidth:1, borderColor:C.greenBorder },
  actionBtnTxt:  { color:C.green, fontSize:12, fontWeight:"700" },
  runItem:       { flexDirection:"row", alignItems:"center", paddingTop:16, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.border, gap:8 },
  runThumb:      { width:36, height:36, borderRadius:6, flexShrink:0 },
  showMore:      { alignItems:"center", paddingTop: 16, paddingBottom: 10 },
  showMoreTxt:   { color:C.green, fontSize:13, fontWeight:"600" },
});
