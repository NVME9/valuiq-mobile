// SaleCaptureCard.tsx — the moat's capture UI.
// Shows one BUY scan the user already told us they sold, and records the
// real price + days. Used exclusively by LogSaleModal (user-initiated, from
// "My Flips"), so the outcome is always known going in - no "did it sell?"
// question here, just the price+days form.
// A successful save fires the Flex Reveal - a full-screen trophy card with
// one true, honest stat picked by selectFlexStat() (src/lib/flexReveal.ts).
import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator,
} from "react-native";
import { C } from "../lib/theme";
import { recordSaleOutcome, defaultDaysToSale, PendingScan } from "../lib/saleCapture";
import { fetchFlexStat, FlexStat } from "../lib/flexReveal";

interface Props {
  token: string;
  scan: PendingScan;
  onDone: (scanId: string) => void;
  // The caller (LogSaleModal) owns presenting the reveal - this card only
  // ever hands the stat up, it never renders a Modal of its own.
  onReveal: (stat: FlexStat, itemName: string, brand: string | null) => void;
}

export default function SaleCaptureCard({ token, scan, onDone, onReveal }: Props) {
  const [price, setPrice] = useState("");
  const [days, setDays] = useState(() => String(defaultDaysToSale(scan.created_at)));
  const [saving, setSaving] = useState(false);

  async function save(withPrice: boolean) {
    setSaving(true);
    const p = withPrice ? parseFloat(price) : NaN;
    const d = parseInt(days, 10);
    const result = await recordSaleOutcome(
      token, scan.id, "sold", "in_app", scan.created_at,
      isNaN(p) ? undefined : p, isNaN(d) ? undefined : d
    );
    setSaving(false);

    if (result.success && result.scan?.id) {
      const stat = await fetchFlexStat(token, result.scan.id);
      if (stat) onReveal(stat, _name, _brand || null);
    }
    onDone(scan.id);
  }

  const cleanName = (n: string) => (n || "")
    .replace(/^run_\d+\s*/i, "")           // strip run_<id> prefix
    .split(/\|\|\||data:image|;base64|\/9j\//i)[0]  // cut off any encoded-image junk
    .replace(/\s+(Etsy|eBay|Poshmark|Mercari|Depop)\s*$/i, "") // trailing platform tag
    .trim() || "Item";
  const _name = cleanName(scan.item_name);
  const _brand = cleanName(scan.brand || "").replace(/^Item$/, "");  // clean brand; drop if it was only junk
  const title = _brand ? `${_brand} ${_name}` : _name;

  return (
    <View style={s.card}>
      <View style={s.row}>
        {scan.image_url ? (
          <Image source={{ uri: scan.image_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbEmpty]}>
            <Text style={s.thumbLetter}>{(_name || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={s.info}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <Text style={s.meta}>
            Listed ~{scan.daysListed} days ago
            {scan.best_platform ? ` · ${(scan.best_platform||"").split("|||")[0]}` : ""}
          </Text>
        </View>
      </View>

      <Text style={s.prompt}>Nice! What did it sell for?</Text>
      <View style={s.fieldRow}>
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
        <View style={s.daysField}>
          <TextInput
            style={s.daysInput}
            value={days}
            onChangeText={setDays}
            keyboardType="number-pad"
            placeholderTextColor={C.text4}
          />
          <Text style={s.daysLabel}>days</Text>
        </View>
      </View>
      <View style={s.btnRow}>
        <TouchableOpacity
          style={[s.btn, s.btnSold, { flex: 1 }]}
          disabled={saving}
          onPress={() => save(true)}
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
          onPress={() => save(false)}
        >
          <Text style={s.btnNeutralText}>Skip price</Text>
        </TouchableOpacity>
      </View>
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
  fieldRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  priceRow: {
    flex: 1.4, flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHigh,
    borderColor: C.borderHigh, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14,
  },
  dollar: { color: C.green, fontSize: 24, fontWeight: "800", marginRight: 4 },
  priceInput: { flex: 1, color: C.text1, fontSize: 24, fontWeight: "700", paddingVertical: 12 },
  daysField: {
    flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", backgroundColor: C.surfaceHigh,
    borderColor: C.borderHigh, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10,
  },
  daysInput: { color: C.text1, fontSize: 24, fontWeight: "700", paddingVertical: 12, minWidth: 30, textAlign: "right" },
  daysLabel: { color: C.text3, fontSize: 14, fontWeight: "600", marginLeft: 5 },
});
