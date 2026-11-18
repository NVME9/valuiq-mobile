// KeyboardDoneBar.tsx — the ONE fix for "numeric pad with no Done key, can't
// dismiss, modal won't scroll" (sale-log modal's price field, the scan-
// result tag price editor, every other decimal-pad/number-pad TextInput in
// the app - see AGENTS.md's NUMBER PAD LOCK task). Every numeric input
// should spread numericFieldProps() onto its <TextInput>; every plain-text
// input that also wants a Done bar (Studio's handle/custom-hook fields)
// spreads doneFieldProps(). Both share ONE InputAccessoryView, rendered
// ONCE at the app root (App.tsx mounts <KeyboardDoneAccessory/>) - RN's
// InputAccessoryView attaches by nativeID to whichever TextInput on screen
// currently has focus, so one instance here covers every field in the app,
// no per-screen wiring needed. No new native module (RN core only - see
// scripts/native-modules-build46.json).
import React from "react";
import { InputAccessoryView, Keyboard, Platform, StyleSheet, Text, TextInputProps, TouchableOpacity, View } from "react-native";
import { C } from "../lib/theme";

export const DONE_ACCESSORY_ID = "valuiq-keyboard-done";

export type NumericKind = "decimal" | "integer";

type FieldProps = Pick<TextInputProps, "inputAccessoryViewID" | "returnKeyType" | "blurOnSubmit" | "onSubmitEditing">;

// Spread onto any numeric <TextInput/>: fixed keyboardType + Done-bar wiring.
export function numericFieldProps(kind: NumericKind = "decimal"): FieldProps & Pick<TextInputProps, "keyboardType"> {
  return {
    keyboardType: kind === "decimal" ? "decimal-pad" : "number-pad",
    ...doneFieldProps(),
  };
}

// Same hook, named per the task's own "shared numeric field/hook" wording.
export function useNumericField(kind: NumericKind = "decimal") {
  return numericFieldProps(kind);
}

// For a plain-text field that still wants the same Done bar (Studio's
// handle/custom-hook inputs) - no keyboardType override.
export function doneFieldProps(): FieldProps {
  return {
    inputAccessoryViewID: DONE_ACCESSORY_ID,
    returnKeyType: "done",
    blurOnSubmit: true,
    onSubmitEditing: () => Keyboard.dismiss(),
  };
}

// Rendered ONCE, at the app root. iOS-only (InputAccessoryView has no
// Android implementation in RN core) - a true no-op on Android, never a
// broken/blank bar; Android's numeric keyboards dismiss via the system back
// button and never had this particular lock.
export function KeyboardDoneAccessory() {
  if (Platform.OS !== "ios") return null;
  return (
    <InputAccessoryView nativeID={DONE_ACCESSORY_ID}>
      <View style={st.bar}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.btn}>
          <Text style={st.btnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", backgroundColor: C.surfaceHigh, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 14, paddingVertical: 8 },
  btn: { paddingHorizontal: 10, paddingVertical: 4 },
  btnText: { color: C.green, fontSize: 16, fontWeight: "700" },
});
