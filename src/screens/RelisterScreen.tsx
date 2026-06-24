import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

const PLATFORMS = ["eBay","Poshmark","Mercari","Facebook Marketplace","Depop","Etsy","OfferUp"];
const CONDITIONS = ["New","Like New","Good","Fair","Poor"];

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function RelisterScreen({ token, plan, onNavigate, onBack }: Props) {
  const [itemName, setItemName] = useState("");
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState("Good");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["eBay","Poshmark"]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  async function generate() {
    if (!itemName.trim()) { setError("Enter an item name."); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/relist`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ userToken:token, itemName, brand, condition, size, color, platforms:selectedPlatforms, sellPrice:Number(sellPrice)||0 }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error||"Failed");
      setResults(d.listings||[]);
    } catch(e:any) { setError(e.message); }
    setLoading(false);
  }

  async function copyListing(text: string, id: string) {
    try {
      await Share.share({ message: text });
      setCopied(id);
      setTimeout(()=>setCopied(""),2000);
    } catch {}
  }

  function togglePlatform(p: string) {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev,p]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        {results.length>0 && <TouchableOpacity onPress={()=>setResults([])} style={[s.navBtn,{marginLeft:"auto" as any}]}><Text style={s.navBtnText}>New</Text></TouchableOpacity>}
      </View>

      <ScrollView contentContainerStyle={{ padding:20, paddingBottom:60 }}>
        <Text style={s.h1}>✏️ Auto-Relister</Text>
        <Text style={[s.body,{marginBottom:20}]}>AI writes platform-optimized listings ready to copy-paste. No more typing.</Text>

        {!isPaid && <View style={s.lockedCard}><Text style={s.lockedIcon}>🔒</Text><Text style={s.lockedTitle}>Seller Plan Required</Text><Text style={s.lockedBody}>Upgrade to generate AI listings for any platform.</Text></View>}

        {isPaid && results.length===0 && (
          <View style={{gap:12}}>
            {error?<View style={s.errBox}><Text style={s.errText}>{error}</Text></View>:null}

            <View><Text style={s.label}>Item Name *</Text><TextInput style={s.input} value={itemName} onChangeText={setItemName} placeholder="e.g. Lululemon, Align Leggings" placeholderTextColor={C.text4}/></View>
            <View><Text style={s.label}>Brand</Text><TextInput style={s.input} value={brand} onChangeText={setBrand} placeholder="e.g. Lululemon" placeholderTextColor={C.text4}/></View>
            <View style={{flexDirection:"row",gap:10}}>
              <View style={{flex:1}}><Text style={s.label}>Size</Text><TextInput style={s.input} value={size} onChangeText={setSize} placeholder="e.g. Size 6" placeholderTextColor={C.text4}/></View>
              <View style={{flex:1}}><Text style={s.label}>Color</Text><TextInput style={s.input} value={color} onChangeText={setColor} placeholder="e.g. Black" placeholderTextColor={C.text4}/></View>
            </View>
            <View><Text style={s.label}>Sell Price ($)</Text><TextInput style={s.input} value={sellPrice} onChangeText={setSellPrice} placeholder="45.00" placeholderTextColor={C.text4} keyboardType="decimal-pad"/></View>

            <View>
              <Text style={s.label}>Condition</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:6}}>
                <View style={{flexDirection:"row",gap:6}}>
                  {CONDITIONS.map(c=>(
                    <TouchableOpacity key={c} onPress={()=>setCondition(c)} style={[s.chip,condition===c&&s.chipActive]}>
                      <Text style={[s.chipText,condition===c&&s.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View>
              <Text style={s.label}>Generate For</Text>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:6}}>
                {PLATFORMS.map(p=>(
                  <TouchableOpacity key={p} onPress={()=>togglePlatform(p)} style={[s.chip,selectedPlatforms.includes(p)&&s.chipActive]}>
                    <Text style={[s.chipText,selectedPlatforms.includes(p)&&s.chipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={[s.greenBtn,{marginTop:8}]} onPress={generate} disabled={loading}>
              {loading?<ActivityIndicator color={C.greenDark}/>:<Text style={s.greenBtnText}>Generate Listings →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {results.map((listing:any)=>(
          <View key={listing.platform} style={s.listingCard}>
            <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <Text style={s.listingPlatform}>{listing.platform}</Text>
              <TouchableOpacity onPress={()=>copyListing(`${listing.title}\n\n${listing.description}`, listing.platform)} style={[s.copyBtn, copied===listing.platform&&{backgroundColor:C.green+"30",borderColor:C.green}]}>
                <Text style={[s.copyBtnText,copied===listing.platform&&{color:C.green}]}>{copied===listing.platform?"✓ Copied!":"Copy"}</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.listingTitle}>{listing.title}</Text>
            <Text style={s.listingDesc}>{listing.description}</Text>
            {listing.tags?.length>0 && (
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:4,marginTop:8}}>
                {listing.tags.map((tag:string)=>(
                  <View key={tag} style={s.tagPill}><Text style={s.tagText}>#{tag}</Text></View>
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg}, nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingTop: 16, paddingBottom: 10,gap:8},
  navBack:{padding:4}, navBackText:{color:C.text3,fontSize:24,lineHeight:24},
  logoRow:{flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:{width:26,height:26,backgroundColor:C.green,borderRadius:7,alignItems:"center",justifyContent:"center"},
  logoIconText:{color:C.greenDark,fontSize:13,fontWeight:"900"},
  logoText:{color:C.text1,fontSize:16,fontWeight:"800",letterSpacing:-0.5},
  navBtn:{borderWidth:1,borderColor:C.border,borderRadius:7,paddingHorizontal:10,paddingVertical:5},
  navBtnText:{color:C.text3,fontSize:12,fontWeight:"600"},
  h1:{color:C.text1,fontSize:24,fontWeight:"900",letterSpacing:-0.5,marginBottom:4},
  body:{color:C.text2,fontSize:14,lineHeight:21},
  label:{color:C.text3,fontSize:13,fontWeight:"700",marginBottom:6},
  input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,color:C.text1,fontSize:14},
  chip:{paddingHorizontal:14,paddingTop:16, paddingBottom:10,borderRadius:100,borderWidth:1,borderColor:C.border,backgroundColor:C.surface},
  chipActive:{backgroundColor:C.green,borderColor:C.green},
  chipText:{color:C.text3,fontSize:13,fontWeight:"600"},
  chipTextActive:{color:C.greenDark,fontWeight:"700"},
  greenBtn:{backgroundColor:C.green,borderRadius:14,paddingTop:16, paddingBottom:10,alignItems:"center"},
  greenBtnText:{color:C.greenDark,fontSize:16,fontWeight:"900"},
  errBox:{backgroundColor:"#1a0505",borderWidth:1,borderColor:C.red+"40",borderRadius:10,padding:12},
  errText:{color:C.red,fontSize:13},
  lockedCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  lockedIcon:{fontSize:40,marginBottom:12},
  lockedTitle:{color:C.text1,fontSize:18,fontWeight:"800",marginBottom:8},
  lockedBody:{color:C.text3,fontSize:13,textAlign:"center",lineHeight:20},
  listingCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:16,marginBottom:12},
  listingPlatform:{color:C.text1,fontSize:15,fontWeight:"800"},
  listingTitle:{color:C.green,fontSize:14,fontWeight:"700",marginBottom:8},
  listingDesc:{color:C.text2,fontSize:13,lineHeight:20},
  copyBtn:{borderWidth:1,borderColor:C.border,borderRadius:8,paddingHorizontal:12,paddingVertical:6},
  copyBtnText:{color:C.text3,fontSize:12,fontWeight:"700"},
  tagPill:{backgroundColor:C.surfaceHigh,borderRadius:100,paddingHorizontal:8,paddingVertical:3},
  tagText:{color:C.text4,fontSize:10,fontWeight:"600"} });
