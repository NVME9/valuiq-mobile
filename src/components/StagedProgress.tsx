// StagedProgress.tsx — forward-only scan progress, calibrated to REAL
// measured backend stage durations (see deal-ai-pro app/api/lens/route.ts's
// _debug.timing - identify ~1.6-2s, pricing ~2-2.5s post-Haiku-swap).
// Unlike a rotating-message list, this NEVER loops back and NEVER claims a
// step is done before it plausibly could be: it advances through fixed
// checkpoints on a timer, then HOLDS on the last step (spinner, no new
// text) for however long the real request actually takes. The screen that
// owns the fetch unmounts this the instant the response lands - true
// completion always comes from the real network call, never from the timer.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";

export interface ProgressStep {
  label: string;
  // Estimated ms this step takes, used only to pace the checkmark advance -
  // never to declare the whole thing finished.
  ms: number;
}

interface Props {
  steps: ProgressStep[];
  active: boolean;
}

export default function StagedProgress({ steps, active }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    setStepIndex(0);
    let cumulative = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < steps.length - 1; i++) {
      cumulative += steps[i].ms;
      const nextIndex = i + 1;
      timers.push(setTimeout(() => setStepIndex(nextIndex), cumulative));
    }
    return () => timers.forEach(clearTimeout);
  }, [active, steps]);

  if (!active) return null;

  return (
    <View style={s.wrap}>
      {steps.map((step, i) => {
        const done = i < stepIndex;
        const isActive = i === stepIndex;
        return (
          <View key={i} style={s.row}>
            <View style={[s.dot, done && s.dotDone, isActive && s.dotActive]}>
              {done ? (
                <Text style={s.check}>{"✓"}</Text>
              ) : isActive ? (
                <ActivityIndicator size="small" color={C.greenDark} />
              ) : null}
            </View>
            <Text style={[s.label, (done || isActive) && s.labelActive]} numberOfLines={1}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  // Fit-content, not stretch-to-parent: width:"100%" used to make this
  // stretch across the whole screen (minus the caller's own padding),
  // which isn't the same thing as being centered - the list's own left
  // edge only lined up with the screen's center by accident, and its
  // right edge sat wherever the longest label happened to end. alignSelf
  // "center" + no explicit width lets Yoga size the column to its widest
  // child (the longest step label) and center THAT block, so the steps'
  // shared left edge sits in the middle of the screen with equal margins
  // on both sides, and short labels never look stranded in a sea of
  // their own blank space.
  wrap: { alignSelf: "center", maxWidth: "88%", marginTop: 24 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  dot: {
    width: 26, height: 26, borderRadius: 13, marginRight: 12,
    backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  dotDone: { backgroundColor: C.green, borderColor: C.green },
  dotActive: { borderColor: C.green },
  check: { color: C.greenDark, fontSize: 14, fontWeight: "900" },
  label: { color: C.text4, fontSize: 15, fontWeight: "600" },
  labelActive: { color: C.text1 },
});
