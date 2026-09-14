import React, { useState, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Image, Dimensions, Linking, TextInput, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
let CameraView: any = null; let useCameraPermissions: any = () => [null, async()=>{}];
if (require("react-native").Platform.OS !== "web") { try { const c = require("expo-camera"); CameraView = c.CameraView; useCameraPermissions = c.useCameraPermissions; } catch {} }
import * as ImagePicker from "expo-image-picker";
import { compressPhoto } from "../lib/image";
import { C } from "../lib/theme";
import HeaderLogo from "../components/HeaderLogo";
import ShareButton from "../components/ShareButton";
import { API_BASE, rerunScan } from "../lib/api";
import { classifyOutcome, OutcomeTierInfo } from "../lib/outcomeTier";

const { width } = Dimensions.get("window");

type ItemStatus = "scanning"|"done"|"error";
// roi/noFlipMargin (BEASTMODE FIX 1, 2026-09-13) - added so this screen can
// run the SAME classifyOutcome() Scanner uses instead of trusting the raw
// backend `decision` field, which used to disagree with Scanner's tier for
// the identical numbers (the backend's own 10%/25% split vs outcomeTier's
// real 30% BUY floor - now fixed server-side too, but computing the tier
// locally here means this screen can never drift again even if the two
// backends' thresholds are retuned independently in the future).
// brand/category/condition/buyPrice (2026-09-14, THRIFT-RUN USABILITY FIX):
// brand/category/condition let a per-item correction re-submit the full
// identity, not just the name; buyPrice is what the user actually paid -
// previously nonexistent, so profit/ROI always assumed the max-buy CEILING
// as cost, never a real number.
type RunItem = { id:string; photo:string; status:ItemStatus; decision?:string; profit?:number; roi?:number; noFlipMargin?:boolean; sellPrice?:number; buyTarget?:number; platform?:string; name?:string; brand?:string; category?:string; condition?:string; buyPrice?:number; error?:string; };

// classifyOutcome() needs the full OutcomeTierInput shape - the fields this
// screen doesn't track (daysToSell/velocityTier/sellThrough/dataQuality/
// sellPrice/sellTimeLabel) are display-only in classifyOutcome and safe to
// pass as null/undefined (see outcomeTier.ts's own comments on each field).
function itemTier(item: RunItem): OutcomeTierInfo | null {
  if (!item.decision) return null; // not analyzed yet
  return classifyOutcome({
    noFlipMargin: !!item.noFlipMargin,
    netProfit: item.profit || 0,
    roi: item.roi || 0,
    daysToSell: null, velocityTier: null, sellThrough: null,
    dataQuality: null, sellPrice: null, sellTimeLabel: null,
  });
}

// ONE FEE TABLE (mirrors deal-ai-pro/lib/profitMath.ts's PLATFORM_FEES -
// can't literally share a module across the two repos). Used ONLY for the
// local price-entry recompute below - the server-computed sellPrice/
// buyTarget this screen already has are never touched.
const PLATFORM_FEES: Record<string, number> = {
  eBay: 0.1327, Poshmark: 0.20, Mercari: 0.10, Depop: 0.10,
  Etsy: 0.065, Whatnot: 0.11, StockX: 0.125, GOAT: 0.095,
  Facebook: 0.05, OfferUp: 0.0, Amazon: 0.15,
};

// LOCAL RECOMPUTE (2026-09-14, THRIFT-RUN USABILITY FIX): mirrors
// ScannerScreen.tsx's local recompute exactly - sellPrice (resale) is
// SERVER data and never moves here; only the cost-basis-dependent numbers
// (fees/profit/roi) recompute off the newly entered buyPrice. No network
// call - this is what makes it instant, and what guarantees "what you paid"
// can never accidentally re-derive resale the way History's rerun bug did.
function applyPaidPrice(item: RunItem, paidPrice: number): RunItem {
  const sellPrice = Number(item.sellPrice) || 0;
  const platformName = item.platform?.split("|||")[0] || "";
  const feeRate = PLATFORM_FEES[platformName] ?? 0.13;
  const fees = Math.round(sellPrice * feeRate * 100) / 100;
  const netProfit = Math.round((sellPrice - fees - paidPrice) * 100) / 100;
  const roi = paidPrice > 0 ? Math.round((netProfit / paidPrice) * 100) : 0;
  return { ...item, buyPrice: paidPrice, profit: netProfit, roi };
}

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function ThriftRunScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"intro"|"running"|"done">("intro");
  const [items, setItems] = useState<RunItem[]>([]);
  // THRIFT-RUN USABILITY FIX (2026-09-14): was `selectedItem: RunItem|null`,
  // a snapshot taken at tap time - once price entry / correction could
  // mutate an item in place, that snapshot went stale (the list badges
  // above would update, but the expanded detail card underneath wouldn't).
  // Storing just the id and deriving the live object below means the detail
  // card always reflects whatever `items` currently holds.
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const selectedItem = items.find(i => i.id === selectedId) || null;
  const [paidPriceInput, setPaidPriceInput] = useState("");
  const [editingCorrection, setEditingCorrection] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editCondition, setEditCondition] = useState("Good");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const cameraRef = useRef<any>(null);
  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  // Opens (or closes, on a second tap) an item's detail card and resets the
  // edit forms to that item's current values - so re-opening a different
  // item never shows stale text from whichever item was open before.
  function selectItem(item: RunItem) {
    if (selectedId === item.id) { setSelectedId(null); setEditingCorrection(false); return; }
    setSelectedId(item.id);
    setPaidPriceInput(item.buyPrice != null ? String(item.buyPrice) : "");
    setEditName(item.name || ""); setEditBrand(item.brand || "");
    setEditCategory(item.category || ""); setEditCondition(item.condition || "Good");
    setEditingCorrection(false);
  }

  // PRICE INPUT (2026-09-14, THRIFT-RUN USABILITY FIX): instant, local,
  // same guarantee as ScannerScreen.tsx's own price recompute - resale
  // (sellPrice) never moves, only profit/ROI/tier (via applyPaidPrice ->
  // itemTier reading the updated item.profit/roi).
  function applyPrice() {
    if (!selectedItem) return;
    const paid = parseFloat(paidPriceInput) || 0;
    setItems(prev => prev.map(x => x.id === selectedItem.id ? applyPaidPrice(x, paid) : x));
  }

  // PER-ITEM CORRECTION (2026-09-14, THRIFT-RUN USABILITY FIX): a real
  // identity change (wrong brand/name/condition guess) genuinely can move
  // resale, unlike a price edit - so this is a real, if lightweight, server
  // round trip (same confirmedIdentification mechanism History's rerun
  // uses), NOT a local recompute. No storedResale is sent - unlike History's
  // rerun, the whole point here is letting resale be freshly re-derived for
  // the CORRECTED item, since the original resale was computed for a
  // possibly-wrong identification.
  async function saveCorrection() {
    if (!selectedItem || !editName.trim()) return;
    setSavingCorrection(true);
    try {
      const data = await rerunScan(token, {
        itemName: editName.trim(),
        brand: editBrand.trim() || "Unknown",
        category: editCategory.trim() || "Other",
        condition: editCondition.trim() || "Good",
        buyPrice: selectedItem.buyPrice || 0,
      });
      if (data && (data.success || data.sellPrice != null)) {
        setItems(prev => prev.map(x => x.id === selectedItem.id ? {
          ...x,
          decision: data.decision, profit: data.netProfit, roi: data.roi, noFlipMargin: data.noFlipMargin,
          sellPrice: data.sellPrice, buyTarget: data.buyTarget, platform: data.bestPlatform,
          name: data.itemName, brand: data.brand, category: data.category, condition: data.condition,
        } : x));
        setEditingCorrection(false);
      } else {
        Alert.alert("Couldn't update", "Try again.");
      }
    } catch {
      Alert.alert("Couldn't update", "Check your connection and try again.");
    }
    setSavingCorrection(false);
  }

  // DELETE (2026-09-14, THRIFT-RUN USABILITY FIX): a bad photo, a duplicate,
  // or an item the user just decides not to count - local only, nothing was
  // ever saved to the server for an in-progress run (thrift-run-save only
  // fires once, at End Run).
  function deleteItem(id: string) {
    setItems(prev => prev.filter(x => x.id !== id));
    if (selectedId === id) { setSelectedId(null); setEditingCorrection(false); }
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    if (!isPaid && (scansLeft||0) <= 0) { return; }
    const photo = await cameraRef.current.takePictureAsync({ base64:true, quality:0.65 });
    if (!photo?.base64) return;
    const small = await compressPhoto(photo.base64);
    const id = Date.now().toString();
    const newItem: RunItem = { id, photo:small, status:"scanning" };
    setItems(prev=>[newItem,...prev]);
    if (!isPaid) setScansLeft(n=>n!==null?Math.max(0,n-1):null);
    // Analyze in background,
    analyzeItem(id, small);
  }

  async function analyzeItem(id: string, base64: string) {
    try {
      const r = await fetch(`${API_BASE}/api/lens`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ userToken:token, images:[`data:image/jpeg;base64,${base64}`], isThriftRun:true }) });
      const d = await r.json();
      if (d.error==="scan_limit_reached") {
        setItems(prev=>prev.map(x=>x.id===id?{...x,status:"error",error:"Scan limit reached"}:x));
        return;
      }
      if (d.success) {
        setItems(prev=>prev.map(x=>x.id===id?{
          ...x, status:"done",
          decision:d.decision, profit:d.netProfit, roi:d.roi, noFlipMargin:d.noFlipMargin, sellPrice:d.sellPrice,
          buyTarget:d.buyTarget, platform:d.bestPlatform, name:d.itemName,
          brand:d.brand, category:d.category, condition:d.condition }:x));
      } else {
        setItems(prev=>prev.map(x=>x.id===id?{...x,status:"error",error:d.error||"Failed"}:x));
      }
    } catch(e:any) {
      setItems(prev=>prev.map(x=>x.id===id?{...x,status:"error",error:e.message}:x));
    }
  }

  function endRun() {
    setPhase("done");
    // Save run to history. "Buy" here now means classifyOutcome() actually
    // landed on hot/solid - was raw decision==="BUY" (BEASTMODE FIX 1,
    // 2026-09-13), which could disagree with what this same screen now
    // displays for the identical item.
    const buyItemsList = items.filter(x => { const t = itemTier(x); return t?.tier === "hot" || t?.tier === "solid"; });
    const totalProfitCalc = buyItemsList.reduce((sum,x) => sum + (x.profit||0), 0);
    fetch(`${API_BASE}/api/thrift-run-save`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        token,
        items: items.map(item => ({
          name: item.name, decision: item.decision,
          profit: item.profit, platform: item.platform,
          photo: item.photo?.substring(0, 100), // truncate for storage
        })),
        total_profit: totalProfitCalc,
        buy_count: buyItemsList.length,
        store_name: "Thrift Run",
      })
    }).catch(()=>{});
  }
  function newRun() { setItems([]); setPhase("running"); setSelectedId(null); setEditingCorrection(false); }

  const THRIFT_LIMITS: Record<string, number> = {
    free: 3, seller: 10, pro: 999, lifetime: 999, business: 999
  };
  
  async function checkAndStartRun() {
    const limit = THRIFT_LIMITS[plan] || 3;
    if (limit < 999) {
      try {
        const r = await fetch(`${API_BASE}/api/thrift-run-save?token=${token}`);
        const d = await r.json();
        const used = d.count || 0;
        if (used >= limit) {
          require("react-native").Alert.alert(
            "Monthly Limit Reached",
            (plan === "free" ? "Free plan" : "Seller plan") + " allows " + limit + " Thrift Runs per month",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Upgrade →", onPress: () => onNavigate("upgrade") }
            ]
          );
          return;
        }
      } catch {}
    }
    setPhase("running");
  }




  // buyItems now mirrors endRun's tier-based filter (BEASTMODE FIX 1,
  // 2026-09-13) - was raw decision==="BUY", which the backend's now-fixed
  // 30%/75% thresholds mostly resolve anyway, but computing it locally via
  // classifyOutcome keeps this screen's own count/total honest even if the
  // two backends' thresholds are ever retuned independently again.
  const buyItems = items.filter(x=>{ const t = itemTier(x); return t?.tier==="hot"||t?.tier==="solid"; });
  const totalProfit = buyItems.reduce((sum,x)=>sum+(x.profit||0),0);
  // COUNT BUG FIX (2026-09-14, THRIFT-RUN USABILITY FIX): the done-phase
  // summary's WATCH/PASS tallies used to filter on the raw backend
  // `decision` string while buyItems/the per-item badges already used the
  // local classifyOutcome tier - the two could disagree on the same screen
  // (e.g. an item the backend called WATCH but the tier says "thin" AND an
  // entered price later reclassifies). Same tier, all three counts now.
  const watchItems = items.filter(x=>itemTier(x)?.tier==="thin");
  const passItems = items.filter(x=>{ const t = itemTier(x); return t?.tier==="skip" || (!t && x.status==="error"); });

  // INTRO,
  if (phase==="intro") return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><HeaderLogo textStyle={s.logoText}/></View>
      </View>
      <ScrollView contentContainerStyle={{ padding:24, paddingBottom:60, alignItems:"center" }}>
        <Text style={{ fontSize:64, marginBottom:16 }}>🛍️</Text>
        <Text style={[s.h1,{textAlign:"center"}]}>Thrift Run</Text>
        <Text style={[s.body,{textAlign:"center",marginBottom:32}]}>
          Rapid-scan mode. Walk through the store snapping photos. 
          Every item gets analyzed simultaneously — no waiting.
        </Text>
        {[
          ["📷","Tap shutter","Snap a photo of any item"],
          ["⚡","Instant AI","Gets analyzed while you keep scanning"],
          ["💰","See results","BUY or PASS — right as you walk"],
          ["📋","End run","Get a full summary of your haul"],
        ].map(([icon,title,desc])=>(
          <View key={title as string} style={[s.featureRow,{marginBottom:12}]}>
            <Text style={{fontSize:24,width:36}}>{icon as string}</Text>
            <View style={{flex:1}}>
              <Text style={{color:C.text1,fontSize:14,fontWeight:"700",marginBottom:2}}>{title as string}</Text>
              <Text style={{color:C.text3,fontSize:12}}>{desc as string}</Text>
            </View>
          </View>
        ))}
        {!isPaid && (
          <View style={s.lockedCard}>
            <Text style={s.lockedIcon}>🔒</Text>
            <Text style={s.lockedTitle}>Seller Plan Required</Text>
            <Text style={s.lockedBody}>Unlimited rapid scanning requires a paid plan.</Text>
            <TouchableOpacity style={[s.greenBtn,{marginTop:12}]} onPress={()=>Linking.openURL(`${API_BASE}/pricing`)}>
              <Text style={s.greenBtnText}>Upgrade Now →</Text>
            </TouchableOpacity>
          </View>
        )}
        {isPaid && (
          <TouchableOpacity style={[s.greenBtn,{width:"100%"}]} onPress={checkAndStartRun}>
            <Text style={s.greenBtnText}>Start Thrift Run →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  // DONE - summary,
  if (phase==="done") return (
    <SafeAreaView style={s.safe}>
      <View style={s.nav}>
        <View style={s.logoRow}><HeaderLogo textStyle={s.logoText}/></View>
        <TouchableOpacity onPress={newRun} style={[s.navBtn,{marginLeft:"auto" as any}]}><Text style={s.navBtnText}>New Run</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <Text style={s.h1}>Run Complete 🏁</Text>
          <ShareButton compact
            message={
              "🛍️ Thrift Run via ValuIQ\n\n" +
              items.length + " scanned · " + buyItems.length + " BUY finds\n" +
              "Profit found: $" + Math.round(totalProfit) + "\n\n" +
              buyItems.slice(0,5).map(x => "• " + (x.name||"Item") + ": $" + Math.round(x.profit||0)).join("\n") +
              "\n\ngetvaluiq.com"
            }
          />
        </View>
        <Text style={[s.body,{marginBottom:20}]}>{items.length} items scanned · {buyItems.length} BUY verdicts</Text>

        {/* Summary card */}
        <View style={s.summaryCard}>
          <View style={{ flexDirection:"row", gap:8 }}>
            {[[buyItems.length.toString(),"BUY",C.green],[watchItems.length.toString(),"WATCH",C.yellow],[passItems.length.toString(),"PASS",C.red]].map(([val,label,color])=>(
              <View key={label as string} style={[s.summaryBit,{borderColor:(color as string)+"30"}]}>
                <Text style={[s.summaryBitVal,{color:color as string}]}>{val as string}</Text>
                <Text style={s.summaryBitLabel}>{label as string}</Text>
              </View>
            ))}
          </View>
          <View style={s.summaryProfit}>
            <Text style={s.summaryProfitLabel}>Total Potential Profit</Text>
            <Text style={s.summaryProfitVal}>${Math.round(totalProfit)}</Text>
          </View>
        </View>

        {/* Items list */}
        <Text style={[s.sectionLabel,{marginBottom:10}]}>All Items</Text>
        {items.map(item=>{
          const tier = itemTier(item);
          return (
          <TouchableOpacity key={item.id} style={[s.runItem,{borderColor:tier?tier.accent+"30":C.border}]} onPress={()=>selectItem(item)}>
            <Image source={{uri:`data:image/jpeg;base64,${item.photo}`}} style={s.thumb} />
            <View style={{flex:1,paddingLeft:12}}>
              {item.status==="scanning" ? (
                <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
                  <ActivityIndicator color={C.green} size="small" />
                  <Text style={{color:C.text3,fontSize:13}}>Analyzing...</Text>
                </View>
              ) : item.status==="error" ? (
                <Text style={{color:C.red,fontSize:13}}>{item.error||"Failed"}</Text>
              ) : (
                <>
                  <Text style={{color:C.text1,fontSize:13,fontWeight:"700",marginBottom:2}} numberOfLines={1}>{item.name||"Item"}</Text>
                  <Text style={{color:C.text4,fontSize:11}}>{item.platform?.split("|||")[0]||"—"}</Text>
                </>
              )}
            </View>
            {tier && (
              <View style={{alignItems:"flex-end",gap:3}}>
                <View style={[s.decBadge,{backgroundColor:tier.accent+"15",borderColor:tier.accent+"40"}]}>
                  <Text style={[s.decText,{color:tier.accent}]}>{tier.label}</Text>
                </View>
                <Text style={{color:C.text1,fontSize:13,fontWeight:"700"}}>${Math.round(item.profit||0)}</Text>
              </View>
            )}
          </TouchableOpacity>
          );
        })}

        {/* Expanded item detail */}
        {selectedItem && selectedItem.decision && (
          <View style={s.detailCard}>
            <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"}}>
              <Text style={[s.h2,{marginBottom:12,flex:1}]}>{selectedItem.name}</Text>
              <TouchableOpacity onPress={() => Alert.alert("Delete this scan?", selectedItem.name || "Item", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => deleteItem(selectedItem.id) },
              ])}>
                <Text style={{fontSize:18}}>🗑</Text>
              </TouchableOpacity>
            </View>
            <View style={{flexDirection:"row",gap:8}}>
              {[["Max Pay","$"+(selectedItem.buyTarget||0),C.yellow],["Sell For","$"+(selectedItem.sellPrice||0),C.text1],[selectedItem.buyPrice?"Profit":"Est. Profit","$"+Math.round(selectedItem.profit||0),C.green]].map(([l,v,c])=>(
                <View key={l as string} style={s.detailStat}>
                  <Text style={s.detailStatLabel}>{l as string}</Text>
                  <Text style={[s.detailStatVal,{color:c as string}]}>{v as string}</Text>
                </View>
              ))}
            </View>
            <Text style={{color:C.text4,fontSize:12,marginTop:8}}>Best on {selectedItem.platform?.split("|||")[0]}</Text>

            {/* PRICE INPUT (2026-09-14): instant local recompute, no network
                call - see applyPrice/applyPaidPrice above. Without this,
                profit/ROI always assumed the Max Pay ceiling as cost. */}
            <View style={{marginTop:14,paddingTop:14,borderTopWidth:1,borderTopColor:C.border}}>
              <Text style={s.detailStatLabel}>What you paid</Text>
              <View style={{flexDirection:"row",gap:8,marginTop:6}}>
                <TextInput
                  style={s.priceInput}
                  value={paidPriceInput}
                  onChangeText={setPaidPriceInput}
                  placeholder={selectedItem.buyTarget ? String(selectedItem.buyTarget) : "0"}
                  placeholderTextColor={C.text4}
                  keyboardType="numeric"
                />
                <TouchableOpacity style={s.applyBtn} onPress={applyPrice}>
                  <Text style={s.applyBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
              {selectedItem.buyPrice ? (
                <Text style={{color:C.text4,fontSize:11,marginTop:6}}>Profit/ROI above reflect the ${selectedItem.buyPrice} you paid, not the ceiling.</Text>
              ) : (
                <Text style={{color:C.text4,fontSize:11,marginTop:6}}>Profit above is projected against Max Pay until you enter a real price.</Text>
              )}
            </View>

            {/* PER-ITEM CORRECTION (2026-09-14): fix a wrong ID/condition
                without leaving the run - see saveCorrection above. */}
            {!editingCorrection ? (
              <TouchableOpacity style={s.fixBtn} onPress={() => setEditingCorrection(true)}>
                <Text style={s.fixBtnText}>✏️ Wrong item or condition? Fix it</Text>
              </TouchableOpacity>
            ) : (
              <View style={{marginTop:14,paddingTop:14,borderTopWidth:1,borderTopColor:C.border}}>
                <Text style={s.detailStatLabel}>Item name</Text>
                <TextInput style={s.fixInput} value={editName} onChangeText={setEditName} placeholderTextColor={C.text4} />
                <View style={{flexDirection:"row",gap:8,marginTop:8}}>
                  <View style={{flex:1}}>
                    <Text style={s.detailStatLabel}>Brand</Text>
                    <TextInput style={s.fixInput} value={editBrand} onChangeText={setEditBrand} placeholderTextColor={C.text4} />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.detailStatLabel}>Category</Text>
                    <TextInput style={s.fixInput} value={editCategory} onChangeText={setEditCategory} placeholderTextColor={C.text4} />
                  </View>
                </View>
                <Text style={[s.detailStatLabel,{marginTop:8}]}>Condition</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6,marginTop:4}}>
                  {["New","Like New","Good","Fair","Poor"].map(c => (
                    <TouchableOpacity key={c} style={[s.condChip, editCondition===c && s.condChipActive]} onPress={()=>setEditCondition(c)}>
                      <Text style={[s.condChipText, editCondition===c && s.condChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={{flexDirection:"row",gap:8,marginTop:12}}>
                  <TouchableOpacity style={[s.applyBtn,{flex:1,opacity:savingCorrection?0.6:1}]} onPress={saveCorrection} disabled={savingCorrection}>
                    {savingCorrection ? <ActivityIndicator color={C.greenDark} size="small" /> : <Text style={s.applyBtnText}>Save & Re-price</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelFixBtn} onPress={() => setEditingCorrection(false)}>
                    <Text style={s.cancelFixBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  // RUNNING - camera + scanned items feed,
  if (!permission?.granted) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={s.h2}>Camera Required</Text>
        <TouchableOpacity style={[s.greenBtn,{marginTop:16}]} onPress={requestPermission}><Text style={s.greenBtnText}>Grant Access</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <View style={{flex:1,backgroundColor:"#000"}}>
      <StatusBar barStyle="light-content" />
      {/* Camera top half */}
      <View style={{height:height*0.48, position:"relative"}}>
        <CameraView ref={cameraRef} style={{flex:1}} facing="back" />
        <View style={{position:"absolute",top:0,left:0,right:0,bottom:0}}>
          <View style={{flex:1}}>
            <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:16,paddingTop:insets.top+8}}>
              <View style={s.camLogoBadge}><Text style={s.camLogoText}>Thrift Run</Text></View>
              <TouchableOpacity onPress={endRun} style={s.endBtn}><Text style={s.endBtnText}>End Run →</Text></TouchableOpacity>
            </View>
            <View style={{flex:1,justifyContent:"flex-end",padding:16}}>
              {!isPaid && scansLeft !== null && (
                <Text style={{color:scansLeft===0?C.red:C.yellow,fontSize:11,fontWeight:"700",textAlign:"center",marginBottom:8}}>
                  {scansLeft===0?"No scans left":`${scansLeft} scans left`}
                </Text>
              )}
              <TouchableOpacity style={s.shutterRow} onPress={takePhoto}>
                <View style={s.shutter}><View style={s.shutterInner}/></View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Scanned items bottom half */}
      <View style={{flex:1,backgroundColor:C.bg}}>
        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:16,paddingTop:16, paddingBottom:10,borderBottomWidth:1,borderBottomColor:C.border}}>
          <Text style={{color:C.text3,fontSize:12,fontWeight:"700"}}>{items.length} SCANNED · {buyItems.length} BUY</Text>
          {items.length>0 && <Text style={{color:C.green,fontSize:13,fontWeight:"700"}}>${Math.round(totalProfit)} profit</Text>}
        </View>
        <ScrollView contentContainerStyle={{padding:10,gap:6}}>
          {items.length===0 && (
            <View style={{alignItems:"center",padding:32}}>
              <Text style={{fontSize:32,marginBottom:8}}>📷</Text>
              <Text style={{color:C.text3,fontSize:13,textAlign:"center"}}>Tap the shutter button above to scan items</Text>
            </View>
          )}
          {items.map(item=>{
            const tier = itemTier(item);
            return (
            <View key={item.id} style={[s.runItemCompact,{borderColor:tier?tier.accent+"30":C.border}]}>
              <Image source={{uri:`data:image/jpeg;base64,${item.photo}`}} style={s.thumbSm} />
              <View style={{flex:1,paddingLeft:10}}>
                {item.status==="scanning" ? (
                  <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
                    <ActivityIndicator color={C.green} size="small" />
                    <Text style={{color:C.text4,fontSize:12}}>Analyzing...</Text>
                  </View>
                ) : (
                  <Text style={{color:C.text1,fontSize:12,fontWeight:"700"}} numberOfLines={1}>{item.name||"Unknown"}</Text>
                )}
              </View>
              {tier && (
                <View style={{alignItems:"flex-end"}}>
                  <Text style={{color:tier.accent,fontSize:12,fontWeight:"800"}}>{tier.label}</Text>
                  <Text style={{color:C.text1,fontSize:12,fontWeight:"700"}}>${Math.round(item.profit||0)}</Text>
                </View>
              )}
            </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const height = Dimensions.get("window").height;

const s = StyleSheet.create({
  safe:             { flex:1, backgroundColor:C.bg },
  center:           { flex:1, alignItems:"center", justifyContent:"center", padding:28 },
  nav:              { flexDirection:"row", alignItems:"center", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, gap:8 },
  navBack:          { padding:4 },
  navBackText:      { color:C.text3, fontSize:24, lineHeight:24 },
  logoRow:          { flexDirection:"row", alignItems:"center", gap:8 },
  logoText:         { color:C.text1, fontSize:16, fontWeight:"800", letterSpacing:-0.5 },
  navBtn:           { borderWidth:1, borderColor:C.border, borderRadius:7, paddingHorizontal:10, paddingVertical:5 },
  navBtnText:       { color:C.text3, fontSize:12, fontWeight:"600" },
  h1:               { color:C.text1, fontSize:24, fontWeight:"900", letterSpacing:-0.5 },
  h2:               { color:C.text1, fontSize:18, fontWeight:"800" },
  body:             { color:C.text2, fontSize:14, lineHeight:21 },
  sectionLabel:     { color:C.text4, fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 },
  featureRow:       { flexDirection:"row", alignItems:"flex-start", gap:12, width:"100%", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14 },
  greenBtn:         { backgroundColor:C.green, borderRadius:14, paddingTop:16, paddingBottom:10, alignItems:"center" },
  greenBtnText:     { color:C.greenDark, fontSize:16, fontWeight:"900" },
  lockedCard:       { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:16, padding:24, alignItems:"center", width:"100%", marginBottom:20 },
  lockedIcon:       { fontSize:36, marginBottom:8 },
  lockedTitle:      { color:C.text1, fontSize:16, fontWeight:"800", marginBottom:6 },
  lockedBody:       { color:C.text3, fontSize:13, textAlign:"center" },
  camLogoBadge:     { backgroundColor:"rgba(168,230,61,0.15)", borderWidth:1, borderColor:"rgba(168,230,61,0.3)", paddingHorizontal:12, paddingTop:16, paddingBottom:10, borderRadius:8 },
  camLogoText:      { color:C.green, fontSize:13, fontWeight:"800" },
  endBtn:           { backgroundColor:"rgba(255,107,107,0.15)", borderWidth:1, borderColor:"rgba(255,107,107,0.4)", borderRadius:100, paddingHorizontal:14, paddingVertical:6 },
  endBtnText:       { color:C.red, fontSize:12, fontWeight:"700" },
  shutterRow:       { alignItems:"center" },
  shutter:          { width:72, height:72, borderRadius:36, borderWidth:4, borderColor:"#fff", alignItems:"center", justifyContent:"center" },
  shutterInner:     { width:58, height:58, borderRadius:29, backgroundColor:"#fff" },
  summaryCard:      { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:16, padding:16, marginBottom:16 },
  summaryBit:       { flex:1, borderWidth:1, borderRadius:12, padding:12, alignItems:"center" },
  summaryBitVal:    { fontSize:24, fontWeight:"900", marginBottom:2 },
  summaryBitLabel:  { color:C.text4, fontSize:10, fontWeight:"700" },
  summaryProfit:    { marginTop:12, paddingTop:12, borderTopWidth:1, borderTopColor:C.border, alignItems:"center" },
  summaryProfitLabel:{ color:C.text4, fontSize:11, fontWeight:"700", textTransform:"uppercase", marginBottom:4 },
  summaryProfitVal: { color:C.green, fontSize:36, fontWeight:"900", letterSpacing:-1 },
  runItem:          { flexDirection:"row", alignItems:"center", backgroundColor:C.surface, borderWidth:1.5, borderRadius:12, padding:10, marginBottom:8 },
  runItemCompact:   { flexDirection:"row", alignItems:"center", backgroundColor:C.surface, borderWidth:1, borderRadius:10, padding:8 },
  thumb:            { width:56, height:56, borderRadius:8 },
  thumbSm:          { width:44, height:44, borderRadius:6 },
  decBadge:         { borderWidth:1, borderRadius:100, paddingHorizontal:8, paddingVertical:2 },
  decText:          { fontSize:10, fontWeight:"800" },
  detailCard:       { backgroundColor:C.surfaceHigh, borderWidth:1, borderColor:C.border, borderRadius:14, padding:16, marginBottom:12 },
  detailStat:       { flex:1, backgroundColor:C.bg, borderRadius:8, padding:10, alignItems:"center" },
  detailStatLabel:  { color:C.text4, fontSize:9, fontWeight:"700", textTransform:"uppercase", marginBottom:4 },
  detailStatVal:    { fontSize:18, fontWeight:"900" },
  priceInput:       { flex:1, backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:12, paddingVertical:10, color:C.text1, fontSize:15 },
  applyBtn:         { backgroundColor:C.green, borderRadius:10, paddingHorizontal:18, alignItems:"center", justifyContent:"center" },
  applyBtnText:     { color:C.greenDark, fontSize:14, fontWeight:"800" },
  fixBtn:           { marginTop:14, paddingTop:14, borderTopWidth:1, borderTopColor:C.border, alignItems:"center" },
  fixBtnText:       { color:C.text3, fontSize:13, fontWeight:"700" },
  fixInput:         { backgroundColor:C.bg, borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:12, paddingVertical:10, color:C.text1, fontSize:14, marginTop:4 },
  condChip:         { paddingHorizontal:12, paddingVertical:7, borderRadius:16, backgroundColor:C.bg, borderWidth:1, borderColor:C.border },
  condChipActive:   { backgroundColor:C.green, borderColor:C.green },
  condChipText:     { color:C.text3, fontSize:12, fontWeight:"700" },
  condChipTextActive:{ color:C.greenDark },
  cancelFixBtn:     { paddingHorizontal:16, alignItems:"center", justifyContent:"center", borderRadius:10, borderWidth:1, borderColor:C.border },
  cancelFixBtnText: { color:C.text3, fontSize:14, fontWeight:"700" } });
