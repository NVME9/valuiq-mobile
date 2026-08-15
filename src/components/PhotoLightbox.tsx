// PhotoLightbox.tsx — full-size "view original" photo, shared by every
// history/My Flips item type (scans, thrift items, specialty). Standalone
// Modal, never opened alongside another Modal, so it isn't subject to the
// same-flow Modal-racing bug documented in LogSaleModal.tsx.
import React from "react";
import { Modal, View, Image, TouchableOpacity, Text, StyleSheet } from "react-native";
import { C } from "../lib/theme";

interface Props {
  uri: string | null;
  onClose: () => void;
}

export default function PhotoLightbox({ uri, onClose }: Props) {
  if (!uri) return null;
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
          <Text style={s.closeTxt}>Done</Text>
        </TouchableOpacity>
        <Image source={{ uri }} style={s.image} resizeMode="contain" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  closeBtn: { position: "absolute", top: 56, right: 22, zIndex: 10, padding: 6 },
  closeTxt: { color: C.text1, fontSize: 15, fontWeight: "700" },
  image: { width: "100%", height: "80%" },
});
