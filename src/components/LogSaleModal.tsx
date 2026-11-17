// LogSaleModal.tsx — the user-initiated "I sold this ->" entry point, opened
// from My Flips (HistoryScreen) and the scan-result screen's "Already sold
// it?" nudge.
//
// This owns exactly ONE native <Modal> for the whole flow (price+days form
// -> outcome), same "never two Modals racing" posture this file has always
// had: swapping content via internal state instead of closing one Modal and
// opening another.
//
// WIN HAND-OFF (replaces the old in-modal FlexRevealBody trophy reveal): a
// successful sold save with real bought/sold numbers fires onSold. The
// caller decides whether that's actually a WIN (profit > 0 - see
// lib/shareCardPayload.ts's canShareWin) and opens the Share Studio's Win
// variant itself, AFTER this Modal has fully closed (same short-delay
// sequencing every call site already uses for its own Studio). A save that
// didn't make money (loss, break-even, or no price at all) never gets a
// share screen - this Modal shows a plain "Saved" confirmation with a Done
// button instead, right here, so it's never left blank.
import React, { useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { PendingScan, SaleLoggedPayload } from "../lib/saleCapture";
import { canShareWin } from "../lib/shareCardPayload";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
  // Fires once a "sold" save succeeds WITH a real, profitable bought/sold
  // pair (canShareWin(payload.profit) already true) - the caller opens the
  // Share Studio's Win variant with this. This Modal has already called
  // onClose by the time this fires.
  onSold?: (payload: SaleLoggedPayload) => void;
  // Fires once, the instant ANY "sold" save succeeds WITH a real bought/sold
  // pair (win or not - mirrors the old onReveal's gating) - callers use this
  // to drop the item from whatever list they're driving (the banner's
  // pending queue, HistoryScreen's scans) and invalidate caches. Separate
  // from onSold: this fires even when the sale didn't make money.
  onSaved?: (scanId: string) => void;
}

export default function LogSaleModal({ visible, token, scan, onClose, onSold, onSaved }: Props) {
  // true once a sold save succeeds WITHOUT enough profit to share - shows
  // the plain "Saved" + Done screen instead of closing silently, so the
  // user always sees SOMETHING confirming the save happened.
  const [saved, setSaved] = useState(false);
  // Set synchronously inside SaleCaptureCard's onSold (before its onDone
  // fires, in the same save() call) so onDone below can tell "a sold save
  // just handled itself (win hand-off, or the Saved screen)" apart from
  // "skip price / failed save - just close like Cancel".
  const justHandledRef = useRef(false);

  function close() {
    setSaved(false);
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
            {saved ? (
              <View style={s.savedBlock}>
                <Text style={s.savedTitle}>Saved</Text>
                <Text style={s.savedSub}>Logged — no profit to share this time.</Text>
                <TouchableOpacity style={s.doneBtn} onPress={close}>
                  <Text style={s.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
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
                      if (canShareWin(payload.profit)) {
                        onSold?.(payload);
                        onClose();
                      } else {
                        setSaved(true);
                      }
                    }}
                    onDone={() => {
                      if (!justHandledRef.current) close();
                      justHandledRef.current = false;
                    }}
                  />
                </ScrollView>
              </>
            )}
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
  savedBlock: { alignItems: "center", paddingVertical: 28, paddingBottom: 40 },
  savedTitle: { color: C.text1, fontSize: 20, fontWeight: "900", marginBottom: 8 },
  savedSub: { color: C.text3, fontSize: 14, textAlign: "center", marginBottom: 24 },
  doneBtn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText: { color: C.greenDark, fontSize: 16, fontWeight: "900" },
});
