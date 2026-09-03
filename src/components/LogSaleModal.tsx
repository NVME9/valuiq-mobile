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
import { PendingScan } from "../lib/saleCapture";
import { FlexStat } from "../lib/flexReveal";
import { FlexRevealBody } from "./FlexRevealCard";

interface Props {
  visible: boolean;
  token: string;
  scan: PendingScan | null;
  onClose: () => void;
  onLeaderboard?: () => void;
  // Fires once, the instant a "sold" save actually succeeds (mirrors
  // SaleCaptureCard's onReveal, which only fires on success) - callers use
  // this to drop the item from whatever list they're driving (the banner's
  // pending queue, HistoryScreen's scans) and invalidate caches. Deliberately
  // separate from onClose: this Modal keeps itself mounted to show the
  // reveal after a save, so a caller must NOT clear its `scan` prop here -
  // clearing `scan` while `visible` is still true unmounts the whole Modal
  // (see the `if (!scan) return null` guard below) mid-reveal, the exact
  // "two things racing to control one Modal" bug this file's comments
  // describe. Only onClose should ever null out the caller's scan state.
  onSaved?: (scanId: string) => void;
}

export default function LogSaleModal({ visible, token, scan, onClose, onLeaderboard, onSaved }: Props) {
  // stat starts null: SaleCaptureCard's onReveal opens this shell the
  // instant the sale save succeeds, before the crowd-comparison fetch
  // resolves - onRevealStat fills stat in afterward via the ref below.
  const [reveal, setReveal] = useState<{ stat: FlexStat | null; itemName: string; brand: string | null; loadingSubStat?: string; netProfit: number | null } | null>(null);
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
        <FlexRevealBody stat={reveal.stat} itemName={reveal.itemName} brand={reveal.brand} loadingSubStat={reveal.loadingSubStat} knownNetProfit={reveal.netProfit} onClose={close} onLeaderboard={onLeaderboard ? () => { setReveal(null); onLeaderboard(); } : undefined} />
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
                onReveal={(itemName, brand, loadingSubStat, netProfit) => {
                  justRevealedRef.current = true;
                  setReveal({ stat: null, itemName, brand, loadingSubStat, netProfit });
                  onSaved?.(scan.id);
                }}
                onRevealStat={(stat) => {
                  setReveal((prev) => (prev ? { ...prev, stat } : prev));
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
