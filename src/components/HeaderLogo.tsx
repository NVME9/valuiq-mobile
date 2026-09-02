import React from "react";
import { View, StyleSheet, TextStyle, StyleProp } from "react-native";
import Wordmark from "./Wordmark";
import ScannerMark from "./ScannerMark";

export default function HeaderLogo({ size = 42, textStyle }: { size?: number; textStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={styles.row}>
      <ScannerMark size={size} />
      <Wordmark style={textStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
