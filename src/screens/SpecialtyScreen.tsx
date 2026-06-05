import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { C } from "../lib/theme";
import { analyzeSpecialty } from "../lib/api";
import ShareButton from "../components/ShareButton";

const CATS = [
  { id:"sneakers", icon:"👟", label:"Sneaker Intelligence", desc:"Jordan, Dunk, Yeezy, New Balance, ASICS, Samba, On Running",
    fields:[{key:"brand",label:"Brand",ph:"e.g. Nike, Adidas, New Balance, Jordan Brand"},{key:"model",label:"Model / Colorway",ph:"e.g. Air Jordan 1 Retro High OG Chicago, Yeezy 350 V2 Zebra"},{key:"size",label:"US Size",ph:"e.g. 10, 10.5, 11"},{key:"condition",label:"Condition",ph:"e.g. Deadstock unworn, VNDS tried on once, Worn 5x"},{key:"box",label:"Box Status",ph:"e.g. OG box perfect, OG box damaged, No box"},{key:"extras",label:"Extras Included",ph:"e.g. Extra laces, Receipt, All tags attached"}] },
  { id:"designer_shoes", icon:"👠", label:"Designer Shoes", desc:"Louboutin, Chanel, Gucci, Jimmy Choo, Manolo Blahnik, Bottega",
    fields:[{key:"brand",label:"Designer Brand",ph:"e.g. Christian Louboutin, Chanel, Gucci, Bottega Veneta"},{key:"style",label:"Style Name / Model",ph:"e.g. So Kate 120, Ballet Flats, Princetown Mule"},{key:"size",label:"Size (EU/US)",ph:"e.g. EU 38 / US 8"},{key:"condition",label:"Condition",ph:"e.g. New in box, Worn once, Good with box and dustbag"},{key:"authentication",label:"Authenticity",ph:"e.g. Receipt, Dustbag, Auth card, Box"},{key:"material",label:"Material",ph:"e.g. Patent leather, Suede, Canvas"}] },
  { id:"handbags", icon:"👜", label:"Luxury Handbags", desc:"Chanel, Louis Vuitton, Hermes, Gucci, Prada, Bottega Veneta",
    fields:[{key:"brand",label:"Brand",ph:"e.g. Chanel, Louis Vuitton, Hermes, Prada"},{key:"model",label:"Model / Style",ph:"e.g. Classic Flap Medium, Neverfull MM, Birkin 30"},{key:"material",label:"Material / Color",ph:"e.g. Black caviar leather, Monogram canvas, Togo leather noir"},{key:"hardware",label:"Hardware Color",ph:"e.g. Gold hardware, Silver hardware, Palladium"},{key:"condition",label:"Condition",ph:"e.g. Pristine with tags, Excellent, Good with minor wear"},{key:"accessories",label:"Accessories Included",ph:"e.g. Dustbag, box, authenticity card, receipt"}] },
  { id:"watches", icon:"⌚", label:"Luxury Watches", desc:"Rolex, Omega, Patek Philippe, AP, IWC, Cartier, vintage",
    fields:[{key:"brand",label:"Brand",ph:"e.g. Rolex, Omega, Patek Philippe, Audemars Piguet"},{key:"model",label:"Model / Reference",ph:"e.g. Submariner Date 126610LN, Speedmaster Professional"},{key:"year",label:"Approximate Year",ph:"e.g. 2019, 1960s, Unknown"},{key:"condition",label:"Condition",ph:"e.g. Excellent full set, Good with box papers, Watch only"},{key:"box_papers",label:"Box & Papers",ph:"e.g. Full set B+P, Box only, No papers"},{key:"serial",label:"Serial / Reference Number",ph:"e.g. Serial starts with 5, Ref 116610"}] },
  { id:"wine", icon:"🍷", label:"Fine Wine", desc:"Bordeaux, Burgundy, Napa Cabs, Champagne, Barolo, Italian",
    fields:[{key:"winery",label:"Winery / Producer",ph:"e.g. Opus One, Dom Pérignon, Screaming Eagle, Pétrus"},{key:"vintage",label:"Vintage Year",ph:"e.g. 2015"},{key:"varietal",label:"Varietal / Type",ph:"e.g. Cabernet Sauvignon, Pinot Noir, Chardonnay"},{key:"region",label:"Region / Appellation",ph:"e.g. Napa Valley, Pomerol, Burgundy Côte de Nuits"},{key:"format",label:"Bottle Size",ph:"e.g. 750ml, Magnum 1.5L, Jeroboam 3L"},{key:"condition",label:"Label & Fill Condition",ph:"e.g. Perfect fill, Minor label scuff, Into neck"}] },
  { id:"spirits", icon:"🥃", label:"Spirits & Whiskey", desc:"Pappy, Blanton's, Macallan, Weller, Japanese, allocated bourbon",
    fields:[{key:"distillery",label:"Distillery / Brand",ph:"e.g. Pappy Van Winkle, Buffalo Trace, Macallan, Weller"},{key:"expression",label:"Expression / Name",ph:"e.g. 23 Year, Single Barrel, Double Oaked, BTAC"},{key:"ageStatement",label:"Age Statement",ph:"e.g. 12 Year, 23 Year, No Age Statement"},{key:"spiritType",label:"Spirit Type",ph:"e.g. Kentucky Bourbon, Scotch Single Malt, Japanese Whisky"},{key:"bottleSize",label:"Bottle Size",ph:"e.g. 750ml, 1L, 375ml"},{key:"condition",label:"Seal & Label Condition",ph:"e.g. Sealed perfect, Tax strip intact, Unopened"}] },
  { id:"cards", icon:"🃏", label:"Trading Cards", desc:"PSA/BGS graded, raw, Pokemon, MTG, sports rookies, vintage",
    fields:[{key:"cardType",label:"Card Type / Sport",ph:"e.g. Baseball, Pokemon, Magic: The Gathering, Basketball"},{key:"player",label:"Player / Character / Set",ph:"e.g. Mickey Mantle 1952 Topps, Charizard Base Set, LeBron Rookie"},{key:"year",label:"Year & Set Name",ph:"e.g. 1952 Topps, 1999 Base Set 1st Edition, 2003-04 Topps Chrome"},{key:"cardNumber",label:"Card Number",ph:"e.g. #311, #4/102, RC-LJ"},{key:"condition",label:"Condition / Grade",ph:"e.g. PSA 10 Gem Mint, BGS 9.5, Raw Near Mint"},{key:"variation",label:"Variation / Parallel",ph:"e.g. Holo rare, 1st Edition, Refractor, Gold /10"}] },
  { id:"vintage_clothing", icon:"👗", label:"Vintage Clothing & Streetwear", desc:"Supreme, Stussy, vintage band tees, Levis, varsity jackets",
    fields:[{key:"brand",label:"Brand / Label",ph:"e.g. Supreme, Stussy, Levi's, vintage band tee"},{key:"item",label:"Item Type",ph:"e.g. Box logo hoodie, 501 jeans, Varsity jacket, Graphic tee"},{key:"size",label:"Size",ph:"e.g. L, XL, 32x30, One size"},{key:"era",label:"Era / Year",ph:"e.g. 1990s, 2005 F/W season, Vintage 1970s"},{key:"condition",label:"Condition",ph:"e.g. Deadstock, Excellent, Good with fading"},{key:"details",label:"Notable Details",ph:"e.g. Selvedge denim, Single stitch, Made in USA"}] },
  { id:"jerseys", icon:"🏆", label:"Sports Jerseys & Memorabilia", desc:"Game-worn, autographed, rookie era, PSA authenticated, rare",
    fields:[{key:"player",label:"Player Name",ph:"e.g. Michael Jordan, Tom Brady, Wayne Gretzky"},{key:"team",label:"Team & Year",ph:"e.g. 1996 Chicago Bulls, 2007 New England Patriots"},{key:"type",label:"Item Type",ph:"e.g. Game-worn jersey, Signed photo, Rookie card, Bat"},{key:"authentication",label:"Authentication",ph:"e.g. PSA/DNA, JSA, Beckett, MLB authenticated, None"},{key:"condition",label:"Condition",ph:"e.g. Mint in case, Excellent, Good"},{key:"details",label:"Special Details",ph:"e.g. Championship season, MVP year, Final season"}] },
  { id:"instruments", icon:"🎸", label:"Musical Instruments", desc:"Gibson, Fender, vintage amps, Martin acoustics, rare synths",
    fields:[{key:"brand",label:"Brand / Maker",ph:"e.g. Gibson, Fender, Martin, Hammond, Moog"},{key:"model",label:"Model / Year",ph:"e.g. Les Paul Standard 1959, Stratocaster 1965, D-28 1970"},{key:"serial",label:"Serial Number",ph:"e.g. Starts with 9, No serial, #123456"},{key:"condition",label:"Condition",ph:"e.g. All original excellent, Refin, Mods, Player grade"},{key:"case",label:"Case / Extras",ph:"e.g. Original HSC, Gigbag, No case"},{key:"modifications",label:"Modifications",ph:"e.g. All original, Replaced tuners, Refret"}] },
  { id:"video_games", icon:"🎮", label:"Video Games & Consoles", desc:"Factory sealed, CIB, rare titles, complete collections, graded",
    fields:[{key:"title",label:"Game Title / Console",ph:"e.g. Super Mario Bros NES, Earthbound SNES, PS1 game"},{key:"platform",label:"Platform",ph:"e.g. NES, SNES, N64, PS1, Sega Genesis, Atari"},{key:"condition",label:"Condition",ph:"e.g. Factory sealed, CIB complete, Cart only, Wata 9.4"},{key:"region",label:"Region",ph:"e.g. US NTSC, PAL, Japan import"},{key:"graded",label:"Graded?",ph:"e.g. Wata 9.4 A, VGA 85, Raw ungraded"},{key:"extras",label:"Extras Included",ph:"e.g. Manual, poster, inserts all intact"}] },
  { id:"lego", icon:"🧱", label:"LEGO Sets", desc:"Retired sets, UCS Star Wars, Icons, sealed, rare minifigs",
    fields:[{key:"setName",label:"Set Name",ph:"e.g. Millennium Falcon, Eiffel Tower, Hogwarts Castle"},{key:"setNumber",label:"Set Number",ph:"e.g. 75192, 10307, 71043"},{key:"theme",label:"Theme",ph:"e.g. Star Wars, Icons, Harry Potter, Technic"},{key:"condition",label:"Condition",ph:"e.g. New sealed, Open complete, Used"},{key:"retired",label:"Retired?",ph:"e.g. Yes retired 2022, Still available"},{key:"completeness",label:"If Open: Complete?",ph:"e.g. 100% complete with manual, Missing 3 pieces"}] },
  { id:"funko", icon:"🎭", label:"Funko Pops", desc:"Chase variants, grail pops, SDCC exclusives, vaulted, 1000pc",
    fields:[{key:"character",label:"Character / Pop Name",ph:"e.g. Freddy Funko, Dumbo, Batman Blue Chrome"},{key:"number",label:"Pop Number",ph:"e.g. #01, #12, #287"},{key:"series",label:"Series / Line",ph:"e.g. Marvel, DC, Disney, SDCC 2019 exclusive"},{key:"condition",label:"Box Condition",ph:"e.g. Mint box, C8 minor dent, Box crease"},{key:"variant",label:"Variant Type",ph:"e.g. Chase 1/6, SDCC exclusive, Hot Topic exclusive, Standard"},{key:"vaulted",label:"Vaulted / Retired?",ph:"e.g. Yes vaulted 2018, Limited run 1000pc, Standard"}] },
  { id:"coins", icon:"🪙", label:"Coins & Currency", desc:"US coins, world coins, paper currency, bullion, error coins",
    fields:[{key:"coinType",label:"Coin / Note Type",ph:"e.g. Morgan Dollar, Peace Dollar, $2 Bill, Gold Eagle"},{key:"year",label:"Year & Mint Mark",ph:"e.g. 1921-D, 1884-S, 1916-D Mercury Dime"},{key:"grade",label:"Grade / Condition",ph:"e.g. MS-65, VF-30, Circulated, Proof"},{key:"certified",label:"Certified?",ph:"e.g. PCGS MS-65, NGC VF-35, Raw uncertified"},{key:"errors",label:"Errors / Varieties?",ph:"e.g. Double die obverse, VAM-4, No known errors"},{key:"toning",label:"Toning / Appearance",ph:"e.g. Original skin, Rainbow toning, Cleaned"}] },
  { id:"jewelry", icon:"💎", label:"Fine & Vintage Jewelry", desc:"Signed costume, sterling, diamonds, designer, estate pieces",
    fields:[{key:"maker",label:"Maker / Designer",ph:"e.g. Trifari, Monet, Cartier, unsigned"},{key:"material",label:"Material",ph:"e.g. 14k gold, Sterling silver, Platinum, Bakelite"},{key:"itemType",label:"Piece Type",ph:"e.g. Brooch, Necklace, Ring, Bracelet, Earrings"},{key:"era",label:"Era / Style",ph:"e.g. Art Deco 1930s, Mid-century 1950s, Victorian"},{key:"condition",label:"Condition",ph:"e.g. Excellent, Missing stones, Clasp needs repair"},{key:"stones",label:"Stones / Details",ph:"e.g. Old European cut diamond 1.2ct, Faux pearls, Rhinestones"}] },
  { id:"art", icon:"🖼️", label:"Art & Prints", desc:"Original art, limited prints, lithographs, signed, investment pieces",
    fields:[{key:"artist",label:"Artist Name",ph:"e.g. Norman Rockwell, Andy Warhol, Thomas Kinkade"},{key:"title",label:"Title / Subject",ph:"e.g. The Problem We All Live With, Marilyn Monroe"},{key:"medium",label:"Medium / Type",ph:"e.g. Oil on canvas, Lithograph, Screen print, Giclée"},{key:"size",label:"Size",ph:"e.g. 16x20 inches, 24x36"},{key:"signed",label:"Signed / Numbered?",ph:"e.g. Hand signed 45/500, Plate signed, Unsigned AP"},{key:"condition",label:"Condition",ph:"e.g. Excellent no foxing, Minor foxing, Canvas crack"}] },
  { id:"antiques", icon:"🏛️", label:"Antiques & Pottery", desc:"McCoy, Roseville, Fiestaware, Hull, Wedgwood, Royal Doulton",
    fields:[{key:"maker",label:"Maker / Marks",ph:"e.g. McCoy USA, Roseville, Fiestaware, unmarked"},{key:"pattern",label:"Pattern / Line Name",ph:"e.g. Butterprint, Magnolia, Cobalt Blue"},{key:"itemType",label:"Item Type",ph:"e.g. Vase, Cookie jar, Pitcher, Figurine"},{key:"era",label:"Approximate Era",ph:"e.g. 1940s, Art Deco 1930s, Victorian 1890s"},{key:"condition",label:"Condition",ph:"e.g. Mint no chips, Hairline crack, Chip on rim"},{key:"size",label:"Size / Dimensions",ph:"e.g. 8 inch vase, 12 inch bowl"}] },
  { id:"cameras", icon:"📸", label:"Cameras & Lenses", desc:"Leica, Hasselblad, vintage film, Nikon, Canon L glass, rare",
    fields:[{key:"brand",label:"Brand",ph:"e.g. Leica, Hasselblad, Nikon, Canon, Rolleiflex"},{key:"model",label:"Model",ph:"e.g. Leica M6, Hasselblad 500C/M, Nikon F3"},{key:"type",label:"Type",ph:"e.g. 35mm film SLR, Medium format, Rangefinder, Lens only"},{key:"condition",label:"Condition",ph:"e.g. Excellent CLA done, Good light seals needed, Parts only"},{key:"includes",label:"Included",ph:"e.g. Body + 50mm lens, Body only, Lens only"},{key:"serial",label:"Serial / Age",ph:"e.g. Black paint 1962, Chrome 1975, Unknown"}] },
  { id:"vintage_toys", icon:"🧸", label:"Vintage Toys & Games", desc:"Barbie, Hot Wheels, Star Wars vintage, GI Joe, Marx, tin toys",
    fields:[{key:"brand",label:"Brand / Maker",ph:"e.g. Mattel, Hasbro, Kenner, Marx, Ideal"},{key:"itemName",label:"Toy Name / Character",ph:"e.g. 1977 Luke Skywalker, #47 Hot Wheels, Barbie #1"},{key:"year",label:"Year / Era",ph:"e.g. 1977, 1960s, Original 1959 run"},{key:"condition",label:"Condition",ph:"e.g. Mint in sealed box, Complete loose, Used played with"},{key:"hasBox",label:"Original Box / Card?",ph:"e.g. Near mint box, Punch out box, No box, On original card"},{key:"completeness",label:"Complete?",ph:"e.g. 100% complete with accessories, Missing lightsaber, Figure only"}] },
  { id:"tools", icon:"🔧", label:"Vintage & Pro Tools", desc:"Snap-On, Craftsman USA, Stanley, Milwaukee, machinist tools",
    fields:[{key:"brand",label:"Brand",ph:"e.g. Snap-On, Craftsman USA, Stanley, Starrett"},{key:"item",label:"Item / Set",ph:"e.g. Socket set, Torque wrench, Machinist gauge"},{key:"era",label:"Era / Made In",ph:"e.g. Made in USA 1970s, Pre-1990 Craftsman, Unknown"},{key:"condition",label:"Condition",ph:"e.g. Excellent like new, Good working, Well used"},{key:"complete",label:"Complete?",ph:"e.g. Full set complete, Missing 3 sockets"},{key:"type",label:"Type",ph:"e.g. Hand tools, Power tool, Measuring tool"}] },
];

interface Props { token:string; plan:string; scansLeft:number|null; setScansLeft:(n:number|null)=>void; onNavigate:(s:string)=>void; onBack?:()=>void; onLogout:()=>void; }

export default function SpecialtyScreen({ token, onNavigate, onBack }: Props) {
  const [selectedCat, setSelectedCat] = useState<typeof CATS[0]|null>(null);
  const [fields, setFields] = useState<Record<string,string>>({});
  const [photo, setPhoto] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaType.Images, base64: true, quality: 0.7 });
    if (!res.canceled && res.assets[0]?.base64) setPhoto(res.assets[0].base64);
  }

  async function takePhoto() {
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!res.canceled && res.assets[0]?.base64) setPhoto(res.assets[0].base64);
  }

  async function analyze() {
    if (!selectedCat) return;
    if (!Object.values(fields).some(v => v.trim()) && !photo) { setError("Fill in at least one field or add a photo."); return; }
    setLoading(true); setError("");
    try {
      const d = await analyzeSpecialty(token, selectedCat.id, fields, photo || undefined);
      if (!d.success) throw new Error(d.error || "Analysis failed");
      setResult(d);
    } catch (e: any) { setError(e.message || "Analysis failed. Try again."); }
    setLoading(false);
  }

  function reset() { setSelectedCat(null); setFields({}); setPhoto(null); setResult(null); setError(""); }

  // ── CATEGORY GRID ──────────────────────────────────────
  if (!selectedCat) return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.nav}>
        <TouchableOpacity onPress={() => onBack?.()} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={s.h1}>🏺 Specialty Scanner</Text>
        <Text style={[s.body, { marginBottom: 20 }]}>Expert AI with deep category knowledge — 10x more accurate than a general scan.</Text>
        <View style={s.catGrid}>
          {CATS.map(cat => (
            <TouchableOpacity key={cat.id} style={s.catCard} onPress={() => { setSelectedCat(cat); setFields({}); }} activeOpacity={0.7}>
              <Text style={s.catIcon}>{cat.icon}</Text>
              <Text style={s.catLabel}>{cat.label}</Text>
              <Text style={s.catDesc}>{cat.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // ── RESULT ─────────────────────────────────────────────
  if (result) return (
    <SafeAreaView style={s.safe}>
      <View style={s.nav}>
        <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
        <TouchableOpacity onPress={reset} style={[s.navBtn, { marginLeft: "auto" as any }]}><Text style={s.navBtnText}>New Scan</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
        <View style={s.catBadge}>
          <Text style={{ fontSize: 22 }}>{selectedCat.icon}</Text>
          <Text style={s.catBadgeText}>{selectedCat.label}</Text>
        </View>

        {/* Value Card */}
        <View style={s.valCard}>
          <Text style={s.valLabel}>ESTIMATED VALUE</Text>
          <Text style={s.valAmount}>{result.valueRange || result.estimatedValue || "See analysis"}</Text>
          {result.confidence && <Text style={s.valSub}>Confidence: {result.confidence}</Text>}
          {result.trend && <Text style={[s.valSub, { color: result.trend === "rising" ? C.green : result.trend === "falling" ? C.red : C.yellow, marginTop: 4 }]}>
            {result.trend === "rising" ? "📈 Market trending up" : result.trend === "falling" ? "📉 Market trending down" : "→ Market stable"}
          </Text>}
        </View>

        {/* Decision */}
        {result.decision && (
          <View style={[s.decCard, { borderColor: (result.decision === "BUY" ? C.green : result.decision === "WATCH" ? C.yellow : C.red) + "40" }]}>
            <Text style={[s.decText, { color: result.decision === "BUY" ? C.green : result.decision === "WATCH" ? C.yellow : C.red }]}>
              {result.decision === "BUY" ? "💰 BUY IT" : result.decision === "WATCH" ? "👀 WATCH IT" : "🚫 PASS"}
            </Text>
            {result.maxPayPrice && <Text style={{ color: C.text2, fontSize: 13, marginTop: 6 }}>Max pay: <Text style={{ color: C.green, fontWeight: "800" }}>{result.maxPayPrice}</Text></Text>}
          </View>
        )}

        {/* Platform Prices */}
        {result.platformPrices && result.platformPrices.length > 0 && (
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>💰 Platform Prices</Text>
            {result.platformPrices.map((p: any, i: number) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: i < result.platformPrices.length - 1 ? 1 : 0, borderBottomColor: C.border }}>
                <Text style={{ color: C.text2, fontSize: 13 }}>{p.platform}</Text>
                <Text style={{ color: C.green, fontSize: 13, fontWeight: "800" }}>{p.price}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Analysis */}
        {result.analysis && (
          <View style={s.infoCard}><Text style={s.infoLabel}>🧠 Expert Analysis</Text><Text style={s.infoText}>{result.analysis}</Text></View>
        )}

        {/* Sell Strategy */}
        {result.sellStrategy && (
          <View style={s.infoCard}><Text style={s.infoLabel}>🎯 How To Sell It</Text><Text style={s.infoText}>{result.sellStrategy}</Text></View>
        )}

        {/* Authenticity Check */}
        {result.authenticityFlags && (
          <View style={[s.infoCard, { borderColor: C.red + "30", backgroundColor: "#1a0505" }]}>
            <Text style={[s.infoLabel, { color: C.red }]}>🔍 Authenticity Check</Text>
            <Text style={s.infoText}>{result.authenticityFlags}</Text>
          </View>
        )}

        {/* Watch Out */}
        {result.watchOut && (
          <View style={[s.infoCard, { borderColor: C.yellow + "30", backgroundColor: "#1a1508" }]}>
            <Text style={[s.infoLabel, { color: C.yellow }]}>⚠️ Watch Out For</Text>
            <Text style={s.infoText}>{result.watchOut}</Text>
          </View>
        )}

        {/* Timing */}
        {result.bestTimeToSell && (
          <View style={s.infoCard}><Text style={s.infoLabel}>📅 Best Time To Sell</Text><Text style={s.infoText}>{result.bestTimeToSell}</Text></View>
        )}

        {/* Pro Tips */}
        {result.proTips && result.proTips.length > 0 && (
          <View style={s.infoCard}>
            <Text style={s.infoLabel}>⚡ Pro Tips</Text>
            {result.proTips.map((tip: string, i: number) => (
              <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                <Text style={{ color: C.green, fontSize: 13 }}>→</Text>
                <Text style={{ color: C.text2, fontSize: 13, lineHeight: 20, flex: 1 }}>{tip}</Text>
              </View>
            ))}
          </View>
        )}

        <ShareButton compact
          message={"🏺 " + selectedCat.label + " scan via ValuIQ\n\n" + (result.itemName || selectedCat.label) + "\nValue: " + (result.valueRange || result.estimatedValue || "See app") + "\n\ngetvaluiq.com"}
        />

        <TouchableOpacity style={[s.greenBtn, { marginTop: 10 }]} onPress={() => { setResult(null); }}>
          <Text style={s.greenBtnText}>Scan Another →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.greenBtn, { marginTop: 8, backgroundColor: C.surface }]} onPress={reset}>
          <Text style={[s.greenBtnText, { color: C.text3 }]}>Change Category</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ── INPUT FORM ─────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.nav}>
        <TouchableOpacity onPress={reset} style={s.navBack}><Text style={s.navBackText}>←</Text></TouchableOpacity>
        <View style={s.logoRow}><View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View><Text style={s.logoText}>ValuIQ</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={{flexDirection:"row", alignItems:"center", gap:10, marginBottom:10}}>
          <View style={[s.catBadge, {marginBottom:0, flex:1}]}>
            <Text style={{ fontSize: 22 }}>{selectedCat.icon}</Text>
            <Text style={s.catBadgeText}>{selectedCat.label}</Text>
          </View>
          <TouchableOpacity onPress={reset} style={{borderWidth:1, borderColor:C.border, borderRadius:10, paddingHorizontal:12, paddingVertical:10}}>
            <Text style={{color:C.text3, fontSize:12, fontWeight:"700"}}>Change ↓</Text>
          </TouchableOpacity>
        </View>
        <View style={s.expertBadge}>
          <Text style={s.expertText}>⚡ Expert AI — Deep specialty knowledge activated</Text>
        </View>
        <Text style={[s.body, { marginBottom: 16 }]}>{selectedCat.desc}</Text>

        {error ? <View style={s.errBox}><Text style={s.errText}>{error}</Text></View> : null}

        {/* Photo */}
        {photo ? (
          <TouchableOpacity onPress={pickPhoto} style={s.photoBtn}>
            <Image source={{ uri: "data:image/jpeg;base64," + photo }} style={{ width: "100%", height: 150, borderRadius: 10 }} resizeMode="cover" />
            <Text style={{color:C.text4, fontSize:11, marginTop:6}}>Tap to change photo</Text>
          </TouchableOpacity>
        ) : (
          <View style={{flexDirection:"row", gap:10, marginBottom:18}}>
            <TouchableOpacity onPress={takePhoto} style={[s.photoHalf, {borderColor:C.green+"40"}]} activeOpacity={0.8}>
              <Text style={{fontSize:28, marginBottom:4}}>📷</Text>
              <Text style={{color:C.green, fontSize:13, fontWeight:"800"}}>Camera</Text>
              <Text style={{color:C.text4, fontSize:11}}>Take photo now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickPhoto} style={s.photoHalf} activeOpacity={0.8}>
              <Text style={{fontSize:28, marginBottom:4}}>🖼️</Text>
              <Text style={{color:C.text2, fontSize:13, fontWeight:"800"}}>Gallery</Text>
              <Text style={{color:C.text4, fontSize:11}}>Choose from library</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fields */}
        {selectedCat.fields.map(f => (
          <View key={f.key} style={{ marginBottom: 14 }}>
            <Text style={s.label}>{f.label}</Text>
            <TextInput
              style={s.input}
              value={fields[f.key] || ""}
              onChangeText={v => setFields(prev => ({ ...prev, [f.key]: v }))}
              placeholder={f.ph}
              placeholderTextColor={C.text4}
            />
          </View>
        ))}

        <TouchableOpacity style={[s.greenBtn, { marginTop: 8 }]} onPress={analyze} disabled={loading}>
          {loading
            ? <><ActivityIndicator color={C.greenDark} /><Text style={[s.greenBtnText, { marginTop: 4 }]}>Analyzing with expert AI...</Text></>
            : <Text style={s.greenBtnText}>Get Expert Analysis →</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  nav:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, gap: 8 },
  navBack:       { padding: 4 },
  navBackText:   { color: C.text3, fontSize: 24, lineHeight: 24 },
  logoRow:       { flexDirection: "row", alignItems: "center", gap: 8 },
  logoIcon:      { width: 26, height: 26, backgroundColor: C.green, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  logoIconText:  { color: C.greenDark, fontSize: 13, fontWeight: "900" },
  logoText:      { color: C.text1, fontSize: 16, fontWeight: "800", letterSpacing: -0.5 },
  navBtn:        { borderWidth: 1, borderColor: C.border, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  navBtnText:    { color: C.text3, fontSize: 12, fontWeight: "600" },
  h1:            { color: C.text1, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, marginBottom: 4 },
  body:          { color: C.text2, fontSize: 14, lineHeight: 21 },
  label:         { color: C.text3, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input:         { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, color: C.text1, fontSize: 14 },
  catGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catCard:       { width: "47%", backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16 },
  catIcon:       { fontSize: 32, marginBottom: 10 },
  catLabel:      { color: C.text1, fontSize: 13, fontWeight: "800", marginBottom: 4 },
  catDesc:       { color: C.text4, fontSize: 11, lineHeight: 16 },
  catBadge:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, alignSelf: "flex-start" as any },
  catBadgeText:  { color: C.text1, fontSize: 15, fontWeight: "800" },
  expertBadge:   { backgroundColor: "#0a1500", borderWidth: 1, borderColor: C.green + "40", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 },
  expertText:    { color: C.green, fontSize: 12, fontWeight: "700" },
  photoBtn:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", borderRadius: 14, padding: 20, alignItems: "center", marginBottom: 18 },
  photoBtnText:  { color: C.text4, fontSize: 13 },
  photoHalf:     { flex:1, backgroundColor:C.surface, borderWidth:1, borderColor:C.border, borderRadius:14, padding:16, alignItems:"center" },
  greenBtn:      { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  greenBtnText:  { color: C.greenDark, fontSize: 16, fontWeight: "900" },
  errBox:        { backgroundColor: "#1a0505", borderWidth: 1, borderColor: C.red + "40", borderRadius: 10, padding: 12, marginBottom: 12 },
  errText:       { color: C.red, fontSize: 13 },
  valCard:       { backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 2, borderColor: C.green + "30", borderRadius: 20, padding: 24, alignItems: "center", marginBottom: 12 },
  valLabel:      { color: C.text4, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 },
  valAmount:     { color: C.green, fontSize: 38, fontWeight: "900", letterSpacing: -1, marginBottom: 4 },
  valSub:        { color: C.text3, fontSize: 13 },
  decCard:       { borderWidth: 2, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 12 },
  decText:       { fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  infoCard:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, marginBottom: 10 },
  infoLabel:     { color: C.text4, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  infoText:      { color: C.text2, fontSize: 13, lineHeight: 21 },
});
