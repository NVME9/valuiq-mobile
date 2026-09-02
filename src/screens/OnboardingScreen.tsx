import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import LogoBadge from "../components/LogoBadge";
import ScopeBackground from "../components/ScopeBackground";

interface Props { onComplete: () => void; }

// The ENTIRE first-run value prop, one screen, no swipe/skip/dots - the
// shortest possible path to BEAT 2 (the guided first scan). Replaces the
// old 4-slide sequence outright.
export default function OnboardingScreen({ onComplete }: Props) {
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: C.bgDeep }]}>
      <StatusBar barStyle="light-content" />
      <ScopeBackground accent={C.green} />

      <View style={s.content}>
        <LogoBadge accent={C.green} style={{ marginBottom:28 }}/>

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
  headline:   { color:C.text1, fontSize:28, fontWeight:"900", letterSpacing:-0.5, textAlign:"center", marginBottom:14, lineHeight:34 },
  subline:    { color:C.text2, fontSize:15, lineHeight:21, textAlign:"center" },
  bottom:     { paddingHorizontal:24, paddingBottom:20 },
  cta:        { backgroundColor:C.green, borderRadius:16, paddingVertical:18, alignItems:"center" },
  ctaTxt:     { color:C.greenDark, fontSize:17, fontWeight:"900", letterSpacing:0.3 },
});
