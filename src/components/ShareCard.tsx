import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { C } from "../lib/theme";

// Rendered off-screen at this width and captured with react-native-view-shot,
// which defaults to the device's native pixel density (no width/height
// override) - on any 3x-density phone that yields a ~1080px-wide PNG without
// hardcoding a capture size that would fight the card's dynamic height
// (photo/secondary-row presence changes it).
const CARD_WIDTH = 360;

interface ShareCardProps {
  result: any;
  oracle?: any;
  photoBase64?: string;
}

function fmtMoney(n: any): string | null {
  const num = Number(n);
  if (n == null || isNaN(num)) return null;
  return (num < 0 ? "-$" : "$") + Math.round(Math.abs(num));
}

export default function ShareCard({ result, oracle, photoBase64 }: ShareCardProps) {
  const decision = result?.decision || "PASS";
  const verdictColor = decision === "BUY" ? C.green : decision === "WATCH" ? C.yellow : C.red;
  const verdictLabel = decision === "BUY" ? "BUY IT" : decision === "WATCH" ? "WATCH IT" : "PASS";

  const pred = oracle?.prediction;
  const profit = fmtMoney(pred?.medianProfit ?? result?.netProfit);
  const days = pred?.medianDays != null && !isNaN(Number(pred.medianDays)) ? Math.round(Number(pred.medianDays)) : null;

  const resale = fmtMoney(result?.sellPrice);
  const bestPlatform = result?.bestPlatform || null;
  const roi = result?.roi != null && !isNaN(Number(result.roi)) ? Math.round(Number(result.roi)) + "%" : null;
  const hasSecondaryRow = !!(resale || bestPlatform || roi);

  const itemName = result?.itemName || result?.item_name || "Item";
  const brand = result?.brand && result.brand !== "Unknown" ? result.brand : null;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.wordmark}>VALUIQ</Text>
        <Text style={s.tagline}>what resellers actually made</Text>
      </View>

      {photoBase64 ? (
        <Image source={{ uri: `data:image/jpeg;base64,${photoBase64}` }} style={s.photo} resizeMode="cover" />
      ) : null}

      <View style={s.body}>
        <Text style={s.itemName} numberOfLines={2}>{itemName}</Text>
        {brand ? <Text style={s.brand}>{brand}</Text> : null}

        <View style={[s.verdictBadge, { backgroundColor: verdictColor + "20", borderColor: verdictColor }]}>
          <Text style={[s.verdictText, { color: verdictColor }]}>{verdictLabel}</Text>
        </View>

        <View style={s.hero}>
          {profit != null ? (
            <View style={s.heroStat}>
              <Text style={s.heroValue} numberOfLines={1}>{profit}</Text>
              <Text style={s.heroLabel}>net profit</Text>
            </View>
          ) : null}
          {days != null ? (
            <View style={s.heroStat}>
              <Text style={[s.heroValue, s.heroValueSecondary]} numberOfLines={1}>{days}d</Text>
              <Text style={s.heroLabel}>to sell</Text>
            </View>
          ) : null}
        </View>

        {hasSecondaryRow ? (
          <View style={s.secondaryRow}>
            {resale ? (
              <View style={s.secondaryStat}>
                <Text style={s.secondaryValue} numberOfLines={1}>{resale}</Text>
                <Text style={s.secondaryLabel}>resale value</Text>
              </View>
            ) : null}
            {bestPlatform ? (
              <View style={s.secondaryStat}>
                <Text style={s.secondaryValue} numberOfLines={1}>{bestPlatform}</Text>
                <Text style={s.secondaryLabel}>best platform</Text>
              </View>
            ) : null}
            {roi ? (
              <View style={s.secondaryStat}>
                <Text style={s.secondaryValue} numberOfLines={1}>{roi}</Text>
                <Text style={s.secondaryLabel}>ROI</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>getvaluiq.com</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: C.bg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  header: {
    paddingTop: 28,
    paddingBottom: 16,
    alignItems: "center",
  },
  wordmark: {
    color: C.green,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 3,
  },
  tagline: {
    color: C.text4,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    letterSpacing: 0.5,
  },
  photo: {
    width: "100%",
    height: 220,
  },
  body: {
    padding: 24,
    alignItems: "center",
  },
  itemName: {
    color: C.text1,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 2,
  },
  brand: {
    color: C.text3,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 14,
  },
  verdictBadge: {
    borderWidth: 1.5,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 20,
  },
  verdictText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  hero: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 36,
    marginBottom: 20,
  },
  heroStat: {
    alignItems: "center",
    maxWidth: CARD_WIDTH / 2 - 20,
  },
  heroValue: {
    color: C.green,
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroValueSecondary: {
    color: C.text1,
  },
  heroLabel: {
    color: C.text4,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  secondaryRow: {
    flexDirection: "row",
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 16,
  },
  secondaryStat: {
    flex: 1,
    alignItems: "center",
  },
  secondaryValue: {
    color: C.text1,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryLabel: {
    color: C.text4,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  footer: {
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerText: {
    color: C.text3,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
