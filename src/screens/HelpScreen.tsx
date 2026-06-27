import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

const FAQS = [
  {
    q: "How accurate are the profit estimates?",
    a: "ValuIQ pulls real sold data from eBay (last 90 days) and uses AI to estimate sell prices on each platform. Estimates are typically within 15-25% of actual selling prices. Results vary based on item condition, current demand, and how well you list. We always recommend verifying with a manual eBay sold search before purchasing.",
  },
  {
    q: "What's the difference between Seller and Pro?",
    a: "Seller is for casual flippers — 100 scans, Thrift Run, Death Pile Rescuer, and Auto-Relister. Pro is for serious resellers — unlimited everything plus Manifest Beast, Reseller CFO, Tax Export, Arbitrage, Specialty Scanner, and AI Coach. If you source from liquidation lots or flip full-time, Pro pays for itself in the first deal.",
  },
  
  {
    q: "Why does my scan show $0 profit?",
    a: "This usually means the item has no resale value (fast fashion, no-name brands) or ValuIQ couldn't identify it clearly. Try adding more detail in the description field, ensuring good lighting, or searching by brand name. Items like H&M, Zara, and Shein are intentionally scored as PASS — they rarely flip profitably.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "You can cancel anytime from your Profile screen → tap 'Cancel Subscription'. Cancellation takes effect at the end of your billing period. You keep access until then. There are no cancellation fees.",
  },
  {
    q: "Are refunds available?",
    a: "We offer a 7-day money-back guarantee on your first subscription payment. Contact support@getvaluiq.com within 7 days of your first charge. Subsequent charges are non-refundable. Lifetime plans are non-refundable after 7 days.",
  },
  {
    q: "Can I use ValuIQ for liquidation buying?",
    a: "Yes - Manifest Beast (Pro) lets you upload a liquidation lot manifest (photo or spreadsheet) and scores items against real eBay sold data, then projects the lot and suggests a max bid. Many Pro users evaluate $1,000-$10,000+ lots with it before buying.",
  },
  {
    q: "How does the referral program work?",
    a: "Paid subscribers get a personal referral link in their Profile. When someone subscribes using your link, you earn 20% of their first payment — $3.80 for Seller, $9.80 for Pro monthly, or $39.40 for Lifetime. Earnings are paid out after the 30-day refund window closes.",
  },
  {
    q: "What platforms does ValuIQ cover?",
    a: "Selling platforms: eBay, Poshmark, Mercari, Depop, Etsy, Whatnot, Facebook Marketplace, OfferUp, Craigslist, StockX, GOAT, and Amazon.",
  },
  {
    q: "Is ValuIQ available on Android?",
    a: "ValuIQ is live on iOS. The full web app at getvaluiq.com works on any device, including Android phones, right from your mobile browser.",
  },
  {
    q: "How do I report incorrect pricing?",
    a: "Tap the flag icon on any scan result to report incorrect pricing. Our team reviews flagged items and retrains the model regularly. You can also email feedback@getvaluiq.com with the item name and what the actual selling price was.",
  },
];

const CATEGORIES = ["General","Billing","Tools","Accuracy","Account"];

export default function HelpScreen({ onNavigate, onBack }: Props) {
  const [expanded, setExpanded] = useState<number|null>(null);
  const [search, setSearch]     = useState("");

  const filtered = search
    ? FAQS.filter(f => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
    : FAQS;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.back}><Text style={s.backTxt}>←</Text></TouchableOpacity>
        <Text style={s.navTitle}>Help & FAQ</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Contact cards */}
        <View style={s.contactRow}>
          <TouchableOpacity style={s.contactCard} onPress={()=>Linking.openURL("mailto:support@getvaluiq.com")}>
            <Text style={{fontSize:24,marginBottom:6}}>📧</Text>
            <Text style={s.contactTitle}>Email Support</Text>
            <Text style={s.contactSub}>support@getvaluiq.com</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.contactCard} onPress={()=>Linking.openURL(`${API_BASE}/terms`)}>
            <Text style={{fontSize:24,marginBottom:6}}>📄</Text>
            <Text style={s.contactTitle}>Terms of Service</Text>
            <Text style={s.contactSub}>Legal & Privacy</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionTitle}>Frequently Asked Questions</Text>

        {filtered.map((faq, i) => (
          <TouchableOpacity
            key={i}
            style={[s.faqCard, expanded===i && s.faqCardOpen]}
            onPress={()=>setExpanded(expanded===i ? null : i)}
            activeOpacity={0.8}
          >
            <View style={s.faqRow}>
              <Text style={s.faqQ} numberOfLines={expanded===i?undefined:2}>{faq.q}</Text>
              <Text style={[s.faqChevron,expanded===i&&{transform:[{rotate:"90deg"}]}]}>›</Text>
            </View>
            {expanded===i && (
              <Text style={s.faqA}>{faq.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        <View style={s.footer}>
          <Text style={s.footerTxt}>Still have questions?</Text>
          <TouchableOpacity style={s.emailBtn} onPress={()=>Linking.openURL("mailto:support@getvaluiq.com?subject=ValuIQ Support")}>
            <Text style={s.emailBtnTxt}>📧 Email Us →</Text>
          </TouchableOpacity>
          <Text style={s.version}>ValuIQ v1.0.0 · iOS</Text>
          <Text style={s.disclaimer}>
            ValuIQ provides resale price estimates for informational purposes only. Actual selling prices vary. ValuIQ is not a financial advisor. All investment and purchasing decisions are your own. We are not responsible for losses resulting from ValuIQ estimates.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         {flex:1,backgroundColor:C.bg},
  nav:          {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingTop: 16, paddingBottom: 10,borderBottomWidth:1,borderBottomColor:C.border},
  back:         {width:36,height:36,justifyContent:"center"},
  backTxt:      {color:C.text3,fontSize:22},
  navTitle:     {color:C.text1,fontSize:16,fontWeight:"800" as any},
  scroll:       {padding:16,paddingBottom:60},
  contactRow:   {flexDirection:"row",gap:10,marginBottom:20},
  contactCard:  {flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:16,alignItems:"center"},
  contactTitle: {color:C.text1,fontSize:13,fontWeight:"700" as any,marginBottom:3},
  contactSub:   {color:C.text4,fontSize:11,textAlign:"center" as any},
  sectionTitle: {color:C.text1,fontSize:15,fontWeight:"800" as any,marginBottom:12},
  faqCard:      {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:13,padding:14,marginBottom:8},
  faqCardOpen:  {borderColor:C.green+"40"},
  faqRow:       {flexDirection:"row",alignItems:"flex-start",gap:8},
  faqQ:         {color:C.text1,fontSize:14,fontWeight:"600" as any,flex:1,lineHeight:20},
  faqChevron:   {color:C.text4,fontSize:22,lineHeight:22},
  faqA:         {color:C.text2,fontSize:13,lineHeight:20,marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.border},
  footer:       {alignItems:"center",paddingTop:24},
  footerTxt:    {color:C.text3,fontSize:14,marginBottom:12},
  emailBtn:     {backgroundColor:C.green,borderRadius:12,paddingTop:16, paddingBottom:10,paddingHorizontal:24,marginBottom:16},
  emailBtnTxt:  {color:C.greenDark,fontSize:14,fontWeight:"900" as any},
  version:      {color:C.text4,fontSize:12,marginBottom:12},
  disclaimer:   {color:C.text4,fontSize:11,textAlign:"center" as any,lineHeight:17,paddingHorizontal:8},
});
