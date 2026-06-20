// SaleCaptureCard.tsx — the moat's capture UI.
// Shows one aging BUY scan and records the real outcome (sold/passed/not_yet + price).
// Used by the in-app prompt and (later) the push-notification landing screen.
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator,
} from "react-native";
import { C } from "../lib/theme";
import { recordSaleOutcome, snoozeCapture, PendingScan, SaleOutcome } from "../lib/saleCapture";

interface Props {
  token: string;
  scan: PendingScan;
  channel?: "push" | "in_app";
  onDone: (scanId: string, outcome: SaleOutcome | "dismissed") => void;
}

export default function SaleCaptureCard({ token, scan, channel = "in_app", onDone }: Props) {
  const [stage, setStage] = useState<"ask" | "price">("ask");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function record(outcome: SaleOutcome, actualPrice?: number) {
    setSaving(true);
    await recordSaleOutcome(token, scan.id, outcome, channel, scan.created_at, actualPrice);
    setSaving(false);
    onDone(scan.id, outcome);
  }

  async function dismiss() {
    setSaving(true);
    await snoozeCapture(token, scan.id);
    setSaving(false);
    onDone(scan.id, "dismissed");
  }

  const title = scan.brand ? `${scan.brand} ${scan.item_name}` : scan.item_name;

  return (
    <View style={s.card}>
      <View style={s.row}>
        {scan.image_url ? (
          <Image source={{ uri: scan.image_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbEmpty]}>
            <Text style={s.thumbLetter}>{(scan.item_name || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.info}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <Text style={s.meta}>
            Listed ~{scan.daysListed} days ago
            {scan.best_platform ? ` · ${scan.best_platform}` : ""}
          </Text>
        </View>
      </View>

      {stage === "ask" ? (
        <>
          <Text style={s.prompt}>Did it sell?</Text>
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, s.btnSold]}
              disabled={saving}
              onPress={() => setStage("price")}
            >
              <Text style={s.btnSoldText}>Sold it</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnNeutral]}
              disabled={saving}
              onPress={() => record("not_yet")}
            >
              <Text style={s.btnNeutralText}>Still listed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnNeutral]}
              disabled={saving}
              onPress={() => record("passed")}
            >
              <Text style={s.btnNeutralText}>Passed</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={dismiss} disabled={saving} style={s.dismiss}>
            <Text style={s.dismissText}>Ask me later</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.prompt}>Nice! What did it sell for?</Text>
          <View style={s.priceRow}>
            <Text style={s.dollar}>$</Text>
            <TextInput
              style={s.priceInput}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={C.text4}
              autoFocus
            />
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.btn, s.btnSold, { flex: 1 }]}
              disabled={saving}
              onPress={() => {
                const p = parseFloat(price);
                record("sold", isNaN(p) ? undefined : p);
              }}
            >
              {saving ? (
                <ActivityIndicator color={C.greenDark} />
              ) : (
                <Text style={s.btnSoldText}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnNeutral, { flex: 0.5 }]}
              disabled={saving}
              onPress={() => record("sold")}
            >
              <Text style={s.btnNeutralText}>Skip price</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
  },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  thumb: { width: 52, height: 52, borderRadius: 10, marginRight: 12, backgroundColor: C.surfaceHigh },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbLetter: { color: C.text3, fontSize: 22, fontWeight: "700" },
  info: { flex: 1 },
  title: { color: C.text1, fontSize: 16, fontWeight: "700" },
  meta: { color: C.text3, fontSize: 13, marginTop: 3 },
  prompt: { color: C.text2, fontSize: 15, fontWeight: "600", marginBottom: 10 },
  btnRow: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnSold: { backgroundColor: C.green },
  btnSoldText: { color: C.greenDark, fontSize: 15, fontWeight: "800" },
  btnNeutral: { backgroundColor: C.surfaceHigh, borderColor: C.border, borderWidth: 1 },
  btnNeutralText: { color: C.text2, fontSize: 14, fontWeight: "600" },
  dismiss: { marginTop: 10, alignItems: "center" },
  dismissText: { color: C.text4, fontSize: 13 },
  priceRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHigh,
    borderColor: C.borderHigh, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, marginBottom: 12,
  },
  dollar: { color: C.green, fontSize: 24, fontWeight: "800", marginRight: 4 },
  priceInput: { flex: 1, color: C.text1, fontSize: 24, fontWeight: "700", paddingVertical: 12 },
});
