import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Linking, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; onNavigate:(s:string)=>void; onBack?:()=>void; }

const PLANS = [
  {
    id:"free", label:"Free", price:"$0", sub:"Forever free", color:C.text3,
    features:["10 scans per month","5 Price Battles","Community feed access","Basic profit calculator"],
    missing:["Thrift Run","Death Pile Rescuer","Auto-Relister","Deal Hunter AI","Manifest Analyzer"],
    cta:null,
  },
  {
    id:"seller", label:"💪 Seller", price:"$19", sub:"per month", color:C.green, popular:false,
    annualPrice:"$139", annualRegular:"$228", annualSub:"per year — save $89",
    features:["100 scans per month","30 Price Battles per month","10 Thrift Run sessions","10 Death Pile rescues","20 Auto-Relists","50 inventory items","Hot Right Now access"],
    missing:["Deal Hunter AI","Manifest Analyzer","Arbitrage Search","Specialty Scanner"],
    cta:"Get Seller",
    priceId_monthly:"price_1TYE6mDa11MSShNkJ2kk66sh",
    priceId_annual:"price_1TY3J9Da11MSShNkTeL8tebq",
  },
  {
    id:"pro", label:"🔥 Pro", price:"$49", sub:"per month", color:C.orange, popular:true,
    annualPrice:"$197", annualRegular:"$349", annualSub:"🔥 Early bird — first 100 users only",
    features:["Unlimited scans","Unlimited Price Battles","Unlimited Thrift Run","Unlimited Death Pile","Unlimited Auto-Relist","Unlimited Inventory","Deal Hunter AI — 17 sources","Manifest Analyzer","Arbitrage Search","Bundle Builder","Specialty Scanner (8 categories)","AI Coach","Sourcing Alerts","Priority deal alerts"],
    cta:"Get Pro",
    priceId_monthly:"price_1TYE7tDa11MSShNkHRasef2t",
    priceId_annual:"price_1TY3KNDa11MSShNkZtmBa71u",
  },
  {
    id:"lifetime", label:"♾️ Lifetime", price:"$197", sub:"one-time payment", color:C.yellow, earlyBird:true,
    regularPrice:"$497",
    features:["Everything in Pro — forever","No monthly fees ever","All future features included","Price rises at 100 subscribers"],
    cta:"Get Lifetime Access",
    priceId:"price_1TYE9NDa11MSShNkGlOw6GrN",
  },
  {
    id:"business", label:"💼 Business", price:"$49", sub:"per month — locked forever", color:"#ff8c42",
    introNote:"🔥 Founding member rate — first 50 subscribers only. Price NEVER increases.",
    regularPrice:"$149",
    annualPrice:"$397", annualRegular:"$997", annualSub:"per year — founding member rate",
    features:[
      "Everything in Pro — unlimited",
      "🆕 Manifest Beast — analyze 5,000+ items",
      "🆕 Pallet Prophet — predict lot ROI before buying",
      "🆕 Auto-Scout — 24/7 personalized sourcing agent",
      "🆕 Live Market Pulse — real-time demand intel",
      "🆕 Cash Flow Oracle — 30/60/90 day forecasting",
      "🆕 Competitor Destroyer — monitor rival sellers",
      "🆕 Team Command Center — up to 10 members",
      "🆕 Flip Intelligence Feed — learns your niche",
      "🆕 White-Label Client Reports",
      "🆕 Platform Auto-List (coming)",
      "Dedicated support line",
    ],
    cta:"Lock In Founding Rate — $79/mo",
    isFounder:true,
    priceId_monthly:"price_business_monthly",
    priceId_annual:"price_business_annual",
  },
];

export default function UpgradeScreen({ token, plan, onNavigate, onBack }: Props) {
  const [billing, setBilling] = useState<"monthly"|"annual">("monthly");
  const [loading, setLoading] = useState<string|null>(null);

  async function checkout(planId: string, priceId: string) {
    if (!token) { onNavigate("scanner"); return; }
    setLoading(planId);
    try {
      const r = await fetch(`${API_BASE}/api/create-checkout`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ plan: planId, priceId, userToken: token }),
      });
      const d = await r.json();
      if (d.url) await Linking.openURL(d.url);
    } catch {}
    setLoading(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.backBtn}><Text style={s.backTxt}>←</Text></TouchableOpacity>
        <Text style={s.navTitle}>Choose Your Plan</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.headline}>Start free. Upgrade when you're ready.</Text>
        <Text style={s.sub}>No contracts. Cancel anytime. All plans include a 30-day money-back guarantee.</Text>

        {/* Billing toggle */}
        <View style={s.toggleRow}>
          <TouchableOpacity style={[s.toggleBtn, billing==="monthly"&&s.toggleActive]} onPress={()=>setBilling("monthly")}>
            <Text style={[s.toggleTxt, billing==="monthly"&&s.toggleActiveTxt]}>Monthly</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.toggleBtn, billing==="annual"&&s.toggleActive]} onPress={()=>setBilling("annual")}>
            <Text style={[s.toggleTxt, billing==="annual"&&s.toggleActiveTxt]}>Annual</Text>
            <View style={s.saveBadge}><Text style={s.saveTxt}>Save up to $439</Text></View>
          </TouchableOpacity>
        </View>

        {PLANS.map(p => {
          const isCurrent = plan === p.id;
          const isPopular = (p as any).popular;
          const isEarlyBird = (p as any).earlyBird;
          const showAnnual = billing === "annual" && p.id !== "free" && p.id !== "lifetime";
          const displayPrice = showAnnual ? (p as any).annualPrice : p.price;
          const displaySub = showAnnual ? (p as any).annualSub : p.sub;
          const priceId = p.id === "lifetime"
            ? (p as any).priceId
            : showAnnual ? (p as any).priceId_annual : (p as any).priceId_monthly;

          const isFounder = (p as any).isFounder;
          return (
            <View key={p.id} style={[s.card, {borderColor:p.color+(isPopular||isFounder?"":"30")}, isPopular&&s.popularCard, isFounder&&s.founderCard, isCurrent&&s.currentCard]}>
              {isFounder && !isCurrent && <View style={[s.popularBadge,{backgroundColor:"#ff8c42"}]}><Text style={s.popularTxt}>🔥 FOUNDING MEMBER RATE</Text></View>}
              {isPopular && !isFounder && <View style={[s.popularBadge,{backgroundColor:p.color}]}><Text style={s.popularTxt}>MOST POPULAR</Text></View>}
              {isEarlyBird && <View style={[s.popularBadge,{backgroundColor:p.color}]}><Text style={s.popularTxt}>EARLY BIRD PRICE</Text></View>}
              {isCurrent && <View style={[s.popularBadge,{backgroundColor:C.text3}]}><Text style={s.popularTxt}>YOUR PLAN</Text></View>}

              {(p as any).introNote && !isCurrent && (
                <View style={[s.introNoteBanner,{backgroundColor:"#ff8c4215"}]}>
                  <Text style={s.introNoteTxt}>{(p as any).introNote}</Text>
                </View>
              )}
              <View style={s.cardHeader}>
                <Text style={[s.planName,{color:p.color}]}>{p.label}</Text>
                <View style={s.priceBlock}>
                  {/* Show crossed out regular price for annual or lifetime */}
                  {showAnnual && (p as any).annualRegular && (
                    <Text style={s.crossedPrice}>{(p as any).annualRegular}/yr</Text>
                  )}
                  {isEarlyBird && (p as any).regularPrice && (
                    <Text style={s.crossedPrice}>{(p as any).regularPrice}</Text>
                  )}
                  <Text style={[s.price,{color:p.color}]}>{displayPrice}</Text>
                  <Text style={s.priceSub}>{displaySub}</Text>
                </View>
              </View>

              {/* Features */}
              <View style={s.features}>
                {p.features.map((f,i)=>(
                  <View key={i} style={s.featureRow}>
                    <Text style={[s.featureCheck,{color:p.color}]}>✓</Text>
                    <Text style={s.featureTxt}>{f}</Text>
                  </View>
                ))}
                {(p as any).missing?.map((f:string,i:number)=>(
                  <View key={`m${i}`} style={s.featureRow}>
                    <Text style={s.featureMissing}>✗</Text>
                    <Text style={s.featureMissingTxt}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* CTA */}
              {p.cta && !isCurrent && (
                <TouchableOpacity
                  style={[s.cta,{backgroundColor:p.color}, loading===p.id&&{opacity:0.7}]}
                  onPress={()=>checkout(p.id, priceId)}
                  disabled={loading===p.id}
                >
                  {loading===p.id
                    ? <ActivityIndicator color="#000" size="small"/>
                    : <Text style={s.ctaTxt}>{p.cta} →</Text>
                  }
                </TouchableOpacity>
              )}
              {isCurrent && (
                <View style={s.currentBadge}><Text style={s.currentBadgeTxt}>✓ Active Plan</Text></View>
              )}
            </View>
          );
        })}

        <Text style={s.legal}>
          By subscribing you agree to our{" "}
          <Text style={s.legalLink} onPress={()=>Linking.openURL(`${API_BASE}/terms`)}>Terms of Service</Text>
          . All sales are final. No refunds except where required by law. Subscription renews automatically — cancel anytime in your account settings. ValuIQ provides resale estimates for informational purposes only and does not guarantee profit. Market data may be inaccurate or outdated.
        </Text>
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
  scroll:       {padding:20,paddingBottom:60},
  headline:     {color:C.text1,fontSize:22,fontWeight:"900" as any,letterSpacing:-0.5,marginBottom:8},
  sub:          {color:C.text3,fontSize:13,lineHeight:19,marginBottom:20},
  toggleRow:    {flexDirection:"row",backgroundColor:C.surface,borderRadius:12,padding:4,marginBottom:20,gap:4},
  toggleBtn:    {flex:1,paddingVertical:10,borderRadius:9,alignItems:"center" as any,flexDirection:"row",justifyContent:"center" as any,gap:6},
  toggleActive: {backgroundColor:C.bg,borderWidth:1,borderColor:C.border},
  toggleTxt:    {color:C.text4,fontSize:14,fontWeight:"600" as any},
  toggleActiveTxt:{color:C.text1,fontWeight:"800" as any},
  saveBadge:    {backgroundColor:C.green+"20",borderRadius:100,paddingHorizontal:6,paddingVertical:2},
  saveTxt:      {color:C.green,fontSize:10,fontWeight:"700" as any},
  card:         {backgroundColor:C.surface,borderWidth:1.5,borderRadius:18,padding:20,marginBottom:14,position:"relative" as any},
  popularCard:  {borderWidth:2},
  founderCard:  {borderWidth:2.5, backgroundColor:"#0d0800"},
  introNoteBanner:{ borderRadius:8, padding:8, marginBottom:10, alignItems:"center" as any },
  introNoteTxt: { color:"#ff8c42", fontSize:12, fontWeight:"700" as any, textAlign:"center" as any },
  currentCard:  {opacity:0.7},
  popularBadge: {position:"absolute" as any,top:-10,alignSelf:"center" as any,borderRadius:100,paddingHorizontal:12,paddingVertical:4},
  popularTxt:   {color:"#000",fontSize:10,fontWeight:"900" as any,letterSpacing:1},
  cardHeader:   {flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,marginTop:6},
  planName:     {fontSize:20,fontWeight:"900" as any,letterSpacing:-0.5},
  priceBlock:   {alignItems:"flex-end" as any},
  crossedPrice: {color:C.text4,fontSize:14,textDecorationLine:"line-through" as any,marginBottom:2},
  price:        {fontSize:32,fontWeight:"900" as any,letterSpacing:-1},
  priceSub:     {color:C.text4,fontSize:11,marginTop:2,textAlign:"right" as any},
  features:     {gap:8,marginBottom:16},
  featureRow:   {flexDirection:"row",gap:8,alignItems:"flex-start"},
  featureCheck: {fontSize:14,fontWeight:"700" as any,width:16},
  featureTxt:   {color:C.text2,fontSize:13,flex:1,lineHeight:18},
  featureMissing:{color:C.text4,fontSize:14,width:16},
  featureMissingTxt:{color:C.text4,fontSize:13,flex:1,lineHeight:18},
  cta:          {borderRadius:13,padding:15,alignItems:"center" as any},
  ctaTxt:       {color:"#000",fontSize:15,fontWeight:"900" as any},
  currentBadge: {borderWidth:1,borderColor:C.border,borderRadius:13,padding:14,alignItems:"center" as any},
  currentBadgeTxt:{color:C.text3,fontSize:14,fontWeight:"700" as any},
  legal:        {color:C.text4,fontSize:11,lineHeight:17,textAlign:"center" as any,marginTop:8},
  legalLink:    {color:C.green,textDecorationLine:"underline" as any},
});
