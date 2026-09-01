import { useState, useEffect } from "react";
import { View, Text, Image } from "react-native";
import { C } from "../lib/theme";
import ValuIQLogo from "./ValuIQLogo";

type Props = {
  photoUrl?: string | null;
  emoji?: string | null;
  initial?: string | null;
  size: number;
  // Fallback emoji/initial glyph defaults to size*0.5, which reads right
  // inside a bordered circle (Profile's big avatars) but is too small for a
  // bare small icon slot (nav header, tab bar) - override there.
  glyphSize?: number;
  borderColor?: string;
  backgroundColor?: string;
  // Applied to the outer box - has to accept style props valid for a View,
  // not worth a strict union for a handful of call sites.
  style?: any;
};

// Single source of truth for how the current user's own avatar renders,
// anywhere it appears (Profile, Dashboard header, bottom tab bar, ...):
// real uploaded photo > chosen emoji > initial letter > the real ValuIQ
// brand mark (the same SVG used on the onboarding/intro screen - see
// ValuIQLogo.tsx - not a typed letter).
//
// MEASURED (2026-08-31): the generic person-silhouette glyph (Unicode 👤)
// used to be the last-resort fallback here, and on a cold app start it's
// what showed for the ENTIRE ~5s gap before the photo/emoji cache finishes
// hydrating from AsyncStorage - a jarring "blue icon" flash for a user who
// actually has a real avatar set. A flat typed "V" replaced it briefly but
// read as cheap/placeholder-ish next to the app's actual polished mark -
// ValuIQLogo (the onboarding screen's checkmark glyph) is the real fallback
// now, sized to fit the avatar circle. Never wrong to show (it's not
// pretending to be a specific person) and matches the brand everywhere else
// it appears.
//
// Always renders the SAME size x size box regardless of whether a photo is
// set or has finished loading - the emoji/initial/brand-mark is a base
// layer that paints immediately every time (no network, just a glyph on a
// filled circle), and a photo (if any) is an absolutely-positioned overlay
// that CROSSFADES in via onLoad once it's actually ready, so it always
// fades in over whatever the base layer was already showing rather than
// swapping - worst case on a cold start is a few seconds of emoji/brand
// mark, never a blank flash and never the old generic icon.
export default function UserAvatar({ photoUrl, emoji, initial, size, glyphSize, borderColor, backgroundColor, style }: Props) {
  const [loaded, setLoaded] = useState(false);
  // A changed (or cleared) photoUrl invalidates whatever "loaded" meant for
  // the PREVIOUS url - without this, switching to a new photo would keep
  // showing the old faded-in image at full opacity for a beat since the
  // Image's onLoad hasn't fired yet for the new source.
  useEffect(() => { setLoaded(false); }, [photoUrl]);

  const radius = size / 2;
  const glyph = emoji || initial;

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius, alignItems: "center", justifyContent: "center", overflow: "hidden" },
        { backgroundColor: backgroundColor ?? C.surfaceHigh },
        borderColor ? { borderWidth: 2, borderColor } : null,
        style,
      ]}
    >
      {glyph ? (
        <Text style={{ fontSize: glyphSize ?? size * 0.5, fontWeight: "900", color: C.text1 }}>{glyph}</Text>
      ) : (
        // ~0.5x the box, same proportion the emoji/initial glyph uses -
        // reads as a centered mark, not an oversized logo cramped into a
        // small circle.
        <ValuIQLogo accent={C.green} size={glyphSize ?? size * 0.5} />
      )}
      {photoUrl && (
        <Image
          source={{ uri: photoUrl, cache: "force-cache" }}
          resizeMode="cover"
          onLoad={() => setLoaded(true)}
          // top/left/right/bottom:0 (NOT width/height:size) - this is what
          // actually centers it. RN positions an absolute child's top/left
          // from the parent's PADDING edge, which sits INSET by borderWidth
          // from the outer size x size box whenever borderColor is set. A
          // width:size/height:size Image anchored at that inset origin
          // ends up size larger than the padding box in both dimensions,
          // so it overflowed past the right/bottom edge while starting
          // flush at the top-left - a visible rightward/downward shift
          // that got worse the smaller the avatar (a fixed borderWidth
          // inset is a bigger fraction of a small circle). Pinning all
          // four edges to 0 instead makes Yoga size the Image to exactly
          // fill the padding box - the same box the Text glyph above is
          // centered in via alignItems/justifyContent - so both layers
          // share identical bounds regardless of size or border.
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius, opacity: loaded ? 1 : 0 }}
        />
      )}
    </View>
  );
}
