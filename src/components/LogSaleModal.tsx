// LogSaleModal.tsx — the user-initiated "I sold this ->" entry point, opened
// from My Flips (HistoryScreen) and the scan-result screen's "Already sold
// it?" nudge.
//
// This owns exactly ONE native <Modal> for the whole flow (price+days form
// -> outcome), same "never two Modals racing" posture this file has always
// had: swapping content via internal state instead of closing one Modal and
// opening another.
//
// WIN HAND-OFF (replaces the old in-modal FlexRevealBody trophy reveal, AND
// the old "Saved — no profit to share" fallback screen this file used to
// show instead): ANY sold save with a real bought/sold pair — profit, loss,
// or break-even alike — fires onSold. The caller opens the Share Studio's
// Win variant with it, AFTER this Modal has fully closed (same short-delay
// sequencing every call site already uses for its own Studio). The card
// itself is what tells a loss apart from a profit (see
// lib/shareCardPayload.ts's buildShareCardPayload) - this Modal no longer
// gates that at all. Only the "skip price" path (no sold amount to show a
// card with) falls through to a plain close.
import React, { useRef } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { PendingScan, SaleLoggedPayload } from "../lib/saleCapture";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
  // Fires once a "sold" save succeeds WITH a real bought/sold pair (profit,
  // loss, or break-even alike) - the caller opens the Share Studio's Win
  // variant with this. This Modal has already called onClose by the time
  // this fires.
  onSold?: (payload: SaleLoggedPayload) => void;
  // Fires once, the instant ANY "sold" save succeeds WITH a real bought/sold
  // pair (mirrors onSold's own gating exactly now) - callers use this to
  // drop the item from whatever list they're driving (the banner's pending
  // queue, HistoryScreen's scans) and invalidate caches.
  onSaved?: (scanId: string) => void;
}

export default function LogSaleModal({ visible, token, scan, onClose, onSold, onSaved }: Props) {
  // Set synchronously inside SaleCaptureCard's onSold (before its onDone
  // fires, in the same save() call) so onDone below can tell "a sold save
  // just handed off to the Studio" apart from "skip price / failed save -
  // just close like Cancel".
  const justHandledRef = useRef(false);

  function close() {
    onClose();
  }

  if (!scan) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.backdrop}>
          <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={close} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Log this sale</Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={s.scrollContent}
              style={s.scroll}
            >
              <SaleCaptureCard
                token={token}
                scan={scan}
                onSold={(payload) => {
                  justHandledRef.current = true;
                  onSaved?.(payload.scanId);
                  onSold?.(payload);
                  onClose();
                }}
                onDone={() => {
                  if (!justHandledRef.current) close();
                  justHandledRef.current = false;
                }}
              />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, paddingHorizontal: 16, borderTopWidth: 1, borderColor: C.border,
    maxHeight: "88%",
  },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { color: C.text1, fontSize: 16, fontWeight: "800" },
  cancelTxt: { color: C.text3, fontSize: 14, fontWeight: "600" },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 34 },
});
