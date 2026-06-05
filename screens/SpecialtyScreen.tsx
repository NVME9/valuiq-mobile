import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Linking, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { C } from "../lib/theme";
import { analyzeSpecialty } from "../lib/api";
import ShareButton from "../components/ShareButton";

const CATS = [
  { id:"wine",         icon:"🍷", label:"Wine & Spirits",       desc:"Fine wine, whiskey, bourbon, rare spirits",
    fields:[{key:"winery",label:"Winery / Producer",ph:"e.g. Opus, One, Dom, Pérignon, Pappy, Van Winkle"},{key:"vintage",label:"Vintage, Year",ph:"e.g. 2015"},{key:"varietal",label:"Varietal / Type",ph:"e.g. Cabernet, Sauvignon, Bourbon"},{key:"region",label:"Region",ph:"e.g. Napa, Valley, Bordeaux"},{key:"format",label:"Bottle, Size",ph:"e.g. 750ml, Magnum 1.5L"},{key:"condition",label:"Label, Condition",ph:"e.g. Perfect, Minor scuff"}] },
  { id:"figurines",    icon:"🏺", label:"Figurines & Collectibles", desc:"Lladró, Hummel, Precious, Moments, Dept 56",
    fields:[{key:"maker",label:"Maker / Brand",ph:"e.g. Lladró, Hummel, Precious, Moments"},{key:"pieceName",label:"Piece, Name or Number",ph:"e.g. Boy with Accordion, #5006"},{key:"series",label:"Series / Collection",ph:"e.g. Nativity, Holidays"},{key:"condition",label:"Condition",ph:"e.g. Mint, Good, Chip on base"},{key:"hasBox",label:"Original, Box?",ph:"e.g. Yes with styrofoam, No box"},{key:"retired",label:"Retired?",ph:"e.g. Yes retired 2003, Unknown"}] },
  { id:"antiques",     icon:"🏛️", label:"Antiques & Pottery",   desc:"McCoy, Roseville, Fiestaware, Hull, ceramics",
    fields:[{key:"maker",label:"Maker / Marks",ph:"e.g. McCoy, USA, Roseville, unmarked"},{key:"pattern",label:"Pattern / Line, Name",ph:"e.g. Butterprint, Magnolia"},{key:"itemType",label:"Item, Type",ph:"e.g. Vase, Cookie jar, Pitcher"},{key:"era",label:"Approximate, Era",ph:"e.g. 1940s, Art, Deco 1930s"},{key:"condition",label:"Condition",ph:"e.g. Mint no chips, Chip on rim"},{key:"size",label:"Size",ph:"e.g. 8 inch vase"}] },
  { id:"jewelry",      icon:"💎", label:"Vintage, Jewelry",       desc:"Signed costume jewelry, sterling, designer",
    fields:[{key:"maker",label:"Maker / Signature",ph:"e.g. Trifari, Monet, unsigned"},{key:"material",label:"Material",ph:"e.g. Sterling silver, Gold-filled, Bakelite"},{key:"itemType",label:"Piece, Type",ph:"e.g. Brooch, Necklace, Bracelet"},{key:"era",label:"Era / Style",ph:"e.g. 1950s, Art, Deco, Mid-century"},{key:"condition",label:"Condition",ph:"e.g. Excellent, Missing stones"},{key:"stones",label:"Stones / Details",ph:"e.g. Clear rhinestones, Faux pearls"}] },
  { id:"coins",        icon:"🪙", label:"Coins & Currency",      desc:"US coins, foreign coins, paper currency",
    fields:[{key:"coinType",label:"Coin / Note, Type",ph:"e.g. Morgan, Silver Dollar, $2 bill"},{key:"year",label:"Year & Mint, Mark",ph:"e.g. 1921-D, 1884-S"},{key:"grade",label:"Grade / Condition",ph:"e.g. MS-65, VF-30, circulated"},{key:"certified",label:"Certified?",ph:"e.g. NGC, MS-65, Raw uncertified"},{key:"errors",label:"Errors / Varieties?",ph:"e.g. Double die, no known errors"}] },
  { id:"cards",        icon:"🃏", label:"Trading, Cards",         desc:"Sports cards, Pokemon, Magic: The, Gathering",
    fields:[{key:"cardType",label:"Card, Type / Sport",ph:"e.g. Baseball, Pokemon, Magic"},{key:"player",label:"Player / Character",ph:"e.g. Mickey, Mantle, Charizard"},{key:"year",label:"Year & Set",ph:"e.g. 1952 Topps, 1999 Base, Set"},{key:"cardNumber",label:"Card, Number",ph:"e.g. #311, #4/102"},{key:"condition",label:"Condition / Grade",ph:"e.g. PSA 10, Raw, NM-MT"},{key:"variation",label:"Variation / Parallel",ph:"e.g. Holo, 1st Edition, Rookie"}] },
  { id:"art",          icon:"🖼️", label:"Art & Prints",          desc:"Original art, lithographs, signed prints",
    fields:[{key:"artist",label:"Artist, Name",ph:"e.g. Norman, Rockwell, Thomas, Kinkade"},{key:"title",label:"Title / Subject",ph:"e.g. The, Problem We, All Live, With"},{key:"medium",label:"Medium / Type",ph:"e.g. Oil on canvas, Lithograph"},{key:"size",label:"Size",ph:"e.g. 16x20 inches, 24x36"},{key:"signed",label:"Signed / Numbered?",ph:"e.g. Signed 45/500, Unsigned"},{key:"condition",label:"Condition",ph:"e.g. Excellent, Minor foxing"}] },
  { id:"vintage_toys", icon:"🧸", label:"Vintage, Toys & Games",  desc:"Barbie, Hot, Wheels, Star, Wars, board games",
    fields:[{key:"brand",label:"Brand / Maker",ph:"e.g. Mattel, Hasbro, Kenner"},{key:"itemName",label:"Toy, Name / Character",ph:"e.g. 1977 Luke, Skywalker, #47 Hot, Wheels"},{key:"year",label:"Year / Era",ph:"e.g. 1977, 1960s"},{key:"condition",label:"Condition",ph:"e.g. Mint in box, Complete loose"},{key:"hasBox",label:"Original, Box?",ph:"e.g. Near mint box, No box"},{key:"completeness",label:"Complete?",ph:"e.g. 100% complete, Missing lightsaber"}] },
];

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function SpecialtyScreen({ token, onNavigate, onBack }: Props) {
  const [selectedCat, setSelectedCat] = useState<typeof CATS[0]|null>(null);
  const [fields, setFields] = useState<Record<string,string>>({});
  const [photo, setPhoto] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes:ImagePicker.MediaTypeOptions.Images, base64:true, quality:0.7 });
    if (!res.canceled && res.assets[0]?.base64) setPhoto(res.assets[0].base64);
  }

  async function analyze() {
    if (!selectedCat) return;
    if (!Object.values(fields).some(v=>v.trim()) && !photo) { setError("Fill in at least one field or add a photo."); return; }
    setLoading(true); setError("");
    try {
      const d = await analyzeSpecialty(token, selectedCat.id, fields, photo||undefined);
      if (!d.success) throw new Error(d.error||"Analysis failed");
      setResult(d);
    } catch(e:any) { setError(e.message||"Analysis failed. Try again."); }
    setLoading(false);
  }

  function reset() { setSelectedCat(null); setFields({}); setPhoto(null); setResult(null); setError(""); }

  // Category grid,
  if (!selectedCat) return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <Text style={s.h1}>🏺 Specialty Scanner</Text>
        <Text style={[s.body, { marginBottom:20 }]}>Expert, AI for niche categories that require deep knowledge.</Text>
        <View style={s.catGrid}>
          {CATS.map(cat=>(
            <TouchableOpacity key={cat.id} style={s.catCard} onPress={()=>setSelectedCat(cat)} activeOpacity={0.7}>
              <Text style={s.catIcon}>{cat.icon}</Text>
              <Text style={s.catLabel}>{cat.label}</Text>
              <Text style={s.catDesc}>{cat.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // Result,
  if (result) return (
    <SafeAreaView style={s.safe}>
      <View style={s.nav}>
        <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        <TouchableOpacity onPress={reset} style={[s.navBtn,{marginLeft:"auto" as any}]}><Text style={s.navBtnText}>New Scan</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <View style={s.catBadge}>
          <Text style={{ fontSize:20 }}>{selectedCat.icon}</Text>
          <Text style={s.catBadgeText}>{selectedCat.label}</Text>
        </View>

        {/* Value card */}
        <View style={s.valCard}>
          <Text style={s.valLabel}>ESTIMATED, VALUE</Text>
          <Text style={s.valAmount}>{result.valueRange || result.estimatedValue || "See analysis"}</Text>
          {result.confidence && <Text style={s.valSub}>Confidence: {result.confidence}</Text>}
        </View>

        {/* Decision */}
        {result.decision && (
          <View style={[s.decCard, { borderColor:(result.decision==="BUY"?C.green:result.decision==="WATCH"?C.yellow:C.red)+"40" }]}>
            <Text style={[s.decText, { color:result.decision==="BUY"?C.green:result.decision==="WATCH"?C.yellow:C.red }]}>
              {result.decision==="BUY"?"BUY, IT":result.decision==="WATCH"?"WATCH, IT":"PASS"}
            </Text>
          </View>
        )}

        {/* Analysis */}
        {result.analysis && (
          <View style={s.infoCard}><Text style={s.infoLabel}>Analysis</Text><Text style={s.infoText}>{result.analysis}</Text></View>
        )}
        {result.sellStrategy && (
          <View style={s.infoCard}><Text style={s.infoLabel}>How To Sell It</Text><Text style={s.infoText}>{result.sellStrategy}</Text></View>
        )}
        {result.watchOut && (
          <View style={[s.infoCard,{borderColor:C.yellow+"30",backgroundColor:"#1a1508"}]}>
            <Text style={[s.infoLabel,{color:C.yellow}]}>⚠️ Watch Out For</Text>
            <Text style={s.infoText}>{result.watchOut}</Text>
          </View>
        )}

        <ShareButton
          message={`🏺 Specialty Scanner Result via ValuIQ\n\n${selectedCat?.label}: ${result.valueRange || result.estimatedValue || ""}\n${result.analysis ? "\n" + result.analysis.slice(0, 200) + "..." : ""}\n\nFind your own deals → getvaluiq.com`}
        />
        <TouchableOpacity style={[s.greenBtn,{marginTop:10}]} onPress={reset}>
          <Text style={s.greenBtnText}>Scan Another Item →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // Input form,
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.nav}>
        <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <View style={s.catBadge}><Text style={{ fontSize:20 }}>{selectedCat.icon}</Text><Text style={s.catBadgeText}>{selectedCat.label}</Text></View>
        <Text style={[s.body, { marginBottom:16 }]}>{selectedCat.desc}</Text>

        {error ? <View style={s.errBox}><Text style={s.errText}>{error}</Text></View> : null}

        {/* Photo */}
        <TouchableOpacity onPress={pickPhoto} style={s.photoBtn}>
          {photo
            ? <Image source={{ uri:`data:image/jpeg;base64,${photo}` }} style={{ width:"100%", height:140, borderRadius:10 }} resizeMode="cover" />
            : <><Text style={{ fontSize:28, marginBottom:6 }}>📷</Text><Text style={s.photoBtnText}>Add Photo (optional but helps)</Text></>
          }
        </TouchableOpacity>

        {/* Fields */}
        {selectedCat.fields.map(f=>(
          <View key={f.key} style={{ marginBottom:12 }}>
            <Text style={s.label}>{f.label}</Text>
            <TextInput style={s.input} value={fields[f.key]||""} onChangeText={v=>setFields(prev=>({...prev,[f.key]:v}))} placeholder={f.ph} placeholderTextColor={C.text4} />
          </View>
        ))}

        <TouchableOpacity style={[s.greenBtn,{marginTop:8}]} onPress={analyze} disabled={loading}>
          {loading ? <ActivityIndicator color={C.greenDark} /> : <Text style={s.greenBtnText}>Analyze Now →</Text>}
        </TouchableOpacity>
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
  navBtn:        { borderWidth:1, borderColor:C.border, borderRadius:7, paddingHorizontal:10, paddingVertical:5 },
  navBtnText:    { color:C.text3, fontSize:12, fontWeight:"600" },
  h1:            { color:C.text1, fontSize:24, fontWeight:"900", letterSpacing:-0.5, marginBottom:4 },
  body:          { color:C.text2, fontSize:14, lineHeight:21 },
  label:         { color:C.text3, fontSize:13, fontWeight:"700", marginBottom:6 },
  input:         { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, color:C.text1, fontSize:14 },
  catGrid:       { flexDirection:"row", flexWrap:"wrap", gap:10 },
  catCard:       { width:"47%", backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:16, padding:16 },
  catIcon:       { fontSize:30, marginBottom:8 },
  catLabel:      { color:C.text1, fontSize:14, fontWeight:"800", marginBottom:4 },
  catDesc:       { color:C.text4, fontSize:11, lineHeight:16 },
  catBadge:      { flexDirection:"row", alignItems:"center", gap:8, backgroundColor:C.surface, borderRadius:12, paddingHorizontal:14, paddingVertical:10, marginBottom:16, alignSelf:"flex-start" as any },
  catBadgeText:  { color:C.text1, fontSize:14, fontWeight:"700" },
  photoBtn:      { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderStyle:"dashed", borderRadius:12, padding:20, alignItems:"center", marginBottom:16 },
  photoBtnText:  { color:C.text4, fontSize:13 },
  greenBtn:      { backgroundColor:C.green, borderRadius:14, paddingVertical:16, alignItems:"center" },
  greenBtnText:  { color:C.greenDark, fontSize:16, fontWeight:"900" },
  errBox:        { backgroundColor:"#1a0505", borderWidth:1, borderColor:C.red+"40", borderRadius:10, padding:12, marginBottom:12 },
  errText:       { color:C.red, fontSize:13 },
  valCard:       { backgroundColor:"rgba(0,0,0,0.3)", borderWidth:2, borderColor:C.green+"25", borderRadius:20, padding:20, alignItems:"center", marginBottom:12 },
  valLabel:      { color:C.text4, fontSize:10, fontWeight:"700", letterSpacing:1, textTransform:"uppercase", marginBottom:6 },
  valAmount:     { color:C.green, fontSize:36, fontWeight:"900", letterSpacing:-1, marginBottom:4 },
  valSub:        { color:C.text3, fontSize:13 },
  decCard:       { borderWidth:2, borderRadius:14, padding:16, alignItems:"center", marginBottom:12 },
  decText:       { fontSize:28, fontWeight:"900", letterSpacing:-0.5 },
  infoCard:      { backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:13, padding:14, marginBottom:10 },
  infoLabel:     { color:C.text4, fontSize:10, fontWeight:"700", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 },
  infoText:      { color:C.text2, fontSize:13, lineHeight:20 } });
