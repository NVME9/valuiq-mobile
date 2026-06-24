import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { C } from "../lib/theme";
import { analyzeManifest } from "../lib/api";
import ShareButton from "../components/ShareButton";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function ManifestScreen({ token, plan, onNavigate, onBack }: Props) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes:ImagePicker.MediaType.Images, base64:true, quality:0.7 });
    if (!res.canceled && res.assets[0]?.base64) setPhoto(res.assets[0].base64);
  }

  async function analyze() {
    if (!text.trim() && !photo) { setError("Paste a manifest or add a photo of one."); return; }
    setLoading(true); setError("");
    try {
      const d = await analyzeManifest(token, text, photo||undefined);
      if (!d.success) throw new Error(d.error||"Analysis failed");
      setResult(d);
    } catch(e:any) { setError(e.message||"Analysis failed. Try again."); }
    setLoading(false);
  }

  function reset() { setText(""); setPhoto(null); setResult(null); setError(""); }

  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        {result && <TouchableOpacity onPress={reset} style={[s.navBtn,{marginLeft:"auto" as any}]}><Text style={s.navBtnText}>New Manifest</Text></TouchableOpacity>}
      </View>

      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <Text style={s.h1}>📋 Manifest Analyzer</Text>
        <Text style={[s.body, { marginBottom:20 }]}>Paste a liquidation manifest or take a photo — AI scores every line item and tells you exactly what to buy.</Text>

        {!isPaid && (
          <View style={s.lockedCard}>
            <Text style={s.lockedIcon}>🔒</Text>
            <Text style={s.lockedTitle}>Seller Plan Required</Text>
            <Text style={s.lockedBody}>Upgrade to analyze manifests from B-Stock, BULQ, Liquidation.com and more.</Text>
          </View>
        )}

        {isPaid && !result && (
          <View style={{ gap:14 }}>
            {error ? <View style={s.errBox}><Text style={s.errText}>{error}</Text></View> : null}

            {/* Photo */}
            <TouchableOpacity onPress={pickPhoto} style={s.photoBtn}>
              {photo
                ? <Image source={{uri:`data:image/jpeg;base64,${photo}`}} style={{width:"100%",height:160,borderRadius:10}} resizeMode="cover" />
                : <><Text style={{fontSize:32,marginBottom:6}}>📷</Text><Text style={s.photoBtnText}>Take/upload photo of manifest</Text></>
              }
            </TouchableOpacity>

            <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
              <View style={{flex:1,height:1,backgroundColor:C.border}}/>
              <Text style={{color:C.text4,fontSize:12}}>or paste text</Text>
              <View style={{flex:1,height:1,backgroundColor:C.border}}/>
            </View>

            <TextInput style={[s.input,{minHeight:120,textAlignVertical:"top"}]}
              value={text} onChangeText={setText}
              placeholder={"Paste your manifest here...\n\nSupports B-Stock, BULQ, Liquidation.com formats.\nJust copy and paste the item list."}
              placeholderTextColor={C.text4} multiline />

            <TouchableOpacity style={s.greenBtn} onPress={analyze} disabled={loading}>
              {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.greenBtnText}>Analyze Manifest →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {result && (
          <View>
            {/* Score */}
            <View style={[s.scoreCard, { borderColor: (result.score||0)>=70?C.green:(result.score||0)>=40?C.yellow:C.red }]}>
              <Text style={s.scoreLabel}>LOT, SCORE</Text>
              <Text style={[s.scoreVal, { color:(result.score||0)>=70?C.green:(result.score||0)>=40?C.yellow:C.red }]}>{result.score}/100</Text>
              <Text style={s.scoreVerdict}>{result.verdict}</Text>
              {result.expectedProfit && <Text style={s.scoreProfit}>Expected profit: ${result.expectedProfit}</Text>}
            </View>

            {/* Summary */}
            {result.summary && <View style={s.infoCard}><Text style={s.infoLabel}>Summary</Text><Text style={s.infoText}>{result.summary}</Text></View>}

            {/* Line items */}
            {result.items?.length > 0 && (
              <View>
                <Text style={[s.sectionLabel,{marginBottom:10}]}>Line, Items ({result.items.length})</Text>
                {result.items.map((item:any,i:number)=>(
                  <View key={i} style={[s.itemCard, { borderColor:item.decision==="BUY"?C.green+"30":item.decision==="WATCH"?C.yellow+"20":C.border }]}>
                    <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <View style={{flex:1,paddingRight:10}}>
                        <Text style={s.itemName}>{item.name}</Text>
                        {item.qty>1 && <Text style={s.itemMeta}>Qty: {item.qty}</Text>}
                      </View>
                      <View style={{alignItems:"flex-end",gap:3}}>
                        <View style={[s.decBadge,{backgroundColor:(item.decision==="BUY"?C.green:item.decision==="WATCH"?C.yellow:C.red)+"15",borderColor:(item.decision==="BUY"?C.green:item.decision==="WATCH"?C.yellow:C.red)+"40"}]}>
                          <Text style={[s.decText,{color:item.decision==="BUY"?C.green:item.decision==="WATCH"?C.yellow:C.red}]}>{item.decision}</Text>
                        </View>
                        {item.profit && <Text style={{color:C.green,fontSize:13,fontWeight:"700"}}>${item.profit} profit</Text>}
                      </View>
                    </View>
                    {item.note && <Text style={s.itemNote}>{item.note}</Text>}
                  </View>
                ))}
              </View>
            )}

            <ShareButton
              message={"📋 Manifest Analysis via ValuIQ\n\nLot Score: " + (result?.score||0) + "/100\nTop Items: " + (result?.topItems||[]).slice(0,3).map((x:any)=>x.name||"Item").join(", ") + "\n\ngetvaluiq.com"}
            />
            <TouchableOpacity style={[s.greenBtn,{marginTop:10}]} onPress={reset}>
              <Text style={s.greenBtnText}>Analyze Another Manifest →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex:1, backgroundColor:C.bg },
  nav:          { flexDirection:"row", alignItems:"center", paddingHorizontal:20, paddingTop: 16, paddingBottom: 10, gap:8 },
  navBack:      { padding:4 },
  navBackText:  { color:C.text3, fontSize:24, lineHeight:24 },
  logoRow:      { flexDirection:"row", alignItems:"center", gap:8 },
  logoIcon:     { width:26, height:26, backgroundColor:C.green, borderRadius:7, alignItems:"center", justifyContent:"center" },
  logoIconText: { color:C.greenDark, fontSize:13, fontWeight:"900" },
  logoText:     { color:C.text1, fontSize:16, fontWeight:"800", letterSpacing:-0.5 },
  navBtn:       { borderWidth:1, borderColor:C.border, borderRadius:7, paddingHorizontal:10, paddingVertical:5 },
  navBtnText:   { color:C.text3, fontSize:12, fontWeight:"600" },
  h1:           { color:C.text1, fontSize:24, fontWeight:"900", letterSpacing:-0.5, marginBottom:4 },
  body:         { color:C.text2, fontSize:14, lineHeight:21 },
  label:        { color:C.text3, fontSize:13, fontWeight:"700", marginBottom:6 },
  input:        { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, color:C.text1, fontSize:14 },
  sectionLabel: { color:C.text4, fontSize:11, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.8 },
  photoBtn:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderStyle:"dashed", borderRadius:12, padding:24, alignItems:"center" },
  photoBtnText: { color:C.text4, fontSize:13 },
  greenBtn:     { backgroundColor:C.green, borderRadius:14, paddingTop:16, paddingBottom:10, alignItems:"center" },
  greenBtnText: { color:C.greenDark, fontSize:16, fontWeight:"900" },
  errBox:       { backgroundColor:"#1a0505", borderWidth:1, borderColor:C.red+"40", borderRadius:10, padding:12 },
  errText:      { color:C.red, fontSize:13 },
  lockedCard:   { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:16, padding:32, alignItems:"center" },
  lockedIcon:   { fontSize:40, marginBottom:12 },
  lockedTitle:  { color:C.text1, fontSize:18, fontWeight:"800", marginBottom:8 },
  lockedBody:   { color:C.text3, fontSize:13, textAlign:"center", lineHeight:20 },
  scoreCard:    { borderWidth:2, borderRadius:18, padding:24, alignItems:"center", marginBottom:14, backgroundColor:"rgba(0,0,0,0.3)" },
  scoreLabel:   { color:C.text4, fontSize:10, fontWeight:"700", letterSpacing:1, textTransform:"uppercase", marginBottom:6 },
  scoreVal:     { fontSize:56, fontWeight:"900", letterSpacing:-2, lineHeight:60 },
  scoreVerdict: { color:C.text1, fontSize:18, fontWeight:"800", marginTop:6 },
  scoreProfit:  { color:C.green, fontSize:14, fontWeight:"700", marginTop:4 },
  infoCard:     { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:13, padding:14, marginBottom:10 },
  infoLabel:    { color:C.text4, fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 },
  infoText:     { color:C.text2, fontSize:13, lineHeight:20 },
  itemCard:     { backgroundColor:C.surface, borderWidth:1, borderRadius:12, padding:12, marginBottom:8 },
  itemName:     { color:C.text1, fontSize:13, fontWeight:"700", marginBottom:2 },
  itemMeta:     { color:C.text4, fontSize:11 },
  itemNote:     { color:C.text3, fontSize:12, marginTop:6, lineHeight:17 },
  decBadge:     { borderWidth:1, borderRadius:100, paddingHorizontal:8, paddingVertical:2 },
  decText:      { fontSize:10, fontWeight:"800" } });
