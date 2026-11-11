// src/components/ReferralCodeEntry.tsx — creator partner program
// (2026-11-09). Shared by App.tsx's one-time post-signup step and
// ProfileScreen's always-available row, so the submit/skip/error logic
// only exists once. No discount promise anywhere in this copy — the deal
// is free lifetime Pro for the CREATOR, not a discount for whoever enters
// the code, and this screen must never imply otherwise.
//
// `mode="screen"` renders as a full one-time step (App.tsx, sequenced
// right after AI consent, same one-shot-per-signup pattern as
// firstScanNudge). `mode="inline"` renders as a small expandable row
// (ProfileScreen) that's always available, not just at signup.
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { C } from "../lib/theme";
import { submitReferralCode } from "../lib/api";

interface Props {
  token: string;
  mode: "screen" | "inline";
  onDone?: () => void; // mode="screen" only — called after submit success or Skip
}

type SubmitState = "idle" | "submitting" | "success" | "error";

export default function ReferralCodeEntry({ token, mode, onDone }: Props) {
  const [expanded, setExpanded] = useState(mode === "screen");
  const [code, setCode] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setState("submitting");
    setMessage("");
    try {
      const r = await submitReferralCode(token, trimmed);
      if (r?.success) {
        setState("success");
        setMessage("Code applied — thanks for supporting a creator!");
      } else {
        setState("error");
        setMessage(r?.error || "That code didn't work. Check it and try again.");
      }
    } catch (e: any) {
      // Never let a network hiccup here block anything else - same
      // "logging/measurement must never break the real feature" posture
      // every other fire-and-forget call in this app follows, applied to
      // a user-initiated action instead: it just surfaces as a message.
      setState("error");
      setMessage("Network error — try again later.");
    }
  }

  if (mode === "inline" && !expanded) {
    return (
      <TouchableOpacity style={st.navRow} onPress={() => setExpanded(true)}>
        <Text style={st.navIcon}>🎟️</Text>
        <Text style={st.navLabel}>Have a code from a creator?</Text>
        <Text style={st.navArrow}>›</Text>
      </TouchableOpacity>
    );
  }

  const Wrapper = mode === "screen" ? FullScreenWrapper : InlineWrapper;

  return (
    <Wrapper>
      <Text style={st.title}>Have a code from a creator?</Text>
      <Text style={st.subtitle}>Totally optional — enter it below.</Text>

      {state === "success" ? (
        <>
          <Text style={st.successText}>✓ {message}</Text>
          <TouchableOpacity
            style={st.primaryBtn}
            onPress={() => { if (mode === "inline") setExpanded(false); onDone && onDone(); }}
          >
            <Text style={st.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Creator code"
            placeholderTextColor={C.text4}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            editable={state !== "submitting"}
            style={st.input}
          />
          {state === "error" && <Text style={st.errorText}>{message}</Text>}
          <TouchableOpacity
            style={[st.primaryBtn, state === "submitting" && { opacity: 0.6 }]}
            onPress={submit}
            disabled={state === "submitting"}
          >
            {state === "submitting"
              ? <ActivityIndicator color={C.greenDark} />
              : <Text style={st.primaryBtnText}>Submit</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { if (mode === "inline") { setExpanded(false); setCode(""); setState("idle"); } onDone && onDone(); }}>
            <Text style={st.skipText}>Skip</Text>
          </TouchableOpacity>
        </>
      )}
    </Wrapper>
  );
}

function FullScreenWrapper({ children }: { children: React.ReactNode }) {
  return (
    <View style={st.screenRoot}>
      <View style={st.screenCard}>{children}</View>
    </View>
  );
}
function InlineWrapper({ children }: { children: React.ReactNode }) {
  return <View style={st.inlineCard}>{children}</View>;
}

const st = StyleSheet.create({
  // Matches ProfileScreen's ps.navRow exactly (flat divider row, not a
  // boxed card) - this row sits in that same list, directly above the
  // Account section's own border-top divider, and a different box style
  // here read as a stray/empty-looking row breaking up the list.
  navRow: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  navIcon: { fontSize: 20, width: 28, textAlign: "center" },
  navLabel: { flex: 1, color: C.text1, fontSize: 14, fontWeight: "600" },
  navArrow: { color: C.text4, fontSize: 18 },
  screenRoot: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  screenCard: { width: "100%", maxWidth: 400, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 22 },
  inlineCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, marginBottom: 10 },
  title: { color: C.text1, fontSize: 17, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  subtitle: { color: C.text3, fontSize: 13, marginBottom: 16, textAlign: "center" },
  input: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.text1, fontSize: 16, fontWeight: "700", padding: 13, marginBottom: 10, textAlign: "center" },
  primaryBtn: { backgroundColor: C.green, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  primaryBtnText: { color: C.greenDark, fontSize: 15, fontWeight: "800" },
  skipText: { color: C.text4, fontSize: 13, fontWeight: "700", textAlign: "center" },
  successText: { color: C.green, fontSize: 14, fontWeight: "700", textAlign: "center", marginBottom: 14 },
  errorText: { color: C.red, fontSize: 12.5, textAlign: "center", marginBottom: 10 },
});
