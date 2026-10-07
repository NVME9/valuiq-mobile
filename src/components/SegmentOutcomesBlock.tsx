// SegmentOutcomesBlock.tsx — "What resellers actually made" (Part 3B,
// 2026-10-06). Shared by ScannerScreen.tsx and SpecialtyScreen.tsx so the
// two screens can't drift on wording. Renders result.segmentOutcomes
// exactly as the server built it (lib/profitOracle.ts's
// buildSegmentOutcomesDisplay) - summaryLine/conditionCaveat are already
// assembled server-side (thresholds, rounding, the known-cost-population
// fix) so this component is pure display, no business logic of its own.
//
// NEVER presented as THIS item's price - the label always names the real
// segment ("Disney plush", not "this item"), and resolvedCount/sellThrough
// make clear it's an aggregate across many outcomes, not a single comp.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "../lib/theme";

export interface SegmentOutcomesData {
  label: string;
  level: "brand_itemtype" | "itemtype" | "brand_category";
  resolvedCount: number;
  sellThroughRate: number | null;
  // RESULT-SCREEN HERO VERDICT (2026-10-06): the raw median, not just the
  // rounded clause baked into summaryLine - ScannerScreen/SpecialtyScreen
  // read this directly to recompute the local heroVerdict override.
  medianSoldPrice: number | null;
  summaryLine: string;
  conditionCaveat: string | null;
}

export default function SegmentOutcomesBlock({ segment }: { segment: SegmentOutcomesData | null | undefined }) {
  if (!segment) return null;
  const outcomeWord = segment.resolvedCount === 1 ? "outcome" : "outcomes";
  const headerParts = [
    `${segment.label} · ${segment.resolvedCount} resale ${outcomeWord}`,
    segment.sellThroughRate != null ? `${segment.sellThroughRate}% sold` : null,
  ].filter(Boolean);

  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>What resellers actually made</Text>
      <Text style={s.header}>{headerParts.join(" · ")}</Text>
      {!!segment.summaryLine && <Text style={s.body}>{segment.summaryLine}</Text>}
      {!!segment.conditionCaveat && <Text style={s.caveat}>{segment.conditionCaveat}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, marginTop: 10 },
  eyebrow: { color: C.text4, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 },
  header: { color: C.text1, fontSize: 14, fontWeight: "700", marginBottom: 4 },
  body: { color: C.text2, fontSize: 13, lineHeight: 18 },
  caveat: { color: C.yellow, fontSize: 12, marginTop: 6, fontWeight: "600" },
});
