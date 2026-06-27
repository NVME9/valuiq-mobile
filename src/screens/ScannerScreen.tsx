import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Linking, StatusBar, TextInput,
  Image, Dimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { compressPhoto } from "../lib/image";
import { C } from "../lib/theme";
import Coachmark from "../components/Coachmark";
import ShareButton from "../components/ShareButton";
import { API_BASE, scanImage, scanBarcode , getProfitOracle, shareWin } from "../lib/api";
import { scheduleSaleCheckIn } from "../lib/notifications";

const { width } = Dimensions.get("window");
const FRAME = width * 0.72;

type Step = "camera" | "barcode" | "review" | "loading" | "result" | "upgrade";

interface Props {
  token: string;
  plan: string;
  scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string) => void;
  onLogout: () => void;
  tourStep?: string|null; advanceTour?: (s: string|null) => void; skipTour?: () => void;
}

export default function ScannerScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onLogout, tourStep, advanceTour, skipTour }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("camera");
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  const [photos, setPhotos] = useState<string[]>([]);
  const [winShared, setWinShared] = useState(false);
  const [sharingWin, setSharingWin] = useState(false);
  const [brandInput, setBrandInput] = useState("");
  const [loadMsg, setLoadMsg] = useState(0);
  const [goDeeper, setGoDeeper] = useState(false);
  const [description, setDescription] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [result, setResult] = useState<any>(null);
  const [oracle, setOracle] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    setOracle(null);
    const r = result;
    if (r && !r._error && (r.itemName || r.item_name)) {
      getProfitOracle(token, {
        category: r.category,
        brand: r.brand,
        itemName: r.itemName || r.item_name,
        buyPrice: Number(buyPrice) || 0,
      }).then((d) => { if (alive && d && d.success) setOracle(d); });
    }
    return () => { alive = false; };
  }, [result]);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const cameraRef        = useRef<any>(null);
  const [showAnalysis,   setShowAnalysis]   = useState(false);
  const [showShare,      setShowShare]      = useState(false);

  function reset() {
    setStep("camera");
    setResult(null);
    setPhotos([]); setWinShared(false);
    setDescription("");
    setBrandInput("");
    setBuyPrice("");
    setBarcodeScanned(false);
    setMode("photo");
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
    if (photo?.base64) {
      const small = await compressPhoto(photo.base64);
      setPhotos(p => {
        const next = [...p, small].slice(0, 3);
        if (next.length >= 3) setStep("review");
        return next;
      });
    }
  }

  async function pickLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.7 });
    if (!res.canceled && res.assets[0]?.base64) {
      const small = await compressPhoto(res.assets[0].base64);
      setPhotos(p => [...p, small].slice(0, 3));
      setStep("review");
    }
  }

  async function handleBarcode({ data }: BarcodeScanningResult) {
    if (barcodeScanned) return;
    setBarcodeScanned(true);
    await analyze(undefined, data);
  }
  async function analyze(customPhotos?: string[], barcode?: string) {
    setStep("loading");
    try {
      let d: any;
      if (barcode) {
        d = await scanBarcode(token, barcode);
      } else {
        const p = customPhotos || photos;
        if (!p.length && !description && !brandInput) {
          setStep("review"); return;
        }
        d = await scanImage(token, p[0] || "", (brandInput ? "Brand: " + brandInput + ". " : "") + description, buyPrice ? parseFloat(buyPrice) : undefined);
      }
      if (d.error === "scan_limit_reached") {
        onNavigate("upgrade");
        return;
      }
      if (!d.success) throw new Error(d.error || "Analysis failed");
      setResult(d);
      // SALE-CAPTURE MOAT: schedule a BUY check-in
      try {
        if (d && d.decision === "BUY") {
          const sid = d.id || d.scanId || d.scan_id;
          if (sid) scheduleSaleCheckIn(String(sid), d.itemName || d.item_name || "your item");
        }
      } catch {}
      setStep("result");
      if (tourStep === "capture" && advanceTour) advanceTour("result");
      if (plan === "free") setScansLeft(n => n !== null ? Math.max(0, n - 1) : null);
    } catch (e: any) {
      setResult({ _error: e.message });
      setStep("result");
      if (tourStep === "capture" && advanceTour) advanceTour("result");
    }
  }

  // - PERMISSION -
  useEffect(() => {
    if (step !== "loading") return;
    const msgs = ["Identifying your item...","Reading brand & model details...","Pulling real eBay sold comps...","Estimating prices across platforms...","Calculating profit & fees...","Finding the best place to sell..."];
    const id = setInterval(() => setLoadMsg(m => (m + 1) % msgs.length), 1800);
    return () => clearInterval(id);
  }, [step]);

  if (!permission) return <View style={s.center}><ActivityIndicator color={C.green} size="large" /></View>;
  if (!permission.granted) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}></Text>
        <Text style={s.h2}>Camera Required</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 24 }]}>ValuIQ needs camera access to scan items for resale value.</Text>
        <TouchableOpacity style={s.greenBtn} onPress={requestPermission}>
          <Text style={s.greenBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // - LOADING -
  if (step === "loading") return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <View style={s.navLogoRow}>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
        </View>
        <ActivityIndicator size="large" color={C.green} style={{ marginTop: 40, marginBottom: 16 }} />
        <Text style={s.h2}>{["Identifying your item...","Reading brand & model details...","Pulling real eBay sold comps...","Estimating prices across platforms...","Calculating profit & fees...","Finding the best place to sell..."][loadMsg]}</Text>
        <Text style={s.body}>This usually takes a few seconds</Text>
      </View>
    </SafeAreaView>
  );

  // - UPGRADE -
  if (step === "upgrade") return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text style={{ fontSize: 52, textAlign: "center", marginBottom: 16 }}></Text>
        <Text style={[s.h1, { textAlign: "center" }]}>Free scans used up</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 24 }]}>
          Serious resellers scan 50-100 items per run. Upgrade for unlimited.
        </Text>
        <View style={s.dealBox}>
          <Text style={s.dealOld}>$497 regular price</Text>
          <View style={s.dealInner}>
            <Text style={s.dealBadge}> FIRST 100 ONLY - EARLY-BIRD</Text>
            <Text style={s.dealPrice}>$149</Text>
            <Text style={s.dealSub}>one time - Pro features forever</Text>
          </View>
          <TouchableOpacity style={s.dealBtn} onPress={() => onNavigate('upgrade')}>
            <Text style={s.dealBtnText}>Get Lifetime $149 ></Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {[["Seller","$19","C.green"],["Pro","$49","C.orange"]].map(([name,price]) => (
            <TouchableOpacity key={name} style={s.planCard} onPress={() => onNavigate('upgrade')}>
              <Text style={[s.planPrice, { color: name === "Seller" ? C.green : C.orange }]}>{price}</Text>
              <Text style={s.planPer}>/mo</Text>
              <Text style={[s.planName, { color: name === "Seller" ? C.green : C.orange }]}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[s.caption, { textAlign: "center", marginBottom: 16 }]}>Opens getvaluiq.com to subscribe</Text>
        <TouchableOpacity onPress={reset} style={{ alignItems: "center" }}>
          <Text style={{ color: C.text4, fontSize: 14 }}> Back to scanner</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // - RESULT -
  if (step === "result") {
    if (result?._error) return (
      <SafeAreaView style={s.safe}>
        <View style={s.nav}>
          <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>{"\u2039"}</Text></TouchableOpacity>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
        </View>
        <View style={s.center}>
          <Text style={{ fontSize: 36, marginBottom: 16 }}></Text>
          <Text style={s.h2}>Scan Failed</Text>
          <Text style={[s.body, { textAlign: "center" }]}>{result._error}</Text>
          <TouchableOpacity style={[s.greenBtn, { marginTop: 24 }]} onPress={reset}>
            <Text style={s.greenBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

    const hasGoodData   = result.dataQuality === "strong";
    const hasLimitedData = result.dataQuality === "limited";
    const hasNoData      = !hasGoodData && !hasLimitedData;
    const isProfit       = (result.netProfit || 0) > 0;
    const dc             = result.decision === "BUY" ? C.green : result.decision === "WATCH" ? C.yellow : C.red;
    const verdict        = hasNoData ? "UNKNOWN" : result.decision || "PASS";

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content"/>
        <Coachmark
          visible={tourStep === "result"}
          step={3} totalSteps={4}
          title="Your real numbers"
          body="True profit after fees, plus a clear BUY or PASS - based on real eBay sold data, not guesses. This is what makes ValuIQ different. Your scan also saved automatically."
          ctaLabel="See where it saved"
          anchor="center"
          onNext={() => { advanceTour && advanceTour("history"); onNavigate("history"); }}
          onSkip={() => skipTour && skipTour()}
        />
        {/* Nav */}
        <View style={s.nav}>
          <TouchableOpacity onPress={() => setStep("review")} style={s.navBack}>
            <Text style={s.navBackText}>{"\u2039"}</Text>
          </TouchableOpacity>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
          <TouchableOpacity onPress={reset} style={[s.navBtn,{marginLeft:"auto" as any}]}>
            <Text style={s.navBtnText}>New Scan</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{padding:16,paddingBottom:60}} showsVerticalScrollIndicator={false}>

          {/* - VERDICT CARD - */}
          <View style={[s.verdictCard,{borderColor:(hasNoData?C.border:dc)+"40",backgroundColor:(hasNoData?C.surface:dc)+"10"}]}>
            {photos[0] && (
              <Image source={{uri:`data:image/jpeg;base64,${photos[0]}`}}
                style={{width:"100%",height:160,borderRadius:10,marginBottom:12}} resizeMode="cover"/>
            )}
            <Text style={[s.verdictText,{color:hasNoData?C.text3:dc,fontSize:42,lineHeight:48}]} numberOfLines={1} adjustsFontSizeToFit>
              {verdict === "BUY" ? " BUY IT" : verdict === "WATCH" ? " WATCH IT" : verdict === "UNKNOWN" ? "- UNKNOWN" : " PASS"}
            </Text>
            <Text style={s.itemName} numberOfLines={2}>{result.itemName || result.item_name || "Unknown Item"}</Text>
            {result.category ? <Text style={s.itemMeta}>{result.category}{result.condition ? " - " + (result.condition) + "" : ""}</Text> : null}
          </View>

          {/* - UNKNOWN: need more info - */}
          {hasNoData && (
            <View style={s.noDataCard}>
              <Text style={{color:C.text1,fontSize:15,fontWeight:"700",textAlign:"center",marginBottom:8}}>Need More Information</Text>
              <Text style={{color:C.text3,fontSize:13,textAlign:"center",lineHeight:20,marginBottom:16}}>
                Try scanning again with the brand name, model number, or a clearer photo for accurate pricing.
              </Text>
              <TouchableOpacity style={[s.navBtn,{alignSelf:"center",paddingHorizontal:24,paddingTop: 16, paddingBottom: 10}]} onPress={() => setStep("camera")}>
                <Text style={s.navBtnText}> Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* - PROFIT (only when we have data) - */}
          {!hasNoData && (
            <>
              {/* Data confidence */}
              {hasGoodData && result.priceData && result.priceData.isRealData ? (
                <TouchableOpacity style={s.goodBanner} onPress={()=>Linking.openURL(result.priceData.ebaySearchUrl)}>
                  <Text></Text>
                  <View style={{flex:1}}>
                    <Text style={s.goodBannerTitle}>{result.priceData.count} real sold listings</Text>
                    <Text style={s.goodBannerSub}>eBay avg ${result.priceData.avgPrice} - ${result.priceData.minPrice}-${result.priceData.maxPrice}</Text>
                  </View>
                  <Text style={{color:C.green}}>></Text>
                </TouchableOpacity>
              ) : hasLimitedData ? (
                <View style={s.limitedBanner}>
                  <Text></Text>
                  <Text style={s.limitedText}>Estimated - limited data. Verify before buying.</Text>
                </View>
              ) : null}

              {/* AI tier disclosure */}
              {plan === "free" && !hasNoData && (
                <View style={{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:C.surface,borderRadius:8,padding: 8 as any,marginBottom:8,borderWidth:1,borderColor:C.border}}>
                  <Text style={{fontSize:12}}></Text>
                  <Text style={{color:C.text4,fontSize:11,flex:1}}>Standard AI analysis. Upgrade for deeper market intelligence.</Text>
                </View>
              )}

              {/* Profit number */}
              <View style={[s.profitCard,{borderColor:isProfit?C.green+"25":C.red+"25"}]}>
                <Text style={s.profitLabel}>{hasLimitedData?"EST. PROFIT AFTER FEES":"YOUR PROFIT AFTER FEES"}</Text>
                <Text style={[s.profitAmount,{color:isProfit?C.green:C.red,fontSize:52,opacity:hasLimitedData?0.8:1}]}>
                  {isProfit?"+":""}${Math.abs(result.netProfit||0).toFixed(2)}
                </Text>
                <Text style={s.profitSub}>
                  Sell ${result.sellPrice} on {result.bestPlatform} - {result.roi}% ROI
                  {hasLimitedData?" - verify before buying":""}
                </Text>
              </View>

              {/* VELOCITY ENGINE badge */}
              {result.velocity && result.velocity.tier !== "unknown" && (() => {
                const vt = result.velocity.tier;
                const vColor = vt === "fast" ? C.green : vt === "steady" ? C.yellow : C.orange;
                const vLabel = vt === "fast" ? "Fast mover" : vt === "steady" ? "Steady seller" : "Slow mover";
                return (
                  <View style={[s.veloBadge, { borderColor: vColor + "40", backgroundColor: vColor + "12" }]}>
                    <Text style={[s.veloText, { color: vColor }]}>
                      {vLabel}{result.velocity.estDaysToSale ? "  -  ~" + result.velocity.estDaysToSale + " days to sell" : ""}
                    </Text>
                    {result.velocity.sellThrough !== null && (
                      <Text style={s.veloSub}>{result.velocity.sellThrough}% of listings sell{result.velocity.soldCount ? " (" + result.velocity.soldCount + " recent sales)" : ""}</Text>
                    )}
                  </View>
                );
              })()}

              {/* PROFIT ORACLE â€” real-outcome prediction */}
              {oracle && oracle.prediction && (
                <View style={s.oracleCard}>
                  <Text style={s.oracleLabel}>
                    {oracle.dataMode === "crowd-led" ? "\ud83d\udd2e PROFIT ORACLE \u00b7 REAL DATA" : "\ud83d\udd2e PROFIT ORACLE"}
                  </Text>
                  <Text style={s.oracleHead}>{oracle.prediction.headline}</Text>
                  {oracle.dataMode === "crowd-led" && (
                    <View style={s.oracleStats}>
                      {oracle.prediction.sellRate != null && (
                        <View style={s.oracleStat}><Text style={s.oracleVal}>{oracle.prediction.sellRate}%</Text><Text style={s.oracleLbl}>sold</Text></View>
                      )}
                      {oracle.prediction.medianProfit != null && (
                        <View style={s.oracleStat}><Text style={[s.oracleVal,{color:C.green}]}>${oracle.prediction.medianProfit}</Text><Text style={s.oracleLbl}>real profit</Text></View>
                      )}
                      {oracle.prediction.medianDays != null && (
                        <View style={s.oracleStat}><Text style={s.oracleVal}>~{oracle.prediction.medianDays}d</Text><Text style={s.oracleLbl}>to sell</Text></View>
                      )}
                    </View>
                  )}
                  {oracle.prediction.overpayWarning ? (
                    <Text style={s.oracleWarn}>\u26a0\ufe0f {oracle.prediction.overpayWarning}</Text>
                  ) : null}
                </View>
              )}

              {/* Key numbers - compact row */}
              <View style={s.numbersCard}>
                {([
                  ["MAX TO PAY", `$${result.buyTarget||0}`, C.yellow],
                  ["SELL FOR",   `$${result.sellPrice||0}`, C.text1],
                  ["PLATFORM",   result.bestPlatform||"eBay", C.text1],
                ] as [string,string,string][]).map(([label,value,color])=>(
                  <View key={label} style={s.numberItem}>
                    <Text style={s.numberLabel}>{label}</Text>
                    <Text style={[s.numberValue,{color}]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                  </View>
                ))}
              </View>

              {/* Platform comparison - profit ranked */}
              {result.platformBreakdown && result.platformBreakdown.length > 0 && (
                <View style={s.infoCard}>
                  <Text style={[s.infoLabel,{marginBottom:10}]}>BEST PLACE TO SELL</Text>
                  {(goDeeper ? result.platformBreakdown : result.platformBreakdown.slice(0,3)).map((pb:any, i:number) => (
                    <View key={pb.platform} style={{marginBottom:goDeeper?14:8}}>
                      <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
                        <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
                          <View style={{width:3,height:16,borderRadius:2,backgroundColor:i===0?C.green:C.border}}/>
                          <Text style={{color:i===0?C.text1:C.text3,fontSize:14,fontWeight:i===0?"800":"500"}}>{pb.platform}</Text>
                          {i===0 && <Text style={{color:C.green,fontSize:9,fontWeight:"900"}}>BEST</Text>}
                        </View>
                        <Text style={{color:i===0?C.green:C.text2,fontSize:15,fontWeight:"800"}}>+${pb.netProfit} profit</Text>
                      </View>
                      {goDeeper && (
                        <View style={{flexDirection:"row",flexWrap:"wrap",gap:10,marginTop:4,marginLeft:9}}>
                          <Text style={{color:C.text4,fontSize:11}}>Sells ${pb.sellPrice}</Text>
                          <Text style={{color:C.text4,fontSize:11}}>Fees {pb.feeRate}</Text>
                          <Text style={{color:C.text4,fontSize:11}}>{pb.roi}% ROI</Text>
                          <Text style={{color:C.text4,fontSize:11}}>Paid out {pb.payoutSpeed}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                  <TouchableOpacity onPress={()=>setGoDeeper(g=>!g)} style={{marginTop:4,paddingVertical:8,alignItems:"center"}}>
                    <Text style={{color:C.green,fontSize:13,fontWeight:"800"}}>{goDeeper?"Show less":"Go Deeper - full breakdown"}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Verification links */}
              {result.priceData?.allPlatformLinks && (
                <View style={s.infoCard}>
                  <Text style={[s.infoLabel,{marginBottom:10}]}> VERIFY PRICES</Text>
                  <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
                    {[
                      {name:"eBay Sold", url:result.priceData.allPlatformLinks?.eBay},
                      {name:"eBay Active", url:result.priceData.allPlatformLinks?.eBayActive},
                      {name:"Poshmark", url:result.priceData.allPlatformLinks?.Poshmark},
                      {name:"Mercari", url:result.priceData.allPlatformLinks?.Mercari},
                      {name:"Google", url:result.priceData.allPlatformLinks?.Google},
                    ].filter(l => l.url).map(link => (
                      <TouchableOpacity key={link.name} style={{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,borderRadius:8,paddingHorizontal:10,paddingVertical:6}}
                        onPress={()=>Linking.openURL(link.url)}>
                        <Text style={{color:C.green,fontSize:11,fontWeight:"700"}}>{link.name} ></Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Time to sell + payout */}
              {result.timeToSell && (
                <View style={{flexDirection:"row",gap:8,marginBottom:8}}>
                  <View style={[s.infoCard,{flex:1,marginBottom:0}]}>
                    <Text style={s.infoLabel}>- TIME TO SELL</Text>
                    <Text style={{color:C.text1,fontSize:14,fontWeight:"700",marginTop:4}}>{result.timeToSell}</Text>
                  </View>
                  <View style={[s.infoCard,{flex:1,marginBottom:0}]}>
                    <Text style={s.infoLabel}> PAYOUT</Text>
                    <Text style={{color:C.text1,fontSize:14,fontWeight:"700",marginTop:4}}>{result.payoutSpeed||"3-5 days"}</Text>
                  </View>
                </View>
              )}

              {/* FREE TIER PAYWALL - blur premium data */}
              {plan === "free" && (
                <TouchableOpacity
                  style={{backgroundColor:"#0a1500",borderRadius:14,padding:16,marginBottom:12,borderWidth:1,borderColor:C.green+"40",alignItems:"center"}}
                  onPress={()=>onNavigate("upgrade")}
                  activeOpacity={0.85}
                >
                  <Text style={{fontSize:20,marginBottom:6}}></Text>
                  <Text style={{color:C.green,fontSize:14,fontWeight:"900",marginBottom:4}}>Unlock Full Intelligence</Text>
                  <Text style={{color:C.text3,fontSize:12,textAlign:"center",lineHeight:18,marginBottom:10}}>
                    Platform comparison, listing title, risk score, hot tips, and share card are locked on Free. Upgrade to see everything - one good flip pays for 6 months.
                  </Text>
                  <View style={{backgroundColor:C.green,borderRadius:8,paddingHorizontal:20,paddingVertical:8}}>
                    <Text style={{color:C.greenDark,fontWeight:"900",fontSize:13}}>Upgrade from $14.99/mo ></Text>
                  </View>
                  <Text style={{color:C.text4,fontSize:10,marginTop:8}}>Used {scansLeft !== null ? 10 - scansLeft : "?"} of 10 free scans this month</Text>
                </TouchableOpacity>
              )}

              {/* Risk score */}
              {result.riskScore !== undefined && (
                <View style={{flexDirection:"row",alignItems:"center",gap:8,marginBottom:8,backgroundColor:C.surface,borderRadius:10,padding:12,borderWidth:1,borderColor:C.border}}>
                  <Text style={{fontSize:16}}>{result.riskScore<=2?"":result.riskScore<=4?"":""}</Text>
                  <View style={{flex:1}}>
                    <Text style={{color:C.text1,fontSize:13,fontWeight:"700"}}>Risk Score: {result.riskScore}/10</Text>
                    {result.watchOutFor?<Text style={{color:C.text4,fontSize:11,marginTop:2}} numberOfLines={2}>{result.watchOutFor}</Text>:null}
                  </View>
                </View>
              )}

              {/* Edit & Rerun */}
              <TouchableOpacity
                style={{backgroundColor:C.surface,borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:C.border,flexDirection:"row",alignItems:"center",gap:8}}
                onPress={()=>{
                  setDescription(result.itemName||"");
                  setResult(null);
                  setStep("review");
                }}
                activeOpacity={0.8}
              >
                <Text style={{fontSize:16}}></Text>
                <View style={{flex:1}}>
                  <Text style={{color:C.yellow,fontSize:13,fontWeight:"800"}}>Edit & Rerun</Text>
                  <Text style={{color:C.text4,fontSize:11}}>Correct item details to get fresh pricing</Text>
                </View>
              </TouchableOpacity>

              {/* Battle this item */}
              <TouchableOpacity style={s.battleBtn} onPress={()=>result.priceData?.ebaySearchUrl && Linking.openURL(result.priceData.ebaySearchUrl)} activeOpacity={0.85}>
                <Text style={s.battleBtnText}>See What It Sold For on eBay</Text>
                <Text style={s.battleBtnSub}>Real completed sales - verify before you buy</Text>
              </TouchableOpacity>

              {/* Analysis - collapsible */}
              {(result.hotTip || result.reasoning || result.listingTips?.length > 0) && (
                <TouchableOpacity
                  style={[s.infoCard,{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}]}
                  onPress={()=>setShowAnalysis(v=>!v)} activeOpacity={0.85}
                >
                  <Text style={s.infoLabel}> Analysis & Tips</Text>
                  <Text style={{color:C.text4,fontSize:18}}>{showAnalysis?"":""}</Text>
                </TouchableOpacity>
              )}
              {showAnalysis && (
                <View style={[s.infoCard,{marginTop:-8,borderTopLeftRadius:0,borderTopRightRadius:0}]}>
                  {result.hotTip ? (
                    <View style={{marginBottom:12}}>
                      <Text style={[s.infoLabel,{color:C.red}]}> Hot Tip</Text>
                      <Text style={s.infoText}>{result.hotTip}</Text>
                    </View>
                  ) : null}
                  {result.reasoning ? (
                    <View style={{marginBottom:12}}>
                      <Text style={s.infoLabel}>Analysis</Text>
                      <Text style={s.infoText}>{result.reasoning}</Text>
                    </View>
                  ) : null}
                  {result.listingTips?.length > 0 && (
                    <View>
                      <Text style={s.infoLabel}>Listing Tips</Text>
                      {result.listingTips.map((tip:string,i:number)=>(
                        <View key={i} style={{flexDirection:"row",gap:8,marginBottom:6}}>
                          <Text style={{color:C.green,fontSize:13}}>></Text>
                          <Text style={{color:C.text2,fontSize:13,lineHeight:20,flex:1}}>{tip}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Share - collapsible */}
              <TouchableOpacity
                style={[s.infoCard,{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:8}]}
                onPress={()=>setShowShare(v=>!v)} activeOpacity={0.85}
              >
                <Text style={s.infoLabel}> Share & Content</Text>
                <Text style={{color:C.text4,fontSize:18}}>{showShare?"":""}</Text>
              </TouchableOpacity>
              {showShare && (
                <View style={[s.infoCard,{marginTop:-8,borderTopLeftRadius:0,borderTopRightRadius:0}]}>
                  {result.decision==="BUY" && photos[0] && (
                    <View style={s.shareCard}>
                      <Image source={{uri:`data:image/jpeg;base64,${photos[0]}`}}
                        style={s.shareCardImg} resizeMode="cover"/>
                      <View style={s.shareCardBody}>
                        <Text style={s.shareCardItem} numberOfLines={1}>{result.itemName||result.item_name||"Item"}</Text>
                        <Text style={s.shareHeroLbl}>PROFIT POTENTIAL</Text>
                        <Text style={s.shareHeroVal}>+${Math.round(result.netProfit||0)}</Text>
                        <View style={s.shareCardRow}>
                          <View style={s.shareCardStat}>
                            <Text style={s.shareStatVal}>{Math.round(result.roi||0)}%</Text>
                            <Text style={s.shareStatLbl}>ROI</Text>
                          </View>
                          <View style={s.shareCardStat}>
                            <Text style={s.shareStatVal}>${Math.round(result.sellPrice||0)}</Text>
                            <Text style={s.shareStatLbl}>SELLS FOR</Text>
                          </View>
                          <View style={s.shareCardStat}>
                            <Text style={s.shareStatVal}>${Math.round(result.buyTarget||result.suggestedBuy||0)}</Text>
                            <Text style={s.shareStatLbl}>BUY UNDER</Text>
                          </View>
                        </View>
                        <View style={s.shareBrandRow}>
                          <Text style={s.shareBrandName}>ValuIQ</Text>
                          <Text style={s.shareBrandTag}>Scan it. Know it. Flip it.</Text>
                        </View>
                      </View>
                    </View>
                  )}
                   <ShareButton
                     message={
                       (result?.decision==="BUY"
                         ? " Just found a $" + Math.round(result.netProfit||0) + " profit flip! " + (result.itemName||"Item") + " - " + Math.round(result.roi||0) + "% ROI on " + (result.bestPlatform||"eBay")
                         : result?.decision==="WATCH"
                         ? " Watching this one... " + (result.itemName||"Item")
                         : " ValuIQ saved me from a bad buy - " + (result?.itemName||"Item") + " doesn't pencil out"
                       ) + "\n\nI use ValuIQ to find profitable flips > getvaluiq.com"
                     }
                     title="My ValuIQ Find"
                     compact
                   />
                   {result.decision === "BUY" && (result.netProfit || 0) >= 20 && (
                     <TouchableOpacity
                       style={s.communityShareBtn}
                       disabled={winShared || sharingWin}
                       activeOpacity={0.85}
                       onPress={async () => {
                         setSharingWin(true);
                         const ok = await shareWin(token, result.itemName || "Great find", result.netProfit || 0, "eBay", "");
                         setSharingWin(false);
                         if (ok) setWinShared(true);
                       }}>
                       <Text style={s.communityShareTxt}>
                         {winShared ? "\u2713  Shared with the community!" : sharingWin ? "Sharing..." : "\uD83C\uDF89  Share this win with the community"}
                       </Text>
                     </TouchableOpacity>
                   )}
                </View>
              )}
            </>
          )}

          {/* Upgrade nudge for free users */}
          {plan==="free" && scansLeft !== null && scansLeft <= 3 && (
            <TouchableOpacity style={s.upgradeNudge} onPress={()=>onNavigate("upgrade")} activeOpacity={0.88}>
              <View style={{flex:1}}>
                <Text style={{color:C.green,fontSize:9,fontWeight:"800",letterSpacing:2,marginBottom:4}}>FREE PLAN</Text>
                <Text style={{color:C.text1,fontSize:13,fontWeight:"700"}}>{scansLeft} scans left this month</Text>
                <Text style={{color:C.text3,fontSize:11}}>Upgrade for unlimited scans</Text>
              </View>
              <Text style={{color:C.green,fontSize:18}}>></Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>
    );
  }

  // - REVIEW (photo added, before analyze) -
  if (step === "review") return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.nav}>
        <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>{"\u2039"}</Text></TouchableOpacity>
        <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
        <Text style={s.logoText}>ValuIQ</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={[s.h2, { marginBottom: 4 }]}>What are you looking at?</Text>
        <Text style={[s.body, { marginBottom: 16 }]}>More detail = better result. A photo makes the biggest difference.</Text>

        {/* Photos */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {photos.map((p, i) => (
            <View key={i}>
              <Image source={{ uri: `data:image/jpeg;base64,${p}` }} style={s.photoThumb} />
              <TouchableOpacity
                onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                style={s.removePhoto}>
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}></Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 3 && (
            <View style={{ gap: 8, flexDirection: "row" }}>
              <TouchableOpacity onPress={() => setStep("camera")} style={s.addPhotoBtn}>
                <Text style={{ fontSize: 22 }}></Text>
                <Text style={s.addPhotoBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickLibrary} style={s.addPhotoBtn}>
                <Text style={{ fontSize: 22 }}></Text>
                <Text style={s.addPhotoBtnText}>Library</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Description */}
        <Text style={[s.caption, { marginBottom: 6 }]}>Brand (optional - greatly improves accuracy)</Text>
        <TextInput style={s.textInput} value={brandInput} onChangeText={setBrandInput} placeholder="e.g. Coach, Nike, DeWalt" placeholderTextColor={C.text4} />
        <Text style={[s.caption, { marginBottom: 6, marginTop: 12 }]}>Model or notes (optional)</Text>
        <TextInput
          style={s.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Nike, Air Force 1, size 10, good condition"
          placeholderTextColor={C.text4}
          multiline numberOfLines={2}
        />

        {/* Buy price (optional) */}
        <Text style={[s.caption, { marginBottom: 6, marginTop: 12 }]}>What you'd pay for it (optional - improves BUY/PASS accuracy)</Text>
        <TextInput
          style={s.textInput}
          value={buyPrice}
          onChangeText={setBuyPrice}
          placeholder="$0.00"
          placeholderTextColor={C.text4}
          keyboardType="decimal-pad"
        />

        {/* Scan counter */}
        {plan === "free" && scansLeft !== null && (
          <View style={[s.scanBadge, {
            borderColor: scansLeft === 0 ? C.red + "40" : scansLeft <= 1 ? C.yellow + "40" : C.green + "30",
            backgroundColor: scansLeft === 0 ? "#2a0505" : scansLeft <= 1 ? "#2a1500" : C.green + "10" }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green }} />
            <Text style={{ color: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green, fontSize: 12, fontWeight: "700" }}>
              {scansLeft === 0 ? "No scans left - upgrade to continue" : `${scansLeft} scan${scansLeft !== 1 ? "s" : ""} left this month`}
            </Text>
          </View>
        )}

        <TouchableOpacity style={[s.greenBtn, { marginTop: 14 }]} onPress={() => analyze()}>
          <Text style={s.greenBtnText}>Analyze Now ></Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // - BARCODE mode -
  if (step === "camera" && mode === "barcode") return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />
      <Coachmark
        visible={tourStep === "capture"}
        step={2} totalSteps={4}
        title="Snap your first item"
        body="Point your camera at any item and tap the shutter - or pick a photo from your library. ValuIQ will fetch its real resale value and profit."
        ctaLabel="Got it"
        anchor="top"
        onNext={() => advanceTour && advanceTour("capture")}
        onSkip={() => skipTour && skipTour()}
      />
      <CameraView style={{ flex: 1, position: "absolute" as any, top:0, left:0, right:0, bottom:0 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13","ean8","upc_a","upc_e","qr","code128","code39"] }}
        onBarcodeScanned={handleBarcode} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <View style={[s.camTop, { paddingTop: insets.top + 8 }]}>
            <View style={s.camLogoBadge}><Text style={s.camLogoText}>ValuIQ</Text></View>
            <TouchableOpacity onPress={() => setMode("photo")} style={s.camModeBtn}>
              <Text style={s.camModeBtnText}> Photo Mode</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {/* Barcode frame - rectangular */}
            <View style={s.barcodeFrame}>
              {[
                [{ top: 0, left: 0 }, { borderRightWidth: 0, borderBottomWidth: 0 }],
                [{ top: 0, right: 0 }, { borderLeftWidth: 0, borderBottomWidth: 0 }],
                [{ bottom: 0, left: 0 }, { borderRightWidth: 0, borderTopWidth: 0 }],
                [{ bottom: 0, right: 0 }, { borderLeftWidth: 0, borderTopWidth: 0 }],
              ].map(([pos, border], i) => (
                <View key={i} style={[s.corner, pos as any, border as any]} />
              ))}
              <View style={s.barcodeLine} />
            </View>
            <Text style={s.camHint}>Point at any barcode</Text>
          </View>
          <View style={s.camBottomBar}>
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center" }}>
              Supports, UPC, EAN, QR codes,
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  // - CAMERA (photo mode) -
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />
      <Coachmark
        visible={tourStep === "capture"}
        step={2} totalSteps={4}
        title="Snap your first item"
        body="Point your camera at any item and tap the shutter - or pick a photo from your library. ValuIQ will fetch its real resale value and profit."
        ctaLabel="Got it"
        anchor="top"
        onNext={() => advanceTour && advanceTour("capture")}
        onSkip={() => skipTour && skipTour()}
      />
      <CameraView ref={cameraRef} style={{ flex: 1, position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {/* Top bar */}
          <View style={[s.camTop, { paddingTop: insets.top + 8 }]}>
            <View style={s.camLogoBadge}><Text style={s.camLogoText}>ValuIQ</Text></View>
            {plan === "free" && scansLeft !== null && (
              <View style={[s.camScanBadge, { borderColor: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green }]}>
                <Text style={{ color: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green, fontSize: 11, fontWeight: "700" }}>
                  {scansLeft === 0 ? "No scans left" : `${scansLeft} left`}
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={() => onNavigate("thrift-run")} style={s.camModeBtn}>
              <Text style={s.camModeBtnText}>Thrift Run</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode("barcode")} style={s.camModeBtn}>
              <Text style={s.camModeBtnText}> Barcode</Text>
            </TouchableOpacity>
          </View>

          {/* Scan frame */}
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: FRAME, height: FRAME, position: "relative" }}>
              {[
                [{ top: 0, left: 0 }, { borderRightWidth: 0, borderBottomWidth: 0 }],
                [{ top: 0, right: 0 }, { borderLeftWidth: 0, borderBottomWidth: 0 }],
                [{ bottom: 0, left: 0 }, { borderRightWidth: 0, borderTopWidth: 0 }],
                [{ bottom: 0, right: 0 }, { borderLeftWidth: 0, borderTopWidth: 0 }],
              ].map(([pos, border], i) => (
                <View key={i} style={[s.corner, pos as any, border as any]} />
              ))}
            </View>
            <Text style={s.camHint}>Snap 1-3 photos, then tap Done</Text>
          </View>

          {/* Controls */}
          <View style={s.camControls}>
            <TouchableOpacity style={s.camSecondBtn} onPress={pickLibrary}>
              <Text numberOfLines={1} style={s.camSecondLabel}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shutter} onPress={takePhoto}>
              <View style={s.shutterInner} />
              {photos.length > 0 && <View style={s.shutterBadge}><Text style={s.shutterBadgeTxt}>{photos.length}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity style={s.camSecondBtn} onPress={() => photos.length > 0 && setStep("review")} disabled={photos.length === 0}>
              <Text style={[s.camSecondLabel, { color: photos.length > 0 ? C.green : "rgba(255,255,255,0.3)" }]} numberOfLines={1}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  communityShareBtn: { marginTop: 10, backgroundColor: C.greenBg, borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  communityShareTxt: { color: C.green, fontSize: 14.5, fontWeight: "800" },
  safe:           { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  h1:             { color: C.text1, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  h2:             { color: C.text1, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  body:           { color: C.text2, fontSize: 14, lineHeight: 21 },
  caption:        { color: C.text4, fontSize: 12, lineHeight: 18 },

  // Nav,
  nav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, gap: 8 },
  navBack:        { padding: 4 },
  navBackText:    { color: C.text3, fontSize: 24, lineHeight: 24 },
  navLogoRow:     { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon:       { width: 26, height: 26, backgroundColor: C.green, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  logoIconText:   { color: C.greenDark, fontSize: 13, fontWeight: "900" },
  logoText:       { color: C.text1, fontSize: 16, fontWeight: "800", letterSpacing: -0.5 },
  navBtn:         { borderWidth: 1, borderColor: C.border, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  navBtnText:     { color: C.text3, fontSize: 12, fontWeight: "600" },

  // Camera,
  camTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  camLogoBadge:   { backgroundColor: "rgba(168,230,61,0.15)", borderWidth: 1, borderColor: "rgba(168,230,61,0.3)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  camLogoText:    { color: C.green, fontSize: 14, fontWeight: "900" },
  camScanBadge:   { borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "rgba(0,0,0,0.5)" },
  camModeBtn:     { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  camModeBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  corner:         { position: "absolute", width: 28, height: 28, borderColor: C.green, borderWidth: 3 },
  camHint:        { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 14, fontWeight: "600" },
  camSecondBtn: { width: 96, alignItems: "center", justifyContent: "center" },
  camSecondLabel: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600" },
  libIcon: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  libIconTxt: { color: "#fff", fontSize: 24, fontWeight: "400", lineHeight: 28 },
  shutter:        { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner:   { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
  shutterBadge:   { position: "absolute", top: -4, right: -4, backgroundColor: C.green, borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  shutterBadgeTxt:{ color: "#000", fontSize: 13, fontWeight: "900" },
  doneBtn: { width: 72, height: 50, borderRadius: 25, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  doneBtnTxt: { color: "#000", fontSize: 14, fontWeight: "900" },
  camControls: { paddingBottom: 48, paddingTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 40 },
  camBottomBar:   { paddingBottom: 40, paddingHorizontal: 24 },

  // Barcode,
  barcodeFrame:   { width: width * 0.8, height: 120, position: "relative", justifyContent: "center", alignItems: "center" },
  barcodeLine:    { width: "100%", height: 2, backgroundColor: C.green + "80" },

  // Review,
  photoThumb:     { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  removePhoto:    { position: "absolute", top: 4, right: 4, width: 20, height: 20, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addPhotoBtn:    { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  addPhotoBtnText:{ color: C.text4, fontSize: 10, marginTop: 4 },
  textInput:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, color: C.text1, fontSize: 14, minHeight: 72, textAlignVertical: "top" },
  scanBadge:      { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 12, alignSelf: "flex-start" },

  // Result,
  goodBanner:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.greenBg, borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  goodBannerTitle:{ color: C.green, fontSize: 13, fontWeight: "800", marginBottom: 2 },
  goodBannerSub:  { color: C.text3, fontSize: 12 },
  limitedBanner:  { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1a1508", borderWidth: 1, borderColor: C.yellow + "40", borderRadius: 12, padding: 12, marginBottom: 12 },
  limitedText:    { color: C.yellow, fontSize: 13, fontWeight: "700", flex: 1 },
  noDataBanner:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1a0808", borderWidth: 1, borderColor: C.red + "30", borderRadius: 12, padding: 12, marginBottom: 12 },
  noDataText:     { color: C.red, fontSize: 13, fontWeight: "700", flex: 1 },
  verdictCard:    { borderWidth: 2, borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 12 },
  verdictIcon:    { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  verdictText:    { fontWeight: "900", letterSpacing: -1, lineHeight: 52, marginBottom: 8 },
  itemName:       { color: C.text1, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  itemMeta:       { color: C.text3, fontSize: 13, textAlign: "center" },
  profitCard:     { backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 2, borderRadius: 20, padding: 20, marginBottom: 10, alignItems: "center" },
  profitLabel:    { color: C.text3, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  profitAmount:   { fontWeight: "900", letterSpacing: -2, lineHeight: 68, marginBottom: 6 },
  veloBadge: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 12, alignItems: "center" },
  veloText: { fontSize: 16, fontWeight: "800" },
    oracleCard: { backgroundColor: "#1a1424", borderColor: "#b066ff40", borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12 },
  oracleLabel: { color: "#b066ff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 },
  oracleHead: { color: C.text1, fontSize: 14, fontWeight: "700", lineHeight: 20, marginBottom: 8 },
  oracleStats: { flexDirection: "row", gap: 20, marginBottom: 6 },
  oracleStat: {},
  oracleVal: { color: C.text1, fontSize: 18, fontWeight: "800" },
  oracleLbl: { color: C.text4, fontSize: 11, marginTop: 1 },
  oracleWarn: { color: C.yellow, fontSize: 13, fontWeight: "600", marginTop: 4 },
veloSub: { fontSize: 12, color: C.text3, marginTop: 3 },
  profitSub:      { color: C.text2, fontSize: 13, textAlign: "center" },
  noDataCard:     { backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 20, marginBottom: 10 },
  numbersCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, flexDirection: "row", marginBottom: 10, overflow: "hidden" },
  numberItem:     { flex: 1, padding: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: C.border },
  numberLabel:    { color: C.text4, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  numberValue:    { fontSize: 16, fontWeight: "900", textAlign: "center" },
  tipCard:        { backgroundColor: "#1a1200", borderWidth: 1, borderColor: C.yellow + "30", borderRadius: 13, padding: 14, marginBottom: 10 },
  tipLabel:       { color: C.yellow, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  tipText:        { color: C.text2, fontSize: 13, lineHeight: 20 },
  infoCard:       { backgroundColor: "rgba(0,0,0,0.3)", borderWidth: 1, borderColor: C.border, borderRadius: 13, padding: 14, marginBottom: 10 },
  infoLabel:      { color: C.text4, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  infoText:       { color: C.text2, fontSize: 14, lineHeight: 22 },

  // Upgrade,
  dealBox:        { backgroundColor: "#0d0d00", borderWidth: 1, borderColor: "#2a2000", borderRadius: 18, padding: 18, marginBottom: 12 },
  dealOld:        { color: C.text4, fontSize: 14, textDecorationLine: "line-through", marginBottom: 8, opacity: 0.5 },
  dealInner:      { backgroundColor: "#1a1200", borderWidth: 2, borderColor: C.yellow, borderStyle: "dashed", borderRadius: 12, padding: 14, marginBottom: 12 },
  dealBadge:      { color: C.yellow, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, marginBottom: 6 },
  dealPrice:      { color: C.yellow, fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  dealSub:        { color: C.yellow, fontSize: 13, fontWeight: "700" },
  dealBtn:        { backgroundColor: C.yellow, borderRadius: 14, padding: 15, alignItems: "center" },
  dealBtnText:    { color: "#000", fontSize: 16, fontWeight: "900" },
  planCard:       { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, alignItems: "center" },
  planPrice:      { fontSize: 26, fontWeight: "900" },
  planPer:        { color: C.text4, fontSize: 12 },
  planName:       { fontSize: 14, fontWeight: "800", marginTop: 4 },

  greenBtn:       { backgroundColor: C.green, borderRadius: 14, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 32, alignItems: "center" as any, alignSelf: "center" as any },
  greenBtnText:   { color: C.greenDark, fontSize: 15, fontWeight: "900" as any },
  battleBtn:      { backgroundColor: C.surfaceHigh, borderWidth: 1.5, borderColor: C.orange+"50", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 10 },
  battleBtnText:  { color: C.orange, fontSize: 15, fontWeight: "800" },
  battleBtnSub:   { color: C.text4, fontSize: 11, marginTop: 3 },
  quickActions:   { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  quickBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8 },
  quickBtnIcon:   { fontSize: 16 },
  quickBtnText:   { color: "#fff", fontSize: 12, fontWeight: "700", flexShrink: 1 },
  refNudge: { backgroundColor:"#1e2a08", borderWidth:1, borderColor:"#3a5010", borderRadius:14, padding:16, marginTop:12, marginBottom:4 },
  refTitle:  { color:"#a8e63d", fontSize:14, fontWeight:"700" as any },
  refBody:   { color:"#a09b94", fontSize:12, marginBottom:10, lineHeight:17 },
  refBtn:    { backgroundColor:"#a8e63d", borderRadius:10, padding:11, alignItems:"center" as any },
  refBtnTxt: { color:"#0f1500", fontSize:13, fontWeight:"900" as any },

  shareCard:        { backgroundColor:C.surface, borderWidth:1.5, borderColor:C.greenBorder, borderRadius:16, overflow:"hidden" as any, marginBottom:10 },
  shareCardImg:     { width:"100%" as any, height:200 },
  shareCardBody:    { padding:14 },
  shareCardBadge:   { backgroundColor:C.green, borderRadius:100, paddingHorizontal:12, paddingTop:16, paddingBottom:10, alignSelf:"flex-start" as any, marginBottom:8 },
  shareCardBadgeTxt:{ color:C.greenDark, fontSize:10, fontWeight:"900" as any },
  shareCardItem:    { color:C.text1, fontSize:16, fontWeight:"800" as any, marginBottom:10 },
  shareHeroLbl:     { color:C.green, fontSize:11, fontWeight:"900" as any, letterSpacing:1.5, marginBottom:2 },
  shareHeroVal:     { color:C.green, fontSize:52, fontWeight:"900" as any, marginBottom:12, letterSpacing:-1 },
  shareBrandRow:    { flexDirection:"row" as any, alignItems:"center" as any, justifyContent:"space-between" as any, marginTop:12, paddingTop:12, borderTopWidth:1, borderTopColor:C.border },
  shareBrandName:   { color:C.text1, fontSize:18, fontWeight:"900" as any, letterSpacing:0.5 },
  shareBrandTag:    { color:C.text4, fontSize:11, fontWeight:"600" as any },
  shareCardRow:     { flexDirection:"row" as any, gap:8, marginBottom:8 },
  shareCardStat:    { flex:1, backgroundColor:C.bg, borderRadius:8, padding:8, alignItems:"center" as any },
  shareStatVal:     { color:C.green, fontSize:16, fontWeight:"900" as any },
  shareStatLbl:     { color:C.text4, fontSize:8, fontWeight:"700" as any, textTransform:"uppercase" as any, marginTop:2 },
  shareCardFooter:  { color:C.text4, fontSize:10, textAlign:"center" as any } });