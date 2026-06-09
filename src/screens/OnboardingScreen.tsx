import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions, Animated, Image } from "react-native";
import Svg, { Rect, Path, G, Line } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";

const { width, height } = Dimensions.get("window");
interface Props { onComplete: () => void; }

const SLIDES = [
  { emoji:"📷", title:"Point. Shoot. Profit.", body:"Scan any item — AI identifies it instantly and tells you exactly what it sells for, where to list it, and how much you keep.", accent:C.green, bg:"#060806", cta:"Let's go →" },
  { emoji:"⚡", title:"Every Platform. Every Fee.", body:"eBay, Poshmark, Mercari, Whatnot, Etsy — see net profit after every fee on every platform in seconds.", accent:C.yellow, bg:"#080700", cta:"Keep going →" },
  { emoji:"🤖", title:"Like a Pro Appraiser.", body:"Appraises sneakers, watches, handbags, cards and more \u2014 with real eBay data and authenticity checks.", accent:"#ff8c42", bg:"#080500", cta:"Start for free →", isLast:true },
];

function ValuIQLogo({ accent, size = 48 }: { accent: string; size?: number }) {
  // Big V centered in a 120x120 viewBox, scaled to `size`.
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M 32 36 L 60 92 L 88 36" fill="none" stroke={accent} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Faint full-screen scope background (grid + corner brackets) for onboarding.
function ScopeBackground({ accent }: { accent: string }) {
  const { width, height } = Dimensions.get("window");
  const topInset = 60;     // clear the status bar / notch
  const botInset = 170;     // clear the home indicator
  const w = width, h = height;
  const m = 22;       // bracket inset from edge
  const bl = 30;      // bracket leg length
  const sw = 3;       // bracket stroke
  return (
    <Svg width={w} height={h} style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
      <G stroke={accent} strokeWidth={1} opacity={0.24} fill="none">
        <Line x1={0} y1={h*0.25} x2={w} y2={h*0.25} />
        <Line x1={0} y1={h*0.5}  x2={w} y2={h*0.5} />
        <Line x1={0} y1={h*0.75} x2={w} y2={h*0.75} />
        <Line x1={w*0.28} y1={0} x2={w*0.28} y2={h} />
        <Line x1={w*0.5}  y1={0} x2={w*0.5}  y2={h} />
        <Line x1={w*0.72} y1={0} x2={w*0.72} y2={h} />
      </G>
      <G stroke={accent} strokeWidth={sw} opacity={0.38} fill="none">
        <Path d={`M ${m} ${topInset+bl} L ${m} ${topInset} L ${m+bl} ${topInset}`} />
        <Path d={`M ${w-m-bl} ${topInset} L ${w-m} ${topInset} L ${w-m} ${topInset+bl}`} />
        <Path d={`M ${m} ${h-botInset-bl} L ${m} ${h-botInset} L ${m+bl} ${h-botInset}`} />
        <Path d={`M ${w-m-bl} ${h-botInset} L ${w-m} ${h-botInset} L ${w-m} ${h-botInset-bl}`} />
      </G>
    </Svg>
  );
}
export default function OnboardingScreen({ onComplete }: Props) {
  const [idx, setIdx] = useState(0);
  const fade  = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const slide = SLIDES[idx];

  function next() {
    if (idx < SLIDES.length - 1) {
      Animated.parallel([
        Animated.timing(fade,   { toValue:0, duration:200, useNativeDriver:true }),
        Animated.timing(scale,  { toValue:0.94, duration:200, useNativeDriver:true }),
        Animated.timing(slideY, { toValue:-20, duration:200, useNativeDriver:true }),
      ]).start(() => {
        setIdx(i => i + 1);
        slideY.setValue(30);
        Animated.parallel([
          Animated.timing(fade,   { toValue:1, duration:280, useNativeDriver:true }),
          Animated.spring(scale,  { toValue:1, tension:80, friction:8, useNativeDriver:true }),
          Animated.spring(slideY, { toValue:0, tension:80, friction:8, useNativeDriver:true }),
        ]).start();
      });
    } else { onComplete(); }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: slide.bg }]}>
      <StatusBar barStyle="light-content"/>
      <ScopeBackground accent={slide.accent} />

      {/* Skip */}
      <View style={s.topRow}>
        <View/>
        <TouchableOpacity onPress={onComplete} style={s.skipBtn}>
          <Text style={s.skipTxt}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[s.content, { opacity:fade, transform:[{scale}, {translateY:slideY}] }]}>
        
        {/* Big logo icon */}
        <View style={[s.iconWrap, { borderColor: slide.accent + "30", shadowColor: slide.accent }]}>
          <View style={[s.iconBg, { backgroundColor: slide.bg }]}>
            <ValuIQLogo accent={slide.accent} size={88} />
          </View>
        </View>

        {/* Brand */}
        <View style={s.brandRow}>
          <Text style={s.brandName}>ValuIQ</Text>
          <View style={[s.badgePill, { backgroundColor: slide.accent + "20", borderColor: slide.accent + "40" }]}>
            <Text style={[s.badgeTxt, { color: slide.accent }]}>AI-Powered</Text>
          </View>
        </View>

        {/* Slide content */}
        <Text style={[s.slideEmoji]}>{slide.emoji}</Text>
        <Text style={[s.title, { color: slide.accent }]}>{slide.title}</Text>
        <Text style={s.body}>{slide.body}</Text>

        {/* Stats bar on last slide */}
        {false && (
          <View style={s.statsRow}>
            {[["Real","eBay Data"],["12+","Tools"],["$0","To Start"]].map(([val,lbl]) => (
              <View key={lbl} style={s.stat}>
                <Text style={[s.statVal, { color: slide.accent }]}>{val}</Text>
                <Text style={s.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((sl, i) => (
          <View key={i} style={[s.dot, i===idx && [s.dotActive, { backgroundColor:slide.accent }]]}/>
        ))}
      </View>

      {/* CTA */}
      <View style={s.bottom}>
        <TouchableOpacity style={[s.cta, { backgroundColor:slide.accent }]} onPress={next} activeOpacity={0.85}>
          <Text style={[s.ctaTxt, { color: slide.accent === C.green ? C.greenDark : "#000" }]}>{slide.cta}</Text>
        </TouchableOpacity>
        {(slide as any).isLast && (
          <Text style={s.fine}>Free to start · No credit card required</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex:1 },
  topRow:     { flexDirection:"row", justifyContent:"space-between", paddingHorizontal:24, paddingTop:54 },
  skipBtn:    { padding:8 },
  skipTxt:    { color:C.text4, fontSize:14 },
  content:    { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:28, paddingTop:8, paddingBottom:8, overflow:"hidden" },
  iconWrap:   { width:108, height:108, borderRadius:28, borderWidth:1.5, alignItems:"center", justifyContent:"center", marginBottom:20, shadowOpacity:0.4, shadowRadius:24, shadowOffset:{width:0,height:0}, elevation:12 },
  iconBg:     { width:96, height:96, borderRadius:24, alignItems:"center", justifyContent:"center" },
  brandRow:   { flexDirection:"row", alignItems:"center", gap:10, marginBottom:12 },
  brandName:  { color:C.text1, fontSize:28, fontWeight:"900", letterSpacing:-1 },
  badgePill:  { borderWidth:1, borderRadius:100, paddingHorizontal:10, paddingVertical:4 },
  badgeTxt:   { fontSize:11, fontWeight:"800", letterSpacing:0.5 },
  slideEmoji: { fontSize:34, marginBottom:6, marginTop:2 },
  title:      { fontSize:22, fontWeight:"900", letterSpacing:-0.5, textAlign:"center", marginBottom:10 },
  body:       { color:C.text2, fontSize:13, lineHeight:19, textAlign:"center" },
  statsRow:   { flexDirection:"row", gap:0, marginTop:16, backgroundColor:"rgba(255,255,255,0.04)", borderRadius:16, overflow:"hidden" },
  stat:       { flex:1, alignItems:"center", paddingVertical:14, borderRightWidth:1, borderRightColor:"rgba(255,255,255,0.06)" },
  statVal:    { fontSize:20, fontWeight:"900" },
  statLbl:    { color:C.text4, fontSize:10, fontWeight:"700", marginTop:2 },
  dots:       { flexDirection:"row", gap:6, justifyContent:"center", paddingTop:10, paddingBottom:10 },
  dot:        { width:6, height:6, borderRadius:3, backgroundColor:C.border },
  dotActive:  { width:20, height:6, borderRadius:3 },
  bottom:     { paddingHorizontal:24, paddingTop:8, paddingBottom:20, gap:12 },
  cta:        { borderRadius:16, paddingVertical:18, alignItems:"center" },
  ctaTxt:     { fontSize:17, fontWeight:"900", letterSpacing:0.3 },
  fine:       { color:C.text4, fontSize:12, textAlign:"center" },
});
