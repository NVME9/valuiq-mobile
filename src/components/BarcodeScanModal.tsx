// BarcodeScanModal.tsx — SPIKE (branch spike/ebay-sold-webview, 2026-10-07).
// Reuses the SAME camera + barcode-scanning primitives ScannerScreen.tsx's
// barcode mode already uses (expo-camera's CameraView/barcodeScannerSettings/
// onBarcodeScanned) - expo-camera is already a production dependency and
// app.json plugin, so unlike react-native-webview this is OTA-safe with no
// new native module. A small standalone modal (not a shared extraction of
// ScannerScreen's own barcode UI) so this debug-only screen never risks
// touching the real scan flow.
import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { C } from "../lib/theme";

export default function BarcodeScanModal({ visible, onScanned, onClose }: {
  visible: boolean;
  onScanned: (upc: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => { if (visible) setScanned(false); }, [visible]);

  function handleBarcode({ data }: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    onScanned(data);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        {permission && !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.msg}>Camera access needed to scan a barcode.</Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission}>
              <Text style={styles.btnTxt}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
            onBarcodeScanned={handleBarcode}
          />
        )}
        <View style={styles.frame} pointerEvents="none">
          <Text style={styles.hint}>Point at the barcode</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>✕ Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  msg: { color: C.text1, fontSize: 15, textAlign: "center", marginBottom: 16 },
  btn: { backgroundColor: C.green, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  btnTxt: { color: C.bg, fontWeight: "700" },
  frame: { position: "absolute", top: "40%", left: 0, right: 0, alignItems: "center" },
  hint: { color: "#fff", fontSize: 14, backgroundColor: "#00000080", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  closeBtn: { position: "absolute", top: 50, right: 20, backgroundColor: "#00000090", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  closeTxt: { color: "#fff", fontWeight: "700" },
});
