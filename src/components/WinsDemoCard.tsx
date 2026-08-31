// WinsDemoCard.tsx — BEAT 4's "filled canvas" move: when a user has zero
// logged wins, show what a win looks like using a REAL resolved sale from
// the ValuIQ moat (see /api/moat-demo-flip) instead of a sad empty state.
// Never fabricated numbers, never presented as the viewer's own - clearly
// labeled "Example from the ValuIQ community" on the card AND inside the
// reveal it opens (via FlexRevealCard's eyebrow/footer overrides).
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { C } from "../lib/theme";
import { getDemoFlip, DemoFlip } from "../lib/api";
import FlexRevealCard from "./FlexRevealCard";
import { FlexStat } from "../lib/flexReveal";

interface Props { onScanNow: () => void; }

export default function WinsDemoCard({ onScanNow }: Props) {
  const [flip, setFlip] = useState<DemoFlip | null>(null);
  const [checked, setChecked] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getDemoFlip().then((f) => { if (alive) { setFlip(f); setChecked(true); } });
    return () => { alive = false; };
  }, []);

  // Nothing loaded yet, or the moat had no qualifying row right now - fall
  // through to the screen's own plain empty state rather than a broken or
  // blank card (BEAT 4: "prefer the real demo" but fall back tastefully).
  if (!checked || !flip) return null;

  const stat: FlexStat = {
    tier: "fallback",
    headline: "$" + Math.round(flip.profit).toLocaleString(),
    subStat: `profit after fees · sold in ${flip.daysToSale} day${flip.daysToSale === 1 ? "" : "s"}`,
    badge: `BOUGHT FOR $${Math.round(flip.buyPrice)}`,
  };

  return (
    <>
      <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => setRevealOpen(true)}>
        <Text style={s.eyebrow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>✨ HERE'S WHAT YOUR WINS WILL LOOK LIKE</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.itemName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{flip.itemName}</Text>
            <Text style={s.meta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Bought ${Math.round(flip.buyPrice)} {"→"} sold ${Math.round(flip.sellPrice)}</Text>
          </View>
          <Text style={s.profit} numberOfLines={1}>+${Math.round(flip.profit)}</Text>
        </View>
        {/* MEASURED BUG: 48 chars at numberOfLines={1} with no fit guard -
            fits on a standard-width phone but ellipsizes on an SE-width one. */}
        <Text style={s.tag} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Example from the ValuIQ community · tap to see</Text>
      </TouchableOpacity>

      <FlexRevealCard
        visible={revealOpen}
        stat={stat}
        itemName={flip.itemName}
        brand={flip.brand}
        eyebrowOverride="EXAMPLE FLIP"
        footerOverride="Real sold data from the ValuIQ community."
        primaryLabelOverride="Scan your first item →"
        onShare={() => { setRevealOpen(false); onScanNow(); }}
        onClose={() => setRevealOpen(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  card:      { backgroundColor: C.surface, borderRadius: 14, marginHorizontal: 14, marginTop: 12, padding: 14, borderWidth: 1, borderColor: C.gold + "40" },
  eyebrow:   { color: C.gold, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.5, marginBottom: 10 },
  row:       { flexDirection: "row", alignItems: "center", gap: 10 },
  itemName:  { color: C.text1, fontSize: 14, fontWeight: "700", marginBottom: 3 },
  meta:      { color: C.text3, fontSize: 12 },
  profit:    { color: C.gold, fontSize: 18, fontWeight: "900" },
  tag:       { color: C.text4, fontSize: 11, fontWeight: "600", marginTop: 10 },
});
