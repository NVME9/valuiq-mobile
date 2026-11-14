// StagedProgress.tsx — forward-only scan progress. When the caller passes
// `uploadDone`, the FIRST step ("Uploading your photos" in ScannerScreen's
// case) ends on that REAL signal (driven by XMLHttpRequest's
// upload.onprogress in lib/api.ts's scanImage) instead of a fixed timer - a
// fast-WiFi scan used to sit on that step for the WHOLE wait because (a)
// the timer gave it a flat 5000ms regardless of how fast the upload
// actually was, and (b) the step list was a brand-new array literal on
// every caller render, which reset this component's internal timer effect
// back to step 0 on every one of those renders (see ScannerScreen.tsx's own
// LOADING_STEPS constant - now a stable, module-level reference so that
// identity churn can't happen again). Every step AFTER the first still
// advances on a timer (there is no other client-observable signal for
// "identify" / "price" - one HTTP round trip covers both server-side) -
// calibrated to real measured backend stage durations, same as before.
//
// `uploadDone` is OPTIONAL: a caller with no real first-step signal
// (SpecialtyScreen's appraise flow, which never uploads anything mid-flow)
// omits it entirely and gets the ORIGINAL fully-timer-driven behavior for
// every step, first included - unchanged from before this fix.
//
// This still NEVER loops back and NEVER claims a step is done before it
// plausibly could be: the screen that owns the fetch unmounts this the
// instant the response lands - true completion always comes from the real
// network call, never from a timer.
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";

export interface ProgressStep {
  label: string;
  // Estimated ms this step takes, used only to pace the checkmark advance -
  // never to declare the whole thing finished. Ignored for step 0 whenever
  // `uploadDone` is provided (see this file's header).
  ms: number;
}

interface Props {
  steps: ProgressStep[];
  active: boolean;
  // Real signal that the FIRST step is actually done - see this file's
  // header. Until this flips true, step 0 stays the active spinner no
  // matter how long that takes; the moment it flips, step 1 begins and the
  // rest of the steps start their timers from THIS instant, not from
  // mount. Omit entirely for the original fully-timer-driven behavior.
  uploadDone?: boolean;
}

export default function StagedProgress({ steps, active, uploadDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const advancedRef = useRef(false);
  const gated = uploadDone !== undefined;

  // (Re)start: fires only when `active`/`gated` change, not on every
  // parent render - a brand-new `steps` array identity each render can no
  // longer reset this.
  useEffect(() => {
    if (!active) return;
    setStepIndex(0);
    advancedRef.current = false;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (!gated) {
      // No real first-step signal - chain every step transition from
      // mount, exactly like the original always-timer-driven version.
      let cumulative = 0;
      const timers: ReturnType<typeof setTimeout>[] = [];
      for (let i = 0; i < steps.length - 1; i++) {
        cumulative += steps[i].ms;
        const nextIndex = i + 1;
        timers.push(setTimeout(() => setStepIndex(nextIndex), cumulative));
      }
      timersRef.current = timers;
    }
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, gated]);

  // The real "step 0 done" signal (gated mode only) - advances past it
  // exactly once, then chains the remaining steps on their own timers from
  // this moment.
  useEffect(() => {
    if (!gated || !active || !uploadDone || advancedRef.current) return;
    advancedRef.current = true;
    setStepIndex(1);
    let cumulative = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < steps.length - 1; i++) {
      cumulative += steps[i].ms;
      const nextIndex = i + 1;
      timers.push(setTimeout(() => setStepIndex(nextIndex), cumulative));
    }
    timersRef.current.push(...timers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uploadDone, gated]);

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
