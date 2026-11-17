// LogSaleModal.tsx — the user-initiated "I sold this ->" entry point, opened
// from My Flips (HistoryScreen), the scan-result screen's "Already sold it?"
// nudge, and App.tsx's "Did it sell?" push-notification tap. Owns exactly
// ONE native <Modal> for the whole price+days form - no second Modal is
// ever mounted here (see the incident this file used to describe: two
// Modals toggling visible in the same render commit raced each other and
// froze the sheet mid-transition).
//
// The post-sale REVEAL screen that used to live inside this same Modal
// (FlexRevealBody) is gone - per the card spec, a successful sale now hands
// off to the caller via onSold (fired with the real bought/sold/profit
// numbers), which opens the Share Studio's Win variant AFTER this Modal has
// actually finished dismissing (see each call site's own short delay before
// flipping its Studio `visible` to true) - sequential, not two Modals
// racing to both be visible at once.
//
// NUMBER PAD LOCK FIX: SaleCaptureCard's price/days fields now use the
// shared numericFieldProps (Done-bar accessory). This sheet's content is
// wrapped in a ScrollView (it had none before - the actual root cause of
// "the modal will not scroll") with keyboardShouldPersistTaps="handled" and
// keyboardDismissMode="on-drag", inside the existing KeyboardAvoidingView,
// so the focused field can never be pinned under the keyboard with nothing
// able to scroll it into view. Cancel stays a visible, always-reachable close.
import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { PendingScan, SaleLoggedPayload } from "../lib/saleCapture";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
  // Fires once a "sold" save succeeds WITH a real bought/sold price pair -
  // see SaleCaptureCard's own onSold comment. The caller opens the Share
  // Studio's Win variant with this; onClose still fires right after (this
  // Modal always closes on a successful save, win or not).
  onSold?: (payload: SaleLoggedPayload) => void;
  // Fires once, the instant ANY "sold" save actually succeeds (mirrors
  // SaleCaptureCard's old onReveal) - callers use this to drop the item
  // from whatever list they're driving and invalidate caches. Separate
  // from onSold: this fires even on the "skip price" path.
  onSaved?: (scanId: string) => void;
}

export default function LogSaleModal({ visible, token, scan, onClose, onSold, onSaved }: Props) {
  if (!scan) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.backdrop}>
          <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
          <View style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Log this sale</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                onDone={(scanId) => { onSaved?.(scanId); onClose(); }}
                onSold={onSold}
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
