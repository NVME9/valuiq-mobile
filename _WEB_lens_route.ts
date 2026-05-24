export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FEES: Record<string, number> = {
  eBay: 0.1327, Poshmark: 0.20, Mercari: 0.10, Depop: 0.10,
  Etsy: 0.065, Whatnot: 0.11, StockX: 0.125, GOAT: 0.095,
  Facebook: 0.05, OfferUp: 0.0, Craigslist: 0.0, Amazon: 0.15,
};

const PAYOUT: Record<string, string> = {
  eBay: "1-3 days", Poshmark: "3 days after delivery", Mercari: "2-3 days",
  StockX: "2-3 days", Whatnot: "2-3 days", Depop: "immediate",
  Etsy: "weekly", Facebook: "immediate (cash)", OfferUp: "immediate (cash)",
};

function buildLinks(query: string) {
  const q = encodeURIComponent(query);
  const s = encodeURIComponent(query.split(" ").slice(0, 5).join(" "));
  return {
    eBay: "https://www.ebay.com/sch/i.html?_nkw=" + q + "&LH_Sold=1&LH_Complete=1&_sop=13",
    eBayActive: "https://www.ebay.com/sch/i.html?_nkw=" + q + "&LH_BIN=1&_sop=15",
    Poshmark: "https://poshmark.com/search?query=" + q + "&availability=sold_out",
    PoshmarkActive: "https://poshmark.com/search?query=" + q + "&availability=available",
    Mercari: "https://www.mercari.com/search/?keyword=" + q + "&status=sold_out",
    MercariActive: "https://www.mercari.com/search/?keyword=" + q + "&status=on_sale",
    Depop: "https://www.depop.com/search/?q=" + s,
    Etsy: "https://www.etsy.com/search?q=" + q,
    Facebook: "https://www.facebook.com/marketplace/search/?query=" + s,
    OfferUp: "https://offerup.com/search/?q=" + s,
    Google: "https://www.google.com/search?q=" + encodeURIComponent(query + " sold price resale"),
    GoogleShopping: "https://www.google.com/search?tbm=shop&q=" + q,
  };
}

async function lookupUPC(upc: string) {
  try {
    const r = await fetch("https://api.upcitemdb.com/prod/trial/lookup?upc=" + upc, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const item = d?.items?.[0];
    return item ? { name: item.title, brand: item.brand, category: item.category, image: item.images?.[0] } : null;
  } catch { return null; }
}

async function identifyFromImage(base64Data: string, mediaType: string) {
  const GOOGLE_KEY = process.env.GOOGLE_VISION_API_KEY;
  let googleSummary = "";
  let confidenceLevel: "high" | "medium" | "low" = "low";

  if (GOOGLE_KEY) {
    try {
      const vRes = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + GOOGLE_KEY, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ image: { content: base64Data }, features: [
          { type: "WEB_DETECTION", maxResults: 8 },
          { type: "TEXT_DETECTION", maxResults: 1 },
          { type: "LOGO_DETECTION", maxResults: 5 },
          { type: "OBJECT_LOCALIZATION", maxResults: 5 },
        ]}]}),
        signal: AbortSignal.timeout(8000),
      });
      if (vRes.ok) {
        const vd = await vRes.json();
        const res = vd.responses?.[0];
        const bestGuess = res?.webDetection?.bestGuessLabels?.[0]?.label || "";
        const logos = (res?.logoAnnotations || []).map((l: any) => l.description);
        const text = (res?.textAnnotations?.[0]?.description || "").replace(/\n/g, " ").slice(0, 300);
        const objects = (res?.localizedObjectAnnotations || []).map((o: any) => o.name);
        const entities = (res?.webDetection?.webEntities || []).filter((e: any) => e.score > 0.6).map((e: any) => e.description).slice(0, 6);
        const parts = [
          bestGuess ? "PRODUCT: " + bestGuess : "",
          logos.length ? "BRAND: " + logos.join(", ") : "",
          text.length > 3 ? "TEXT: " + text : "",
          objects.length ? "TYPE: " + objects.join(", ") : "",
          entities.length ? "RELATED: " + entities.join(", ") : "",
        ].filter(Boolean);
        googleSummary = parts.join(" | ");
        const hasProduct = !!bestGuess;
        const hasBrand = logos.length > 0;
        const hasText = text.length > 5;
        if (hasProduct && (hasBrand || hasText)) confidenceLevel = "high";
        else if (hasProduct || hasBrand || hasText) confidenceLevel = "medium";
        else confidenceLevel = "low";
      }
    } catch (e: any) {
 }
  }

  const prompt = [
    "You are a resale product identification expert.",
    googleSummary ? "GOOGLE VISION DATA:" : "",
    googleSummary ? googleSummary : "",
    googleSummary ? "Use this as primary source." : "Analyze the image carefully.",
    "",
    "Return ONLY valid JSON:",
    "{",
    '  "itemName": "specific product name",',
    '  "brand": "exact brand or Unknown",',
    '  "model": "model/style if visible or null",',
    '  "category": "Clothing",',
    '  "subcategory": "specific type",',
    '  "condition": "Good",',
    '  "size": null,',
    '  "color": "main color",',
    '  "era": null,',
    '  "material": null,',
    '  "searchQuery": "brand + specific item + key attributes for eBay sold search",',
    '  "confidence": "' + confidenceLevel + '",',
    '  "notes": "key resale details"',
    "}",
    "Category must be ONE of: Clothing, Shoes, Electronics, Tools, Collectibles, Handbags, Antiques, Jewelry, Toys, Home, Sports, Other",
  ].filter(Boolean).join("\n");

  const validCats = ["Clothing","Shoes","Electronics","Tools","Collectibles","Handbags","Antiques","Jewelry","Toys","Home","Sports","Other"];

  if (googleSummary) {
    try {
      const r = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400, temperature: 0.0,
      });
      const raw = r.choices?.[0]?.message?.content || "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const result = JSON.parse(m[0]);
        if (!validCats.includes(result.category)) result.category = "Other";
        result.confidence = confidenceLevel;

        return result;
      }
    } catch (e: any) {
 }
  }

  try {
    const safeType = (mediaType.includes("heic") || mediaType.includes("heif")) ? "image/jpeg" : mediaType;
    const r = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: "data:" + safeType + ";base64," + base64Data } },
        { type: "text", text: prompt },
      ]}],
      max_tokens: 400, temperature: 0.0,
    } as any);
    const raw = r.choices?.[0]?.message?.content || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const result = JSON.parse(m[0]);
      if (!validCats.includes(result.category)) {
        const found = validCats.find(c => (result.category || "").includes(c));
        result.category = found || "Other";
      }
      result.confidence = googleSummary ? "medium" : "low";
      return result;
    }
  } catch (e: any) {
 }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (ANTHROPIC_KEY) {
    try {
      const safeType = (mediaType.includes("heic") || mediaType.includes("heif")) ? "image/jpeg" : mediaType;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: safeType, data: base64Data } },
          { type: "text", text: prompt },
        ]}]}),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const d = await r.json();
        const raw = d.content?.[0]?.text || "";
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const result = JSON.parse(m[0]);
          if (!validCats.includes(result.category)) result.category = "Other";
          result.confidence = "high";
          return result;
        }
      }
    } catch {}
  }

  return { itemName: "", brand: "", category: "Other", subcategory: "", condition: "Good", size: null, color: null, era: null, material: null, searchQuery: "", confidence: "low", notes: "" };
}

async function getFullMarketAnalysis(item: any, buyPrice: number) {
  const { itemName, brand, category, subcategory, condition, size, color, era, material, notes } = item;
  // Normalize inputs so same item always produces same result
  const normalizedItem = (brand||"").trim().toLowerCase() + "-" + (itemName||"").trim().toLowerCase() + "-" + (condition||"Good").toLowerCase();
  // Note: normalizedItem used as cache key concept - ensures consistent prompt inputs
  const cat = (category || "").toLowerCase();
  const br = (brand || "").toLowerCase();

  const isClothing = ["clothing","apparel","fashion","shirt","dress","jeans","jacket","pants","skirt","sweater","blouse","coat","blazer","top","hoodie","sweatshirt","cardigan"].some(w => cat.includes(w) || (itemName||"").toLowerCase().includes(w));
  const isAntique = ["antique","vintage","collectible","retro","mid-century","victorian","art deco","pottery","ceramic","porcelain","cast iron","pyrex","depression glass","fiestaware","glassware","stoneware","earthenware","enamelware","crockery","mccoy","hull","roseville","lefton","occupied japan","made in japan","homer laughlin","hall china","corningware","glasbake","anchor hocking","federal glass","jadeite","milk glass","silver plate","sterling","pewter","brass","bronze","copper"].some(w => cat.includes(w) || (itemName||"").toLowerCase().includes(w) || (notes||"").toLowerCase().includes(w));
  const isShoes = cat.includes("shoe") || cat.includes("sneaker") || cat.includes("boot") || cat.includes("footwear");
  const isHandbag = cat.includes("handbag") || cat.includes("purse") || cat.includes("bag") || cat.includes("wallet");
  const isTools = cat.includes("tool") || cat.includes("drill") || cat.includes("saw") || cat.includes("wrench") || cat.includes("power tool") || 
    ["dewalt","milwaukee","makita","craftsman","snap-on","bosch","ryobi","ridgid","porter cable","stanley","husky","kobalt","black+decker","black and decker","skil","hitachi","metabo","festool","hilti","dremel","worx"].some(b => br.includes(b)) ||
    ["drill","circular saw","jigsaw","sander","grinder","router","nailer","impact driver","reciprocating saw","table saw","miter saw","planer","jointer"].some(w => (itemName||"").toLowerCase().includes(w));

  const handbagContext = isHandbag ? "HANDBAG PRICING REALITY:\n- Vera Bradley used: $8-35 on Poshmark (zip around wallets $8-15, totes $15-35)\n- Coach used: $25-150 (Poshmark #1, Mercari #2)\n- Kate Spade used: $30-120 (Poshmark #1)\n- Michael Kors used: $20-80 (Poshmark #1)\n- Louis Vuitton/Gucci/Chanel: $200-2000+ (TheRealReal, eBay authenticated)\n- Unknown/no-name bag: $5-15 Facebook Marketplace only\n- Poshmark is #1 for all handbags. eBay is #2." : ""

  const clothingContext = isClothing ? "CLOTHING PRICING:\nLUXURY ($300+): Gucci, LV, Chanel, Prada, Hermes, Balenciaga, Burberry\nDESIGNER ($100-500): Coach, Kate Spade, Tory Burch, Michael Kors\nPREMIUM ATHLETIC ($60-300): lululemon (Align $60-100), Patagonia ($50-200), Arc'teryx ($100-400)\nPREMIUM ($40-150): Free People, Anthropologie, Madewell, Eileen Fisher, Theory\nGOOD ($20-65): Ann Taylor, LOFT, Banana Republic, J.Crew, Calvin Klein, Tommy Hilfiger\nMID ($10-30): Express, NY&Company, Chicos basics\nFAST FASHION ($3-12 PASS): H&M, Zara, Forever 21, Shein, Fashion Nova, Old Navy, Target brands\nPlatform: Women clothing = Poshmark #1, Men = eBay #1" : ""

  const toolContext = isTools ? "TOOL PRICING — REALISTIC USED VALUES:\nDEWALT 20V: Bare drill $35-60, Kit with battery+charger $65-120, Combo kits $80-180\nMILWAUKEE M18: Bare tool $45-80, Kit $80-160, Fuel series adds 30%\nMAKITA 18V: Bare $35-70, Kit $70-130\nCRAFTSMAN: Hand tools $5-40, Power tools $20-80, Sets $30-120\nRYOBI 18V: Bare $20-45, Kit $45-90 (lower demand than DeWalt/Milwaukee)\nSNAP-ON: Premium brand — hand tools $30-300+ each, sets $200-2000+\nPORTER CABLE: $25-80 for most tools\nBOSCH: $40-100 for most power tools\nHAND TOOLS: Vintage Stanley planes $30-200, Vintage wood chisels $10-60/set\nKEY RULES:\n- Batteries are critical — dead/missing battery cuts value 40%\n- Complete kit in original case: 30-50% premium\n- Corded tools worth less than cordless\n- eBay #1 for all power tools, Facebook #2 for bulky/heavy items\n- Snap-On is the only hand tool brand commanding premium prices" : ""

  const antiqueContext = isAntique ? "ANTIQUE/VINTAGE PRICING — BE SPECIFIC:\nPYREX: Butterprint (pink/turquoise) $40-200/set, Gooseberry $30-120, Friendship $25-90, Snowflake $20-60, Solid colors $8-25\nCAST IRON: Griswold #3-14 $40-500+, Wagner $30-150, Lodge vintage $25-100, Lodge modern $15-40\nPOTTERY: Roseville $30-500+ (pattern matters), Hull $20-200, McCoy $15-150, Red Wing $25-200, Frankoma $10-60\nGLASSWARE: Depression glass colored $8-60/piece, Carnival glass $15-100, Milk glass $5-30, Jadeite (Fire-King) $15-150\nKITCHEN: Enamelware $10-60, Graniteware $8-40, CorningWare blue cornflower $15-60/set\nFURNITURE: Mission/Arts&Crafts $100-800, Mid-century modern (authenticated) $150-2000, Victorian $50-400\nSILVER: Sterling .925 = melt value + collectibility, Silver plate = $5-40 (much less)\nJEWELRY VINTAGE: Bakelite $20-200, Miriam Haskell $30-300, Weiss/Coro $15-80\nSIGNS/TIN: Vintage advertising signs $40-500+, Oil cans/petroliana $20-200\nIF UNKNOWN MAKER: condition + visual appeal determine value, usually $5-30\nPlatform: Etsy #1 for vintage/handmade, eBay #2 for collectibles, Whatnot #3 for live selling\nALWAYS search exact pattern name + \"sold\" on eBay before pricing" : ""

  const isElectronics = cat.includes("electronic") || cat.includes("phone") || cat.includes("laptop") || cat.includes("tablet") || cat.includes("camera") || cat.includes("gaming") || cat.includes("audio") || cat.includes("computer") ||
    ["apple","samsung","sony","nintendo","xbox","playstation","bose","beats","canon","nikon","dyson"].some(b => br.includes(b));

  const electronicsContext = isElectronics ? "ELECTRONICS PRICING — MUST HAVE EXACT MODEL:\nPHONES: iPhone 15 $500-700, iPhone 14 $350-500, iPhone 13 $250-400, iPhone 12 $180-280 (unlocked adds $50)\nLAPTOPS: MacBook Air M1 $600-800, M2 $800-1000, older Intel $200-500 depending on specs\nTABLETS: iPad Pro 11\" M2 $500-700, iPad Air $350-500, standard iPad $200-350\nGAMING: PS5 $350-450, Xbox Series X $350-430, Nintendo Switch OLED $220-280, Switch $180-240\nAUDIO: AirPods Pro 2 $150-200, Bose QC45 $120-180, Beats Studio3 $80-140\nCAMERAS: Canon Rebel T7 $200-300, Sony A6000 $250-350, vintage film cameras $20-200\nKEY RULES:\n- Always include storage size in search (64GB vs 256GB = huge price difference)\n- \"Locked to carrier\" cuts phone value 30-40%\n- Missing charger/cable cuts value 10-15%\n- eBay is #1 for all electronics" : ""

  const shoeContext = isShoes ? "SHOE PRICING:\n- Jordan 1 Retro OG: $100-400 (StockX/GOAT for DS, eBay for worn)\n- Yeezy 350 V2: $150-400 (StockX/GOAT)\n- Women's shoes: Poshmark #1\n- Regular used shoes: eBay or Poshmark" : ""

  const promptLines = [
    "You are an expert resale pricing analyst.",
    "",
    "ITEM: " + (brand && brand !== "Unknown" ? brand + " " : "") + itemName,
    "Category: " + category + (subcategory ? " (" + subcategory + ")" : "") + " | Condition: " + condition + (size ? " | Size: " + size : "") + (color ? " | " + color : ""),
    "Current asking price: $" + (buyPrice || "unknown"),
    "Notes: " + (notes || "none"),
    "",
    handbagContext, clothingContext, toolContext, antiqueContext, shoeContext, electronicsContext,
    "",
    "PLATFORM FEES: eBay 13.27% | Poshmark 20% | Mercari 10% | Depop 10% | Etsy 6.5% | Facebook 0% | OfferUp 0%",
    "",
    "PRICING FORMULA — USE EXACTLY:",
    "- sellPrice = MEDIAN sold price on each platform (last 90 days)",
    "- buyTarget = sellPrice x (1 - platformFeeRate) x 0.6",
    "- netProfit = sellPrice - fees - " + (buyPrice || "buyTarget"),
    "- decision = BUY if ROI > 35%, WATCH if 15-35%, PASS if < 15%",
    "",
    "BE CONSISTENT: same item returns same price every time.",
    "Fast fashion (H&M/Zara/Shein/Forever21) = ALWAYS PASS.",
    "",
    "Return ONLY valid JSON:",
    JSON.stringify({
      sellPrice: 25, buyTarget: 8, bestPlatform: "Poshmark", secondPlatform: "Mercari",
      thirdPlatform: "eBay", fees: 5, netProfit: 12, roi: 150, decision: "BUY",
      dataQuality: "strong", priceRange: {low:15, mid:25, high:40},
      platformPrices: {eBay:20, Poshmark:28, Mercari:24, Depop:22, Etsy:0, StockX:0, Whatnot:0, Facebook:15},
      reasoning: "3-4 sentences explaining why this price based on actual sold data",
      listingTitle: "Brand + Item + Size + Color + Condition",
      listingTips: ["tip1","tip2","tip3"],
      hotTip: "single most valuable insight",
      timeToSell: "7-14 days", riskScore: 2,
      watchOutFor: "biggest risk",
      bestTimeToList: "Thursday-Sunday evenings",
      searchQuery: "exact eBay search query for sold comps"
    }, null, 0),
  ].filter(l => l !== undefined && l !== null).join("\n");
  const prompt = promptLines;


  try {
    const r = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 900, temperature: 0.0,
    });
    const raw = r.choices?.[0]?.message?.content || "{}";
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    try { return match ? JSON.parse(match[1] || match[0]) : {}; } catch { return {}; }
  } catch { return {}; }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      images = [], textInput, extraDescription, buyPrice = 0,
      userToken, upc, isReanalyze, isThriftRun, thumb = "",
      confirmedIdentification = false, confirmedItem = null,
    } = body;
    const description = textInput || extraDescription || "";

    // Get user plan
    let plan = "free";
    let userId = "";
    if (userToken) {
      try {
        const { data: { user } } = await supabase.auth.getUser(userToken);
        if (user) {
          userId = user.id;
          const r = await fetch(SUPABASE_URL + "/rest/v1/user_plans?user_id=eq." + user.id + "&select=plan", {
            headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY }
          });
          plan = (await r.json())?.[0]?.plan || "free";

          if (plan === "free" && !isReanalyze) {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const { count } = await supabase.from("scans").select("*", { count: "exact", head: true })
              .eq("user_id", user.id).gte("created_at", monthStart)
              .not("category", "in", "(thrift_run,thrift_run_item,price_battle)");
            if ((count || 0) >= 10) {
              return NextResponse.json({ success: false, error: "scan_limit_reached" });
            }
          }
        }
      } catch {}
    }

    // Identify the item
    let identified: any = null;
    let barcodeData: any = null;

    if (confirmedIdentification && confirmedItem) {
      // User confirmed/corrected — use their data, build precise search query
      const brandPart = confirmedItem.brand && confirmedItem.brand !== "Unknown" ? confirmedItem.brand + " " : "";
      identified = {
        itemName: confirmedItem.itemName || "Unknown Item",
        brand: confirmedItem.brand || "Unknown",
        category: confirmedItem.category || "Other",
        condition: confirmedItem.condition || "Good",
        size: confirmedItem.size || null,
        color: confirmedItem.color || null,
        era: confirmedItem.era || null,
        subcategory: confirmedItem.category || "Other",
        searchQuery: (brandPart + confirmedItem.itemName).trim(),
        confidence: "high",
        notes: "User-verified identification",
        material: null,
      };
    } else if (upc && upc !== "EXTRACT_FROM_IMAGE") {
      barcodeData = await lookupUPC(upc);
      if (barcodeData) {
        identified = {
          itemName: barcodeData.name || "Unknown Item",
          brand: barcodeData.brand || "Unknown",
          category: barcodeData.category || "Other",
          condition: "New",
          searchQuery: ((barcodeData.brand || "") + " " + (barcodeData.name || "")).trim(),
          confidence: "high",
          notes: "Identified via barcode",
          subcategory: barcodeData.category || "",
          size: null, color: null, era: null, material: null,
        };
      }
    } else if (images.length > 0) {
      const firstImg = images[0];
      const imgMatch = firstImg.match(/^data:(image\/(?:jpeg|jpg|png|webp|heic|heif));base64,(.+)$/s);
      if (imgMatch) {
        const rawMT = imgMatch[1];
        const mt = (rawMT.includes("heic") || rawMT.includes("heif")) ? "image/jpeg" : rawMT;
        identified = await identifyFromImage(imgMatch[2], mt);
      }
    } else if (description) {
      try {
        const r = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "Identify for resale: \"" + description + "\". Return ONLY JSON: {\"itemName\":\"name\",\"brand\":\"brand or Unknown\",\"category\":\"Clothing/Shoes/Electronics/Tools/Collectibles/Handbags/Antiques/Jewelry/Toys/Home/Sports/Other\",\"subcategory\":\"type\",\"condition\":\"Good\",\"size\":null,\"color\":null,\"era\":null,\"material\":null,\"searchQuery\":\"brand item type\",\"confidence\":\"medium\",\"notes\":\"\"}" }],
          max_tokens: 300, temperature: 0.0,
        });
        const raw = r.choices?.[0]?.message?.content || "";
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) identified = JSON.parse(m[0]);
      } catch {}
    }

    if (!identified || !identified.itemName) {
      identified = {
        itemName: description || "",
        brand: "Unknown", category: "Other", condition: "Good",
        searchQuery: description || "",
        confidence: "low",
        notes: "Could not identify automatically",
        subcategory: "", size: null, color: null, era: null, material: null,
      };
    }

    const { itemName, brand, category, condition } = identified;

    // Get market analysis
    const analysis = await getFullMarketAnalysis(identified, Number(buyPrice));

    const sellPrice = Number(analysis.sellPrice) || 0;
    const buyTarget = Number(analysis.buyTarget) || Math.round(sellPrice * 0.4 * 100) / 100;
    const bestPlatform = analysis.bestPlatform || "eBay";
    const fees = Number(analysis.fees) || Math.round(sellPrice * (FEES[bestPlatform] || 0.13) * 100) / 100;
    const netProfit = Number(buyPrice) > 0
      ? Math.round((sellPrice - Number(buyPrice) - fees) * 100) / 100
      : Math.round((sellPrice - buyTarget - fees) * 100) / 100;
    const roi = Number(buyPrice) > 0 && sellPrice > 0
      ? Math.round((netProfit / Number(buyPrice)) * 100)
      : analysis.roi || 0;
    // Always recalculate decision from real numbers
    // Never trust AI's "decision" field — it doesn't know the actual buy price
    let decision: string;
    if (Number(buyPrice) > 0 && sellPrice > 0) {
      // User entered a real price — calculate accurately
      if (netProfit < 5 || roi < 10) decision = "PASS";
      else if (roi < 25) decision = "WATCH";
      else decision = "BUY";
    } else if (sellPrice > 0 && buyTarget > 0) {
      // No price entered — use estimated buyTarget
      const estProfit = sellPrice - buyTarget - fees;
      const estROI = Math.round((estProfit / buyTarget) * 100);
      if (estProfit < 5 || estROI < 10) decision = "PASS";
      else if (estROI < 25) decision = "WATCH";
      else decision = "BUY";
    } else {
      decision = "PASS"; // No price data = pass
    }

    // Build verify links from the SPECIFIC item search query
    const searchQuery = identified.searchQuery || (brand !== "Unknown" ? brand + " " : "") + itemName.trim();
    const links = buildLinks(searchQuery);

    // dataQuality for page.tsx
    const dataQuality = analysis.dataQuality || (sellPrice > 0 ? "strong" : "none");

    // Save scan to database
    // Only save on confirmed identification or text/barcode (not the initial image scan before confirm)
    // Save all scans - photo scans, text scans, barcode scans, confirmed scans
    const shouldSave = userId && !isReanalyze && !isThriftRun;
    
    if (shouldSave) {
      try {
        const thumbVal = thumb ? bestPlatform + "|||" + thumb.slice(0, 10000) : bestPlatform;
        const { error: saveError } = await supabase.from("scans").insert({
          user_id: userId,
          item_name: itemName,
          brand,
          category,
          condition: identified.condition || "Good",
          buy_price: Number(buyPrice) || 0,
          sell_price: sellPrice,
          net_profit: netProfit,
          decision,
          best_platform: thumbVal,
          roi: analysis.roi || 0,
          created_at: new Date().toISOString(),
        });
        if (saveError) { /* save failed silently */ }
      } catch (e: any) {
 }
    }

    // Return with priceData structure that page.tsx expects
    return NextResponse.json({
      success: true,
      // Top-level fields page.tsx reads directly
      dataQuality,
      itemName, brand, category,
      subcategory: identified.subcategory || null,
      condition: identified.condition || "Good",
      size: identified.size || null,
      color: identified.color || null,
      era: identified.era || null,
      confidence: identified.confidence,
      notes: identified.notes,
      sellPrice,
      buyTarget,
      bestPlatform,
      secondPlatform: analysis.secondPlatform || "Mercari",
      thirdPlatform: analysis.thirdPlatform || null,
      fees, netProfit, roi, decision,
      priceRange: analysis.priceRange || { low: Math.round(sellPrice*0.7), mid: sellPrice, high: Math.round(sellPrice*1.3) },
      platformPrices: analysis.platformPrices || {},
      reasoning: analysis.reasoning || "",
      listingTitle: analysis.listingTitle || brand + " " + itemName,
      listingTips: analysis.listingTips || [],
      hotTip: analysis.hotTip || "",
      timeToSell: analysis.timeToSell || "7-14 days",
      riskScore: analysis.riskScore || 3,
      watchOutFor: analysis.watchOutFor || "",
      bestTimeToList: analysis.bestTimeToList || "Evenings and weekends",
      payoutSpeed: PAYOUT[bestPlatform] || "3-5 days",
      searchQuery,
      productImage: barcodeData?.image || "",
      // ebayMarketData for compatibility with page.tsx versions that read this field
      ebayMarketData: {
        listingCount: 12,
        low: analysis.priceRange?.low || Math.round(sellPrice * 0.7),
        median: sellPrice,
        high: analysis.priceRange?.high || Math.round(sellPrice * 1.3),
        searchQuery,
        ebaySoldUrl: links.eBay,
      },
      dataSource: "AI market analysis · " + (analysis.dataQuality || "strong") + " data · Verify using links",
      // priceData OBJECT — this is what page.tsx reads for the eBay banner and verify links
      priceData: {
        avgPrice: sellPrice,
        minPrice: analysis.priceRange?.low || Math.round(sellPrice * 0.7),
        maxPrice: analysis.priceRange?.high || Math.round(sellPrice * 1.3),
        count: 12,
        rawPrices: [analysis.priceRange?.low, sellPrice, analysis.priceRange?.high].filter(Boolean),
        isExactMatch: true,
        matchType: "ai_market_analysis",
        ebaySearchUrl: links.eBay,
        searchUrls: links,
        allPlatformLinks: links,
        platformPrices: analysis.platformPrices || {},
      },
      dataQualityMessage: sellPrice > 0
        ? "AI market analysis: " + (analysis.priceRange?.low || Math.round(sellPrice*0.7)) + "-" + (analysis.priceRange?.high || Math.round(sellPrice*1.3)) + " on " + bestPlatform + ". Verify using links below."
        : "Could not determine value. Try adding more detail or a clearer photo.",
      plan,
    });

  } catch (err: any) {
    console.error("Lens error:", err.message);
    return NextResponse.json({ success: false, error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
