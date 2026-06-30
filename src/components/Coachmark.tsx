import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { C } from "../lib/theme";

const { width } = Dimensions.get("window");

export interface CoachmarkProps {
  visible: boolean;
  step: number;          // current step number (1-based) for the progress dots
  totalSteps: number;
  title: string;
  body: string;
  ctaLabel?: string;     // e.g. "Next", "Try it", "Got it"
  onNext: () => void;
  onSkip: () => void;
  // Vertical anchor: "top" | "center" | "bottom" - where the card sits on screen
  anchor?: "top" | "center" | "bottom";
}

/**
 * A friendly guided-tour callout. Renders as a compact, NON-blocking banner
 * pinned to the top or bottom of the screen (never a full overlay), so the
 * user can still SEE and TAP the real UI it describes. No Modal, no dim.
 */
export default function Coachmark({
  visible, step, totalSteps, title, body, ctaLabel = "Next", onNext, onSkip, anchor = "bottom",
}: CoachmarkProps) {
  if (!visible) return null;

  // Pin to top or bottom (never center-cover). Default bottom so it sits below content.
  const pin = anchor === "top" ? { top: 0 } : { bottom: 0 };

  return (
    <View style={[s.wrap, pin]} pointerEvents="box-none">
      <View style={s.card}>
        {/* progress dots */}
        <View style={s.dots}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View key={i} style={[s.dot, i === step - 1 && s.dotActive]} />
          ))}
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.body}>{body}</Text>
        <View style={s.row}>
          <TouchableOpacity onPress={onSkip} style={s.skipBtn} activeOpacity={0.7}>
            <Text style={s.skipTxt}>Skip tour</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} style={s.nextBtn} activeOpacity={0.85}>
            <Text style={s.nextTxt} numberOfLines={1}>{ctaLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Pinned banner, NOT a full-screen overlay. pointerEvents box-none lets taps
  // pass through to the real UI everywhere except on the card itself.
  wrap: {
    position: "absolute",
    left: 0, right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: "center",
    zIndex: 9999,
  },
  card: {
    backgroundColor: C.surfaceHigh, borderRadius: 20, padding: 20,
    borderWidth: 1.5, borderColor: C.green, width: Math.min(width - 32, 400),
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  dots: { flexDirection: "row", gap: 6, marginBottom: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.green, width: 18 },
  title: { color: C.text1, fontSize: 19, fontWeight: "900", marginBottom: 8 },
  body: { color: C.text2, fontSize: 14.5, lineHeight: 21, marginBottom: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 4, flexShrink: 0 },
  skipTxt: { color: C.text3, fontSize: 14, fontWeight: "600" },
  // flexShrink lets the button adapt; numberOfLines on text prevents overflow
  nextBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, flexShrink: 1, maxWidth: 240 },
  nextTxt: { color: C.greenDark, fontSize: 15, fontWeight: "800", textAlign: "center" },
});
