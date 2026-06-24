import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, RefreshControl, Modal, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../lib/theme";
import { API_BASE } from "../lib/api";
import ShareButton from "../components/ShareButton";

type Status = "unlisted" | "listed" | "sold";
interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

const STATUS_COLOR: Record<Status,string> = { unlisted:C.text4, listed:C.yellow, sold:C.green };
const STATUS_LABEL: Record<Status,string> = { unlisted:"📦 Unlisted", listed:"🏪 Listed", sold:"✅ Sold" };

export default function InventoryScreen({ token, plan, onNavigate, onBack }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all"|Status>("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ itemName:"", boughtPrice:"", targetPrice:"", platform:"eBay", status:"unlisted" as Status, notes:"" });
  const [saving, setSaving] = useState(false);
  const isPaid = ["seller","pro","lifetime","titan"].includes(plan);

  useEffect(()=>{ if(isPaid) load(); else setLoading(false); },[]);

  async function load() {
    try {
      const r = await fetch(`${API_BASE}/api/inventory?token=${token}`);
      const d = await r.json();
      if (d.success) { setItems(d.items||[]); setStats(d.stats); }
    } catch {}
    setLoading(false);
  }
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function saveItem() {
    if (!form.itemName.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await fetch(`${API_BASE}/api/inventory`, {
          method:"PATCH", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ token, itemId:editing.id, updates:{ item_name:form.itemName, bought_price:Number(form.boughtPrice)||0, target_price:Number(form.targetPrice)||0, platform:form.platform, status:form.status, notes:form.notes } }) });
      } else {
        await fetch(`${API_BASE}/api/inventory`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ token, item:{ itemName:form.itemName, boughtPrice:Number(form.boughtPrice)||0, targetPrice:Number(form.targetPrice)||0, platform:form.platform, status:form.status, notes:form.notes } }) });
      }
      setAdding(false); setEditing(null);
      setForm({ itemName:"", boughtPrice:"", targetPrice:"", platform:"eBay", status:"unlisted", notes:"" });
      await load();
    } catch {}
    setSaving(false);
  }

  async function updateStatus(item: any, status: Status) {
    await fetch(`${API_BASE}/api/inventory`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ token, itemId:item.id, updates:{ status, ...(status==="listed"?{listed_at:new Date().toISOString(),listed_price:item.target_price}:{}), ...(status==="sold"?{sold_at:new Date().toISOString(),sold_price:item.listed_price||item.target_price}:{}) } }) });
    await load();
  }

  async function deleteItem(id: string) {
    await fetch(`${API_BASE}/api/inventory`, {
      method:"DELETE", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ token, itemId:id }) });
    await load();
  }

  function startEdit(item: any) {
    setForm({ itemName:item.item_name||"", boughtPrice:String(item.bought_price||""), targetPrice:String(item.target_price||""), platform:item.platform||"eBay", status:item.status||"unlisted", notes:item.notes||"" });
    setEditing(item); setAdding(true);
  }

  const filtered = filter==="all" ? items : items.filter(x=>x.status===filter);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={()=>onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>Inventory</Text></View>
        {isPaid&&<TouchableOpacity onPress={()=>{setEditing(null);setForm({itemName:"",boughtPrice:"",targetPrice:"",platform:"eBay",status:"unlisted",notes:""});setAdding(v=>!v);}} style={[s.navBtn,{marginLeft:"auto" as any,borderColor:C.green+"40"}]}>
          <Text style={[s.navBtnText,{color:C.green}]}>+ Add Item</Text>
        </TouchableOpacity>}
      </View>

      {/* Add/Edit, Modal */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={()=>setAdding(false)}>
        <Pressable style={s.overlay} onPress={()=>setAdding(false)}>
          <Pressable style={s.sheet} onPress={e=>e.stopPropagation()}>
            <View style={s.sheetHandle}/>
            <Text style={s.sheetTitle}>{editing?"Edit Item":"Add to Inventory"}</Text>
            <ScrollView>
              <Text style={s.fieldLabel}>Item Name *</Text>
              <TextInput style={s.input} value={form.itemName} onChangeText={v=>setForm(f=>({...f,itemName:v}))} placeholder="e.g. Lululemon, Leggings" placeholderTextColor={C.text4}/>
              <View style={{flexDirection:"row",gap:10}}>
                <View style={{flex:1}}><Text style={s.fieldLabel}>Bought For</Text><TextInput style={s.input} value={form.boughtPrice} onChangeText={v=>setForm(f=>({...f,boughtPrice:v}))} placeholder="$0" placeholderTextColor={C.text4} keyboardType="decimal-pad"/></View>
                <View style={{flex:1}}><Text style={s.fieldLabel}>Target Sell Price</Text><TextInput style={s.input} value={form.targetPrice} onChangeText={v=>setForm(f=>({...f,targetPrice:v}))} placeholder="$0" placeholderTextColor={C.text4} keyboardType="decimal-pad"/></View>
              </View>
              <Text style={s.fieldLabel}>Status</Text>
              <View style={{flexDirection:"row",gap:8,marginBottom:12}}>
                {(["unlisted","listed","sold"] as Status[]).map(st=>(
                  <TouchableOpacity key={st} onPress={()=>setForm(f=>({...f,status:st}))} style={[s.statusChip,form.status===st&&{backgroundColor:STATUS_COLOR[st]+"20",borderColor:STATUS_COLOR[st]}]}>
                    <Text style={[s.statusChipText,form.status===st&&{color:STATUS_COLOR[st]}]}>{STATUS_LABEL[st]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>Notes</Text>
              <TextInput style={[s.input,{minHeight:72,textAlignVertical:"top"}]} value={form.notes} onChangeText={v=>setForm(f=>({...f,notes:v}))} placeholder="Condition notes, listing tips..." placeholderTextColor={C.text4} multiline/>
              <View style={{flexDirection:"row",gap:10,marginTop:14,paddingBottom:20}}>
                <TouchableOpacity style={[s.saveBtn,{flex:1}]} onPress={saveItem} disabled={saving}>
                  {saving?<ActivityIndicator color={C.greenDark} size="small"/>:<Text style={s.saveBtnText}>{editing?"Save Changes":"Add to Inventory"}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={()=>setAdding(false)}><Text style={s.cancelBtnText}>Cancel</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={{padding:20,paddingBottom:60}} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.green}/>}>
        {!isPaid && (
          <View style={s.lockedCard}><Text style={{fontSize:36,marginBottom:10}}>🔒</Text><Text style={s.lockedTitle}>Seller Plan Required</Text><Text style={s.lockedBody}>Track every item from buy to sold, see your real P&L.</Text>
            <TouchableOpacity style={[s.saveBtn,{marginTop:12}]} onPress={()=>onNavigate("upgrade")}><Text style={s.saveBtnText}>Upgrade →</Text></TouchableOpacity>
          </View>
        )}

        {isPaid && stats && (
          <View style={s.statsGrid}>
            {[
              [stats.totalItems,"Items","📦",C.text1],
              [stats.activeCount,"Listed","🏪",C.yellow],
              [stats.soldCount,"Sold","✅",C.green],
              ["$"+Math.round(stats.totalProfit),"Profit","💰",C.green],
              ["$"+Math.round(stats.totalInvested),"Invested","💸",C.orange],
              [stats.roi+"%","ROI","📈",C.green],
            ].map(([val,label,icon,color])=>(
              <View key={label as string} style={s.statCard}>
                <Text style={{fontSize:18,marginBottom:4}}>{icon as string}</Text>
                <Text style={[s.statVal,{color:color as string}]}>{val as string}</Text>
                <Text style={s.statLabel}>{label as string}</Text>
              </View>
            ))}
          </View>
        )}

        {isPaid && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
              <View style={{flexDirection:"row",gap:6}}>
                {(["all","unlisted","listed","sold"] as const).map(f=>(
                  <TouchableOpacity key={f} onPress={()=>setFilter(f)} style={[s.filterChip,filter===f&&s.filterChipActive]}>
                    <Text style={[s.filterText,filter===f&&s.filterTextActive]}>
                      {f==="all"?"All":STATUS_LABEL[f as Status]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {loading ? <ActivityIndicator color={C.green} style={{padding:32}}/>
            : filtered.length===0 ? (
              <View style={s.emptyCard}><Text style={{fontSize:36,marginBottom:10}}>📦</Text><Text style={s.emptyTitle}>No items yet</Text><Text style={s.emptyBody}>Tap "+ Add Item" to start tracking your inventory</Text></View>
            ) : filtered.map(item=>{
              const profit = (Number(item.sold_price)||Number(item.listed_price)||Number(item.target_price)||0) - (Number(item.bought_price)||0);
              const statusColor = STATUS_COLOR[item.status as Status] || C.text4;
              return (
                <View key={item.id} style={[s.itemCard,{borderColor:statusColor+"30"}]}>
                  <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <View style={{flex:1,paddingRight:10}}>
                      <Text style={s.itemName} numberOfLines={1}>{item.item_name}</Text>
                      <Text style={s.itemMeta}>{item.platform} · {item.category||"—"}</Text>
                    </View>
                    <View style={[s.statusBadge,{backgroundColor:statusColor+"15",borderColor:statusColor+"40"}]}>
                      <Text style={[s.statusBadgeText,{color:statusColor}]}>{STATUS_LABEL[item.status as Status]||item.status}</Text>
                    </View>
                  </View>
                  <View style={{flexDirection:"row",gap:8,marginBottom:12}}>
                    {[["Paid","$"+Math.round(Number(item.bought_price)||0),C.text3],["Target","$"+Math.round(Number(item.target_price)||0),C.text1],["Profit","$"+Math.round(profit),profit>0?C.green:C.red]].map(([l,v,c])=>(
                      <View key={l as string} style={s.priceChip}>
                        <Text style={s.priceChipLabel}>{l as string}</Text>
                        <Text style={[s.priceChipVal,{color:c as string}]}>{v as string}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{flexDirection:"row",gap:6,flexWrap:"wrap" as any}}>
                    {item.status==="unlisted" && <TouchableOpacity onPress={()=>updateStatus(item,"listed")} style={[s.actionBtn,{borderColor:C.yellow+"50"}]}><Text style={[s.actionBtnText,{color:C.yellow}]}>Mark Listed</Text></TouchableOpacity>}
                    {item.status==="listed" && <TouchableOpacity onPress={()=>updateStatus(item,"sold")} style={[s.actionBtn,{borderColor:C.green+"50"}]}><Text style={[s.actionBtnText,{color:C.green}]}>Mark Sold ✅</Text></TouchableOpacity>}
                    <TouchableOpacity onPress={()=>startEdit(item)} style={s.actionBtn}><Text style={s.actionBtnText}>Edit</Text></TouchableOpacity>
                    <TouchableOpacity onPress={()=>deleteItem(item.id)} style={[s.actionBtn,{borderColor:C.red+"30"}]}><Text style={[s.actionBtnText,{color:C.red}]}>Delete</Text></TouchableOpacity>
                  </View>
                  {item.notes?<Text style={s.itemNotes} numberOfLines={1}>{item.notes}</Text>:null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},nav:{flexDirection:"row",alignItems:"center",paddingHorizontal:20,paddingTop: 16, paddingBottom: 10,gap:8},
  navBack:{padding:4},navBackText:{color:C.text3,fontSize:24,lineHeight:24},
  logoRow:{flexDirection:"row",alignItems:"center",gap:8},
  logoIcon:{width:26,height:26,backgroundColor:C.green,borderRadius:7,alignItems:"center",justifyContent:"center"},
  logoIconText:{color:C.greenDark,fontSize:13,fontWeight:"900"},
  logoText:{color:C.text1,fontSize:16,fontWeight:"800",letterSpacing:-0.5},
  navBtn:{borderWidth:1,borderColor:C.border,borderRadius:7,paddingHorizontal:10,paddingVertical:5},
  navBtnText:{color:C.text3,fontSize:12,fontWeight:"600"},
  overlay:{flex:1,backgroundColor:"rgba(0,0,0,0.75)",justifyContent:"flex-end"},
  sheet:{backgroundColor:C.surface,borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,maxHeight:"85%"},
  sheetHandle:{width:40,height:4,backgroundColor:C.border,borderRadius:2,alignSelf:"center",marginBottom:16},
  sheetTitle:{color:C.text1,fontSize:18,fontWeight:"900",marginBottom:16},
  fieldLabel:{color:C.text3,fontSize:13,fontWeight:"700",marginBottom:6,marginTop:10},
  input:{backgroundColor:C.bg,borderWidth:1,borderColor:C.border,borderRadius:12,padding:13,color:C.text1,fontSize:14},
  statusChip:{flex:1,borderWidth:1,borderColor:C.border,borderRadius:10,paddingTop:16, paddingBottom:10,alignItems:"center"},
  statusChipText:{color:C.text4,fontSize:12,fontWeight:"600"},
  saveBtn:{backgroundColor:C.green,borderRadius:12,padding:14,alignItems:"center"},
  saveBtnText:{color:C.greenDark,fontSize:15,fontWeight:"900"},
  cancelBtn:{borderWidth:1,borderColor:C.border,borderRadius:12,padding:14,paddingHorizontal:18},
  cancelBtnText:{color:C.text4,fontSize:14},
  statsGrid:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:16},
  statCard:{width:"30%",backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:14,padding:12,alignItems:"center"},
  statVal:{fontSize:16,fontWeight:"900",marginBottom:2},
  statLabel:{color:C.text4,fontSize:9,fontWeight:"700",textTransform:"uppercase"},
  filterChip:{paddingHorizontal:14,paddingTop:16, paddingBottom:10,borderRadius:100,borderWidth:1,borderColor:C.border,backgroundColor:C.surface},
  filterChipActive:{backgroundColor:C.green,borderColor:C.green},
  filterText:{color:C.text3,fontSize:12,fontWeight:"600"},
  filterTextActive:{color:C.greenDark,fontWeight:"700"},
  emptyCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:36,alignItems:"center"},
  emptyTitle:{color:C.text1,fontSize:16,fontWeight:"700",marginBottom:6},
  emptyBody:{color:C.text3,fontSize:13,textAlign:"center"},
  itemCard:{backgroundColor:C.surface,borderWidth:1.5,borderRadius:14,padding:14,marginBottom:10},
  itemName:{color:C.text1,fontSize:15,fontWeight:"700"},
  itemMeta:{color:C.text4,fontSize:12,marginTop:2},
  statusBadge:{borderWidth:1,borderRadius:100,paddingHorizontal:10,paddingVertical:4},
  statusBadgeText:{fontSize:11,fontWeight:"700"},
  priceChip:{flex:1,backgroundColor:C.bg,borderRadius:8,padding:10,alignItems:"center"},
  priceChipLabel:{color:C.text4,fontSize:9,fontWeight:"700",textTransform:"uppercase",marginBottom:3},
  priceChipVal:{fontSize:16,fontWeight:"900"},
  actionBtn:{borderWidth:1,borderColor:C.border,borderRadius:8,paddingHorizontal:12,paddingVertical:7},
  actionBtnText:{color:C.text3,fontSize:12,fontWeight:"700"},
  itemNotes:{color:C.text4,fontSize:11,marginTop:8,fontStyle:"italic"},
  lockedCard:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:16,padding:32,alignItems:"center"},
  lockedTitle:{color:C.text1,fontSize:18,fontWeight:"800",marginBottom:6},
  lockedBody:{color:C.text3,fontSize:13,textAlign:"center",lineHeight:20} });
