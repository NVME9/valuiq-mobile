import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Dimensions, Animated } from "react-native";
import { C } from "../lib/theme";

const { width } = Dimensions.get("window");
interface Props { onComplete: () => void; }

const SLIDES = [
  { emoji:"📷", title:"Point. Shoot. Profit.", body:"Scan any item at a thrift store, garage sale, or liquidation lot. ValuIQ tells you exactly what to pay and what you'll make — in seconds.", cta:"Next →", accent:C.green, bg:C.greenBg },
  { emoji:"⚡", title:"Every Platform. Every Fee.", body:"See what your item sells for on eBay, Poshmark, Mercari, Whatnot, and 8 more platforms — after every fee, before you buy.", cta:"Next →", accent:C.orange, bg:"#1a0f00" },
  { emoji:"🤖", title:"Deals Find You.", body:"Deal Hunter AI monitors eBay, B-Stock, Craigslist, Goodwill auctions, and 13 more sources 24/7. The best deals come to you before anyone else sees them.", cta:"Start Scanning →", accent:"#b066ff", bg:"#0d0514", isLast:true },
];

export default function OnboardingScreen({ onComplete }: Props) {
  const [idx, setIdx] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const slide = SLIDES[idx];

  function next() {
    if (idx < SLIDES.length - 1) {
      Animated.parallel([
        Animated.timing(fade,  { toValue:0, duration:180, useNativeDriver:true }),
        Animated.timing(scale, { toValue:0.96, duration:180, useNativeDriver:true }),
      ]).start(() => {
        setIdx(i => i + 1);
        Animated.parallel([
          Animated.timing(fade,  { toValue:1, duration:250, useNativeDriver:true }),
          Animated.spring(scale, { toValue:1, tension:80, friction:8, useNativeDriver:true }),
        ]).start();
      });
    } else { onComplete(); }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: slide.bg }]}>
      <StatusBar barStyle="light-content"/>
      <View style={s.topRow}>
        <View/>
        <TouchableOpacity onPress={onComplete} style={s.skipBtn}><Text style={s.skipTxt}>Skip</Text></TouchableOpacity>
      </View>
      <Animated.View style={[s.content, { opacity:fade, transform:[{scale}] }]}>
        <View style={[s.emojiBox, { shadowColor:slide.accent }]}>
          <Text style={s.emoji}>{slide.emoji}</Text>
        </View>
        <View style={s.logoRow}>
          <View style={[s.logoBox, { backgroundColor:slide.accent }]}>
            <Text style={[s.logoV, { color: slide.accent === C.green ? C.greenDark : "#000" }]}>V</Text>
          </View>
          <Text style={s.logoName}>ValuIQ</Text>
        </View>
        <Text style={s.title}>{slide.title}</Text>
        <Text style={s.body}>{slide.body}</Text>
      </Animated.View>
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i===idx && [s.dotActive, { backgroundColor:slide.accent }]]}/>
        ))}
      </View>
      <View style={s.bottom}>
        <TouchableOpacity style={[s.cta, { backgroundColor:slide.accent }]} onPress={next} activeOpacity={0.85}>
          <Text style={[s.ctaTxt, { color: slide.accent === C.green ? C.greenDark : "#000" }]}>{slide.cta}</Text>
        </TouchableOpacity>
        {(slide as any).isLast && <Text style={s.fine}>Free to start · No credit card required</Text>}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex:1 },
  topRow:  { flexDirection:"row", justifyContent:"space-between", paddingHorizontal:24, paddingTop:8 },
  skipBtn: { padding:8 },
  skipTxt: { color:C.text4, fontSize:14 },
  content: { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:32 },
  emojiBox:{ width:120, height:120, borderRadius:32, backgroundColor:"rgba(255,255,255,0.06)", alignItems:"center", justifyContent:"center", marginBottom:32, shadowOpacity:0.3, shadowRadius:30, shadowOffset:{width:0,height:0}, elevation:10 },
  emoji:   { fontSize:64 },
  logoRow: { flexDirection:"row", alignItems:"center", gap:10, marginBottom:24 },
  logoBox: { width:32, height:32, borderRadius:9, alignItems:"center", justifyContent:"center" },
  logoV:   { fontSize:18, fontWeight:"900" as any },
  logoName:{ color:C.text1, fontSize:22, fontWeight:"900" as any, letterSpacing:-1 },
  title:   { color:C.text1, fontSize:28, fontWeight:"900" as any, textAlign:"center" as any, letterSpacing:-0.8, marginBottom:16, lineHeight:34 },
  body:    { color:C.text3, fontSize:16, textAlign:"center" as any, lineHeight:24 },
  dots:    { flexDirection:"row", gap:8, alignItems:"center", justifyContent:"center", paddingBottom:24 },
  dot:     { width:6, height:6, borderRadius:3, backgroundColor:C.border },
  dotActive:{ width:20, height:6, borderRadius:3 },
  bottom:  { paddingHorizontal:24, paddingBottom:32 },
  cta:     { borderRadius:16, padding:18, alignItems:"center" as any },
  ctaTxt:  { fontSize:17, fontWeight:"900" as any },
  fine:    { color:C.text4, fontSize:12, textAlign:"center" as any, marginTop:12 },
});
