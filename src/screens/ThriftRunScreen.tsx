import React, { useState, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Image, Dimensions, Linking } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
let CameraView: any = null; let useCameraPermissions: any = () => [null, async()=>{}];
if (require("react-native").Platform.OS !== "web") { try { const c = require("expo-camera"); CameraView = c.CameraView; useCameraPermissions = c.useCameraPermissions; } catch {} }
import * as ImagePicker from "expo-image-picker";
import { C } from "../lib/theme";
import ShareButton from "../components/ShareButton";
import { API_BASE } from "../lib/api";

const { width } = Dimensions.get("window");

type ItemStatus = "scanning"|"done"|"error";
type RunItem = { id:string; photo:string; status:ItemStatus; decision?:string; profit?:number; sellPrice?:number; buyTarget?:number; platform?:string; name?:string; error?:string; };

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function ThriftRunScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"intro"|"running"|"done">("intro");
  const [items, setItems] = useState<RunItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<RunItem|null>(null);
  const cameraRef = useRef<any>(null);
  const isPaid = ["seller","pro","lifetime"].includes(plan);

  async function takePhoto() {
    if (!cameraRef.current) return;
    if (!isPaid && (scansLeft||0) <= 0) { return; }
    const photo = await cameraRef.current.takePictureAsync({ base64:true, quality:0.65 });
    if (!photo?.base64) return;
    const id = Date.now().toString();
    const newItem: RunItem = { id, photo:photo.base64, status:"scanning" };
    setItems(prev=>[newItem,...prev]);
    if (!isPaid) setScansLeft(n=>n!==null?Math.max(0,n-1):null);
    // Analyze in background,
    analyzeItem(id, photo.base64);
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
          decision:d.decision, profit:d.netProfit, sellPrice:d.sellPrice,
          buyTarget:d.buyTarget, platform:d.bestPlatform, name:d.itemName }:x));
      } else {
        setItems(prev=>prev.map(x=>x.id===id?{...x,status:"error",error:d.error||"Failed"}:x));
      }
    } catch(e:any) {
      setItems(prev=>prev.map(x=>x.id===id?{...x,status:"error",error:e.message}:x));
    }
  }

  function endRun() {
    setPhase("done");
    // Save run to history
    const buyItemsList = items.filter(x => x.decision === "BUY");
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
  function newRun() { setItems([]); setPhase("running"); setSelectedItem(null); }

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




  const dc = (dec?:string) => dec==="BUY"?C.green:dec==="WATCH"?C.yellow:C.red;
  const buyItems = items.filter(x=>x.decision==="BUY");
  const totalProfit = buyItems.reduce((sum,x)=>sum+(x.profit||0),0);

  // INTRO,
  if (phase==="intro") return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
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
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
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
            {[[buyItems.length.toString(),"BUY",C.green],[items.filter(x=>x.decision==="WATCH").length.toString(),"WATCH",C.yellow],[items.filter(x=>x.decision==="PASS"||x.status==="error").length.toString(),"PASS",C.red]].map(([val,label,color])=>(
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
        {items.map(item=>(
          <TouchableOpacity key={item.id} style={[s.runItem,{borderColor:item.decision?dc(item.decision)+"30":C.border}]} onPress={()=>setSelectedItem(selectedItem?.id===item.id?null:item)}>
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
            {item.decision && (
              <View style={{alignItems:"flex-end",gap:3}}>
                <View style={[s.decBadge,{backgroundColor:dc(item.decision)+"15",borderColor:dc(item.decision)+"40"}]}>
                  <Text style={[s.decText,{color:dc(item.decision)}]}>{item.decision}</Text>
                </View>
                <Text style={{color:C.text1,fontSize:13,fontWeight:"700"}}>${Math.round(item.profit||0)}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Expanded item detail */}
        {selectedItem && selectedItem.decision && (
          <View style={s.detailCard}>
            <Text style={[s.h2,{marginBottom:12}]}>{selectedItem.name}</Text>
            <View style={{flexDirection:"row",gap:8}}>
              {[["Max Pay","$"+(selectedItem.buyTarget||0),C.yellow],["Sell For","$"+(selectedItem.sellPrice||0),C.text1],["Profit","$"+Math.round(selectedItem.profit||0),C.green]].map(([l,v,c])=>(
                <View key={l as string} style={s.detailStat}>
                  <Text style={s.detailStatLabel}>{l as string}</Text>
                  <Text style={[s.detailStatVal,{color:c as string}]}>{v as string}</Text>
                </View>
              ))}
            </View>
            <Text style={{color:C.text4,fontSize:12,marginTop:8}}>Best on {selectedItem.platform?.split("|||")[0]}</Text>
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
          {items.map(item=>(
            <View key={item.id} style={[s.runItemCompact,{borderColor:item.decision?dc(item.decision)+"30":C.border}]}>
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
              {item.decision && (
                <View style={{alignItems:"flex-end"}}>
                  <Text style={{color:dc(item.decision),fontSize:12,fontWeight:"800"}}>{item.decision}</Text>
                  <Text style={{color:C.text1,fontSize:12,fontWeight:"700"}}>${Math.round(item.profit||0)}</Text>
                </View>
              )}
            </View>
          ))}
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
  logoIcon:         { width:26, height:26, backgroundColor:C.green, borderRadius:7, alignItems:"center", justifyContent:"center" },
  logoIconText:     { color:C.greenDark, fontSize:13, fontWeight:"900" },
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
  detailStatVal:    { fontSize:18, fontWeight:"900" } });
