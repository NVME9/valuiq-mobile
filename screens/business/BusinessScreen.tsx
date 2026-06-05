import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, Linking, TextInput, Animated, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

const WEAPONS = [
  {
    icon:"📋", name:"Manifest Beast",
    tagline:"5,000+ items. 4 hours. Done.",
    desc:"Upload, ANY manifest — PDF, photo, Excel, CSV, even a photo of a handwritten list. OCR extracts every line item. AI looks up eBay sold data and scores every single item. Returns top pulls, items to skip, and a branded PDF report. A pallet buyer used to spend 3 days on this.",
    wow:"Worth $500/month alone to any serious lot buyer.",
    color:"#ff8c42" },
  {
    icon:"🔮", name:"Pallet Prophet",
    tagline:"Know if a lot is worth it before you wire the money.",
    desc:"Input: category, condition grade, retail value, lot price. The, Prophet runs 90 days of eBay/Poshmark/Mercari sold data through its model and returns: expected sell-through rate, realistic profit range, timeline, best items to pull, and a clear BUY or PASS.",
    wow:"Prevents one bad $5,000 lot purchase = 5+ years of subscription paid.",
    color:"#b066ff" },
  {
    icon:"🤖", name:"Auto-Scout",
    tagline:"Your personal sourcing agent. Never sleeps.",
    desc:"Set your profile: budget, categories, minimum ROI, max buy price. Auto-Scout monitors all 17 sourcing platforms every hour. When it finds something that matches YOUR profile — not a generic deal, YOUR deal — it pushes you an instant alert with full analysis.",
    wow:"\"Found B-Stock electronics lot matching your profile: Score 91/100, $4,200 expected profit.\"",
    color:C.green },
  {
    icon:"📡", name:"Live, Market Pulse",
    tagline:"What's selling RIGHT, NOW. Not last week.",
    desc:"Real-time dashboard showing category heat maps, price momentum, supply shortage alerts, and demand spikes. When, Nike Dunk demand jumps 340% in a week, you know before your competition does. Updated hourly from actual sold data.",
    wow:"Time your buys perfectly. Buy when supply is high, sell when demand spikes.",
    color:"#00BF4D" },
  {
    icon:"💰", name:"Cash, Flow Oracle",
    tagline:"Know exactly when the money hits.",
    desc:"Input your inventory with buy prices. The, Oracle analyzes sell velocity per item and platform to forecast your cash flow for the next 30, 60, and 90 days. Flags slow movers that need price cuts to free cash. Tells you when to buy aggressively vs conserve.",
    wow:"\"You have $4,200 incoming in 30 days. These 8 items are blocking $2,100 — reprice them.\"",
    color:C.yellow },
  {
    icon:"🏹", name:"Competitor Destroyer",
    tagline:"Know exactly what your competition is doing.",
    desc:"Monitor specific eBay sellers in your niche. Track every price change they make in real time. Get alerted when they cut prices so you react first. See their sell-through rates, which items work for them, and where they're weak. Then move there.",
    wow:"The single biggest edge in any competitive resale category.",
    color:C.red },
  {
    icon:"👥", name:"Team, Command Center",
    tagline:"Scale your operation. Manage your crew.",
    desc:"Up to 10 team members with individual logins. Assign items to specific people to list. Track individual performance: scans per person, profit found, listings completed. Team leaderboard gamifies productivity. You see everything, employees see only their work.",
    wow:"Turn, ValuIQ into your entire team's operating system.",
    color:"#3665f3" },
  {
    icon:"🧠", name:"Flip, Intelligence Feed",
    tagline:"Gets smarter about YOUR business every week.",
    desc:"Learns what you sell from your scan history and results. Automatically surfaces the most relevant deals from all 17 sourcing platforms tuned specifically to your niche, price range, and profit targets. Gets dramatically better over 90 days.",
    wow:"Month 1 it's good. Month 3 it feels like it reads your mind.",
    color:C.orange },
  {
    icon:"📄", name:"White-Label, Reports",
    tagline:"Turn, ValuIQ into a service you charge for.",
    desc:"Generate beautifully branded PDF reports with YOUR company logo. Show clients what inventory you sourced, what it's worth, and what you recommend. Consignment stores, estate companies, and sourcing agencies charge $200-$500 per report. ValuIQ generates them in seconds.",
    wow:"Some, Business users make more from client reports than they pay in subscription fees.",
    color:"#8B6914" },
  {
    icon:"⚡", name:"Platform, Auto-List",
    tagline:"Scan it. Approve it. Listed. 30 seconds total.",
    desc:"After any scan, one tap generates an optimized listing: SEO title, full description, competitive price, correct category, all images organized. Direct integration with eBay and Poshmark. Tracks listing status back in your inventory automatically. Coming, Q3 2026.",
    wow:"Closes the entire resale loop inside one app. The holy grail.",
    color:"#FF3A50",
    comingSoon:true },
];

const FOUNDER_SPOTS_LEFT = 73; // update as people sign up,

export default function BusinessScreen({ token, plan, onNavigate, onBack }: Props) {
  const [tab, setTab] = useState<"weapons"|"roi"|"marketing">("weapons");
  const [revenue, setRevenue]   = useState("8000");
  const [lotCost, setLotCost]   = useState("500");
  const [lotsMonth, setLotsMonth] = useState("4");
  const [hours, setHours]       = useState("15");
  const [roiData, setRoiData]   = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [activeWeapon, setActiveWeapon] = useState<number|null>(null);
  const spotsAnim = useRef(new Animated.Value(1)).current;

  const isBusiness = plan === "business";

  useEffect(() => {
    // Pulse animation for spots counter,
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(spotsAnim, { toValue:1.05, duration:800, useNativeDriver:true }),
        Animated.timing(spotsAnim, { toValue:1, duration:800, useNativeDriver:true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  async function calculateROI() {
    setCalcLoading(true);
    try {
      const rev = parseFloat(revenue)||8000;
      const lotC = parseFloat(lotCost)||500;
      const lots = parseFloat(lotsMonth)||4;
      const hrs  = parseFloat(hours)||15;

      // Calculate what Business actually saves,
      const badLotLoss     = lots * lotC * 0.25;  // 25% of lots are bad without AI,
      const timeValue      = hrs * 4 * 35;         // 4 weeks * $35/hr value,
      const dealFinds      = 4 * lotC * 0.45;      // 4 extra deals * 45% margin,
      const manifestSaving = lots * 120;            // $120/lot in research time saved,
      const taxSaving      = Math.round(rev * 12 * 0.04 / 12); // 4% tax opt,
      const total          = badLotLoss + timeValue + dealFinds + manifestSaving + taxSaving;
      const roi            = Math.round(((total - 79) / 79) * 100);

      setRoiData({
        totalValue: Math.round(total),
        roi,
        breakdown: {
          "Bad lots avoided":       Math.round(badLotLoss),
          "Research time saved":    Math.round(timeValue),
          "Auto-Scout deal finds":  Math.round(dealFinds),
          "Manifest time savings":  Math.round(manifestSaving),
          "Tax optimization":       taxSaving },
        paybackHours: Math.round(79 / (total/730)),
        verdict: roi > 1000
          ? "ValuIQ, Business pays for itself in under 3 days."
          : roi > 500
          ? "Pays for itself in under a week."
          : "Pays for itself this month." });
    } catch {}
    setCalcLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>

      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>💼 ValuIQ Business</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* HERO */}
        <View style={s.hero}>
          <Animated.View style={[s.spotsRow, {transform:[{scale:spotsAnim}]}]}>
            <View style={s.spotsDot}/>
            <Text style={s.spotsTxt}>🔥 {FOUNDER_SPOTS_LEFT} founding member spots remaining</Text>
          </Animated.View>

          <Text style={s.heroTitle}>
            The resale intelligence platform for businesses doing serious volume.
          </Text>
          <Text style={s.heroSub}>
            Not a scanner. Not a calculator. A complete business operating system that sources deals, analyzes thousands of items, forecasts your cash flow, monitors your competition, and manages your team — automatically.
          </Text>

          <View style={s.pricingCards}>
            <View style={s.founderPriceCard}>
              <Text style={s.founderLabel}>🔒 Founding Member Rate</Text>
              <View style={s.founderPriceRow}>
                <Text style={s.founderPrice}>$79</Text>
                <Text style={s.founderPricePer}>/mo</Text>
              </View>
              <Text style={s.founderCrossed}>Regular price: $149/month</Text>
              <Text style={s.founderNote}>Locked forever. Never increases.</Text>
            </View>
            <View style={s.annualCard}>
              <Text style={s.annualLabel}>Annual Founding Rate</Text>
              <View style={s.founderPriceRow}>
                <Text style={[s.founderPrice,{color:C.yellow,fontSize:28}]}>$597</Text>
                <Text style={s.founderPricePer}>/yr</Text>
              </View>
              <Text style={s.founderCrossed}>Regular: $997/year</Text>
              <Text style={s.founderNote}>Save $400 + locked forever</Text>
            </View>
          </View>

          {!isBusiness && (
            <TouchableOpacity style={s.heroBtn}
              onPress={() => Linking.openURL(`${API_BASE}/pricing#business`)}>
              <Text style={s.heroBtnTxt}>Lock In $79/Month Now →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* TAB, BAR */}
        <View style={s.tabBar}>
          {([
            ["weapons","⚔️ 10 Weapons"],
            ["roi","💰 ROI, Calc"],
            ["marketing","📣 How, We Sell, You"],
          ] as const).map(([t,label]) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)}
              style={[s.tabBtn, tab===t && s.tabBtnActive]}>
              <Text style={[s.tabTxt, tab===t && s.tabTxtActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── WEAPONS, TAB ── */}
        {tab === "weapons" && (
          <View style={s.weaponsGrid}>
            <Text style={s.sectionTitle}>10 Weapons Nobody Else Has</Text>
            <Text style={s.sectionSub}>Tap any weapon to see exactly why it's game-changing</Text>
            {WEAPONS.map((w, i) => (
              <TouchableOpacity key={i}
                style={[s.weaponCard, {borderColor:w.color+"40"}, activeWeapon===i && {borderColor:w.color}]}
                onPress={() => setActiveWeapon(activeWeapon===i ? null : i)}
                activeOpacity={0.85}
              >
                {w.comingSoon && (
                  <View style={s.csChip}><Text style={s.csChipTxt}>COMING, SOON</Text></View>
                )}
                <View style={s.weaponHeader}>
                  <Text style={{fontSize:28}}>{w.icon}</Text>
                  <View style={{flex:1}}>
                    <Text style={[s.weaponName,{color:w.color}]}>{w.name}</Text>
                    <Text style={s.weaponTagline}>{w.tagline}</Text>
                  </View>
                  <Text style={[s.weaponChevron, activeWeapon===i && {color:w.color}]}>
                    {activeWeapon===i ? "▲" : "▼"}
                  </Text>
                </View>
                {activeWeapon === i && (
                  <View style={s.weaponExpanded}>
                    <Text style={s.weaponDesc}>{w.desc}</Text>
                    <View style={[s.wowBox,{backgroundColor:w.color+"15",borderColor:w.color+"40"}]}>
                      <Text style={[s.wowTxt,{color:w.color}]}>💡 {w.wow}</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── ROI, CALCULATOR TAB ── */}
        {tab === "roi" && (
          <View>
            <Text style={s.sectionTitle}>Is $79/Month Worth It For Your Business?</Text>
            <Text style={s.sectionSub}>Enter your real numbers. See your real ROI.</Text>

            <View style={s.calcCard}>
              <View style={s.inputGrid}>
                {[
                  ["Monthly, Revenue", revenue, setRevenue, "$", "5000"],
                  ["Avg, Lot/Item, Cost", lotCost, setLotCost, "$", "500"],
                  ["Lots, Bought/Month", lotsMonth, setLotsMonth, "#", "4"],
                  ["Hours/Week, Researching", hours, setHours, "h", "15"],
                ].map(([label, val, setter, prefix, placeholder]) => (
                  <View key={label as string} style={s.inputBox}>
                    <Text style={s.inputLabel}>{label as string}</Text>
                    <View style={s.inputRow}>
                      <Text style={s.inputPrefix}>{prefix as string}</Text>
                      <TextInput
                        style={s.inputField}
                        value={val as string}
                        onChangeText={setter as any}
                        keyboardType="numeric"
                        placeholder={placeholder as string}
                        placeholderTextColor={C.text4}
                      />
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={s.calcBtn} onPress={calculateROI} disabled={calcLoading}>
                {calcLoading
                  ? <ActivityIndicator color={C.greenDark} size="small"/>
                  : <Text style={s.calcBtnTxt}>Calculate My ROI →</Text>
                }
              </TouchableOpacity>
            </View>

            {roiData && (
              <View style={s.roiCard}>
                <View style={s.roiHero}>
                  <Text style={s.roiBigNum}>{roiData.roi}%</Text>
                  <Text style={s.roiLabel}>Return on Investment</Text>
                  <Text style={s.roiVerdict}>{roiData.verdict}</Text>
                </View>
                <View style={s.roiBreakdown}>
                  {Object.entries(roiData.breakdown).map(([label, val]) => (
                    <View key={label} style={s.roiRow}>
                      <Text style={s.roiRowLabel}>{label}</Text>
                      <Text style={[s.roiRowVal,{color:C.green}]}>+${val as number}/mo</Text>
                    </View>
                  ))}
                  <View style={s.roiTotal}>
                    <Text style={s.roiTotalLabel}>Total Monthly Value</Text>
                    <Text style={s.roiTotalVal}>${roiData.totalValue}/mo</Text>
                  </View>
                  <View style={[s.roiTotal,{borderTopWidth:0,marginTop:0}]}>
                    <Text style={s.roiTotalLabel}>Your Cost</Text>
                    <Text style={[s.roiTotalVal,{color:C.text3}]}>-$79/mo</Text>
                  </View>
                  <View style={[s.roiTotal,{backgroundColor:C.green+"15",borderRadius:10,padding:12,marginTop:8}]}>
                    <Text style={[s.roiTotalLabel,{color:C.green}]}>Net Monthly Gain</Text>
                    <Text style={[s.roiTotalVal,{color:C.green,fontSize:20}]}>${roiData.totalValue - 79}/mo</Text>
                  </View>
                </View>
                {!isBusiness && (
                  <TouchableOpacity style={s.calcCtaBtn}
                    onPress={() => Linking.openURL(`${API_BASE}/pricing#business`)}>
                    <Text style={s.calcCtaTxt}>Get $79/Month Locked In →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── MARKETING, TAB ── */}
        {tab === "marketing" && (
          <View>
            <Text style={s.sectionTitle}>How We Bring Business Users To You</Text>
            <Text style={s.sectionSub}>Fully automated. You do nothing.</Text>

            {[
              {
                icon:"📧", title:"Targeted, Email Campaigns",
                items:[
                  "Pro users get Business upgrade email at day 30",
                  "\"$50K lot analyzed in 4 hours\" case study sequence",
                  "ROI calculator email: 'See what you're leaving on the table'",
                  "Monthly win stories: 'Business user finds $8,400 profit this month'",
                ]
              },
              {
                icon:"🎯", title:"Precision, Ad Targeting",
                items:[
                  "Facebook: Liquidation buyer groups (100K+ members)",
                  "Facebook: eBay, Power Seller communities",
                  "LinkedIn: Amazon, FBA sellers, wholesale buyers",
                  "Reddit: r/flipping, r/liquidation (organic content)",
                ]
              },
              {
                icon:"🤝", title:"Platform, Partnerships",
                items:[
                  "B-Stock: 'Recommended tool for our buyers'",
                  "BULQ: Featured in their buyer newsletter",
                  "Direct, Liquidation: Co-marketing agreement",
                  "Estate sale platforms: Tool recommendation",
                ]
              },
              {
                icon:"📱", title:"Viral, Content Engine",
                items:[
                  "Auto-generate 'Manifest analyzed: $X profit found' posts",
                  "Business users share their ROI = social proof",
                  "Case study videos: real manifests, real results",
                  "Pallet Prophet accuracy tracking = credibility",
                ]
              },
            ].map((section, i) => (
              <View key={i} style={s.marketSection}>
                <View style={s.marketHeader}>
                  <Text style={{fontSize:22}}>{section.icon}</Text>
                  <Text style={s.marketTitle}>{section.title}</Text>
                </View>
                {section.items.map((item, j) => (
                  <View key={j} style={s.marketItem}>
                    <Text style={{color:C.green,fontSize:12}}>→</Text>
                    <Text style={s.marketItemTxt}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* BOTTOM, CTA */}
        {!isBusiness && (
          <View style={s.bottomCta}>
            <Animated.View style={{transform:[{scale:spotsAnim}]}}>
              <Text style={s.bottomSpots}>⚡ {FOUNDER_SPOTS_LEFT} founding spots left</Text>
            </Animated.View>
            <Text style={s.bottomCtaTitle}>Lock in $79/month. Forever.</Text>
            <Text style={s.bottomCtaSub}>Price never increases for founding members. After 100 subscribers it goes to $149 permanently.</Text>
            <TouchableOpacity style={s.bottomBtn}
              onPress={() => Linking.openURL(`${API_BASE}/pricing#business`)}>
              <Text style={s.bottomBtnTxt}>Become a Founding Member →</Text>
            </TouchableOpacity>
          </View>
        )}

        {isBusiness && (
          <View style={s.activeState}>
            <Text style={{fontSize:40,marginBottom:10}}>🏆</Text>
            <Text style={s.activeTxt}>You're a Business member.</Text>
            <Text style={s.activeSub}>All 10 weapons are unlocked. Your founding rate is locked forever.</Text>
          </View>
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
  navTitle:      {color:C.text1,fontSize:15,fontWeight:"800" as any},
  scroll:        {padding:16,paddingBottom:80},
  hero:          {backgroundColor:"#0d0800",borderWidth:1.5,borderColor:"#ff8c4230",borderRadius:20,padding:20,marginBottom:16},
  spotsRow:      {flexDirection:"row",alignItems:"center",gap:8,marginBottom:14,backgroundColor:"#ff8c4215",borderRadius:100,paddingHorizontal:14,paddingVertical:6,alignSelf:"flex-start" as any},
  spotsDot:      {width:8,height:8,borderRadius:4,backgroundColor:"#ff8c42"},
  spotsTxt:      {color:"#ff8c42",fontSize:12,fontWeight:"700" as any},
  heroTitle:     {color:C.text1,fontSize:20,fontWeight:"900" as any,letterSpacing:-0.5,marginBottom:10,lineHeight:26},
  heroSub:       {color:C.text3,fontSize:13,lineHeight:19,marginBottom:20},
  pricingCards:  {flexDirection:"row",gap:10,marginBottom:16},
  founderPriceCard:{flex:1,backgroundColor:"#1a0f00",borderWidth:1.5,borderColor:"#ff8c42",borderRadius:14,padding:14},
  founderLabel:  {color:"#ff8c42",fontSize:10,fontWeight:"800" as any,textTransform:"uppercase" as any,letterSpacing:0.5,marginBottom:8},
  founderPriceRow:{flexDirection:"row",alignItems:"baseline",gap:2},
  founderPrice:  {color:C.text1,fontSize:36,fontWeight:"900" as any,letterSpacing:-1},
  founderPricePer:{color:C.text4,fontSize:14},
  founderCrossed:{color:C.text4,fontSize:11,textDecorationLine:"line-through" as any,marginTop:4},
  founderNote:   {color:"#ff8c42",fontSize:10,fontWeight:"700" as any,marginTop:4},
  annualCard:    {flex:1,backgroundColor:"#0f0c00",borderWidth:1,borderColor:C.yellow+"40",borderRadius:14,padding:14},
  annualLabel:   {color:C.yellow,fontSize:10,fontWeight:"800" as any,textTransform:"uppercase" as any,letterSpacing:0.5,marginBottom:8},
  heroBtn:       {backgroundColor:"#ff8c42",borderRadius:14,padding:16,alignItems:"center"},
  heroBtnTxt:    {color:"#000",fontSize:15,fontWeight:"900" as any},
  tabBar:        {flexDirection:"row",backgroundColor:C.surface,borderRadius:12,padding:4,marginBottom:16,gap:4},
  tabBtn:        {flex:1,paddingVertical:9,borderRadius:9,alignItems:"center"},
  tabBtnActive:  {backgroundColor:"#ff8c42"},
  tabTxt:        {color:C.text4,fontSize:11,fontWeight:"600" as any,textAlign:"center" as any},
  tabTxtActive:  {color:"#000",fontWeight:"800" as any},
  weaponsGrid:   {gap:10},
  sectionTitle:  {color:C.text1,fontSize:16,fontWeight:"900" as any,marginBottom:4},
  sectionSub:    {color:C.text4,fontSize:12,marginBottom:14},
  weaponCard:    {backgroundColor:C.surface,borderWidth:1.5,borderRadius:14,padding:14,position:"relative" as any},
  csChip:        {position:"absolute" as any,top:10,right:10,backgroundColor:"#1a1a2e",borderRadius:100,paddingHorizontal:8,paddingVertical:3,borderWidth:1,borderColor:"#4040a0"},
  csChipTxt:     {color:"#8888ff",fontSize:8,fontWeight:"900" as any},
  weaponHeader:  {flexDirection:"row",alignItems:"center",gap:12},
  weaponName:    {fontSize:15,fontWeight:"900" as any,marginBottom:2},
  weaponTagline: {color:C.text3,fontSize:12,lineHeight:16},
  weaponChevron: {color:C.text4,fontSize:14},
  weaponExpanded:{marginTop:12,paddingTop:12,borderTopWidth:1,borderTopColor:C.border},
  weaponDesc:    {color:C.text2,fontSize:13,lineHeight:19,marginBottom:10},
  wowBox:        {borderWidth:1,borderRadius:10,padding:12},
  wowTxt:        {fontSize:13,fontWeight:"600" as any,lineHeight:18},
  calcCard:      {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:16,marginBottom:14},
  inputGrid:     {flexDirection:"row",flexWrap:"wrap" as any,gap:10,marginBottom:14},
  inputBox:      {width:"47%" as any},
  inputLabel:    {color:C.text4,fontSize:10,fontWeight:"700" as any,textTransform:"uppercase" as any,marginBottom:6,letterSpacing:0.5},
  inputRow:      {flexDirection:"row",alignItems:"center",backgroundColor:C.bg,borderWidth:1,borderColor:C.border,borderRadius:10,paddingHorizontal:10},
  inputPrefix:   {color:C.text4,fontSize:14,width:14},
  inputField:    {flex:1,color:C.text1,fontSize:15,padding:10,fontWeight:"700" as any},
  calcBtn:       {backgroundColor:"#ff8c42",borderRadius:12,padding:14,alignItems:"center"},
  calcBtnTxt:    {color:"#000",fontSize:14,fontWeight:"900" as any},
  roiCard:       {backgroundColor:C.surface,borderWidth:1,borderColor:"#ff8c4230",borderRadius:16,padding:16,marginBottom:16},
  roiHero:       {alignItems:"center",marginBottom:16,paddingBottom:16,borderBottomWidth:1,borderBottomColor:C.border},
  roiBigNum:     {color:"#ff8c42",fontSize:56,fontWeight:"900" as any,letterSpacing:-2},
  roiLabel:      {color:C.text4,fontSize:12,fontWeight:"700" as any,textTransform:"uppercase" as any,marginTop:4,letterSpacing:1},
  roiVerdict:    {color:C.text2,fontSize:13,marginTop:8,textAlign:"center" as any,lineHeight:18},
  roiBreakdown:  {},
  roiRow:        {flexDirection:"row",justifyContent:"space-between",paddingVertical:6,borderBottomWidth:1,borderBottomColor:C.border},
  roiRowLabel:   {color:C.text3,fontSize:13},
  roiRowVal:     {fontSize:13,fontWeight:"700" as any},
  roiTotal:      {flexDirection:"row",justifyContent:"space-between",paddingVertical:10,borderTopWidth:1,borderTopColor:C.border},
  roiTotalLabel: {color:C.text1,fontSize:14,fontWeight:"700" as any},
  roiTotalVal:   {fontSize:16,fontWeight:"900" as any,color:C.text1},
  calcCtaBtn:    {backgroundColor:"#ff8c42",borderRadius:12,padding:14,alignItems:"center",marginTop:14},
  calcCtaTxt:    {color:"#000",fontSize:14,fontWeight:"900" as any},
  marketSection: {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:14,marginBottom:10},
  marketHeader:  {flexDirection:"row",alignItems:"center",gap:10,marginBottom:12},
  marketTitle:   {color:C.text1,fontSize:14,fontWeight:"800" as any},
  marketItem:    {flexDirection:"row",gap:8,alignItems:"flex-start",marginBottom:7},
  marketItemTxt: {color:C.text3,fontSize:13,flex:1,lineHeight:18},
  bottomCta:     {backgroundColor:"#0d0800",borderWidth:2,borderColor:"#ff8c42",borderRadius:18,padding:20,alignItems:"center",marginTop:8},
  bottomSpots:   {color:"#ff8c42",fontSize:12,fontWeight:"800" as any,marginBottom:8},
  bottomCtaTitle:{color:C.text1,fontSize:20,fontWeight:"900" as any,textAlign:"center" as any,marginBottom:6},
  bottomCtaSub:  {color:C.text3,fontSize:13,textAlign:"center" as any,lineHeight:18,marginBottom:16},
  bottomBtn:     {backgroundColor:"#ff8c42",borderRadius:14,padding:16,alignItems:"center",width:"100%" as any},
  bottomBtnTxt:  {color:"#000",fontSize:15,fontWeight:"900" as any},
  activeState:   {backgroundColor:C.surface,borderWidth:1,borderColor:C.greenBorder,borderRadius:16,padding:24,alignItems:"center",marginTop:8},
  activeTxt:     {color:C.green,fontSize:18,fontWeight:"900" as any,marginBottom:4},
  activeSub:     {color:C.text3,fontSize:13,textAlign:"center" as any,lineHeight:18} });
