import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

// The real brand icon PNG (assets/icon.png - scanner-frame grid + green V,
// same file used for the app icon itself), extracted from HeaderLogo so the
// mark can be used on its own beside a plain-title header (Community,
// Inventory, Profit Tracker) without forcing the ValuIQ wordmark.
const BRAND_ICON = require("../../assets/icon.png");

export default function ScannerMark({ size = 42, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={BRAND_ICON} resizeMode="contain" style={[{ width: size, height: size }, style]} />;
}
