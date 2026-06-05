import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
}

const FAQS = [
  {
    category: "Getting, Started",
    items: [
      {
        q: "How do I scan an item?",
        a: "Tap the camera button on the Scanner screen. Point your camera at any item — clothing, tools, electronics, collectibles — and tap the shutter. ValuIQ identifies the item and returns profit estimates in seconds. You can also type a description or scan a barcode."
      },
      {
        q: "How accurate are the profit estimates?",
        a: "ValuIQ pulls real eBay sold data (actual recent sales) and combines it with AI market analysis. Estimates are based on median sold prices from the last 30-90 days. Results are for informational purposes — actual prices vary based on condition, listing quality, timing, and demand."
      },
      {
        q: "What does BUY, WATCH, and PASS mean?",
        a: "BUY means the item has strong profit potential (ROI over 35%). WATCH means marginal profit (15-35% ROI) — worth considering but not a sure thing. PASS means the numbers don't work — avoid it to protect your money."
      },
      {
        q: "How many free scans do I get?",
        a: "Free accounts get 10 scans per month. Scans reset on the 1st of each month. Upgrade to Seller for 100 scans, or Pro for unlimited."
      },
    ]
  },
  {
    category: "Plans & Pricing",
    items: [
      {
        q: "What's the difference between Seller and Pro?",
        a: "Seller ($19/mo) gives you 100 scans, 30 Price Battles, 3 Thrift Runs, Death Pile Rescuer, and Auto-Relister — everything a part-time reseller needs. Pro ($49/mo) adds unlimited everything plus Deal Hunter AI, Manifest Analyzer, Arbitrage, Search, Specialty Scanner, and AI Coach — the full business toolkit."
      },
      {
        q: "What is the Lifetime plan?",
        a: "The, Lifetime early-bird plan is $197 one-time (normally $349) — everything in Pro forever, no monthly fees. This price is only available for the first 100 subscribers. After that it rises to $349."
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel anytime from your Profile screen. Your access continues until the end of your billing period. No cancellation fees."
      },
      {
        q: "Do you offer refunds?",
        a: "All sales are final. We offer a 30-day money-back guarantee if the app doesn't work as described — contact support@getvaluiq.com within 30 days of your first payment."
      },
      {
        q: "Is there an annual discount?",
        a: "Yes. Annual, Seller is $139/year (save $89). Annual, Pro is $349/year (save $239 vs monthly). Early-bird annual Pro is $197 for the first 100 users."
      },
    ]
  },
  {
    category: "Tools & Features",
    items: [
      {
        q: "What is Price Battle?",
        a: "Price Battle shows you the exact sell price and net profit after fees on all 12 selling platforms simultaneously. Type any item name and see eBay vs Poshmark vs Mercari vs Whatnot all at once — then pick the best one."
      },
      {
        q: "What is Thrift Run?",
        a: "Thrift Run lets you rapid-scan a whole store in minutes. It's optimized for speed — quick camera captures with instant verdicts so you can move fast while shopping. Seller plan gets 3 Thrift Runs per month, Pro gets unlimited."
      },
      {
        q: "What is Deal Hunter AI?",
        a: "Deal Hunter is an automated sourcing engine that monitors 17 sources simultaneously — eBay auctions, B-Stock, BULQ, Craigslist, ShopGoodwill, OfferUp, Liquidation.com, Whatnot, Mercari, StockX, GovDeals, and more. Every opportunity is AI-scored 0-100. Pro exclusive."
      },
      {
        q: "What is Death Pile Rescuer?",
        a: "Enter any item that's been sitting unsold and get a complete rescue plan: real market data showing what it actually sells for, the exact price that will sell it, an AI-written listing title and description, a cascade pricing schedule, and bundle suggestions."
      },
      {
        q: "What is the Specialty Scanner?",
        a: "Specialty Scanner uses category-specific AI for 8 high-knowledge areas: Wine & Spirits, Coins & Currency, Trading, Cards, Vintage, Jewelry, Antiques, Musical, Instruments, Sports, Memorabilia, and Fine, Art. These categories need expert knowledge that a general scanner misses."
      },
      {
        q: "What is Manifest Analyzer?",
        a: "Upload any liquidation manifest (PDF, photo, or spreadsheet) and ValuIQ evaluates every line item — scores the whole lot, identifies the top items to pull, highlights items to skip, and estimates total profit potential. Pro only."
      },
    ]
  },
  {
    category: "Selling, Platforms",
    items: [
      {
        q: "Which platforms does ValuIQ cover?",
        a: "ValuIQ calculates fees and profit for eBay, Poshmark, Mercari, Etsy, Facebook, Marketplace, OfferUp, Depop, Whatnot, Amazon, StockX, GOAT, and Craigslist — 12 platforms with real fee structures built in."
      },
      {
        q: "Are the fee calculations accurate?",
        a: "Yes. Fees are hardcoded from each platform's published fee schedule and updated regularly. eBay 13.27%, Poshmark 20%, Mercari 10.99%, Etsy 9.65%, Whatnot 11%, Amazon 15%, Facebook/Craigslist 0%, and so on."
      },
    ]
  },
  {
    category: "Account & Privacy",
    items: [
      {
        q: "How do I reset my password?",
        a: "On the sign-in screen, tap 'Forgot password?' and enter your email. You'll receive a reset link. Tap it in your email app and you'll be taken to a page to set a new password."
      },
      {
        q: "How do I delete my account?",
        a: "Go to Profile → scroll to the bottom → tap 'Request, Account Deletion'. This sends an email to our support team who will delete your account and all data within 24 hours."
      },
      {
        q: "Is my data safe?",
        a: "Yes. Scan results are stored securely in Supabase with row-level security. We never sell your data. Scan images are not stored — only the analysis results."
      },
      {
        q: "What is the referral program?",
        a: "Paid subscribers get a personal referral link. When someone subscribes using your link, you earn 20% of their first payment — $3.80 for Seller, $9.80 for Pro monthly, or $39.40 for Lifetime. Referred users get 30 days free on any paid plan."
      },
    ]
  },
  {
    category: "Support",
    items: [
      {
        q: "How do I contact support?",
        a: "Email support@getvaluiq.com. We typically respond within 24 hours on business days."
      },
      {
        q: "The app isn't working correctly — what do I do?",
        a: "First try pulling down to refresh on any screen. If scans are returning odd results, try adding more detail in the description field. If you're experiencing account or payment issues, email support@getvaluiq.com with your account email."
      },
    ]
  },
];

export default function FAQScreen({ onNavigate, onBack }: Props) {
  const [expanded, setExpanded] = useState<string|null>(null);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.backBtn}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>❓ FAQ & Help</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.heroTitle}>How can we help?</Text>
          <Text style={s.heroSub}>Everything you need to know about ValuIQ</Text>
        </View>

        {FAQS.map((section, si) => (
          <View key={si} style={s.section}>
            <Text style={s.sectionTitle}>{section.category}</Text>
            {section.items.map((item, ii) => {
              const key = `${si}-${ii}`;
              const isOpen = expanded === key;
              return (
                <TouchableOpacity
                  key={ii}
                  style={[s.faqItem, isOpen && s.faqItemOpen]}
                  onPress={() => setExpanded(isOpen ? null : key)}
                  activeOpacity={0.75}
                >
                  <View style={s.faqQuestion}>
                    <Text style={s.questionTxt}>{item.q}</Text>
                    <Text style={[s.chevron, isOpen && s.chevronOpen]}>›</Text>
                  </View>
                  {isOpen && (
                    <Text style={s.answerTxt}>{item.a}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {/* Contact */}
        <View style={s.contactCard}>
          <Text style={s.contactTitle}>Still have questions?</Text>
          <Text style={s.contactSub}>Our support team is here to help.</Text>
          <TouchableOpacity
            style={s.contactBtn}
            onPress={() => Linking.openURL("mailto:support@getvaluiq.com")}
          >
            <Text style={s.contactBtnTxt}>📧 Email Support</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.contactBtn, {marginTop:8, backgroundColor:C.surface}]}
            onPress={() => Linking.openURL("https://www.getvaluiq.com/terms")}
          >
            <Text style={[s.contactBtnTxt, {color:C.text3}]}>📄 Terms of Service</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>ValuIQ v1.0 · AI-Powered Resale Intelligence</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         {flex:1,backgroundColor:C.bg},
  nav:          {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingTop: 16, paddingBottom: 10,borderBottomWidth:1,borderBottomColor:C.border},
  backBtn:      {width:36,height:36,justifyContent:"center"},
  backTxt:      {color:C.text3,fontSize:22},
  navTitle:     {color:C.text1,fontSize:16,fontWeight:"800" as any},
  scroll:       {padding:16,paddingBottom:60},
  hero:         {marginBottom:24,paddingVertical:8},
  heroTitle:    {color:C.text1,fontSize:26,fontWeight:"900" as any,letterSpacing:-0.5,marginBottom:6},
  heroSub:      {color:C.text3,fontSize:14},
  section:      {marginBottom:20},
  sectionTitle: {color:C.text4,fontSize:11,fontWeight:"800" as any,textTransform:"uppercase" as any,letterSpacing:1.5,marginBottom:8,paddingHorizontal:4},
  faqItem:      {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,marginBottom:6},
  faqItemOpen:  {borderColor:C.green+"40"},
  faqQuestion:  {flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:8},
  questionTxt:  {color:C.text1,fontSize:14,fontWeight:"600" as any,flex:1,lineHeight:20},
  chevron:      {color:C.text4,fontSize:22,fontWeight:"300" as any,lineHeight:22},
  chevronOpen:  {color:C.green,transform:[{rotate:"90deg"}]},
  answerTxt:    {color:C.text3,fontSize:13,lineHeight:20,marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:C.border},
  contactCard:  {backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:20,marginTop:8,marginBottom:20,alignItems:"center"},
  contactTitle: {color:C.text1,fontSize:18,fontWeight:"800" as any,marginBottom:4},
  contactSub:   {color:C.text3,fontSize:13,marginBottom:16},
  contactBtn:   {backgroundColor:C.green,borderRadius:12,paddingVertical:12,paddingHorizontal:24,width:"100%",alignItems:"center"},
  contactBtnTxt:{color:C.greenDark,fontSize:14,fontWeight:"800" as any},
  version:      {color:C.text4,fontSize:11,textAlign:"center" as any,marginBottom:8} });
