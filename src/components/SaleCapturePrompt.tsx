// SaleCapturePrompt.tsx — the passive, permission-free half of the
// sale-capture loop. Server support (scan-history?type=pending_sale) filters
// to aging (10+ day) unresolved BUY scans; this renders a collapsed banner
// on Dashboard and, on tap, an expandable list of the most-overdue few, each
// with three real outcomes (sold / not yet / gave up) instead of one.
//
// Rebuilt after the original version (same filename, deleted in 6a48795)
// was pulled for nagging: it rendered a full capture FORM inline on the
// dashboard the instant an item aged in, no way to say "not sold yet" short
// of ignoring it, and no dismiss. This version only ever shows a collapsed
// line until tapped, offers a real "not yet" (snoozes, doesn't lie), a real
// "gave up" (resolves it so it stops asking), and a dismiss.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";
import LogSaleModal from "./LogSaleModal";
import { getScanHistory, invalidateScanHistoryCache } from "../lib/api";
import { toPendingScan, recordSaleOutcome, snoozeCapture, PendingScan } from "../lib/saleCapture";

interface Props {
  token: string;
  onNavigate: (screen: string, data?: any) => void;
}

// "Not yet" means genuinely still listed - the user just confirmed it, so
// re-asking next week is pure nagging. Deliberately longer than a first-ask
// cooldown would be.
const NOT_YET_COOLDOWN_DAYS = 21;
// Caps how much of a backlog the banner ever loads into state, independent
// of how large the real backlog is (a dev/test account can sit on 300+
// pending scans - the banner must never try to render that).
const WORKING_SET_SIZE = 10;
const VISIBLE_ROWS = 5;

export default function SaleCapturePrompt({ token, onNavigate }: Props) {
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [dismissed, setDismissed] = useState(false); // session-only - reappears next app open
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [logSaleScan, setLogSaleScan] = useState<PendingScan | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setLoaded(true); return; }
      const rows = await getScanHistory(token, "pending_sale", 50);
      if (!alive) return;
      const now = Date.now();
      const cooldownMs = NOT_YET_COOLDOWN_DAYS * 86400000;
      const eligible = rows.filter((r: any) => {
        if (!r.capture_prompted_at) return true; // never snoozed - always eligible
        return now - new Date(r.capture_prompted_at).getTime() >= cooldownMs;
      });
      // Rows arrive newest-first (server orders by created_at desc); take the
      // most recent slice so the working set stays bounded regardless of
      // backlog size, then flip that slice to oldest-first for display - the
      // most-overdue item in the set is the one worth surfacing first.
      const workingSet = eligible
        .slice(0, WORKING_SET_SIZE)
        .map(toPendingScan)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setPending(workingSet);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [token]);

  function removeItem(scanId: string) {
    setPending(prev => prev.filter(p => p.id !== scanId));
  }

  async function handleNotYet(scan: PendingScan) {
    if (busyId) return;
    setBusyId(scan.id);
    const ok = await snoozeCapture(token, scan.id);
    setBusyId(null);
    if (ok) { removeItem(scan.id); invalidateScanHistoryCache(token); }
  }

  async function handleGaveUp(scan: PendingScan) {
    if (busyId) return;
    setBusyId(scan.id);
    const result = await recordSaleOutcome(token, scan.id, "passed", "banner");
    setBusyId(null);
    if (result.success) { removeItem(scan.id); invalidateScanHistoryCache(token); }
  }

  if (!loaded || dismissed || pending.length === 0) return null;

  const visible  = pending.slice(0, VISIBLE_ROWS);
  const overflow = pending.length - visible.length;

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.banner} activeOpacity={0.85} onPress={() => setExpanded(e => !e)}>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitle}>
            {pending.length} flip{pending.length === 1 ? "" : "s"} ready to log — see what you made
          </Text>
          {!expanded && <Text style={s.bannerSub}>Tap to check them off</Text>}
        </View>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setDismissed(true)}
        >
          <Text style={s.dismissX}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {expanded && (
        <View style={s.list}>
          {visible.map(scan => (
            <View key={scan.id} style={s.row}>
              {scan.image_url ? (
                <Image source={{ uri: scan.image_url }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbEmpty]}>
                  <Text style={s.thumbLetter}>{(scan.item_name || "?").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={s.rowName} numberOfLines={1}>{scan.item_name}</Text>
                <Text style={s.rowMeta}>Listed ~{scan.daysListed} days ago</Text>
              </View>
              {busyId === scan.id ? (
                <ActivityIndicator color={C.text3} />
              ) : (
                <View style={s.actions}>
                  <TouchableOpacity style={[s.actionBtn, s.soldBtn]} onPress={() => setLogSaleScan(scan)}>
                    <Text style={s.soldBtnTxt}>Sold</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleNotYet(scan)}>
                    <Text style={s.actionBtnTxt}>Not yet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleGaveUp(scan)}>
                    <Text style={s.actionBtnTxt}>Gave up</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {overflow > 0 && (
            <TouchableOpacity style={s.viewAll} onPress={() => onNavigate("history")}>
              <Text style={s.viewAllTxt}>+{overflow} more — view all in My Flips →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <LogSaleModal
        visible={!!logSaleScan}
        token={token}
        scan={logSaleScan}
        onClose={() => setLogSaleScan(null)}
        onSaved={(scanId) => { removeItem(scanId); invalidateScanHistoryCache(token); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 16 },
  banner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderColor: C.border, borderWidth: 1,
    borderRadius: 14, padding: 14,
  },
  bannerTitle: { color: C.text1, fontSize: 14, fontWeight: "800" },
  bannerSub: { color: C.text3, fontSize: 12, marginTop: 2 },
  dismissX: { color: C.text4, fontSize: 16, fontWeight: "700", paddingHorizontal: 4 },
  list: { marginTop: 8, gap: 8 },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderColor: C.border, borderWidth: 1,
    borderRadius: 12, padding: 10,
  },
  thumb: { width: 40, height: 40, borderRadius: 8, marginRight: 10, backgroundColor: C.surfaceHigh },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbLetter: { color: C.text3, fontSize: 16, fontWeight: "700" },
  rowName: { color: C.text1, fontSize: 13, fontWeight: "700" },
  rowMeta: { color: C.text3, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, backgroundColor: C.surfaceHigh,
  },
  actionBtnTxt: { color: C.text2, fontSize: 11, fontWeight: "700" },
  soldBtn: { borderColor: C.green + "50", backgroundColor: C.green + "15" },
  soldBtnTxt: { color: C.green, fontSize: 11, fontWeight: "800" },
  viewAll: { paddingVertical: 6, paddingHorizontal: 4 },
  viewAllTxt: { color: C.text3, fontSize: 12, fontWeight: "600" },
});
