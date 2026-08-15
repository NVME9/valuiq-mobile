// LogSaleModal.tsx — the user-initiated "I sold this ->" entry point, opened
// from My Flips (HistoryScreen) on the user's own initiative.
//
// This owns exactly ONE native <Modal>, for the entire flow (price+days form
// -> reveal). A prior version used two separate <Modal> components (this
// sheet, then a sibling FlexRevealCard) and toggled their `visible` flags in
// the same render commit when a sale saved successfully. That's a confirmed
// RN failure mode, not a guess: presenting a new native Modal while another
// is still dismissing races at the native layer and can leave the modal host
// stuck - unresponsive touches, no working Cancel, exactly the "hangs with a
// number pad and no exit" behavior seen on device. Making the two Modals
// siblings instead of JSX-nested (the previous fix attempt) didn't help,
// because the bug was never about tree nesting - it was two native
// present/dismiss calls firing together. The only structural fix is to never
// have two Modals in play for one flow: this component stays mounted as ONE
// Modal throughout, and swaps its content (form -> FlexRevealBody) via
// internal state instead of closing and opening a second Modal.
import React, { useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C } from "../lib/theme";
import SaleCaptureCard from "./SaleCaptureCard";
import { PendingScan } from "../lib/saleCapture";
import { FlexStat } from "../lib/flexReveal";
import { FlexRevealBody } from "./FlexRevealCard";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
}

export default function LogSaleModal({ visible, token, scan, onClose }: Props) {
  const [reveal, setReveal] = useState<{ stat: FlexStat; itemName: string; brand: string | null } | null>(null);
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
        <FlexRevealBody stat={reveal.stat} itemName={reveal.itemName} brand={reveal.brand} onClose={close} />
      ) : (
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
              onReveal={(stat, itemName, brand) => {
                justRevealedRef.current = true;
                setReveal({ stat, itemName, brand });
              }}
            />
          </View>
        </View>
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
