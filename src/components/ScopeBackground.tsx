import React from "react";
import { Dimensions } from "react-native";
import Svg, { G, Line, Path } from "react-native-svg";

// Faint full-screen scope background (grid + corner brackets) - shared
// between OnboardingScreen and SplashScreen so both first-launch moments
// frame their content the same way.
export default function ScopeBackground({ accent, botInset = 170 }: { accent: string; botInset?: number }) {
  const { width, height } = Dimensions.get("window");
  const topInset = 60;
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
