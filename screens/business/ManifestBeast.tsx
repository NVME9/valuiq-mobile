import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token:string; onBack:()=>void; }

interface Job { id:string; status:string; progress:number; total:number; itemsProcessed:number; created_at:string; result?:any; }

export default function ManifestBeast({ token, onBack }: Props) {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadJobs(); const t = setInterval(loadJobs, 8000); return ()=>clearInterval(t); }, []);

  async function loadJobs() {
    try {
      const r = await fetch(`${API_BASE}/api/business/manifest-jobs?token=${token}`);
      const d = await r.json();
      if (d.jobs) setJobs(d.jobs);
    } catch {}
    setLoading(false);
  }

  async function uploadManifest() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.9, base64: true });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const base64 = result.assets[0].base64;
      const r = await fetch(`${API_BASE}/api/business/manifest-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imageBase64: base64, mimeType: "image/jpeg" }) });
      const d = await r.json();
      if (d.jobId) {
        Alert.alert("✅ Manifest, Uploaded", `Job started. ValuIQ is analyzing your manifest.\n\nEstimated time: ${d.estimatedMinutes||10} minutes for ${d.estimatedItems||"your"} items.\n\nWe'll notify you when it's complete.`);
        loadJobs();
      } else {
        Alert.alert("Upload, Failed", d.error || "Please try again.");
      }
    } catch { Alert.alert("Error", "Upload failed. Please try again."); }
    setUploading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>←</Text></TouchableOpacity>
        <Text style={s.navTitle}>📋 Manifest Beast</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroTitle}>5,000+ items analyzed. Overnight. Automatically.</Text>
          <Text style={s.heroSub}>Upload any manifest — photo, PDF scan, or CSV. OCR extracts every item. AI prices each one with real eBay data. You wake up to a complete profit report.</Text>
          <TouchableOpacity style={[s.uploadBtn, uploading && {opacity:0.7}]} onPress={uploadManifest} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#000" size="small"/> : <Text style={s.uploadBtnTxt}>📸 Upload Manifest Photo</Text>}
          </TouchableOpacity>
          <Text style={s.uploadNote}>Supports: photo of manifest, PDF scan, Excel screenshot, handwritten list</Text>
        </View>

        {/* What you get */}
        <View style={s.returnsCard}>
          <Text style={s.returnsTitle}>Every report includes:</Text>
          {[
            "✅ Top 50 items ranked by expected profit",
            "✅ Items to pass on (not worth pulling)",
            "✅ Expected total lot profit",
            "✅ Recommended sell price per item",
            "✅ Best platform for each item",
            "✅ Branded, PDF ready to share",
          ].map((item,i)=>(
            <Text key={i} style={s.returnItem}>{item}</Text>
          ))}
        </View>

        {/* Active/Completed, Jobs */}
        <Text style={s.secTit}>YOUR MANIFEST JOBS</Text>
        {loading ? (
          <ActivityIndicator color={B.orange} style={{marginTop:20}}/>
        ) : jobs.length === 0 ? (
          <View style={s.emptyJobs}>
            <Text style={{fontSize:36,marginBottom:10}}>📋</Text>
            <Text style={s.emptyTxt}>No manifests yet</Text>
            <Text style={s.emptySub}>Upload your first manifest above — results arrive overnight</Text>
          </View>
        ) : (
          jobs.map((job,i) => (
            <View key={job.id || i} style={[s.jobCard, job.status==="complete" && {borderColor:"#00d08430"}]}>
              <View style={s.jobHeader}>
                <Text style={s.jobDate}>{new Date(job.created_at).toLocaleDateString()}</Text>
                <View style={[s.jobStatus,
                  job.status==="complete"?{backgroundColor:"#00d08420"}:
                  job.status==="processing"?{backgroundColor:B.orangeBg}:
                  {backgroundColor:B.surface}
                ]}>
                  <Text style={[s.jobStatusTxt,
                    job.status==="complete"?{color:B.profit}:
                    job.status==="processing"?{color:B.orange}:
                    {color:B.text3}
                  ]}>
                    {job.status==="complete"?"✓ Complete":job.status==="processing"?"⚙ Processing":"⏳ Queued"}
                  </Text>
                </View>
              </View>

              {job.status === "processing" && (
                <View style={s.progressRow}>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, {width:`${Math.round((job.itemsProcessed||0)/(job.total||1)*100)}%` as any}]}/>
                  </View>
                  <Text style={s.progressTxt}>{job.itemsProcessed||0} / {job.total||0} items</Text>
                </View>
              )}

              {job.status === "complete" && job.result && (
                <View style={s.resultSection}>
                  <View style={s.resultStats}>
                    <View style={s.rStat}><Text style={[s.rVal,{color:B.profit}]}>{job.result.buyCount||0}</Text><Text style={s.rLbl}>Pull</Text></View>
                    <View style={s.rStat}><Text style={s.rVal}>{job.result.totalItems||0}</Text><Text style={s.rLbl}>Total</Text></View>
                    <View style={s.rStat}><Text style={[s.rVal,{color:B.profit}]}>${Math.round(job.result.totalProfit||0)}</Text><Text style={s.rLbl}>Est. Profit</Text></View>
                  </View>
                  {(job.result.topItems||[]).slice(0,3).map((item:any,j:number)=>(
                    <View key={j} style={s.topItem}>
                      <Text style={s.topItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={[s.topItemProfit,{color:B.profit}]}>+${Math.round(item.profit||0)}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={s.reportBtn}>
                    <Text style={s.reportBtnTxt}>📄 Download, PDF Report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        {flex:1,backgroundColor:B.bg},
  nav:         {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:B.border},
  back:        {width:36,height:36,justifyContent:"center"},
  backTxt:     {color:B.text3,fontSize:22},
  navTitle:    {color:B.text1,fontSize:15,fontWeight:"800" as any},
  scroll:      {padding:16,paddingBottom:60},
  hero:        {backgroundColor:B.surface,borderWidth:1.5,borderColor:B.orangeBorder,borderRadius:16,padding:18,marginBottom:12},
  heroTitle:   {color:B.text1,fontSize:18,fontWeight:"900" as any,lineHeight:24,marginBottom:8},
  heroSub:     {color:B.text3,fontSize:13,lineHeight:19,marginBottom:16},
  uploadBtn:   {backgroundColor:B.orange,borderRadius:13,padding:15,alignItems:"center"},
  uploadBtnTxt:{color:"#000",fontSize:14,fontWeight:"900" as any},
  uploadNote:  {color:B.text4,fontSize:11,textAlign:"center" as any,marginTop:10,lineHeight:16},
  returnsCard: {backgroundColor:B.surface,borderWidth:1,borderColor:B.border,borderRadius:14,padding:16,marginBottom:16},
  returnsTitle:{color:B.text1,fontSize:13,fontWeight:"800" as any,marginBottom:10},
  returnItem:  {color:B.text2,fontSize:13,lineHeight:22},
  secTit:      {color:B.text3,fontSize:9,fontWeight:"800" as any,letterSpacing:2,textTransform:"uppercase" as any,marginBottom:10},
  emptyJobs:   {alignItems:"center",paddingVertical:40},
  emptyTxt:    {color:B.text1,fontSize:16,fontWeight:"700" as any,marginBottom:6},
  emptySub:    {color:B.text3,fontSize:13,textAlign:"center" as any},
  jobCard:     {backgroundColor:B.surface,borderWidth:1,borderColor:B.border,borderRadius:14,padding:14,marginBottom:10},
  jobHeader:   {flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:10},
  jobDate:     {color:B.text3,fontSize:12},
  jobStatus:   {borderRadius:100,paddingHorizontal:10,paddingVertical:4},
  jobStatusTxt:{fontSize:11,fontWeight:"700" as any},
  progressRow: {gap:6},
  progressBg:  {height:6,backgroundColor:B.border,borderRadius:3,overflow:"hidden" as any},
  progressFill:{height:6,backgroundColor:B.orange,borderRadius:3},
  progressTxt: {color:B.text3,fontSize:11},
  resultSection:{},
  resultStats: {flexDirection:"row",gap:8,marginBottom:12},
  rStat:       {flex:1,backgroundColor:B.bg,borderRadius:10,padding:10,alignItems:"center"},
  rVal:        {color:B.text1,fontSize:18,fontWeight:"900" as any},
  rLbl:        {color:B.text4,fontSize:10,marginTop:2},
  topItem:     {flexDirection:"row",justifyContent:"space-between",paddingVertical:6,borderBottomWidth:1,borderBottomColor:B.border},
  topItemName: {color:B.text2,fontSize:12,flex:1},
  topItemProfit:{fontSize:12,fontWeight:"700" as any},
  reportBtn:   {backgroundColor:B.orangeBg,borderWidth:1,borderColor:B.orangeBorder,borderRadius:10,padding:12,alignItems:"center",marginTop:10},
  reportBtnTxt:{color:B.orange,fontSize:13,fontWeight:"700" as any} });
