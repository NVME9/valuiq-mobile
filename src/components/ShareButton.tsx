// ShareButton.tsx — a single tap straight to the native OS share sheet.
//
// MEASURED BUG: this used to open its OWN bottom sheet with 7 individual
// network buttons. Tapping Facebook did an immediate Linking.openURL to
// facebook.com/sharer.php - no in-app confirmation, no image, straight out
// of the app with a URL-encoded text quote Facebook's sharer.php is known
// to often not even pre-fill reliably. Tapping Instagram did nothing
// distinct despite showing an icon for it (that platform doesn't support a
// direct text-share intent). Both read as an abrupt, broken dead-end
// compared to the Flex Reveal's clean ViewShot -> native-share-sheet flow.
// Replaced with a single Share.share() call: one native picker (Messages,
// Mail, WhatsApp, copy, etc., whatever the OS/device actually has
// installed), no custom picker UI to maintain, no per-network deep-link
// guesswork.
import React, { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Share } from "react-native";
import { C } from "../lib/theme";

interface Props {
  message: string;
  title?: string;
  compact?: boolean;
}

export default function ShareButton({ message, title = "ValuIQ Find", compact = false }: Props) {
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      await Share.share({ message, title });
    } catch {
      // User cancelled or the share sheet failed to open - nothing to
      // recover, just stop showing "Sharing...".
    }
    setSharing(false);
  }

  return (
    <TouchableOpacity
      style={compact ? s.compactBtn : s.shareBtn}
      onPress={handleShare}
      activeOpacity={0.8}
      disabled={sharing}
    >
      <Text style={compact ? s.compactText : s.shareBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {sharing ? "Sharing…" : "Share 📤"}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  shareBtn:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.green+"40", borderRadius:12, paddingVertical:13, alignItems:"center", marginTop:10 },
  shareBtnText: { color:C.green, fontSize:15, fontWeight:"800" },
  compactBtn:   { borderWidth:1, borderColor:C.border, borderRadius:9, paddingHorizontal:14, paddingVertical:7 },
  compactText:  { color:C.text2, fontSize:13, fontWeight:"700" },
});
