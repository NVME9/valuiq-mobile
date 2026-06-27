import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { compressPhoto } from "../../lib/image";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { B } from "../../lib/businessTheme";
import { API_BASE } from "../../lib/api";

interface Props { token:string; onBack:()=>void; }

interface Job { id:string; status:string; progress:number; total:number; itemsProcessed:number; created_at:string; result?:any; }

export default function ManifestBeast({ token, onBack }: Props) {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lotCost, setLotCost] = useState("");

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
      mediaTypes: ImagePicker.MediaType.Images,
      allowsEditing: false, quality: 0.9, base64: true });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const raw = result.assets[0].base64; const base64 = raw ? await compressPhoto(raw) : raw;
      const r = await fetch(`${API_BASE}/api/business/manifest-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, imageBase64: base64, mimeType: "image/jpeg", costMode: lotCost ? "total" : "auto", lotCost: parseFloat(lotCost) || 0 }) });
      const d = await r.json();
      if (d.jobId) {
        Alert.alert("Manifest Analyzed", d.sampled ? `Analyzed a ${d.analyzedItems}-item sample of ${d.totalItems} items. See your report below.` : `Analyzed all ${d.totalItems} items. See your report below.`);
        loadJobs();
      } else {
        Alert.alert("Upload, Failed", d.error || "Please try again.");
      }
    } catch { Alert.alert("Error", "Upload failed. Please try again."); }
    setUploading(false);
  }

  // Auto-detect which columns hold name / qty / retail from messy manifest headers.
  function mapRows(rawRows: any[]): {name:string;qty:number;retail:number}[] {
    if (!rawRows.length) return [];
    const headers = Object.keys(rawRows[0] || {});
    const find = (cands: string[]) =>
      headers.find(h => cands.some(c => h.toLowerCase().replace(/[^a-z]/g,"").includes(c)));
    const nameCol   = find(["itemname","productname","description","title","item","product","name","desc"]);
    const qtyCol    = find(["qty","quantity","units","count","cases","pack"]);
    const retailCol = find(["retail","msrp","price","unitprice","extretail","value","cost"]);
    return rawRows.map(r => ({
      name:   String(nameCol ? r[nameCol] : (Object.values(r)[0] || "")).trim(),
      qty:    parseInt(qtyCol ? r[qtyCol] : "1") || 1,
      retail: parseFloat(String(retailCol ? r[retailCol] : "0").replace(/[^0-9.]/g,"")) || 0,
    })).filter(x => x.name.length > 1);
  }

  async function uploadSpreadsheet() {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ["text/csv","text/comma-separated-values",
               "application/vnd.ms-excel",
               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        copyToCacheDirectory: true,
      });
      if (pick.canceled || !pick.assets?.[0]) return;
      const file = pick.assets[0];
      setUploading(true);

      let rows: any[] = [];
      const lower = (file.name || "").toLowerCase();

      if (lower.endsWith(".csv")) {
        const text = await FileSystem.readAsStringAsync(file.uri);
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        rows = mapRows(parsed.data as any[]);
      } else {
        // Excel: read as base64 -> XLSX
        const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        const wb = XLSX.read(b64, { type: "base64" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        rows = mapRows(json as any[]);
      }

      if (!rows.length) {
        Alert.alert("No items found", "We couldn't read item rows from that file. Make sure it has a header row with item names.");
        setUploading(false); return;
      }

      const r = await fetch(`${API_BASE}/api/business/manifest-upload-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rows, costMode: lotCost ? "total" : "auto", lotCost: parseFloat(lotCost) || 0 }),
      });
      const d = await r.json();
      if (d.jobId) {
        Alert.alert("Manifest Analyzed", d.sampled ? `Analyzed a ${d.analyzedItems}-item sample of ${d.totalItems} items. Your lot projection scales from this sample.` : `Analyzed all ${d.totalItems} items. See your report below.`);
        loadJobs();
      } else {
        Alert.alert("Upload Failed", d.error || "Please try again.");
      }
    } catch (e:any) {
      Alert.alert("Error", e?.message || "Could not read that file.");
    }
    setUploading(false);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={B.bg}/>
      <View style={s.nav}>
        <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backTxt}>{"\u2039"}</Text></TouchableOpacity>
        <Text style={s.navTitle}>📋 Manifest Beast</Text>
        <View style={{width:36}}/>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroTitle}>Any manifest. Real eBay prices. Your max bid.</Text>
          <Text style={s.heroSub}>Upload any manifest - photo or CSV/Excel. We price each item against real eBay sold data and give you a risk-adjusted lot value plus your maximum profitable bid.</Text>
          <View style={s.costBox}>
            <Text style={s.costLbl}>What you'll pay for the whole lot (optional)</Text>
            <View style={s.costInputRow}>
              <Text style={s.costDollar}>$</Text>
              <TextInput style={s.costInput} value={lotCost} onChangeText={setLotCost} keyboardType="numeric" placeholder="e.g. 1800" placeholderTextColor={B.text4} />
            </View>
            <Text style={s.costHint}>Leave blank and we'll estimate cost at 25% of retail.</Text>
          </View>
          <TouchableOpacity style={[s.uploadBtn, uploading && {opacity:0.7}]} onPress={uploadManifest} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#000" size="small"/> : <Text style={s.uploadBtnTxt}>📸 Upload Manifest Photo</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.uploadBtn, {backgroundColor:"transparent", borderWidth:1, borderColor:B.orange, marginTop:10}, uploading && {opacity:0.7}]} onPress={uploadSpreadsheet} disabled={uploading}>
            <Text style={[s.uploadBtnTxt, {color:B.orange}]}>Upload Spreadsheet (CSV/Excel)</Text>
          </TouchableOpacity>
          <Text style={s.uploadNote}>Photo or PDF of a manifest, or a CSV/Excel liquidation manifest file</Text>
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
                    <View style={[s.progressFill, {width:(Math.round((job.itemsProcessed||0)/(job.total||1)*100)) + "%" as any}]}/>
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
                  {job.result.lot && (
                    <View style={s.lotCard}>
                      <View style={s.lotVerdictRow}>
                        <Text style={s.lotVerdictLabel}>LOT VERDICT</Text>
                        <View style={[s.lotBadge,
                          job.result.lot.lotVerdict==="STRONG"?{backgroundColor:"#00d08420"}:
                          job.result.lot.lotVerdict==="FAIR"?{backgroundColor:B.orangeBg}:
                          job.result.lot.lotVerdict==="RISKY"?{backgroundColor:"#ffb02020"}:
                          {backgroundColor:"#ff453a20"}]}>
                          <Text style={[s.lotBadgeTxt,
                            job.result.lot.lotVerdict==="STRONG"?{color:B.profit}:
                            job.result.lot.lotVerdict==="FAIR"?{color:B.orange}:
                            job.result.lot.lotVerdict==="RISKY"?{color:"#ffb020"}:
                            {color:"#ff453a"}]}>{job.result.lot.lotVerdict}</Text>
                        </View>
                      </View>
                      <View style={s.lotNetRow}>
                        <View style={{flex:1}}>
                          <Text style={s.lotNetVal}>${(job.result.lot.projectedNet||0).toLocaleString()}</Text>
                          <Text style={s.lotNetLbl}>Projected Net</Text>
                        </View>
                        <View style={{flex:1}}>
                          <Text style={s.lotGrossVal}>${(job.result.lot.projectedGrossResale||0).toLocaleString()}</Text>
                          <Text style={s.lotNetLbl}>Gross Resale</Text>
                        </View>
                      </View>
                      <Text style={s.maxBidLabel}>YOUR MAX BID</Text>
                      <View style={s.bidRow}><Text style={s.bidName}>Safe</Text><Text style={s.bidRoi}>75% ROI</Text><Text style={s.bidVal}>${(job.result.lot.maxBid?.safe||0).toLocaleString()}</Text></View>
                      <View style={[s.bidRow,s.bidRowTarget]}><Text style={[s.bidName,{color:B.orange,fontWeight:"900"}]}>Target</Text><Text style={s.bidRoi}>40% ROI</Text><Text style={[s.bidVal,{color:B.orange}]}>${(job.result.lot.maxBid?.target||0).toLocaleString()}</Text></View>
                      <View style={s.bidRow}><Text style={s.bidName}>Aggressive</Text><Text style={s.bidRoi}>20% ROI</Text><Text style={s.bidVal}>${(job.result.lot.maxBid?.aggressive||0).toLocaleString()}</Text></View>
                      {job.result.lot.confidenceNote ? <Text style={s.lotNote}>{job.result.lot.confidenceNote}</Text> : null}
                    </View>
                  )}
                  {(job.result.topItems||[]).slice(0,3).map((item:any,j:number)=>(
                    <View key={j} style={s.topItem}>
                      <Text style={s.topItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={[s.topItemProfit,{color:B.profit}]}>+${Math.round(item.profit||0)}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={s.reportBtn}>
                    <Text style={s.reportBtnTxt}>📄 Download PDF Report</Text>
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
  costBox:     {marginTop:14,marginBottom:4},
  costLbl:     {color:B.text2,fontSize:12,fontWeight:"700" as any,marginBottom:6},
  costInputRow:{flexDirection:"row",alignItems:"center",backgroundColor:B.bg,borderWidth:1,borderColor:B.border2,borderRadius:10,paddingHorizontal:12},
  costDollar:  {color:B.text2,fontSize:16,fontWeight:"800" as any,marginRight:4},
  costInput:   {flex:1,color:B.text1,fontSize:15,paddingVertical:11},
  costHint:    {color:B.text4,fontSize:11,marginTop:5},
  heroTitle:   {color:B.text1,fontSize:18,fontWeight:"900" as any,lineHeight:24,marginBottom:8},
  heroSub:     {color:B.text3,fontSize:13,lineHeight:19,marginBottom:16},
  uploadBtn:   {backgroundColor:B.orange,borderRadius:13,padding:15,alignItems:"center"},
  uploadBtnTxt:{color:"#000",fontSize:14,fontWeight:"900" as any},
  uploadNote:  {color:B.text4,fontSize:11,textAlign:"center" as any,marginTop:10,lineHeight:16},
  returnsCard: {backgroundColor:B.surface,borderWidth:1,borderColor:B.border,borderRadius:14,padding:16,marginBottom:16},
  returnsTitle:{color:B.text1,fontSize:13,fontWeight:"800" as any,marginBottom:10},
  lotCard:     {backgroundColor:B.bg,borderWidth:1.5,borderColor:B.orangeBorder,borderRadius:14,padding:14,marginTop:12,marginBottom:6},
  lotVerdictRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:12},
  lotVerdictLabel:{color:B.text3,fontSize:11,fontWeight:"800" as any,letterSpacing:1},
  lotBadge:    {paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  lotBadgeTxt: {fontSize:12,fontWeight:"900" as any,letterSpacing:0.5},
  lotNetRow:   {flexDirection:"row",marginBottom:14,paddingBottom:14,borderBottomWidth:1,borderBottomColor:B.border},
  lotNetVal:   {color:B.profit,fontSize:24,fontWeight:"900" as any},
  lotGrossVal: {color:B.text1,fontSize:24,fontWeight:"900" as any},
  lotNetLbl:   {color:B.text4,fontSize:11,marginTop:2},
  maxBidLabel: {color:B.text1,fontSize:12,fontWeight:"900" as any,letterSpacing:1,marginBottom:8},
  bidRow:      {flexDirection:"row",alignItems:"center",paddingVertical:7,paddingHorizontal:10,borderRadius:8,marginBottom:4},
  bidRowTarget:{backgroundColor:B.orangeBg},
  bidName:     {color:B.text2,fontSize:13,fontWeight:"700" as any,flex:1},
  bidRoi:      {color:B.text4,fontSize:11,flex:1,textAlign:"center" as any},
  bidVal:      {color:B.text1,fontSize:16,fontWeight:"900" as any,flex:1,textAlign:"right" as any},
  lotNote:     {color:B.text4,fontSize:10,marginTop:8,fontStyle:"italic" as any,lineHeight:14},
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
