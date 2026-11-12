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
import { markScanStage, clearScanStage } from "../lib/scanStage";
import { compressPhoto } from "../lib/image";
import { C } from "../lib/theme";
import Wordmark from "../components/Wordmark";
import HeaderLogo from "../components/HeaderLogo";
import ShareCard from "../components/ShareCard";
import { API_BASE, scanImage, getProfitOracle, shareWin, refineScan, emailFromToken, lookupUpcFast, scanBarcodeFast, updateScan, logEvent, logClientError, peekProfileData } from "../lib/api";
import ApiDebugPanel from "../components/ApiDebugPanel";
import ErrorBoundary from "../components/ErrorBoundary";
import { deriveTagConfirmPending, confirmTagRead, editTagRead } from "../lib/tagConfirmState";
import { shouldPatchSettledVerdict, settleSignature, type BuyPriceSource } from "../lib/scanSettleState";
import { buildSavedScanView } from "../lib/viewSavedScan";
import { scheduleSaleCheckIn, requestNotificationPermission } from "../lib/notifications";
import StagedProgress from "../components/StagedProgress";
import * as Notifications from "expo-notifications";
import { matchSpecialtyCategory } from "./SpecialtyScreen";
import ProfitFlexHero from "../components/ProfitFlexHero";
import FlashHighlight from "../components/FlashHighlight";
import SegmentOutcomesBlock from "../components/SegmentOutcomesBlock";
import { classifyOutcome, ROI_BUY_MIN, MAX_BUY_PROFIT_FLOOR, classifyHeroVerdictLocal, decisionFromVerdict, type HeroVerdict } from "../lib/outcomeTier";
import LogSaleModal from "../components/LogSaleModal";
import { toPendingScan } from "../lib/saleCapture";
import { CONDITION_OPTIONS, CONDITION_TO_DB } from "../lib/condition";
import { evaluateReview, requestReviewIfEligible, REVIEW_PROMPT_DELAY_MS, ReviewDebugState } from "../lib/storeReview";
import RevealScreen from "../components/RevealScreen";

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
  // HISTORY RESULTS REUSE (2026-10-25): { viewScan: <scans row> } opens this
  // screen straight onto the results step for an already-saved scan - no
  // camera, no review, no analyze() call - instead of the normal camera-
  // first mount. The ONE route param both HistoryScreen's new "View result"
  // button and ScanConfirmScreen's confirmAndRerun use (see
  // lib/viewSavedScan.ts) - this screen remounts fresh every time it
  // becomes the active tab (App.tsx renders SCREENS[screen], one at a time),
  // so reading this once at mount is enough; nothing here needs to react to
  // it changing while already mounted.
  navData?: { viewScan?: any } | null;
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

export default function ScannerScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onLogout, firstScanNudge, onDismissFirstScanNudge, navData }: Props) {
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
  // BUY-PRICE SOURCE (2026-10-25, STALE-STATE FIX: seven real Walmart scans,
  // three saved REJECTED tag reads as buy_price): tracks WHY buyPrice holds
  // whatever it currently holds - "tag" only when the user explicitly
  // tapped "Confirm $X" or a confident tag read auto-seeded it untouched
  // (the ORIGINAL, still-intended PATCH-ON-SETTLE behavior below), "user"
  // the instant they type/edit the field themselves, null after "Edit"
  // (reject) until something real replaces it. See lib/scanSettleState.ts -
  // the PATCH-on-settle effect below refuses to persist buyPrice at all
  // once this is null, so a rejected-then-abandoned or merely-suggested
  // read can never reach the stored row.
  const [buyPriceSource, setBuyPriceSource] = useState<BuyPriceSource>(null);
  // HISTORY RESULTS REUSE: true for the whole time this mount is showing a
  // SAVED scan's result (navData.viewScan - see the load effect below and
  // lib/viewSavedScan.ts), covering both HistoryScreen's "View result"
  // button and a just-completed Edit & Re-run landing here instead of
  // bouncing back to History. false for a normal camera-first mount.
  // Read by: the back chevron (goes to History instead of the camera/review
  // step), the Oracle fetch effect (skipped entirely - BUG 2's "no API
  // call, no credits used" requirement), and the PATCH-on-settle effect via
  // savedViewBaselineRef below.
  const [viewingSavedScan, setViewingSavedScan] = useState(false);
  // Snapshot of the EXACT (buyPrice, buyPriceSource, resultCondition) this
  // saved view loaded with - null for a normal fresh-scan mount. The PATCH-
  // on-settle effect skips its debounced write entirely while the live
  // state still matches this baseline: just OPENING a saved result (or
  // landing here right after a re-run that already persisted these same
  // values) must never fire a redundant PATCH - only a genuine edit (price
  // typed, condition changed) that moves state away from the baseline may.
  const savedViewBaselineRef = useRef<{ buyPrice: string; buyPriceSource: BuyPriceSource; resultCondition: string } | null>(null);
  // SCAN ATTEMPT GUARD (2026-10-25): bumped at the start of every analyze()/
  // handleBarcode() call AND on reset() - finishAnalyze bails immediately
  // if its own attempt number no longer matches this, i.e. the user has
  // already started (or abandoned into) a DIFFERENT scan before this one's
  // network response landed. "Every PATCH must target the scan id returned
  // by THAT scan's own response; ignore a late response for a previous
  // scan" - this is what makes that literally true: a late response can
  // never even reach setResult/setBuyPrice for a scan the user has moved
  // on from, so latestVerdictRef/lastPatchedRef below can never be fed a
  // stale (scanId, buyPrice) pair that didn't come from the CURRENT scan.
  const scanAttemptRef = useRef(0);
  // LAST-SENT PHOTOS (2026-11-08, crash-trip memory audit): a snapshot of
  // the full photo set a scan actually uploaded - captured in
  // finishAnalyze right before `photos` state itself gets trimmed down to
  // just photos[0] (see that trim's own comment). Exists ONLY so "Edit &
  // Rerun" (the result screen's pencil icon) can restore the full set when
  // the user explicitly asks to go back and add more photos/details - the
  // one real case that still needs more than the single display thumbnail
  // after a scan completes.
  const lastSentPhotosRef = useRef<string[]>([]);
  // Pending lib/scanStage.ts timers (see analyze()'s own comment) - cleared
  // whenever a NEWER attempt supersedes them, or the real response lands
  // first, so a stale timer can never overwrite a later scan's own stage.
  const scanStageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // PATCH-ON-SETTLE (2026-10-12, MEASURED: the owner's 9 real Walmart scans
  // all stored buy_price=0/decision=UNKNOWN in production - this screen
  // already auto-fills buyPrice from a confident tag read and recomputes a
  // real local verdict instantly, see the result-step render's "ONE VERDICT
  // SOURCE" block below, but NOTHING ever wrote that back to the scans row;
  // it only ever lived in this component's state). Holds whatever that
  // render-time block most recently computed - written there every render
  // (a ref write during render, not a hook - see its own comment), read by
  // the debounced effect below, which is the one place this actually gets
  // persisted.
  const latestVerdictRef = useRef<{ scanId: string | null; buyPrice: number; buyPriceSource: BuyPriceSource; netProfit: number | null; roi: number | null; decision: string } | null>(null);
  // Last signature actually PATCHed, so re-settling on the SAME price/
  // verdict (e.g. a re-render with no real change) never fires a redundant
  // network call.
  const lastPatchedRef = useRef<string>("");
  // CONDITION SETTLE (2026-11-06, item 1 reopen bug): the buy-price settle
  // effect above never sent `condition`, so a chip tap only ever lived in
  // this component's state - buildSavedScanView's reopen path (lib/
  // viewSavedScan.ts) always rebuilds resultCondition from the scan's
  // ORIGINAL specialty_data.conditionAssessment, silently discarding any
  // tap the instant the owner left History and came back. Independent of
  // the buy-price provenance gate on purpose - a condition pick needs no
  // "was this really typed/confirmed" proof the way a price does. Merges
  // conditionAssessment into the SAME specialty_data blob already on this
  // row (every other field, including the real photosSent/cosmetic
  // `condition` the server's zero-photo-rerun guard checks, is passed
  // through unchanged) so the next reopen reads back the exact chip value,
  // not a lossy New/Good/Fair round-trip through the old DB column.
  const lastPatchedConditionRef = useRef<string>("");
  // Whatever resultCondition was SEEDED with (fresh scan's conditionAssessment,
  // or a reopened scan's) - the settle effect below only fires once the
  // owner's tap actually moves resultCondition away from this, never on the
  // initial seed/mount itself.
  const conditionBaselineRef = useRef<string>("");
  const priceInputRef = useRef<TextInput>(null);
  // STORE REVIEW PROMPT: reviewHeadlineRef captures THIS render's hero
  // headline (SOLID/WORTH A LOOK only, else null) for the effect below to
  // read after commit - the headline itself is computed deep inside the
  // step==="result" render block (depends on buyPrice/resultCondition/
  // result, same inputs as the PARITY-tracked verdict math above it), not
  // something a hook can read without duplicating that whole computation.
  // Written during render (plain JS, not state) - see the RESULT-SCREEN
  // HERO VERDICT block below for where it's set. reviewPromptedKeyRef
  // guards against re-firing on every keystroke while editing price once a
  // scan has already resolved into a qualifying tier once.
  const reviewHeadlineRef = useRef<{ scanKey: string | null; headline: "SOLID" | "WORTH A LOOK" | null }>({ scanKey: null, headline: null });
  const reviewPromptedKeyRef = useRef<string | null>(null);
  const [reviewDebug, setReviewDebug] = useState<ReviewDebugState | null>(null);
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
  // HISTORY RESULTS REUSE (BUG 1 + BUG 2): opens straight onto the results
  // step for navData.viewScan instead of the normal camera-first mount -
  // see lib/viewSavedScan.ts and this screen's navData Props comment. Mount-
  // only ([] deps): this component remounts fresh every time it becomes the
  // active tab (App.tsx renders SCREENS[screen], one screen node at a time),
  // so navData is whatever the navigate() call that brought us here passed,
  // for the lifetime of this mount - nothing here needs to react to it
  // changing while already mounted, and nothing else may write it.
  useEffect(() => {
    const viewScan = navData?.viewScan;
    if (!viewScan) return;
    setViewingSavedScan(true);
    const built = buildSavedScanView(viewScan);
    if (!built) {
      // BUG 2, rule: "if a saved result is missing or can't be shown, show
      // a short message offering Re-run" - _savedScanUnavailable/_savedScan
      // are read by the step==="result" error branch below, which renders
      // that message instead of the generic "Scan Failed/Try Again" copy
      // (there is no camera retry to offer here - there was never a fresh
      // scan attempt to retry).
      setResult({ _error: "Couldn't load this saved result.", _savedScanUnavailable: true, _savedScan: viewScan });
      setStep("result");
      return;
    }
    setResult(built.result);
    setBuyPrice(built.buyPrice);
    setBuyPriceSource(built.buyPriceSource);
    setResultCondition(built.resultCondition);
    conditionBaselineRef.current = built.resultCondition;
    // PHOTO (item 7) - see lib/viewSavedScan.ts's SavedScanView.photoBase64
    // comment. `photos` is otherwise only ever populated by this screen's
    // own camera-capture flow, which a saved-view mount never runs.
    setPhotos(built.photoBase64 ? [built.photoBase64] : []);
    setTagConfirmPending(false);
    // Nothing to re-confirm on a saved/already-settled scan - re-asking
    // "is this what you read off the tag?" for a past result makes no sense
    // (see deriveTagConfirmPending's own callers, all fresh-scan-only).
    savedViewBaselineRef.current = { buyPrice: built.buyPrice, buyPriceSource: built.buyPriceSource, resultCondition: built.resultCondition };
    latestVerdictRef.current = null;
    lastPatchedRef.current = "";
    lastPatchedConditionRef.current = "";
    setStep("result");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // PATCH-ON-SETTLE: persists whatever the result-step render most recently
  // computed (latestVerdictRef, written during render - see its own
  // comment) back to the stored scans row, debounced 900ms after price/
  // condition stop changing so a redundant PATCH doesn't fire per keystroke.
  // Fires for EVERY buyPrice>0 state, not just a manual edit - that's
  // deliberate: a confident tag read auto-seeds buyPrice with nobody
  // touching anything (see finishAnalyze's setBuyPrice seed), and that was
  // exactly the real-world case (6 of the owner's 9 Walmart scans) that
  // never got persisted before this existed.
  useEffect(() => {
    if (step !== "result" || !result || result._error) return;
    // HISTORY RESULTS REUSE (BUG 2 - "no API call, no credits used" for
    // just OPENING a saved result): still exactly matches what this view
    // loaded with (or what a just-completed re-run already persisted) -
    // nothing to settle, so don't even start the debounce timer. The
    // instant the user actually edits price/condition this stops matching
    // and the normal settle/PATCH behavior below takes over unchanged.
    const baseline = savedViewBaselineRef.current;
    if (baseline && baseline.buyPrice === buyPrice && baseline.buyPriceSource === buyPriceSource && baseline.resultCondition === resultCondition) {
      return;
    }
    const timer = setTimeout(() => {
      const v = latestVerdictRef.current;
      // shouldPatchSettledVerdict (lib/scanSettleState.ts) is the ONE gate:
      // requires a real scanId, a positive buyPrice, AND a real source
      // (user-typed or user-confirmed) - a rejected or merely-suggested
      // read can never reach this PATCH, see buyPriceSource's own comment.
      if (!v || !shouldPatchSettledVerdict(v, lastPatchedRef.current)) return;
      lastPatchedRef.current = settleSignature(v);
      updateScan(token, v.scanId!, {
        buy_price: v.buyPrice,
        buy_price_source: v.buyPriceSource,
        net_profit: v.netProfit,
        roi: v.roi,
        decision: v.decision,
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [step, result, buyPrice, resultCondition, buyPriceSource, token]);
  useEffect(() => {
    if (step !== "result" || !result || result._error || !resultCondition) return;
    const scanId = (result.id ?? result.scanId ?? result.scan_id) != null ? String(result.id ?? result.scanId ?? result.scan_id) : null;
    if (!scanId) return;
    const sig = `${scanId}:${resultCondition}`;
    if (lastPatchedConditionRef.current === sig) return;
    if (lastPatchedConditionRef.current === "" && resultCondition === conditionBaselineRef.current) return;
    const timer = setTimeout(() => {
      lastPatchedConditionRef.current = sig;
      updateScan(token, scanId, {
        condition: CONDITION_TO_DB[resultCondition],
        specialty_data: JSON.stringify({ ...result, conditionAssessment: resultCondition }),
      }).then((resp: any) => {
        // APPLY THE SERVER'S AUTHORITATIVE RECOMPUTE (2026-11-09, ZURU
        // rejection follow-up) - the specialty_data this PATCH just sent
        // was THIS screen's own (possibly pre-fix, stale-embedded-numbers)
        // `result` object; the server's recompute (lib/scanRecompute.ts,
        // now carrying the segment-confidence/thin-sample withholding
        // rules) is the honest answer. Without this, `result.buyTarget`/
        // `result.netProfit`/`result.decision` would keep whatever this
        // screen's OWN local recompute never touches (it only ever reads
        // these for the owner-only dev mismatch tripwire and the saved
        // specialty_data blob - see that code's own comments) - applying
        // the response here closes that gap instead of leaving it for
        // whatever future code path might read them directly.
        // STALE-STATE GUARD: only merge if `result` (at resolution time)
        // is still THIS same scan - a late response landing after the
        // user has moved on (New Scan, a different saved scan) must never
        // write into whatever is on screen now. Guarded throughout (`?.`/
        // `??`) so a response shape from an older server build, or a
        // network hiccup leaving `scan` absent, can never throw here.
        const scan = resp?.scan;
        if (!scan) return;
        setResult((r: any) => {
          const currentScanId = r ? String(r.id ?? r.scanId ?? r.scan_id ?? "") : null;
          if (!r || currentScanId !== scanId) return r;
          return {
            ...r,
            buyTarget: scan.buy_target ?? null,
            netProfit: scan.net_profit ?? null,
            roi: scan.roi ?? null,
            decision: scan.decision ?? r.decision,
          };
        });
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [step, result, resultCondition, token]);
  useEffect(() => {
    let alive = true;
    setOracle(null);
    // HISTORY RESULTS REUSE (BUG 2 - "no API call, no credits used"): the
    // Oracle fetch only ever feeds ShareCard's off-screen share image (see
    // its own comment a few lines down) - nothing this screen actually
    // DISPLAYS reads it. Skipped entirely while viewing a saved result, so
    // opening one from History (or landing here after a re-run, which
    // already made its own real network call) never makes a second,
    // unnecessary one.
    if (viewingSavedScan) return;
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
  }, [result, buyPrice, viewingSavedScan]);
  // STORE REVIEW - ACTUAL TRIGGER: fires once per scan the moment its hero
  // headline first resolves to SOLID or WORTH A LOOK (never on PASS/THIN/
  // ai_only - reviewHeadlineRef.current.headline is null for all of those,
  // see where it's set below). 1.5s after that render commits (ONBOARDING/
  // ERROR exclusion is automatic: this never runs outside step==="result"
  // with a non-error result).
  useEffect(() => {
    // HISTORY RESULTS REUSE (BUG 2 - "no API call, no credits used"):
    // requestReviewIfEligible calls getScanCount (a real network call) and,
    // when eligible, opens the NATIVE review modal and stamps last-asked -
    // none of that may ever fire from just reopening a past result, which
    // would otherwise re-prompt for a review (or spend a network call)
    // every time someone revisits a SOLID/WORTH A LOOK item in History.
    if (step !== "result" || viewingSavedScan) return;
    const snap = reviewHeadlineRef.current;
    if (!snap.headline || !snap.scanKey) return;
    if (reviewPromptedKeyRef.current === snap.scanKey) return;
    reviewPromptedKeyRef.current = snap.scanKey;
    const timer = setTimeout(() => {
      requestReviewIfEligible(token, "verdict").then(setReviewDebug);
    }, REVIEW_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step, result, buyPrice, resultCondition, token, viewingSavedScan]);
  // STORE REVIEW - OWNER-ONLY LIVE READOUT: side-effect-free re-evaluation
  // (never opens the real modal, never writes last-asked) so isOwner can
  // see eligible/failing-condition/last-asked on the result screen at any
  // time, not only in the instant the real trigger above actually fires.
  // Still a real getScanCount network call though (see evaluateReview's own
  // comment) - same "no API call" reasoning as the trigger effect above
  // applies while viewing a saved result.
  useEffect(() => {
    if (!isOwner || step !== "result" || result?._error || viewingSavedScan) return;
    evaluateReview(token, "verdict").then(setReviewDebug);
  }, [isOwner, step, result, token, viewingSavedScan]);
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
  // CRASH HARDENING (2026-11-10, proof-screen): bumped only by the result
  // screen's own top-level ErrorBoundary's "Try again" below - remounts
  // JUST that boundary + its subtree (a fresh ErrorBoundary instance means
  // hasError resets to false) while every piece of real scan state
  // (result/buyPrice/resultCondition/photos, all plain hooks on THIS
  // component, untouched by a child subtree remounting) survives
  // completely - "Try again" re-renders the identical screen, it doesn't
  // restart the scan.
  const [resultBoundaryKey, setResultBoundaryKey] = useState(0);
  // SHARE REVEAL (2026-11-11): available on every scan, not just a BUY -
  // see the "Share reveal" button's own comment below for why.
  const [revealOpen, setRevealOpen] = useState(false);

  function reset() {
    setStep("camera");
    setResult(null);
    scanStageTimersRef.current.forEach(clearTimeout);
    scanStageTimersRef.current = [];
    clearScanStage();
    setPhotos([]); setWinShared(false);
    setDescription("");
    setBrandInput("");
    setBuyPrice("");
    setResultCondition("");
    conditionBaselineRef.current = "";
    setBarcodeScanned(false);
    setMode("photo");
    compressMsTotalRef.current = 0;
    // STALE-STATE FIX: every piece of state that could otherwise survive
    // into the NEXT scan is cleared here, not just the ones that happen to
    // feed this screen's own render. tagConfirmPending/buyPriceSource are
    // real-state (not derived from `result`), so without this they'd carry
    // whatever the PREVIOUS scan left them at for one frame of the next
    // scan's "loading" step. latestVerdictRef/lastPatchedRef are refs, not
    // state - a reset alone wouldn't even trigger a re-render for them, so
    // they're cleared directly. scanAttemptRef bump invalidates any
    // still-in-flight request for the scan being abandoned - see that
    // ref's own comment.
    setTagConfirmPending(false);
    setBuyPriceSource(null);
    latestVerdictRef.current = null;
    lastPatchedRef.current = "";
    lastPatchedConditionRef.current = "";
    scanAttemptRef.current++;
    // HISTORY RESULTS REUSE: "New Scan" from a saved-result view abandons
    // that view entirely - without this, the just-cleared result/buyPrice
    // state would still be treated as "viewing a saved scan" (no Oracle
    // fetch, PATCH-on-settle still comparing against the old baseline) for
    // whatever the user scans next.
    setViewingSavedScan(false);
    savedViewBaselineRef.current = null;
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    markScanStage("capture");
    // WRAPPED (2026-11-08, crash-trip audit): a native capture/compress
    // failure used to be an unhandled rejection with no user-facing
    // feedback at all (stuck on the camera screen) - now surfaces the
    // SAME "Scan Failed / Try Again" screen every other stage's own
    // try/catch already shows, instead of silently doing nothing.
    try {
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
    } catch (e: any) {
      clearScanStage();
      setResult({ _error: e?.message || "Couldn't capture that photo." });
      setStep("result");
    }
  }

  async function pickLibrary() {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    // WRAPPED (2026-11-08, crash-trip audit) - same reasoning as
    // takePhoto's own try/catch.
    try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], base64: true, quality: 0.7,
      allowsMultipleSelection: true, selectionLimit: remaining,
    });
    if (res.canceled || !res.assets?.length) return;
    markScanStage("capture");
    const picked = res.assets.slice(0, remaining);
    // startIndex: where these land in the FINAL photos array - only the
    // one that ends up at overall index 0 is "primary".
    // SEQUENTIAL, NOT PARALLEL (2026-11-08, crash-trip memory audit,
    // reverted from a 2026-10 change that made this a Promise.all batch):
    // expo-image-manipulator decodes each full-res source image into
    // native memory to resize it - running that for every picked photo AT
    // ONCE multiplies peak memory by however many the user selected,
    // right as the app is also about to hold all of them in JS state for
    // upload. One at a time bounds peak memory to a single photo's decode,
    // regardless of selectionLimit.
    const startIndex = photos.length;
    const _ct0 = Date.now();
    const compressed: string[] = [];
    for (let i = 0; i < picked.length; i++) {
      const a = picked[i];
      if (!a.base64) continue;
      const c = await compressPhoto(a.base64, a.width, a.height, startIndex + i === 0 ? "primary" : "secondary");
      compressed.push(c);
    }
    // Wall-clock time of the whole sequential batch.
    compressMsTotalRef.current += Date.now() - _ct0;
    if (compressed.length) {
      setPhotos(p => [...p, ...compressed].slice(0, MAX_PHOTOS));
      setStep("review");
    }
    } catch (e: any) {
      clearScanStage();
      setResult({ _error: e?.message || "Couldn't load those photos." });
      setStep("result");
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
    // STALE-STATE FIX: a new scan attempt - see scanAttemptRef's own
    // comment. Everything that could leak from the PREVIOUS scan is
    // cleared here too, not just on "New Scan" - a barcode scan started
    // right after a photo scan's result (without ever tapping "New Scan")
    // is the exact fast-aisle-scanning pattern that produced the real bug.
    const myAttempt = ++scanAttemptRef.current;
    setBuyPrice("");
    setResultCondition("");
    conditionBaselineRef.current = "";
    setTagConfirmPending(false);
    setBuyPriceSource(null);
    latestVerdictRef.current = null;
    lastPatchedRef.current = "";
    lastPatchedConditionRef.current = "";
    const tDetect = Date.now();
    try {
      const lookup = await lookupUpcFast(token, data);
      const detectToLookupMs = Date.now() - tDetect;
      // NOT FOUND (per spec): no guessing - tell the user plainly and drop
      // back to photo mode rather than attempting a scan with nothing real
      // to identify it from.
      if (!lookup.success || !lookup.itemName) {
        if (myAttempt !== scanAttemptRef.current) return;
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
      await finishAnalyze(d, [], true, myAttempt);
    } catch (e: any) {
      clearScanStage();
      if (myAttempt !== scanAttemptRef.current) return;
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
    conditionBaselineRef.current = "";
    // STALE-STATE FIX: see scanAttemptRef's own comment - finishAnalyze
    // below bails if a NEWER analyze()/handleBarcode()/reset() has already
    // superseded this one by the time the network response lands, so a
    // late response for this scan can never write into state for whatever
    // scan the user has since moved on to. tagConfirmPending/buyPriceSource/
    // the PATCH refs are cleared here too, same reasoning as reset() - this
    // function is reached on every "Edit & Rerun" re-analyze, which (unlike
    // reset()) was NOT previously clearing any of these.
    const myAttempt = ++scanAttemptRef.current;
    setTagConfirmPending(false);
    setBuyPriceSource(null);
    latestVerdictRef.current = null;
    lastPatchedRef.current = "";
    lastPatchedConditionRef.current = "";
    let photosForRefine: string[] = [];
    try {
      const p = customPhotos || photos;
      if (!p.length && !description && !brandInput) {
        setStep("review"); return;
      }
      photosForRefine = p;
      // SCAN STAGE MARKER (2026-11-08, crash-trip audit, no crash reporter
      // in this app) - "upload" now, with best-guess "identify"/"price"
      // transitions timed off the SAME ms budgets the loading screen's own
      // StagedProgress steps use (5000ms "Uploading", 3000ms "Identifying")
      // - approximate, not server-confirmed (see lib/scanStage.ts's own
      // header), but the best signal available for "which stage was this
      // scan in" if the app never comes back to clear it.
      markScanStage("upload");
      scanStageTimersRef.current.forEach(clearTimeout);
      scanStageTimersRef.current = [
        setTimeout(() => markScanStage("identify"), 5000),
        setTimeout(() => markScanStage("price"), 8000),
      ];
      // No price is ever collected pre-scan any more - the scan itself is
      // what reads the price tag (retailPriceRead). See the results step
      // below for where a price is now entered/edited.
      const d = await scanImage(token, p, (brandInput ? "Brand: " + brandInput + ". " : "") + description, undefined, compressMsTotalRef.current);
      scanStageTimersRef.current.forEach(clearTimeout);
      scanStageTimersRef.current = [];
      await finishAnalyze(d, photosForRefine, false, myAttempt);
    } catch (e: any) {
      scanStageTimersRef.current.forEach(clearTimeout);
      scanStageTimersRef.current = [];
      // A caught error is a CLEAN failure (the app handled it, didn't
      // crash) - clear the marker so it's never mistaken for a suspected
      // crash on next launch.
      clearScanStage();
      if (myAttempt !== scanAttemptRef.current) return;
      setResult({ _error: e.message });
      setStep("result");
    }
  }
  // SHARED RESULT HANDLING (2026-10-08 extraction): the photo path
  // (analyze, above) and the barcode fast path (handleBarcode) both land
  // here once `d` (the /api/lens response) is in hand - one place decides
  // what happens with a finished scan result regardless of which path
  // produced it, so the two can never silently diverge in post-processing.
  // `attempt` is this call's scanAttemptRef snapshot (from analyze()/
  // handleBarcode()) - a STALE-STATE GUARD: if the user has already started
  // (or abandoned into) a different scan since this request went out,
  // scanAttemptRef has moved on and this response is a "late response for a
  // previous scan" that must be ignored outright, never merged into
  // whatever IS currently on screen.
  async function finishAnalyze(d: any, photosForRefine: string[], isBarcode: boolean, attempt: number) {
    if (attempt !== scanAttemptRef.current) return;
    if (d.error === "scan_limit_reached") {
      onNavigate("upgrade");
      return;
    }
    if (!d.success) throw new Error(d.error || "Analysis failed");
    // A clean result - clear the scan-stage marker (lib/scanStage.ts).
    clearScanStage();
    setResult(d);
    setRefineSeq(0);
    // DROP UPLOADED SECONDARY PHOTOS FROM STATE (2026-11-08, crash-trip
    // memory audit): the upload is done - only photos[0] is ever read
    // again on the result screen itself (ProfitFlexHero's photoBase64
    // prop), so a scan with 2-5 photos no longer needs to hold the rest in
    // React state through the entire "identify -> price -> result"
    // lifecycle. `photosForRefine` (this function's own param, a local
    // closure over the pre-trim array, not this state) still carries the
    // full set to the deferred background refine call below - trimming
    // state here doesn't touch that. lastSentPhotosRef keeps the full set
    // reachable for "Edit & Rerun" (see its own comment) - the one UI path
    // that still needs more than photos[0] after this point.
    lastSentPhotosRef.current = photosForRefine;
    setPhotos(p => p.length > 1 ? [p[0]] : p);
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
          // STALE-STATE GUARD: a late refine response for a scan the user
          // has already moved on from (new scan started before this
          // fire-and-forget call settled) must never merge into whatever
          // IS on screen now - prev.id===d.id alone already prevented it
          // landing on a DIFFERENT scan's result object, but attempt is
          // checked too so it also can't resurrect THIS exact scan's state
          // after a "New Scan" reset that's since moved past it.
          if (attempt !== scanAttemptRef.current) return;
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
    const confidentTagRead = Number(d.retailPriceRead) > 0 && !d.retailPriceNeedsConfirmation;
    setBuyPrice(confidentTagRead ? String(d.retailPriceRead) : "");
    // BUY-PRICE SOURCE: a confident auto-seed counts as "tag" (this is the
    // one intentionally-automatic case PATCH-ON-SETTLE exists for - see its
    // own comment) - null otherwise (no price, or a low-confidence read
    // withheld pending the user's own Confirm/Edit tap below).
    setBuyPriceSource(confidentTagRead ? "tag" : null);
    setTagConfirmPending(deriveTagConfirmPending(d));
    // PACKAGING CUE OVERRIDE REMOVED (item 1, owner phone bug, fix/reopen-
    // and-copy): deal-ai-pro's lib/lensPricing.ts (resolveEffectiveCondition)
    // now resolves the sealed-packaging override SERVER-side, once, before
    // conditionTier/pricing run and before specialty_data is persisted -
    // d.conditionAssessment already IS "new-in-box" whenever d.conditionHint
    // said sealed. Re-deriving it here too used to be the bug: this client
    // override only ever changed what was DISPLAYED, never what got priced
    // or saved, so a reopened scan showed a different condition (and a
    // different sample pool/headline) than the fresh one did. Trusting the
    // server's own field directly is what makes reopen match fresh exactly.
    setResultCondition(d.conditionAssessment || "");
    conditionBaselineRef.current = d.conditionAssessment || "";
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
    <SafeAreaView style={s.safe} edges={["top","left","right"]}>
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
    <SafeAreaView style={s.safe} edges={["top","left","right"]}>
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
    <SafeAreaView style={s.safe} edges={["top","left","right"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text style={{ fontSize: 52, textAlign: "center", marginBottom: 16 }}></Text>
        <Text style={[s.h1, { textAlign: "center" }]}>Free scans used up</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 24 }]}>
          Serious resellers scan 50-100 items per run. Seller gets you 30 scans a month; Pro and up are unlimited.
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
    if (result?._error) {
      // HISTORY RESULTS REUSE (BUG 2 - "missing or can't be shown" saved
      // result): a distinct message + action from the generic scan-failure
      // copy below - there was never a fresh scan attempt here to retry,
      // so "Try Again"/reset() (back to the camera) would be meaningless.
      // Offers Re-run instead, same screen ScanConfirmScreen's own Edit
      // entry point uses, and Back goes straight to History (no camera/
      // review step was ever entered on this mount).
      if (result._savedScanUnavailable) return (
        <SafeAreaView style={s.safe} edges={["top","left","right"]}>
          <View style={s.nav}>
            <TouchableOpacity onPress={() => onNavigate("history")} style={s.navBack}><Text style={s.navBackText}>{"\u2039"}</Text></TouchableOpacity>
            <HeaderLogo textStyle={s.logoText}/>
          </View>
          <View style={s.center}>
            <Text style={s.h2}>Couldn't load this result</Text>
            <Text style={[s.body, { textAlign: "center" }]}>This scan's saved details are missing or unreadable. Re-run it to get a fresh result.</Text>
            <TouchableOpacity style={[s.greenBtn, { marginTop: 24 }]} onPress={() => onNavigate("scan-confirm", { scan: result._savedScan })}>
              <Text style={s.greenBtnText}>Re-run</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
      return (
        <SafeAreaView style={s.safe} edges={["top","left","right"]}>
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
    }

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
    // TIER GATE WIDENED (item 2, owner phone bug, blanket scan): confirmedByMoat
    // only ever flags item_moat (tier 2) - a comparable_range (tier 4) scan,
    // which this blanket hit, left resaleIsAuthoritative true and this card's
    // hero silently fell back to resaleFromModel*conditionFactor (the AI's
    // PRE-tier anchor, $32) instead of the server's real comparable_range
    // median (result.sellPrice, $30) - the exact hero-vs-basis mismatch. Any
    // real tier (priceBasisTier !== "ai_only") means the server already
    // picked the authoritative number; only a genuine ai_only scan has no
    // server price to defer to.
    const resaleIsAuthoritative = !result.confirmedByMoat && (!result.priceBasisTier || result.priceBasisTier === "ai_only");
    const hasRawModelResale = Number(result.resaleFromModel) > 0 && resaleIsAuthoritative;
    const conditionFactor = CONDITION_MULTIPLIER[resultCondition] ?? DEFAULT_CONDITION_MULTIPLIER;
    const adjustedResaleValue = hasRawModelResale
      ? Math.round(Number(result.resaleFromModel) * conditionFactor)
      : (Number(result.sellPrice) || Number(result.estimatedResaleValue) || 0);
    // RANGE (item 2, 2026-10-25): the old adjustedResaleLow/High (this same
    // condition-multiplied AI anchor's own low/high) used to drive the
    // range banner and the no-price copy's "(range $X-$Y)" clause - both
    // gone now. "Show the range only from the server's priceLow/priceHigh
    // and never an AI range" - see serverPriceLow/serverPriceHigh/
    // hasServerRange further down, the only range source this screen reads
    // from any more.

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
    // PLAN GATING (2026-10-21): the server already sent buyTarget/
    // buyTargetState/netProfit/roi/detectedTagPrice/buyPriceSource as null
    // for a free plan (app/api/lens/route.ts's gateResponseForPlan) - this
    // flag is what stops the LOCAL recompute below from quietly rebuilding
    // the exact same numbers client-side from ungated inputs (sellPrice/
    // feeRate/shippingCost are never gated, so this recompute would
    // otherwise defeat the server-side gate entirely for any free user who
    // typed a price).
    const locked: string[] = result.locked || [];
    const maxBuyLocked = locked.includes("maxBuy");

    const sellPriceForProfit = Math.round(adjustedResaleValue || Number(result.sellPrice) || 0);
    // PLANNING PRICE (2026-10-25 SERVER CONTRACT): the server's own,
    // deliberately conservative figure to plan a BUY decision against -
    // separate from sellPriceForProfit above (the headline "typical recent
    // sale" DISPLAY price). planningBasis says which basis produced it:
    // "low end of recent sales" or "typical sale" (the two coincide
    // whenever the typical sale price IS the conservative choice, in which
    // case the display never bothers distinguishing them - see
    // showTypicalSaleLabel below). Falls back to sellPriceForProfit for a
    // response that predates this field - never silently 0 when a real
    // headline price exists. EVERY profit-math formula below (heroProfit,
    // the max-buy ceiling) reads planningPrice, NEVER sellPriceForProfit -
    // the bug this closes is the local recompute using the headline/AI
    // price for money math instead of the server's own planning basis.
    const planningBasis: string | null = result.planningBasis || null;
    const planningPrice = Number(result.planningPrice) > 0
      ? Math.round(Number(result.planningPrice))
      : sellPriceForProfit;
    // LOCAL RECOMPUTE (2026-09-10, items 8/9): mirrors lib/profitMath.ts's
    // computeProfit exactly - fees = round(sp*feeRate*100)/100, netProfit =
    // round((sp-fees-cost)*100)/100 - so editing price or condition here
    // reproduces exactly what a fresh scan at those values would have
    // shown, without a network round trip. REPLACES reading
    // result.netProfit directly - that was computed against whatever price
    // existed AT SCAN TIME, almost always none now that price lives here
    // instead of before the scan.
    const localFees = Math.round(planningPrice * feeRate * 100) / 100;
    const heroProfit = (!maxBuyLocked && enteredBp > 0) ? Math.round((planningPrice - localFees - enteredBp - shippingCost) * 100) / 100 : 0;

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
    // SHIPPING-AWARE, FLOORED AT 0 (2026-10-19, MEASURED) - mirrors deal-
    // ai-pro/lib/profitMath.ts's computeMaxBuy identical fix: this used to
    // ignore shippingCost entirely (even though heroProfit, right above,
    // already subtracts it) and clamp the floor to a fake minimum of $1 -
    // caught live: Mainstays torches, "Pay up to $6" against a $13
    // conservative sell price and $9 shipping actually nets -$3.73 at that
    // buy price. shippingCost is the SAME value heroProfit already reads.
    const netAfterFeesAndShippingAtCeiling = planningPrice * (1 - feeRate) - shippingCost;
    const roiCeilingBuy = netAfterFeesAndShippingAtCeiling / (1 + ROI_BUY_MIN / 100);
    const profitFloorBuy = netAfterFeesAndShippingAtCeiling - MAX_BUY_PROFIT_FLOOR;
    // AI-ONLY: NO MAX BUY (2026-10-09, MEASURED): sellPriceForProfit can
    // still be nonzero for tier "ai_only" - it falls back to the AI's own
    // raw anchor (adjustedResaleValue/result.resaleFromModel) whenever
    // result.sellPrice is server-forced to 0 (see this file's ONE
    // CANONICAL SELL PRICE comment above) - so this ceiling used to render
    // ("Max buy: $X", ProfitFlexHero's own comment says it's ALWAYS shown,
    // in both BUY and SKIP layouts, so isSkip/hideProfitHero never caught
    // it) off a number with zero real data behind it. result.priceBasisTier
    // is the server's own tier for THIS basis price - null it out here
    // rather than threading a guard through ProfitFlexHero.
    const isAiOnly = result.priceBasisTier === "ai_only";
    // THIN-RESULT NUMBER WITHHOLDING (2026-11-08, Superman Mr. Terrific
    // crash-trip audit) - mirrors deal-ai-pro's app/api/lens/route.ts
    // withholdConfidentNumbers exactly. result.conditionThinSampleNote is
    // now set by the server for EVERY comparable_range result (not just
    // the condition-filter fallback subcase - see that route's own
    // comment), so this single flag covers every thin case the server
    // itself withholds Max Buy/profit/ROI for. Used below to null maxBuy
    // and to swap the hero/ROI DISPLAY numbers for an honest fallback -
    // never to zero heroProfit/heroRoi THEMSELVES, which classifyOutcome/
    // classifyHeroVerdictLocal still need as real numbers to classify a
    // genuine loss as PASS rather than everything reading as a fabricated
    // break-even (see this file's own LOCKED VERDICT comment for why a
    // forced 0 there would be a second, different lie).
    // BRAND-AGNOSTIC SEGMENT OVERRIDE + SANITY GUARD (2026-11-09, ZURU
    // rejection follow-up) - mirrors deal-ai-pro's app/api/lens/route.ts
    // segmentBrandAgnostic/priceVsReferenceSanityCapped exactly, same
    // formulas. Recomputed FRESH here (not read off result.
    // conditionThinSampleNote, which is frozen at scan time) because
    // priceVsReferenceSanityCapped depends on enteredBp - a price EDITED
    // after the scan can move this item in or out of the 4x sanity bound,
    // and the server's own static field can't track that. Guarded with
    // `?.`/`??` throughout - a response from an older server build (or a
    // saved-scan reopen predating this field) simply reads as "not
    // brand-agnostic, not sanity-capped," never a thrown error.
    const segmentBrandAgnostic = result.priceBasisTier === "segment" && result.segmentOutcomes?.level === "itemtype";
    const referencePriceForSanity = enteredBp > 0 ? enteredBp : (Number(result.detectedTagPrice) > 0 ? Number(result.detectedTagPrice) : 0);
    const priceVsReferenceSanityCapped = !!(
      result.priceBasisTier && result.priceBasisTier !== "exact_item" &&
      referencePriceForSanity > 0 && planningPrice > referencePriceForSanity * 4
    );
    const withholdConfidentNumbers = isAiOnly || !!result.conditionThinSampleNote || segmentBrandAgnostic || priceVsReferenceSanityCapped;
    // FLOORED AT 0, NOT CLAMPED TO A FAKE $1 (2026-10-19) - 0 is a real,
    // honest answer ("no price clears the bar"), not a sentinel. null
    // stays reserved for "no price data at all" (ai_only, or now any other
    // withheld-confidence case) - ProfitFlexHero (below) tells these apart
    // via maxBuy===0 vs maxBuy===null.
    // MAX BUY (2026-11-10, proof-screen): prefer the server's own
    // buyTarget/maxBuy - the exact field History/Specialty already show
    // verbatim (SpecialtyScreen.tsx's `result.buyTarget != null` read) -
    // over this screen's own local recompute, so the two can never show a
    // different ceiling for the identical scan. The local recompute below
    // is now ONLY a fallback for a response that doesn't carry either field
    // (an older saved scan, or a path that never computed one).
    const serverMaxBuy = result.buyTarget != null ? Number(result.buyTarget)
      : (result.maxBuy != null ? Number(result.maxBuy) : null);
    const localMaxBuyFallback = planningPrice > 0
      ? Math.max(0, Math.floor(Math.min(roiCeilingBuy, profitFloorBuy)))
      : null;
    const usingServerMaxBuy = !maxBuyLocked && !withholdConfidentNumbers && serverMaxBuy != null;
    const maxBuy = (maxBuyLocked || withholdConfidentNumbers)
      ? null
      : (serverMaxBuy != null ? serverMaxBuy : localMaxBuyFallback);
    const profitLabel = enteredBp > 0 ? "actual profit after fees" : "projected profit after fees";

    // ROI MUST be computed against the SAME cost basis as heroProfit - the
    // entered price when one exists, else the max-buy ceiling. This used to
    // always divide by buyTarget (the ceiling) even when a real price was
    // entered, which silently understated ROI (e.g. $13 profit / $5 ceiling
    // = 260%, instead of the real $13 / $1 entered = 1300%) and fed the
    // wrong number into the tier classifier - that's what made a 1300%-ROI
    // flip misread as "not worth the trip."
    const actualCostBasis = maxBuyLocked ? 0 : (enteredBp > 0 ? enteredBp : (maxBuy || 0));
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
    // LOCKED VERDICT (2026-10-25, HISTORY-RESULTS FIX: no false PASS): both
    // classifyOutcome below and classifyHeroVerdictLocal further down take
    // heroProfit/heroRoi as inputs, which are forced to 0 (never null) once
    // maxBuyLocked - NOT "unknown," a real, honest 0. Every tier classifier
    // in this codebase treats netProfit<=0 as a hard SKIP/PASS (see
    // lib/outcomeTier.ts's own rule 1/2 and classifyHeroVerdictLocal's first
    // real gate) - so a free-plan viewer who had ANY buy price on screen
    // (typed here, or carried over from a saved scan's own buy_price - see
    // lib/viewSavedScan.ts) would see a confident "SKIP"/"PASS" the server
    // never actually computed, on a ceiling it explicitly withheld. Short-
    // circuits to the same neutral 🔒 convention used everywhere else
    // (HistoryScreen.tsx's rowLocked, this file's own maxBuyLocked ternaries
    // a few lines up) instead of ever reaching either classifier with
    // zeroed-but-real-looking numbers.
    const lockedPricedOutcome = maxBuyLocked && enteredBp > 0;
    let outcome = lockedPricedOutcome
      ? {
          tier: "estimate" as const,
          emoji: "🔒",
          label: "LOCKED",
          copy: "Your plan locks the buy/pass verdict and profit math for this item.",
          accent: C.text4,
          adjustedROI: 0,
          daysUsed: 0,
        }
      : (enteredBp > 0 && hasItemLevelSellEvidence)
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
          label: hasItemLevelSellEvidence ? "REAL DATA" : "UNCONFIRMED",
          copy: hasItemLevelSellEvidence
            ? `Sells for about $${sellPriceForProfit} (real data from ${agreeingCountForCopy} resale outcomes) — verdict needs your buy price.`
            : `Sells for about $${sellPriceForProfit} (not yet confirmed by real sales of this exact item) — verify before buying at $${enteredBp}.`,
          accent: hasItemLevelSellEvidence ? C.green : C.yellow,
          adjustedROI: 0,
          daysUsed: 0,
        } : {
          // NO PRICE ENTERED (item 4, 2026-10-25 REWRITE): emoji/label/copy
          // below are never actually rendered for this state any more -
          // ProfitFlexHero's noVerdictPrompt (set below, once enteredBp<=0
          // is known) takes over the ENTIRE badge+copy area with the plain
          // "Type the tag price..." prompt the spec calls for, replacing
          // the old "ADD PRICE"/estimate framing (which used to restate a
          // range here too - gone, see the RANGE comment above
          // adjustedResaleValue). `accent` is the one field that still
          // matters: ProfitFlexHero's hero-number color and card border
          // tint read it even in noVerdictPrompt mode.
          tier: "estimate" as const,
          emoji: hasItemLevelSellEvidence ? "✅" : "🏷️",
          label: hasItemLevelSellEvidence ? "REAL DATA" : "UNCONFIRMED",
          copy: "",
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
    // STORE REVIEW: default "no qualifying headline yet" for this scan -
    // overwritten below the moment one resolves to SOLID/WORTH A LOOK.
    // Keyed on the scan id so the trigger effect fires once per SCAN, not
    // once per render while the user edits price/condition.
    reviewHeadlineRef.current = { scanKey: String(result.id ?? result.scanId ?? result.scan_id ?? ""), headline: null };
    // PATCH-ON-SETTLE (2026-10-12): captured for the useEffect below (near
    // the other top-level effects) that persists buy_price/net_profit/roi/
    // decision back to the stored scans row once price/condition editing
    // settles - see that effect's own comment for why this exists (the
    // owner's real Walmart scans all stored buy_price=0/decision=UNKNOWN
    // because nothing ever wrote the price shown here back to the row).
    let finalHeadline: HeroVerdict = null;
    // LOCKED VERDICT: never reaches classifyHeroVerdictLocal while
    // maxBuyLocked - see lockedPricedOutcome's own comment above for why
    // (heroProfit/heroRoi are a real, zeroed 0 here, not "no data," and
    // every classifier reads netProfit<=0 as a hard PASS).
    if (enteredBp > 0 && !maxBuyLocked) {
      const segOut: any = result.segmentOutcomes;
      const tier: string = result.priceBasisTier || (result.confirmedByMoat ? "item_moat" : segOut ? "segment" : "ai_only");
      // sellThroughPct: the EXACT value classifyHeroVerdict used server-side
      // for whichever tier won (PriceBasisResult.sellThroughPct, now
      // returned on the response - see app/api/lens/route.ts's "PARITY
      // INPUTS" comment) - NOT result.velocity.sellThrough, a different,
      // oracle-wide metric the server's own verdict call never actually
      // reads.
      const heroSellThroughPct: number | null = result.sellThroughPct ?? null;
      // EXTRACTED (2026-10-12) to lib/outcomeTier.ts's classifyHeroVerdictLocal
      // - same exact logic, now shared with the PATCH-on-settle effect below
      // so that effect can't independently drift from what's on screen.
      const headline: HeroVerdict = classifyHeroVerdictLocal({
        tier, buyPrice: enteredBp, netProfit: heroProfit, roi: heroRoi, sellThroughPct: heroSellThroughPct,
        comparableRangeConfidence: result.comparableRangeConfidence ?? null,
        comparableRangeScope: result.comparableRangeScope ?? null,
        // BRAND-AGNOSTIC SEGMENT OVERRIDE + SANITY GUARD (2026-11-09) -
        // same two flags computed above (this file's own withholdConfidentNumbers
        // comment), reused here so the headline badge and the withheld
        // dollar figures can never disagree.
        segmentBrandAgnostic, priceVsReferenceSanityCapped,
      });
      finalHeadline = headline;
      // STORE REVIEW: real-data tier only (ai_only already headline:null
      // above) and never PASS/THIN - exactly the two labels the ask is
      // gated on.
      if (headline === "SOLID" || headline === "WORTH A LOOK") {
        reviewHeadlineRef.current.headline = headline;
      }
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

    // PATCH-ON-SETTLE: stash the freshest computed verdict for the
    // useEffect to read after this render commits - see that effect's own
    // comment. A plain ref write during render (not a hook) - this never
    // affects THIS render's own output, only what the next debounced PATCH
    // persists.
    latestVerdictRef.current = {
      scanId: (result.id ?? result.scanId ?? result.scan_id) != null ? String(result.id ?? result.scanId ?? result.scan_id) : null,
      buyPrice: enteredBp,
      buyPriceSource,
      netProfit: enteredBp > 0 ? heroProfit : null,
      roi: enteredBp > 0 ? heroRoi : null,
      decision: decisionFromVerdict(finalHeadline),
    };

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
    // withholdConfidentNumbers (2026-11-08) - a thin comparable_range match
    // can still reach a non-"estimate" outcome.tier (e.g. "THIN" is a real,
    // if marginal, judgment call for most tiers - hideProfitHero above
    // wouldn't catch this case), so this is checked explicitly rather than
    // relying on outcome.tier alone: falls back to the SAME typical-sale-
    // price display the no-price-entered state already uses, never a
    // profit figure computed off a 3-row comparable_range match.
    const heroDisplayValue = (enteredBp > 0 && !withholdConfidentNumbers) ? heroProfit : sellPriceForProfit;

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
    // maxBuy===0 (2026-10-19): fees + shipping alone already exceed the
    // conservative sell price - no entered price, however small, clears the
    // bar, so the enteredBp>0 branches below would otherwise claim a $1-$2
    // buy is "under the ceiling" when it genuinely isn't (the ceiling IS
    // zero). One honest line for this case, same reasoning regardless of
    // what (if anything) was entered.
    const maxBuyReasoning = (maxBuyLocked || maxBuy == null) ? "" : (
      maxBuy === 0
        ? `${maxBuyPrefix}Fees and shipping alone outweigh the typical resale price here - no buy price clears a real flip.`
        : enteredBp > 0
        ? (enteredBp <= maxBuy
            ? `${maxBuyPrefix}You paid $${enteredBp} — ${enteredBp <= maxBuy * 0.5 ? "strong buy, well under" : "under"} the ceiling.`
            : `${maxBuyPrefix}You paid $${enteredBp} — over the ceiling, margin is thinner than ideal.`)
        : usingServerMaxBuy
        ? `${maxBuyPrefix}Pay $${maxBuy} or less to make this a real flip.`
        : `${maxBuyPrefix}Pay $${maxBuy} or less to make this a real flip (≥${ROI_BUY_MIN}% ROI, ≥$${MAX_BUY_PROFIT_FLOOR} profit after fees).`
    );
    // "Based on <planningBasis> ($planningPrice)" (item 2) - shown under
    // Max buy whenever the server sent a real basis for it. Absent (older
    // response, or maxBuy itself is null/locked) means nothing to caption.
    const maxBuyBasis = (!maxBuyLocked && maxBuy != null && planningBasis && planningPrice > 0)
      ? `Based on ${planningBasis} ($${planningPrice})`
      : null;

    // MAX-BUY BASIS/RISK FALLBACK (2026-11-06, item 3): deal-ai-pro's
    // lens/route.ts nulls BOTH maxBuyBasisLine and riskAtLowEndLine
    // whenever its own buyTarget is null - which it deliberately is not
    // just for ai_only but ALSO whenever conditionThinSampleNote fired
    // ("Only N sales in this condition. Showing all conditions.") - see
    // that route's own buyTarget/riskAtLowEndLine comments. `maxBuy` above
    // is THIS screen's own recompute and only ever checks isAiOnly/
    // planningPrice, never conditionThinSampleNote - so a condition-
    // fallback scan shows a real Max Buy ceiling with neither line
    // explaining it, while the exact same item's Used-Good scan (real
    // condition-matched sample, no fallback, server's buyTarget non-null)
    // shows both. Mirrors the server's own formulas off the SAME
    // planningPrice/shippingCost/feeRate this screen already used to
    // compute maxBuy itself, plus priceRange.low - lib/lensPricing.ts's
    // priceRange.low IS priceBasis.priceLow verbatim for every tier that
    // has one, the one number the server's (otherwise un-sent) priceLow
    // genuinely shares with the client. Only ever fills in for the null
    // case - never overrides a real line the server did send.
    const fallbackLowEnd = Number(result.priceRange?.low) || Number(result.priceLow) || null;
    const maxBuyBasisLineFallback = (maxBuy != null && planningPrice > 0)
      ? `Based on a typical sale of $${Math.round(planningPrice)}, after fees${shippingCost ? ` and about $${Math.round(shippingCost)} shipping` : ""}.`
      : null;
    const riskAtLowEndLineFallback = (maxBuy != null && fallbackLowEnd != null && fallbackLowEnd < planningPrice)
      ? (() => {
          const costBasis = enteredBp > 0 ? enteredBp : maxBuy;
          if (!(costBasis > 0)) return null;
          const feesAtTypical = Math.round(planningPrice * feeRate * 100) / 100;
          const typicalNet = Math.round((planningPrice - feesAtTypical - costBasis - shippingCost) * 100) / 100;
          const feesAtLow = Math.round(fallbackLowEnd * feeRate * 100) / 100;
          const lowNet = Math.round((fallbackLowEnd - feesAtLow - costBasis - shippingCost) * 100) / 100;
          const typicalPart = `about ${typicalNet >= 0 ? "+" : "-"}$${Math.abs(typicalNet)} if it sells at the typical $${Math.round(planningPrice)}`;
          const lowPart = `about ${lowNet >= 0 ? "+" : "-"}$${Math.abs(lowNet)} if it sells at the low end ($${Math.round(fallbackLowEnd)})`;
          return `At $${Math.round(costBasis)}: ${typicalPart}, ${lowPart}.`;
        })()
      : null;

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
    const footNote = result.confirmedByMoat ? undefined : "Not yet confirmed — verify before buying.";
    // sell price reads sellPriceForProfit (condition-adjusted), NOT
    // result.sellPrice directly - it sits right next to ROI in this same
    // row, and ROI is already computed off the adjusted number (see
    // heroRoi above). Showing the stale original next to the adjusted ROI
    // would be exactly the "two numbers disagree" bug this app has fixed
    // elsewhere - a condition edit must move both together.
    const secondaryStats = [
      { label: "sell price", value: sellPriceForProfit > 0 ? "$" + sellPriceForProfit : "—" },
      { label: "ROI", value: maxBuyLocked ? "🔒" : (withholdConfidentNumbers ? "—" : (heroRoi ? heroRoi + "%" : "—")) },
      { label: "to sell", value: oracleDaysTxt },
    ];
    // TEXT (item 5): never the server's own reasoning text here any more -
    // outcome.copy (the skipReason line right above this in ProfitFlexHero)
    // already states the verdict's own reason; result.reasoning used to be
    // rendered right underneath it as "skipDetail," which measured out as a
    // near-duplicate second statement of the same thing ("duplicated
    // headline/body lines") and, on a failed-narrative scan, as the literal
    // old hardcoded failure sentence. narrativeUnavailable (2026-10-25
    // server contract) replaces that sentence outright - this is now the
    // ONLY thing skipDetail ever shows, and only as one small grey caveat,
    // never the narrative text itself.
    const skipDetail = isSkip && result.narrativeUnavailable ? "Full analysis unavailable for this item." : null;
    // CHECK ITEM (item 3, 2026-10-25 server contract): the server withheld
    // a real verdict entirely because identity is title-only/low-confidence
    // - netProfit/roi are null server-side in this state regardless of any
    // buy price, so there is nothing for THIS screen's local recompute to
    // stand behind either. Checked independently of enteredBp/outcome - see
    // the dedicated card below, which replaces the whole price+verdict
    // section rather than trying to fit inside it.
    const isCheckItem = result.heroVerdict?.headline === "CHECK ITEM";
    // RANGE (item 2): "show the range only from the server's priceLow/
    // priceHigh and never an AI range" - adjustedResaleLow/High (the local,
    // condition-multiplied AI anchor) no longer feeds anything user-facing;
    // only a real server-provided range (currently exact_item tier, "and
    // later segment" per the contract) ever renders.
    const serverPriceLow = Number(result.priceLow) || null;
    const serverPriceHigh = Number(result.priceHigh) || null;
    const hasServerRange = serverPriceLow != null && serverPriceHigh != null && serverPriceLow > 0 && serverPriceHigh > 0;
    // NO PRICE ENTERED (item 4): "tag unread or rejected" - enteredBp<=0
    // covers both (deriveTagConfirmPending/editTagRead both leave buyPrice
    // blank - see tagConfirmState.ts). Never shown for CHECK ITEM, which
    // has its own dedicated, even simpler card below.
    const noPriceEntered = !isCheckItem && enteredBp <= 0;
    const noVerdictPrompt = noPriceEntered ? "Type the tag price to get Buy or Pass." : null;

    // NEEDS BETTER IDENTIFICATION (2026-11-10, proof-screen): distinct from
    // CHECK ITEM above - the server still priced SOMETHING (this screen's
    // proof stays fully visible, price/verdict included), it just wants a
    // brand/model tag or barcode before it can trust that price. Both CTAs
    // route to the SAME identity-confirm screen ScanConfirmScreen already
    // provides - it already supports both adding a photo (pickFrom) and
    // editing the item name in one place, re-running against this SAME
    // scan.id (rerunScan, "never a new row" - see that screen's own header
    // comment) - no second re-run mechanism to build or keep in sync.
    const needsBetterIdentification = !!result.needsBetterIdentification;
    const scanConfirmPayload = {
      id: result.id ?? result.scanId ?? result.scan_id,
      item_name: result.itemName || result.item_name || "",
      brand: result.brand,
      category: result.category,
      condition: resultCondition ? (CONDITION_TO_DB[resultCondition] || undefined) : undefined,
      buy_price: enteredBp || undefined,
      image_url: photos[0] ? `data:image/jpeg;base64,${photos[0]}` : undefined,
      specialty_data: JSON.stringify(result),
    };

    // CONFIDENCE BADGE (2026-11-10, proof-screen): a second, orthogonal
    // signal from the REAL DATA/ESTIMATE dataTag above - how much to trust
    // the PRICE itself, independent of whether it's "real data." High only
    // for genuine item-level sell evidence (hasItemLevelSellEvidence,
    // confirmedByMoat); medium for a real but broader match (segment/
    // comparable_range); low - labeled "Estimate - verify" per spec - for
    // everything else, INCLUDING every case this screen already withholds
    // confident numbers for (withholdConfidentNumbers: ai_only, thin
    // condition sample, brand-agnostic segment, sanity-capped).
    const confidenceTier: "high" | "medium" | "low" = withholdConfidentNumbers ? "low"
      : hasItemLevelSellEvidence ? "high"
      : (result.priceBasisTier === "segment" || result.priceBasisTier === "comparable_range") ? "medium"
      : "low";
    const confidenceLabel = confidenceTier === "high" ? "High confidence" : confidenceTier === "medium" ? "Medium confidence" : "Estimate - verify";
    const confidenceColor = confidenceTier === "high" ? C.green : confidenceTier === "medium" ? C.yellow : C.text4;

    // SHARE REVEAL DATA (2026-11-11): the ONE place this screen decides
    // what the reveal card is allowed to show - RevealScreen itself never
    // recomputes anything (see its own header comment), so every gate that
    // withholds a number on THIS proof screen (maxBuyLocked,
    // withholdConfidentNumbers) must be applied here too, before the value
    // ever reaches that component. revealProfitAfterFees mirrors heroProfit
    // when a price was entered, or projects the SAME formula against the
    // max-buy ceiling when it wasn't - "profit after fees" always means
    // something concrete, never a bare $0 for an unpriced scan.
    const revealCostBasis = enteredBp > 0 ? enteredBp : (maxBuy || 0);
    const revealProfitAfterFees = (!maxBuyLocked && !withholdConfidentNumbers && revealCostBasis > 0 && planningPrice > 0)
      ? Math.round((planningPrice - localFees - revealCostBasis - shippingCost) * 100) / 100
      : null;
    const revealProfitLabel = enteredBp > 0 ? "actual profit after fees" : "projected profit after fees";
    const revealVerdictLabel = maxBuyLocked ? null : outcome.label;
    // CREATOR CODE (item 3): read from whatever profile data is ALREADY
    // cached (peekProfileData - zero network calls from this screen, see
    // its own "no API call" comment elsewhere in this file) - no confirmed
    // field name exists for this yet server-side, so every plausible one is
    // tried and this just quietly renders nothing if none match ("skip if
    // not available," per spec - never a placeholder or an error).
    const cachedProfile: any = peekProfileData(token)?.profile;
    const revealCreatorCode: string | null =
      cachedProfile?.creatorCode || cachedProfile?.creator_code || cachedProfile?.myCreatorCode || cachedProfile?.my_creator_code || null;
    const revealDisplayName: string | null = cachedProfile?.display_name || cachedProfile?.full_name || null;

    // TOP-LEVEL ERROR BOUNDARY (2026-11-10, proof-screen - finishes the
    // "top-level ErrorBoundary around scan->result flow" crash-hardening
    // work the 2026-11-08 commit named but only ever wrapped the price
    // field with): wraps the ENTIRE result-step render, not just one piece
    // of it, so a crash ANYWHERE in this tree degrades to a plain retry
    // screen instead of a blank/frozen app. fallbackInSafeArea - see
    // ErrorBoundary.tsx's own comment - because this boundary is replacing
    // a subtree that itself starts with this screen's own SafeAreaView;
    // losing that subtree must not also lose the notch/home-indicator
    // insets. key={resultBoundaryKey} is what makes "Try again" actually
    // retry: bumping it forces a brand-new ErrorBoundary instance (hasError
    // reset to false) around the SAME JSX below, while result/buyPrice/
    // resultCondition/photos - this component's OWN hooks, never reset by a
    // child subtree remounting - carry the scan forward unchanged.
    return (
      <ErrorBoundary
        key={resultBoundaryKey}
        fallbackInSafeArea
        fallbackMessage="Something went wrong showing this scan. Your result is still saved."
        onRetry={() => setResultBoundaryKey(k => k + 1)}
        onError={(error, info) => logClientError(token, error, {
          stage: "result-render",
          componentStack: info.componentStack,
          scanId: (result?.id ?? result?.scanId ?? result?.scan_id) ?? null,
        })}
      >
      <SafeAreaView style={s.safe} edges={["top","left","right"]}>
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
        <RevealScreen
          visible={revealOpen}
          onClose={() => setRevealOpen(false)}
          token={token}
          scanId={(result.id ?? result.scanId ?? result.scan_id) != null ? String(result.id ?? result.scanId ?? result.scan_id) : null}
          itemName={result.itemName || result.item_name || "Unknown Item"}
          photoBase64={photos[0] || null}
          enteredPrice={enteredBp > 0 ? enteredBp : null}
          typicalPrice={sellPriceForProfit > 0 ? sellPriceForProfit : null}
          priceLow={hasServerRange ? serverPriceLow : null}
          priceHigh={hasServerRange ? serverPriceHigh : null}
          profitAfterFees={revealProfitAfterFees}
          profitLabel={revealProfitLabel}
          verdictLabel={revealVerdictLabel}
          verdictAccent={outcome.accent}
          displayName={revealDisplayName}
          creatorCode={revealCreatorCode}
        />
        {/* Nav */}
        <View style={s.nav}>
          {/* HISTORY RESULTS REUSE: this mount never went through camera/
              review (navData.viewScan skipped straight to "result" - see
              this screen's own load effect), so there is no earlier step to
              go back to. Back means History instead. */}
          <TouchableOpacity onPress={() => {
            if (viewingSavedScan) { onNavigate("history"); return; }
            // RESTORE FULL PHOTO SET - see the ProfitFlexHero onEdit
            // pencil's own comment; this top-nav back button reaches the
            // same review screen and needs the same restoration.
            if (lastSentPhotosRef.current.length) setPhotos(lastSentPhotosRef.current);
            setStep("review");
          }} style={s.navBack}>
            <Text style={s.navBackText}>{"\u2039"}</Text>
          </TouchableOpacity>
          <HeaderLogo textStyle={s.logoText}/>
          <TouchableOpacity onPress={reset} style={[s.navBtn,{marginLeft:"auto" as any}]}>
            <Text style={s.navBtnText}>New Scan</Text>
          </TouchableOpacity>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:60}} showsVerticalScrollIndicator={false}>

          {/* ALWAYS-ANSWER PROOF SCREEN (2026-11-10): there is no "not
              enough data / can't price" dead end any more - a thin/no-data
              scan still has a real item, photo, and (at worst) an honest
              AI-estimate range/verdict to stand on (see outcome's own
              "estimate"/"UNCONFIRMED" branch above). The old dataQuality-
              gated "Need More Information" card used to replace the ENTIRE
              proof (no photo, no range, nothing) whenever dataQuality
              wasn't "strong"/"limited" - removed outright; CHECK ITEM below
              remains the one deliberate exception (identity itself, not
              pricing data, is what's missing there). */}

          {/* - CHECK ITEM (item 3, 2026-10-25 server contract) - identity is
              title-only/low-confidence; the server withheld netProfit/roi
              entirely (heroVerdict.headline === "CHECK ITEM", decision
              WATCH). No BUY/PASS, no profit figures - range only (server
              priceLow/priceHigh), the one honest sentence, and a button
              straight into the identity-confirm re-run screen. */}
          {isCheckItem && (
            <View style={s.noDataCard}>
              <Text style={{color:C.text1,fontSize:15,fontWeight:"700",textAlign:"center",marginBottom:8}}>Check This Item</Text>
              <Text style={{color:C.text3,fontSize:13,textAlign:"center",lineHeight:20,marginBottom: hasServerRange ? 10 : 16}}>
                Not sure it's this exact item. Confirm the name, then re-run.
              </Text>
              {hasServerRange ? (
                <Text style={{color:C.text2,fontSize:13,fontWeight:"700",textAlign:"center",marginBottom:16}}>
                  {`Typical range: $${serverPriceLow}-$${serverPriceHigh}`}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[s.navBtn,{alignSelf:"center",paddingHorizontal:24,paddingTop:16,paddingBottom:10}]}
                onPress={() => onNavigate("scan-confirm", { scan: scanConfirmPayload })}
              >
                <Text style={s.navBtnText}>Is this what you're looking for?</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* - PROFIT (always, except the dedicated CHECK ITEM card above) - */}
          {!isCheckItem && (
            <>
              {/* NEEDS BETTER IDENTIFICATION (2026-11-10, proof-screen): the
                  proof above (item/photo/range/verdict) stays fully visible
                  - this is guidance, not a replacement, unlike CHECK ITEM's
                  dedicated card. Both buttons open the SAME identity-confirm
                  screen (see scanConfirmPayload's own comment) - one labeled
                  for "I have more to show it," the other for "the name's
                  wrong," so the user picks the right mental action even
                  though both land in the same place. */}
              {needsBetterIdentification && (
                <View style={[s.noDataCard, { marginBottom: 14 }]}>
                  <Text style={{color:C.text1,fontSize:14,fontWeight:"700",textAlign:"center",marginBottom:6}}>Help us nail this ID</Text>
                  {result.brandTagPrompt ? (
                    <Text style={{color:C.text3,fontSize:13,textAlign:"center",lineHeight:19,marginBottom:12}}>{result.brandTagPrompt}</Text>
                  ) : null}
                  <View style={{flexDirection:"row",gap:10}}>
                    <TouchableOpacity
                      style={[s.navBtn,{flex:1,paddingVertical:12,paddingHorizontal:8,alignItems:"center"}]}
                      onPress={() => onNavigate("scan-confirm", { scan: scanConfirmPayload })}
                    >
                      <Text style={s.navBtnText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>Scan the label or barcode</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.navBtn,{flex:1,paddingVertical:12,paddingHorizontal:8,alignItems:"center"}]}
                      onPress={() => onNavigate("scan-confirm", { scan: scanConfirmPayload })}
                    >
                      <Text style={s.navBtnText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>Edit name and re-check</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

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
              {/* ERROR BOUNDARY (2026-10-19): this block is this session's
                  newest/most-edited piece of the result screen (two-pass
                  tag-read UI, live price recompute) - a crash here must not
                  take down the whole result screen, which still has a real
                  photo/verdict/profit already rendered above it. Falls back
                  to a plain message; the rest of the screen stays usable. */}
              <ErrorBoundary fallbackMessage="Couldn't show the price field — the rest of this scan is still shown below.">
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
                        const next = confirmTagRead(Number(result.retailPriceRead));
                        setBuyPrice(next.buyPrice);
                        setTagConfirmPending(next.tagConfirmPending);
                        setBuyPriceSource("tag");
                      }}
                    >
                      <Text style={s.tagConfirmBtnText}>Confirm ${result.retailPriceRead}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.tagEditBtn}
                      onPress={() => {
                        const next = editTagRead();
                        setBuyPrice(next.buyPrice);
                        setTagConfirmPending(next.tagConfirmPending);
                        // REJECTED: never a source until the user types a
                        // real replacement - see buyPriceSource's comment.
                        setBuyPriceSource(null);
                        setTimeout(() => priceInputRef.current?.focus(), 50);
                      }}
                    >
                      <Text style={s.tagEditBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  {/* STALE HEADER FIX (2026-11-04, result-screen-clarity item
                      4): this used to echo result.retailPriceRead (the
                      frozen, scan-time OCR read) forever, even after the
                      field below was edited to a different value - the label
                      kept saying "Tag: $14.99" while the input showed $22.
                      Reads the live `buyPrice` field state instead, so this
                      line always matches what's actually in the box below it. */}
                  <Text style={s.priceLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {enteredBp > 0 ? `Tag: $${buyPrice} (tap to change)` : "Enter price for your verdict"}
                  </Text>
                  <View style={s.priceFieldWrap}>
                    <Text style={s.priceFieldDollar}>$</Text>
                    <TextInput
                      ref={priceInputRef}
                      style={s.priceFieldInput}
                      value={buyPrice}
                      onChangeText={(t) => { setBuyPrice(t); setBuyPriceSource("user"); }}
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
              </ErrorBoundary>

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
                    // RESTORE FULL PHOTO SET (2026-11-08) - `photos` was
                    // trimmed to [photos[0]] right after this scan's own
                    // upload completed (finishAnalyze's own comment) to
                    // stop holding 2-5 full-size base64 strings in state
                    // for no reason once the normal path never revisits
                    // them - Edit & Rerun is the one path that does.
                    if (lastSentPhotosRef.current.length) setPhotos(lastSentPhotosRef.current);
                    setStep("review");
                  }}
                  isSkip={hideProfitHero}
                  heroProfit={heroDisplayValue}
                  // WORDING FIX (2026-10-05): calling a confirmedByMoat price
                  // "estimated" (while the dataTag right next to it says
                  // "● REAL DATA") was the Under Armour polo's exact
                  // contradiction - "estimated" now only applies when the
                  // price genuinely isn't confirmed.
                  // ONE HERO LABEL (2026-11-06, item 4): used to pick between
                  // three different client-written strings here ("typical
                  // sell price" / "sell price" / "Typical recent sale")
                  // depending on confirmedByMoat/showTypicalSaleLabel - the
                  // exact inconsistency the owner flagged (same no-price-
                  // entered state, different heading text scan to scan). No
                  // server field backs any of these three (confirmed against
                  // deal-ai-pro's lens/specialty routes - neither ships a
                  // hero-label string), so there is no real distinction to
                  // preserve: one literal, always, whenever no price is
                  // entered. A genuine server-provided label would replace
                  // this literal outright, not add a fourth branch.
                  profitLabel={(enteredBp > 0 && !withholdConfidentNumbers) ? profitLabel : "typical sell price"}
                  maxBuy={maxBuy}
                  maxBuyReasoning={maxBuyReasoning}
                  maxBuyBasis={maxBuyBasis}
                  maxBuyBasisLine={result.maxBuyBasisLine ?? maxBuyBasisLineFallback}
                  riskAtLowEndLine={result.riskAtLowEndLine ?? riskAtLowEndLineFallback}
                  maxBuyLocked={maxBuyLocked}
                  onUpgradePress={() => {
                    logEvent(token, "lock_tap", { item: "maxBuy" });
                    onNavigate("upgrade", { trigger: "lock_tap" });
                  }}
                  dataTag={dataTag}
                  dataTagColor={dataTagColor}
                  confidenceLabel={confidenceLabel}
                  confidenceColor={confidenceColor}
                  secondaryStats={noPriceEntered ? [] : secondaryStats}
                  footNote={footNote}
                  skipDetail={skipDetail}
                  noVerdictPrompt={noVerdictPrompt}
                  flashSeq={refineSeq}
                  heroSizeSmall={result.typicalPriceHeroSize === "small"}
                />
              </View>

              {/* UPGRADE PROMPT BELOW THE PROOF (item 4, 2026-11-10): keyed
                  on locked[] itself (scan 6+ on free plan - see maxBuyLocked
                  above), not plan==="free" generally - this is the specific
                  "your plan is withholding part of THIS result" moment, so
                  it belongs right under the proof it's explaining, not
                  buried after every collapsible section below. Replaces the
                  old plan==="free"-gated card that used to sit at the very
                  bottom of this fragment (same copy, moved up here and
                  re-gated) - keeping both would have repeated the exact
                  same pitch twice on one screen. */}
              {locked.length > 0 && (
                <TouchableOpacity
                  style={{backgroundColor:"#0a1500",borderRadius:14,padding:16,marginBottom:12,borderWidth:1,borderColor:C.green+"40",alignItems:"center"}}
                  onPress={()=>onNavigate("upgrade")}
                  activeOpacity={0.85}
                >
                  <Text style={{fontSize:20,marginBottom:6}}></Text>
                  <Text style={{color:C.green,fontSize:14,fontWeight:"900",marginBottom:4}}>Unlock Full Intelligence</Text>
                  <Text style={{color:C.text3,fontSize:12,textAlign:"center",lineHeight:18,marginBottom:10}}>
                    Max buy is on paid plans. Upgrade to see everything - one good flip pays for 6 months.
                  </Text>
                  <View style={{backgroundColor:C.green,borderRadius:8,paddingHorizontal:20,paddingVertical:8}}>
                    <Text style={{color:C.greenDark,fontWeight:"900",fontSize:13}}>Upgrade from $14.99/mo {'>'}</Text>
                  </View>
                  <Text style={{color:C.text4,fontSize:10,marginTop:8}}>Used {scansLeft !== null ? 10 - scansLeft : "?"} of 10 free scans this month</Text>
                </TouchableOpacity>
              )}

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

              {/* THIN CONDITION SAMPLE (lib/priceBasis.ts's conditionThinSampleNote):
                  server string shown verbatim whenever the condition-filtered
                  sample was too thin to trust on its own. */}
              {!!result.conditionThinSampleNote && (
                <Text style={{ color: C.text3, fontSize: 12, marginHorizontal: 16, marginTop: 4 }}>{result.conditionThinSampleNote}</Text>
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
                tagPriceDebug={{
                  ocrTagText: result.retailPriceReadSourceText ?? null,
                  detectedTagPrice: result.detectedTagPrice ?? null,
                  detectedWasPrice: result.detectedWasPrice ?? null,
                  retailPriceRead: result.retailPriceRead ?? null,
                  retailPriceReadConfidence: result.retailPriceReadConfidence ?? null,
                  buyPriceSource: result.buyPriceSource ?? null,
                  category: result.category ?? null,
                  brand: result.brand ?? null,
                  twoPass: result.tagReadDebug ?? null,
                }}
                segmentDebug={result.segmentOutcomes ? {
                  segmentLabel: result.segmentOutcomes.segmentLabel,
                  conditionBasis: result.segmentOutcomes.conditionBasis,
                  resolvedCount: result.segmentOutcomes.resolvedCount,
                  soldCount: result.segmentOutcomes.soldCount,
                } : null}
                parityMismatch={parityMismatchText}
                storeReviewDebug={reviewDebug}
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
              {/* RANGE (item 2/4, 2026-10-25): server priceLow/priceHigh
                  only - never the local AI-derived range.
                  WIDENED (item 2, 2026-11-10): used to gate on
                  (noPriceEntered || !hasItemLevelSellEvidence) - a real
                  item-level verdict suppressed the range entirely. The
                  range is part of the proof itself now (see the next
                  comment), so it stands alongside a real verdict too,
                  never conditional on whether one exists yet. */}
              {/* PROOF (item 2, 2026-11-10): the range is part of the proof
                  itself now - shown whenever the server sent one, same as
                  item/photo/verdict above, not only while there's no
                  standalone verdict yet to lean on. Includes the typical
                  sale price alongside the low-high band (sellPriceForProfit
                  - the SAME canonical rounded price everything else on this
                  card already uses) so "range" and "typical" never need two
                  separate reads to reconcile. */}
              {hasServerRange ? (
                <View style={[s.rangeBanner, { backgroundColor: outcome.accent + "1a", borderColor: outcome.accent + "55" }]}>
                  <Text></Text>
                  <FlashHighlight flashSeq={refineSeq}>
                    {/* ONE CAVEAT MAX: the "not yet confirmed" qualifier
                        lives once, in ProfitFlexHero's footNote above - not
                        repeated here. */}
                    <Text style={[s.rangeBannerSub, { flex: 1 }]}>
                      {`$${serverPriceLow}-$${serverPriceHigh}${sellPriceForProfit > 0 ? ` · typical $${sellPriceForProfit}` : ""}`}
                    </Text>
                  </FlashHighlight>
                </View>
              ) : null}

              {/* RECENT REAL SALES (item 2, 2026-11-10): the actual sold
                  comps backing the range/verdict above - date, price, and
                  condition for each, verbatim off result.sales. Absent or
                  empty renders nothing (never a "no sales yet" caveat - see
                  this screen's own always-answer rule). */}
              {Array.isArray(result.sales) && result.sales.length > 0 ? (
                <View style={[s.infoCard, { marginBottom: 12 }]}>
                  <Text style={s.infoLabel}>Recent real sales</Text>
                  {result.sales.slice(0, 5).map((sale: any, i: number) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                        paddingVertical: 7, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.border,
                      }}
                    >
                      <Text style={{ color: C.text3, fontSize: 12, flex: 1, flexShrink: 1 }} numberOfLines={1}>
                        {[sale.date, sale.condition].filter(Boolean).join(" · ") || "—"}
                      </Text>
                      <Text style={{ color: C.text1, fontSize: 13, fontWeight: "700" }}>
                        {sale.price != null ? `$${Math.round(Number(sale.price))}` : "—"}
                      </Text>
                    </View>
                  ))}
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
                    {/* MISLABEL FIX (2026-11-05): this box is only ever shown
                        when result.confirmedByMoat is true (see the gate
                        above), i.e. the server has real item-level sell
                        evidence - never active-listing-only data. A prior
                        OTA (group cb4241f1) keyed the title/sub off
                        outcome.tier==="estimate", which per outcomeTier.ts
                        means "no verdict yet" (no price entered, or the
                        plan locks it) - NOT "data is listed, not sold". That
                        hardcoded "Listed prices (not sold)" / "active
                        listings asking" / "no sold data for this item" onto
                        genuine moat-confirmed sold data for every user who
                        hadn't yet entered a buy price. Reverted to the one
                        honest source for this label - result.agreementBadge,
                        the server's own string - never guessed client-side
                        from outcome.tier or any other unrelated flag. */}
                    <Text style={s.goodBannerTitle}>{result.agreementBadge}</Text>
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
                            {result.realPlatformClaim.pct}% of resellers sold this online
                          </Text>
                          <Text style={{color:C.text3,fontSize:11,marginTop:2}}>
                            From {result.realPlatformClaim.n} real reported sales
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

            </>
          )}

          {/* SHARE REVEAL (item 1, 2026-11-11): deliberately OUTSIDE both
              the CHECK ITEM and main-proof branches above - this button
              shows on EVERY scan result, priced or not, buy or skip. "It is
              acquisition": a SKIP is just as shareable a moment as a BUY
              (mirrors FlexRevealBody's own "a PASS has just as real a card
              to share as a BUY" reasoning), and a scan the user hasn't
              priced yet still has a real item/photo/typical-sale-range to
              show off. See the SHARE REVEAL DATA block above this return
              for the one place every number shown here is gated to
              "already unlocked on the proof screen." */}
          <TouchableOpacity
            style={{backgroundColor:C.surface,borderRadius:14,paddingVertical:15,paddingHorizontal:12,marginBottom:12,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,minHeight:52,borderWidth:1,borderColor:C.green+"40"}}
            activeOpacity={0.85}
            onPress={() => setRevealOpen(true)}
          >
            <Text style={{fontSize:16}}>{"✨"}</Text>
            <Text style={{color:C.green,fontSize:15,fontWeight:"900"}}>Share reveal</Text>
          </TouchableOpacity>

          {/* Upgrade nudge for free users */}
          {plan==="free" && scansLeft !== null && scansLeft <= 3 && (
            <TouchableOpacity style={s.upgradeNudge} onPress={()=>onNavigate("upgrade")} activeOpacity={0.88}>
              <View style={{flex:1}}>
                <Text style={{color:C.green,fontSize:9,fontWeight:"800",letterSpacing:2,marginBottom:4}}>FREE PLAN</Text>
                <Text style={{color:C.text1,fontSize:13,fontWeight:"700"}}>{scansLeft} scans left this month</Text>
                <Text style={{color:C.text3,fontSize:11}}>Seller: 30/month · Pro: unlimited</Text>
              </View>
              <Text style={{color:C.green,fontSize:18}}>{'>'}</Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </SafeAreaView>
      </ErrorBoundary>
    );
  }

  // - REVIEW (photo added, before analyze) -
  if (step === "review") return (
    <SafeAreaView style={s.safe} edges={["top","left","right"]}>
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