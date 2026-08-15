// FlipActionsRow.tsx — the ONE action row used by every item in My Flips
// (regular scans, thrift-run items, specialty appraisals). Same actions,
// same order, same look everywhere, always visible on the card (never
// gated behind expand+scroll) - "I sold this" has to be found by looking,
// not by hunting.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C } from "../lib/theme";
import ShareButton from "./ShareButton";

interface Props {
  hasPhoto: boolean;
  onView?: () => void;
  onSold: () => void;
  onEdit: () => void;
  shareMessage: string;
  // Omit to hide - only thrift items lack a safe per-item delete today (see
  // HistoryScreen.tsx: deleting one would leave the run's stored totals
  // stale, since those live on the run header, not recomputed by a plain
  // per-item delete).
  onDelete?: () => void;
}

export default function FlipActionsRow({ hasPhoto, onView, onSold, onEdit, shareMessage, onDelete }: Props) {
  return (
    <View style={s.row}>
      {hasPhoto && onView ? (
        <TouchableOpacity style={s.pill} onPress={onView}>
          <Text style={s.pillTxt}>{"📷"} View</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[s.pill, s.pillSold]} onPress={onSold}>
        <Text style={[s.pillTxt, s.pillSoldTxt]}>{"✅"} Sold</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.pill} onPress={onEdit}>
        <Text style={s.pillTxt}>{"✏️"} Edit</Text>
      </TouchableOpacity>
      <ShareButton compact message={shareMessage} />
      {onDelete ? (
        <TouchableOpacity style={[s.pill, s.pillDelete]} onPress={onDelete}>
          <Text style={[s.pillTxt, s.pillDeleteTxt]}>{"🗑"} Delete</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  pill: { borderWidth: 1, borderColor: C.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.surface },
  pillTxt: { color: C.text2, fontSize: 12, fontWeight: "700" },
  pillSold: { borderColor: C.green + "50", backgroundColor: C.green + "15" },
  pillSoldTxt: { color: C.green },
  pillDelete: { borderColor: "#ff5a5a30", backgroundColor: "#ff5a5a15" },
  pillDeleteTxt: { color: C.red },
});
