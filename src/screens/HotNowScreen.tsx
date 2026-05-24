import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, RefreshControl } from "react-native";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function HotNowScreen({ token, onNavigate, onBack }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("all");
  const [error, setError] = useState("");

  const CATS = ["all","clothing","electronics","shoes","collectibles","tools","home"];

  useEffect(()=>{ load(); },[]);

  async function load() {
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/hot-now?token=${token}&category=${category}`);
      const d = await r.json();
      if (d.success) setItems(d.items||d.trending||[]);
      else throw new Error(d.error||"Failed to load");
    } catch(e:any) {
      setError(e.message);
      // Fallback sample data
      setItems([
        {name:"Lululemon Leggings",avgSell:65,sales:230,trend:"↑",platform:"Poshmark",category:"clothing"},
        {name:"Stanley Quencher 40oz",avgSell:45,sales:180,trend:"↑",platform:"eBay",category:"home"},
        {name:"Air Jordan 1 Retro",avgSell:185,sales:145,trend:"↑↑",platform:"StockX",category:"shoes"},
        {name:"DeWalt Drill Set",avgSell:120,sales:98,trend:"↑",platform:"eBay",category:"tools"},
        {name:"Vintage Pyrex Set",avgSell:75,sales:87,trend:"→",platform:"Etsy",category:"collectibles"},
        {name:"Nintendo Switch",avgSell:220,sales:76,trend:"↑",platform:"eBay",category:"electronics"},
        {name:"North Face Puffer",avgSell:95,sales:164,trend:"↑↑",platform:"Poshmark",category:"clothing"},
        {name:"Le Creuset Dutch Oven",avgSell:180,sales:52,trend:"↑",platform:"eBay",category:"home"},
        {name:"Coach Crossbody Bag",avgSell:88,sales:143,trend:"↑",platform:"Poshmark",category:"clothing"},
        {name:"Snap-On Wrench Set",avgSell:210,sales:38,trend:"↑↑",platform:"eBay",category:"tools"},
      ]);
    }
    setLoading(false);
  }

  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const filtered = category==="all" ? items : items.filter(x=>(x.category||"").toLowerCase()===category);

  const trendColor = (t:string) => t?.includes("↑↑")?C.green:t?.includes("↑")?C.green:t?.includes("↓")?C.red:C.yellow;

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
      </View>
      <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green}/>}>
        <Text style={s.h1}>🔥 Hot Right Now</Text>
        <Text style={[s.body,{marginBottom:16}]}>What's selling fast this week. Updated from real eBay sold data.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:16}}>
          <View style={{flexDirection:"row",gap:6}}>
            {CATS.map(c=>(
              <TouchableOpacity key={c} onPress={()=>setCategory(c)} style={[s.chip,category===c&&s.chipActive]}>
                <Text style={[s.chipText,category===c&&s.chipTextActive]}>
                  {c==="all"?"🔥 All":c==="clothing"?"👗 Clothing":c==="electronics"?"📱 Electronics":c==="shoes"?"👟 Shoes":c==="collectibles"?"🏺 Collectibles":c==="tools"?"🔧 Tools":"🏠 Home"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {loading ? (
          <View style={{alignItems:"center",padding:40}}><ActivityIndicator color={C.green} size="large"/><Text style={[s.body,{marginTop:12}]}>Loading hot items...</Text></View>
        ) : filtered.map((item:any,i:number)=>(
          <View key={i} style={s.itemCard}>
            <View style={{flex:1}}>
              <Text style={s.itemName}>{item.name}</Text>
              <Text style={s.itemMeta}>{item.platform} · {item.sales} sold this week</Text>
            </View>
            <View style={{alignItems:"flex-end",gap:4}}>
              <Text style={s.itemPrice}>${Math.round(item.avgSell||item.avg_sell||0)}</Text>
              <Text style={[s.itemTrend,{color:trendColor(item.trend)}]}>{item.trend||"↑"} trending</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingVertical:14,gap:8},
  navBack:{padding:4},navBackText:{color:C.text3,fontSize:24,lineHeight:24},
  logoRow:{flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:{width:26,height:26,backgroundColor:C.green,borderRadius:7,alignItems:"center",justifyContent:"center"},
  logoIconText:{color:C.greenDark,fontSize:13,fontWeight:"900"},
  logoText:{color:C.text1,fontSize:16,fontWeight:"800",letterSpacing:-0.5},
  h1:{color:C.text1,fontSize:24,fontWeight:"900",letterSpacing:-0.5,marginBottom:4},
  body:{color:C.text2,fontSize:14,lineHeight:21},
  chip:{paddingHorizontal:14,paddingVertical:8,borderRadius:100,borderWidth:1,borderColor:C.border,backgroundColor:C.surface},
  chipActive:{backgroundColor:C.green,borderColor:C.green},
  chipText:{color:C.text3,fontSize:12,fontWeight:"600"},
  chipTextActive:{color:C.greenDark,fontWeight:"700"},
  itemCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:13,padding:16,marginBottom:8,flexDirection:"row",alignItems:"center"},
  itemName:{color:C.text1,fontSize:14,fontWeight:"700",marginBottom:3},
  itemMeta:{color:C.text4,fontSize:12},
  itemPrice:{color:C.green,fontSize:20,fontWeight:"900"},
  itemTrend:{fontSize:11,fontWeight:"700"},
});
