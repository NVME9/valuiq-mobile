import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function ArbitrageScreen({ token, plan, onNavigate, onBack }: Props) {
  const [query, setQuery] = useState("");
  const [maxBuy, setMaxBuy] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");

  const isPaid = ["seller","pro","lifetime"].includes(plan);

  async function search() {
    if (!query.trim()) { setError("Enter what to search for."); return; }
    setLoading(true); setError(""); setResults([]);
    try {
      const r = await fetch(`${API_BASE}/api/arbitrage`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ userToken:token, query:query.trim(), maxBuy:Number(maxBuy)||0 }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error||"Search failed");
      setResults(d.results||[]);
      setSummary(d.summary||"");
    } catch(e:any) { setError(e.message); }
    setLoading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        {results.length>0&&<TouchableOpacity onPress={()=>{setResults([]);setSummary("");}} style={[s.navBtn,{marginLeft:"auto" as any}]}><Text style={s.navBtnText}>New Search</Text></TouchableOpacity>}
      </View>

      <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}}>
        <Text style={s.h1}>📈 Arbitrage Search</Text>
        <Text style={[s.body,{marginBottom:20}]}>Find underpriced items on eBay where the spread is big enough to profit on resale.</Text>

        {!isPaid && <View style={s.lockedCard}><Text style={s.lockedIcon}>🔒</Text><Text style={s.lockedTitle}>Seller Plan Required</Text><Text style={s.lockedBody}>Upgrade to search arbitrage opportunities.</Text></View>}

        {isPaid && (
          <View style={{gap:12,marginBottom:20}}>
            {error?<View style={s.errBox}><Text style={s.errText}>{error}</Text></View>:null}
            <View><Text style={s.label}>Search for</Text>
              <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="e.g. Nike, Dunk Low, Stanley, Cup, KitchenAid" placeholderTextColor={C.text4} onSubmitEditing={search}/>
            </View>
            <View><Text style={s.label}>Max buy price (optional)</Text>
              <TextInput style={s.input} value={maxBuy} onChangeText={setMaxBuy} placeholder="$50" placeholderTextColor={C.text4} keyboardType="decimal-pad"/>
            </View>
            <TouchableOpacity style={s.greenBtn} onPress={search} disabled={loading}>
              {loading?<ActivityIndicator color={C.greenDark}/>:<Text style={s.greenBtnText}>Find Arbitrage →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {summary?<View style={s.summaryCard}><Text style={s.summaryText}>{summary}</Text></View>:null}

        {results.map((item:any,i:number)=>(
          <View key={i} style={[s.resultCard,{borderColor:item.profit>0?C.green+"30":C.border}]}>
            <Text style={s.resultName}>{item.title||item.name}</Text>
            <View style={{flexDirection:"row",gap:8,marginTop:8,marginBottom:8}}>
              {[["Buy","$"+Math.round(item.buyPrice||0),C.yellow],["Sell","$"+Math.round(item.sellPrice||0),C.text1],["Profit","$"+Math.round(item.profit||0),item.profit>0?C.green:C.red]].map(([l,v,c])=>(
                <View key={l as string} style={s.miniStat}>
                  <Text style={s.miniStatLabel}>{l as string}</Text>
                  <Text style={[s.miniStatVal,{color:c as string}]}>{v as string}</Text>
                </View>
              ))}
            </View>
            {item.url&&<TouchableOpacity onPress={()=>Linking.openURL(item.url)}>
              <Text style={{color:C.green,fontSize:12,fontWeight:"700"}}>View on eBay →</Text>
            </TouchableOpacity>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingTop: 16, paddingBottom: 10,gap:8},
  navBack:{padding:4},navBackText:{color:C.text3,fontSize:24,lineHeight:24},
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
  greenBtn:{backgroundColor:C.green,borderRadius:14,paddingTop:16, paddingBottom:10,alignItems:"center"},
  greenBtnText:{color:C.greenDark,fontSize:16,fontWeight:"900"},
  errBox:{backgroundColor:"#1a0505",borderWidth:1,borderColor:C.red+"40",borderRadius:10,padding:12},
  errText:{color:C.red,fontSize:13},
  lockedCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  lockedIcon:{fontSize:40,marginBottom:12},
  lockedTitle:{color:C.text1,fontSize:18,fontWeight:"800",marginBottom:8},
  lockedBody:{color:C.text3,fontSize:13,textAlign:"center",lineHeight:20},
  summaryCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,marginBottom:12},
  summaryText:{color:C.text2,fontSize:13,lineHeight:20},
  resultCard:{backgroundColor:C.surface,borderWidth:1,borderRadius:13,padding:14,marginBottom:8},
  resultName:{color:C.text1,fontSize:14,fontWeight:"700"},
  miniStat:{flex:1,backgroundColor:C.bg,borderRadius:8,padding:10,alignItems:"center"},
  miniStatLabel:{color:C.text4,fontSize:9,fontWeight:"700",textTransform:"uppercase",marginBottom:3},
  miniStatVal:{fontSize:16,fontWeight:"900"} });
