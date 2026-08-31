import React from "react";
import { Text, TextStyle, StyleProp } from "react-native";
import { C } from "../lib/theme";

// "IQ" in brand green so the I/l is unmistakable at any size - nested Text
// inherits fontSize/fontWeight/letterSpacing from the parent style, only
// color is overridden, so this drops into any existing logo text style.
export default function Wordmark({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text style={style}>
      Valu<Text style={{ color: C.green }}>IQ</Text>
    </Text>
  );
}
