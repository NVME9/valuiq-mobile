import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";
import { configurePurchases, getOfferings, purchasePackage, restorePurchases, refreshEntitlements } from "../lib/purchases";

interface Props {
  token: string; plan: string;
  onNavigate: (s: string) => void; onBack?: () => void;
}

const PLANS = [
  {
    id:"free", tierLabel:"FREE", label:"Free", price:"$0", sub:"Forever free", color:C.text3,
    headline:"See what you've been missing",
    pitch:"10 free scans, no credit card. Most users find their first profitable flip within 3 scans.",
    badge:null,
    features:["10 scans per month","3 Price Battles per month","Community feed","Basic profit calculator"],
    missing:["More scans","Thrift Run","Death Pile"],
    cta:null, priceId_monthly:null, priceId_annual:null },
  {
    id:"seller", tierLabel:"SELLER", label:"💪 Seller", price:"$14.99", sub:"/month", color:C.green,
    annualPrice:"$109", annualSub:"/year", annualSavings:"Save $79",
    headline:"For resellers who flip every week",
    pitch:"One profitable flip pays for 3 months. 75 scans, Thrift Run, Death Pile, Auto-Relist, Hot Now.",
    badge:"MOST POPULAR", badgeBg:C.green,
    features:[
      "75 scans per month",
      "10 Price Battles per month",
      "Thrift Run — 5 sessions/month",
      "Death Pile Rescue — 5/month",
      "Auto-Relist — 20 listings/month",
      "Hot Right Now — weekly trends",
      "Inventory — up to 50 items",
    ],
    missing:["Unlimited scans","Manifest Analyzer","AI tools"],
    cta:"Start Selling More →",
    priceId_monthly:"price_1TamT5Da11MSShNkgUW0ddQM",
    priceId_annual:"price_1Tan7yDa11MSShNkcqT3l3MX" },
  {
    id:"pro", tierLabel:"PRO", label:"🔥 Pro", price:"$34.99", sub:"/month", color:C.orange,
    annualPrice:"$259", annualSub:"/year", annualSavings:"Save $109",
    headline:"Where serious money is made",
    pitch:"Unlimited scans plus the full Specialty Scanner for sneakers, watches, handbags, trading cards and more. Dealer-grade appraisals on every category.",
    badge:"RECOMMENDED", badgeBg:C.orange,
    features:[
      "Unlimited scans",
      "Unlimited Price Battles",
      "📋 Manifest Analyzer — 10/month",
      "🎯 Specialty Scanner — unlimited",
      "📈 Arbitrage Finder — unlimited",
      "🧠 AI Coach + Profit Tracker",
      "⚡ True Hourly Rate (AI)",
      "⚡ Max Value Finder (AI)",
      "⚡ Safe To Sell (AI)",
      "⚡ Trend Predictor (AI)",
      "⚡ Flip Content Studio (AI)",
      "⚡ Return Rate Predictor (AI)",
    ],
    missing:[],
    cta:"Unlock Pro →",
    priceId_monthly:"price_1TamU7Da11MSShNkVbs7o6Pf",
    priceId_annual:"price_1Tan96Da11MSShNknDTWp54n" },
  {
    id:"titan", tierLabel:"TITAN", label:"Titan", price:"$79", sub:"/month", color:"#ff8c42",
    annualPrice:"$790", annualSub:"/year", annualSavings:"2 months free",
    regularPrice:"$149/mo",
    headline:"Built for serious volume.",
    pitch:"Everything in Pro plus the business suite: score whole liquidation lots, spot over-graded vendors, and run your numbers like a real operation.",
    badge:"FOUNDER RATE", badgeBg:"#ff8c42", isFounder:true,
    features:[
      "Everything in Pro - unlimited",
      "Manifest Beast - score whole lots, get your max bid",
      "Vendor Intelligence - spot over-graded liquidation lots",
      "Competitor Intel - analyze top sellers in your category",
      "Trend Predictor - what's heating up and when to sell",
      "Fake Detector - authenticate before you list",
      "Reseller CFO - true margins, cash flow, tax set-aside",
      "Tax Export - Schedule C ready",
      "Sourcing Intel - market briefs on any item",
      "Bundle Builder - move dead stock fast",
    ],
    missing:[],
    cta:"Unlock Titan" },
  {
    id:"lifetime", tierLabel:"LIFETIME", label:"Lifetime", price:"$149", sub:"one-time", color:C.yellow,
    regularPrice:"$497",
    headline:"Pay once. Everything forever.",
    pitch:"One payment locks in full access - every tool in Titan, every future feature, no monthly fees ever. Capped at the first 100 founders, then it becomes $497.",
    badge:"EARLY BIRD", badgeBg:C.yellow, earlyBird:true,
    urgency:"Only available until 100 founders",
    features:[
      "Everything in Titan - forever",
      "All business tools (Manifest Beast, Vendor Intel, CFO)",
      "Every future feature, no monthly fees",
      "Founder pricing locked permanently",
    ],
    missing:[],
    cta:"Become a Founder" },
];

export default function UpgradeScreen({ token, plan, onNavigate, onBack }: Props) {
  const [billing, setBilling] = useState<"monthly"|"annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number|null>(null);
  const [loading, setLoading] = useState<string|null>(null);

  const isPaid = plan !== "free";
  const isCurrent = (id: string) => plan === id;
  React.useEffect(() => { try { configurePurchases(); refreshEntitlements(token); } catch {} }, []);

  async function subscribe(priceId: string, planId: string) {
    // Native Apple In-App Purchase via RevenueCat (no external checkout).
    if (planId === "free") return;
    setLoading(planId);
    try {
      const offering = await getOfferings();
      if (!offering) { Alert.alert("Unavailable", "Plans are loading. Please try again in a moment."); setLoading(null); return; }
      const wanted =
        planId === "titan" ? `com.valuiq.titan.${(billing === "annual") ? "annual" : "monthly"}` :
        planId === "pro" ? `com.valuiq.pro.${(billing === "annual") ? "annual" : "monthly"}` :
        planId === "seller" ? `com.valuiq.seller.${(billing === "annual") ? "annual" : "monthly"}` :
        planId === "lifetime" ? "com.valuiq.lifetime" : "";
      const pkg = offering.availablePackages.find(
        (pk: any) => pk.product?.identifier === wanted
      ) || offering.availablePackages.find(
        (pk: any) => (pk.product?.identifier || "").includes(planId)
      );
      if (!pkg) { Alert.alert("Unavailable", "This plan isn't available right now."); setLoading(null); return; }
      const res = await purchasePackage(token, pkg);
      if (res.cancelled) { setLoading(null); return; }
      if (res.plan && res.plan !== "free") {
        Alert.alert("You're in!", "Your plan is now active. Enjoy ValuIQ!", [
          { text: "OK", onPress: () => onNavigate("dashboard") }
        ]);
      } else {
        Alert.alert("Purchase issue", "We couldn't confirm the purchase. If you were charged, tap Restore Purchases.");
      }
    } catch (e: any) {
      Alert.alert("Purchase failed", e?.message || "Please try again.");
    }
    setLoading(null);
  }

  async function handleRestore() {
    setLoading("restore");
    try {
      const restored = await restorePurchases(token);
      if (restored && restored !== "free") {
        Alert.alert("Restored", "Your plan is active again.", [
          { text: "OK", onPress: () => onNavigate("dashboard") }
        ]);
      } else {
        Alert.alert("Nothing to restore", "We didn't find a previous purchase on this Apple ID.");
      }
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message || "Please try again.");
    }
    setLoading(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity style={s.backBtn} onPress={onBack||(() => onNavigate("dashboard"))}>
          <Text style={s.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Choose Your Plan</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Upgrade ValuIQ</Text>
        <Text style={s.sub}>No contracts. Cancel anytime. Not happy? Email team@getvaluiq.com within 7 days.</Text>

        {/* RESTORE PURCHASES (Apple-required) */}
        <TouchableOpacity onPress={handleRestore} disabled={loading==="restore"} style={s.restoreBtn}>
          <Text style={s.restoreTxt}>{loading==="restore" ? "Restoring..." : "Restore Purchases"}</Text>
        </TouchableOpacity>
        {/* ── PLAN, CARDS ── */}
        {PLANS.filter(p => !(p as any).comingSoon).map(p => {
          const cur = isCurrent(p.id);
          const showAnnual = billing==="annual" && p.id!=="free" && p.id!=="lifetime";
          const displayPrice = showAnnual ? (p as any).annualPrice : p.price;
          const displaySub   = showAnnual ? (p as any).annualSub   : p.sub;
          const priceId = showAnnual
            ? ((p as any).priceId_annual || (p as any).priceId_monthly)
            : (p as any).priceId_monthly;

          return (
            <View key={p.id} style={[
              s.card,
              {borderColor: p.badge ? p.color : p.color+"30"},
              p.badge && !cur && s.highlightCard,
              cur && s.currentCard,
              p.id==="titan" && s.businessCard,
            ]}>

              {/* Tier label at top */}
              <View style={[s.tierLabelRow, {backgroundColor: p.color+"20"}]}>
                <Text style={[s.tierLabel, {color: p.color}]}>{(p as any).tierLabel}</Text>
                {cur && <Text style={[s.tierStatusBadge, {backgroundColor:C.text3}]}>YOUR PLAN</Text>}
                {!cur && (p as any).badge && (
                  <Text style={[s.tierStatusBadge, {backgroundColor:(p as any).badgeBg, color: p.id==="lifetime"?"#000":"#000"}]}>
                    {(p as any).badge}
                  </Text>
                )}
              </View>

              {/* Urgency banner for early bird / founder */}
              {(p as any).urgency && !cur && (
                <View style={[s.urgencyBanner, {borderColor: p.color+"60", backgroundColor: p.color+"12"}]}>
                  <Text style={[s.urgencyTxt, {color: p.color}]}>{(p as any).urgency}</Text>
                </View>
              )}

              {/* Headline */}
              <Text style={[s.planHeadline, {color: p.color}]}>{(p as any).headline}</Text>
              <Text style={s.planPitch}>{(p as any).pitch}</Text>

              {/* Price */}
              <View style={s.priceRow}>
                <View style={s.priceLeft}>
                  {(p as any).regularPrice && (
                    <Text style={s.crossedPrice}>
                      {(p as any).regularPrice} regular
                    </Text>
                  )}
                  {showAnnual && (p as any).annualSavings && (
                    <Text style={s.crossedPrice}>${(parseFloat(displayPrice?.replace("$","")??0)*12).toFixed(0)}/yr regular</Text>
                  )}
                  <Text style={[s.price, {color: p.color}]}>{displayPrice}</Text>
                  <Text style={s.priceSub}>{displaySub}</Text>
                  {showAnnual && (p as any).annualSavings && (
                    <View style={[s.savingsBadge, {backgroundColor: p.color+"25", borderColor: p.color+"50"}]}>
                      <Text style={[s.savingsTxt, {color: p.color}]}>{(p as any).annualSavings}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Features */}
              <View style={s.features}>
                {p.features.map((f,i) => (
                  <View key={i} style={s.featureRow}>
                    <Text style={[s.featureCheck, {color: p.color}]}>✓</Text>
                    <Text style={s.featureTxt}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              {p.cta && !cur && (
                <TouchableOpacity
                  style={[s.cta, {backgroundColor: p.color, opacity: loading===p.id ? 0.7 : 1}]}
                  onPress={() => subscribe(priceId, p.id)}
                  disabled={!!loading}
                  activeOpacity={0.85}
                >
                  {loading===p.id
                    ? <ActivityIndicator color="#000" size="small"/>
                    : <Text style={s.ctaTxt}>{p.cta}</Text>
                  }
                </TouchableOpacity>
              )}
              {cur && (
                <View style={[s.cta, {backgroundColor:C.surface}]}>
                  <Text style={[s.ctaTxt, {color:C.text3}]}>✓ Your Current Plan</Text>
                </View>
              )}
            </View>
          );
        })}

        
        {/* ── FAQ ── */}
        <View style={s.faqSection}>
          <Text style={s.faqTitle}>Common Questions</Text>
          {[
            { q:"Can I cancel anytime?", a:"Yes. Email team@getvaluiq.com and we cancel immediately. No penalties, no questions asked." },
            { q:"What happens to my data if I cancel?", a:"Your scan history and inventory stay in your account. You keep access until the end of your billing period." },
            { q:"Is the profit data accurate?", a:"ValuIQ uses real sold listing data from eBay and other platforms. Results are estimates — actual prices vary by condition, timing, and demand." },
            { q:"What does Lifetime include?", a:"Lifetime gives you everything in the Pro tier, one time, with no monthly fees." },
            { q:"How does the 7-day guarantee work?", a:"If you're not happy in your first 7 days, email team@getvaluiq.com and we'll refund you. No forms, no hassle." },
          ].map((faq, i) => (
            <TouchableOpacity key={i} style={s.faqItem} onPress={() => setOpenFaq(openFaq === i ? null : i)} activeOpacity={0.8}>
              <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center"}}>
                <Text style={[s.faqQ, {flex:1, marginBottom:0}]}>{faq.q}</Text>
                <Text style={{color:C.text4, fontSize:18, marginLeft:8}}>{openFaq === i ? "▲" : "▼"}</Text>
              </View>
              {openFaq === i && <Text style={[s.faqA, {marginTop:8}]}>{faq.a}</Text>}
            </TouchableOpacity>
          ))}
        </View>

<View style={s.footerBox}>
          <Text style={s.footerTerms}>
            Seller ($14.99/month) and Pro ($34.99/month) are auto-renewable subscriptions. Lifetime ($149) is a one-time purchase. Payment is charged to your Apple ID at confirmation. Subscriptions automatically renew at the same price unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your App Store account settings.
          </Text>
          <Text style={s.footerTxt}>
            <Text onPress={()=>require("react-native").Linking.openURL("https://www.getvaluiq.com/terms")} style={{color:C.green}}>Terms of Use (EULA)</Text>
            {"  |  "}
            <Text onPress={()=>require("react-native").Linking.openURL("https://www.getvaluiq.com/privacy")} style={{color:C.green}}>Privacy Policy</Text>
          </Text>
          <Text style={s.footerTxt}>
            <Text onPress={()=>require("react-native").Linking.openURL("mailto:team@getvaluiq.com")} style={{color:C.green}}>Contact Support</Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:            { flex:1, backgroundColor:C.bg },
  nav:             { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, borderBottomWidth:1, borderBottomColor:C.border },
  backBtn:         { width:36, height:36, justifyContent:"center" },
  backTxt:         { color:C.text1, fontSize:14, fontWeight:"600" as any },
  navTitle:        { color:C.text1, fontSize:16, fontWeight:"800" as any },
  scroll:          { padding:16, paddingBottom:80 },
  headline:        { color:C.text1, fontSize:24, fontWeight:"900" as any, letterSpacing:-0.5, marginBottom:6 },
  sub:             { color:C.text3, fontSize:13, lineHeight:18, marginBottom:20 },

  // Toggle,
  toggleWrap:      { marginBottom:20 },
  toggleRow:       { flexDirection:"row" as any, backgroundColor:"#0a1500", borderRadius:14, padding:5, gap:4, borderWidth:2, borderColor:C.greenBorder },
  toggleBtn:       { flex:1, paddingTop:16, paddingBottom:10, borderRadius:10, alignItems:"center" as any, justifyContent:"center" as any, flexDirection:"row" as any, gap:4 },
  toggleActive:    { backgroundColor:C.green },
  toggleTxt:       { color:C.text3, fontSize:14, fontWeight:"700" as any },
  toggleActiveTxt: { color:C.greenDark, fontSize:13, fontWeight:"900" as any },
  switchAnnualHint:{ color:C.green, fontSize:12, textAlign:"center" as any, marginTop:8, fontWeight:"600" as any },
  restoreBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18, marginBottom: 8 },
  restoreTxt: { color: "#a09b94", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },

  // Card,
  card:            { backgroundColor:C.surface, borderWidth:1.5, borderRadius:18, marginBottom:16 },
  highlightCard:   { borderWidth:2 },
  currentCard:     { opacity:0.75 },
  businessCard:    { backgroundColor:"#0d0800" },

  // Tier label row at top,
  tierLabelRow:    { flexDirection:"row" as any, alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, paddingTop:16, paddingBottom:10, marginBottom:0, borderTopLeftRadius:16, borderTopRightRadius:16 },
  tierLabel:       { fontSize:10, fontWeight:"900" as any, letterSpacing:2 },
  tierStatusBadge: { fontSize:9, fontWeight:"900" as any, color:"#000", paddingHorizontal:10, paddingTop:16, paddingBottom:10, borderRadius:100, letterSpacing:0.5 },

  // Urgency,
  urgencyBanner:   { marginHorizontal:16, marginTop:10, borderWidth:1, borderRadius:10, padding:10 },
  urgencyTxt:      { fontSize:12, fontWeight:"700" as any, textAlign:"center" as any, lineHeight:17 },

  // Content,
  planHeadline:    { fontSize:17, fontWeight:"900" as any, letterSpacing:-0.3, marginHorizontal:16, marginTop:12, marginBottom:4 },
  planPitch:       { fontSize:12, color:C.text3, lineHeight:17, marginHorizontal:16, marginBottom:14 },

  // Price,
  priceRow:        { marginHorizontal:16, marginBottom:14 },
  priceLeft:       { },
  crossedPrice:    { color:C.text4, fontSize:12, textDecorationLine:"line-through" as any, marginBottom:2 },
  price:           { fontSize:34, fontWeight:"900" as any, letterSpacing:-1, lineHeight:38 },
  priceSub:        { color:C.text4, fontSize:12, marginTop:2 },
  savingsBadge:    { alignSelf:"flex-start" as any, borderWidth:1, borderRadius:100, paddingHorizontal:10, paddingTop:16, paddingBottom:10, marginTop:6 },
  savingsTxt:      { fontSize:11, fontWeight:"700" as any },

  // Features,
  features:        { gap:7, marginHorizontal:16, marginBottom:16 },
  featureRow:      { flexDirection:"row" as any, gap:8, alignItems:"flex-start" },
  featureCheck:    { fontSize:13, fontWeight:"700" as any, width:16, marginTop:1 },
  featureTxt:      { color:C.text2, fontSize:13, flex:1, lineHeight:18 },

  // CTA,
  cta:             { marginHorizontal:16, marginBottom:16, borderRadius:12, paddingTop:16, paddingBottom:10, alignItems:"center" as any },
  ctaTxt:          { fontSize:15, fontWeight:"900" as any, color:"#000" },

  faqSection:    { marginTop:8, marginBottom:4 },
  faqTitle:      { color:C.text1, fontSize:15, fontWeight:"800" as any, marginBottom:12 },
  faqItem:       { backgroundColor:C.surface, borderRadius:12, padding:14, marginBottom:8, borderWidth:1, borderColor:C.border },
  faqQ:          { color:C.text1, fontSize:13, fontWeight:"700" as any, marginBottom:4 },
  faqA:          { color:C.text3, fontSize:12, lineHeight:18 },
  footerBox:       { marginTop:16, padding:14, backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.border, gap:6 },
    footerTerms:     { color:C.text4, fontSize:11, lineHeight:16, textAlign:"center" as any, marginBottom:12 },
  footerTxt:       { color:C.text4, fontSize:11, textAlign:"center" as any, lineHeight:17 },
  footer:          { color:C.text4, fontSize:11, textAlign:"center" as any, marginTop:8, lineHeight:18 } });