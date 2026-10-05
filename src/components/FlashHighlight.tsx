// FlashHighlight.tsx — TWO-STAGE SCAN RENDER (2026-09-11): the "subtle tell"
// for a background stage-2 (search-refined) number landing in place. Wraps
// its children and plays a brief "sharpen into focus" pulse (starts
// slightly faded/enlarged, settles to normal) whenever `flashSeq`
// INCREMENTS - not a spinner, not a badge, just the number itself visibly
// resolving. flashSeq is owned by the caller and bumped ONLY on a real
// refine merge (see ScannerScreen.tsx) - this component has no opinion on
// WHY the value changed, it only reacts to being told to flash. The initial
// mount (flashSeq unchanged from its starting value) never flashes.
import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";

export default function FlashHighlight({ flashSeq, children }: { flashSeq: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const prevSeq = useRef(flashSeq);

  useEffect(() => {
    if (flashSeq === prevSeq.current) return;
    prevSeq.current = flashSeq;
    opacity.setValue(0.35);
    scale.setValue(1.06);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
  }, [flashSeq]);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      {children}
    </Animated.View>
  );
}
