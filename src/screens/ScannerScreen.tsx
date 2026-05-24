import React, { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  ScrollView, Linking, SafeAreaView, StatusBar, TextInput,
  Image, Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { C } from "../lib/theme";
import ShareButton from "../components/ShareButton";
import { API_BASE, scanImage, scanBarcode } from "../lib/api";

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
}

export default function ScannerScreen({ token, plan, scansLeft, setScansLeft, onNavigate, onLogout }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>("camera");
  const [mode, setMode] = useState<"photo" | "barcode">("photo");
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<any>(null);
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const cameraRef = useRef<any>(null);

  function reset() {
    setStep("camera");
    setResult(null);
    setPhotos([]);
    setDescription("");
    setBarcodeScanned(false);
    setMode("photo");
  }

  async function takePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
    if (photo?.base64) {
      setPhotos(p => [...p, photo.base64!].slice(0, 3));
      setStep("review");
    }
  }

  async function pickLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.7 });
    if (!res.canceled && res.assets[0]?.base64) {
      setPhotos(p => [...p, res.assets[0].base64!].slice(0, 3));
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
        if (!p.length && !description) {
          setStep("review"); return;
        }
        d = await scanImage(token, p[0] || "", description);
      }
      if (d.error === "scan_limit_reached") {
        onNavigate("upgrade");
        return;
      }
      if (!d.success) throw new Error(d.error || "Analysis failed");
      setResult(d);
      setStep("result");
      if (plan === "free") setScansLeft(n => n !== null ? Math.max(0, n - 1) : null);
    } catch (e: any) {
      setResult({ _error: e.message });
      setStep("result");
    }
  }

  // ── PERMISSION ────────────────────────────────────────
  if (!permission) return <View style={s.center}><ActivityIndicator color={C.green} size="large" /></View>;
  if (!permission.granted) return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
        <Text style={s.h2}>Camera Required</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 24 }]}>ValuIQ needs camera access to scan items for resale value.</Text>
        <TouchableOpacity style={s.greenBtn} onPress={requestPermission}>
          <Text style={s.greenBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // ── LOADING ───────────────────────────────────────────
  if (step === "loading") return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        <View style={s.navLogoRow}>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
        </View>
        <ActivityIndicator size="large" color={C.green} style={{ marginTop: 40, marginBottom: 16 }} />
        <Text style={s.h2}>Analyzing item...</Text>
        <Text style={s.body}>Checking prices on 12+ platforms</Text>
      </View>
    </SafeAreaView>
  );

  // ── UPGRADE ───────────────────────────────────────────
  if (step === "upgrade") return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <Text style={{ fontSize: 52, textAlign: "center", marginBottom: 16 }}>🛑</Text>
        <Text style={[s.h1, { textAlign: "center" }]}>Free scans used up</Text>
        <Text style={[s.body, { textAlign: "center", marginBottom: 24 }]}>
          Serious resellers scan 50–100 items per run.{"\n"}Upgrade for unlimited.
        </Text>
        <View style={s.dealBox}>
          <Text style={s.dealOld}>$497 regular price</Text>
          <View style={s.dealInner}>
            <Text style={s.dealBadge}>🔥 FIRST 100 ONLY — EARLY-BIRD</Text>
            <Text style={s.dealPrice}>$197</Text>
            <Text style={s.dealSub}>one time · Pro features forever</Text>
          </View>
          <TouchableOpacity style={s.dealBtn} onPress={() => onNavigate('upgrade')}>
            <Text style={s.dealBtnText}>Get Lifetime $197 →</Text>
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
          <Text style={{ color: C.text4, fontSize: 14 }}>← Back to scanner</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ── RESULT ────────────────────────────────────────────
  if (step === "result") {
    if (result?._error) return (
      <SafeAreaView style={s.safe}>
        <View style={s.nav}>
          <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
        </View>
        <View style={s.center}>
          <Text style={{ fontSize: 36, marginBottom: 16 }}>⚠️</Text>
          <Text style={s.h2}>Scan Failed</Text>
          <Text style={[s.body, { textAlign: "center" }]}>{result._error}</Text>
          <TouchableOpacity style={[s.greenBtn, { marginTop: 24 }]} onPress={reset}>
            <Text style={s.greenBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );

    const hasGoodData = result.dataQuality === "strong";
    const hasLimitedData = result.dataQuality === "limited";
    const hasNoData = !hasGoodData && !hasLimitedData;
    const isProfit = (result.netProfit || 0) > 0;
    const dc = result.decision === "BUY" ? C.green : result.decision === "WATCH" ? C.yellow : C.red;
    const displayDc = hasNoData ? C.text3 : dc;

    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" />
        <View style={s.nav}>
          <TouchableOpacity onPress={() => setStep("review")} style={s.navBack}>
            <Text style={s.navBackText}>←</Text>
          </TouchableOpacity>
          <View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>
          <Text style={s.logoText}>ValuIQ</Text>
          <TouchableOpacity onPress={reset} style={[s.navBtn, { marginLeft: "auto" as any }]}>
            <Text style={s.navBtnText}>New Scan</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

          {/* Data confidence banner */}
          {hasGoodData && result.priceData && (
            <TouchableOpacity style={s.goodBanner} onPress={() => Linking.openURL(result.priceData.ebaySearchUrl)}>
              <Text style={{ fontSize: 18 }}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.goodBannerTitle}>{result.priceData.count} real sold listings — tap to verify</Text>
                <Text style={s.goodBannerSub}>eBay avg ${result.priceData.avgPrice} · Range ${result.priceData.minPrice}–${result.priceData.maxPrice}</Text>
              </View>
              <Text style={{ color: C.green }}>→</Text>
            </TouchableOpacity>
          )}
          {hasLimitedData && (
            <View style={s.limitedBanner}>
              <Text>⚡</Text>
              <Text style={s.limitedText}>Limited data — treat as estimate. Verify before buying.</Text>
            </View>
          )}
          {hasNoData && (
            <View style={s.noDataBanner}>
              <Text>⚠️</Text>
              <Text style={s.noDataText}>No market data found. Add brand + model for accuracy.</Text>
            </View>
          )}

          {/* Verdict */}
          <View style={[s.verdictCard, { borderColor: displayDc + "30", backgroundColor: displayDc + "08" }]}>
            <View style={[s.verdictIcon, { backgroundColor: displayDc }]}>
              <Text style={{ fontSize: 30 }}>
                {result.decision === "BUY" ? "💰" : result.decision === "WATCH" ? "👀" : "🚫"}
              </Text>
            </View>
            <Text style={[s.verdictText, { color: displayDc, fontSize: result.decision === "BUY" ? 48 : 36 }]}>
              {hasNoData ? "UNKNOWN" : result.decision === "BUY" ? "BUY IT" : result.decision === "WATCH" ? "WATCH IT" : "PASS"}
            </Text>
            <Text style={s.itemName}>{result.itemName || result.item_name || "Unknown Item"}</Text>
            <Text style={s.itemMeta}>{result.category}{result.condition ? ` · ${result.condition}` : ""}</Text>
          </View>

          {/* Profit */}
          {!hasNoData ? (
            <View style={[s.profitCard, { borderColor: isProfit ? C.green + "25" : C.red + "25" }]}>
              <Text style={s.profitLabel}>
                {hasLimitedData ? "ESTIMATED PROFIT (LIMITED DATA)" : "YOUR PROFIT AFTER FEES"}
              </Text>
              <Text style={[s.profitAmount, {
                fontSize: hasLimitedData ? 48 : 60,
                color: isProfit ? C.green : C.red,
                opacity: hasLimitedData ? 0.75 : 1
              }]}>
                {isProfit ? "+" : ""}${Math.abs(result.netProfit || 0).toFixed(2)}
              </Text>
              <Text style={s.profitSub}>
                Sell ${result.sellPrice} on {result.bestPlatform} · {result.roi}% ROI
                {hasLimitedData ? " · verify before buying" : ""}
              </Text>
            </View>
          ) : (
            <View style={s.noDataCard}>
              <Text style={{ color: C.text3, fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 8 }}>Need more information</Text>
              <Text style={{ color: C.text4, fontSize: 13, textAlign: "center", lineHeight: 20 }}>Try again with the brand name, model number, or item description for accurate pricing.</Text>
            </View>
          )}

          {/* Key numbers - only show when we have real data */}
          {!hasNoData && (
            <View style={s.numbersCard}>
              {[
                ["MAX TO PAY", `$${result.buyTarget || 0}`, C.yellow],
                ["SELL FOR", `$${result.sellPrice || 0}`, C.text1],
                ["PLATFORM", result.bestPlatform || "eBay", C.text1],
              ].map(([label, value, color]) => (
                <View key={label as string} style={s.numberItem}>
                  <Text style={s.numberLabel}>{label as string}</Text>
                  <Text style={[s.numberValue, { color: color as string }]} numberOfLines={1}>{value as string}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Battle This */}
          <TouchableOpacity
            style={s.battleBtn}
            onPress={() => {
              // Pre-fill price battle with this item's data
              onNavigate("price-battle");
            }}
            activeOpacity={0.85}
          >
            <Text style={s.battleBtnText}>⚡ Battle This Item</Text>
            <Text style={s.battleBtnSub}>Compare all platforms instantly</Text>
          </TouchableOpacity>

          {/* Hot tip */}
          {result.hotTip ? (
            <View style={s.tipCard}>
              <Text style={s.tipLabel}>🔥 Hot Tip</Text>
              <Text style={s.tipText}>{result.hotTip}</Text>
            </View>
          ) : null}

          {/* Reasoning */}
          {result.reasoning ? (
            <View style={s.infoCard}>
              <Text style={s.infoLabel}>Analysis</Text>
              <Text style={s.infoText}>{result.reasoning}</Text>
            </View>
          ) : null}

          {/* Listing tips */}
          {result.listingTips?.length > 0 && (
            <View style={s.infoCard}>
              <Text style={s.infoLabel}>Listing Tips</Text>
              {result.listingTips.map((tip: string, i: number) => (
                <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                  <Text style={{ color: C.green, fontSize: 13 }}>→</Text>
                  <Text style={{ color: C.text2, fontSize: 13, lineHeight: 20, flex: 1 }}>{tip}</Text>
                </View>
              ))}
            </View>
          )}

          <ShareButton
            message={`🔍 Found this with ValuIQ!\n\n${result.itemName || "Item"}\n\n${hasNoData ? "No market data" : `${result.decision === "BUY" ? "✅ BUY IT" : result.decision === "WATCH" ? "👀 WATCH IT" : "🚫 PASS"}\n💰 Profit: $${Math.abs(result.netProfit || 0).toFixed(2)}\n🛒 Sell on ${result.bestPlatform}\n📊 ${result.roi}% ROI`}\n\nFind your own deals → getvaluiq.com`}
            title="ValuIQ Scan Result"
          />
                    {result?.decision === "BUY" && (
            <View style={s.refNudge}>
              <Text style={s.refTitle}>📱 Turn this into content that sells for you</Text>
              <Text style={s.refBody}>Get a ready-to-post TikTok script, Instagram caption, and Reddit post generated from this find.</Text>
              <View style={{flexDirection:"row",gap:8}}>
                <TouchableOpacity style={[s.refBtn,{flex:1}]} onPress={async ()=>{
                  try {
                    const r = await fetch(`${API_BASE}/api/viral-content`, {
                      method:"POST",
                      headers:{"Content-Type":"application/json"},
                      body:JSON.stringify({
                        token,
                        itemName:result.itemName||result.item_name||"Item",
                        profit:Math.round(result.netProfit||result.profit||0),
                        roi:Math.round(result.roi||0),
                        buyPrice:Math.round(result.buyTarget||0),
                        sellPrice:Math.round(result.sellPrice||0),
                        category:result.category||"General",
                      }),
                    });
                    const d = await r.json();
                    if(d.content?.tiktok?.hook) {
                      alert(`🎬 Your TikTok hook:

"${d.content.tiktok.hook}"

📝 Script ready — go to Profile to see all content.`);
                    }
                  } catch {}
                }}>
                  <Text style={s.refBtnTxt}>🎬 Get Content</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.refBtn,{flex:1,backgroundColor:"#1e2a08",borderWidth:1,borderColor:"#3a5010"}]} onPress={() => onNavigate("profile")}>
                  <Text style={[s.refBtnTxt,{color:"#a8e63d"}]}>💰 Referral Link</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <TouchableOpacity style={[s.greenBtn, { marginTop: 10 }]} onPress={reset}>
            <Text style={s.greenBtnText}>Scan Another Item →</Text>
          </TouchableOpacity>

          {plan === "free" && scansLeft !== null && (
            <Text style={[s.caption, { textAlign: "center", marginTop: 12 }]}>
              {scansLeft} free scan{scansLeft !== 1 ? "s" : ""} remaining this month
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── REVIEW (photo added, before analyze) ─────────────
  if (step === "review") return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" />
      <View style={s.nav}>
        <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
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
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 3 && (
            <View style={{ gap: 8, flexDirection: "row" }}>
              <TouchableOpacity onPress={() => setStep("camera")} style={s.addPhotoBtn}>
                <Text style={{ fontSize: 22 }}>📷</Text>
                <Text style={s.addPhotoBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickLibrary} style={s.addPhotoBtn}>
                <Text style={{ fontSize: 22 }}>🖼</Text>
                <Text style={s.addPhotoBtnText}>Library</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Description */}
        <Text style={[s.caption, { marginBottom: 6 }]}>Brand, model, or notes (optional but helpful)</Text>
        <TextInput
          style={s.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Nike Air Force 1, size 10, good condition"
          placeholderTextColor={C.text4}
          multiline numberOfLines={2}
        />

        {/* Scan counter */}
        {plan === "free" && scansLeft !== null && (
          <View style={[s.scanBadge, {
            borderColor: scansLeft === 0 ? C.red + "40" : scansLeft <= 1 ? C.yellow + "40" : C.green + "30",
            backgroundColor: scansLeft === 0 ? "#2a0505" : scansLeft <= 1 ? "#2a1500" : C.green + "10",
          }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green }} />
            <Text style={{ color: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green, fontSize: 12, fontWeight: "700" }}>
              {scansLeft === 0 ? "No scans left — upgrade to continue" : `${scansLeft} scan${scansLeft !== 1 ? "s" : ""} left this month`}
            </Text>
          </View>
        )}

        <TouchableOpacity style={[s.greenBtn, { marginTop: 14 }]} onPress={() => analyze()}>
          <Text style={s.greenBtnText}>Analyze Now →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ── BARCODE mode ──────────────────────────────────────
  if (step === "camera" && mode === "barcode") return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />
      <CameraView style={{ flex: 1, position: "absolute" as any, top:0, left:0, right:0, bottom:0 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13","ean8","upc_a","upc_e","qr","code128","code39"] }}
        onBarcodeScanned={handleBarcode} />
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.camTop}>
            <View style={s.camLogoBadge}><Text style={s.camLogoText}>ValuIQ</Text></View>
            <TouchableOpacity onPress={() => setMode("photo")} style={s.camModeBtn}>
              <Text style={s.camModeBtnText}>📷 Photo Mode</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {/* Barcode frame — rectangular */}
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
              Supports UPC, EAN, QR codes
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );

  // ── CAMERA (photo mode) ───────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />
      <CameraView ref={cameraRef} style={{ flex: 1, position: "absolute" as any, top: 0, left: 0, right: 0, bottom: 0 }} facing="back" />
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Top bar */}
          <View style={s.camTop}>
            <View style={s.camLogoBadge}><Text style={s.camLogoText}>ValuIQ</Text></View>
            {plan === "free" && scansLeft !== null && (
              <View style={[s.camScanBadge, { borderColor: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green }]}>
                <Text style={{ color: scansLeft === 0 ? C.red : scansLeft <= 1 ? C.yellow : C.green, fontSize: 11, fontWeight: "700" }}>
                  {scansLeft === 0 ? "No scans left" : `${scansLeft} left`}
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setMode("barcode")} style={s.camModeBtn}>
              <Text style={s.camModeBtnText}>|||  Barcode</Text>
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
            <Text style={s.camHint}>Point at any item to scan</Text>
          </View>

          {/* Quick actions */}
          <View style={s.quickActions}>
            <TouchableOpacity style={s.quickBtn} onPress={() => onNavigate("thrift-run")} activeOpacity={0.85}>
              <Text style={s.quickBtnIcon}>🛍️</Text>
              <Text style={s.quickBtnText}>Thrift Run</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.quickBtn} onPress={() => onNavigate("price-battle")} activeOpacity={0.85}>
              <Text style={s.quickBtnIcon}>⚡</Text>
              <Text style={s.quickBtnText}>Price Battle</Text>
            </TouchableOpacity>
          </View>

          {/* Controls */}
          <View style={s.camControls}>
            <TouchableOpacity style={s.camSecondBtn} onPress={pickLibrary}>
              <Text style={{ fontSize: 26 }}>🖼</Text>
              <Text style={s.camSecondLabel}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shutter} onPress={takePhoto}>
              <View style={s.shutterInner} />
            </TouchableOpacity>
            <View style={{ width: 64 }} />
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  h1:             { color: C.text1, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  h2:             { color: C.text1, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  body:           { color: C.text2, fontSize: 14, lineHeight: 21 },
  caption:        { color: C.text4, fontSize: 12, lineHeight: 18 },

  // Nav
  nav:            { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 8 },
  navBack:        { padding: 4 },
  navBackText:    { color: C.text3, fontSize: 24, lineHeight: 24 },
  navLogoRow:     { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon:       { width: 26, height: 26, backgroundColor: C.green, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  logoIconText:   { color: C.greenDark, fontSize: 13, fontWeight: "900" },
  logoText:       { color: C.text1, fontSize: 16, fontWeight: "800", letterSpacing: -0.5 },
  navBtn:         { borderWidth: 1, borderColor: C.border, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  navBtnText:     { color: C.text3, fontSize: 12, fontWeight: "600" },

  // Camera
  camTop:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  camLogoBadge:   { backgroundColor: "rgba(168,230,61,0.15)", borderWidth: 1, borderColor: "rgba(168,230,61,0.3)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  camLogoText:    { color: C.green, fontSize: 14, fontWeight: "900" },
  camScanBadge:   { borderWidth: 1, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "rgba(0,0,0,0.5)" },
  camModeBtn:     { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6 },
  camModeBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  corner:         { position: "absolute", width: 28, height: 28, borderColor: C.green, borderWidth: 3 },
  camHint:        { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 14, fontWeight: "600" },
  camControls:    { paddingBottom: 44, paddingTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 32 },
  camSecondBtn:   { width: 64, alignItems: "center" },
  camSecondLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 4 },
  camBottomBar:   { paddingBottom: 40, paddingHorizontal: 24 },
  shutter:        { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner:   { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },

  // Barcode
  barcodeFrame:   { width: width * 0.8, height: 120, position: "relative", justifyContent: "center", alignItems: "center" },
  barcodeLine:    { width: "100%", height: 2, backgroundColor: C.green + "80" },

  // Review
  photoThumb:     { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  removePhoto:    { position: "absolute", top: 4, right: 4, width: 20, height: 20, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  addPhotoBtn:    { width: 88, height: 88, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  addPhotoBtnText:{ color: C.text4, fontSize: 10, marginTop: 4 },
  textInput:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, color: C.text1, fontSize: 14, minHeight: 72, textAlignVertical: "top" },
  scanBadge:      { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 12, alignSelf: "flex-start" },

  // Result
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

  // Upgrade
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

  greenBtn:       { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  greenBtnText:   { color: C.greenDark, fontSize: 16, fontWeight: "900" },
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
});
