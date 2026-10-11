// DeleteAccountModal.tsx — dedicated, hard-to-trigger-by-accident account
// deletion confirmation (2026-10-11).
//
// INCIDENT (2026-10-10 21:50 UTC): the owner's own account was deleted
// during on-device testing via ProfileScreen's old confirmDeleteAccount() -
// a native Alert.alert() with a "Cancel"/"Delete Forever" button pair. Two
// fast taps (the second on a destructive-styled button sitting right next
// to Cancel) is all that flow ever required, and that's exactly what fired
// it by accident. This replaces that Alert entirely with a dedicated screen
// requiring TWO deliberate, hard-to-mistake actions in sequence, not one:
//   1. Type "DELETE" - exact case, no auto-capitalize - into a text field.
//      Any mismatch (including "delete" or "Delete") leaves the final step
//      disabled. No partial credit for getting close.
//   2. Press AND HOLD the final button for a full, uninterrupted 2 seconds.
//      Releasing early at any point resets the hold to zero - a stray tap,
//      or even two of them, can never complete this on its own.
// Both gates are required simultaneously (the hold button is disabled
// outright until the typed word matches) - this is not two independent
// ways to confirm, it's one flow with two sequential locks.
import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";

const CONFIRM_WORD = "DELETE";
const HOLD_MS = 2000;
const HOLD_TICK_MS = 50;

// Side-effect-free state snapshot for the owner-only debug readout
// (ApiDebugPanel's deleteAccountDebug prop) - mirrors lib/storeReview.ts's
// evaluateReview() pattern: this component reports what it's doing, it
// never triggers anything itself just because something is watching.
export interface DeleteAccountDebugState {
  modalOpen: boolean;
  typedMatches: boolean;
  holding: boolean;
  holdProgressMs: number;
  submitting: boolean;
}

interface Props {
  visible: boolean;
  onRequestClose: () => void;
  // The ONLY place this component ever reaches the network - every actual
  // side effect (the real fetch) stays owned by the caller (lib/api.ts's
  // deleteAccount via ProfileScreen), same separation every other server
  // call in this screen already uses.
  onConfirmDelete: () => Promise<{ success: boolean; error?: string; status?: number }>;
  // Called only after onConfirmDelete resolves success:true - the caller
  // (ProfileScreen) owns sign-out/navigation from there; this component's
  // job ends at reporting the outcome.
  onDeleted: () => void;
  onDebugStateChange?: (state: DeleteAccountDebugState) => void;
}

export default function DeleteAccountModal({ visible, onRequestClose, onConfirmDelete, onDeleted, onDebugStateChange }: Props) {
  const [typed, setTyped] = useState("");
  const [holding, setHolding] = useState(false);
  const [holdProgressMs, setHoldProgressMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firedRef = useRef(false);

  const typedMatches = typed === CONFIRM_WORD;

  useEffect(() => {
    onDebugStateChange?.({ modalOpen: visible, typedMatches, holding, holdProgressMs, submitting });
  }, [visible, typedMatches, holding, holdProgressMs, submitting]);

  // Every open is a clean slate - never carry a typed word or a partial
  // hold across one close/reopen cycle.
  useEffect(() => {
    if (!visible) {
      stopHold();
      setTyped("");
      setErrorMsg(null);
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function stopHold() {
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null; }
    setHolding(false);
    setHoldProgressMs(0);
    firedRef.current = false;
  }

  function startHold() {
    if (!typedMatches || submitting) return;
    setErrorMsg(null);
    setHolding(true);
    firedRef.current = false;
    const startedAt = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setHoldProgressMs(Math.min(elapsed, HOLD_MS));
      if (elapsed >= HOLD_MS && !firedRef.current) {
        firedRef.current = true;
        if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null; }
        fireDelete();
      }
    }, HOLD_TICK_MS);
  }

  // Released before the full 2s - cancel outright. Only the hold resets,
  // not the typed word, so letting go early just means holding again, not
  // retyping DELETE.
  function cancelHold() {
    if (!firedRef.current) stopHold();
  }

  async function fireDelete() {
    setHolding(false);
    setSubmitting(true);
    try {
      const res = await onConfirmDelete();
      setSubmitting(false);
      if (res?.success) {
        onDeleted();
        return;
      }
      setHoldProgressMs(0);
      if (res?.status === 403) {
        setErrorMsg("This account can't be deleted from the app.");
      } else {
        setErrorMsg(res?.error || "Could not delete your account. Please try again.");
      }
    } catch {
      setSubmitting(false);
      setHoldProgressMs(0);
      setErrorMsg("Network error. Please try again.");
    }
  }

  const holdPct = Math.min(1, holdProgressMs / HOLD_MS);
  const showMismatch = typed.length >= CONFIRM_WORD.length && !typedMatches;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onRequestClose}>
      <View style={st.overlay}>
        <View style={st.sheet}>
          <Text style={st.title}>Delete your account?</Text>
          <Text style={st.body}>
            This permanently deletes your ValuIQ account, every scan, your full sales history, and your plan. This cannot be undone.
            {"\n\n"}If you subscribe through Stripe, that subscription is cancelled automatically. If you subscribe through the App Store or Google Play, you must cancel it separately in that store first — deleting your account here can't stop store-billed subscriptions.
          </Text>

          <Text style={st.label}>Type DELETE to continue</Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="DELETE"
            placeholderTextColor={C.text4}
            // Deliberately NOT autoCapitalize="characters" - that would
            // auto-uppercase every keystroke and make it impossible to ever
            // type the wrong case, defeating the exact-case check below.
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            editable={!submitting}
            style={[st.input, showMismatch ? st.inputBad : null]}
          />
          {showMismatch && <Text style={st.mismatch}>Must match "DELETE" exactly - case-sensitive.</Text>}
          {!!errorMsg && <Text style={st.error}>{errorMsg}</Text>}

          <Pressable
            disabled={!typedMatches || submitting}
            onPressIn={startHold}
            onPressOut={cancelHold}
            style={[st.holdBtn, !typedMatches && st.holdBtnDisabled]}
          >
            <View style={[st.holdFill, { width: `${holdPct * 100}%` }]} />
            {submitting ? (
              <ActivityIndicator color={C.red} />
            ) : (
              <Text style={[st.holdBtnText, !typedMatches && st.holdBtnTextDisabled]}>
                {!typedMatches
                  ? "Type DELETE above first"
                  : holding
                  ? `Keep holding… ${Math.ceil((HOLD_MS - holdProgressMs) / 1000)}s`
                  : "Press and hold 2s to delete forever"}
              </Text>
            )}
          </Pressable>

          <TouchableOpacity onPress={onRequestClose} disabled={submitting} style={st.cancelBtn}>
            <Text style={st.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  title: { color: C.text1, fontSize: 19, fontWeight: "900", marginBottom: 10 },
  body: { color: C.text3, fontSize: 13, lineHeight: 19, marginBottom: 18 },
  label: { color: C.text2, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, color: C.text1, fontSize: 15, letterSpacing: 1, marginBottom: 4 },
  inputBad: { borderColor: C.red + "60" },
  mismatch: { color: C.red, fontSize: 11, marginBottom: 10 },
  error: { color: C.red, fontSize: 12, marginTop: 4, marginBottom: 10, textAlign: "center" },
  holdBtn: { marginTop: 16, backgroundColor: "#1a0505", borderWidth: 1, borderColor: C.red + "50", borderRadius: 12, padding: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  holdBtnDisabled: { opacity: 0.4 },
  holdFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: C.red + "30" },
  holdBtnText: { color: C.red, fontSize: 14, fontWeight: "800" },
  holdBtnTextDisabled: { color: C.text4 },
  cancelBtn: { marginTop: 12, padding: 12, alignItems: "center" },
  cancelBtnText: { color: C.text3, fontSize: 13, fontWeight: "600" },
});
