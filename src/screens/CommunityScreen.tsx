import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { getCommunityFlips, peekCommunityFlips, CommunityFlip, reportWin } from "../lib/api";
import { formatFeedDetail, avatarForFlip } from "../lib/flipFormat";
import FlexRevealCard from "../components/FlexRevealCard";
import { FlexStat } from "../lib/flexReveal";

// A community flip's reveal never runs the real fetchFlexStat() crowd-
// comparison (that needs a scanId the current user owns - a community row
// is someone else's, or seed/mined, data). Built straight from the fields
// already on the row instead: always tier "fallback", no badge - honest
// about not having run the personal-record/segment/weekly comparisons.
function communityStat(win: CommunityFlip): FlexStat {
  return {
    tier: "fallback",
    headline: `$${Math.round(win.profit).toLocaleString()}`,
    subStat: formatFeedDetail(win),
    // Always false in practice today - both community_wins submissions and
    // the seed/mined pool are filtered to profit > 0 server-side
    // (community-flips/route.ts) - but computed honestly from the real sign
    // rather than hardcoded, in case that filter ever loosens.
    isLoss: win.profit < 0,
  };
}

function computeStats(list: CommunityFlip[]) {
  const totalProfit = list.reduce((sum, w) => sum + (Number(w.profit) || 0), 0);
  return { total: list.length, totalProfit, avgProfit: list.length ? Math.round(totalProfit / list.length) : 0 };
}

function timeAgo(date?: string) {
  if (!date) return "";
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
  onNavigate:(s:string, data?:any)=>void; onBack?:()=>void; onLogout:()=>void;
  navData?: any;
}

export default function CommunityScreen({ token, onNavigate, onBack, navData }: Props) {
  const [tab, setTab]           = useState<"wins"|"leaderboard">(navData?.tab === "leaderboard" ? "leaderboard" : "wins");
  const [filter, setFilter]     = useState<"profit"|"recent">("recent");
  // Real, anonymized flips only - see getCommunityFlips in lib/api.ts. No
  // fake/hardcoded rows: an empty array here means an honest "be the
  // first" empty state, not a silently-injected example.
  // Instant-paint from cache on mount - this screen fully unmounts/remounts
  // on every tab switch (no persistent tab navigator), so without a peek
  // here every single revisit showed the loading spinner/empty feed for a
  // beat even when getCommunityFlips below would resolve from cache anyway.
  const [wins, setWins]         = useState<CommunityFlip[]>(() => peekCommunityFlips(40) || []);
  const [loading, setLoading]   = useState(() => !peekCommunityFlips(40));
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats]       = useState(() => computeStats(peekCommunityFlips(40) || []));
  const [revealWin, setRevealWin] = useState<CommunityFlip | null>(null);

  async function load() {
    const real = await getCommunityFlips(40);
    setWins(real);
    setStats(computeStats(real));
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const sorted = [...wins].sort((a, b) =>
    filter === "profit" ? b.profit - a.profit :
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // "Leaderboard" of anonymized flips ranked by profit, not a per-user
  // ranking - a real per-user leaderboard needs opt-in identities, which
  // don't exist yet (see getCommunityFlips). This is still real, alive
  // data: the top real profits in the pool, never fabricated names/totals.
  const topFlips = [...wins].sort((a, b) => b.profit - a.profit).slice(0, 10);

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

      {/* Stats banner - deliberately labeled as a SAMPLE, not a lifetime
          platform total. getCommunityFlips(40) returns a randomly-windowed
          40-row slice of the real+seed pool (see api.ts) that changes on
          every refresh - "Real Flips"/"Total Profit" read as running
          platform totals to a new user, when "40"/"$2K" are really just the
          fetch limit and its sum. Relabeled to be honest about scope instead
          of implying a persisted count the backend doesn't actually track. */}
      <View style={s.statsBanner}>
        <View style={s.statItem}>
          <Text style={s.statVal}>{stats.total}</Text>
          <Text style={s.statLabel}>Recent Flips</Text>
        </View>
        <View style={s.statDivider}/>
        <View style={s.statItem}>
          <Text style={[s.statVal, { color:C.green }]}>${Math.round(stats.totalProfit/1000)}K</Text>
          <Text style={s.statLabel}>Profit Shown</Text>
        </View>
        <View style={s.statDivider}/>
        <View style={s.statItem}>
          <Text style={[s.statVal, { color:C.yellow }]}>${stats.avgProfit}</Text>
          <Text style={s.statLabel}>Avg Per Flip</Text>
        </View>
      </View>
      <Text style={s.statsCaption}>A snapshot of real flips - not a running platform total</Text>

      {/* Tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tabBtn, tab==="wins"&&s.tabBtnActive]} onPress={()=>setTab("wins")}>
          <Text style={[s.tabTxt, tab==="wins"&&s.tabTxtActive]}>🔥 Community Wins</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, tab==="leaderboard"&&s.tabBtnActive]} onPress={()=>setTab("leaderboard")}>
          <Text style={[s.tabTxt, tab==="leaderboard"&&s.tabTxtActive]}>🏆 Top Flips</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green}
          onRefresh={() => { setRefreshing(true); load(); }}/>}
      >
        {loading ? (
          <ActivityIndicator color={C.green} style={{ marginTop:40 }}/>
        ) : (
        <>
        {/* ── WINS, TAB ── */}
        {tab === "wins" && (
          <>
            {wins.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyTitle}>Be the first this week</Text>
                <Text style={s.emptySub}>Real community flips will show up here as resellers scan and sell.</Text>
              </View>
            ) : (
              <>
                <View style={s.filterRow}>
                  {(["recent","profit"] as const).map(f => (
                    <TouchableOpacity key={f} onPress={()=>setFilter(f)}
                      style={[s.filterChip, filter===f&&s.filterChipActive]}>
                      <Text style={[s.filterTxt, filter===f&&s.filterTxtActive]}>
                        {f==="profit"?"💰 Top Profit":"⚡ Recent"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {sorted.map((win, i) => (
                  <TouchableOpacity key={win.id || `${win.item_name}-${i}`} style={s.winCard} activeOpacity={0.75} onPress={() => setRevealWin(win)}>
                    {/* No repeated "A reseller" identity line - the real
                        item + real buy/sell/profit/days below is what
                        makes this credible, a person label doesn't add
                        anything and just looks templated when it's on
                        every card. */}
                    <View style={s.winHeader}>
                      <View style={s.avatar}>
                        <Text style={s.avatarTxt}>{avatarForFlip(win)}</Text>
                      </View>
                      <View style={{ flex:1 }}>
                        {/* Short/1-line on purpose: this card is a preview,
                            not the detail view - a tap opens the reveal
                            (below), which shows the item name in FULL with
                            no cap. Truncating here is fine now that the
                            full name always lives one tap away. */}
                        <Text style={s.username} numberOfLines={1}>{win.item_name}</Text>
                        <Text style={s.winMeta}>{timeAgo(win.created_at)}</Text>
                      </View>
                      <View style={s.profitBadge}>
                        <Text style={s.profitAmt}>+${win.profit}</Text>
                      </View>
                    </View>

                    <Text style={s.platform}>{formatFeedDetail(win)}</Text>

                    <View style={s.winFooter}>
                      <TouchableOpacity style={s.scanItBtn} onPress={()=>onNavigate("scanner")}>
                        <Text style={s.scanItTxt}>Scan similar →</Text>
                      </TouchableOpacity>
                      {win.id && (
                        <TouchableOpacity style={{ paddingHorizontal: 8, paddingVertical: 6 }} onPress={() => {
                          Alert.alert("Report post", "Report this post for review?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Report", style: "destructive", onPress: async () => { await reportWin(token, win.id!); Alert.alert("Thanks", "Our team will review this post."); } },
                          ]);
                        }}>
                          <Text style={{ color: C.text4, fontSize: 12 }}>{"⚑"} Report</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {/* ── TOP FLIPS, TAB ── */}
        {tab === "leaderboard" && (
          <>
            <Text style={s.lbTitle}>Top Real Flips</Text>
            <Text style={s.lbSub}>Ranked by profit found with ValuIQ - names hidden for now</Text>

            {topFlips.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyTitle}>No ranked flips yet</Text>
                <Text style={s.emptySub}>The top real flips this week will show up here.</Text>
              </View>
            ) : topFlips.map((win, i) => (
              <TouchableOpacity key={win.id || `${win.item_name}-${i}`} style={[s.lbCard, i < 3 && { borderColor: i===0?C.yellow:i===1?"#C0C0C0":"#CD7F32" }]} activeOpacity={0.75} onPress={() => setRevealWin(win)}>
                <Text style={s.lbRank}>{i===0?"👑":i===1?"🥈":i===2?"🥉":`#${i+1}`}</Text>
                <View style={{ flex:1 }}>
                  <Text style={s.lbUsername} numberOfLines={1}>{win.item_name}</Text>
                  <Text style={s.lbWins} numberOfLines={1}>{formatFeedDetail(win)}</Text>
                </View>
                <View style={{ alignItems:"flex-end" }}>
                  <Text style={[s.lbProfit, i===0&&{color:C.yellow}]}>
                    ${win.profit.toLocaleString()}
                  </Text>
                  <Text style={s.lbLabel}>profit</Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={s.joinCard}>
              <Text style={s.joinTitle}>Want to appear here?</Text>
              <Text style={s.joinBody}>Every real flip you log with ValuIQ can be shared to the community feed.</Text>
              <TouchableOpacity style={s.joinBtn} onPress={()=>onNavigate("scanner")}>
                <Text style={s.joinBtnTxt}>Start Scanning →</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        </>
        )}
      </ScrollView>

      {/* Tap-to-reveal for a community flip - NOT the viewer's own win, so
          the eyebrow/footer copy is overridden to say so explicitly instead
          of the default "Your flip" framing. stat is built locally
          (communityStat above) from fields already on the row - no
          fetchFlexStat crowd-comparison call, since that needs a scanId the
          viewer owns and this is someone else's (or seed/mined) flip.
          Primary button routes to Scan (not a share flow - it's not the
          viewer's flip to share) via the onShare override, same pattern
          WinsDemoCard uses for its "not the viewer's own" reveal. Leaderboard
          button is hidden outright - the viewer is already in the community
          feed that button would otherwise send them to. */}
      <FlexRevealCard
        visible={!!revealWin}
        stat={revealWin ? communityStat(revealWin) : null}
        itemName={revealWin?.item_name}
        brand={revealWin?.brand}
        eyebrowOverride="COMMUNITY FLIP"
        footerOverride="A real flip from the ValuIQ community."
        primaryLabelOverride="Scan similar →"
        onShare={() => { setRevealWin(null); onNavigate("scanner"); }}
        hideLeaderboardButton
        onClose={() => setRevealWin(null)}
      />
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
  statsBanner:    { flexDirection:"row", backgroundColor:C.surface, paddingTop: 16, paddingBottom: 10 },
  statItem:       { flex:1, alignItems:"center" },
  statVal:        { color:C.text1, fontSize:20, fontWeight:"900", letterSpacing:-0.5 },
  statLabel:      { color:C.text4, fontSize:10, fontWeight:"700", marginTop:2 },
  statDivider:    { width:1, backgroundColor:C.border },
  statsCaption:   { color:C.text4, fontSize:10, textAlign:"center", paddingVertical:6, paddingHorizontal:16, backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border },
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
  avatarTxt:      { fontSize:16 },
  username:       { color:C.text1, fontSize:13, fontWeight:"700" },
  winMeta:        { color:C.text4, fontSize:11, marginTop:1 },
  profitBadge:    { backgroundColor:C.green+"20", borderRadius:100, paddingHorizontal:10, paddingVertical:4 },
  profitAmt:      { color:C.green, fontSize:15, fontWeight:"900" },
  itemName:       { color:C.text1, fontSize:14, fontWeight:"700", marginBottom:3 },
  platform:       { color:C.text4, fontSize:12, marginBottom:10 },
  winFooter:      { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  scanItBtn:      { borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:12, paddingVertical:6 },
  scanItTxt:      { color:C.text3, fontSize:12, fontWeight:"600" },
  emptyWrap:      { alignItems:"center", paddingVertical:50, paddingHorizontal:20 },
  emptyTitle:     { color:C.text2, fontSize:15, fontWeight:"700", marginBottom:6, textAlign:"center" },
  emptySub:       { color:C.text4, fontSize:13, textAlign:"center", lineHeight:19 },
  lbTitle:        { color:C.text1, fontSize:18, fontWeight:"900", marginBottom:4 },
  lbSub:          { color:C.text4, fontSize:12, marginBottom:16 },
  lbCard:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:13, padding:14, marginBottom:8, flexDirection:"row", alignItems:"center", gap:12 },
  lbRank:         { fontSize:20, width:36, fontWeight:"900", color:C.text3 },
  lbUsername:     { color:C.text1, fontSize:14, fontWeight:"700" },
  lbWins:         { color:C.text4, fontSize:11, marginTop:2 },
  lbProfit:       { color:C.green, fontSize:18, fontWeight:"900" },
  lbLabel:        { color:C.text4, fontSize:10, marginTop:2 },
  joinCard:       { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:20, marginTop:8, alignItems:"center" },
  joinTitle:      { color:C.text1, fontSize:16, fontWeight:"800", marginBottom:6 },
  joinBody:       { color:C.text3, fontSize:13, textAlign:"center" as any, lineHeight:19, marginBottom:14 },
  joinBtn:        { backgroundColor:C.green, borderRadius:10, paddingTop:16, paddingBottom:10, paddingHorizontal:24 },
  joinBtnTxt:     { color:C.greenDark, fontSize:14, fontWeight:"900" } });
