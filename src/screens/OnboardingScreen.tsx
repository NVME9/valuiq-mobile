import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions, Animated, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";

const { width, height } = Dimensions.get("window");
interface Props { onComplete: () => void; }

const SLIDES = [
  { emoji:"📷", title:"Point. Shoot. Profit.", body:"Scan any item — AI identifies it instantly and tells you exactly what it sells for, where to list it, and how much you keep.", accent:C.green, bg:"#060806", cta:"Let's go →" },
  { emoji:"⚡", title:"Every Platform. Every Fee.", body:"eBay, Poshmark, Mercari, Whatnot, Etsy — see net profit after every fee on every platform in seconds.", accent:C.yellow, bg:"#080700", cta:"Keep going →" },
  { emoji:"🤖", title:"Deals Find You.", body:"Deal Hunter AI monitors 17+ sourcing sites 24/7. Get alerted before anyone else when a profitable flip goes live.", accent:"#ff8c42", bg:"#080500", cta:"Start for free →", isLast:true },
];

function ValuIQLogo({ accent, size = 48 }: { accent: string; size?: number }) {
  const r = size / 2;
  const stroke = size * 0.13;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Outer ring */}
      <View style={{
        position: "absolute",
        width: size, height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(2, size * 0.04),
        borderColor: accent + "CC",
      }}/>
      {/* Scanner corners */}
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([dx,dy], i) => (
        <View key={i} style={{ position:"absolute",
          top: dy < 0 ? size*0.05 : undefined,
          bottom: dy > 0 ? size*0.05 : undefined,
          left: dx < 0 ? size*0.05 : undefined,
          right: dx > 0 ? size*0.05 : undefined,
          width: size*0.18, height: size*0.18,
        }}>
          <View style={{ position:"absolute", top:0, left:0, right:0, height:2, backgroundColor:accent+"60" }}/>
          <View style={{ position:"absolute", top:0, left:0, bottom:0, width:2, backgroundColor:accent+"60" }}/>
        </View>
      ))}
      {/* V shape */}
      <View style={{ width: size*0.62, height: size*0.55, position:"relative", overflow:"visible" }}>
        {/* Left arm */}
        <View style={{
          position:"absolute",
          width: stroke, height: size*0.52,
          backgroundColor: accent,
          borderRadius: stroke/2,
          top: 0, left: size*0.03,
          transform: [{ rotate: "20deg" }],
          transformOrigin: "bottom center",
        }}/>
        {/* Right arm */}
        <View style={{
          position:"absolute",
          width: stroke, height: size*0.52,
          backgroundColor: accent,
          borderRadius: stroke/2,
          top: 0, right: size*0.03,
          transform: [{ rotate: "-20deg" }],
          transformOrigin: "bottom center",
        }}/>
      </View>
    </View>
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
        {(slide as any).isLast && (
          <View style={s.statsRow}>
            {[["12+","Platforms"],["24/7","Deal Hunter"],["$0","To Start"]].map(([val,lbl]) => (
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
  topRow:     { flexDirection:"row", justifyContent:"space-between", paddingHorizontal:24, paddingTop:8 },
  skipBtn:    { padding:8 },
  skipTxt:    { color:C.text4, fontSize:14 },
  content:    { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:28 },
  iconWrap:   { width:140, height:140, borderRadius:38, borderWidth:1.5, alignItems:"center", justifyContent:"center", marginBottom:20, shadowOpacity:0.4, shadowRadius:24, shadowOffset:{width:0,height:0}, elevation:12 },
  iconBg:     { width:128, height:128, borderRadius:32, alignItems:"center", justifyContent:"center" },
  brandRow:   { flexDirection:"row", alignItems:"center", gap:10, marginBottom:28 },
  brandName:  { color:C.text1, fontSize:28, fontWeight:"900", letterSpacing:-1 },
  badgePill:  { borderWidth:1, borderRadius:100, paddingHorizontal:10, paddingVertical:4 },
  badgeTxt:   { fontSize:11, fontWeight:"800", letterSpacing:0.5 },
  slideEmoji: { fontSize:52, marginBottom:12 },
  title:      { fontSize:26, fontWeight:"900", letterSpacing:-0.5, textAlign:"center", marginBottom:14 },
  body:       { color:C.text2, fontSize:15, lineHeight:24, textAlign:"center" },
  statsRow:   { flexDirection:"row", gap:0, marginTop:24, backgroundColor:"rgba(255,255,255,0.04)", borderRadius:16, overflow:"hidden" },
  stat:       { flex:1, alignItems:"center", paddingVertical:14, borderRightWidth:1, borderRightColor:"rgba(255,255,255,0.06)" },
  statVal:    { fontSize:20, fontWeight:"900" },
  statLbl:    { color:C.text4, fontSize:10, fontWeight:"700", marginTop:2 },
  dots:       { flexDirection:"row", gap:6, justifyContent:"center", paddingBottom:16 },
  dot:        { width:6, height:6, borderRadius:3, backgroundColor:C.border },
  dotActive:  { width:20, height:6, borderRadius:3 },
  bottom:     { paddingHorizontal:24, paddingBottom:20, gap:12 },
  cta:        { borderRadius:16, paddingVertical:18, alignItems:"center" },
  ctaTxt:     { fontSize:17, fontWeight:"900", letterSpacing:0.3 },
  fine:       { color:C.text4, fontSize:12, textAlign:"center" },
});
