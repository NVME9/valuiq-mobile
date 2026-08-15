import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  StatusBar, ActivityIndicator, RefreshControl, Alert, Image, TextInput, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { compressPhoto } from "../lib/image";
import { C } from "../lib/theme";
import Coachmark from "../components/Coachmark";
import LogSaleModal from "../components/LogSaleModal";
import PhotoLightbox from "../components/PhotoLightbox";
import FlipActionsRow from "../components/FlipActionsRow";
import { toPendingScan } from "../lib/saleCapture";
import { API_BASE, rerunScan, updateScan, updateThriftItem, analyzeSpecialty } from "../lib/api";

function shareMsg(name: string, profit?: number, platform?: string): string {
  const p = (platform || "").split("|||")[0];
  if (profit && profit > 0) return `Found this ${name} - flipping for ~$${Math.round(profit)} profit${p ? ` on ${p}` : ""}. Tracked with ValuIQ.`;
  return `Checking out this ${name} on ValuIQ.`;
}

interface Props {
  token:string; plan:string; scansLeft:number|null;
  setScansLeft:(n:number|null)=>void;
  onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void;
  tourStep?: string|null; advanceTour?: (s: string|null) => void; skipTour?: () => void;
}

type HistoryTab = "scans" | "thrift" | "specialty";

function verdictColor(v: string) {
  if (v === "BUY") return C.green;
  if (v === "WATCH") return C.yellow;
  return C.red;
}

export default function HistoryScreen({ token, plan, onNavigate, onBack, tourStep, advanceTour, skipTour }: Props) {
  const [tab, setTab]               = useState<HistoryTab>("scans");
  const [scans, setScans]           = useState<any[]>([]);
  const [thriftRuns, setThriftRuns] = useState<any[]>([]);
  const [specialtyScans, setSpecialtyScans] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll]       = useState(false);
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected]     = useState<Record<string, boolean>>({});
  const [editingId, setEditingId]   = useState<string|null>(null);
  const [editName, setEditName]     = useState("");
  const [editBrand, setEditBrand]   = useState("");
  const [editCategory, setEditCat]  = useState("");
  const [editDesc, setEditDesc]     = useState("");
  const [editPrice, setEditPrice]   = useState("");
  const [editThriftItem, setEditThriftItem] = useState<{runId:string; itemId:string}|null>(null);
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [rerunning, setRerunning]   = useState(false);
  const [logSaleScan, setLogSaleScan] = useState<any|null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string|null>(null);

  function openEditor(scan: any) {
    setEditingId(scan.id);
    setEditName(scan.item_name || "");
    setEditBrand(scan.brand && scan.brand !== "Unknown" ? scan.brand : "");
    setEditCat(scan.category || "");
    setEditDesc("");
    setEditPrice(scan.buy_price ? String(scan.buy_price) : "");
    setEditPhotos([]);
  }

  function closeEditor() {
    setEditingId(null);
    setEditPhotos([]);
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
        const small = await compressPhoto(res.assets[0].base64); setEditPhotos(prev => [...prev, `data:image/jpeg;base64,${small}`]);
      }
    } catch {}
  }

  function addEditPhoto() {
    Alert.alert("Add Photo", "Choose a source", [
      { text: "Take Photo", onPress: () => pickFrom("camera") },
      { text: "Choose from Library", onPress: () => pickFrom("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function doRerun(scan: any) {
    if (!editName.trim()) { Alert.alert("Name required", "Enter an item name to re-run."); return; }
    setRerunning(true);
    try {
      const data = await rerunScan(token, {
        itemName: editName.trim(),
        brand: editBrand.trim() || "Unknown",
        category: editCategory.trim() || "Other",
        condition: scan.condition || "Good",
        buyPrice: parseFloat(editPrice) || scan.buy_price || 0,
        extraDescription: editDesc.trim() || undefined,
        newPhotosBase64: editPhotos.length > 0 ? editPhotos : undefined,
      });
      if (data && (data.success || data.sellPrice != null)) {
        const updates = {
          item_name: editName.trim(),
          brand: editBrand.trim() || "Unknown",
          category: editCategory.trim() || scan.category,
          buy_price: parseFloat(editPrice) || scan.buy_price || 0,
          sell_price: data.sellPrice ?? scan.sell_price,
          buy_target: data.buyTarget ?? scan.buy_target,
          net_profit: data.netProfit ?? scan.net_profit,
          decision: data.decision ?? scan.decision,
          best_platform: data.bestPlatform ?? scan.best_platform,
          roi: data.roi ?? scan.roi,
        };
        // Persist to DB (PATCH preserves image_url / thumbnail)
        try { await updateScan(token, scan.id, updates); } catch {}
        setScans(prev => prev.map(s => s.id === scan.id ? {
          ...s, ...updates,
          profit: data.netProfit ?? s.profit,
          verdict: data.decision ?? s.verdict,
        } : s));
        closeEditor();
        setExpanded(scan.id);
      } else {
        Alert.alert("Re-run failed", "Could not re-analyze. Try again.");
      }
    } catch {
      Alert.alert("Re-run failed", "Something went wrong. Try again.");
    }
    setRerunning(false);
  }

  // Specialty re-run: unlike scans, the original per-category form fields
  // (size, ref number, etc.) were never stored - only the appraisal result
  // was. Re-run works from the edited item name/description + any new
  // photos, same depth as scan re-run already offers. Real category comes
  // from best_platform (deal-ai-pro's specialty insert stores it there -
  // the row's own `category` column is always the fixed marker
  // "specialty_scan", used to filter type=specialty in the history query).
  async function doSpecialtyRerun(item: any) {
    if (!editName.trim()) { Alert.alert("Name required", "Enter an item name to re-run."); return; }
    setRerunning(true);
    try {
      const data = await analyzeSpecialty(
        token, item.best_platform, { description: editName.trim() },
        editPhotos.length > 0 ? editPhotos : undefined
      );
      if (data && data.success && data.result) {
        const r = data.result;
        const valueNum = Number(String(r.value || "").replace(/[^0-9.]/g, "").split(".")[0]) || 0;
        const updates = {
          item_name: r.identification || editName.trim(),
          decision: r.decision || item.decision,
          sell_price: valueNum || item.sell_price,
        };
        try { await updateScan(token, item.id, updates); } catch {}
        setSpecialtyScans(prev => prev.map(s => s.id === item.id ? { ...s, ...updates } : s));
        closeEditor();
        setExpanded(item.id);
      } else {
        Alert.alert("Re-run failed", data?.error || "Could not re-analyze. Try again.");
      }
    } catch {
      Alert.alert("Re-run failed", "Something went wrong. Try again.");
    }
    setRerunning(false);
  }
  const loadData = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const [scanRes, thriftRes, specRes] = await Promise.all([
        fetch(`${API_BASE}/api/scan-history?token=${token}&type=scan&limit=50`),
        fetch(`${API_BASE}/api/thrift-run?token=${token}`),
        fetch(`${API_BASE}/api/scan-history?token=${token}&type=specialty&limit=50`),
      ]);
      const scanData = await scanRes.json();
      const thriftJson = await thriftRes.json();
      const specData = await specRes.json();
      setScans(Array.isArray(scanData) ? scanData : []);
      setThriftRuns(thriftJson && thriftJson.success && Array.isArray(thriftJson.runs) ? thriftJson.runs : []);
      setSpecialtyScans(Array.isArray(specData) ? specData : []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { loadData(); }, [token]);

  // Reset selection when switching tabs or leaving select mode
  useEffect(() => { setSelected({}); setExpanded(null); setEditingId(null); }, [tab]);

  async function deleteOne(id: string) {
    try {
      await fetch(`${API_BASE}/api/scan-history?token=${token}&id=${id}`, { method: "DELETE" });
    } catch {}
  }

  function deleteItem(id: string, type: string, name: string) {
    Alert.alert("Delete", `Remove "${name}" from history?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await deleteOne(id);
          if (type === "thrift") setThriftRuns(prev => prev.filter(s => s.id !== id));
          else setScans(prev => prev.filter(s => s.id !== id));
        }
      }
    ]);
  }

  function toggleSelect(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function selectedIds() {
    return Object.keys(selected).filter(k => selected[k]);
  }

  function deleteSelected() {
    const ids = selectedIds();
    if (ids.length === 0) return;
    Alert.alert("Delete selected", `Remove ${ids.length} item${ids.length>1?"s":""} from history?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: `Delete ${ids.length}`, style: "destructive",
        onPress: async () => {
          await Promise.all(ids.map(deleteOne));
          if (tab === "thrift") setThriftRuns(prev => prev.filter(s => !ids.includes(s.id)));
          else setScans(prev => prev.filter(s => !ids.includes(s.id)));
          setSelected({});
          setSelectMode(false);
        }
      }
    ]);
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected({});
  }

  function openThriftEditor(run: any, item: any) {
    setEditThriftItem({ runId: run.runId, itemId: item.id });
    setEditName(item.itemName || "");
    setEditBrand("");
    setEditCat("");
    setEditDesc("");
    setEditPrice("");
    setEditPhotos([]);
  }

  async function doThriftRerun(run: any, item: any) {
    if (!editName.trim()) { Alert.alert("Name required", "Enter an item name to re-run."); return; }
    setRerunning(true);
    try {
      const data = await rerunScan(token, {
        itemName: editName.trim(),
        brand: editBrand.trim() || "Unknown",
        category: editCategory.trim() || "Other",
        condition: "Good",
        buyPrice: parseFloat(editPrice) || 0,
        extraDescription: editDesc.trim() || undefined,
        newPhotosBase64: editPhotos.length > 0 ? editPhotos : undefined,
      });
      if (data && (data.success || data.sellPrice != null)) {
        const updatedItem = {
          ...item,
          itemName: editName.trim(),
          decision: data.decision ?? item.decision,
          sellPrice: data.sellPrice ?? item.sellPrice,
          buyTarget: data.buyTarget ?? item.buyTarget,
          profit: data.netProfit ?? item.profit,
          roi: data.roi ?? item.roi,
          bestPlatform: data.bestPlatform ?? item.bestPlatform,
        };
        try {
          await updateThriftItem(token, {
            itemId: item.id, runId: run.runId,
            itemName: updatedItem.itemName, decision: updatedItem.decision,
            sellPrice: updatedItem.sellPrice, buyTarget: updatedItem.buyTarget,
            profit: updatedItem.profit, roi: updatedItem.roi,
            bestPlatform: updatedItem.bestPlatform,
            thumb: item.thumb || "", reasoning: item.reasoning || "", listingTitle: item.listingTitle || "",
          });
        } catch {}
        // Update local state: replace the item inside its run + recompute run totals
        setThriftRuns(prev => prev.map(r => {
          if (r.runId !== run.runId) return r;
          let arr: any[] = [];
          try { arr = JSON.parse(r.items || "[]"); } catch { arr = []; }
          arr = arr.map((it: any) => it.id === item.id ? updatedItem : it);
          const buys = arr.filter((it: any) => (it.decision || "").toUpperCase() === "BUY");
          const totalProfit = Math.round(buys.reduce((sum: number, it: any) => sum + (Number(it.profit) || 0), 0) * 100) / 100;
          return { ...r, items: JSON.stringify(arr), total_profit: totalProfit, buy_count: buys.length };
        }));
        setEditThriftItem(null);
        setEditPhotos([]);
      } else {
        Alert.alert("Re-run failed", "Could not re-analyze. Try again.");
      }
    } catch {
      Alert.alert("Re-run failed", "Something went wrong. Try again.");
    }
    setRerunning(false);
  }

  const displayScans  = showAll ? scans : scans.slice(0, 10);
  const displayThrift = thriftRuns;

  const buyScans    = scans.filter(s => (s.verdict||s.decision||"").toUpperCase() === "BUY");
  const totalProfit = buyScans.reduce((sum, s) => sum + (s.profit || s.net_profit || 0), 0);
  const selCount    = selectedIds().length;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <Coachmark
        visible={tourStep === "history"}
        step={5} totalSteps={5}
        title="Everything saves here"
        body="Every scan lands in your history. Tap any item to revisit it, or re-run the analysis anytime for fresh prices. You're ready to flip!"
        ctaLabel="Start flipping"
        anchor="center"
        onNext={() => skipTour && skipTour()}
        onSkip={() => skipTour && skipTour()}
      />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack || (() => onNavigate("dashboard"))}>
          <Text style={s.back}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Flips</Text>
        <TouchableOpacity onPress={() => selectMode ? exitSelect() : setSelectMode(true)}>
          <Text style={s.selectToggle}>{selectMode ? "Cancel" : "Select"}</Text>
        </TouchableOpacity>
      </View>

      {/* Summary stats */}
      <View style={s.statsBar}>
        {[
          [scans.length, "Scans"],
          [buyScans.length, "BUY Finds"],
          [`$${Math.round(totalProfit)}`, "Profit"],
          [thriftRuns.length, "Runs"],
        ].map(([val, label]) => (
          <View key={label as string} style={s.statItem}>
            <Text style={[s.statVal, {color:C.green}]}>{val}</Text>
            <Text style={s.statLbl}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(["scans","thrift","specialty"] as HistoryTab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab===t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabTxt, tab===t && s.tabActiveTxt]}>
              {t==="scans" ? "Scans" : t==="thrift" ? "Thrift Runs" : "Specialty"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Select-mode action bar */}
      {selectMode && (
        <View style={s.selectBar}>
          <Text style={s.selectCount}>{selCount} selected</Text>
          <TouchableOpacity
            style={[s.deleteSelectedBtn, selCount===0 && {opacity:0.4}]}
            disabled={selCount===0}
            onPress={deleteSelected}
          >
            <Text style={s.deleteSelectedTxt}>Delete {selCount > 0 ? selCount : ""}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={C.green} style={{marginTop:40}}/>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.green}
            onRefresh={() => { setRefreshing(true); loadData(); }}/>}
        >
          {/* SCANS TAB */}
          {tab === "scans" && (
            <>
              {displayScans.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyTxt}>No scans yet</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => onNavigate("scanner")}>
                    <Text style={s.emptyBtnTxt}>Scan Your First Item</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                displayScans.map(scan => {
                  const isSel = !!selected[scan.id];
                  let full: any = null;
                  try { full = scan.specialty_data ? JSON.parse(scan.specialty_data) : null; } catch { full = null; }
                  return (
                  <TouchableOpacity
                    key={scan.id}
                    style={[s.card, isSel && s.cardSelected]}
                    onPress={() => selectMode ? toggleSelect(scan.id) : setExpanded(expanded === scan.id ? null : scan.id)}
                    activeOpacity={0.85}
                  >
                    <View style={s.cardHeader}>
                      {selectMode && (
                        <View style={[s.checkbox, isSel && s.checkboxOn]}>
                          {isSel && <Text style={s.checkboxTick}>{"\u2713"}</Text>}
                        </View>
                      )}
                      {scan.image_url ? (
                        <Image source={{uri: scan.image_url}} style={s.thumb}/>
                      ) : (
                        <View style={[s.thumb, {backgroundColor:C.surfaceHigh, alignItems:"center", justifyContent:"center"}]}>
                          <Text style={{fontSize:20, color:C.text4, fontWeight:"800"}}>{(scan.item_name||"?").charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{flex:1}}>
                        <Text style={s.cardName} numberOfLines={1}>{scan.item_name || "Item"}</Text>
                        <Text style={s.cardMeta}>{new Date(scan.created_at).toLocaleDateString()}</Text>
                        {scan.best_platform ? (
                          <Text style={s.cardPlatform} numberOfLines={1}>{scan.best_platform}</Text>
                        ) : null}
                      </View>
                      <View style={s.cardRight}>
                        <View style={[s.verdict, {backgroundColor:verdictColor(scan.verdict||scan.decision||"PASS")+"20"}]}>
                          <Text style={[s.verdictTxt, {color:verdictColor(scan.verdict||scan.decision||"PASS")}]}>
                            {(scan.verdict||scan.decision||"PASS").toUpperCase()}
                          </Text>
                        </View>
                        {(scan.profit||scan.net_profit||0) > 0 && (
                          <Text style={s.profit}>+${Math.round(scan.profit||scan.net_profit||0)}</Text>
                        )}
                      </View>
                    </View>

                    {!selectMode && (
                      <View style={s.cardActionsWrap}>
                        <FlipActionsRow
                          hasPhoto={!!scan.image_url}
                          onView={() => setViewingPhoto(scan.image_url)}
                          onSold={() => setLogSaleScan(scan)}
                          onEdit={() => { openEditor(scan); setExpanded(scan.id); }}
                          shareMessage={shareMsg(scan.item_name || "Item", scan.profit || scan.net_profit, scan.best_platform)}
                          onDelete={() => deleteItem(scan.id, "scan", scan.item_name||"Item")}
                        />
                      </View>
                    )}

                    {!selectMode && expanded === scan.id && (
                      <View style={s.expanded}>
                        <View style={s.expandedRow}>
                          {[
                            ["Max Pay", "$" + (Math.round((scan.buy_target || (scan.sell_price ? scan.sell_price * 0.4 : 0)) * 100) / 100), C.yellow],
                            ["Sell For", scan.sell_price ? "$" + (scan.sell_price) : "-", C.text1],
                            ["Profit", (scan.profit||scan.net_profit) ? "$" + (Math.round(scan.profit||scan.net_profit||0)) : "-", C.green],
                            ["ROI", scan.roi ? (Math.round(scan.roi)) + "%" : "-", C.green],
                          ].map(([label, val, color]) => (
                            <View key={label as string} style={s.expandedStat}>
                              <Text style={[s.expandedVal, {color: color as string}]}>{val}</Text>
                              <Text style={s.expandedLbl}>{label}</Text>
                            </View>
                          ))}
                        </View>
                        {scan.best_platform ? (
                          <Text style={{color:C.text3,fontSize:12,marginBottom:8}}>
                            Best platform: <Text style={{color:C.text1,fontWeight:"700"}}>{scan.best_platform}</Text>
                          </Text>
                        ) : null}

                        {full && editingId !== scan.id && (
                          <>
                            {full.platformBreakdown && full.platformBreakdown.length > 0 && (
                              <View style={s.apprSection}>
                                <Text style={s.apprLabel}>Platform breakdown</Text>
                                {full.platformBreakdown.slice(0,3).map((pb:any, i:number) => {
                                  const profNum = Number(pb.netProfit) || 0;
                                  const isNeg = profNum < 0;
                                  return (
                                    <Text key={pb.platform} style={[s.apprBullet, isNeg && {color:C.red}]}>
                                      {pb.platform}: {isNeg ? "-$" + Math.abs(profNum) : "+$" + profNum} profit
                                    </Text>
                                  );
                                })}
                              </View>
                            )}
                            {full.reasoning ? (
                              <View style={s.apprSection}><Text style={s.apprLabel}>Analysis</Text><Text style={s.apprText}>{full.reasoning}</Text></View>
                            ) : null}
                            {full.hotTip ? (
                              <View style={s.apprSection}><Text style={[s.apprLabel,{color:C.red}]}>Hot Tip</Text><Text style={s.apprText}>{full.hotTip}</Text></View>
                            ) : null}
                            {full.riskScore !== undefined ? (
                              <Text style={{color:C.text3,fontSize:12,marginBottom:8}}>
                                Risk Score: {full.riskScore}/10{full.watchOutFor ? " — " + full.watchOutFor : ""}
                              </Text>
                            ) : null}
                            {full.timeToSell ? (
                              <Text style={{color:C.text3,fontSize:12,marginBottom:8}}>
                                Time to sell: {full.timeToSell} {"·"} Payout {full.payoutSpeed || "3-5 days"}
                              </Text>
                            ) : null}
                          </>
                        )}

                        {editingId === scan.id ? (
                          <View style={s.editPanel}>
                            <Text style={s.editLabel}>Item name</Text>
                            <TextInput style={s.editInput} value={editName} onChangeText={setEditName} placeholder="Item name" placeholderTextColor={C.text4}/>
                            <Text style={s.editLabel}>Brand</Text>
                            <TextInput style={s.editInput} value={editBrand} onChangeText={setEditBrand} placeholder="Brand (optional)" placeholderTextColor={C.text4}/>
                            <Text style={s.editLabel}>Category</Text>
                            <TextInput style={s.editInput} value={editCategory} onChangeText={setEditCat} placeholder="Category" placeholderTextColor={C.text4}/>
                            <Text style={s.editLabel}>Extra details (optional)</Text>
                            <TextInput style={s.editInput} value={editDesc} onChangeText={setEditDesc} placeholder="Model, condition notes, etc." placeholderTextColor={C.text4}/>
                            <Text style={s.editLabel}>What you paid (optional)</Text>
                            <TextInput style={s.editInput} value={editPrice} onChangeText={setEditPrice} placeholder="0.00" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>
                            {editPhotos.length > 0 && (
                              <ScrollView horizontal style={{marginTop:8}} showsHorizontalScrollIndicator={false}>
                                {editPhotos.map((ph, pi) => (
                                  <Image key={pi} source={{uri: ph}} style={s.editPhotoThumb}/>
                                ))}
                              </ScrollView>
                            )}
                            <TouchableOpacity style={s.addPhotoBtn} onPress={addEditPhoto}>
                              <Text style={s.addPhotoTxt}>+ Add Photo {editPhotos.length > 0 ? "("+editPhotos.length+")" : ""}</Text>
                            </TouchableOpacity>
                            <View style={[s.expandedActions, {marginTop:10}]}>
                              <TouchableOpacity style={[s.actionBtn,{flex:1, opacity: rerunning ? 0.5 : 1}]} disabled={rerunning} onPress={() => doRerun(scan)}>
                                <Text style={s.actionBtnTxt}>{rerunning ? "Re-running..." : "Re-run Analysis"}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[s.actionBtn,{backgroundColor:C.surfaceHigh, borderColor:C.border}]} disabled={rerunning} onPress={closeEditor}>
                                <Text style={[s.actionBtnTxt,{color:C.text3}]}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    )}
                  </TouchableOpacity>
                  );
                })
              )}

              {scans.length > 10 && !selectMode && (
                <TouchableOpacity style={s.showMore} onPress={() => setShowAll(v => !v)}>
                  <Text style={s.showMoreTxt}>
                    {showAll ? "Show Less" : `Show ${scans.length - 10} More`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* THRIFT RUNS TAB */}
          {tab === "thrift" && (
            <>
              {displayThrift.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyTxt}>No Thrift Runs yet</Text>
                  <TouchableOpacity style={s.emptyBtn} onPress={() => onNavigate("thrift-run")}>
                    <Text style={s.emptyBtnTxt}>Start a Thrift Run</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                displayThrift.map(run => {
                  const isSel = !!selected[run.id];
                  const items = (() => { try { return JSON.parse(run.items || "[]"); } catch { return []; } })();
                  return (
                    <TouchableOpacity
                      key={run.id}
                      style={[s.card, isSel && s.cardSelected]}
                      onPress={() => selectMode ? toggleSelect(run.id) : setExpanded(expanded === run.id ? null : run.id)}
                      activeOpacity={0.85}
                    >
                      <View style={s.cardHeader}>
                        {selectMode && (
                          <View style={[s.checkbox, isSel && s.checkboxOn]}>
                            {isSel && <Text style={s.checkboxTick}>{"\u2713"}</Text>}
                          </View>
                        )}
                        <View style={[s.thumb, {backgroundColor:"#0a1500", alignItems:"center", justifyContent:"center"}]}>
                          <Text style={{fontSize:20, color:C.green, fontWeight:"900"}}>TR</Text>
                        </View>
                        <View style={{flex:1}}>
                          <Text style={s.cardName} numberOfLines={1}>{run.store_name || "Thrift Run"}</Text>
                          <Text style={s.cardMeta}>{new Date(run.created_at).toLocaleDateString()}</Text>
                          <Text style={s.cardPlatform}>{(run.total_items||items.length)} items  -  {run.buy_count||0} BUY</Text>
                        </View>
                        <View style={s.cardRight}>
                          <Text style={[s.profit, {fontSize:16}]}>+${Math.round(run.total_profit||0)}</Text>
                        </View>
                      </View>

                      {!selectMode && expanded === run.id && (
                        <View style={s.expanded}>
                          {items.map((item: any, i: number) => (
                            editThriftItem && editThriftItem.itemId === item.id ? (
                              <View key={i} style={s.editPanel}>
                                <Text style={s.editLabel}>Item name</Text>
                                <TextInput style={s.editInput} value={editName} onChangeText={setEditName} placeholder="Item name" placeholderTextColor={C.text4}/>
                                <Text style={s.editLabel}>Brand</Text>
                                <TextInput style={s.editInput} value={editBrand} onChangeText={setEditBrand} placeholder="Brand (optional)" placeholderTextColor={C.text4}/>
                                <Text style={s.editLabel}>Extra details (optional)</Text>
                                <TextInput style={s.editInput} value={editDesc} onChangeText={setEditDesc} placeholder="Model, condition notes" placeholderTextColor={C.text4}/>
                                <Text style={s.editLabel}>What you paid (optional)</Text>
                                <TextInput style={s.editInput} value={editPrice} onChangeText={setEditPrice} placeholder="0.00" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>
                                {editPhotos.length > 0 && (
                                  <ScrollView horizontal style={{marginTop:8}} showsHorizontalScrollIndicator={false}>
                                    {editPhotos.map((ph, pi) => (<Image key={pi} source={{uri: ph}} style={s.editPhotoThumb}/>))}
                                  </ScrollView>
                                )}
                                <TouchableOpacity style={s.addPhotoBtn} onPress={addEditPhoto}>
                                  <Text style={s.addPhotoTxt}>+ Add Photo {editPhotos.length > 0 ? "("+editPhotos.length+")" : ""}</Text>
                                </TouchableOpacity>
                                <View style={[s.expandedActions, {marginTop:10}]}>
                                  <TouchableOpacity style={[s.actionBtn,{flex:1, opacity: rerunning ? 0.5 : 1}]} disabled={rerunning} onPress={() => doThriftRerun(run, item)}>
                                    <Text style={s.actionBtnTxt}>{rerunning ? "Re-running..." : "Re-run"}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity style={[s.actionBtn,{backgroundColor:C.surfaceHigh, borderColor:C.border}]} disabled={rerunning} onPress={() => { setEditThriftItem(null); setEditPhotos([]); }}>
                                    <Text style={[s.actionBtnTxt,{color:C.text3}]}>Cancel</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                            <View key={i} style={s.thriftItemWrap}>
                              <View style={s.thriftItemRow}>
                                {item.thumb ? (
                                  <Image source={{uri: item.thumb}} style={s.thriftThumb}/>
                                ) : (
                                  <View style={[s.thriftThumb, {backgroundColor:C.surfaceHigh, alignItems:"center", justifyContent:"center"}]}>
                                    <Text style={{fontSize:16, color:C.text4, fontWeight:"800"}}>{(item.itemName||"?").charAt(0).toUpperCase()}</Text>
                                  </View>
                                )}
                                <View style={{flex:1}}>
                                  <Text style={s.cardName} numberOfLines={1}>{item.itemName || "Item"}</Text>
                                  <Text style={s.cardPlatform} numberOfLines={1}>Pay {"\u2264"}${item.buyTarget} {"\u00B7"} {item.bestPlatform}</Text>
                                </View>
                                <Text style={[s.profit, {fontSize:14, color:(item.decision==="BUY"?C.green:C.text4)}]}>
                                  {item.decision==="BUY" ? "+$"+Math.round(item.profit||0) : "PASS"}
                                </Text>
                              </View>
                              <FlipActionsRow
                                hasPhoto={!!item.thumb}
                                onView={() => setViewingPhoto(item.thumb)}
                                onSold={() => setLogSaleScan({ ...item, created_at: item.created_at || run.created_at })}
                                onEdit={() => openThriftEditor(run, item)}
                                shareMessage={shareMsg(item.itemName || "Item", item.profit, item.bestPlatform)}
                              />
                            </View>
                            )
                          ))}
                          <View style={[s.expandedActions, {marginTop:10}]}>
                            <TouchableOpacity style={[s.actionBtn,{flex:1}]} onPress={() => onNavigate("thrift-run")}>
                              <Text style={s.actionBtnTxt}>New Run</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.actionBtn, {backgroundColor:"#ff5a5a15", borderColor:"#ff5a5a30"}]}
                              onPress={() => deleteItem(run.id, "thrift", run.store_name||"Thrift Run")}
                            >
                              <Text style={[s.actionBtnTxt, {color:C.red}]}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          {tab === "specialty" && (
            <>
              {specialtyScans.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>No specialty appraisals yet.</Text>
                  <Text style={s.emptySub}>Run the Specialty Scanner to appraise sneakers, watches, wine, cards and more.</Text>
                </View>
              ) : (
                specialtyScans.map(item => {
                  const isSel = !!selected[item.id];
                  let appr: any = {};
                  try { appr = JSON.parse(item.specialty_data || "{}"); } catch { appr = {}; }
                  const decColor = item.decision === "BUY" ? C.green : item.decision === "WATCH" ? C.yellow : C.red;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[s.card, isSel && s.cardSelected]}
                      onPress={() => selectMode ? toggleSelect(item.id) : setExpanded(expanded === item.id ? null : item.id)}
                      activeOpacity={0.85}
                    >
                      <View style={s.cardHeader}>
                        {selectMode && (
                          <View style={[s.checkbox, isSel && s.checkboxOn]}>
                            {isSel && <Text style={s.checkboxTick}>{"\u2713"}</Text>}
                          </View>
                        )}
                        {item.image_url ? (
                          <Image source={{uri: item.image_url}} style={s.thumb}/>
                        ) : (
                          <View style={[s.thumb, {backgroundColor:"#0a1500", alignItems:"center", justifyContent:"center"}]}>
                            <Text style={{fontSize:18, color:C.green, fontWeight:"900"}}>{"\u2605"}</Text>
                          </View>
                        )}
                        <View style={{flex:1}}>
                          <Text style={s.cardName} numberOfLines={1}>{item.item_name || "Appraisal"}</Text>
                          <Text style={s.cardMeta}>{new Date(item.created_at).toLocaleDateString()}</Text>
                          <Text style={s.cardPlatform}>{appr.value || ("$" + (item.sell_price||0))}</Text>
                        </View>
                        <View style={[s.verdictBadge, {backgroundColor: decColor + "20"}]}>
                          <Text style={[s.verdictBadgeTxt, {color: decColor}]}>{item.decision || "WATCH"}</Text>
                        </View>
                      </View>

                      {!selectMode && (
                        <View style={s.cardActionsWrap}>
                          <FlipActionsRow
                            hasPhoto={!!item.image_url}
                            onView={() => setViewingPhoto(item.image_url)}
                            onSold={() => setLogSaleScan(item)}
                            onEdit={() => { openEditor(item); setExpanded(item.id); }}
                            shareMessage={shareMsg(item.item_name || "Appraisal", undefined, item.best_platform)}
                            onDelete={() => deleteItem(item.id, "scan", item.item_name||"Appraisal")}
                          />
                        </View>
                      )}

                      {!selectMode && expanded === item.id && (
                        <View style={s.expanded}>
                          {editingId === item.id ? (
                          <View style={s.editPanel}>
                            <Text style={s.editLabel}>Item name</Text>
                            <TextInput style={s.editInput} value={editName} onChangeText={setEditName} placeholder="Item name" placeholderTextColor={C.text4}/>
                            {editPhotos.length > 0 && (
                              <ScrollView horizontal style={{marginTop:8}} showsHorizontalScrollIndicator={false}>
                                {editPhotos.map((ph, pi) => (
                                  <Image key={pi} source={{uri: ph}} style={s.editPhotoThumb}/>
                                ))}
                              </ScrollView>
                            )}
                            <TouchableOpacity style={s.addPhotoBtn} onPress={addEditPhoto}>
                              <Text style={s.addPhotoTxt}>+ Add Photo {editPhotos.length > 0 ? "("+editPhotos.length+")" : ""}</Text>
                            </TouchableOpacity>
                            <View style={[s.expandedActions, {marginTop:10}]}>
                              <TouchableOpacity style={[s.actionBtn,{flex:1, opacity: rerunning ? 0.5 : 1}]} disabled={rerunning} onPress={() => doSpecialtyRerun(item)}>
                                <Text style={s.actionBtnTxt}>{rerunning ? "Re-running..." : "Re-run Analysis"}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[s.actionBtn,{backgroundColor:C.surfaceHigh, borderColor:C.border}]} disabled={rerunning} onPress={closeEditor}>
                                <Text style={[s.actionBtnTxt,{color:C.text3}]}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                          ) : (
                          <>
                          {appr._ebay && appr._ebay.count > 0 ? (
                            <Text style={{color:C.green, fontSize:12, marginBottom:10}}>{appr._ebay.count} live eBay listings {"\u00B7"} ${appr._ebay.min}-${appr._ebay.max} (median ${appr._ebay.median})</Text>
                          ) : null}
                          {appr.variantCheck ? (
                            <View style={s.apprSection}><Text style={[s.apprLabel,{color:C.green}]}>Variant check</Text><Text style={s.apprText}>{appr.variantCheck}</Text></View>
                          ) : null}
                          {appr.conditionCurve ? (
                            <View style={s.apprSection}><Text style={s.apprLabel}>Condition & grade value</Text><Text style={s.apprText}>{appr.conditionCurve}</Text></View>
                          ) : null}
                          {appr.authFlags && appr.authFlags.length > 0 ? (
                            <View style={s.apprSection}>
                              <Text style={[s.apprLabel,{color:C.red}]}>Authenticity flags</Text>
                              {appr.authFlags.map((fl: string, i: number) => (
                                <Text key={i} style={s.apprBullet}>{"\u2022"} {fl}</Text>
                              ))}
                            </View>
                          ) : null}
                          {appr.valueAddMoves ? (
                            <View style={s.apprSection}><Text style={[s.apprLabel,{color:C.green}]}>Value-add moves</Text><Text style={s.apprText}>{appr.valueAddMoves}</Text></View>
                          ) : null}
                          {appr.timing ? (
                            <View style={s.apprSection}><Text style={s.apprLabel}>Where & when to sell</Text><Text style={s.apprText}>{appr.timing}</Text></View>
                          ) : null}
                          {appr.verifyLinks && Object.keys(appr.verifyLinks).length > 0 ? (
                            <View style={{flexDirection:"row", flexWrap:"wrap", gap:8, marginTop:4, marginBottom:8}}>
                              {Object.entries(appr.verifyLinks).map(([name, url]: any, i: number) => (
                                <TouchableOpacity key={i} style={{backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:12, paddingVertical:8}} onPress={() => Linking.openURL(url as string)}>
                                  <Text style={{color:C.text1, fontSize:12, fontWeight:"700"}}>{name} {"\u2197"}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          ) : null}
                          </>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}

      <LogSaleModal
        visible={!!logSaleScan}
        token={token}
        scan={logSaleScan ? toPendingScan(logSaleScan) : null}
        onClose={() => { setLogSaleScan(null); loadData(); }}
      />

      <PhotoLightbox uri={viewingPhoto} onClose={() => setViewingPhoto(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex:1, backgroundColor:C.bg },
  header:        { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingTop:16, paddingBottom:10, borderBottomWidth:1, borderBottomColor:C.border },
  back:          { color:C.text3, fontSize:24, fontWeight:"700" },
  headerTitle:   { color:C.text1, fontSize:17, fontWeight:"800" },
  selectToggle:  { color:C.green, fontSize:14, fontWeight:"700" },
  statsBar:      { flexDirection:"row", backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border },
  statItem:      { flex:1, alignItems:"center", paddingVertical:10 },
  statVal:       { fontSize:17, fontWeight:"900", letterSpacing:-0.5 },
  statLbl:       { color:C.text4, fontSize:9, fontWeight:"700", textTransform:"uppercase", marginTop:2 },
  tabs:          { flexDirection:"row", borderBottomWidth:1, borderBottomColor:C.border },
  tabBtn:        { flex:1, paddingTop:16, paddingBottom:12, alignItems:"center" },
  tabActive:     { borderBottomWidth:2, borderBottomColor:C.green },
  tabTxt:        { color:C.text4, fontSize:13, fontWeight:"700" },
  tabActiveTxt:  { color:C.green },
  selectBar:     { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, paddingVertical:10, backgroundColor:C.surface, borderBottomWidth:1, borderBottomColor:C.border },
  selectCount:   { color:C.text2, fontSize:13, fontWeight:"600" },
  deleteSelectedBtn: { backgroundColor:"#ff5a5a", borderRadius:8, paddingHorizontal:16, paddingVertical:8 },
  deleteSelectedTxt: { color:"#fff", fontSize:13, fontWeight:"800" },
  scroll:        { padding:14, paddingBottom:80 },
  empty:         { alignItems:"center", paddingVertical:48 },
  emptyTxt:      { color:C.text3, fontSize:15, fontWeight:"600", marginBottom:16 },
  emptyBtn:      { backgroundColor:C.greenBg, borderRadius:12, paddingHorizontal:20, paddingVertical:14, borderWidth:1, borderColor:C.greenBorder },
  emptyBtnTxt:   { color:C.green, fontSize:14, fontWeight:"700" },
  card:          { backgroundColor:C.surface, borderRadius:14, marginBottom:10, borderWidth:1, borderColor:C.border, overflow:"hidden" },
  cardSelected:  { borderColor:C.green, borderWidth:2 },
  cardHeader:    { flexDirection:"row", alignItems:"center", padding:12, gap:10 },
  cardActionsWrap:{ paddingHorizontal:12, paddingBottom:12 },
  checkbox:      { width:24, height:24, borderRadius:6, borderWidth:2, borderColor:C.text4, alignItems:"center", justifyContent:"center" },
  checkboxOn:    { backgroundColor:C.green, borderColor:C.green },
  checkboxTick:  { color:"#000", fontSize:14, fontWeight:"900" },
  thumb:         { width:56, height:56, borderRadius:10, flexShrink:0 },
  cardName:      { color:C.text1, fontSize:14, fontWeight:"700", marginBottom:2 },
  cardMeta:      { color:C.text4, fontSize:11 },
  cardPlatform:  { color:C.text3, fontSize:11, marginTop:2 },
  cardRight:     { alignItems:"flex-end", gap:4 },
  verdict:       { borderRadius:8, paddingHorizontal:8, paddingVertical:4 },
  verdictTxt:    { fontSize:9, fontWeight:"900" },
  profit:        { color:C.green, fontSize:15, fontWeight:"800" },
  expanded:      { borderTopWidth:1, borderTopColor:C.border, padding:14 },
  expandedRow:   { flexDirection:"row", justifyContent:"space-around", marginBottom:14 },
  expandedStat:  { alignItems:"center" },
  expandedVal:   { fontSize:16, fontWeight:"800" },
  expandedLbl:   { color:C.text4, fontSize:10, marginTop:2 },
  expandedActions:{ flexDirection:"row", gap:8 },
  soldBtn:       { backgroundColor:C.green, borderRadius:10, paddingVertical:13, alignItems:"center", marginBottom:8 },
  soldBtnTxt:    { color:C.greenDark, fontSize:14, fontWeight:"800" },
  thriftItemWrap:{ paddingVertical:8, borderBottomWidth:1, borderBottomColor:C.border },
  thriftItemRow: { flexDirection:"row", alignItems:"center", gap:10 },
  thriftThumb:   { width:44, height:44, borderRadius:8, flexShrink:0 },
  editPanel:     { marginTop:4 },
  editLabel:     { color:C.text4, fontSize:11, fontWeight:"700", marginBottom:4, marginTop:8, textTransform:"uppercase" },
  editInput:     { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:12, paddingVertical:10, color:C.text1, fontSize:14 },
  editPhotoThumb:{ width:56, height:56, borderRadius:8, marginRight:8 },
  addPhotoBtn:   { marginTop:10, backgroundColor:C.surfaceHigh, borderWidth:1, borderColor:C.border, borderRadius:10, paddingVertical:10, alignItems:"center" },
  addPhotoTxt:   { color:C.text2, fontSize:13, fontWeight:"700" },
  actionBtn:     { flex:1, backgroundColor:C.greenBg, borderRadius:10, padding:12, alignItems:"center", borderWidth:1, borderColor:C.greenBorder },
  actionBtnTxt:  { color:C.green, fontSize:12, fontWeight:"700" },
  showMore:      { alignItems:"center", paddingVertical:14 },
  showMoreTxt:   { color:C.green, fontSize:13, fontWeight:"600" },
  emptyWrap:     { alignItems:"center", paddingVertical:50, paddingHorizontal:30 },
  emptyText:     { color:C.text2, fontSize:15, fontWeight:"700", marginBottom:6 },
  emptySub:      { color:C.text4, fontSize:13, textAlign:"center", lineHeight:19 },
  apprSection:   { marginBottom:12 },
  apprLabel:     { color:C.text2, fontSize:12, fontWeight:"800", textTransform:"uppercase", marginBottom:4 },
  apprText:      { color:C.text2, fontSize:13, lineHeight:20 },
  apprBullet:    { color:C.text2, fontSize:13, lineHeight:20, marginBottom:2 },
  verdictBadge:  { paddingHorizontal:10, paddingVertical:5, borderRadius:8 },
  verdictBadgeTxt: { fontSize:12, fontWeight:"800" },
});
