// ApiDebugPanel.tsx — OUTAGE HARDENING (2026-10-07).
// Owner-only on-screen readout for Wins/Feed/Profile - each API call's
// name, HTTP status or error text, ms, retry count, and whether it was
// served by dedup instead of firing its own request. Reads lib/api.ts's
// shared getCallLog() (populated by dedupedCall, used by getPlan/
// getScanCount/getProfileData/getScanHistory/getThriftRuns/
// getCommunityFlips) - not a network call itself, just rendering an
// in-memory log. Collapsed by default so it never gets in the way; the
// caller is responsible for the OWNER_EMAILS gate (isOwner prop) - this
// component renders nothing at all for anyone else.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { C } from "../lib/theme";
import { getCallLog } from "../lib/api";

export default function ApiDebugPanel({ isOwner }: { isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!isOwner) return null;
  const log = expanded ? getCallLog() : [];
  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.toggle}>{expanded ? "▲" : "▼"} API calls (owner debug)</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.list}>
          {log.length === 0 && <Text style={styles.row}>No calls recorded yet this session.</Text>}
          {log.map((e, i) => (
            <Text key={i} style={[styles.row, !e.deduped && e.status !== "ok" ? styles.err : null]}>
              {e.deduped ? "↳ " : ""}{e.name} · {e.status} · {e.ms}ms · retries={e.retries}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginHorizontal: 16, marginBottom: 8 },
  toggle: { color: C.text4, fontSize: 11, fontWeight: "700" },
  list: { marginTop: 6, backgroundColor: C.bgDeep, borderRadius: 6, padding: 8, maxHeight: 220 },
  row: { color: C.text3, fontSize: 10, marginBottom: 2, fontFamily: "monospace" as any },
  err: { color: C.red },
});
