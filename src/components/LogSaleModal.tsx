// LogSaleModal.tsx — the user-initiated "I sold this ->" entry point.
// Wraps the existing SaleCaptureCard (already wired to fire FlexRevealCard
// on a successful "sold" log) in a bottom sheet, opened straight to the
// price+days stage since the user already told us the outcome by tapping
// the button - no redundant "did it sell?" question.
import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { PendingScan, SaleOutcome } from "../lib/saleCapture";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
}

export default function LogSaleModal({ visible, token, scan, onClose }: Props) {
  if (!scan) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Log this sale</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <SaleCaptureCard
            token={token}
            scan={scan}
            channel="in_app"
            initialStage="price"
            onDone={(_id: string, _outcome: SaleOutcome | "dismissed") => onClose()}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 34, borderTopWidth: 1, borderColor: C.border,
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { color: C.text1, fontSize: 16, fontWeight: "800" },
  cancelTxt: { color: C.text3, fontSize: 14, fontWeight: "600" },
});
