import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";
import ShareButton from "../components/ShareButton";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function BundleBuilderScreen({ token, plan, onNavigate, onBack }: Props) {
  const [items, setItems] = useState([{ name:"", price:"" }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const isPaid = ["seller","pro","lifetime"].includes(plan);

  function addItem() { setItems(prev=>[...prev, { name:"", price:"" }]); }
  function removeItem(i: number) { setItems(prev=>prev.filter((_,j)=>j!==i)); }
  function updateItem(i: number, field: "name"|"price", val: string) {
    setItems(prev=>prev.map((x,j)=>j===i?{...x,[field]:val}:x));
  }

  async function build() {
    const filled = items.filter(x=>x.name.trim());
    if (!filled.length) { setError("Add at least one item."); return; }
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/bundle-builder`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ userToken:token, items: filled }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error||"Failed");
      setResult(d);
    } catch(e:any) { setError(e.message); }
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        {result&&<TouchableOpacity onPress={()=>{setResult(null);setItems([{name:"",price:""}]);}} style={[s.navBtn,{marginLeft:"auto" as any}]}><Text style={s.navBtnText}>New Bundle</Text></TouchableOpacity>}
      </View>
      <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}}>
        <Text style={s.h1}>📦 Bundle Builder</Text>
        <Text style={[s.body,{marginBottom:20}]}>Group items together for a higher total price. AI suggests the best bundles.</Text>

        {!isPaid && <View style={s.lockedCard}><Text style={{fontSize:36,marginBottom:10}}>🔒</Text><Text style={s.lockedTitle}>Seller Plan Required</Text></View>}

        {isPaid && !result && (
          <View>
            {error?<View style={s.errBox}><Text style={s.errText}>{error}</Text></View>:null}
            {items.map((item,i)=>(
              <View key={i} style={s.itemRow}>
                <TextInput style={[s.input,{flex:1}]} value={item.name} onChangeText={v=>updateItem(i,"name",v)} placeholder={`Item ${i+1} name`} placeholderTextColor={C.text4}/>
                <TextInput style={[s.input,{width:80,marginLeft:8}]} value={item.price} onChangeText={v=>updateItem(i,"price",v)} placeholder="$" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>
                {items.length>1&&<TouchableOpacity onPress={()=>removeItem(i)} style={{padding:8,marginLeft:4}}><Text style={{color:C.red,fontSize:18}}>✕</Text></TouchableOpacity>}
              </View>
            ))}
            <TouchableOpacity onPress={addItem} style={s.addBtn}><Text style={s.addBtnText}>+ Add Item</Text></TouchableOpacity>
            <TouchableOpacity style={[s.greenBtn,{marginTop:16}]} onPress={build} disabled={loading}>
              {loading?<ActivityIndicator color={C.greenDark}/>:<Text style={s.greenBtnText}>Build Bundle →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {result && (
          <View>
            <View style={s.resultCard}>
              <Text style={s.resultLabel}>SUGGESTED BUNDLE PRICE</Text>
              <Text style={s.resultPrice}>${result.bundlePrice||result.suggested_price||"—"}</Text>
              {result.savings&&<Text style={s.resultSavings}>vs ${result.totalIndividual} sold separately</Text>}
            </View>
            {result.title&&<View style={s.infoCard}><Text style={s.infoLabel}>Bundle Title</Text><Text style={s.infoText}>{result.title}</Text></View>}
            {result.description&&<View style={s.infoCard}><Text style={s.infoLabel}>Listing Description</Text><Text style={s.infoText}>{result.description}</Text></View>}
            {result.platforms&&<View style={s.infoCard}><Text style={s.infoLabel}>Best Platforms</Text><Text style={s.infoText}>{Array.isArray(result.platforms)?result.platforms.join(", "):result.platforms}</Text></View>}
            <ShareButton message={`📦 Bundle via ValuIQ\n\n${result.title||"Bundle"}\nPrice: $${result.bundlePrice||result.suggested_price}\n\ngetvaluiq.com`}/>
            <TouchableOpacity style={[s.greenBtn,{marginTop:10}]} onPress={()=>{setResult(null);setItems([{name:"",price:""}]);}}>
              <Text style={s.greenBtnText}>Build Another Bundle →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingVertical:14,gap:8},
  navBack:{padding:4},navBackText:{color:C.text3,fontSize:24,lineHeight:24},
  logoRow:{flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:{width:26,height:26,backgroundColor:C.green,borderRadius:7,alignItems:"center",justifyContent:"center"},
  logoIconText:{color:C.greenDark,fontSize:13,fontWeight:"900"},
  logoText:{color:C.text1,fontSize:16,fontWeight:"800",letterSpacing:-0.5},
  navBtn:{borderWidth:1,borderColor:C.border,borderRadius:7,paddingHorizontal:10,paddingVertical:5},
  navBtnText:{color:C.text3,fontSize:12,fontWeight:"600"},
  h1:{color:C.text1,fontSize:24,fontWeight:"900",letterSpacing:-0.5,marginBottom:4},
  body:{color:C.text2,fontSize:14,lineHeight:21},
  input:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:13,color:C.text1,fontSize:14},
  itemRow:{flexDirection:"row",alignItems:"center",marginBottom:8},
  addBtn:{borderWidth:1,borderColor:C.border,borderStyle:"dashed",borderRadius:12,padding:13,alignItems:"center",marginTop:4},
  addBtnText:{color:C.text3,fontSize:14,fontWeight:"600"},
  greenBtn:{backgroundColor:C.green,borderRadius:14,paddingVertical:16,alignItems:"center"},
  greenBtnText:{color:C.greenDark,fontSize:16,fontWeight:"900"},
  errBox:{backgroundColor:"#1a0505",borderWidth:1,borderColor:C.red+"40",borderRadius:10,padding:12,marginBottom:12},
  errText:{color:C.red,fontSize:13},
  lockedCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  lockedTitle:{color:C.text1,fontSize:18,fontWeight:"800"},
  resultCard:{backgroundColor:"rgba(0,0,0,0.3)",borderWidth:2,borderColor:C.green+"30",borderRadius:18,padding:20,alignItems:"center",marginBottom:12},
  resultLabel:{color:C.text4,fontSize:10,fontWeight:"700",textTransform:"uppercase",letterSpacing:1,marginBottom:6},
  resultPrice:{color:C.green,fontSize:52,fontWeight:"900",letterSpacing:-2},
  resultSavings:{color:C.text3,fontSize:13,marginTop:4},
  infoCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:13,padding:14,marginBottom:10},
  infoLabel:{color:C.text4,fontSize:10,fontWeight:"700",textTransform:"uppercase",marginBottom:6},
  infoText:{color:C.text2,fontSize:13,lineHeight:20},
});
