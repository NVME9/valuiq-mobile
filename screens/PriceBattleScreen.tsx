import React, { useState, useRef, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Linking, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import ShareButton from "../components/ShareButton";
import { API_BASE, priceBattle, scanImage } from "../lib/api";
import * as ImagePicker from "expo-image-picker";

const CONDITIONS = ["New","Like New","Good","Fair","Poor"];
const CATEGORIES = ["Clothing","Shoes","Electronics","Tools","Collectibles","Handbags","Antiques","Jewelry","Toys","Home","Sports","Other"];

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function PriceBattleScreen({ token, onNavigate, onBack }: Props) {
  const [phase, setPhase] = useState<"input"|"battling"|"done">("input");
  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState("Good");
  const [category, setCategory] = useState("Other");
  const [buyPrice, setBuyPrice] = useState("");
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [best, setBest] = useState<any>(null);
  const [summary, setSummary] = useState("");
  const [hotTip, setHotTip] = useState("");
  const [error, setError] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [expanded,   setExpanded]   = useState<string|null>(null);
  const [photo,      setPhoto]      = useState<string|null>(null);
  const [scanning,   setScanning]   = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (phase==="battling" && platforms.length>0 && visibleCount<platforms.length) {
      timer.current = setTimeout(()=>setVisibleCount(v=>v+1), 350);
    }
    if (phase==="battling" && visibleCount>=platforms.length && platforms.length>0) {
      setTimeout(()=>setPhase("done"), 400);
    }
    return ()=>clearTimeout(timer.current);
  }, [phase, visibleCount, platforms.length]);

  async function pickPhoto() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
      if (!res.canceled && res.assets[0]?.base64) {
        setPhoto(res.assets[0].base64);
        await identifyFromPhoto(res.assets[0].base64);
      }
    } catch {}
  }

  async function takePhoto() {
    try {
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      if (!res.canceled && res.assets[0]?.base64) {
        setPhoto(res.assets[0].base64);
        await identifyFromPhoto(res.assets[0].base64);
      }
    } catch {}
  }

  async function identifyFromPhoto(base64: string) {
    setScanning(true);
    try {
      const d = await scanImage(token, base64);
      if (d.itemName) {
        setItemName(d.itemName);
        if (d.brand && d.brand !== "Unknown") setBrand(d.brand);
        if (d.condition) setCondition(d.condition);
        if (d.category) setCategory(d.category);
      }
    } catch {}
    setScanning(false);
  }

  async function startBattle() {
    if (!itemName.trim()) { setError("Enter an item name first."); return; }
    setLoading(true); setError(""); setPlatforms([]); setVisibleCount(0); setBest(null);
    try {
      const d = await priceBattle(token, itemName, brand, category, condition, Number(buyPrice)||0);
      if (!d.success) throw new Error(d.error||"Battle failed");
      const platforms = d.platforms||[];
      setPlatforms(platforms);
      setBest(platforms[0]||null);
      setSummary(d.itemSummary||"");
      setHotTip(d.hotTip||"");
      setPhase("battling");
      // Save to history
      fetch(`${API_BASE}/api/price-battle-save`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          token, item_name: itemName,
          results: platforms.slice(0,8).map((p:any) => ({platform:p.platform, price:p.netProfit||p.sellPrice})),
          top_platform: platforms[0]?.platform,
          top_price: platforms[0]?.netProfit||platforms[0]?.sellPrice,
        })
      }).catch(()=>{});
    } catch(e:any) { setError(e.message||"Something went wrong. Try again."); }
    setLoading(false);
  }

  const dc = (dec:string) => dec==="BUY"?C.green:dec==="WATCH"?C.yellow:C.red;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        {(phase==="battling"||phase==="done") && (
          <TouchableOpacity onPress={()=>{setPhase("input");setPlatforms([]);setVisibleCount(0);}} style={s.navBtn}>
            <Text style={s.navBtnText}>New Battle</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <Text style={s.h1}>⚡ Price Battle</Text>
        <Text style={[s.body, { marginBottom:20 }]}>See exactly what every platform pays for your item.</Text>

        {/* Input form */}
        {phase==="input" && (
          <View style={{ gap:12 }}>
            {error ? <View style={s.errBox}><Text style={s.errText}>{error}</Text></View> : null}

            {/* Photo scan */}
            <View style={s.photoRow}>
              <TouchableOpacity style={s.photoBtn} onPress={takePhoto}>
                <Text style={s.photoBtnIcon}>📷</Text>
                <Text style={s.photoBtnTxt}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoBtn} onPress={pickPhoto}>
                <Text style={s.photoBtnIcon}>🖼️</Text>
                <Text style={s.photoBtnTxt}>Upload Photo</Text>
              </TouchableOpacity>
            </View>
            {photo && (
              <View style={{ marginBottom: 12, alignItems: "center" }}>
                <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={{ width: 120, height: 120, borderRadius: 10 }} resizeMode="cover"/>
                {scanning && <ActivityIndicator color={C.green} style={{ marginTop: 8 }}/>}
                {scanning && <Text style={{ color: C.text3, fontSize: 12, marginTop: 4 }}>Identifying item...</Text>}
              </View>
            )}

            <View>
              <Text style={s.label}>Item Name *</Text>
              <TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="e.g. Nike, Air Force 1, KitchenAid, Mixer" placeholderTextColor={C.text4} />
            </View>
            <View>
              <Text style={s.label}>Brand</Text>
              <TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="e.g. Nike, KitchenAid" placeholderTextColor={C.text4} />
            </View>
            <View>
              <Text style={s.label}>Condition</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:6 }}>
                <View style={{ flexDirection:"row", gap:6 }}>
                  {CONDITIONS.map(c=>(
                    <TouchableOpacity key={c} onPress={()=>setCondition(c)}
                      style={[s.chip, condition===c && s.chipActive]}>
                      <Text style={[s.chipText, condition===c && s.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View>
              <Text style={s.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop:6 }}>
                <View style={{ flexDirection:"row", gap:6 }}>
                  {CATEGORIES.map(c=>(
                    <TouchableOpacity key={c} onPress={()=>setCategory(c)}
                      style={[s.chip, category===c && s.chipActive]}>
                      <Text style={[s.chipText, category===c && s.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View>
              <Text style={s.label}>Your Buy Price (optional)</Text>
              <TextInput style={s.input} value={buyPrice} onChangeText={setBuyPrice} placeholder="$0.00" placeholderTextColor={C.text4} keyboardType="decimal-pad" />
            </View>

            <TouchableOpacity style={[s.greenBtn, { marginTop:8 }]} onPress={startBattle} disabled={loading}>
              {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.greenBtnText}>Start Battle →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        {(phase==="battling"||phase==="done") && (
          <View>
            {/* Best platform hero */}
            {best && phase==="done" && (
              <View style={s.heroCard}>
                <Text style={s.heroLabel}>⚡ WINNER</Text>
                <Text style={s.heroName}>{best.name}</Text>
                <Text style={s.heroProfit}>{"+$"+Math.max(0,Math.round(best.netProfit))}</Text>
                <Text style={s.heroSub}>net profit after {best.feeRate} fee</Text>
                {best.soldLink && (
                  <TouchableOpacity onPress={()=>Linking.openURL(best.soldLink)} style={s.verifiyBtn}>
                    <Text style={s.verifyBtnText}>Verify on eBay sold →</Text>
                  </TouchableOpacity>
                )}
                <ShareButton compact
                  message={`⚡ Price Battle via ValuIQ\n\n${itemName}\n\nWinner: ${best?.name}\nSell: $${Math.round(best?.sellPrice||0)} · Profit: +$${Math.max(0,Math.round(best?.netProfit||0))} after ${best?.feeRate} fees\n\ngetvaluiq.com`}
                />
              </View>
            )}

            {summary ? <View style={s.summaryCard}><Text style={s.summaryText}>{summary}</Text></View> : null}
            {hotTip ? <View style={s.hotCard}><Text style={s.hotLabel}>🔥 Hot Tip</Text><Text style={s.hotText}>{hotTip}</Text></View> : null}

            {/* Platform cards */}
            <Text style={[s.sectionLabel, { marginBottom:10 }]}>All Platforms</Text>
            {platforms.slice(0,visibleCount).map((p,i)=>(
              <TouchableOpacity key={p.name} style={[s.platCard, {
                borderColor: i===0&&phase==="done" ? C.orange+"50" : p.decision==="BUY" ? C.green+"30" : p.decision==="WATCH" ? C.yellow+"20" : C.border,
                backgroundColor: i===0&&phase==="done" ? "#1a0c00" : C.surface }]} onPress={()=>setExpanded(expanded===p.name?null:p.name)} activeOpacity={0.85}>
                <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" }}>
                  <View style={{ flexDirection:"row", alignItems:"center", gap:8, flex:1 }}>
                    {i===0&&phase==="done" && <Text style={{ fontSize:14 }}>⚡</Text>}
                    <View style={{ flex:1 }}>
                      <Text style={s.platName}>{p.name}</Text>
                      <Text style={s.platMeta}>{p.feeRate} fee · {p.timeToSell}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems:"flex-end" }}>
                    <Text style={[s.platSell, { color:p.netProfit>0?C.green:C.red }]}>${Math.round(p.sellPrice)}</Text>
                    <View style={[s.decBadge, { backgroundColor:dc(p.decision)+"20", borderColor:dc(p.decision)+"40" }]}>
                      <Text style={[s.decText, { color:dc(p.decision) }]}>{p.decision}</Text>
                    </View>
                  </View>
                </View>
                {expanded===p.name && (
                  <View style={{ marginTop:12, paddingTop:12, borderTopWidth:1, borderTopColor:C.border }}>
                    <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
                      {[["Sell For","$"+Math.round(p.sellPrice),C.green],["Fees","$"+Math.round(p.fees||0),C.red],["Profit","$"+Math.round(p.netProfit||0),p.netProfit>0?C.green:C.red]].map(([l,v,c])=>(
                        <View key={l as string} style={s.expandStat}>
                          <Text style={s.expandStatLabel}>{l as string}</Text>
                          <Text style={[s.expandStatVal, { color:c as string }]}>{v as string}</Text>
                        </View>
                      ))}
                    </View>
                    {p.tip && <Text style={s.platTip}>{p.tip}</Text>}
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {phase==="battling" && visibleCount<platforms.length && (
              <View style={{ alignItems:"center", padding:16 }}>
                <ActivityIndicator color={C.green} />
                <Text style={[s.body, { marginTop:8 }]}>Checking more platforms...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex:1, backgroundColor:C.bg },
  nav:           { flexDirection:"row", alignItems:"center", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, gap:8 },
  navBack:       { padding:4 },
  navBackText:   { color:C.text3, fontSize:24, lineHeight:24 },
  logoRow:       { flexDirection:"row", alignItems:"center", gap:8 },
  logoIcon:      { width:26, height:26, backgroundColor:C.green, borderRadius:7, alignItems:"center", justifyContent:"center" },
  logoIconText:  { color:C.greenDark, fontSize:13, fontWeight:"900" },
  logoText:      { color:C.text1, fontSize:16, fontWeight:"800", letterSpacing:-0.5 },
  navBtn:        { marginLeft:"auto" as any, borderWidth:1, borderColor:C.border, borderRadius:7, paddingHorizontal:10, paddingVertical:5 },
  navBtnText:    { color:C.text3, fontSize:12, fontWeight:"600" },
  h1:            { color:C.text1, fontSize:24, fontWeight:"900", letterSpacing:-0.5, marginBottom:4 },
  body:          { color:C.text2, fontSize:14, lineHeight:21 },
  sectionLabel:  { color:C.text4, fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 },
  label:         { color:C.text3, fontSize:13, fontWeight:"700", marginBottom:6 },
  input:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, color:C.text1, fontSize:15 },
  chip:          { paddingHorizontal:14, paddingVertical:8, borderRadius:100, borderWidth:1, borderColor:C.border, backgroundColor:C.surface },
  chipActive:    { backgroundColor:C.green, borderColor:C.green },
  chipText:      { color:C.text3, fontSize:13, fontWeight:"600" },
  chipTextActive:{ color:C.greenDark, fontWeight:"700" },
  greenBtn:      { backgroundColor:C.green, borderRadius:14, paddingVertical:16, alignItems:"center" },
  greenBtnText:  { color:C.greenDark, fontSize:16, fontWeight:"900" },
  errBox:        { backgroundColor:"#1a0505", borderWidth:1, borderColor:C.red+"40", borderRadius:10, padding:12 },
  errText:       { color:C.red, fontSize:13 },
  heroCard:      { backgroundColor:"#150800", borderWidth:2, borderColor:C.orange+"40", borderRadius:18, padding:20, marginBottom:14, alignItems:"center" },
  heroLabel:     { color:C.orange, fontSize:11, fontWeight:"800", letterSpacing:1, marginBottom:6 },
  heroName:      { color:C.text1, fontSize:22, fontWeight:"900", marginBottom:6 },
  heroProfit:    { color:C.green, fontSize:52, fontWeight:"900", letterSpacing:-2, lineHeight:56 },
  heroSub:       { color:C.text3, fontSize:13, marginBottom:12 },
  verifiyBtn:    { borderWidth:1, borderColor:C.green+"40", borderRadius:8, paddingHorizontal:14, paddingVertical:7 },
  verifyBtnText: { color:C.green, fontSize:13, fontWeight:"700" },
  summaryCard:   { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, marginBottom:10 },
  summaryText:   { color:C.text2, fontSize:13, lineHeight:20 },
  hotCard:       { backgroundColor:"#1a1200", borderWidth:1, borderColor:C.yellow+"30", borderRadius:12, padding:14, marginBottom:14 },
  hotLabel:      { color:C.yellow, fontSize:12, fontWeight:"800", marginBottom:4 },
  hotText:       { color:C.text2, fontSize:13, lineHeight:20 },
  platCard:      { borderWidth:1.5, borderRadius:14, padding:14, marginBottom:8 },
  platName:      { color:C.text1, fontSize:15, fontWeight:"800" },
  platMeta:      { color:C.text4, fontSize:12, marginTop:1 },
  platSell:      { fontSize:20, fontWeight:"900" },
  decBadge:      { borderWidth:1, borderRadius:100, paddingHorizontal:8, paddingVertical:2, marginTop:3 },
  decText:       { fontSize:10, fontWeight:"800" },
  expandStat:    { flex:1, backgroundColor:C.bg, borderRadius:8, padding:10, alignItems:"center" },
  expandStatLabel:{ color:C.text4, fontSize:10, fontWeight:"700", textTransform:"uppercase", marginBottom:4 },
  expandStatVal: { fontSize:16, fontWeight:"900" },
  platTip:       { color:C.text3, fontSize:12, lineHeight:18, fontStyle:"italic" },
  photoRow:      { flexDirection:"row", gap:10, marginBottom:12 },
  photoBtn:      { flex:1, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, alignItems:"center", gap:6 },
  photoBtnIcon:  { fontSize:24 },
  photoBtnTxt:   { color:C.text3, fontSize:12, fontWeight:"700" },
});
