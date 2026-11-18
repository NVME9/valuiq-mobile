// ScanFrameBackground.tsx — the ONE lime-grid-on-near-black look shared by
// the splash screen (App.tsx's SplashScreen) and the new Share Studio card
// background. Two pieces, always used together but exported separately
// since the card also reuses ScanCorners on its own for the smaller photo-
// frame brackets (a different box than the full-canvas one the splash uses):
//
//   ScanFrameBackground - fills a box with a flat color + a 1px lime grid
//     every `cellSize` px at `opacity` (defaults match the spec: 60px cells,
//     ~8% lime) - a repeating react-native-svg <Pattern>, so one draw call
//     covers any size (full splash screen or a 1080-wide export canvas)
//     with no per-line elements to lay out.
//   ScanCorners - four L-shaped corner brackets inside a box, the
//     "viewfinder"/lens look. Used full-screen (splash) or inset to a photo
//     frame (the card).
//
// No new native module - react-native-svg is already linked (see
// scripts/native-modules-build46.json).
import React from "react";
import Svg, { Defs, G, Path, Pattern, Rect } from "react-native-svg";

interface FrameBackgroundProps {
  width: number;
  height: number;
  bg?: string;
  accent?: string;
  cellSize?: number;
  opacity?: number;
  strokeWidth?: number;
}

export function ScanFrameBackground({
  width, height, bg = "#0c0c0a", accent = "#a8e63d", cellSize = 60, opacity = 0.08, strokeWidth = 1,
}: FrameBackgroundProps) {
  if (width <= 0 || height <= 0) return null;
  // A patternId unique enough that two ScanFrameBackground instances on the
  // same screen (e.g. the preview AND the off-screen export copy) never
  // collide and silently share/overwrite each other's <Pattern> def.
  const patternId = `scanGrid-${Math.round(width)}x${Math.round(height)}-${cellSize}`;
  return (
    <Svg width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
      <Defs>
        <Pattern id={patternId} width={cellSize} height={cellSize} patternUnits="userSpaceOnUse">
          <Path d={`M 0 0 L ${cellSize} 0 M 0 0 L 0 ${cellSize}`} stroke={accent} strokeWidth={strokeWidth} opacity={opacity} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={bg} />
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${patternId})`} />
    </Svg>
  );
}

interface ScanCornersProps {
  x?: number;
  y?: number;
  w: number;
  h: number;
  armLength?: number;
  thickness?: number;
  color?: string;
  opacity?: number;
}

// Four L-shaped brackets just inside the box's own corners (never outside
// it - arms are drawn from the corner INWARD, so this never overflows a
// parent with overflow:hidden). Same shape at any size: the splash screen's
// full-screen "lens" look and the card's smaller photo-frame brackets are
// the exact same component, just different w/h/armLength/thickness.
export function ScanCorners({ x = 0, y = 0, w, h, armLength = 36, thickness = 3, color = "#a8e63d", opacity = 1 }: ScanCornersProps) {
  if (w <= 0 || h <= 0) return null;
  const a = Math.min(armLength, w / 2, h / 2);
  return (
    <Svg width={w} height={h} style={{ position: "absolute", left: x, top: y }} pointerEvents="none">
      <G stroke={color} strokeWidth={thickness} strokeLinecap="square" opacity={opacity} fill="none">
        <Path d={`M 0 ${a} L 0 0 L ${a} 0`} />
        <Path d={`M ${w - a} 0 L ${w} 0 L ${w} ${a}`} />
        <Path d={`M 0 ${h - a} L 0 ${h} L ${a} ${h}`} />
        <Path d={`M ${w - a} ${h} L ${w} ${h} L ${w} ${h - a}`} />
      </G>
    </Svg>
  );
}
