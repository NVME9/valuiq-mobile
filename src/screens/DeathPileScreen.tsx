import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

const PLATFORMS = ["eBay","Poshmark","Mercari","Facebook Marketplace","Depop","Etsy","Whatnot","Craigslist"];
const CONDITIONS = ["New","Like New","Good","Fair","Poor"];
const CATEGORIES = ["Clothing","Shoes","Electronics","Collectibles","Home","Tools","Vintage","Other"];

const VERDICT_CONFIG: Record<string, { color:string; icon:string; label:string }> = {
  REPRICE:        { color: C.yellow,  icon: "💰", label: "Drop the Price" },
  RELIST:         { color: C.orange,  icon: "✏️",  label: "Relist It Better" },
  MOVE_PLATFORM:  { color: C.green,   icon: "🚀", label: "Wrong Platform" },
  BUNDLE:         { color: "#b066ff", icon: "📦", label: "Bundle It" },
  DONATE:         { color: C.text3,   icon: "💝", label: "Donate It" },
  TRASH:          { color: C.red,     icon: "🗑️",  label: "Cut Your Losses" } };

export default function DeathPileScreen({ token, plan, onNavigate, onBack }: Props) {
  const [itemName, setItemName]       = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [paidPrice, setPaidPrice]     = useState("");
  const [platform, setPlatform]       = useState("eBay");
  const [daysListed, setDaysListed]   = useState("");
  const [condition, setCondition]     = useState("Good");
  const [category, setCategory]       = useState("Other");
  const [listingTitle, setListingTitle] = useState("");
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<any>(null);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState<"rescue"|"listing"|"cascade"|"bundle">("rescue");

  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  async function analyze() {
    if (!itemName.trim()) { setError("Enter the item name"); return; }
    if (!currentPrice || parseFloat(currentPrice) <= 0) { setError("Enter the current listing price"); return; }
    if (!daysListed || parseInt(daysListed) <= 0) { setError("Enter how many days it's been listed"); return; }
    setError(""); setLoading(true); setResult(null);

    try {
      const r = await fetch(`${API_BASE}/api/deathpile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemName: itemName.trim(),
          currentPrice: parseFloat(currentPrice),
          paidPrice: paidPrice ? parseFloat(paidPrice) : undefined,
          platform,
          daysListed: parseInt(daysListed),
          condition,
          category,
          listingTitle: listingTitle.trim() || undefined,
          userToken: token }) });
      const d = await r.json();
      if (d.success) {
        setResult(d);
        setActiveTab("rescue");
      } else {
        setError(d.error || "Analysis failed. Please try again.");
      }
    } catch {
      setError("Connection error. Check your internet and try again.");
    }
    setLoading(false);
  }

  function reset() { setResult(null); setItemName(""); setCurrentPrice(""); setPaidPrice(""); setDaysListed(""); setListingTitle(""); }

  if (!isPaid) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}><Text style={s.backTxt}>←</Text></TouchableOpacity>
          <Text style={s.navTitle}>Inventory Rescue</Text>
          <View style={{ width:36 }}/>
        </View>
        <ScrollView contentContainerStyle={{ padding:24 }}>
          <View style={s.lockedCard}>
            <Text style={{ fontSize:48, marginBottom:16 }}>💀→💰</Text>
            <Text style={s.lockedTitle}>Inventory Rescue Engine</Text>
            <Text style={s.lockedBody}>
              Turn your dead inventory into cash. Enter any stuck item and get a complete rescue plan: real eBay market data, the exact price that will sell, a new AI-written listing, cascade pricing strategy, and bundle opportunities.
            </Text>
            <TouchableOpacity style={s.upgradeBtn} onPress={()=>onNavigate("upgrade")}>
              <Text style={s.upgradeBtnTxt}>Unlock with Seller Plan →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => result ? reset() : onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>{result ? "← New" : "←"}</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>💀 Inventory Rescue</Text>
        <View style={{ width:48 }}/>
      </View>

      {!result ? (
        /* ── INPUT, FORM ── */
        <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <Text style={s.formTitle}>Tell me about your stuck item</Text>
          <Text style={s.formSub}>The more detail you give, the better the rescue plan.</Text>

          {error ? <View style={s.errorBox}><Text style={s.errorTxt}>{error}</Text></View> : null}

          <Text style={s.label}>Item Name *</Text>
          <TextInput style={s.input} value={itemName} onChangeText={setItemName}
            placeholder="e.g. Lululemon, Align Leggings, Size 6" placeholderTextColor={C.text4}/>

          <View style={{ flexDirection:"row", gap:10 }}>
            <View style={{ flex:1 }}>
              <Text style={s.label}>Listed Price *</Text>
              <TextInput style={s.input} value={currentPrice} onChangeText={setCurrentPrice}
                placeholder="$0" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>
            </View>
            <View style={{ flex:1 }}>
              <Text style={s.label}>You Paid</Text>
              <TextInput style={s.input} value={paidPrice} onChangeText={setPaidPrice}
                placeholder="$0" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>
            </View>
          </View>

          <Text style={s.label}>Days Listed *</Text>
          <TextInput style={s.input} value={daysListed} onChangeText={setDaysListed}
            placeholder="e.g. 30" placeholderTextColor={C.text4} keyboardType="number-pad"/>

          <Text style={s.label}>Listed On</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
            <View style={{ flexDirection:"row", gap:6 }}>
              {PLATFORMS.map(p => (
                <TouchableOpacity key={p} onPress={() => setPlatform(p)}
                  style={[s.chip, platform===p && s.chipActive]}>
                  <Text style={[s.chipTxt, platform===p && s.chipTxtActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={s.label}>Condition</Text>
          <View style={{ flexDirection:"row", flexWrap:"wrap" as any, gap:6, marginBottom:14 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity key={c} onPress={() => setCondition(c)}
                style={[s.chip, condition===c && s.chipActive]}>
                <Text style={[s.chipTxt, condition===c && s.chipTxtActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
            <View style={{ flexDirection:"row", gap:6 }}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} onPress={() => setCategory(cat)}
                  style={[s.chip, category===cat && s.chipActive]}>
                  <Text style={[s.chipTxt, category===cat && s.chipTxtActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={s.label}>Current Listing Title (optional but helpful)</Text>
          <TextInput style={s.input} value={listingTitle} onChangeText={setListingTitle}
            placeholder="Paste your current listing title..." placeholderTextColor={C.text4}/>

          <TouchableOpacity style={[s.analyzeBtn, loading && { opacity:0.6 }]}
            onPress={analyze} disabled={loading}>
            {loading
              ? <View style={{ flexDirection:"row", gap:10, alignItems:"center" }}>
                  <ActivityIndicator color="#000" size="small"/>
                  <Text style={s.analyzeBtnTxt}>Analyzing market data...</Text>
                </View>
              : <Text style={s.analyzeBtnTxt}>🔍 Rescue This Item →</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* ── RESULTS ── */
        <ScrollView contentContainerStyle={s.results}>
          {/* Verdict hero */}
          {(() => {
            const v = VERDICT_CONFIG[result.analysis?.verdict] || { color:C.green, icon:"💡", label:"See Plan" };
            const score = result.analysis?.rescueScore || 0;
            return (
              <View style={[s.verdictCard, { borderColor: v.color + "50", backgroundColor: v.color + "08" }]}>
                <View style={[s.verdictBadge, { backgroundColor: v.color + "20" }]}>
                  <Text style={{ fontSize:32 }}>{v.icon}</Text>
                  <Text style={[s.verdictLabel, { color: v.color }]}>{v.label}</Text>
                </View>
                <View style={s.verdictScoreRow}>
                  <View style={s.scoreBox}>
                    <Text style={[s.scoreNum, { color: score >= 70 ? C.green : score >= 40 ? C.yellow : C.red }]}>
                      {score}
                    </Text>
                    <Text style={s.scoreLabel}>RESCUEABLE</Text>
                  </View>
                  <View style={s.scoreBox}>
                    <Text style={[s.scoreNum, { color: C.orange }]}>
                      {result.analysis?.urgencyScore || 0}/10
                    </Text>
                    <Text style={s.scoreLabel}>URGENCY</Text>
                  </View>
                  {result.analysis?.rescuePrice > 0 && (
                    <View style={s.scoreBox}>
                      <Text style={[s.scoreNum, { color: C.green }]}>
                        ${Math.round(result.analysis.rescuePrice)}
                      </Text>
                      <Text style={s.scoreLabel}>RESCUE, PRICE</Text>
                    </View>
                  )}
                </View>
                {result.marketData?.soldCount > 0 && (
                  <View style={s.marketRow}>
                    <Text style={s.marketLbl}>📊 Real market data: {result.marketData.soldCount} recent sales · Median ${result.marketData.medianSold} · {result.marketData.activeSellers} active sellers</Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Tab bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll}>
            <View style={s.tabRow}>
              {(["rescue","listing","cascade","bundle"] as const).map(t => (
                <TouchableOpacity key={t} onPress={() => setActiveTab(t)}
                  style={[s.tabBtn, activeTab===t && s.tabBtnActive]}>
                  <Text style={[s.tabTxt, activeTab===t && s.tabTxtActive]}>
                    {t==="rescue"?"🎯 Rescue, Plan":t==="listing"?"✏️ New, Listing":t==="cascade"?"📉 Price, Plan":"📦 Bundle"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* ── RESCUE, TAB ── */}
          {activeTab === "rescue" && (
            <View style={s.tabContent}>
              {/* Root causes */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Why It's Not Selling</Text>{(result.analysis?.rootCauses || []).map((cause: string, i: number) => (
                  <View key={i} style={s.causeRow}>
                    <Text style={{ color:C.red, fontSize:14, width:20 }}>✗</Text>
                    <Text style={s.causeTxt}>{cause}</Text>
                  </View>
                ))}
              </View>

              {/* Price recommendation */}
              {result.analysis?.rescuePrice > 0 && (
                <View style={s.priceCard}>
                  <View style={s.priceHeader}>
                    <Text style={s.priceTitle}>Rescue Price</Text>
                    <Text style={[s.priceBig, { color:C.green }]}>${Math.round(result.analysis.rescuePrice)}</Text>
                  </View>
                  <Text style={s.priceReasoning}>{result.analysis.rescuePriceReasoning}</Text>
                  <View style={s.priceDetails}>
                    <Text style={s.priceDetail}>Net after fees: <Text style={{ color:C.text1 }}>${Math.round(result.analysis.netAtRescuePrice || 0)}</Text></Text>
                    {result.analysis.profitAtRescuePrice !== null && (
                      <Text style={s.priceDetail}>
                        P&L: <Text style={{ color: (result.analysis.profitAtRescuePrice||0) >= 0 ? C.green : C.red }}>
                          {(result.analysis.profitAtRescuePrice||0) >= 0 ? "+" : ""}${Math.round(result.analysis.profitAtRescuePrice||0)}
                        </Text>
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Best platform */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>Best Platform</Text>
                {(result.analysis?.platformRanking || []).slice(0,4).map((p: any, i: number) => (
                  <View key={i} style={s.platformRow}>
                    <View style={[s.platformScore, { backgroundColor: i===0 ? C.green+"20" : C.surface }]}>
                      <Text style={[s.platformScoreNum, { color: i===0 ? C.green : C.text3 }]}>{p.score}</Text>
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={[s.platformName, i===0&&{color:C.green}]}>{p.platform} {i===0?"★ Best":""}</Text>
                      <Text style={s.platformReason}>{p.reasoning}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Seasonal note */}
              {result.analysis?.seasonalNote && (
                <View style={s.infoCard}>
                  <Text style={s.infoLabel}>📅 Seasonal Timing</Text>
                  <Text style={s.infoTxt}>{result.analysis.seasonalNote}</Text>
                </View>
              )}

              {/* Pro tip */}
              {result.analysis?.proTip && (
                <View style={[s.infoCard, { borderColor: C.yellow+"40", backgroundColor: C.yellow+"08" }]}>
                  <Text style={[s.infoLabel, { color:C.yellow }]}>💡 Expert Insight</Text>
                  <Text style={s.infoTxt}>{result.analysis.proTip}</Text>
                </View>
              )}

              {/* Immediate actions */}
              {(result.analysis?.immediateActions || []).length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Do This Right Now</Text>
                  {result.analysis.immediateActions.map((action: string, i: number) => (
                    <View key={i} style={s.actionRow}>
                      <View style={s.actionNum}><Text style={s.actionNumTxt}>{i+1}</Text></View>
                      <Text style={s.actionTxt}>{action}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Donate/trash threshold */}
              {result.analysis?.donateOrTrash && (
                <View style={[s.infoCard, { borderColor:C.red+"40", backgroundColor:C.red+"08" }]}>
                  <Text style={[s.infoLabel, { color:C.red }]}>🗑️ Cut Your Losses</Text>
                  <Text style={s.infoTxt}>{result.analysis.donateOrTrashReason}</Text>
                  {result.analysis.hardCutThreshold > 0 && (
                    <Text style={[s.infoTxt, { marginTop:6, fontWeight:"700" }]}>
                      Hard cut threshold: ${result.analysis.hardCutThreshold} — below this, donate or trash beats waiting.
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ── NEW, LISTING TAB ── */}
          {activeTab === "listing" && (
            <View style={s.tabContent}>
              {result.analysis?.rescueTitle && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>AI-Written Title</Text>
                  <View style={[s.copyBox, { borderColor:C.green+"40" }]}>
                    <Text style={s.copyTxt}>{result.analysis.rescueTitle}</Text>
                  </View>
                  <Text style={s.copyHint}>{result.analysis.rescueTitle?.length || 0}/80 chars</Text>
                </View>
              )}

              {result.analysis?.rescueDescription && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>AI-Written Description</Text>
                  <View style={s.copyBox}>
                    <Text style={s.copyTxt}>{result.analysis.rescueDescription}</Text>
                  </View>
                </View>
              )}

              {(result.analysis?.rescueKeywords || []).length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionTitle}>SEO, Keywords</Text>
                  <View style={{ flexDirection:"row", flexWrap:"wrap" as any, gap:6 }}>
                    {result.analysis.rescueKeywords.map((kw: string, i: number) => (
                      <View key={i} style={s.kwChip}><Text style={s.kwTxt}>{kw}</Text></View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── CASCADE, PLAN TAB ── */}
          {activeTab === "cascade" && (
            <View style={s.tabContent}>
              <Text style={s.sectionTitle}>Pricing Cascade</Text>
              <Text style={s.sectionSub}>If it doesn't sell, follow this exact plan</Text>{(result.analysis?.cascadePlan || []).map((step: any, i: number) => (
                <View key={i} style={s.cascadeRow}>
                  <View style={s.cascadeDayBox}>
                    <Text style={s.cascadeDayNum}>Day {step.dayThreshold}</Text>
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={s.cascadeAction}>{step.action}</Text>
                    {step.newPrice > 0 && (
                      <Text style={s.cascadePrice}>→ ${step.newPrice}</Text>
                    )}
                  </View>
                </View>
              ))}
              {result.analysis?.hardCutThreshold > 0 && (
                <View style={[s.infoCard, { marginTop:16, borderColor:C.red+"40" }]}>
                  <Text style={[s.infoLabel, { color:C.red }]}>Hard, Cut: ${result.analysis.hardCutThreshold}</Text>
                  <Text style={s.infoTxt}>Below this price, your time is worth more than what you'll make. Donate and take the tax deduction.</Text></View>
              )}
            </View>
          )}

          {/* ── BUNDLE, TAB ── */}
          {activeTab === "bundle" && (
            <View style={s.tabContent}>
              {(result.analysis?.bundleIdeas || []).length === 0 ? (
                <View style={s.emptyState}>
                  <Text style={{ fontSize:32, marginBottom:10 }}>📦</Text>
                  <Text style={s.emptyTitle}>No bundle opportunities</Text>
                  <Text style={s.emptySub}>This item is best sold individually at the rescue price.</Text>
                </View>
              ) : (
                <>
                  <Text style={s.sectionTitle}>Bundle Opportunities</Text>
                  <Text style={s.sectionSub}>Group with similar items to increase perceived value</Text>
                  {result.analysis.bundleIdeas.map((bundle: any, i: number) => (
                    <View key={i} style={s.bundleCard}>
                      <View style={s.bundleHeader}>
                        <Text style={s.bundleWith}>Bundle with: {bundle.bundleWith}</Text>
                        <Text style={[s.bundlePrice, { color:C.green }]}>${bundle.combinedPrice}</Text>
                      </View>
                      <Text style={s.bundleReason}>{bundle.reasoning}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          <TouchableOpacity style={s.newBtn} onPress={reset}>
            <Text style={s.newBtnTxt}>↩ Rescue Another Item</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex:1, backgroundColor:C.bg },
  nav:            { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:        { paddingRight:8 },
  backTxt:        { color:C.text3, fontSize:16, fontWeight:"700" },
  navTitle:       { color:C.text1, fontSize:16, fontWeight:"800" },
  form:           { padding:20, paddingBottom:60 },
  formTitle:      { color:C.text1, fontSize:22, fontWeight:"900", letterSpacing:-0.5, marginBottom:4 },
  formSub:        { color:C.text3, fontSize:13, marginBottom:20, lineHeight:19 },
  errorBox:       { backgroundColor:"#1a0505", borderWidth:1, borderColor:C.red+"40", borderRadius:10, padding:12, marginBottom:16 },
  errorTxt:       { color:C.red, fontSize:13 },
  label:          { color:C.text3, fontSize:12, fontWeight:"700", textTransform:"uppercase" as any, letterSpacing:0.5, marginBottom:6, marginTop:10 },
  input:          { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:13, color:C.text1, fontSize:14, marginBottom:4 },
  chip:           { paddingHorizontal:12, paddingTop:16, paddingBottom:10, borderRadius:100, borderWidth:1, borderColor:C.border, backgroundColor:C.surface },
  chipActive:     { backgroundColor:C.green, borderColor:C.green },
  chipTxt:        { color:C.text3, fontSize:12, fontWeight:"600" },
  chipTxtActive:  { color:C.greenDark, fontWeight:"800" },
  analyzeBtn:     { backgroundColor:C.green, borderRadius:14, padding:16, alignItems:"center", marginTop:20 },
  analyzeBtnTxt:  { color:C.greenDark, fontSize:16, fontWeight:"900" },
  results:        { padding:16, paddingBottom:60 },
  verdictCard:    { borderWidth:2, borderRadius:18, padding:18, marginBottom:14 },
  verdictBadge:   { flexDirection:"row", alignItems:"center", gap:12, borderRadius:12, padding:14, marginBottom:14 },
  verdictLabel:   { fontSize:20, fontWeight:"900", flex:1 },
  verdictScoreRow:{ flexDirection:"row", gap:8 },
  scoreBox:       { flex:1, backgroundColor:C.bg, borderRadius:10, padding:12, alignItems:"center" },
  scoreNum:       { fontSize:26, fontWeight:"900", letterSpacing:-1 },
  scoreLabel:     { color:C.text4, fontSize:9, fontWeight:"700", textTransform:"uppercase" as any, marginTop:3, letterSpacing:0.5 },
  marketRow:      { backgroundColor:C.bg, borderRadius:8, padding:10, marginTop:10 },
  marketLbl:      { color:C.text4, fontSize:11 },
  tabScroll:      { maxHeight:46, marginBottom:14, borderBottomWidth:1, borderBottomColor:C.border },
  tabRow:         { flexDirection:"row", paddingHorizontal:4, gap:4 },
  tabBtn:         { paddingHorizontal:14, paddingTop:16, paddingBottom:10, borderRadius:8, borderBottomWidth:2, borderBottomColor:"transparent" },
  tabBtnActive:   { borderBottomColor:C.green },
  tabTxt:         { color:C.text4, fontSize:12, fontWeight:"600" },
  tabTxtActive:   { color:C.green, fontWeight:"800" },
  tabContent:     { gap:12 },
  section:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:14 },
  sectionTitle:   { color:C.text1, fontSize:14, fontWeight:"800", marginBottom:8 },
  sectionSub:     { color:C.text4, fontSize:11, marginBottom:10 },
  causeRow:       { flexDirection:"row", gap:8, marginBottom:7, alignItems:"flex-start" },
  causeTxt:       { color:C.text2, fontSize:13, flex:1, lineHeight:18 },
  priceCard:      { backgroundColor:C.greenBg, borderWidth:1.5, borderColor:C.greenBorder, borderRadius:14, padding:16 },
  priceHeader:    { flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:6 },
  priceTitle:     { color:C.text1, fontSize:14, fontWeight:"700" },
  priceBig:       { fontSize:32, fontWeight:"900", letterSpacing:-1 },
  priceReasoning: { color:C.text3, fontSize:12, lineHeight:17, marginBottom:8 },
  priceDetails:   { flexDirection:"row", gap:16 },
  priceDetail:    { color:C.text4, fontSize:12 },
  platformRow:    { flexDirection:"row", gap:10, alignItems:"center", marginBottom:8 },
  platformScore:  { width:40, height:40, borderRadius:10, alignItems:"center", justifyContent:"center" },
  platformScoreNum:{ fontSize:16, fontWeight:"900" },
  platformName:   { color:C.text1, fontSize:13, fontWeight:"700" },
  platformReason: { color:C.text4, fontSize:11, marginTop:1 },
  infoCard:       { borderWidth:1, borderColor:C.border, borderRadius:12, padding:14 },
  infoLabel:      { color:C.text3, fontSize:11, fontWeight:"800", textTransform:"uppercase" as any, letterSpacing:0.5, marginBottom:6 },
  infoTxt:        { color:C.text2, fontSize:13, lineHeight:18 },
  actionRow:      { flexDirection:"row", gap:10, marginBottom:8, alignItems:"flex-start" },
  actionNum:      { width:24, height:24, backgroundColor:C.green, borderRadius:12, alignItems:"center", justifyContent:"center" },
  actionNumTxt:   { color:C.greenDark, fontSize:12, fontWeight:"900" },
  actionTxt:      { color:C.text1, fontSize:13, flex:1, lineHeight:18 },
  copyBox:        { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, padding:14 },
  copyTxt:        { color:C.text1, fontSize:13, lineHeight:20 },
  copyHint:       { color:C.text4, fontSize:10, marginTop:4 },
  kwChip:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:100, paddingHorizontal:10, paddingVertical:5 },
  kwTxt:          { color:C.text2, fontSize:12 },
  cascadeRow:     { flexDirection:"row", gap:12, marginBottom:10, alignItems:"flex-start" },
  cascadeDayBox:  { backgroundColor:C.surface, borderRadius:8, paddingHorizontal:10, paddingTop:16, paddingBottom:10, minWidth:60, alignItems:"center" },
  cascadeDayNum:  { color:C.text3, fontSize:11, fontWeight:"700" },
  cascadeAction:  { color:C.text1, fontSize:13, lineHeight:18 },
  cascadePrice:   { color:C.green, fontSize:13, fontWeight:"700", marginTop:2 },
  bundleCard:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, marginBottom:8 },
  bundleHeader:   { flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:6 },
  bundleWith:     { color:C.text1, fontSize:13, fontWeight:"700", flex:1 },
  bundlePrice:    { fontSize:18, fontWeight:"900" },
  bundleReason:   { color:C.text3, fontSize:12, lineHeight:17 },
  emptyState:     { alignItems:"center", paddingVertical:40 },
  emptyTitle:     { color:C.text1, fontSize:16, fontWeight:"700", marginBottom:6 },
  emptySub:       { color:C.text3, fontSize:13, textAlign:"center" as any },
  newBtn:         { borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, alignItems:"center", marginTop:20 },
  newBtnTxt:      { color:C.text3, fontSize:14, fontWeight:"700" },
  lockedCard:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:18, padding:24, alignItems:"center" },
  lockedTitle:    { color:C.text1, fontSize:20, fontWeight:"900", marginBottom:10 },
  lockedBody:     { color:C.text3, fontSize:14, lineHeight:21, textAlign:"center" as any, marginBottom:20 },
  upgradeBtn:     { backgroundColor:C.green, borderRadius:13, padding:16, alignItems:"center", width:"100%" as any },
  upgradeBtnTxt:  { color:C.greenDark, fontSize:15, fontWeight:"900" } });
