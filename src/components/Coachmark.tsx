import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions } from "react-native";
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
 * A friendly guided-tour callout. Renders a dimmed overlay with a bright,
 * high-contrast instruction card. Non-blocking guidance: the user can still
 * tap the real UI, or use Next to advance / Skip to end the tour.
 */
export default function Coachmark({
  visible, step, totalSteps, title, body, ctaLabel = "Next", onNext, onSkip, anchor = "center",
}: CoachmarkProps) {
  if (!visible) return null;

  const justify = anchor === "top" ? "flex-start" : anchor === "bottom" ? "flex-end" : "center";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={[s.overlay, { justifyContent: justify }]}>
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
              <Text style={s.nextTxt}>{ctaLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 24, paddingVertical: 80 },
  card: {
    backgroundColor: C.surfaceHigh, borderRadius: 20, padding: 22,
    borderWidth: 1.5, borderColor: C.green, width: Math.min(width - 48, 380), alignSelf: "center",
    shadowColor: C.green, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  dots: { flexDirection: "row", gap: 6, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.green, width: 18 },
  title: { color: C.text1, fontSize: 19, fontWeight: "900", marginBottom: 8 },
  body: { color: C.text2, fontSize: 14.5, lineHeight: 21, marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 6 },
  skipTxt: { color: C.text3, fontSize: 14, fontWeight: "600" },
  nextBtn: { backgroundColor: C.green, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  nextTxt: { color: C.greenDark, fontSize: 15, fontWeight: "800" },
});