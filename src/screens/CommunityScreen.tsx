import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE, getCommunityWins } from "../lib/api";

const EXAMPLE_WINS = [
  { id:"1", username:"FlipQueen",   item_name:"Coach Leather Crossbody",      profit:67,  platform:"Poshmark", store_name:"Goodwill",        likes:24, created_at:new Date(Date.now()-7200000).toISOString()   },
  { id:"2", username:"ThriftKing",  item_name:"DeWalt 20V Drill, Kit",          profit:112, platform:"eBay",     store_name:"Salvation Army",  likes:41, created_at:new Date(Date.now()-14400000).toISOString()  },
  { id:"3", username:"VintageVibe", item_name:"Pyrex Butterprint Set",         profit:89,  platform:"Etsy",     store_name:"Habitat ReStore", likes:33, created_at:new Date(Date.now()-21600000).toISOString()  },
  { id:"4", username:"SneakerPro",  item_name:"Jordan 1 Retro, High OG",       profit:145, platform:"StockX",   store_name:"Goodwill",        likes:67, created_at:new Date(Date.now()-86400000).toISOString()  },
  { id:"5", username:"GarageGold",  item_name:"Craftsman Socket Set",          profit:78,  platform:"Facebook", store_name:"Estate Sale",     likes:19, created_at:new Date(Date.now()-172800000).toISOString() },
  { id:"6", username:"MercariMom",  item_name:"Lululemon, Align 3-Pack",        profit:134, platform:"Mercari",  store_name:"Goodwill",        likes:55, created_at:new Date(Date.now()-259200000).toISOString() },
  { id:"7", username:"EbayElite",   item_name:"Snap-On, Wrench Set",            profit:220, platform:"eBay",     store_name:"Garage Sale",     likes:89, created_at:new Date(Date.now()-345600000).toISOString() },
  { id:"8", username:"LuxLister",   item_name:"Kate, Spade Tote, Bag",           profit:95,  platform:"Poshmark", store_name:"Goodwill Bins",   likes:42, created_at:new Date(Date.now()-432000000).toISOString() },
  { id:"9", username:"FlipMaster",  item_name:"KitchenAid Stand Mixer",        profit:190, platform:"eBay",     store_name:"ThriftTown",      likes:103,created_at:new Date(Date.now()-518400000).toISOString() },
  { id:"10",username:"CardShark",   item_name:"Pokémon 1st Edition, Lot",       profit:340, platform:"eBay",     store_name:"Garage Sale",     likes:214,created_at:new Date(Date.now()-604800000).toISOString() },
];

const LEADERBOARD = [
  { rank:1, username:"CardShark",   profit:3240, wins:18, badge:"👑" },
  { rank:2, username:"FlipMaster",  profit:2890, wins:24, badge:"🥈" },
  { rank:3, username:"EbayElite",   profit:2540, wins:19, badge:"🥉" },
  { rank:4, username:"SneakerPro",  profit:2180, wins:15, badge:"⚡" },
  { rank:5, username:"MercariMom",  profit:1920, wins:22, badge:"🔥" },
  { rank:6, username:"ThriftKing",  profit:1780, wins:20, badge:"💪" },
  { rank:7, username:"LuxLister",   profit:1650, wins:17, badge:"✨" },
  { rank:8, username:"GarageGold",  profit:1420, wins:14, badge:"🛒" },
  { rank:9, username:"VintageVibe", profit:1280, wins:16, badge:"🏺" },
  { rank:10,username:"FlipQueen",   profit:1140, wins:21, badge:"👸" },
];

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

export default function CommunityScreen({ onNavigate, onBack }: Props) {
  const [tab, setTab]           = useState<"wins"|"leaderboard">("wins");
  const [filter, setFilter]     = useState<"hot"|"profit"|"recent">("hot");
  const [wins, setWins]         = useState<any[]>(EXAMPLE_WINS.map(w => ({ ...w, isExample: true })));
  const [liked, setLiked]       = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats]       = useState({ total: 0, totalProfit: 0, avgProfit: 0 });
  useEffect(() => {
    getCommunityWins().then((real: any[]) => {
      if (real && real.length) {
        const realTagged = real.map(w => ({ ...w, isExample: false }));
        setWins([...realTagged, ...EXAMPLE_WINS.map(w => ({ ...w, isExample: true }))]);
        const totalProfit = realTagged.reduce((sum, w) => sum + (Number(w.profit) || 0), 0);
        setStats({ total: realTagged.length, totalProfit, avgProfit: realTagged.length ? Math.round(totalProfit / realTagged.length) : 0 });
      }
    }).catch(() => {});
  }, []);

  const sorted = [...wins].sort((a, b) =>
    filter === "profit" ? b.profit - a.profit :
    filter === "recent" ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() :
    b.likes - a.likes,
  );

  function toggleLike(id: string) {
    setLiked(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
    setWins(prev => prev.map(w =>
      w.id === id ? { ...w, likes: w.likes + (liked.has(id) ? -1 : 1) } : w,
    ));
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={s.logoRow}>
          <View style={s.logoIcon}><Text style={s.logoIconTxt}>V</Text></View>
          <Text style={s.logoTxt}>Community</Text>
        </View>
        <View style={{ width:36 }}/>
      </View>

      {/* Stats banner */}
      <View style={s.statsBanner}>
        <View style={s.statItem}>
          <Text style={s.statVal}>{stats.total}</Text>
          <Text style={s.statLabel}>Wins This Week</Text>
        </View>
        <View style={s.statDivider}/>
        <View style={s.statItem}>
          <Text style={[s.statVal, { color:C.green }]}>${Math.round(stats.totalProfit/1000)}K</Text>
          <Text style={s.statLabel}>Total Profit</Text>
        </View>
        <View style={s.statDivider}/>
        <View style={s.statItem}>
          <Text style={[s.statVal, { color:C.yellow }]}>${stats.avgProfit}</Text>
          <Text style={s.statLabel}>Avg Per Flip</Text>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tabBtn, tab==="wins"&&s.tabBtnActive]} onPress={()=>setTab("wins")}>
          <Text style={[s.tabTxt, tab==="wins"&&s.tabTxtActive]}>🔥 Community Wins</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab==="leaderboard"&&s.tabBtnActive]} onPress={()=>setTab("leaderboard")}>
          <Text style={[s.tabTxt, tab==="leaderboard"&&s.tabTxtActive]}>🏆 Leaderboard</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green}
          onRefresh={() => { setRefreshing(true); setTimeout(()=>setRefreshing(false),1000); }}/>}
      >
        {/* ── WINS, TAB ── */}
        {tab === "wins" && (
          <>
            {/* Filter */}
            <View style={s.filterRow}>
              {(["hot","profit","recent"] as const).map(f => (
                <TouchableOpacity key={f} onPress={()=>setFilter(f)}
                  style={[s.filterChip, filter===f&&s.filterChipActive]}>
                  <Text style={[s.filterTxt, filter===f&&s.filterTxtActive]}>
                    {f==="hot"?"🔥 Hot":f==="profit"?"💰 Top, Profit":"⚡ Recent"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {sorted.map(win => (
              <View key={win.id} style={s.winCard}>
                <View style={s.winHeader}>
                  <View style={s.avatar}>
                    <Text style={s.avatarTxt}>{win.username[0]}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={s.username}>{win.username}{win.isExample ? "  \u00B7 Example" : ""}</Text>
                    <Text style={s.winMeta}>{win.store_name} · {timeAgo(win.created_at)}</Text>
                  </View>
                  <View style={s.profitBadge}>
                    <Text style={s.profitAmt}>+${win.profit}</Text>
                  </View>
                </View>

                <Text style={s.itemName}>{win.item_name}</Text>
                <Text style={s.platform}>Sold on {win.platform}</Text>

                <View style={s.winFooter}>
                  <TouchableOpacity style={s.likeBtn} onPress={()=>toggleLike(win.id)}>
                    <Text style={[s.likeTxt, liked.has(win.id)&&{color:C.red}]}>
                      {liked.has(win.id)?"❤️":"🤍"} {win.likes}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.scanItBtn} onPress={()=>onNavigate("scanner")}>
                    <Text style={s.scanItTxt}>Scan similar →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── LEADERBOARD, TAB ── */}
        {tab === "leaderboard" && (
          <>
            <Text style={s.lbTitle}>Top Flippers This Week</Text>
            <Text style={s.lbSub}>Based on total profit found with ValuIQ</Text>

            {LEADERBOARD.map((user) => (
              <View key={user.rank} style={[s.lbCard, user.rank <= 3 && { borderColor: user.rank===1?C.yellow:user.rank===2?"#C0C0C0":"#CD7F32" }]}>
                <Text style={s.lbRank}>{user.badge}</Text>
                <View style={{ flex:1 }}>
                  <Text style={s.lbUsername}>{user.username}</Text>
                  <Text style={s.lbWins}>{user.wins} profitable finds</Text>
                </View>
                <View style={{ alignItems:"flex-end" }}>
                  <Text style={[s.lbProfit, user.rank===1&&{color:C.yellow}]}>
                    ${user.profit.toLocaleString()}
                  </Text>
                  <Text style={s.lbLabel}>profit found</Text>
                </View>
              </View>
            ))}

            <View style={s.joinCard}>
              <Text style={s.joinTitle}>Want to appear here?</Text>
              <Text style={s.joinBody}>Every scan you make with ValuIQ contributes to your leaderboard ranking.</Text>
              <TouchableOpacity style={s.joinBtn} onPress={()=>onNavigate("scanner")}>
                <Text style={s.joinBtnTxt}>Start Scanning →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex:1, backgroundColor:C.bg },
  nav:            { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:        { width:36, height:36, justifyContent:"center" },
  backTxt:        { color:C.text3, fontSize:22 },
  logoRow:        { flexDirection:"row", alignItems:"center", gap:8 },
  logoIcon:       { width:28, height:28, backgroundColor:C.green, borderRadius:8, alignItems:"center", justifyContent:"center" },
  logoIconTxt:    { color:C.greenDark, fontSize:14, fontWeight:"900" },
  logoTxt:        { color:C.text1, fontSize:17, fontWeight:"800" },
  statsBanner:    { flexDirection:"row", backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border, paddingTop: 16, paddingBottom: 10 },
  statItem:       { flex:1, alignItems:"center" },
  statVal:        { color:C.text1, fontSize:20, fontWeight:"900", letterSpacing:-0.5 },
  statLabel:      { color:C.text4, fontSize:10, fontWeight:"700", marginTop:2 },
  statDivider:    { width:1, backgroundColor:C.border },
  tabRow:         { flexDirection:"row", borderBottomWidth:1, borderBottomColor:C.border },
  tabBtn:         { flex:1, paddingTop:16, paddingBottom:10, alignItems:"center", borderBottomWidth:2, borderBottomColor:"transparent" },
  tabBtnActive:   { borderBottomColor:C.green },
  tabTxt:         { color:C.text4, fontSize:13, fontWeight:"600" },
  tabTxtActive:   { color:C.green, fontWeight:"800" },
  scroll:         { padding:16, paddingBottom:60 },
  filterRow:      { flexDirection:"row", gap:8, marginBottom:14 },
  filterChip:     { flex:1, paddingTop:16, paddingBottom:10, alignItems:"center", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:10 },
  filterChipActive:{ backgroundColor:C.greenBg, borderColor:C.greenBorder },
  filterTxt:      { color:C.text3, fontSize:12, fontWeight:"600" },
  filterTxtActive:{ color:C.green, fontWeight:"700" },
  winCard:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:14, marginBottom:10 },
  winHeader:      { flexDirection:"row", alignItems:"center", gap:10, marginBottom:10 },
  avatar:         { width:36, height:36, backgroundColor:C.green+"30", borderRadius:18, alignItems:"center", justifyContent:"center" },
  avatarTxt:      { color:C.green, fontSize:16, fontWeight:"900" },
  username:       { color:C.text1, fontSize:13, fontWeight:"700" },
  winMeta:        { color:C.text4, fontSize:11, marginTop:1 },
  profitBadge:    { backgroundColor:C.green+"20", borderRadius:100, paddingHorizontal:10, paddingVertical:4 },
  profitAmt:      { color:C.green, fontSize:15, fontWeight:"900" },
  itemName:       { color:C.text1, fontSize:14, fontWeight:"700", marginBottom:3 },
  platform:       { color:C.text4, fontSize:12, marginBottom:10 },
  winFooter:      { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  likeBtn:        { padding:6 },
  likeTxt:        { color:C.text3, fontSize:14 },
  scanItBtn:      { borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:12, paddingVertical:6 },
  scanItTxt:      { color:C.text3, fontSize:12, fontWeight:"600" },
  lbTitle:        { color:C.text1, fontSize:18, fontWeight:"900", marginBottom:4 },
  lbSub:          { color:C.text4, fontSize:12, marginBottom:16 },
  lbCard:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:13, padding:14, marginBottom:8, flexDirection:"row", alignItems:"center", gap:12 },
  lbRank:         { fontSize:24, width:32 },
  lbUsername:     { color:C.text1, fontSize:14, fontWeight:"700" },
  lbWins:         { color:C.text4, fontSize:11, marginTop:2 },
  lbProfit:       { color:C.green, fontSize:18, fontWeight:"900" },
  lbLabel:        { color:C.text4, fontSize:10, marginTop:2 },
  joinCard:       { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:20, marginTop:8, alignItems:"center" },
  joinTitle:      { color:C.text1, fontSize:16, fontWeight:"800", marginBottom:6 },
  joinBody:       { color:C.text3, fontSize:13, textAlign:"center" as any, lineHeight:19, marginBottom:14 },
  joinBtn:        { backgroundColor:C.green, borderRadius:10, paddingTop:16, paddingBottom:10, paddingHorizontal:24 },
  joinBtnTxt:     { color:C.greenDark, fontSize:14, fontWeight:"900" } });
