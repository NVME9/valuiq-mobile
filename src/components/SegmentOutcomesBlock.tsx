// SegmentOutcomesBlock.tsx — "What resellers made" (Part 3B, 2026-10-06;
// redesigned 2026-10-09 per spec for the extended segmentOutcomes fields).
// Shared by ScannerScreen.tsx and SpecialtyScreen.tsx so the two screens
// can't drift on wording. Renders result.segmentOutcomes fields directly
// (lib/profitOracle.ts's buildSegmentOutcomesDisplay) - this component is
// pure display, no business logic of its own.
//
// NEVER presented as THIS item's price - the title always names the real
// segment ("Disney plush", not "this item"), and the footer's resolvedCount/
// soldCount make clear it's an aggregate across many real flips, not a
// single comp. Never mentions the data source, creator names, or the seed
// account - only brand/category-level aggregate numbers.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "../lib/theme";

export interface SegmentOutcomesData {
  label: string;
  segmentLabel: string;
  level: "brand_itemtype" | "itemtype" | "brand_category";
  resolvedCount: number;
  soldCount: number;
  sellThroughRate: number | null;
  sellThroughPct: number | null;
  // RESULT-SCREEN HERO VERDICT (2026-10-06): the raw median, not just a
  // rounded display string - ScannerScreen/SpecialtyScreen read this
  // directly to recompute the local heroVerdict override.
  medianSoldPrice: number | null;
  medianBuyPrice: number | null;
  medianDaysToSell: number | null;
  conditionBasis: "confirmed-new" | "confirmed-used" | "mixed";
  summaryLine: string;
  conditionCaveat: string | null;
}

const CONDITION_BADGE: Record<SegmentOutcomesData["conditionBasis"], string> = {
  "confirmed-new": "new condition",
  "confirmed-used": "used condition",
  "mixed": "mixed condition",
};

export default function SegmentOutcomesBlock({ segment }: { segment: SegmentOutcomesData | null | undefined }) {
  if (!segment) return null;
  const flipWord = segment.soldCount === 1 ? "flip" : "flips";
  // Exactly one condition badge per result - CONDITION_BADGE is a total
  // function over conditionBasis's three values, so this is never blank.
  const footer = `From ${segment.soldCount} real ${flipWord} · ${CONDITION_BADGE[segment.conditionBasis]}`;

  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>What resellers made</Text>
      <Text style={s.title}>{segment.segmentLabel}</Text>
      {segment.medianBuyPrice != null && <Text style={s.line}>Paid: ${Math.round(segment.medianBuyPrice)} median</Text>}
      {segment.medianSoldPrice != null && <Text style={s.line}>Sold: ${Math.round(segment.medianSoldPrice)} median</Text>}
      {segment.sellThroughPct != null && <Text style={s.line}>Sold through: {Math.round(segment.sellThroughPct)}%</Text>}
      {segment.medianDaysToSell != null && <Text style={s.line}>Days to sell: {Math.round(segment.medianDaysToSell)}</Text>}
      <Text style={s.footer}>{footer}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.greenBorder, borderRadius: 14, padding: 14, marginTop: 10 },
  eyebrow: { color: C.green, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
  title: { color: C.text1, fontSize: 14, fontWeight: "700", marginBottom: 6 },
  line: { color: C.text2, fontSize: 13, lineHeight: 19 },
  footer: { color: C.text4, fontSize: 12, marginTop: 8, fontWeight: "600" },
});
