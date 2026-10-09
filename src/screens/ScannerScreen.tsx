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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { compressPhoto } from "../lib/image";
import { C } from "../lib/theme";
import Wordmark from "../components/Wordmark";
import HeaderLogo from "../components/HeaderLogo";
import ShareCard from "../components/ShareCard";
import { API_BASE, scanImage, getProfitOracle, shareWin, refineScan, emailFromToken, lookupUpcFast, scanBarcodeFast } from "../lib/api";
import ApiDebugPanel from "../components/ApiDebugPanel";
import { scheduleSaleCheckIn, requestNotificationPermission } from "../lib/notifications";
import StagedProgress from "../components/StagedProgress";
import * as Notifications from "expo-notifications";
import { matchSpecialtyCategory } from "./SpecialtyScreen";
import ProfitFlexHero from "../components/ProfitFlexHero";
import FlashHighlight from "../components/FlashHighlight";
import SegmentOutcomesBlock from "../components/SegmentOutcomesBlock";
import { classifyOutcome, ROI_BUY_MIN, PROFIT_JUDGMENT_FLOOR } from "../lib/outcomeTier";
import LogSaleModal from "../components/LogSaleModal";
import { toPendingScan } from "../lib/saleCapture";
import { CONDITION_OPTIONS } from "../lib/condition";

const { width } = Dimensions.get("window");
const FRAME = width * 0.72;
const MAX_PHOTOS = 5;
// Gates the soft in-app notification ask to once EVER per install, not once
// per mount - local `checkInAsked` state alone reset on every screen
// remount, so the same user got re-asked on every subsequent BUY scan.
// Declining is respected permanently; SaleCapturePrompt (the dashboard
// banner) is the permission-free fallback for anyone who declines/is denied.
const CHECKIN_ASKED_KEY = "@valuiq_checkin_asked";

// CONDITION MULTIPLIER (2026-09-10, items 5/9) - MUST MATCH
// lib/profitOracle.ts's CONDITION_MULTIPLIER exactly, or the condition
// dropdown's local recompute produces a different number than the backend
// would have for the same selection. Duplicated (not shared - separate
// repos, no shared package between this app and the backend) rather than
// fetched, since the whole point of the dropdown is an instant, offline
// recompute with no network round trip.
//
// KNOWN DRIFT RISK, logged not fixed (2026-09-10): two hand-maintained
// copies of the same table (here and lib/profitOracle.ts's
// CONDITION_MULTIPLIER in deal-ai-pro) WILL disagree the first time either
// gets tuned without the other - values match today, nothing enforces they
// keep matching. Consolidate later: server sends the multiplier table (or
// the specific factor it used) in the scan response, client reads it
// instead of hardcoding its own copy. Not worth the wiring for this
// change; worth doing before these numbers get tuned for real.
const CONDITION_MULTIPLIER: Record<string, number> = {
  "new-in-box": 1.00,
  "new-no-tags": 0.85,
  "used-good": 0.55,
  "used-heavy": 0.30,
};
const DEFAULT_CONDITION_MULTIPLIER = 0.70;
// CONDITION_OPTIONS moved to lib/condition.ts (2026-10-06) - shared with
// SaleCaptureCard.tsx/HistoryScreen.tsx now that a chip selection there is
// actually persisted, not just used for this screen's own pre-sale pricing.

type Step = "camera" | "barcode" | "review" | "loading" | "result" | "upgrade";

interface Props {
  token: string;
  plan: string;
  scansLeft: number | null;
  setScansLeft: (n: number | null) => void;
  onNavigate: (s: string, data?: any) => void;
  onLogout: () => void;
  firstScanNudge?: boolean;
  onDismissFirstScanNudge?: () => void;
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

// NAV SPEED FIX (2026-09-11): useCameraPermissions() starts null on EVERY
// mount - there's no cache of its own, and since this whole app fully
// unmounts/remounts every screen on every tab switch (see App.tsx's
// SCREENS[screen] render), that meant a full-screen blocking spinner on
// EVERY single visit to the Scan tab, even when permission was granted
// seconds ago on the last visit. Module-level (not React state), so it
// survives this component's unmount/remount - resets only on a fresh JS
// process (app cold start), which is exactly when re-verifying is correct
// anyway. This is a PURELY OPTIMISTIC skip of the blocking wait below, never
// a substitute for the real permission object: if OS permission was
// actually revoked since it was last granted (backgrounded, revoked in
// Settings, foregrounded), useCameraPermissions() still resolves the truth
// on this mount and the denied-prompt gate below still fires correctly the
// moment it does - see the two gates right after the hook.
let cameraPermissionKnownGranted = false;

// Mirrors HistoryScreen.tsx/ProfileScreen.tsx's OWNER_EMAILS - gates the
// owner-only price-basis debug readout below (tier used, why higher tiers
// didn't qualify, eBay units/listings/ms, basis price - see lib/
// priceBasis.ts, deal-ai-pro).
const OWNER_EMAILS = ["natev9@comcast.net", "nvisionsinc@gmail.com", "nathanrussell9@outlook.com"];

export default function ScannerScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onLogout, firstScanNudge, onDismissFirstScanNudge }: Props) {
  const isOwner = OWNER_EMAILS.includes(emailFromToken(token).toLowerCase());
  const [permission, requestPermission] = useCameraPermissions();
  // Mirrors permission.granted into the module-level cache the instant it's
  // known true, so the NEXT mount (next visit to this tab) can skip the
  // blocking wait below. Never writes `false`/revoked here - a later
  // genuine revoke is caught by the denied-prompt gate itself re-evaluating
  // once `permission` resolves this mount, not by this cache.
  useEffect(() => {
    if (permission?.granted) cameraPermissionKnownGranted = true;
  }, [permission?.granted]);
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("camera");
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  const [photos, setPhotos] = useState<string[]>([]);
  const [winShared, setWinShared] = useState(false);
  const [sharingWin, setSharingWin] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const shareCardRef = useRef<ViewShot>(null);
  // The immediate "log it now" path off a fresh scan result - the SOFT
  // NOTIFICATION ASK below this is the deferred (~2 week reminder) path;
  // both coexist. Reuses the exact same LogSaleModal/SaleCaptureCard/
  // FlexRevealBody flow History uses, so a sale logged here gets the same
  // honest, cached reveal - no separate code path to keep in sync.
  const [showLogSale, setShowLogSale] = useState(false);
  const [brandInput, setBrandInput] = useState("");
  const [goDeeper, setGoDeeper] = useState(false);
  const [description, setDescription] = useState("");
  // PRICE-ON-RESULTS (2026-09-10, item 8): buyPrice now lives on the RESULTS
  // step, not the pre-scan review step - the scan itself is what reads the
  // price tag (retailPriceRead), so the price can't meaningfully precede it.
  // Cleared at the start of every analyze() call (including an Edit & Rerun,
  // which deliberately does NOT reset() - see analyze()) and re-seeded from
  // the NEW result's retailPriceRead once it comes back, so a stale price
  // from a previous scan can never leak into a new one's request or display.
  const [buyPrice, setBuyPrice] = useState("");
  // CONDITION DROPDOWN (2026-09-10, item 9): same lifecycle as buyPrice -
  // cleared per analyze() call, seeded from the new result's
  // conditionAssessment. Drives the SAME local recompute path as price
  // edits (see the results-step render below).
  const [resultCondition, setResultCondition] = useState("");
  const [result, setResult] = useState<any>(null);
  // TAG CONFIRM GATE (2026-10-06): true while THIS result's tag read needs
  // an explicit Confirm/Edit tap before it drives anything - set whenever a
  // new result comes in with retailPriceNeedsConfirmation (see the
  // setBuyPrice/seed block below), cleared the moment the user taps either
  // button. Server-side (app/api/lens/route.ts's sanity gate) already
  // withholds this number from its own verdict/dealReasoning while
  // retailPriceNeedsConfirmation is true - this just makes that hold
  // visible and actionable instead of a blank field + hint text.
  const [tagConfirmPending, setTagConfirmPending] = useState(false);
  const priceInputRef = useRef<TextInput>(null);
  // TWO-STAGE SCAN RENDER (2026-09-11): bumped once per successful
  // background /refine merge (never on a normal price/condition edit) -
  // passed to ProfitFlexHero/the range card as flashSeq so the updated
  // numbers visibly "sharpen" in place instead of silently swapping. See
  // maybeRefineInBackground below and app/api/lens/refine/route.ts.
  const [refineSeq, setRefineSeq] = useState(0);
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
  // CLIENT TIMING INSTRUMENTATION (2026-09-11): real, measured time spent
  // inside compressPhoto() across every photo in THIS scan (reset in
  // reset()) - the exact "how long does compression actually take" number
  // the identifyMs/upload latency investigation couldn't answer without
  // guessing. Sent to the server in the scan request body (see api.ts's
  // scanImage) so it shows up in [lens timing] logs alongside photosSent/
  // imagePayloadBytes instead of living only on-device.
  const compressMsTotalRef = useRef(0);
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
    setResultCondition("");
    setBarcodeScanned(false);
    setMode("photo");
    compressMsTotalRef.current = 0;
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
    if (photo?.base64) {
      // Only the FIRST photo overall gets full-res "primary" treatment -
      // it's the one most likely to be the main/only shot, and every
      // later photo (usually a supplementary angle or close-up) is
      // compressed harder to cut upload payload without losing the
      // legibility fix on whichever shot matters most.
      const isPrimary = photos.length === 0;
      const _ct0 = Date.now();
      const small = await compressPhoto(photo.base64, photo.width, photo.height, isPrimary ? "primary" : "secondary");
      compressMsTotalRef.current += Date.now() - _ct0;
      setPhotos(p => {
        const next = [...p, small].slice(0, MAX_PHOTOS);
        if (next.length >= MAX_PHOTOS) { setStep("review"); }
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
    // startIndex: where these land in the FINAL photos array - only the
    // one that ends up at overall index 0 is "primary". Compressed in
    // PARALLEL (was a sequential for-await loop) - no reason to make the
    // user wait for each image to compress one at a time.
    const startIndex = photos.length;
    const _ct0 = Date.now();
    const compressed = (await Promise.all(
      picked.map((a, i) => a.base64 ? compressPhoto(a.base64, a.width, a.height, startIndex + i === 0 ? "primary" : "secondary") : Promise.resolve(null))
    )).filter((c): c is string => !!c);
    // Wall-clock time of the whole concurrent batch (not summed per-photo -
    // these run in parallel via Promise.all, so summing would overcount vs.
    // what the user actually waited).
    compressMsTotalRef.current += Date.now() - _ct0;
    if (compressed.length) {
      setPhotos(p => [...p, ...compressed].slice(0, MAX_PHOTOS));
      setStep("review");
    }
  }

  // BARCODE FAST PATH (2026-10-08): detect-to-lookup / lookup-to-result
  // timing + raw UPC source/GTIN, surfaced in the owner debug readout once
  // the result lands (see result._barcodeDebug below and ApiDebugPanel).
  async function handleBarcode({ data }: BarcodeScanningResult) {
    if (barcodeScanned) return;
    setBarcodeScanned(true);
    if (firstScanNudge) onDismissFirstScanNudge && onDismissFirstScanNudge();
    setStep("loading");
    setBuyPrice("");
    setResultCondition("");
    const tDetect = Date.now();
    try {
      const lookup = await lookupUpcFast(token, data);
      const detectToLookupMs = Date.now() - tDetect;
      // NOT FOUND (per spec): no guessing - tell the user plainly and drop
      // back to photo mode rather than attempting a scan with nothing real
      // to identify it from.
      if (!lookup.success || !lookup.itemName) {
        setBarcodeScanned(false);
        setMode("photo");
        setStep("camera");
        Alert.alert("Barcode not found", "Snap a photo instead.");
        return;
      }
      const tLookupDone = Date.now();
      const d = await scanBarcodeFast(token, data, {
        itemName: lookup.itemName, brand: lookup.brand || "Unknown",
        category: lookup.category || "Other", itemType: lookup.itemType || null,
      });
      const lookupToResultMs = Date.now() - tLookupDone;
      if (d.success) {
        d._barcodeDebug = {
          detectToLookupMs, lookupToResultMs,
          upcSource: lookup.upcSource || null, gtin: data,
          retailPrice: lookup.retailPrice ?? null,
        };
      }
      await finishAnalyze(d, [], true);
    } catch (e: any) {
      setBarcodeScanned(false);
      setResult({ _error: e.message });
      setStep("result");
    }
  }
  async function analyze(customPhotos?: string[]) {
    if (firstScanNudge) onDismissFirstScanNudge && onDismissFirstScanNudge();
    setStep("loading");
    // PRICE-ON-RESULTS (item 8): clear BEFORE the request, not after - an
    // Edit & Rerun deliberately keeps `result` around (see onEdit below) but
    // must never let last scan's price/condition leak into this NEW request
    // or sit stale on screen while the new one is in flight.
    setBuyPrice("");
    setResultCondition("");
    let photosForRefine: string[] = [];
    try {
      const p = customPhotos || photos;
      if (!p.length && !description && !brandInput) {
        setStep("review"); return;
      }
      photosForRefine = p;
      // No price is ever collected pre-scan any more - the scan itself is
      // what reads the price tag (retailPriceRead). See the results step
      // below for where a price is now entered/edited.
      const d = await scanImage(token, p, (brandInput ? "Brand: " + brandInput + ". " : "") + description, undefined, compressMsTotalRef.current);
      await finishAnalyze(d, photosForRefine, false);
    } catch (e: any) {
      setResult({ _error: e.message });
      setStep("result");
    }
  }
  // SHARED RESULT HANDLING (2026-10-08 extraction): the photo path
  // (analyze, above) and the barcode fast path (handleBarcode) both land
  // here once `d` (the /api/lens response) is in hand - one place decides
  // what happens with a finished scan result regardless of which path
  // produced it, so the two can never silently diverge in post-processing.
  async function finishAnalyze(d: any, photosForRefine: string[], isBarcode: boolean) {
    if (d.error === "scan_limit_reached") {
      onNavigate("upgrade");
      return;
    }
    if (!d.success) throw new Error(d.error || "Analysis failed");
    setResult(d);
    setRefineSeq(0);
    // TWO-STAGE SCAN RENDER (2026-09-11): d IS the final, complete result
    // already (identify now runs allowSearch:false on this path - see
    // app/api/lens/route.ts) - this fires the deferred, search-enabled
    // refinement ONLY when the scan's own needsRefine flag says the moat
    // didn't confirm the price and the item is worth checking (see that
    // flag's comment server-side). Fire-and-forget, un-awaited - never
    // blocks the result from showing, never shows a spinner, and a
    // failure/timeout is silently swallowed by refineScan's caller here:
    // the card already stands on stage-1's numbers either way.
    if (!isBarcode && d.needsRefine && d.id && photosForRefine.length) {
      // Number(d.retailPriceRead), not the buyPrice state var - buyPrice
      // was just cleared above (setBuyPrice("")) and won't reflect THIS
      // scan's price until the setBuyPrice call below commits, so reading
      // it here would race a stale/empty value. d.retailPriceRead is the
      // same number that seeding is about to write into state.
      refineScan(token, d.id, photosForRefine, (brandInput ? "Brand: " + brandInput + ". " : "") + description, Number(d.retailPriceRead) || 0, plan)
        .then((refined) => {
          if (refined?.success && refined?.updated) {
            setResult((prev: any) => (prev && prev.id === d.id ? { ...prev, ...refined } : prev));
            setRefineSeq((s) => s + 1);
          }
        })
        .catch(() => {});
    }
    // PRICE-ON-RESULTS / CONDITION DROPDOWN (items 8/9): seed both from
    // what THIS scan actually found - a detected tag price, and the
    // model's own condition read - editable from here, never re-collected
    // before a scan again.
    // TAG CONFIDENCE (2026-10-04, decision 2): a low-confidence tag read
    // (a shelf tag with multiple numbers - was/now, unit price - that the
    // model wasn't sure about) is NOT auto-seeded into buyPrice anymore -
    // measured live: a Disney Minnie item tagged $26 read as $15 (the
    // SAME wrong number across two separate scans of it), which would
    // have silently driven the whole verdict off a guess with no
    // confirmation step. High-confidence reads still auto-seed exactly as
    // before; a low-confidence one leaves the field blank and the hint
    // below (near the price input) shows what was read, asking the user
    // to confirm or correct it before any verdict leans on it.
    setBuyPrice(
      Number(d.retailPriceRead) > 0 && !d.retailPriceNeedsConfirmation
        ? String(d.retailPriceRead)
        : ""
    );
    setTagConfirmPending(Number(d.retailPriceRead) > 0 && !!d.retailPriceNeedsConfirmation);
    setResultCondition(d.conditionAssessment || "");
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
            // Not yet asked (OS-wise) — but only show OUR soft ask once
            // ever per install, not once per scan. AsyncStorage (not just
            // local `checkInAsked` state) so a decline sticks across
            // remounts/relaunches instead of re-nagging next BUY scan.
            const asked = await AsyncStorage.getItem(CHECKIN_ASKED_KEY);
            if (asked !== "true") {
              setPendingCheckIn({ scanId: String(sid), itemName: nm });
              AsyncStorage.setItem(CHECKIN_ASKED_KEY, "true").catch(() => {});
            }
          }
        }
      }
    } catch {}
    setStep("result");
    if (plan === "free") setScansLeft(n => n !== null ? Math.max(0, n - 1) : null);
  }

  // Blocks ONLY while permission is unresolved AND we have no cached reason
  // to expect "granted" - once cameraPermissionKnownGranted is true, this
  // falls through immediately (before this mount's own permission check has
  // even resolved) straight to the camera render below. The denied-prompt
  // gate right after is unaffected either way - it only fires once
  // `permission` is actually known, whatever it turns out to say.
  if (!permission && !cameraPermissionKnownGranted) {
    return <View style={s.center}><ActivityIndicator color={C.green} size="large" /></View>;
  }
  if (permission && !permission.granted) return (
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
  // MEASURED (device debug card, real multi-photo scans, since removed):
  // real device round-trip runs ~14s - photos uploading ~5s, identify
  // ~3s, comps+pricing ~4s combined, plus request/response overhead. Prior
  // retunes (4.5s, then 8.5s, then 11s) each undershot the real number by
  // a shrinking but still real margin, leaving the last step ("Crunching
  // the numbers") visibly stalled for the gap every time. This one sums to
  // ~14s to match the measured real total directly instead of guessing
  // low again. Overestimating here costs nothing - StagedProgress cuts the
  // animation short harmlessly the instant the real response lands (the
  // screen unmounts immediately, jumping straight to results); only
  // underestimating creates the frozen-last-step feeling, since a step
  // that's reached its timer but has nothing left to advance to just
  // holds - spinner ONLY, never a checkmark, by construction (stepIndex
  // has no further scheduled advance past the last step - see
  // src/components/StagedProgress.tsx). Forward-only, never loops, never
  // claims done before the real response arrives.
  if (step === "loading") return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <View style={s.navLogoRow}>
          <HeaderLogo textStyle={s.logoText}/>
        </View>
        <StagedProgress
          active
          steps={[
            { label: "Uploading your photos", ms: 5000 },
            { label: "Identifying brand & item", ms: 3000 },
            { label: "Pulling real sold listings", ms: 2500 },
            { label: "Crunching the numbers", ms: 3500 },
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
          <HeaderLogo textStyle={s.logoText}/>
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

    // ONE RESALE REALITY (2026-09-17): tier is a real top-level field on
    // result.crowdVerdict (lib/crowdVerdict.ts's CrowdVerdict interface in
    // deal-ai-pro - "strong"|"limited"|"thin"), not something regexed out
    // of the label - traced call!=="UNKNOWN" against tier across all 4
    // return paths in crowdVerdict(): tier==="thin" hardcodes call:
    // "UNKNOWN" in both its return paths, and the two non-thin paths
    // require n>=8, which fetchClusterStats guarantees a non-null
    // sellThroughPct for, which callFor() requires to ever return anything
    // BUT "UNKNOWN" - so tier!=="thin" and call!=="UNKNOWN" are exactly
    // the same condition, proven, not assumed. Reading tier directly below
    // instead of re-deriving it. When true, the crowd line becomes the ONE
    // resale number this screen shows - both AI-range renderings
    // (standalone banner below, and the no-price outcome.copy mention
    // further down) are suppressed so there's never two competing resale
    // realities on screen at once.
    const crowdHasRealData = result?.crowdVerdict?.tier === "strong" || result?.crowdVerdict?.tier === "limited";
    // ONE SELL PRICE (2026-09-17): crowdHasRealData (tier strong/limited)
    // is NOT sufficient to gate the price swap below - tier only requires
    // n>=8 RESOLVED outcomes, which a cluster can clear entirely on PASSED
    // rows with zero actually sold (a real, honest 0% sell-through), in
    // which case medianSoldPrice is null (median of an empty sold-set).
    // That state must fall back to the AI estimate for the actual sell
    // price - crowdMedianAvailable is the narrower, correct gate for the
    // price/math swap; crowdHasRealData remains what it was (gates the
    // crowd verdict BOX itself, which has real sell-through/sample-size
    // content to show even with a null median).
    const crowdMedianAvailable = result?.crowdVerdict?.medianSoldPrice != null && Number(result.crowdVerdict.medianSoldPrice) > 0;

    // ONE ORACLE SOURCE (2026-08-24): the scan result card now reads every
    // Oracle-derived number from `result` itself - lens/route.ts already
    // queries the SAME community moat internally (Wave 1) and embeds its
    // output into result.netProfit/buyTarget/roi/velocity/dataQuality/
    // priceData. The separately-fetched `oracle`/`oraclePred` state below
    // (getProfitOracle, a DIFFERENT, independently price-banded query) used
    // to override these numbers whenever it returned crowd-led data,
    // which is exactly what let the hero disagree with itself (e.g. "sells
    // in ~540 days" from one query next to "not enough data yet" from the
    // other). `oracle` is kept only for ShareCard's share-image rendering
    // below - it must NOT feed anything the on-screen card shows.
    // CONDITION-ADJUSTED RESALE (2026-09-10, items 5/9): resaleFromModel/
    // resaleModelLow/resaleModelHigh (lens/route.ts's FIX 5 instrumentation)
    // are the model's PRE-condition-multiplier range - re-multiplying THESE
    // by whichever conditionAssessment is currently selected (the scan's
    // own read, or the dropdown below) reproduces exactly what the backend
    // would compute for that selection, entirely locally - no new LLM call,
    // no network round trip. Falls back to the server's already-computed
    // estimatedResaleValue/Range as-is when there's no raw model number to
    // recompute from (a path that skipped identify entirely - barcode/
    // description-only - never had a model resale judgment to begin with;
    // the condition dropdown is a display-only no-op there).
    // STALE-ANCHOR FIX (2026-10-05, MEASURED: real Walmart-aisle scans - a
    // Minnie Mouse plush and an Under Armour polo): resaleFromModel is the
    // model's RAW, PRE-oracle/PRE-Browse anchor - it exists on every scan
    // that ran identify at all, confirmed by real data or not. hasRawModelResale
    // used to gate on resaleFromModel alone, so this local recompute fired
    // UNCONDITIONALLY whenever identify ran, silently discarding whatever
    // the server's real final price actually was: the Minnie Mouse scan
    // showed a $22 sell price with a "6 active New-condition eBay listings
    // (median $38)" badge right next to it - $22 was resaleFromModel*1.0,
    // completely ignoring the server's real anchorSource:"ebay-active-new"
    // sellPrice of $34. The Under Armour polo showed "$10 ESTIMATED SELL
    // PRICE" next to a "● REAL DATA" badge - $10 was resaleFromModel(18)*
    // conditionFactor(0.55), ignoring confirmedByMoat:true's real
    // moat-blended sellPrice of $15. In both cases the "condition dropdown"
    // recompute is only a correct mirror of the server when the server's
    // own price WAS the bare model anchor (no moat blend, no Browse
    // override) - that's exactly !confirmedByMoat. (The server's
    // "ebay-active-new" anchorSource override this comment used to also
    // check for was removed 2026-10-06 along with eBay active listings as a
    // price source entirely - anchorSource can no longer take that value.)
    // Any other case: result.sellPrice/priceRange IS the authoritative
    // number (already condition-aware server-side), and the local recompute
    // must defer to it instead of recomputing from a pre-correction anchor.
    const resaleIsAuthoritative = !result.confirmedByMoat;
    const hasRawModelResale = Number(result.resaleFromModel) > 0 && resaleIsAuthoritative;
    const conditionFactor = CONDITION_MULTIPLIER[resultCondition] ?? DEFAULT_CONDITION_MULTIPLIER;
    const adjustedResaleValue = hasRawModelResale
      ? Math.round(Number(result.resaleFromModel) * conditionFactor)
      : (Number(result.sellPrice) || Number(result.estimatedResaleValue) || 0);
    const adjustedResaleLow = hasRawModelResale && Number(result.resaleModelLow) > 0
      ? Math.round(Number(result.resaleModelLow) * conditionFactor)
      : (Number(result.priceRange?.low) || Number(result.estimatedResaleRange?.low) || null);
    const adjustedResaleHigh = hasRawModelResale && Number(result.resaleModelHigh) > 0
      ? Math.round(Number(result.resaleModelHigh) * conditionFactor)
      : (Number(result.priceRange?.high) || Number(result.estimatedResaleRange?.high) || null);

    // FEE RATE / SHIPPING COST (2026-10-09, PARITY FIX): read straight off
    // result.feeRate - the EXACT rate deal-ai-pro's own netProfit/roi/
    // classifyHeroVerdict call used server-side (see app/api/lens/route.ts's
    // "PARITY INPUTS" field) - never a hardcoded guess on this side. The
    // fallback (only for a scan saved before this field existed) derives
    // from OTHER already-server-computed fields on this same result
    // (fees/sellPrice), not a new constant. estShippingCost mirrors the
    // server's own shipping subtraction (lib/shippingEstimate.ts, only ever
    // non-null for the exact_item tier) - this used to be silently missing
    // from every local recompute below, so an exact-item scan's locally
    // edited profit/ROI disagreed with the server's own (shipping-aware)
    // numbers the instant a price was entered.
    const feeRate = Number(result.feeRate) > 0
      ? Number(result.feeRate)
      : (Number(result.fees) > 0 && Number(result.sellPrice) > 0 ? Number(result.fees) / Number(result.sellPrice) : 0.13);
    const shippingCost = Number(result.estShippingCost) || 0;

    const enteredBp = Number(buyPrice) || 0;

    // RANGE-CARD VALUE (2026-09-10): dealCompareValue prefers the
    // entered/edited price, falling back to the detected tag price only
    // when nothing's been entered - same precedence the server used.
    // ONE VERDICT SOURCE (Fix 3): this used to also compute its own
    // independent isGoodDeal (dealCompareValue < adjustedResaleLow) and
    // color/label the range card off THAT - a second, separately-computed
    // verdict that could (and did, on the Fisher-Price scan) say "good
    // deal" in green while outcome/classifyOutcome below said SKIP for the
    // same item, because range-position and dollar-profit-floor are
    // different questions with different answers. isGoodDeal/dealReasoning
    // are gone; the range card below reads outcome.tier/label/accent
    // directly (computed further down) so it is now structurally
    // impossible for the two cards to disagree - they render off the same
    // OutcomeTierInfo object. This value is now used ONLY to display the
    // range numbers, never to independently decide good/bad framing.
    // TAG CONFIRM GATE: an unconfirmed tag read must not drive this display
    // either, same reasoning as the server's own dealCompareValue gate -
    // without this, the range card could still show the unconfirmed number
    // while the confirm card above was asking about that exact number.
    const dealCompareValue = enteredBp > 0
      ? enteredBp
      : (!tagConfirmPending && Number(result.retailPriceRead) > 0 ? Number(result.retailPriceRead) : null);

    // ONE CANONICAL SELL PRICE (2026-09-17, REVERTED 2026-10-04 - decision
    // 3/10, Walmart-aisle testing): the single sell-price figure every
    // downstream number (fees, heroProfit, heroRoi, maxBuy, the "sell
    // price" stat, the estimate-tier hero/copy, and the Profit Oracle
    // priceData box's visibility) derives from - rounded to the dollar
    // ONCE, here, so no two displays of the same underlying number can
    // independently round to different figures (the "$6 profit / 138% ROI
    // don't cross-check" bug).
    //
    // This used to prefer result.crowdVerdict.medianSoldPrice (the crowd-
    // verdict RPC's median) over the server's own Oracle sellPrice whenever
    // crowdMedianAvailable - reasoned at the time as "a real median beats a
    // guess." Measured live: crowd_verdict_stats matches by brand+category
    // ALONE (lib/crowdVerdict.ts - no item-type, no price-band, no
    // condition filter, unlike lib/profitOracle.ts's Oracle match), so for
    // a brand with a large, mixed catalog (parts/accessories/full-units all
    // together) its median can be wildly off this SPECIFIC item - a sealed
    // Dyson PencilVac showed "$50" from this path while the server's own
    // carefully-matched Oracle answer was $392. The server's sellPrice (via
    // adjustedResaleValue for the condition-adjustable AI-estimate case) is
    // now the ONLY source for this screen's canonical price - the crowd
    // verdict box still renders its own sell-through/sample-size content
    // (see the crowd-box render further down), it just no longer overrides
    // the price everything else on this card is computed from.
    const sellPriceForProfit = Math.round(adjustedResaleValue || Number(result.sellPrice) || 0);
    // LOCAL RECOMPUTE (2026-09-10, items 8/9): mirrors lib/profitMath.ts's
    // computeProfit exactly - fees = round(sp*feeRate*100)/100, netProfit =
    // round((sp-fees-cost)*100)/100 - so editing price or condition here
    // reproduces exactly what a fresh scan at those values would have
    // shown, without a network round trip. REPLACES reading
    // result.netProfit directly - that was computed against whatever price
    // existed AT SCAN TIME, almost always none now that price lives here
    // instead of before the scan.
    const localFees = Math.round(sellPriceForProfit * feeRate * 100) / 100;
    const heroProfit = enteredBp > 0 ? Math.round((sellPriceForProfit - localFees - enteredBp - shippingCost) * 100) / 100 : 0;

    // MAX-BUY LOCAL RECOMPUTE (2026-09-10, Fix 1): mirrors deal-ai-pro/
    // lib/profitMath.ts's computeMaxBuy, but driven by sellPriceForProfit
    // (the CURRENT condition-adjusted, canonically-rounded resale, same
    // input heroProfit above uses) instead of the frozen result.buyTarget
    // the server computed once
    // at scan time. REPLACES reading result.buyTarget directly - that froze
    // the ceiling at whatever condition/price existed AT SCAN TIME, so
    // editing price or condition here moved the hero/ROI/profit but left
    // "Max buy" and its reasoning text stuck on stale numbers. ROI_BUY_MIN/
    // PROFIT_JUDGMENT_FLOOR are imported directly from outcomeTier.ts (not
    // re-declared here) so this ceiling can never drift from the verdict's
    // own BUY threshold - paying at or under max-buy now guarantees the
    // verdict can't call it a judgment call on ROI grounds.
    // Definition: the highest buy price that still clears BOTH of the
    // verdict's BUY-tier floors (ROI_BUY_MIN% after-fees ROI, AND the
    // PROFIT_JUDGMENT_FLOOR dollar floor) against the current resale -
    // whichever constraint is tighter wins, same dual-constraint shape as
    // computeMaxBuy. Reads sellPriceForProfit (the ONE canonical rounded
    // sell price, see above), not adjustedResaleValue directly, so the
    // ceiling this quotes is built from the exact same number the profit/
    // ROI/stat tile all use - never a different, unrounded figure.
    const netAfterFeesAtCeiling = sellPriceForProfit * (1 - feeRate);
    const roiCeilingBuy = netAfterFeesAtCeiling / (1 + ROI_BUY_MIN / 100);
    const profitFloorBuy = netAfterFeesAtCeiling - PROFIT_JUDGMENT_FLOOR;
    const maxBuy = sellPriceForProfit > 0
      ? Math.max(1, Math.floor(Math.min(roiCeilingBuy, profitFloorBuy)))
      : null;
    const profitLabel = enteredBp > 0 ? "actual profit after fees" : "projected profit after fees";

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
      : 0;

    // ONE ORACLE SOURCE: both the stat-block text and the verdict's raw
    // number now read result.velocity.estDaysToSale exclusively (lens's own
    // embedded moat query, banded + outlier-guarded as of this fix - see
    // lens/route.ts and lib/profitOracle.ts). It's either a real, sane
    // measurement or null - "not enough data yet" is shown honestly instead
    // of a second, differently-sourced number ever being able to disagree
    // with it.
    const estDaysToSale = result.velocity?.estDaysToSale ?? null;
    const oracleDaysTxt = estDaysToSale != null ? `~${estDaysToSale}d` : "not enough data yet";
    const sellTimeLabel = estDaysToSale != null ? `~${estDaysToSale} days` : null;
    // Real NUMBER of days for the velocity-adjusted score - classifyOutcome
    // falls back to a conservative 45-day assumption if this is null - never
    // call something HOT it can't back up.
    const daysToSell = estDaysToSale;

    // Outcome tier — THE single source of truth for the verdict. Weighs
    // ROI, dollar profit, AND velocity together (a fast mover clears the
    // bar at a lower ROI, a slow mover needs a higher one; trivial dollars
    // never read as a win regardless of ROI%) - see outcomeTier.ts for the
    // full model. Nothing else on this screen independently computes or
    // displays a conflicting verdict.
    //
    // NO FABRICATED VERDICT (2026-08-25): classifyOutcome must never run
    // against a cost basis nobody actually entered. It used to be fed
    // heroProfit/heroRoi computed off the max-buy CEILING as if it were a
    // real purchase price - confirmed live: a genuinely great $19-median
    // item with no price entered came back "SKIP - only $4 profit," a
    // number nobody paid or would pay. lens/route.ts now zeroes netProfit/
    // roi server-side when unpriced, which would otherwise feed
    // classifyOutcome a $0-profit "You'd lose $0. Skip it." - equally
    // dishonest, just a different wrong number. Reuses the skip TIER'S
    // LAYOUT (no big profit hero; Max Buy always ships, see ProfitFlexHero)
    // without claiming a verdict this screen can't back up - real sell
    // data (the banner above) plus a correctly-computed Max Buy (below)
    // are the only honest things to lead with until a price is entered.
    // VERDICT GATE (2026-10-04, decision 5): a big verdict (HOT BUY/SKIP/
    // JUDGMENT CALL, with a real ROI%/"excellent margin" framing) now also
    // requires result.confirmedByMoat - the sell price must be item-level
    // evidence (server-side: >=5 agreeing rows of the SAME item type, see
    // lib/profitOracle.ts), not just "a buy price was entered." Measured
    // live: a Reebok fitness kit with ZERO moat confirmation
    // (confirmedByMoat:false, agreeingCount:0 - a pure LLM guess) showed
    // "HOT BUY, 95% ROI, excellent margin" once $17.50 was entered - the
    // buy side was real, but the sell side backing that verdict was not.
    const hasItemLevelSellEvidence = !!result.confirmedByMoat;
    // Used only by the two ESTIMATE-LABEL-BUG copy branches below (real
    // data, no verdict yet) - the actual confirmedByMoat gate everywhere
    // else still reads result.agreeingCount directly, this is purely for
    // the sentence text.
    const agreeingCountForCopy = Number(result.agreeingCount) || 0;
    let outcome = (enteredBp > 0 && hasItemLevelSellEvidence)
      ? classifyOutcome({
          noFlipMargin: !!result.noFlipMargin,
          netProfit: heroProfit,
          roi: heroRoi,
          daysToSell,
          velocityTier: result.velocity?.tier,
          sellThrough: result.velocity?.sellThrough,
          dataQuality: result.dataQuality,
          sellPrice: sellPriceForProfit || null,
          sellTimeLabel,
        })
      : (enteredBp > 0 ? {
          // PRICED BUT UNCONFIRMED (2026-10-04, decision 5): a price WAS
          // entered, but the sell side is still a market estimate, not
          // item-level evidence - same "estimate" tier/layout as the
          // no-price branch below (no hero verdict, no ROI%), with copy
          // that reflects the price already being in rather than asking
          // for it again.
          //
          // ESTIMATE-LABEL BUG (2026-10-06, MEASURED: real Under Armour polo
          // scan - confirmedByMoat:true, agreeingCount:11, sellPrice:$15,
          // all correct - still showed a yellow "ESTIMATE" label): this
          // branch used to hardcode label:"ESTIMATE"/accent:yellow
          // UNCONDITIONALLY, for every enteredBp>0 case, even when
          // hasItemLevelSellEvidence (confirmedByMoat) was true - conflating
          // "no verdict yet" (genuinely true without knowing margin) with
          // "the price itself is unconfirmed" (false here). The number
          // itself is real moat data; only the BUY/SKIP verdict is pending.
          tier: "estimate" as const,
          emoji: hasItemLevelSellEvidence ? "✅" : "🏷️",
          label: hasItemLevelSellEvidence ? "REAL DATA" : "ESTIMATE",
          copy: hasItemLevelSellEvidence
            ? `Sells for about $${sellPriceForProfit} (real data from ${agreeingCountForCopy} resale outcomes) — verdict needs your buy price.`
            : `Sells for about $${sellPriceForProfit} (market estimate, not yet confirmed by real sales of this exact item) — verify before buying at $${enteredBp}.`,
          accent: hasItemLevelSellEvidence ? C.green : C.yellow,
          adjustedROI: 0,
          daysUsed: 0,
        } : {
          // NO PRICE ENTERED (2026-09-10, item 8): the OLD "ADD PRICE" skip-
          // styled dead-end is gone - price now lives on THIS screen (see
          // above), so having none yet is the common, honest starting
          // state, not a degraded one. tier:"estimate" (not "skip") means
          // this renders through the SAME buy-style hero layout as a real
          // verdict (isSkip stays false below), showing the estimate +
          // range as the hero number instead of a profit figure - see
          // heroDisplayValue below and its ProfitFlexHero prop.
          //
          // Same ESTIMATE-LABEL BUG fix as the branch above - see its
          // comment. No buy price entered yet means no VERDICT, not that
          // the sell price itself is unconfirmed.
          tier: "estimate" as const,
          emoji: hasItemLevelSellEvidence ? "✅" : "🏷️",
          label: hasItemLevelSellEvidence ? "REAL DATA" : "ESTIMATE",
          // ONE RESALE REALITY (2026-09-17): the range clause only ever
          // appears in THIS branch (priced tiers' copy comes from
          // outcomeTier.ts's own strings, which never mention a range) -
          // when crowdMedianAvailable (NOT the broader crowdHasRealData -
          // see the comment above crowdMedianAvailable's definition) the
          // crowd line below carries the real resale number, so this
          // reuses the existing no-range fallback instead of stating the
          // AI range a second time. Not left blank - ProfitFlexHero
          // renders this unconditionally for every non-skip tier, so it
          // always needs SOME sentence here.
          // ONE CANONICAL SELL PRICE: reads sellPriceForProfit, not the raw
          // adjustedResaleValue - already resolves to the crowd median when
          // crowdMedianAvailable (see sellPriceForProfit's definition), so
          // the no-price "sells for about $X" figure matches the exact
          // number the "sell price" stat and maxBuy ceiling use once a
          // price IS entered, instead of a separately-rounded one.
          copy: hasItemLevelSellEvidence
            ? `Sells for about $${sellPriceForProfit} (real data from ${agreeingCountForCopy} resale outcomes). Enter what you paid above for your real profit and verdict.`
            : (adjustedResaleLow != null && adjustedResaleHigh != null && !crowdMedianAvailable)
            ? `Sells for about $${sellPriceForProfit} (range $${adjustedResaleLow}-$${adjustedResaleHigh}). Enter what you paid above for your real profit and verdict.`
            : `Sells for about $${sellPriceForProfit}. Enter what you paid above for your real profit and verdict.`,
          accent: hasItemLevelSellEvidence ? C.green : C.yellow,
          adjustedROI: 0,
          daysUsed: 0,
        });

    // RESULT-SCREEN HERO VERDICT (2026-10-09, EXACT PORT of deal-ai-pro's
    // lib/priceBasis.ts classifyHeroVerdict() - that function is the single
    // source of truth; if it changes, this block must change to match).
    // Recomputed LOCALLY (not read off result.heroVerdict, which the server
    // computed at whatever buyPrice existed AT SCAN TIME - see this
    // screen's own PRICE-ON-RESULTS comment, almost always $0 since price
    // lives on this screen, not the scan request) so editing the buy price
    // here updates the verdict instantly with no network round trip.
    //
    // RULE 0 REMOVED (2026-10-09, MEASURED): this used to check
    // result.noFlipMargin (and a basisPrice>=buyPrice break-even check)
    // FIRST, unconditionally PASSing - a stale copy of a rule deal-ai-pro's
    // server removed in commit ebb3df1 ("selling at/above retail is not
    // itself a reason to pass on a real, positive-margin flip"). That left
    // this screen able to PASS an item the server's OWN current verdict
    // logic would call SOLID/WORTH A LOOK - the exact client/server
    // disagreement this port exists to close. Gone entirely now; the first
    // real gate is net profit <= 0.
    if (enteredBp > 0) {
      const segOut: any = result.segmentOutcomes;
      const tier: string = result.priceBasisTier || (result.confirmedByMoat ? "item_moat" : segOut ? "segment" : "ai_only");
      // sellThroughPct: the EXACT value classifyHeroVerdict used server-side
      // for whichever tier won (PriceBasisResult.sellThroughPct, now
      // returned on the response - see app/api/lens/route.ts's "PARITY
      // INPUTS" comment) - NOT result.velocity.sellThrough, a different,
      // oracle-wide metric the server's own verdict call never actually
      // reads.
      const heroSellThroughPct: number | null = result.sellThroughPct ?? null;
      // ai_only -> null (no verdict at all, same as classifyHeroVerdict's
      // own first line) - the old code had no such guard and could fall
      // through to THIN/SOLID/etc on a pure AI estimate with zero real data
      // behind it.
      const headline: "PASS" | "THIN" | "WORTH A LOOK" | "SOLID" | null =
        tier === "ai_only" ? null
        : heroProfit <= 0 ? "PASS"
        : heroRoi < ROI_BUY_MIN ? "THIN"
        : tier === "segment" ? "WORTH A LOOK"
        : (heroRoi >= 50 && heroSellThroughPct != null && heroSellThroughPct >= 50) ? "WORTH A LOOK"
        : "SOLID";
      if (headline != null) {
        const evidenceLine = result.agreementBadge || (segOut
          ? [
              segOut.medianSoldPrice != null ? `${segOut.label} resell ~$${Math.round(segOut.medianSoldPrice)}` : null,
              segOut.sellThroughRate != null ? `${Math.round(segOut.sellThroughRate)}% sell` : null,
              segOut.resolvedCount > 0 ? `${segOut.resolvedCount} resale outcomes` : null,
            ].filter(Boolean).join(" · ") || null
          : null);
        const META: Record<string, { emoji: string; accent: string; tier: "hot" | "solid" | "thin" | "skip" }> = {
          "PASS": { emoji: "🚫", accent: C.red, tier: "skip" },
          "THIN": { emoji: "🤏", accent: C.yellow, tier: "thin" },
          "SOLID": { emoji: "✅", accent: C.green, tier: "solid" },
          "WORTH A LOOK": { emoji: "🔥", accent: C.green, tier: "hot" },
        };
        const meta = META[headline];
        outcome = {
          tier: meta.tier,
          emoji: meta.emoji,
          label: headline,
          accent: meta.accent,
          copy: evidenceLine || outcome.copy,
          adjustedROI: outcome.adjustedROI,
          daysUsed: outcome.daysUsed,
        };
      }
    }
    const isSkip = outcome.tier === "skip";

    // PARITY GUARD (2026-10-09, owner-only): the server's own
    // netProfit/roi/heroVerdict are only genuinely comparable to this local
    // port at buyPrice=$0 - that's the ONLY price the server ever actually
    // computed them at (see the PRICE-ON-RESULTS comment above; a real,
    // user-entered price has no server-computed equivalent to diff against
    // without a round trip this screen deliberately doesn't make - see
    // Part 2's own session notes on why). Checked on every render rather
    // than once: cheap, and $0 is the steady state before any edit. If
    // local and server ever disagree even here, the PORT above has drifted
    // from lib/priceBasis.ts's classifyHeroVerdict - the server's numbers
    // win, and isOwner sees exactly what disagreed. This can never catch a
    // mismatch on an EDITED price (there is no server number for that price
    // to compare against) - it is a regression tripwire on the $0 case, not
    // a live check of the priced case.
    let parityMismatchText: string | null = null;
    if (enteredBp === 0) {
      const serverNetProfit = Number(result.netProfit) || 0;
      const serverRoi = Number(result.roi) || 0;
      const serverVerdict: string | null = result.heroVerdict?.headline ?? null;
      const mismatches: string[] = [];
      if (heroProfit !== serverNetProfit) mismatches.push(`profit local ${heroProfit} server ${serverNetProfit}`);
      if (heroRoi !== serverRoi) mismatches.push(`roi local ${heroRoi} server ${serverRoi}`);
      if (serverVerdict != null) mismatches.push(`verdict local null server ${serverVerdict}`);
      // At $0 the verdict-override block above never ran (it's gated on
      // enteredBp>0), so `outcome` here is already untouched/server-honest
      // - there is nothing local to swap OUT for the server's values; the
      // mismatch text alone is the signal something upstream has drifted.
      if (mismatches.length) parityMismatchText = `MISMATCH ${mismatches.join(" · ")}`;
    }
    // PROFIT-HONESTY FIX (2026-10-05, MEASURED: the Minnie Mouse plush
    // scan): tier "estimate" already means "not item-level confirmed" (see
    // the VERDICT GATE comment above - it's the branch used whenever
    // !hasItemLevelSellEvidence, i.e. !confirmedByMoat, OR no price is
    // entered yet) and its own copy ALREADY says the honest thing ("market
    // estimate, not yet confirmed... verify before buying at $X" / "range
    // $Y-$Z... enter what you paid for your real profit"). But isSkip only
    // ever covered tier==="skip", so ProfitFlexHero's isSkip prop was still
    // getting false for "estimate" - and the NON-skip branch renders the
    // real money hero + profitLabel ("actual profit after fees") +
    // secondaryStats (ROI%) UNCONDITIONALLY. Observed live: a $26 Minnie
    // Mouse with !confirmedByMoat showed "-$5.10 ACTUAL PROFIT AFTER FEES"
    // and "-20% ROI" as if that were real money math, when the sell side
    // was a Browse-active-listings estimate the whole time. Passing this
    // broader flag into ProfitFlexHero's isSkip prop instead of the
    // narrower `isSkip` (still used unchanged everywhere else below -
    // skipDetail, the buy-oriented {!isSkip} section) routes "estimate"
    // through the SAME reason-copy layout as a real skip, so the money
    // hero/profitLabel/ROI stat never render for unconfirmed data - only
    // outcome.copy's already-honest range + "verify before buying" text.
    const hideProfitHero = outcome.tier === "skip" || outcome.tier === "estimate";
    // Hero number: real profit once a price exists, the estimate itself
    // before that - ProfitFlexHero just renders whatever it's handed under
    // `profitLabel`, no component change needed for this to work.
    // Reads sellPriceForProfit (canonical, rounded), not adjustedResaleValue.
    const heroDisplayValue = enteredBp > 0 ? heroProfit : sellPriceForProfit;

    // REMOVED (2026-10-04, decision 8, Walmart-aisle testing): this used to
    // prepend "Most sold on {platform} —" from result.realPlatformClaim - a
    // brand+category-WIDE stat (lib/crowdPlatform.ts's getRealPlatformClaim),
    // never item-specific, stitched onto a specific item's verdict as if it
    // were evidence about THIS item. Measured: a Reebok fitness kit with
    // ZERO item-level confirmation showed a "Most sold on eBay"-style claim
    // next to its verdict. The server no longer surfaces this claim inside
    // dataQualityMessage either (see app/api/lens/route.ts) - outcome.copy
    // is shown exactly as classifyOutcome wrote it, always.
    const heroOutcome = outcome;

    // CONDITION CONCEPT (2026-09-10, item 9): reads resultCondition
    // (conditionAssessment - editable via the dropdown below, the ONE
    // condition concept actually wired to price) instead of the old
    // cosmetic result.condition (Like New/Good/Fair/Poor) - a separate,
    // non-editable field that duplicated the same idea under different
    // vocabulary and never affected any number on this screen.
    const conditionLabel = CONDITION_OPTIONS.find(o => o.value === resultCondition)?.label || null;
    const categoryLine = result.category
      ? `${result.category}${conditionLabel ? " - " + conditionLabel : ""}`
      : null;

    // AGREEMENT-ANCHOR MODEL (Part 3/5): every "how real is this data"
    // signal on this screen - badge, footnote, reasoning text, AND the
    // banner below - now derives from result.agreementBadge, the one honest
    // label lib/profitOracle.ts computed (buildBadge, keyed on
    // agreeingCount). Never re-derived from dataQuality/crowdConfidence
    // tiers here, so this screen can't drift from what the web scanner or
    // ShareCard say about the identical scan.
    // DECLUTTER (2026-09-16): only prefix with agreementBadge when it's a
    // REAL, non-generic signal - the old unconditional dataPhrase (which
    // fell back to "Based on market estimate") repeated the exact same
    // caveat this card already states once in the badge/tag and once more
    // in footNote below. Dropping the generic fallback here, not the real
    // value - a genuine "confirmed by N real sales" agreementBadge is live
    // information, not clutter, and still leads this line when present.
    // SAY IT ONCE (2026-10-06, MEASURED: real UA polo scan - "Based on 11
    // real reseller outcomes" appeared THREE times: hero copy ("real data
    // from 11 resale outcomes"), here, and the green box title below).
    // outcome.copy ALREADY states the count whenever tier==="estimate" (the
    // no-verdict-yet state - see hasItemLevelSellEvidence's two branches
    // above) - suppressed here in exactly that case so the count-bearing
    // sentence shows once, in the hero. Once a real verdict (BUY/SKIP/
    // JUDGMENT) is reached, hero no longer restates it, so this prefix is
    // new information again and stays.
    const maxBuyPrefix = (result.agreementBadge && !(hasItemLevelSellEvidence && outcome.tier === "estimate"))
      ? `${result.agreementBadge}. ` : "";
    // The claim must match the number: maxBuy (recomputed above off the
    // CURRENT condition-adjusted resale, not a frozen scan-time value) is
    // the price where this clears the verdict's own BUY floor - so it's
    // honest to say what paying it actually gets you, and it stays honest
    // across a condition/price edit instead of quietly going stale.
    const maxBuyReasoning = maxBuy == null ? "" : (
      enteredBp > 0
        ? (enteredBp <= maxBuy
            ? `${maxBuyPrefix}You paid $${enteredBp} — ${enteredBp <= maxBuy * 0.5 ? "strong buy, well under" : "under"} the ceiling.`
            : `${maxBuyPrefix}You paid $${enteredBp} — over the ceiling, margin is thinner than ideal.`)
        : `${maxBuyPrefix}Pay $${maxBuy} or less to make this a real flip (≥${ROI_BUY_MIN}% ROI, ≥$${PROFIT_JUDGMENT_FLOOR} profit after fees).`
    );

    // ONE BADGE PER RESULT (2026-10-06, MEASURED: both badges stacked -
    // "✅ REAL DATA" + "● REAL DATA", "🏷️ ESTIMATE" + "● ESTIMATE"): the
    // DECLUTTER pass above this only suppressed the one case it named
    // (enteredBp<=0, unconfirmed) - it missed that outcome.tier==="estimate"
    // ALWAYS carries this exact same REAL DATA/ESTIMATE label up top
    // (lines ~807-831), for every combination of enteredBp/confirmedByMoat,
    // so "● ESTIMATE" below it was ALWAYS a duplicate and "● REAL DATA" was
    // a duplicate in 2 of its 3 reachable states too. This tag is only a
    // genuinely NEW signal in the one case the top badge becomes an actual
    // verdict (BUY/SKIP/JUDGMENT CALL from classifyOutcome, tier!=="estimate")
    // instead of restating REAL DATA/ESTIMATE - which only happens when a
    // price is entered AND the data is confirmed. footNote below already
    // states the estimate/real distinction in prose either way.
    const dataTag = (enteredBp > 0 && hasItemLevelSellEvidence) ? "● REAL DATA" : undefined;
    const dataTagColor = C.green;
    // ONE CAVEAT MAX (2026-10-06, per spec): the single place this screen
    // ever hedges - real data gets no caveat at all (the evidence line in
    // outcome.copy above already says WHY it's confident), an AI estimate
    // gets exactly one short line here, never restated elsewhere (the old
    // multi-paragraph "not yet confirmed by real sales... verify before
    // buying" / "AI-estimated resale range... not yet confirmed" copy is
    // gone from outcome.copy and the range banner below).
    const footNote = result.confirmedByMoat ? undefined : "AI-estimated — verify before buying.";
    // sell price reads sellPriceForProfit (condition-adjusted), NOT
    // result.sellPrice directly - it sits right next to ROI in this same
    // row, and ROI is already computed off the adjusted number (see
    // heroRoi above). Showing the stale original next to the adjusted ROI
    // would be exactly the "two numbers disagree" bug this app has fixed
    // elsewhere - a condition edit must move both together.
    const secondaryStats = [
      { label: "sell price", value: sellPriceForProfit > 0 ? "$" + sellPriceForProfit : "—" },
      { label: "ROI", value: heroRoi ? heroRoi + "%" : "—" },
      { label: "to sell", value: oracleDaysTxt },
    ];
    const skipDetail = isSkip ? (result.reasoning || null) : null;

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content"/>
        {/* Off-screen branded card, captured (not displayed) when sharing as an image */}
        <View style={{ position: "absolute", top: 0, left: -9999 }} pointerEvents="none">
          <ViewShot ref={shareCardRef} options={{ format: "png", quality: 1, result: "tmpfile" }}>
            <ShareCard result={result} oracle={oracle} photoBase64={photos[0]} />
          </ViewShot>
        </View>
        {/* Same log-sale flow History uses (form -> honest Flex Reveal, one
            Modal throughout) - opened by the "Already sold it?" nudge above,
            right on this result screen instead of a detour through History. */}
        <LogSaleModal
          visible={showLogSale}
          token={token}
          scan={result.id ? toPendingScan(result) : null}
          onClose={() => setShowLogSale(false)}
        />
        {/* Nav */}
        <View style={s.nav}>
          <TouchableOpacity onPress={() => setStep("review")} style={s.navBack}>
            <Text style={s.navBackText}>{"\u2039"}</Text>
          </TouchableOpacity>
          <HeaderLogo textStyle={s.logoText}/>
          <TouchableOpacity onPress={reset} style={[s.navBtn,{marginLeft:"auto" as any}]}>
            <Text style={s.navBtnText}>New Scan</Text>
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:60}} showsVerticalScrollIndicator={false}>

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
              {/* REORDER (2026-09-16): price now renders FIRST - the
                  editable price input is the actual top-of-screen content,
                  above the fold, no scroll. The 2026-09-10 FIX 4 reorder
                  (below) had put the verdict card first instead, which left
                  the "Enter what you paid above" copy (in the no-price
                  outcome branch above) pointing at a price field that no
                  longer rendered above it. Moving price back to the top
                  makes "above" literally true again without touching that
                  string. Editing re-runs the verdict LOCALLY (see the
                  adjustedResale / heroProfit / outcome computation above)
                  - no new LLM call, no network round trip, instant. */}
              {/* TAG CONFIRM GATE (2026-10-06): replaces the price field
                  entirely while retailPriceNeedsConfirmation is true and
                  unresolved - a Walmart-aisle test run measured the OLD
                  "blank field + hint text" version letting 3 real misreads
                  (Cuisinart $171, Carote $198, Spawn $50) through with no
                  confirmation shown at all, because the server was self-
                  reporting high confidence on all three. The server's
                  sanity gate (app/api/lens/route.ts) now catches those AND
                  the flag below is the one thing this screen trusts - no
                  separate confidence check needed here any more. Server
                  already withholds this number from its own dealReasoning
                  while the flag is true, so nothing downstream acts on it
                  until one of these two buttons is tapped. */}
              {tagConfirmPending ? (
                <View style={s.tagConfirmCard}>
                  <Text style={s.tagConfirmTitle}>We read ${result.retailPriceRead} off the tag — correct?</Text>
                  {result.retailPriceReadSourceText ? (
                    <Text style={s.tagConfirmSource} numberOfLines={2}>Read from: "{result.retailPriceReadSourceText}"</Text>
                  ) : null}
                  <View style={s.tagConfirmRow}>
                    <TouchableOpacity
                      style={s.tagConfirmBtn}
                      onPress={() => {
                        setBuyPrice(String(result.retailPriceRead));
                        setTagConfirmPending(false);
                      }}
                    >
                      <Text style={s.tagConfirmBtnText}>Confirm ${result.retailPriceRead}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.tagEditBtn}
                      onPress={() => {
                        setBuyPrice("");
                        setTagConfirmPending(false);
                        setTimeout(() => priceInputRef.current?.focus(), 50);
                      }}
                    >
                      <Text style={s.tagEditBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={s.priceLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {Number(result.retailPriceRead) > 0 ? "Price (from a detected tag)" : "What you paid (optional)"}
                  </Text>
                  <View style={s.priceFieldWrap}>
                    <Text style={s.priceFieldDollar}>$</Text>
                    <TextInput
                      ref={priceInputRef}
                      style={s.priceFieldInput}
                      value={buyPrice}
                      onChangeText={setBuyPrice}
                      placeholder="0.00"
                      placeholderTextColor={C.text4}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={s.priceFieldHint} numberOfLines={2}>
                    {Number(result.retailPriceRead) > 0
                      ? "Read off a price tag in your photo — edit if it's wrong."
                      : "No price tag detected — enter what you paid to see your real profit and verdict."}
                  </Text>
                </>
              )}

              {/* THE hero: verdict + profit + max-buy (with reasoning) + key
                  stats, reconciled into one card instead of a separate
                  verdict card stacked on a separate Profit Oracle card.
                  outcome (classifyOutcome) is the single source of truth for
                  buy-vs-skip - nothing else on this screen computes or shows
                  a different verdict. The marginTop wrapper replaces the
                  price label's old top margin - same gap, now sitting
                  between price and this card instead of above the label. */}
              <View style={{ marginTop: 16 }}>
                <ProfitFlexHero
                  outcome={heroOutcome}
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
                  isSkip={hideProfitHero}
                  heroProfit={heroDisplayValue}
                  // WORDING FIX (2026-10-05): calling a confirmedByMoat price
                  // "estimated" (while the dataTag right next to it says
                  // "● REAL DATA") was the Under Armour polo's exact
                  // contradiction - "estimated" now only applies when the
                  // price genuinely isn't confirmed.
                  profitLabel={enteredBp > 0 ? profitLabel : (result.confirmedByMoat ? "sell price" : "estimated sell price")}
                  maxBuy={maxBuy}
                  maxBuyReasoning={maxBuyReasoning}
                  dataTag={dataTag}
                  dataTagColor={dataTagColor}
                  secondaryStats={secondaryStats}
                  footNote={footNote}
                  skipDetail={skipDetail}
                  flashSeq={refineSeq}
                />
              </View>

              {/* SEGMENT OUTCOMES (replaces the old crowdVerdict "Category
                  trend" banner, 2026-10-06 - that banner read
                  result.crowdVerdict, which the server no longer sends;
                  crowdHasRealData/crowdMedianAvailable below are now always
                  false via optional chaining, inert rather than broken, but
                  the banner itself was removed rather than left dead).
                  "What resellers actually made" - a real aggregate for the
                  broader segment, always labeled with the real segment name,
                  never presented as this item's own price. Shown whenever
                  the server found a segment with 15+ resolved outcomes,
                  independent of whether this item ALSO has its own
                  item-level REAL DATA above - that stays the top tier. */}
              <SegmentOutcomesBlock segment={result.segmentOutcomes} />

              {/* CONDITION-MISMATCH CONTEXT (2026-10-08): the best available
                  REAL number even when it didn't qualify as the price basis
                  (e.g. a sealed scan with only used-condition sold data) -
                  shown to everyone, honestly labeled, NEVER as the hero and
                  never driving profit/ROI/verdict above. Null whenever
                  nothing like that exists. */}
              {!!result.priceBasisContext && (
                <Text style={{ color: C.text3, fontSize: 12, marginHorizontal: 16, marginTop: 4 }}>{result.priceBasisContext}</Text>
              )}

              {/* OWNER DEBUG READOUT (2026-10-08): the price-basis hierarchy's
                  own tier/why-not/eBay-timing readout - see deal-ai-pro's
                  lib/priceBasis.ts. result.priceBasisDebug is absent on a
                  scan from before this field existed (ApiDebugPanel already
                  no-ops cleanly on undefined). */}
              <ApiDebugPanel
                isOwner={isOwner}
                priceBasisDebug={result.priceBasisDebug}
                barcodeDebug={result._barcodeDebug}
                segmentDebug={result.segmentOutcomes ? {
                  segmentLabel: result.segmentOutcomes.segmentLabel,
                  conditionBasis: result.segmentOutcomes.conditionBasis,
                  resolvedCount: result.segmentOutcomes.resolvedCount,
                  soldCount: result.segmentOutcomes.soldCount,
                } : null}
                parityMismatch={parityMismatchText}
              />

              {/* AI range banner - MEASURED BUG (2026-10-06, real $26 Minnie
                  Mouse scan): gate used to be !crowdMedianAvailable, which
                  the SEGMENT OUTCOMES comment above already notes is dead
                  (result.crowdVerdict no longer exists server-side, so this
                  was always true) - meaning the gate had silently stopped
                  restricting this banner to "only when using the AI/model
                  estimate" at all; it could show next to REAL confirmedByMoat
                  data too. Now gated directly on !hasItemLevelSellEvidence
                  (confirmedByMoat false), the actual condition that makes
                  adjustedResaleLow/High an AI estimate (resaleModelLow/High
                  or identify's own estimatedResaleRange - see their
                  definitions above) rather than real sold-comp data.
                  ALSO MEASURED: the sentence itself stated the range as
                  flat fact ("resale range is $X-$Y") with no estimate/AI
                  qualifier anywhere in it - now says so explicitly. Reads
                  outcome.tier/label/emoji/accent directly - the SAME
                  OutcomeTierInfo the verdict card renders (FIX 3,
                  2026-09-10) - so this can't contradict the verdict card. */}
              {!hasItemLevelSellEvidence && dealCompareValue != null && adjustedResaleLow != null ? (
                <View style={[s.rangeBanner, { backgroundColor: outcome.accent + "1a", borderColor: outcome.accent + "55" }]}>
                  <Text></Text>
                  <FlashHighlight flashSeq={refineSeq}>
                    {/* ONE CAVEAT MAX: the "not yet confirmed" qualifier
                        lives once, in ProfitFlexHero's footNote above - not
                        repeated here. */}
                    <Text style={[s.rangeBannerSub, { flex: 1 }]}>{`At $${dealCompareValue}, AI-estimated range is $${adjustedResaleLow}-$${adjustedResaleHigh}.`}</Text>
                  </FlashHighlight>
                </View>
              ) : null}

              {result?.refinePending && (
                // DEFERRED SEARCH-GATE REFINE (2026-10-06, Option A): mirrors
                // deal-ai-pro's ScanBox.tsx note - the server scheduled a
                // background search-enabled re-check (see lens/route.ts's
                // after() block) instead of making this response wait on it.
                // Purely informational; nothing here polls or re-fetches -
                // the updated value is just already there next time History
                // is opened. Deliberately NOT wired to refineScan()/
                // needsRefine (that's the OLDER client-driven two-stage
                // mechanism, currently dead since the server stopped sending
                // needsRefine - see maybeRefineInBackground above) - this is
                // the newer, purely-server-side pass, no client call needed.
                <Text style={{ marginTop: 10, color: C.text3, fontSize: 12.5, fontWeight: "600", textAlign: "center" }}>
                  Still checking — final result appears in History.
                </Text>
              )}

              {/* CONDITION DROPDOWN (2026-09-10, item 9): pre-filled from
                  the scan's own read (conditionAssessment); changing it
                  applies the SAME fixed multiplier the backend uses (item
                  5) to the model's raw resale range, locally - same instant
                  recompute path as the price edit above. This is now the
                  ONE condition concept on this screen - see categoryLine
                  above, which reads resultCondition, not the old cosmetic
                  result.condition field. */}
              <Text style={[s.priceLabel, { marginTop: 16 }]} numberOfLines={1}>Condition</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                {CONDITION_OPTIONS.map((opt) => {
                  const selected = resultCondition === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setResultCondition(opt.value)}
                      style={{
                        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                        borderWidth: 1.5, borderColor: selected ? C.green : C.border,
                        backgroundColor: selected ? C.greenBg : "transparent",
                      }}
                    >
                      <Text style={{ color: selected ? C.green : C.text3, fontSize: 12, fontWeight: "700" }}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Data confidence: real listings + link, shown only when
                  confirmed by moat. DECLUTTER (2026-09-16): removed the
                  else-branch hedge banner ("{agreementBadge} — verify
                  before buying", s.limitedBanner) - it was a THIRD
                  rendering of the same "this is an estimate" caveat this
                  screen already carries in the tier badge/tag and in
                  footNote below, in its own separate card. footNote is the
                  one caveat this screen keeps. isConfidentVerdict (used
                  only to gate that removed branch) is gone with it.
                  ONE SELL PRICE (2026-09-17): this box's own "avg $X ·
                  range $Y-$Z" (result.priceData - the separate Profit
                  Oracle prediction, a THIRD price source distinct from
                  both the AI estimate and the crowd median) is now also
                  gated on !crowdMedianAvailable - when the crowd median is
                  driving the math/display, this box would be a second,
                  different sell-price claim sitting right below it. Thin
                  case (crowdMedianAvailable false) is unaffected - shows
                  exactly as it did before. */}
              {!crowdMedianAvailable && result.confirmedByMoat && result.priceData ? (
                <TouchableOpacity style={[s.goodBanner, { marginTop: 16 }]} onPress={()=>Linking.openURL(result.priceData.ebaySearchUrl)}>
                  <Text></Text>
                  <View style={{flex:1}}>
                    {/* SAY IT ONCE - same fix as maxBuyPrefix above: when
                        tier==="estimate", the hero copy already states
                        "Based on N real reseller outcomes" - repeating it
                        here too (same string, both visible at once) was
                        the measured UA-polo triple-repeat's third copy.
                        The avg/range line below is still new information
                        either way. */}
                    <Text style={s.goodBannerTitle}>{outcome.tier === "estimate" ? "Real sold data" : result.agreementBadge}</Text>
                    <Text style={s.goodBannerSub}>avg ${result.priceData.avgPrice} · range ${result.priceData.minPrice}–${result.priceData.maxPrice}</Text>
                  </View>
                  <Text style={{color:C.green}}>{'>'}</Text>
                </TouchableOpacity>
              ) : null}

              {/* MEASURED BUG: this used to be TWO stacked elements that did
                  the exact same thing (a first-scan-only callout sitting on
                  top of an always-shown "Sold it? Log your flip" button),
                  AND a completely separate "want a reminder" card ~65 lines
                  further down, both trapped inside {!isSkip && ...} - which
                  hid all of it on a no-buy-price scan (isSkip is forced true
                  whenever no price was entered, see enteredBp above), the
                  single most common first-ever scan. Untangled into two
                  clean, adjacent rows, gated only on what each actually
                  needs (result.id / pendingCheckIn), never on isSkip -
                  "Sold one before?" for a PAST flip, "Not sold yet?" for
                  something just bought - no duplication, no tangle. */}
              {result.id && (
                <TouchableOpacity style={s.soldRow} activeOpacity={0.85} onPress={() => setShowLogSale(true)}>
                  <Text style={{fontSize:20}}>{"🏆"}</Text>
                  <View style={{flex:1}}>
                    <Text style={s.soldRowTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                      Sold one before?
                    </Text>
                    <Text style={s.soldRowSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      Log it {"→"} get your win card
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Not sold yet - the deferred (~2 week reminder) path, for
                  something just bought/decided on, not something already
                  flipped. Same pendingCheckIn/acceptCheckIn/declineCheckIn
                  mechanism as before (set in analyze() only on a real BUY
                  decision) - just relabeled by timing and moved out from
                  under isSkip so it can actually show on an unpriced BUY. */}
              {pendingCheckIn && !checkInAsked && (
                <View style={s.askCard}>
                  <Text style={s.askTitle}>Not sold yet? We'll remind you</Text>
                  <Text style={s.askBody}>
                    We'll check back in about 2 weeks so you can log what this actually sells
                    for - keeps your stats real and sharpens the Oracle for everyone.
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

              {/* Share result as image - unconditional on verdict (2026-09-13):
                  ShareCard already renders a correct branded card for every
                  decision (BUY/WATCH/PASS all get their own verdict badge -
                  see ShareCard.tsx's verdictColor/verdictLabel), so a PASS
                  scan has just as real a card to share as a BUY - "skip this
                  one" is still a shareable moment, not just a win. Used to
                  live inside the buy-oriented {!isSkip} block below and got
                  hidden entirely on a skip verdict along with everything
                  else in that block, which was a layout decision (no
                  platform breakdown / community-share on a non-buy), not a
                  reason this specific button needed hiding too. */}
              <TouchableOpacity
                style={{backgroundColor:C.green,borderRadius:14,paddingVertical:15,paddingHorizontal:12,marginBottom:12,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,minHeight:52,opacity:sharingImage?0.6:1}}
                disabled={sharingImage}
                activeOpacity={0.85}
                onPress={shareResultImage}
              >
                {sharingImage ? (
                  <ActivityIndicator color={C.greenDark} size="small" />
                ) : (
                  <>
                    <Text style={{fontSize:16}}>{"📷"}</Text>
                    {/* "Share result as image" -> "Share as image" - shorter
                        copy first (fits on its own on an SE-width screen);
                        numberOfLines+adjustsFontSizeToFit+flexShrink is a
                        backstop, not the primary fix, so it never clips. */}
                    <Text
                      style={{color:C.greenDark,fontSize:15,fontWeight:"900",flexShrink:1}}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    >
                      Share as image
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Everything below IS still buy-oriented - hidden entirely on
                  a skip verdict (no platform to recommend selling on, no
                  "win" to post to the community, when there's no buy). */}
              {!isSkip && (
                <>
                  {/* Collapsed by default - the hero above already answers
                      the question; everything else is one tap away. */}
                  {/* HONESTY SWEEP (2026-09-18): this section used to be
                      titled "BEST PLACE TO SELL" with a "BEST" badge on the
                      top fee-ranked entry, unconditionally - platformBreakdown
                      is pure fee math (netProfit = sellPrice*(1-fee) - cost),
                      never a claim about where the item actually sells. That
                      title/badge implied a sell recommendation this section
                      never had data to back. Now: a real claim (realPlatformClaim,
                      from crowd_platform_stats, majority-gated - see
                      lib/crowdPlatform.ts server-side) gets its own honestly-
                      labeled banner ABOVE the fee table when one clears the
                      floor; the fee table itself is always labeled as what it
                      is (fees), never as a sell recommendation, whether or not
                      a real claim exists above it. */}
                  {result.platformBreakdown && result.platformBreakdown.length > 0 && (
                    <CollapsibleSection title={result.realPlatformClaim ? "WHERE THIS SELLS" : "LOWEST FEES"} expanded={showPlatforms} onToggle={()=>setShowPlatforms(v=>!v)}>
                      {result.realPlatformClaim && (
                        <View style={{backgroundColor:C.surfaceHigh,borderRadius:10,padding:12,marginBottom:12,borderWidth:1,borderColor:C.green+"40"}}>
                          <Text style={{color:C.green,fontSize:15,fontWeight:"800"}}>
                            {result.realPlatformClaim.pct}% sold on {result.realPlatformClaim.platform}
                          </Text>
                          <Text style={{color:C.text3,fontSize:11,marginTop:2}}>
                            From {result.realPlatformClaim.n} real reported sales - not a fee estimate
                          </Text>
                        </View>
                      )}
                      <Text style={{color:C.text4,fontSize:10,fontWeight:"700",textTransform:"uppercase",marginBottom:8}}>
                        {result.realPlatformClaim ? "Profit by platform (after fees)" : "Ranked by profit after fees"}
                      </Text>
                      {(goDeeper ? result.platformBreakdown : result.platformBreakdown.slice(0,3)).map((pb:any, i:number) => {
                        const profNum = Number(pb.netProfit) || 0;
                        const isNeg = profNum < 0;
                        const isBest = i === 0 && !isNeg;
                        return (
                        <View key={pb.platform} style={{marginBottom:goDeeper?14:8}}>
                          <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8}}>
                            {/* A long platform name (e.g. "Facebook Marketplace")
                                paired with a profit figure had no flex/shrink
                                guard on either side - two unbounded-width
                                siblings in a row could push each other past
                                the screen edge. flex:1+shrink on the name side,
                                profit stays fixed-width and fully visible. */}
                            <View style={{flexDirection:"row",alignItems:"center",gap:6,flex:1,flexShrink:1}}>
                              <View style={{width:3,height:16,borderRadius:2,backgroundColor:isBest?C.green:C.border}}/>
                              <Text style={{color:i===0?C.text1:C.text3,fontSize:14,fontWeight:i===0?"800":"500",flexShrink:1}} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{pb.platform}</Text>
                              {/* "LOW FEE", not "BEST" - this badge marks the
                                  lowest-fee entry in a fee comparison, not a
                                  sell recommendation. */}
                              {isBest && <Text style={{color:C.green,fontSize:9,fontWeight:"900"}}>LOW FEE</Text>}
                            </View>
                            <Text style={{color:isNeg?C.red:(i===0?C.green:C.text2),fontSize:15,fontWeight:"800",flexShrink:0}} numberOfLines={1}>
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

                  {/* MEASURED (2026-09-13): this used to hold a second,
                      weaker personal-share button (plain text via
                      ShareButton) sitting right below the good branded
                      "Share as image" button above it - two competing share
                      actions, one worse than the other, on the same screen.
                      Removed; the image share is the one personal-share
                      action now. What's left here is a genuinely different
                      action (post to the in-app community feed, not a
                      personal OS share), so it keeps its own gate/section -
                      renamed from "Share & Content" since that name described
                      the button that's now gone. */}
                  {heroProfit >= 20 && (
                    <CollapsibleSection title="Community" expanded={showShare} onToggle={()=>setShowShare(v=>!v)}>
                      <TouchableOpacity
                        style={s.communityShareBtn}
                        disabled={winShared || sharingWin}
                        activeOpacity={0.85}
                        onPress={async () => {
                          setSharingWin(true);
                          // HONESTY SWEEP (2026-09-18): this posted
                          // result.bestPlatform (the fee-argmax guess) to
                          // the public Community feed as if it were the
                          // platform the item sold on - found while fixing
                          // the same pattern elsewhere, not one of the
                          // originally-named surfaces. Only a real claim
                          // gets posted now; formatFeedDetail already omits
                          // the platform line entirely when none is passed
                          // (see lib/flipFormat.ts), so this degrades to
                          // "no platform shown" rather than a fabricated one.
                          const ok = await shareWin(token, result.itemName || "Great find", heroProfit || 0, result.realPlatformClaim?.platform, "");
                          setSharingWin(false);
                          if (ok) setWinShared(true);
                        }}>
                        <Text style={s.communityShareTxt}>
                          {winShared ? "✓  Shared with the community!" : sharingWin ? "Sharing..." : "🎉  Share this win with the community"}
                        </Text>
                      </TouchableOpacity>
                    </CollapsibleSection>
                  )}
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
      <View style={s.nav}>
        {/* result survives here only when this screen was reached via the
            Edit & Rerun pencil - route back to it instead of wiping state
            and dropping to the camera like a fresh scan would. */}
        <TouchableOpacity onPress={() => (result ? setStep("result") : reset())} style={s.navBack}><Text style={s.navBackText}>{"\u2039"}</Text></TouchableOpacity>
        <HeaderLogo textStyle={s.logoText}/>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={[s.h2, { marginBottom: 4 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
          Add any details
        </Text>
        <Text style={[s.body, { marginBottom: 18 }]}>
          Brand, condition, notes — all optional, but the more you add, the more accurate
          your identification. You'll enter price on the results screen, right where the
          scan reads any price tag it finds.
        </Text>

        {/* Photos */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
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

        {/* PRICE-ON-RESULTS (2026-09-10, item 8): the price field that used
            to be here moved to the results step - the scan itself reads any
            price tag (retailPriceRead), so asking for price before the scan
            even runs meant either asking blind or asking twice. See the
            results step below for where it's entered/edited now. */}

        {/* Brand / notes - both optional */}
        <Text style={[s.caption, { marginBottom: 6, marginTop: 4 }]}>Brand (optional)</Text>
        <TextInput style={s.textInput} value={brandInput} onChangeText={setBrandInput} placeholder="e.g. Coach, Nike, DeWalt" placeholderTextColor={C.text4} />
        <Text style={[s.caption, { marginBottom: 6, marginTop: 12 }]}>Condition or notes (optional)</Text>
        <TextInput
          style={s.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Nike, Air Force 1, size 10, good condition"
          placeholderTextColor={C.text4}
          multiline numberOfLines={2}
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
      <CameraView style={{ flex: 1, position: "absolute" as any, top:0, left:0, right:0, bottom:0 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13","ean8","upc_a","upc_e","qr","code128","code39"] }}
        onBarcodeScanned={handleBarcode} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <View style={[s.camTop, { paddingTop: insets.top + 8 }]}>
            <View style={s.camLogoBadge}><Wordmark style={s.camLogoText}/></View>
            <TouchableOpacity onPress={() => setMode("photo")} style={s.camModeBtn}>
              <Text style={s.camModeBtnText}> Photo Mode</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {/* Clear mode label (per spec) - a first-timer landing on this
                screen (via the new control-row Barcode button) should never
                wonder which mode they're in. */}
            <View style={s.barcodeModeLabel}><Text style={s.barcodeModeLabelText}>Barcode</Text></View>
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
            {/* Barcode mode auto-scans on detection (no shutter to tap), so
                the photo-mode coach line doesn't apply here - this existing
                hint already says the one thing a first-timer needs ("point
                at any barcode"), so there's nothing to merge/compete with. */}
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
      <CameraView ref={cameraRef} style={{ flex: 1, position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {/* Top bar */}
          <View style={[s.camTop, { paddingTop: insets.top + 8 }]}>
            <View style={s.camLogoBadge}><Wordmark style={s.camLogoText}/></View>
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
          </View>
          {/* BARCODE ENTRY (2026-10-08, moved off the full-width banner
              into the control row below, same size/style as "Library" -
              see that row's Barcode button). A barcode scan still skips
              Vision/Claude identify entirely (app/api/lens/route.ts's upc
              short-circuit) and now runs the SAME price-basis hierarchy a
              photo scan does (lib/priceBasis.ts), with a real eBay GTIN-
              first search. */}
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
            {/* MEASURED BUG: "Snap 1-5 photos - more angles, better
                results." still didn't fully fit at narrow widths even with
                adjustsFontSizeToFit's floor (minimumFontScale 0.8 wasn't
                low enough to avoid ellipsis on an SE-width screen). Shorter
                copy first, per the sweep principle - not a smaller floor. */}
            {firstScanNudge ? (
              <View style={s.camHintCoachWrap}>
                <Text style={s.camHintCoachTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Snap 1–5 photos — more angles help.
                </Text>
              </View>
            ) : (
              <Text style={s.camHint} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                Snap 1–5 photos — more angles help.
              </Text>
            )}
          </View>

          {/* Captured-photo thumbnails - visible proof a shot registered,
              and confirmation there's still room for more (shutter stays
              live up to MAX_PHOTOS). Only takes screen space once there's
              something to show. */}
          {photos.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.camThumbRow}
              contentContainerStyle={s.camThumbRowContent}
            >
              {photos.map((p, i) => (
                <Image key={i} source={{ uri: `data:image/jpeg;base64,${p}` }} style={s.camThumb} />
              ))}
            </ScrollView>
          )}

          {/* Controls - "Next" now surfaces RIGHT HERE the moment there's at
              least one photo, where the user's eye already is after tapping
              the shutter. It routes to Review, NOT straight to analyze()
              directly - buy price (now the first, most prominent field on
              Review) is critical moat data and must never be skippable via
              a shortcut. Before any photo, this slot is an empty
              placeholder (shutter alone, unchanged). */}
          <View style={s.camControls}>
            <TouchableOpacity style={s.camSecondBtn} onPress={pickLibrary}>
              {/* MEASURED BUG: "Library" was clipping to "Libra..." - the
                  slot had a fixed width (84, tightened from 96 in the prior
                  pass to make room for the shutter-row action button), which
                  can't survive a larger device text-size setting. Content-
                  sized (minWidth only) so the label can never truncate,
                  regardless of system font scale. */}
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={s.camSecondLabel}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shutter} onPress={takePhoto}>
              <View style={s.shutterInner} />
              {photos.length > 0 && <View style={s.shutterBadge}><Text style={s.shutterBadgeTxt}>{photos.length}</Text></View>}
            </TouchableOpacity>
            {photos.length > 0 ? (
              <TouchableOpacity style={s.camNextBtn} onPress={() => setStep("review")} activeOpacity={0.85}>
                <Text style={s.camNextBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Next {"→"}
                </Text>
              </TouchableOpacity>
            ) : (
              // BARCODE (2026-10-08): same slot/size/style as Library -
              // "Library | shutter | Barcode" per spec. Only shown before
              // any photo is taken (once photos exist, this slot is "Next"
              // instead, same as before) - entering barcode mode mid-photo-
              // capture would discard those photos silently, so the control
              // simply isn't offered there.
              <TouchableOpacity style={s.camSecondBtn} onPress={() => setMode("barcode")}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={s.camSecondLabel}>Barcode</Text>
              </TouchableOpacity>
            )}
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
  camHint:        { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 14, fontWeight: "600", paddingHorizontal: 24, textAlign: "center" },
  // Same single instruction line as camHint, just wrapped in a highlighted
  // pill for a first-timer - the "coaching" is the styling, never a second
  // string, so it can never compete with the plain version above.
  camHintCoachWrap: { marginTop: 14, marginHorizontal: 30, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(168,230,61,0.14)", borderWidth: 1, borderColor: "rgba(168,230,61,0.4)", borderRadius: 14 },
  camHintCoachTxt:  { color: C.green, fontSize: 13.5, fontWeight: "700", textAlign: "center" },
  camThumbRow:        { maxHeight: 60, marginBottom: 6 },
  camThumbRowContent: { paddingHorizontal: 20, gap: 8, alignItems: "center" },
  camThumb:           { width: 46, height: 46, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  // MEASURED BUG: a fixed width (84, tightened from 96 in a prior pass)
  // clipped "Library" to "Libra..." once system text-size scaling pushed
  // its rendered width past that cap. minWidth instead of width - the
  // button still grows to whatever "Library" actually needs; the floor
  // just keeps the touch target (and the empty placeholder on the other
  // side of the shutter, before any photo) from collapsing to nothing.
  camSecondBtn: { minWidth: 64, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  camSecondLabel: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "600" },
  // The obvious next action once >=1 photo exists - lives in the same row
  // as the shutter (where the user's eye already is right after tapping
  // it). Routes to Review (buy price is critical moat data and must never
  // be skippable), not straight to analyze() - "Next", not "Analyze".
  camNextBtn:     { backgroundColor: C.green, borderRadius: 25, height: 50, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  camNextBtnText: { color: C.greenDark, fontSize: 15, fontWeight: "900" },
  libIcon: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  libIconTxt: { color: "#fff", fontSize: 24, fontWeight: "400", lineHeight: 28 },
  shutter:        { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner:   { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
  shutterBadge:   { position: "absolute", top: -4, right: -4, backgroundColor: C.green, borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  shutterBadgeTxt:{ color: "#000", fontSize: 13, fontWeight: "900" },
  doneBtn: { width: 72, height: 50, borderRadius: 25, backgroundColor: C.green, alignItems: "center", justifyContent: "center" },
  doneBtnTxt: { color: "#000", fontSize: 14, fontWeight: "900" },
  // paddingHorizontal tightened from 40 - the third slot now holds a
  // variable-width "Analyze (N) ->" button (was a fixed-width "Done"
  // label), which needs more of the row's width to stay comfortably clear
  // of the shutter without ever overflowing the screen edge.
  camControls: { paddingBottom: 48, paddingTop: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 26 },
  camBottomBar:   { paddingBottom: 40, paddingHorizontal: 24 },

  // Barcode,
  barcodeModeLabel:     { backgroundColor: "rgba(168,230,61,0.15)", borderWidth: 1, borderColor: "rgba(168,230,61,0.3)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, marginBottom: 18 },
  barcodeModeLabelText: { color: C.green, fontSize: 13, fontWeight: "800" },
  barcodeFrame:   { width: width * 0.8, height: 120, position: "relative", justifyContent: "center", alignItems: "center" },
  barcodeLine:    { width: "100%", height: 2, backgroundColor: C.green + "80" },

  // Review,
  photoThumb:     { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  removePhoto:    { position: "absolute", top: 4, right: 4, width: 20, height: 20, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addPhotoBtn:    { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  addPhotoBtnText:{ color: C.text4, fontSize: 10, marginTop: 4 },
  textInput:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, color: C.text1, fontSize: 14, minHeight: 72, textAlignVertical: "top" },
  scanBadge:      { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 12, alignSelf: "flex-start" },
  // Review's price field - deliberately the loudest input on the screen
  // (green border, 26pt digits) so it reads as THE primary field, not one
  // of three equally-weighted optional boxes.
  priceLabel:      { color: C.text2, fontSize: 13, fontWeight: "800", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  priceLowConfidenceHint: { color: C.yellow, fontSize: 11, marginBottom: 8, fontStyle: "italic" },
  // TAG CONFIRM GATE (2026-10-06) - same yellow-warning treatment as
  // tipCard below, sized as the primary above-the-fold element it replaces
  // (the price field) rather than a small inline hint.
  tagConfirmCard:   { backgroundColor: "#1a1200", borderWidth: 1.5, borderColor: C.yellow, borderRadius: 14, padding: 14, marginBottom: 12 },
  tagConfirmTitle:  { color: C.text1, fontSize: 16, fontWeight: "800", marginBottom: 4 },
  tagConfirmSource: { color: C.text3, fontSize: 12, fontStyle: "italic", marginBottom: 12 },
  tagConfirmRow:    { flexDirection: "row", gap: 10 },
  tagConfirmBtn:    { flex: 1, backgroundColor: C.yellow, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  tagConfirmBtnText:{ color: "#1a1200", fontSize: 14, fontWeight: "800" },
  tagEditBtn:       { flex: 1, borderWidth: 1.5, borderColor: C.yellow, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  tagEditBtnText:   { color: C.yellow, fontSize: 14, fontWeight: "800" },
  priceFieldWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: C.greenBg, borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 14, paddingHorizontal: 16 },
  priceFieldDollar:{ color: C.green, fontSize: 26, fontWeight: "800", marginRight: 4 },
  priceFieldInput: { flex: 1, color: C.text1, fontSize: 26, fontWeight: "700", paddingVertical: 14 },
  priceFieldHint:  { color: C.text4, fontSize: 11.5, fontWeight: "600", marginTop: 6 },

  // Result,
  goodBanner:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.greenBg, borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  goodBannerTitle:{ color: C.green, fontSize: 13, fontWeight: "800", marginBottom: 2 },
  goodBannerSub:  { color: C.text3, fontSize: 12 },
  // Fix 3 (2026-09-10): color/border set inline per-render from
  // outcome.accent (hot/solid=green, thin=yellow, skip=red, estimate=
  // yellow) - this base style only carries the fixed layout.
  // CROWD-BOX OVERFLOW FIX (2026-09-22): padding made explicitly symmetric
  // (paddingHorizontal, not a single `padding` shorthand easy to mis-edit
  // asymmetrically later) and a dedicated fixed-width icon column added
  // (rangeBannerIcon) so a long headline (worst case: the "Category trend —
  // ..." variant) wraps within the remaining flex:1 text column instead of
  // running past the right border. See the crowd-box render below for why
  // the real width-collapse was FlashHighlight's Animated.View sitting
  // between this row and the flex:1 text column with no flex of its own -
  // the flex:1 View now wraps FlashHighlight instead of the reverse.
  rangeBanner:      { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12 },
  rangeBannerIcon:  { width: 22, flexShrink: 0, alignItems: "center" },
  rangeBannerSub:   { color: C.text3, fontSize: 12, flexWrap: "wrap" },
  noDataBanner:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1a0808", borderWidth: 1, borderColor: C.red + "30", borderRadius: 12, padding: 12, marginBottom: 12 },
  noDataText:     { color: C.red, fontSize: 13, fontWeight: "700", flex: 1 },
  profitCard:     { backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 2, borderRadius: 20, padding: 20, marginBottom: 10, alignItems: "center" },
  profitLabel:    { color: C.text3, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  profitAmount:   { fontWeight: "900", letterSpacing: -2, lineHeight: 68, marginBottom: 6 },
  veloBadge: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 12, alignItems: "center" },
  veloText: { fontSize: 16, fontWeight: "800" },
    // "Sold one before?" - the log-a-PAST-flip action, visually a plain
    // button (not a card) so it reads lighter/less demanding than the
    // "not sold yet" card directly below it, which asks for a decision.
    soldRow:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.green+"40", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 },
    soldRowTitle: { color: C.text1, fontSize: 14, fontWeight: "800" },
    soldRowSub:   { color: C.green, fontSize: 12.5, fontWeight: "700", marginTop: 1 },
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
  debugLine:      { color: C.text4, fontSize: 11, lineHeight: 17, fontFamily: "monospace" as any },

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