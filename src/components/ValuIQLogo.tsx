import Svg, { Path } from "react-native-svg";

// The ValuIQ brand mark - a single checkmark-shaped stroke, same path used
// on the onboarding/intro screen's icon. Extracted here so every place that
// needs the REAL mark (onboarding, the avatar placeholder) renders from one
// definition instead of drifting copies.
export default function ValuIQLogo({ accent, size = 48 }: { accent: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M 32 36 L 60 92 L 88 36" fill="none" stroke={accent} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
