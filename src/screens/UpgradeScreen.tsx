import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

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
    missing:["More scans","Thrift Run","Death Pile","Deal Hunter AI"],
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
    missing:["Unlimited scans","Deal Hunter AI","Manifest Analyzer","AI tools"],
    cta:"Start Selling More →",
    priceId_monthly:"price_1TamT5Da11MSShNkgUW0ddQM",
    priceId_annual:"price_1Tan7yDa11MSShNkcqT3l3MX" },
  {
    id:"pro", tierLabel:"PRO", label:"🔥 Pro", price:"$34.99", sub:"/month", color:C.orange,
    annualPrice:"$259", annualSub:"/year", annualSavings:"Save $109",
    headline:"Where serious money is made",
    pitch:"Deal Hunter AI runs 24/7 across 17 platforms. One alert pays for 3 months. Plus 6 exclusive AI tools.",
    badge:"RECOMMENDED", badgeBg:C.orange,
    features:[
      "Unlimited scans",
      "Unlimited Price Battles",
      "🤖 Deal Hunter AI — 24/7, 17 platforms",
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
    id:"lifetime", tierLabel:"LIFETIME", label:"♾️ Lifetime", price:"$149", sub:"one-time", color:C.yellow,
    regularPrice:"$497",
    headline:"Pay once. Pro forever.",
    pitch:"$149 locks in everything in Pro — every AI tool, every future feature — no monthly fees, ever. At 100 subscribers this becomes $497.",
    badge:"EARLY BIRD", badgeBg:C.yellow, earlyBird:true,
    urgency:"⚡ Only available until 100 subscribers",
    features:[
      "Everything in Pro — forever",
      "No monthly fees — ever",
      "All future Pro features included",
      "All AI tools as they launch",
      "Price locked — never increases for you",
    ],
    missing:[],
    cta:"Get Lifetime Access →",
    priceId_monthly:"price_1TamWODa11MSShNkw1NxoRNL",
    priceId_annual:null },
  {
    id:"titan", tierLabel:"TITAN", label:"🔱 Titan", price:"$79", sub:"/month · intro rate", color:"#ff8c42",
    annualPrice:"$599", annualSub:"/year · intro rate", annualSavings:"Save $259",
    regularPrice:"$149/mo",
    headline:"The unfair advantage for serious volume.",
    pitch:"14 exclusive tools. Manifest Beast analyzes 5,000+ items overnight. Auto-Scout finds deals before anyone else sees them. AI, Listing Writer creates optimized listings automatically. Built for resellers doing real volume.",
    badge:"COMING SOON", badgeBg:"#ff8c42", isFounder:true, comingSoon:true,
    urgency:"🔥 First 50 subscribers lock in $79/mo forever — regular price $149/mo",
    features:[
      "Everything in Pro — unlimited",
      "📋 Manifest Beast — 5,000+ items overnight",
      "🤖 Auto-Scout — 24/7 personalized sourcing",
      "✍️ AI Listing Writer — auto-generate listings",
      "📸 Photo IQ — AI critiques your photos",
      "💨 Cash Velocity Score — $/day not $/item",
      "🎯 Condition Grader AI — photo to grade",
      "🗓️ Perfect Timing Engine — when to list",
      "📍 Source Intel Map — GPS profit tracking",
      "🔮 Pallet Prophet — predict lot ROI",
      "💀 Dead Stock Liquidator — auto-exit strategy",
      "📊 Auto Price Adjuster — monitors & reprices live listings",
      "🏹 Competitor Destroyer — monitor rivals",
      "👥 Team Center — up to 10 members",
      "🧾 Tax Export — Schedule C ready",
    ],
    missing:[],
    cta:"Join Founding Waitlist →",
    priceId_monthly:"price_1TccFjDa11MSShNknD0s3juW",
    priceId_annual:"price_1TanAWDa11MSShNk9GdeHg5n" },
];

export default function UpgradeScreen({ token, plan, onNavigate, onBack }: Props) {
  const [billing, setBilling] = useState<"monthly"|"annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number|null>(null);
  const [loading, setLoading] = useState<string|null>(null);

  const isPaid = plan !== "free";
  const isCurrent = (id: string) => plan === id;

  async function subscribe(priceId: string, planId: string) {
    if (!priceId) return;
    if (planId === "titan") {
      require("react-native").Linking.openURL("mailto:team@getvaluiq.com?subject=ValuIQ%20Titan%20Waitlist");
      return;
    }
    setLoading(planId);
    try {
      const r = await fetch(`${API_BASE}/api/create-checkout`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ token, priceId, plan: planId }) });
      const d = await r.json();
      if (d.url) {
        require("react-native").Linking.openURL(d.url);
      } else {
        Alert.alert("Error", d.error || "Could not start checkout");
      }
    } catch {
      Alert.alert("Error", "Check your connection and try again.");
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

        {/* ── BILLING, TOGGLE ── */}
        <View style={s.toggleWrap}>
          <View style={s.toggleRow}>
            <TouchableOpacity
              style={[s.toggleBtn, billing==="monthly" && s.toggleActive]}
              onPress={()=>setBilling("monthly")}
            >
              <Text style={[s.toggleTxt, billing==="monthly" && s.toggleActiveTxt]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, billing==="annual" && s.toggleActive]}
              onPress={()=>setBilling("annual")}
            >
              <Text style={[s.toggleTxt, billing==="annual" && s.toggleActiveTxt]}>Annual</Text>
              {billing==="annual" && <Text style={[s.toggleActiveTxt, {fontSize:10}]}> · 2 mo free</Text>}
            </TouchableOpacity>
          </View>
          {billing==="monthly" && (
            <TouchableOpacity onPress={()=>setBilling("annual")}>
              <Text style={s.switchAnnualHint}>Switch to annual and get 2 months free →</Text>
            </TouchableOpacity>
          )}
        </View>

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
              {borderColor: p.color+(p.badge?"":" 30")},
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
                      {p.id==="lifetime" ? (p as any).regularPrice : (p as any).regularPrice} regular,
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
            { q:"Does Lifetime include future features?", a:"Yes. Every feature we add to the Pro tier is automatically included in your Lifetime plan, forever, at no extra cost." },
            { q:"When does Titan launch?", a:"Coming Q3 2026. Join the waitlist to lock in the $79/month Titan founding rate — it goes to $149/month after the first 50 subscribers." },
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
          <Text style={s.footerTxt}>🔒 Secured by Stripe · 256-bit encryption</Text>
          <Text style={s.footerTxt}>
            <Text onPress={()=>require("react-native").Linking.openURL("https://getvaluiq.com/terms")} style={{color:C.green}}>Terms of Service</Text> · <Text onPress={()=>require("react-native").Linking.openURL("mailto:team@getvaluiq.com")} style={{color:C.green}}>Contact Support</Text>
          </Text>
          <Text style={s.footerTxt}>Cancel anytime · manage from your Profile</Text>
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
  footerTxt:       { color:C.text4, fontSize:11, textAlign:"center" as any, lineHeight:17 },
  footer:          { color:C.text4, fontSize:11, textAlign:"center" as any, marginTop:8, lineHeight:18 } });
