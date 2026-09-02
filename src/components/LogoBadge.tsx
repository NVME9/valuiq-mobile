import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";

// The bordered/glowing ring + rounded-fill badge around the ValuIQLogo mark,
// shared between OnboardingScreen and SplashScreen so both first-launch
// moments frame the brand mark identically. Caller-specific spacing (the
// gap before whatever follows the badge) is passed in via `style`, not
// baked in here - Onboarding and Splash want different amounts.
export default function LogoBadge({ accent, style }: { accent: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.iconWrap, { borderColor: accent + "30", shadowColor: accent }, style]}>
      <View style={[s.iconBg, { backgroundColor: C.bgDeep }]}>
        <ValuIQLogo accent={accent} size={88} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  iconWrap: { width:108, height:108, borderRadius:28, borderWidth:1.5, alignItems:"center", justifyContent:"center", shadowOpacity:0.4, shadowRadius:24, shadowOffset:{width:0,height:0}, elevation:12 },
  iconBg:   { width:96, height:96, borderRadius:24, alignItems:"center", justifyContent:"center" },
});
