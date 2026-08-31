import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions } from "react-native";
import Svg, { Path, G, Line } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";

interface Props { onComplete: () => void; }

// Brand background for the single first-run value screen - deliberately
// NOT C.bg (#111009): the task calls for a distinct, deeper dark (#0a0f0a)
// so this one screen reads as its own moment, not just another app screen.
const BG = "#0a0f0a";

function ValuIQLogo({ accent, size = 48 }: { accent: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M 32 36 L 60 92 L 88 36" fill="none" stroke={accent} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Faint full-screen scope background (grid + corner brackets).
function ScopeBackground({ accent }: { accent: string }) {
  const { width, height } = Dimensions.get("window");
  const topInset = 60;
  const botInset = 170;
  const w = width, h = height;
  const m = 22;
  const bl = 30;
  const sw = 3;
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

// The ENTIRE first-run value prop, one screen, no swipe/skip/dots - the
// shortest possible path to BEAT 2 (the guided first scan). Replaces the
// old 4-slide sequence outright.
export default function OnboardingScreen({ onComplete }: Props) {
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: BG }]}>
      <StatusBar barStyle="light-content" />
      <ScopeBackground accent={C.green} />

      <View style={s.content}>
        <View style={[s.iconWrap, { borderColor: C.green + "30", shadowColor: C.green }]}>
          <View style={[s.iconBg, { backgroundColor: BG }]}>
            <ValuIQLogo accent={C.green} size={88} />
          </View>
        </View>

        <Text style={s.headline}>Know what anything's really worth to flip.</Text>
        {/* MEASURED BUG: the original 63-char subline ("Real numbers from
            what resellers actually sold — not guesses.") needed 3 lines to
            fully wrap at this font size/width but was capped at
            numberOfLines={2}, so it visibly cut off mid-word ("not...").
            Shortened to fit inside 2 lines with real margin, not shrunk. */}
        <Text style={s.subline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>Real sold prices from actual resellers — not guesses.</Text>
      </View>

      <View style={s.bottom}>
        <TouchableOpacity style={s.cta} onPress={onComplete} activeOpacity={0.85}>
          <Text style={s.ctaTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Scan something now →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex:1 },
  content:    { flex:1, alignItems:"center", justifyContent:"center", paddingHorizontal:32 },
  iconWrap:   { width:108, height:108, borderRadius:28, borderWidth:1.5, alignItems:"center", justifyContent:"center", marginBottom:28, shadowOpacity:0.4, shadowRadius:24, shadowOffset:{width:0,height:0}, elevation:12 },
  iconBg:     { width:96, height:96, borderRadius:24, alignItems:"center", justifyContent:"center" },
  headline:   { color:C.text1, fontSize:28, fontWeight:"900", letterSpacing:-0.5, textAlign:"center", marginBottom:14, lineHeight:34 },
  subline:    { color:C.text2, fontSize:15, lineHeight:21, textAlign:"center" },
  bottom:     { paddingHorizontal:24, paddingBottom:20 },
  cta:        { backgroundColor:C.green, borderRadius:16, paddingVertical:18, alignItems:"center" },
  ctaTxt:     { color:C.greenDark, fontSize:17, fontWeight:"900", letterSpacing:0.3 },
});
