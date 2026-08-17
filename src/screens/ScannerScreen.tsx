import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Linking, StatusBar, TextInput,
  Image, Dimensions, Animated, Alert } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { compressPhoto } from "../lib/image";
import { C } from "../lib/theme";
import Coachmark from "../components/Coachmark";
import ShareButton from "../components/ShareButton";
import ShareCard from "../components/ShareCard";
import { API_BASE, scanImage, scanBarcode , getProfitOracle, shareWin } from "../lib/api";
import { scheduleSaleCheckIn, requestNotificationPermission } from "../lib/notifications";
import StagedProgress from "../components/StagedProgress";
import * as Notifications from "expo-notifications";
import { matchSpecialtyCategory } from "./SpecialtyScreen";
import ProfitFlexHero from "../components/ProfitFlexHero";
import { classifyOutcome } from "../lib/outcomeTier";

const { width } = Dimensions.get("window");
const FRAME = width * 0.72;
const MAX_PHOTOS = 5;

// TEMPORARY: formats a stage's ms into the debug timing readout (see the
// DEBUG box on the result screen). "pending" for a stage that hasn't
// finished yet (e.g. the Oracle call, which loads after the result screen
// is already showing) rather than a misleading 0.0s.
function fmtSec(ms: number | null | undefined): string {
  return ms != null ? (ms / 1000).toFixed(1) + "s" : "pending";
}

type Step = "camera" | "barcode" | "review" | "loading" | "result" | "upgrade";

interface Props {
  token: string;
  plan: string;
  scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string, data?: any) => void;
  onLogout: () => void;
  tourStep?: string|null; advanceTour?: (s: string|null) => void; skipTour?: () => void;
}

// Reusable collapsed-by-default section: the hero answers the question
// immediately, everything else (best-place-to-sell, verify-prices, payout,
// risk, analysis & tips, share & content) is one tap away instead of
// sprawled down the screen.
function CollapsibleSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <>
      <TouchableOpacity
        style={[s.infoCard,{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}]}
        onPress={onToggle} activeOpacity={0.85}
      >
        <Text style={s.infoLabel}>{title}</Text>
        <Text style={{color:C.text4,fontSize:12,fontWeight:"700"}}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={[s.infoCard,{marginTop:-8,borderTopLeftRadius:0,borderTopRightRadius:0}]}>
          {children}
        </View>
      )}
    </>
  );
}

export default function ScannerScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onLogout, tourStep, advanceTour, skipTour }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("camera");
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  const [photos, setPhotos] = useState<string[]>([]);
  const [winShared, setWinShared] = useState(false);
  const [sharingWin, setSharingWin] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const shareCardRef = useRef<ViewShot>(null);
  const [brandInput, setBrandInput] = useState("");
  const [goDeeper, setGoDeeper] = useState(false);
  const [description, setDescription] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [result, setResult] = useState<any>(null);
  const [oracle, setOracle] = useState<any>(null);
  // Soft notification ask (never fire Apple's cold prompt un-primed)
  const [pendingCheckIn, setPendingCheckIn] = useState<{scanId:string; itemName:string}|null>(null);
  const [checkInAsked, setCheckInAsked] = useState(false);
  async function acceptCheckIn() {
    const p = pendingCheckIn;
    setPendingCheckIn(null); setCheckInAsked(true);
    if (!p) return;
    const granted = await requestNotificationPermission();
    if (granted) { try { await scheduleSaleCheckIn(p.scanId, p.itemName); } catch {} }
  }
  function declineCheckIn() { setPendingCheckIn(null); setCheckInAsked(true); }

  async function shareResultImage() {
    if (!shareCardRef.current?.capture || sharingImage) return;
    setSharingImage(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing not available", "Sharing isn't supported on this device.");
        return;
      }
      const uri = await shareCardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your ValuIQ find" });
    } catch {
      Alert.alert("Couldn't share", "Something went wrong creating the share image. Try again.");
    } finally {
      setSharingImage(false);
    }
  }
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
        estValue: Number(r.sellPrice) || 0,
        // Hand the Oracle the numbers this scan already computed. The lens
        // math is the source of truth: buyTarget is the 3x rule against the
        // real sale price, and netProfit already accounts for the winning
        // platform's actual fee rate and the user's cost. Passing them here
        // is what stops the Oracle and the platform card from disagreeing.
        bestPlatform: r.bestPlatform,
        lensBuyTarget: Number(r.buyTarget) || 0,
        lensNetProfit: Number(r.netProfit) || 0,
        // "Did lens actually price this item" signal for the Oracle - separate
        // from lensNetProfit, which alone can't tell a real $0 profit apart
        // from "lens gave us nothing."
        lensSellPrice: Number(r.sellPrice) || 0,
      }).then((d) => { if (alive && d && d.success) setOracle(d); });
    }
    return () => { alive = false; };
    // buyPrice matters: without it the Oracle is computed once at scan time and
    // never updates when the user enters what they're actually paying.
  }, [result, buyPrice]);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const cameraRef        = useRef<any>(null);
  const [showAnalysis,   setShowAnalysis]   = useState(false);
  const [showShare,      setShowShare]      = useState(false);
  const [showPlatforms,  setShowPlatforms]  = useState(false);
  const [showVerify,     setShowVerify]     = useState(false);
  const [showPayout,     setShowPayout]     = useState(false);
  const [showRisk,       setShowRisk]       = useState(false);

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
        const next = [...p, small].slice(0, MAX_PHOTOS);
        if (next.length >= MAX_PHOTOS) { setStep("review"); if ((tourStep === "capture" || tourStep === "scanning") && advanceTour) advanceTour("review"); }
        return next;
      });
    }
  }

  async function pickLibrary() {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], base64: true, quality: 0.7,
      allowsMultipleSelection: true, selectionLimit: remaining,
    });
    if (res.canceled || !res.assets?.length) return;
    const picked = res.assets.slice(0, remaining);
    const compressed: string[] = [];
    for (const a of picked) {
      if (a.base64) compressed.push(await compressPhoto(a.base64));
    }
    if (compressed.length) {
      setPhotos(p => [...p, ...compressed].slice(0, MAX_PHOTOS));
      setStep("review");
      if ((tourStep === "capture" || tourStep === "scanning") && advanceTour) advanceTour("review");
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
        d = await scanImage(token, p, (brandInput ? "Brand: " + brandInput + ". " : "") + description, buyPrice ? parseFloat(buyPrice) : undefined);
      }
      if (d.error === "scan_limit_reached") {
        onNavigate("upgrade");
        return;
      }
      if (!d.success) throw new Error(d.error || "Analysis failed");
      setResult(d);
      // SALE-CAPTURE MOAT: on a BUY, either schedule (if already allowed) or
      // surface the soft in-app ask. Never fire Apple's cold prompt directly.
      try {
        if (d && d.decision === "BUY") {
          const sid = d.id || d.scanId || d.scan_id;
          const nm = d.itemName || d.item_name || "your item";
          if (sid) {
            const { status } = await Notifications.getPermissionsAsync();
            if (status === "granted") {
              scheduleSaleCheckIn(String(sid), nm);
            } else if (status !== "denied") {
              // Not yet asked â€” show our own ask, in context, after they see the win.
              setPendingCheckIn({ scanId: String(sid), itemName: nm });
            }
          }
        }
      } catch {}
      setStep("result");
      if ((tourStep === "review" || tourStep === "review-wait" || tourStep === "capture" || tourStep === "scanning") && advanceTour) advanceTour("result");
      if (plan === "free") setScansLeft(n => n !== null ? Math.max(0, n - 1) : null);
    } catch (e: any) {
      setResult({ _error: e.message });
      setStep("result");
      if ((tourStep === "review" || tourStep === "review-wait" || tourStep === "capture" || tourStep === "scanning") && advanceTour) advanceTour("result");
    }
  }

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
  // Step durations calibrated to REAL measured lens/route.ts timing
  // (_debug.timing from live production runs, post-Haiku-swap):
  // identify ~1.6-2s, comps+pricing LLM ~2-2.5s. Forward-only, holds on the
  // last step if the real call runs long - never loops, never claims done
  // early. See src/components/StagedProgress.tsx.
  if (step === "loading") return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <View style={s.navLogoRow}>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
        </View>
        <StagedProgress
          active
          steps={[
            { label: "Identifying item", ms: 1800 },
            { label: "Checking real sold data", ms: 2100 },
            { label: "Calculating profit", ms: 600 },
          ]}
        />
      </View>
    </SafeAreaView>
  );

  // - UPGRADE -
  if (step === "upgrade") return (
    <SafeAreaView style={s.safe}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
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
            <Text style={s.dealBtnText}>Get Lifetime $149 {'>'}</Text>
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
    const specialtyMatch  = matchSpecialtyCategory(result.category, result.itemName || result.item_name);

    // Profit: whichever number is actually shown as the hero (Oracle
    // real/est profit when present, else the lens's own netProfit). Both are
    // computed against the SAME cost basis - the user's entered buy price
    // when they gave one, else the max-buy ceiling - so this is genuinely
    // "actual profit" whenever a price was entered, not a projection.
    const oraclePred    = oracle?.prediction;
    const oracleProfit  = oraclePred
      ? Number(oracle.dataMode === "crowd-led" ? oraclePred.medianProfit : oraclePred.estProfit)
      : NaN;
    const heroProfit     = !isNaN(oracleProfit) ? oracleProfit : (Number(result.netProfit) || 0);

    const enteredBp = Number(buyPrice) || 0;
    // Hoisted so the hero and the debug readout read the exact same value.
    const oracleMaxBuy = oraclePred
      ? (oracle.dataMode === "crowd-led" ? oraclePred.safeMaxBuy : oraclePred.estMaxBuy)
      : null;
    const maxBuy = oracleMaxBuy != null ? Number(oracleMaxBuy) : (Number(result.buyTarget) || null);
    const profitLabel = enteredBp > 0 ? "actual profit" : "projected profit";

    // ROI MUST be computed against the SAME cost basis as heroProfit - the
    // entered price when one exists, else the max-buy ceiling. This used to
    // always divide by buyTarget (the ceiling) even when a real price was
    // entered, which silently understated ROI (e.g. $13 profit / $5 ceiling
    // = 260%, instead of the real $13 / $1 entered = 1300%) and fed the
    // wrong number into the tier classifier - that's what made a 1300%-ROI
    // flip misread as "not worth the trip."
    const actualCostBasis = enteredBp > 0 ? enteredBp : (maxBuy || 0);
    const heroRoi = actualCostBasis > 0
      ? Math.round((heroProfit / actualCostBasis) * 100)
      : (Number(result.roi) || 0);

    const oracleDaysTxt = oraclePred
      ? (oraclePred.medianDays != null ? `~${oraclePred.medianDays}d` : (oraclePred.medianDaysLabel || null))
      : null;
    const sellTimeLabel = oraclePred
      ? (oraclePred.medianDays != null
          ? `~${oraclePred.medianDays} days`
          : (oraclePred.medianDaysLabel && oraclePred.medianDaysLabel !== "not enough data yet" ? oraclePred.medianDaysLabel : null))
      : null;

    // Outcome tier — THE single source of truth for the verdict. Dominated
    // by ROI/margin (not raw profit dollars), so a $13 profit on a $1 buy
    // (1300% ROI) and a $13 profit on a $100 buy (13% ROI) read as opposite
    // verdicts even though the dollar amount is identical. Nothing else on
    // this screen independently computes or displays a conflicting verdict.
    const outcome = classifyOutcome({
      decision: result.decision,
      netProfit: heroProfit,
      roi: heroRoi,
      velocityTier: result.velocity?.tier,
      sellThrough: result.velocity?.sellThrough,
      dataQuality: result.dataQuality,
      sellPrice: Number(result.sellPrice) || null,
      sellTimeLabel,
    });
    const isSkip = outcome.tier === "skip";

    const categoryLine = result.category
      ? `${result.category}${result.condition ? " - " + result.condition : ""}`
      : null;

    // Max-buy ALWAYS ships with the reasoning that makes it trustworthy -
    // cites the real comp count when we have one, and judges the actual
    // purchase when a price was entered, instead of appearing as a bare
    // number asking for trust.
    const compCount = result.priceData?.count || 0;
    const isRealComps = !!result.priceData?.isRealData;
    const dataPhrase = isRealComps && compCount
      ? `Based on ${compCount} real sold listing${compCount === 1 ? "" : "s"}`
      : "Based on market estimate";
    const maxBuyReasoning = maxBuy == null ? "" : (
      enteredBp > 0
        ? (enteredBp <= maxBuy
            ? `${dataPhrase}. You paid $${enteredBp} — ${enteredBp <= maxBuy * 0.5 ? "strong buy, well under" : "under"} the ceiling.`
            : `${dataPhrase}. You paid $${enteredBp} — over the ceiling, margin is thinner than ideal.`)
        : `${dataPhrase}. Pay this or less to keep a healthy margin.`
    );

    const dataTag = oraclePred
      ? (oraclePred.medianProfitIsReal
          ? "● REAL DATA"
          : (result.priceData?.isRealData && result.priceData?.count ? `Based on ${result.priceData.count} listings` : "ESTIMATE"))
      : undefined;
    const dataTagColor = oraclePred ? (oraclePred.medianProfitIsReal ? "#9ef01a" : "#8a7aa8") : undefined;
    const footNote = oraclePred
      ? (oracle.dataMode === "crowd-led" ? "From real reseller outcomes." : "Market estimate. Sharpens as the community logs real sales.")
      : undefined;
    const secondaryStats = [
      { label: "sell price", value: result.sellPrice != null ? "$" + Math.round(result.sellPrice) : "—" },
      { label: "ROI", value: heroRoi ? heroRoi + "%" : "—" },
      { label: "to sell", value: oracleDaysTxt || "pending" },
    ];
    const skipDetail = isSkip ? (result.reasoning || null) : null;

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content"/>
        <Coachmark
          visible={tourStep === "result"}
          step={4} totalSteps={5}
          title="Your real numbers"
          body="True profit after fees, plus a clear BUY or PASS - based on real eBay sold data, not guesses. This is what makes ValuIQ different. Your scan also saved automatically."
          ctaLabel="See where it saved"
          anchor="center"
          onNext={() => { advanceTour && advanceTour("history"); onNavigate("history"); }}
          onSkip={() => skipTour && skipTour()}
        />
        {/* Off-screen branded card, captured (not displayed) when sharing as an image */}
        <View style={{ position: "absolute", top: 0, left: -9999 }} pointerEvents="none">
          <ViewShot ref={shareCardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
            <ShareCard result={result} oracle={oracle} photoBase64={photos[0]} />
          </ViewShot>
        </View>
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

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:60}} showsVerticalScrollIndicator={false}>

          {/* TEMPORARY DEBUG READOUT — raw values feeding every headline
              number on this screen, so a wrong number can be traced to its
              source on-device. Remove once the profit-math bugs are
              confirmed fixed (see chat history for context). */}
          <View style={{backgroundColor:"#1a1200",borderWidth:1,borderColor:C.yellow+"50",borderRadius:10,padding:10,marginBottom:12}}>
            <Text style={{color:C.yellow,fontSize:10,fontWeight:"900",letterSpacing:0.5,marginBottom:4}}>DEBUG (temporary)</Text>
            <Text style={{color:C.text3,fontSize:11,lineHeight:16}}>
              enteredBuyPrice: {enteredBp}{"\n"}
              salePrice: {result.sellPrice != null ? result.sellPrice : "—"}{"\n"}
              feeRate: {result.platformBreakdown?.[0]?.feeRate || "—"} ({result.bestPlatform || "—"}){"\n"}
              computedProfit: {heroProfit} · costUsed: {actualCostBasis} ({enteredBp > 0 ? "entered price" : "max-buy ceiling"}){"\n"}
              maxBuyCeiling: {maxBuy != null ? maxBuy : "—"}{"\n"}
              sellTime: {sellTimeLabel || "pending"}{"\n"}
              ROI: {heroRoi}%{"\n"}
              chosenTier: {outcome.tier} · decision: {result.decision || "—"}{"\n"}
              timing: identify={fmtSec(result._debug?.timing?.identifyMs)} · price={fmtSec(result._debug?.timing?.pricingLlmMs)} ({result._debug?.timing?.pricingLlmProvider || "—"}) · comps={fmtSec(result._debug?.timing?.pricingCompsMs)} · oracle={fmtSec(oracle?._debug?.timing?.totalMs)} · total={fmtSec(result._debug?.timing?.totalMs)}
            </Text>
          </View>

          {/* - UNKNOWN: need more info - */}
          {hasNoData && (
            <View style={s.noDataCard}>
              <Text style={{color:C.text1,fontSize:15,fontWeight:"700",textAlign:"center",marginBottom:8}}>Need More Information</Text>
              <Text style={{color:C.text3,fontSize:13,textAlign:"center",lineHeight:20,marginBottom:16}}>
                Try scanning again with the brand name, model number, or a clearer photo for accurate pricing.
              </Text>
              <TouchableOpacity style={[s.navBtn,{alignSelf:"center",paddingHorizontal:24,paddingTop: 16, paddingBottom: 10}]} onPress={() => setStep("camera")}>
                <Text style={s.navBtnText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* - PROFIT (only when we have data) - */}
          {!hasNoData && (
            <>
              {/* Data confidence - shown in both BUY and SKIP layouts; backs
                  the max-buy reasoning (and the skip reason) either way. */}
              {hasGoodData && result.priceData && result.priceData.isRealData ? (
                <TouchableOpacity style={s.goodBanner} onPress={()=>Linking.openURL(result.priceData.ebaySearchUrl)}>
                  <Text></Text>
                  <View style={{flex:1}}>
                    <Text style={s.goodBannerTitle}>{result.priceData.count} real sold listings</Text>
                    <Text style={s.goodBannerSub}>avg ${result.priceData.avgPrice} · range ${result.priceData.minPrice}–${result.priceData.maxPrice}</Text>
                  </View>
                  <Text style={{color:C.green}}>{'>'}</Text>
                </TouchableOpacity>
              ) : hasLimitedData ? (
                <View style={s.limitedBanner}>
                  <Text></Text>
                  <Text style={s.limitedText}>Estimated - limited data. Verify before buying.</Text>
                </View>
              ) : null}

              {/* THE hero: verdict + profit + max-buy (with reasoning) + key
                  stats, reconciled into one card instead of a separate
                  verdict card stacked on a separate Profit Oracle card.
                  outcome (classifyOutcome) is the single source of truth for
                  buy-vs-skip - nothing else on this screen computes or shows
                  a different verdict. */}
              <ProfitFlexHero
                outcome={outcome}
                itemName={result.itemName || result.item_name || "Unknown Item"}
                categoryLine={categoryLine}
                photoBase64={photos[0]}
                onEdit={()=>{
                  // Deliberately NOT clearing result here - the review screen
                  // never reads it, and keeping it around is what lets that
                  // screen's back button tell "editing an existing result"
                  // apart from "starting a fresh scan" and return to it.
                  setDescription(result.itemName||"");
                  setStep("review");
                }}
                isSkip={isSkip}
                heroProfit={heroProfit}
                profitLabel={profitLabel}
                maxBuy={maxBuy}
                maxBuyReasoning={maxBuyReasoning}
                dataTag={dataTag}
                dataTagColor={dataTagColor}
                secondaryStats={secondaryStats}
                footNote={footNote}
                skipDetail={skipDetail}
              />

              {/* Everything below is buy-oriented - hidden entirely on a
                  skip verdict, which is shown justified by its one reason
                  in the hero above and stripped of buy-context clutter. */}
              {!isSkip && (
                <>
                  {/* Share result as image - promoted out of the collapsed
                      Share & Content section since it's the highest-intent
                      share action */}
                  <TouchableOpacity
                    style={{backgroundColor:C.green,borderRadius:14,paddingVertical:15,marginBottom:12,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,minHeight:52,opacity:sharingImage?0.6:1}}
                    disabled={sharingImage}
                    activeOpacity={0.85}
                    onPress={shareResultImage}
                  >
                    {sharingImage ? (
                      <ActivityIndicator color={C.greenDark} size="small" />
                    ) : (
                      <>
                        <Text style={{fontSize:16}}>{"📷"}</Text>
                        <Text style={{color:C.greenDark,fontSize:15,fontWeight:"900"}}>Share result as image</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* SOFT NOTIFICATION ASK - only on a real buy verdict, never on a skip */}
                  {pendingCheckIn && !checkInAsked && (
                    <View style={s.askCard}>
                      <Text style={s.askTitle}>Want a reminder to log what this sells for?</Text>
                      <Text style={s.askBody}>
                        We'll check back in about 2 weeks. Logging what actually sold keeps your profit
                        stats real - and sharpens the Oracle for everyone.
                      </Text>
                      <View style={s.askRow}>
                        <TouchableOpacity style={s.askNo} onPress={declineCheckIn} activeOpacity={0.8}>
                          <Text style={s.askNoTxt}>Not now</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.askYes} onPress={acceptCheckIn} activeOpacity={0.85}>
                          <Text style={s.askYesTxt}>Yes, remind me</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Collapsed by default - the hero above already answers
                      the question; everything else is one tap away. */}
                  {result.platformBreakdown && result.platformBreakdown.length > 0 && (
                    <CollapsibleSection title="BEST PLACE TO SELL" expanded={showPlatforms} onToggle={()=>setShowPlatforms(v=>!v)}>
                      {(goDeeper ? result.platformBreakdown : result.platformBreakdown.slice(0,3)).map((pb:any, i:number) => {
                        const profNum = Number(pb.netProfit) || 0;
                        const isNeg = profNum < 0;
                        const isBest = i === 0 && !isNeg;
                        return (
                        <View key={pb.platform} style={{marginBottom:goDeeper?14:8}}>
                          <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}>
                            <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
                              <View style={{width:3,height:16,borderRadius:2,backgroundColor:isBest?C.green:C.border}}/>
                              <Text style={{color:i===0?C.text1:C.text3,fontSize:14,fontWeight:i===0?"800":"500"}}>{pb.platform}</Text>
                              {isBest && <Text style={{color:C.green,fontSize:9,fontWeight:"900"}}>BEST</Text>}
                            </View>
                            <Text style={{color:isNeg?C.red:(i===0?C.green:C.text2),fontSize:15,fontWeight:"800"}}>
                              {isNeg ? "-$" + Math.abs(profNum) : "+$" + profNum} profit
                            </Text>
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
                        );
                      })}
                      <TouchableOpacity onPress={()=>setGoDeeper(g=>!g)} style={{marginTop:4,paddingVertical:8,alignItems:"center"}}>
                        <Text style={{color:C.green,fontSize:13,fontWeight:"800"}}>{goDeeper?"Show less":"Go Deeper - full breakdown"}</Text>
                      </TouchableOpacity>
                    </CollapsibleSection>
                  )}

                  {result.priceData?.allPlatformLinks && (
                    <CollapsibleSection title="VERIFY PRICES" expanded={showVerify} onToggle={()=>setShowVerify(v=>!v)}>
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
                            <Text style={{color:C.green,fontSize:11,fontWeight:"700"}}>{link.name} {'>'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </CollapsibleSection>
                  )}

                  <CollapsibleSection title="PAYOUT" expanded={showPayout} onToggle={()=>setShowPayout(v=>!v)}>
                    <Text style={{color:C.text1,fontSize:14,fontWeight:"700"}}>{result.payoutSpeed||"3-5 days"}</Text>
                  </CollapsibleSection>

                  {result.riskScore !== undefined && (
                    <CollapsibleSection title="RISK" expanded={showRisk} onToggle={()=>setShowRisk(v=>!v)}>
                      <Text style={{color:C.text1,fontSize:13,fontWeight:"700"}}>Risk Score: {result.riskScore}/10</Text>
                      {result.watchOutFor ? <Text style={{color:C.text4,fontSize:11,marginTop:4}}>{result.watchOutFor}</Text> : null}
                    </CollapsibleSection>
                  )}

                  {(result.hotTip || result.listingTips?.length > 0) && (
                    <CollapsibleSection title="Analysis & Tips" expanded={showAnalysis} onToggle={()=>setShowAnalysis(v=>!v)}>
                      {result.hotTip ? (
                        <View style={{marginBottom:12}}>
                          <Text style={[s.infoLabel,{color:C.red}]}>Hot Tip</Text>
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
                              <Text style={{color:C.green,fontSize:13}}>{'>'}</Text>
                              <Text style={{color:C.text2,fontSize:13,lineHeight:20,flex:1}}>{tip}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </CollapsibleSection>
                  )}

                  <CollapsibleSection title="Share & Content" expanded={showShare} onToggle={()=>setShowShare(v=>!v)}>
                     <ShareButton
                       message={
                         " Just found a $" + Math.round(heroProfit) + " profit flip! " + (result.itemName||"Item") + " - " + heroRoi + "% ROI on " + (result.bestPlatform||"eBay")
                         + "\n\nI use ValuIQ to find profitable flips > getvaluiq.com"
                       }
                       title="My ValuIQ Find"
                       compact
                     />
                     {heroProfit >= 20 && (
                       <TouchableOpacity
                         style={s.communityShareBtn}
                         disabled={winShared || sharingWin}
                         activeOpacity={0.85}
                         onPress={async () => {
                           setSharingWin(true);
                           const ok = await shareWin(token, result.itemName || "Great find", heroProfit || 0, result.bestPlatform || "eBay", "");
                           setSharingWin(false);
                           if (ok) setWinShared(true);
                         }}>
                         <Text style={s.communityShareTxt}>
                           {winShared ? "✓  Shared with the community!" : sharingWin ? "Sharing..." : "🎉  Share this win with the community"}
                         </Text>
                       </TouchableOpacity>
                     )}
                  </CollapsibleSection>
                </>
              )}

              {/* Deeper specialty scan - useful context regardless of verdict */}
              {specialtyMatch && (
                <TouchableOpacity
                  style={{backgroundColor:C.surface,borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:C.green+"40",flexDirection:"row",alignItems:"center",gap:8}}
                  onPress={()=>onNavigate("specialty", {category: specialtyMatch.id})}
                  activeOpacity={0.8}
                >
                  <Text style={{fontSize:16}}>{specialtyMatch.icon}</Text>
                  <View style={{flex:1}}>
                    <Text style={{color:C.green,fontSize:13,fontWeight:"800"}}>Get a deeper {specialtyMatch.label} scan</Text>
                    <Text style={{color:C.text4,fontSize:11}}>Expert AI with category-specific pricing knowledge</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* FREE TIER PAYWALL - app-wide upsell, shown regardless of verdict */}
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
                    <Text style={{color:C.greenDark,fontWeight:"900",fontSize:13}}>Upgrade from $14.99/mo {'>'}</Text>
                  </View>
                  <Text style={{color:C.text4,fontSize:10,marginTop:8}}>Used {scansLeft !== null ? 10 - scansLeft : "?"} of 10 free scans this month</Text>
                </TouchableOpacity>
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
              <Text style={{color:C.green,fontSize:18}}>{'>'}</Text>
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
      <Coachmark
        visible={tourStep === "review"}
        step={3} totalSteps={5}
        title="Add details (optional)"
        body="Enter the price you would pay, plus brand or extra details. All optional, but they sharpen your results. Then tap Analyze below."
        ctaLabel="Got it"
        anchor="bottom"
        onNext={() => advanceTour && advanceTour("review-wait")}
        onSkip={() => skipTour && skipTour()}
      />
      <View style={s.nav}>
        {/* result survives here only when this screen was reached via the
            Edit & Rerun pencil - route back to it instead of wiping state
            and dropping to the camera like a fresh scan would. */}
        <TouchableOpacity onPress={() => (result ? setStep("result") : reset())} style={s.navBack}><Text style={s.navBackText}>{"\u2039"}</Text></TouchableOpacity>
        <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
        <Text style={s.logoText}>ValuIQ</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
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
          {photos.length < MAX_PHOTOS && (
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
          <Text style={s.greenBtnText}>Analyze Now {'>'}</Text>
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
        step={2} totalSteps={5}
        title="Snap your first item"
        body="Point your camera at any item and tap the shutter - or pick a photo from your library. ValuIQ will fetch its real resale value and profit."
        ctaLabel="Got it"
        anchor="bottom"
        onNext={() => advanceTour && advanceTour("scanning")}
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
        step={2} totalSteps={5}
        title="Snap your first item"
        body="Point your camera at any item and tap the shutter - or pick a photo from your library. ValuIQ will fetch its real resale value and profit."
        ctaLabel="Got it"
        anchor="bottom"
        onNext={() => advanceTour && advanceTour("scanning")}
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
            <Text style={s.camHint}>Snap 1-5 photos, then tap Done</Text>
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
            <TouchableOpacity style={s.camSecondBtn} onPress={() => { if (photos.length > 0) { setStep("review"); if ((tourStep === "capture" || tourStep === "scanning") && advanceTour) advanceTour("review"); } }} disabled={photos.length === 0}>
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
  shareImageBtn: { marginTop: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center", minHeight: 46 },
  shareImageBtnText: { color: C.green, fontSize: 14, fontWeight: "800" },
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
  profitCard:     { backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 2, borderRadius: 20, padding: 20, marginBottom: 10, alignItems: "center" },
  profitLabel:    { color: C.text3, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  profitAmount:   { fontWeight: "900", letterSpacing: -2, lineHeight: 68, marginBottom: 6 },
  veloBadge: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 12, alignItems: "center" },
  veloText: { fontSize: 16, fontWeight: "800" },
    askCard:   { backgroundColor: "#101a08", borderColor: C.green + "50", borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  askTitle:  { color: C.text1, fontSize: 15, fontWeight: "800", marginBottom: 6 },
  askBody:   { color: C.text3, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  askRow:    { flexDirection: "row", gap: 10 },
  askNo:     { flex: 1, backgroundColor: "transparent", borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  askNoTxt:  { color: C.text3, fontSize: 14, fontWeight: "700" },
  askYes:    { flex: 1.4, backgroundColor: C.green, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  askYesTxt: { color: C.greenDark, fontSize: 14, fontWeight: "900" },
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
  quickActions:   { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  quickBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8 },
  quickBtnIcon:   { fontSize: 16 },
  quickBtnText:   { color: "#fff", fontSize: 12, fontWeight: "700", flexShrink: 1 },
  refNudge: { backgroundColor:"#1e2a08", borderWidth:1, borderColor:"#3a5010", borderRadius:14, padding:16, marginTop:12, marginBottom:4 },
  refTitle:  { color:"#a8e63d", fontSize:14, fontWeight:"700" as any },
  refBody:   { color:"#a09b94", fontSize:12, marginBottom:10, lineHeight:17 },
  refBtn:    { backgroundColor:"#a8e63d", borderRadius:10, padding:11, alignItems:"center" as any },
  refBtnTxt: { color:"#0f1500", fontSize:13, fontWeight:"900" as any },

  shareCardBadge:   { backgroundColor:C.green, borderRadius:100, paddingHorizontal:12, paddingTop:16, paddingBottom:10, alignSelf:"flex-start" as any, marginBottom:8 },
  shareCardBadgeTxt:{ color:C.greenDark, fontSize:10, fontWeight:"900" as any },
  shareCardFooter:  { color:C.text4, fontSize:10, textAlign:"center" as any } });