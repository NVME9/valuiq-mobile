// LogSaleModal.tsx — the user-initiated "I sold this ->" entry point, opened
// from My Flips (HistoryScreen) on the user's own initiative.
//
// This owns exactly ONE native <Modal>, for the entire flow (price+days form
// -> reveal). Two bugs were found and fixed here, confirmed by tracing the
// code, not by guessing:
//
// 1. A prior version used two separate <Modal> components (this sheet, then
//    a sibling FlexRevealCard) and toggled their `visible` flags in the same
//    render commit when a sale saved successfully - two native present/
//    dismiss calls racing. Fixed by never having two Modals in play: this
//    component stays mounted as ONE Modal throughout, swapping its content
//    (form -> FlexRevealBody) via internal state instead of closing one
//    Modal and opening another.
//
// 2. That fix alone did NOT resolve the on-device hang, because it wasn't
//    the only bug. SaleCaptureCard's price TextInput had `autoFocus`, which
//    fires the instant the sheet mounts - while this Modal's own
//    animationType="slide" transition is still in flight. On iOS, a
//    first-responder change (keyboard appearing) competing with an
//    in-progress modal presentation transition is a known way to leave the
//    transition coordinator stuck mid-animation: the sheet visually freezes
//    partway up the screen, and touch dispatch for that view hierarchy locks
//    up with it - "half-screen stall, no working exit" is exactly that
//    symptom, and it happens on open, before the reveal is ever reached, so
//    fixing only the reveal-transition race couldn't have fixed it. Fixed by
//    removing autoFocus (see SaleCaptureCard.tsx) and wrapping this sheet in
//    KeyboardAvoidingView so if the keyboard does come up later, the header
//    (title + Cancel) can never end up covered or pushed off-screen.
import React, { useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { PendingScan, ProfitDebug } from "../lib/saleCapture";
import { FlexStat } from "../lib/flexReveal";
import { FlexRevealBody } from "./FlexRevealCard";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
}

export default function LogSaleModal({ visible, token, scan, onClose }: Props) {
  const [reveal, setReveal] = useState<{ stat: FlexStat; itemName: string; brand: string | null; debug?: ProfitDebug } | null>(null);
  // SaleCaptureCard calls onReveal then onDone back to back, synchronously,
  // on a successful "sold" save. This ref lets onDone tell the two cases
  // apart: a reveal just got queued (skip closing - the reveal owns closing
  // now) vs. no reveal happened (close for real). Using a ref instead of
  // reading `reveal` state directly avoids a stale-closure read, since
  // setReveal's update isn't visible yet inside this same synchronous call.
  const justRevealedRef = useRef(false);

  function close() {
    setReveal(null);
    onClose();
  }

  if (!scan) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      {reveal ? (
        <FlexRevealBody stat={reveal.stat} itemName={reveal.itemName} brand={reveal.brand} debug={reveal.debug} onClose={close} />
      ) : (
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
              <SaleCaptureCard
                token={token}
                scan={scan}
                onDone={() => {
                  if (justRevealedRef.current) { justRevealedRef.current = false; return; }
                  close();
                }}
                onReveal={(stat, itemName, brand, debug) => {
                  justRevealedRef.current = true;
                  setReveal({ stat, itemName, brand, debug });
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
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
