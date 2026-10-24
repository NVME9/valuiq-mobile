import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Image, ActivityIndicator, Alert, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { C } from "../lib/theme";
import HeaderLogo from "../components/HeaderLogo";
import { compressPhoto } from "../lib/image";
import { rerunScan, updateScan, invalidateScanHistoryCache } from "../lib/api";
import { CONDITION_OPTIONS, CONDITION_TO_DB } from "../lib/condition";

// Reverse of CONDITION_TO_DB, pre-fill only - collapses to one chip per DB
// string (New -> "new-in-box", not "new-no-tags"; both save the same DB
// value either way, see CONDITION_TO_DB).
const DB_TO_CONDITION: Record<string, string> = { New: "new-in-box", Good: "used-good", Fair: "used-heavy" };

interface Props {
  token: string;
  onNavigate: (s: string, data?: any) => void;
  onBack?: () => void;
  // { scan: <row from HistoryScreen's scans state> } - see HistoryScreen's
  // Scans-tab onEdit, the only call site today.
  navData?: any;
}

// HISTORY EDIT REDESIGN (2026-10-22): replaces the old inline editor
// dropdown HistoryScreen used to expand in-place under a Scans-tab card.
// That editor never asked the user to re-confirm WHAT the item actually is
// before re-running - just free-text fields with no identity check. This
// screen pre-fills from the saved scan and asks "is this what you're
// looking for?" before handing off to the exact same re-run path the old
// editor used (rerunScan + updateScan, same scan.id - never a new row).
export default function ScanConfirmScreen({ token, onNavigate, onBack, navData }: Props) {
  const scan = navData?.scan;

  const [name, setName]           = useState(scan?.item_name || "");
  const [brand, setBrand]         = useState(scan?.brand && scan.brand !== "Unknown" ? scan.brand : "");
  const [category, setCategory]   = useState(scan?.category || "");
  const [condition, setCondition] = useState((scan?.condition && DB_TO_CONDITION[scan.condition]) || "");
  const [price, setPrice]         = useState(scan?.buy_price ? String(scan.buy_price) : "");
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [rerunning, setRerunning] = useState(false);

  if (!scan) {
    // Reached with nothing to confirm (stale nav, deep link, row deleted
    // elsewhere) - nothing honest to pre-fill, so this never fabricates an
    // empty form pretending to be a real saved scan.
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
        <View style={s.center}>
          <Text style={s.emptyTxt}>Nothing to confirm.</Text>
          <TouchableOpacity style={s.confirmBtn} onPress={() => onNavigate("history")}>
            <Text style={s.confirmBtnTxt}>Back to History</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  async function pickFrom(source: "camera" | "library") {
    try {
      const opts: any = { mediaTypes: ["images"], quality: 0.6, base64: true };
      let res: any;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert("Camera access needed", "Enable camera access in Settings to take a photo."); return; }
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (!res.canceled && res.assets && res.assets[0]?.base64) {
        const small = await compressPhoto(res.assets[0].base64);
        setNewPhotos(prev => [...prev, `data:image/jpeg;base64,${small}`]);
      }
    } catch {}
  }

  function addPhoto() {
    Alert.alert("Add Photo", "Choose a source", [
      { text: "Take Photo", onPress: () => pickFrom("camera") },
      { text: "Choose from Library", onPress: () => pickFrom("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function confirmAndRerun() {
    if (!name.trim()) { Alert.alert("Name required", "Enter an item name to re-run."); return; }

    // "NOTHING CHANGED" SHORTCUT (HISTORY RERUN FIX #2, 2026-10-24): the
    // storedResale pin this used to send on a photo-less edit is GONE -
    // AUDIT-PROVEN BUG (scan ddf17d11-5c53-42aa-bcb3-f6098943f099, a NECA
    // figure): pinning sellPrice to the old final value still let the
    // server silently drop its shipping estimate and swap the scan's real
    // price tier for a hardcoded one, producing a DIFFERENT max-buy/verdict
    // off the IDENTICAL stored number. A rerun now either (a) genuinely
    // re-prices through the exact same pipeline a fresh scan uses, when the
    // user actually edited something, or (b) never calls the server at
    // all and leaves the saved row completely untouched, when they didn't -
    // "return the saved result unchanged" means literally unchanged, not a
    // recompute that happens to land on the same numbers.
    const effectiveCondition = (condition && CONDITION_TO_DB[condition]) || scan.condition || "Good";
    const effectiveBuyPrice = parseFloat(price) || scan.buy_price || 0;
    const nothingChanged = newPhotos.length === 0
      && name.trim() === (scan.item_name || "").trim()
      && (brand.trim() || "Unknown") === (scan.brand || "Unknown")
      && (category.trim() || "Other") === (scan.category || "Other")
      && effectiveCondition === (scan.condition || "Good")
      && effectiveBuyPrice === (Number(scan.buy_price) || 0);
    if (nothingChanged) {
      Alert.alert("No changes", "Nothing about this item changed - the saved result is unchanged.");
      onNavigate("history");
      return;
    }

    setRerunning(true);
    try {
      const data = await rerunScan(token, {
        itemName: name.trim(),
        brand: brand.trim() || "Unknown",
        category: category.trim() || "Other",
        condition: effectiveCondition,
        buyPrice: effectiveBuyPrice,
        newPhotosBase64: newPhotos.length > 0 ? newPhotos : undefined,
      });
      if (data && (data.success || data.sellPrice != null)) {
        // PLAN GATING: a free-plan rerun comes back with data.locked
        // populated (app/api/lens/route.ts's gateResponseForPlan) - these
        // three columns go to null on purpose, same as the old editor's
        // doRerun did, never a stale real number from before the lock.
        const isLocked = Array.isArray(data.locked) && data.locked.length > 0;
        // EVIDENCE PRESERVATION (2026-10-24): a rerun overwrites this row's
        // specialty_data wholesale below - before that happens, nest the
        // PRE-rerun result under previousResult so the original evidence
        // (comps, evidence line, price range) survives the overwrite. One
        // level deep only - strip any previousResult the prior result
        // itself already carried, rather than growing a chain.
        let priorFull: any = null;
        try { priorFull = scan.specialty_data ? JSON.parse(scan.specialty_data) : null; } catch {}
        if (priorFull && typeof priorFull === "object") delete priorFull.previousResult;
        const newSpecialtyData = priorFull ? { ...data, previousResult: priorFull } : data;
        const updates: any = {
          item_name: name.trim(),
          brand: brand.trim() || "Unknown",
          category: category.trim() || scan.category,
          buy_price: effectiveBuyPrice,
          sell_price: data.sellPrice ?? scan.sell_price,
          buy_target: isLocked ? null : (data.buyTarget ?? scan.buy_target),
          net_profit: isLocked ? null : (data.netProfit ?? scan.net_profit),
          decision: data.decision ?? scan.decision,
          best_platform: data.bestPlatform ?? scan.best_platform,
          roi: isLocked ? null : (data.roi ?? scan.roi),
          specialty_data: JSON.stringify(newSpecialtyData),
        };
        if (condition && CONDITION_TO_DB[condition]) updates.condition = CONDITION_TO_DB[condition];
        try { await updateScan(token, scan.id, updates); } catch {}
        invalidateScanHistoryCache(token);
        onNavigate("history");
      } else {
        Alert.alert("Re-run failed", "Could not re-analyze. Try again.");
      }
    } catch {
      Alert.alert("Re-run failed", "Something went wrong. Try again.");
    }
    setRerunning(false);
  }

  const photoUris = [...(scan.image_url ? [scan.image_url] : []), ...newPhotos];

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack || (() => onNavigate("history"))} style={s.navBack}>
          <Text style={s.navBackText}>{"‹"}</Text>
        </TouchableOpacity>
        <HeaderLogo textStyle={s.logoText}/>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={s.h2}>Is this what you're looking for?</Text>
        <Text style={s.body}>Confirm or correct the details below, then re-run to update this saved scan.</Text>

        <View style={{ flexDirection: "row", gap: 8, marginVertical: 16, flexWrap: "wrap" }}>
          {photoUris.map((uri, i) => (
            <Image key={i} source={{ uri }} style={s.photoThumb} />
          ))}
        </View>
        <TouchableOpacity style={s.addPhotoBtn} onPress={addPhoto}>
          <Text style={s.addPhotoTxt}>+ Add Photo{newPhotos.length ? ` (${newPhotos.length})` : ""}</Text>
        </TouchableOpacity>

        <Text style={s.label}>Item name</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Item name" placeholderTextColor={C.text4}/>
        <Text style={s.label}>Brand</Text>
        <TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="Brand (optional)" placeholderTextColor={C.text4}/>
        <Text style={s.label}>Category</Text>
        <TextInput style={s.input} value={category} onChangeText={setCategory} placeholder="Category" placeholderTextColor={C.text4}/>
        <Text style={s.label}>Condition</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {CONDITION_OPTIONS.map(opt => {
            const sel = condition === opt.value;
            return (
              <TouchableOpacity key={opt.value} style={[s.chip, sel && s.chipOn]} onPress={() => setCondition(sel ? "" : opt.value)}>
                <Text style={[s.chipTxt, sel && s.chipTxtOn]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={s.label}>Tag price (what you paid, optional)</Text>
        <TextInput style={s.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>

        <TouchableOpacity style={[s.confirmBtn, rerunning && { opacity: 0.6 }]} disabled={rerunning} onPress={confirmAndRerun}>
          {rerunning ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.confirmBtnTxt}>Confirm & Re-run</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelBtn} disabled={rerunning} onPress={() => onNavigate("history")}>
          <Text style={s.cancelBtnTxt}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  nav:            { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  navBack:        { padding: 4 },
  navBackText:    { color: C.text1, fontSize: 28, fontWeight: "300" },
  logoText:       { color: C.text1, fontSize: 17, fontWeight: "800", letterSpacing: -0.5 },
  h2:             { color: C.text1, fontSize: 20, fontWeight: "900", marginBottom: 4 },
  body:           { color: C.text3, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  label:          { color: C.text3, fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 12 },
  input:          { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 11, padding: 13, color: C.text1, fontSize: 14 },
  photoThumb:     { width: 72, height: 72, borderRadius: 10 },
  addPhotoBtn:    { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, alignItems: "center", marginBottom: 4 },
  addPhotoTxt:    { color: C.text2, fontSize: 13, fontWeight: "600" },
  chip:           { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.surfaceHigh, borderColor: C.border, borderWidth: 1 },
  chipOn:         { backgroundColor: C.green, borderColor: C.green },
  chipTxt:        { color: C.text2, fontSize: 13, fontWeight: "600" },
  chipTxtOn:      { color: C.greenDark, fontWeight: "800" },
  confirmBtn:     { backgroundColor: C.green, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 20 },
  confirmBtnTxt:  { color: C.greenDark, fontSize: 15, fontWeight: "900" },
  cancelBtn:      { padding: 14, alignItems: "center" },
  cancelBtnTxt:   { color: C.text4, fontSize: 14 },
  emptyTxt:       { color: C.text3, fontSize: 14 },
});
