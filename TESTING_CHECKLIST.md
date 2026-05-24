# ValuIQ Mobile — Complete Testing Checklist
## Every screen, every function, every edge case

---

## HOW TO USE THIS CHECKLIST
- Go screen by screen in order
- Mark ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
- For each FAIL, note what happened
- Run on BOTH iPhone and Android if possible

---

## PRE-TEST SETUP
- [ ] App launched fresh (force-closed, reopened)
- [ ] You have a FREE account for free-tier tests
- [ ] You have a PAID account (Seller or Pro) for paid tests
- [ ] Network connected (WiFi preferred)
- [ ] Camera permission granted

---

## 1. SPLASH SCREEN
- [ ] Logo animates in (spring/scale effect)
- [ ] "ValuIQ" text appears
- [ ] "Point. Shoot. Profit." tagline fades in
- [ ] "AI-powered resale profit scanner" subtitle appears
- [ ] Three feature pills appear (📷 Scan any item / 💰 Know profit instantly / ✅ Buy or pass)
- [ ] Splash holds for ~1.8 seconds (readable)
- [ ] Slides up smoothly — app fades in underneath
- [ ] **EDGE: Reopen app — splash shows every time**

---

## 2. LOGIN / AUTH
- [ ] Sign In tab — email + password fields visible
- [ ] Password shows dots by default
- [ ] "Show" button toggles to visible text
- [ ] "Show" button toggles back to hidden
- [ ] Sign In with valid credentials → goes to Scanner
- [ ] Sign In with wrong password → shows red error message
- [ ] Sign Up tab — email + password
- [ ] Sign Up with new email → success or "check email to confirm"
- [ ] Magic Link tab — email field only
- [ ] Magic Link → sends email (check inbox), no crash
- [ ] **EDGE: Empty email → "Please enter your email" error**
- [ ] **EDGE: Empty password → "Please enter your password" error**
- [ ] **EDGE: Close app after login → reopens to Scanner (session persisted)**
- [ ] **EDGE: Sign out → returns to Login, all tabs reset**

---

## 3. SCANNER — CAMERA MODE
- [ ] Camera opens immediately (no black screen)
- [ ] ViewFinder frame corners visible (green)
- [ ] "Point at any item to scan" hint text visible
- [ ] "🛍️ Thrift Run" quick button top-left
- [ ] "⚡ Price Battle" quick button top-right
- [ ] Tapping Thrift Run → navigates to Thrift Run screen
- [ ] Tapping Price Battle → navigates to Price Battle screen
- [ ] "|||  Barcode" button visible → taps to barcode mode
- [ ] "🖼 Library" button → opens photo library
- [ ] Shutter button → takes photo → goes to Review screen
- [ ] **FREE USER: Scan count badge shows (e.g. "8 left")**
- [ ] **FREE USER: At 0 scans → badge shows "No scans left"**

---

## 4. SCANNER — BARCODE MODE
- [ ] Camera switches to rectangular barcode frame
- [ ] Scanning line visible
- [ ] "📷 Photo Mode" button visible
- [ ] Point at UPC barcode → identifies product automatically
- [ ] Point at QR code → identifies or gracefully fails
- [ ] Result appears (same result screen as photo)
- [ ] **EDGE: No barcode found → no crash, stays in barcode mode**

---

## 5. SCANNER — REVIEW SCREEN
- [ ] Photo thumbnail shows
- [ ] "📷 Camera" and "🖼 Library" buttons to add more photos (up to 3)
- [ ] "Brand, model, or notes" text field
- [ ] "Analyze Now →" button
- [ ] X button removes a photo
- [ ] Adding description improves results (test with and without)
- [ ] **EDGE: No photo, no description → error shown**
- [ ] **FREE USER: Scan badge shows remaining count**

---

## 6. SCANNER — RESULT SCREEN
### Data banner
- [ ] Green banner: "✅ X real sold listings" appears for known items
- [ ] Limited data banner (⚡ yellow) for obscure items
- [ ] No-data banner (⚠️ red) for unidentifiable items

### Verdict card
- [ ] BUY IT shown in green for profitable items
- [ ] WATCH IT shown in yellow for marginal items
- [ ] PASS shown in red for unprofitable items
- [ ] Item name shows correctly
- [ ] Category and condition show

### Profit card
- [ ] Profit amount in large text (green = positive, red = negative)
- [ ] "Sell $X on [Platform] · X% ROI" subtitle
- [ ] Limited data shown at reduced opacity with "verify before buying"

### Numbers row
- [ ] MAX TO PAY shows
- [ ] SELL FOR shows
- [ ] PLATFORM shows

### ⚡ Battle This Item button
- [ ] Visible below profit card
- [ ] Tapping → navigates to Price Battle
- [ ] Price Battle pre-fills item name (if it does, great; if not, manual works too)

### Share button
- [ ] "Share 📤" button visible
- [ ] Tapping opens share sheet
- [ ] Share sheet has: Share (native), Copy, X/Twitter, Facebook, Instagram, TikTok, SMS
- [ ] Tapping native Share → iOS share sheet opens
- [ ] Tapping X → opens twitter.com in browser with text pre-filled
- [ ] Tapping SMS → opens Messages with text pre-filled

### Other elements
- [ ] Hot Tip shows (yellow card)
- [ ] Analysis/reasoning shows
- [ ] Listing Tips show (if present)
- [ ] "Scan Another Item →" returns to camera

---

## 7. PRICE BATTLE
- [ ] Item Name field required (shows error if empty)
- [ ] Brand field (optional)
- [ ] Condition chips (New/Like New/Good/Fair/Poor) — tap to select
- [ ] Category chips — scroll horizontally
- [ ] Buy Price field (optional)
- [ ] "Start Battle →" calls API
- [ ] Loading state shows
- [ ] Platforms reveal one at a time (animation — ~350ms each)
- [ ] "Checking more platforms..." during reveal
- [ ] Winner card shows after all reveal with "⚡ WINNER" label
- [ ] Winner has correct platform name, sell price, net profit
- [ ] "Verify on eBay sold →" link opens eBay in browser
- [ ] "Share this result 📤" compact button → opens share sheet
- [ ] Platform cards tappable → expand to show Sell/Fees/Profit breakdown
- [ ] Item summary card shows
- [ ] Hot tip card shows
- [ ] "New Battle" button resets form
- [ ] **CONSISTENCY CHECK: Scan same item in Scanner, then run Price Battle**
  - Scanner shows $X on Platform Y
  - Price Battle winner should be within 25% of Scanner price
  - Same BUY/WATCH/PASS decision
  - If inconsistent → note the item and prices

---

## 8. THRIFT RUN
- [ ] Intro screen shows features
- [ ] **FREE USER: Locked with upgrade prompt**
- [ ] **PAID USER: "Start Thrift Run →" button**
- [ ] Camera opens (split view — camera top, results bottom)
- [ ] Shutter button at bottom of camera
- [ ] "End Run →" button at top right
- [ ] Take photo → item appears in bottom list with spinner
- [ ] Spinner → result appears (BUY/PASS + profit)
- [ ] Can take multiple photos without waiting
- [ ] Each item analyzed simultaneously (not sequentially)
- [ ] Summary screen shows after "End Run →"
- [ ] Summary shows: items scanned, BUY count, PASS count, total profit
- [ ] All items listed with their verdicts
- [ ] Tap item → expands with Max Pay / Sell For / Profit
- [ ] "Share 📤" compact button in header → share sheet opens
- [ ] "New Run" starts fresh

---

## 9. SPECIALTY SCANNER
- [ ] **SELLER USER: Locked with PRO upgrade prompt**
- [ ] **PRO USER: 8 category grid shows**
- [ ] All 8 categories visible: Wine, Figurines, Antiques, Jewelry, Coins, Cards, Art, Vintage Toys
- [ ] Tapping category → shows that category's form fields
- [ ] "📷 Add Photo" → opens library
- [ ] Category-specific fields render (test one: Coins)
  - Coin Type, Year & Mint Mark, Grade, Certified fields
- [ ] "Analyze Now →" calls API
- [ ] Result shows Value Range, Confidence, Decision
- [ ] Analysis text shows
- [ ] "How To Sell It" section shows
- [ ] "⚠️ Watch Out For" section shows (yellow card)
- [ ] Share button on result
- [ ] Back → returns to category grid
- [ ] Back from grid → returns to Dashboard

---

## 10. MANIFEST ANALYZER
- [ ] **FREE USER: Locked**
- [ ] **PAID USER: Photo and text input visible**
- [ ] Photo button → opens library, shows preview
- [ ] Text area → paste manifest text
- [ ] "Analyze Manifest →" calls API
- [ ] Loading state
- [ ] Score out of 100 shows (color: green ≥70, yellow ≥40, red <40)
- [ ] Verdict text shows
- [ ] Expected profit shows
- [ ] Summary card shows
- [ ] Line items section (each item with BUY/WATCH/PASS + profit)
- [ ] Share button on result
- [ ] **EDGE: No input → error message**

---

## 11. DEATH PILE RESCUER
- [ ] **FREE USER: Locked**
- [ ] **PAID USER: Photo and text input**
- [ ] Describe item text area
- [ ] "Rescue This Item →" calls API
- [ ] Verdict shows (RELIST/BUNDLE/REPRICE/DONATE/TRASH)
- [ ] "Why It's Not Selling" card
- [ ] "Action Plan" card (green)
- [ ] Suggested new price shows
- [ ] Platform suggestions list
- [ ] Listing fixes list
- [ ] Share button

---

## 12. AUTO-RELISTER
- [ ] **FREE USER: Locked**
- [ ] Item Name, Brand, Size, Color, Sell Price fields
- [ ] Condition chips
- [ ] Platform checkboxes (eBay, Poshmark, Mercari, Facebook, Depop, Etsy, OfferUp)
- [ ] Multiple platforms selectable
- [ ] "Generate Listings →" calls API
- [ ] One listing card per platform
- [ ] "Copy" button on each card
- [ ] Tapping Copy → button shows "✓ Copied!" for 2 seconds
- [ ] Listing has title, description, hashtags
- [ ] "New" button resets

---

## 13. HOT RIGHT NOW
- [ ] Items list loads from API (or falls back to sample data)
- [ ] Category filter tabs work (All / Clothing / Electronics / Shoes / etc.)
- [ ] Each item shows: name, platform, sales count, avg price, trend arrow
- [ ] Pull to refresh works
- [ ] Trend color: green for ↑, red for ↓, yellow for →

---

## 14. ARBITRAGE SEARCH
- [ ] **FREE USER: Locked**
- [ ] Search field + Max Buy Price field
- [ ] "Find Arbitrage →" calls API
- [ ] Results show: item title, Buy/Sell/Profit three-column row
- [ ] "View on eBay →" link opens eBay in browser
- [ ] "New Search" button clears results
- [ ] **EDGE: Empty search → error**

---

## 15. BUNDLE BUILDER
- [ ] **FREE USER: Locked**
- [ ] Item rows (name + price fields)
- [ ] "✕" removes a row
- [ ] "+ Add Item" adds new row
- [ ] "Build Bundle →" calls API
- [ ] Bundle price shows in green
- [ ] Bundle title shows
- [ ] Listing description shows
- [ ] Best platforms shows
- [ ] Share button
- [ ] **EDGE: No items → error**

---

## 16. SOURCING ALERTS
- [ ] **FREE USER: Locked**
- [ ] "+ New Alert" button opens create form
- [ ] Keywords required, Max Price and Min Profit optional
- [ ] "Save Alert" creates alert and shows in list
- [ ] Alert card shows keywords and criteria
- [ ] "✕" deletes alert
- [ ] Recent Matches section shows if API returns matches
- [ ] Pull to refresh

---

## 17. INVENTORY TRACKER
- [ ] **FREE USER: Locked with upgrade prompt**
- [ ] Stats row shows (Items / Listed / Sold / Profit / Invested / ROI)
- [ ] Filter tabs: All / Unlisted / Listed / Sold
- [ ] "+ Add Item" opens bottom sheet
- [ ] Form: Item Name, Bought For, Target Price, Status, Notes
- [ ] Status chips (Unlisted / Listed / Sold)
- [ ] Save → item appears in list
- [ ] "Mark Listed" button on unlisted items
- [ ] "Mark Sold ✅" button on listed items
- [ ] Status change updates stats immediately on refresh
- [ ] "Edit" button opens pre-filled form
- [ ] "Delete" removes item
- [ ] Profit per item shown (target - bought)
- [ ] **EDGE: Missing item name → no crash**

---

## 18. PROFIT TRACKER
- [ ] **FREE USER: Locked**
- [ ] Period tabs: 7D / 30D / 1Y / All
- [ ] Net Profit hero card (green = positive, red = negative)
- [ ] Breakdown card: Revenue, COGS, Fees, Net Profit, ROI, Items Sold, Avg Profit/Item, Avg Days to Sell
- [ ] By Platform section shows if data exists
- [ ] Recent Sales list shows last 10 sold items
- [ ] Empty state: "Mark items as Sold in Inventory to track P&L here"
- [ ] "Go to Inventory →" button in empty state
- [ ] Pull to refresh
- [ ] Period switching refreshes data

---

## 19. COMMUNITY WINS
- [ ] Community wins feed loads
- [ ] Filter tabs: 🔥 Hot / 💰 Top Profit / ⚡ Recent
- [ ] Each win shows: username, store, time, item name, profit, platform
- [ ] ♥ like button works (increments count, turns red)
- [ ] Stats banner: Recent Wins / Total Profit / Avg Profit
- [ ] Pull to refresh
- [ ] Leaderboard routes to same screen from Dashboard

---

## 20. PROFILE
### View mode
- [ ] Avatar shows (photo, emoji, or initial letter)
- [ ] Display name shows
- [ ] Bio shows (if set)
- [ ] Rank shows with emoji and color (Newbie/Thrifter/Flipper etc.)
- [ ] XP total shows
- [ ] XP progress bar fills correctly toward next rank

### Stats tab
- [ ] Total Scans count
- [ ] BUY Finds count
- [ ] Profit Found amount
- [ ] Day Streak with 🔥
- [ ] "Community Leaderboard →" navigates to Community
- [ ] "Refer a Friend →" navigates to upgrade/referral

### Badges tab
- [ ] Earned badges in horizontal scroll strip
- [ ] Each earned badge shows emoji, name, XP
- [ ] Locked badges in 3-column grid (faded)
- [ ] **EDGE: 0 badges → no crash, just shows locked section**

### Plan tab
- [ ] Current plan shown with color badge
- [ ] **FREE: "View all plans & upgrade →" green button**
- [ ] **FREE: Button → navigates to Upgrade screen**
- [ ] **PAID non-lifetime: "Manage at getvaluiq.com →" link**
- [ ] Referral card shows
- [ ] "Get your referral link →" opens partners page in browser
- [ ] Promo code card shows → opens pricing page

### Edit mode
- [ ] "Edit" button in nav
- [ ] Edit card shows large avatar preview
- [ ] "📷 Upload Photo" → opens library with square crop
- [ ] Photo selected → preview updates immediately
- [ ] "😎 Choose Emoji" → bottom sheet modal opens
- [ ] 20 emoji options in grid
- [ ] Tapping emoji → preview updates, modal closes
- [ ] Display Name field pre-filled
- [ ] Bio field pre-filled
- [ ] "Save Changes" → saves and returns to view mode
- [ ] "Cancel" → discards changes
- [ ] **EDGE: No name → saves with blank (shouldn't crash)**

---

## 21. UPGRADE SCREEN
- [ ] Header with back button and logo
- [ ] "Unlimited scanning. Real profit." hero headline
- [ ] Monthly / Annual toggle
- [ ] **Annual toggle → all prices switch simultaneously**
- [ ] **Monthly: Seller $19/mo, Pro $49/mo**
- [ ] **Annual: Seller $139/yr (save $89), Pro $349/yr (save $239)**
- [ ] Lifetime card is most prominent (yellow border, $497 crossed out, $197 in large text)
- [ ] "💰 You save $300" savings bar
- [ ] "Grab Lifetime Deal — $197 →" button → opens Stripe checkout
- [ ] Stripe checkout opens in browser (not in-app)
- [ ] **STRIPE: Name field at top left is BLANK (Stripe Link disabled)**
- [ ] **STRIPE: "Add code" promo code field visible**
- [ ] Pro card shows all features including all 8 Specialty categories
- [ ] Seller card shows all features (no Specialty)
- [ ] Pro "Get Pro" button → Stripe checkout
- [ ] Seller "Get Seller" button → Stripe checkout
- [ ] 🏷️ Promo code row → opens getvaluiq.com/pricing
- [ ] Trust row: 🔒 Secured by Stripe · ↩️ Cancel anytime · ⚡ Instant access

---

## 22. DASHBOARD
- [ ] Logo, plan badge, and stats row load
- [ ] Stats: Scans / BUY Finds / Profit
- [ ] **FREE: Plan badge shows "Free Plan", upgrade button shows**
- [ ] **FREE: Upgrade banner shows with "Upgrade for unlimited scans"**
- [ ] **FREE: Upgrade banner taps → Upgrade screen**
- [ ] **PAID: No upgrade banner**
- [ ] 5 tool groups visible with section headers
- [ ] **Scanning group**: Price Battle, Thrift Run, Arbitrage, Hot Right Now
- [ ] **Specialty group**: Full-width purple hero card with 7 category pills
- [ ] **FREE/SELLER: Specialty card shows "PRO" badge and "Requires Pro Plan →"**
- [ ] **PRO: Specialty card shows "Open Specialty Scanner →"**
- [ ] **Inventory group**: Manifest, Death Pile, Relister, Bundle, Inventory
- [ ] **Alerts group**: Sourcing Alerts, Profit Tracker
- [ ] **Community group**: Community Wins, Leaderboard
- [ ] Locked tools show 🔒 badge and tap → Upgrade screen
- [ ] Recent Scans list shows scan history
- [ ] Empty state if no scans: "Tap Scanner to find your first profitable item"
- [ ] Pull to refresh updates scan history
- [ ] 👤 button → Profile screen

---

## 23. TAB BAR
- [ ] 4 tabs visible: Scan / Dashboard / Community / Profile
- [ ] Active tab has green label and green dot
- [ ] Tapping each tab navigates correctly
- [ ] Sub-screens (tools) do NOT change active tab indicator
- [ ] Back button returns to previous screen

---

## CONSISTENCY TESTS (cross-tool)
These test that Scanner and Price Battle agree on the same item:

### Test Item A: Nike Air Force 1 White Size 10 Good Condition
1. Scanner → photo or description → note: Decision, Sell Price, Best Platform
2. Price Battle → same details → note: Winner, Sell Price
3. Prices within 25%? ___
4. Same decision (BUY/WATCH/PASS)? ___

### Test Item B: KitchenAid Stand Mixer Good Condition
1. Scanner → note results
2. Price Battle → note results
3. Consistent? ___

### Test Item C: Vintage Levi's Denim Jacket Size M
1. Scanner → note results
2. Price Battle → note results
3. Consistent? ___

### Test Item D: DeWalt 20V Drill Set Good Condition
1. Scanner → note results
2. Price Battle → note results
3. Consistent? ___

---

## API HEALTH CHECKS
Test these URLs in your browser while logged in:

- [ ] `getvaluiq.com/api/debug-stripe` → shows all 5 price IDs as valid
- [ ] `getvaluiq.com/api/scan-count?token=YOUR_TOKEN` → returns `{"count": N}`
- [ ] `getvaluiq.com/api/get-plan?token=YOUR_TOKEN` → returns `{"plan": "free"/"seller"/"pro"/"lifetime"}`
- [ ] `getvaluiq.com/api/scan-history?token=YOUR_TOKEN` → returns array of scans
- [ ] `getvaluiq.com/api/community-wins` → returns array of wins

---

## SCAN LIMIT TESTS
- [ ] **Free account, 0 scans used**: Scan counter shows "10 left"
- [ ] **After 10 scans**: Upgrade screen appears instead of result
- [ ] **Seller account**: No scan counter shown anywhere (unlimited)

---

## SHARE TESTS
- [ ] Scanner result → Share → sheet opens
- [ ] Price Battle → Share compact button → sheet opens
- [ ] Thrift Run summary → Share compact button → sheet opens
- [ ] Manifest result → Share → sheet opens
- [ ] Death Pile result → Share → sheet opens
- [ ] Specialty result → Share → sheet opens
- [ ] Native Share → iOS share sheet / Android intent
- [ ] X/Twitter → twitter.com opens in browser, text pre-filled with item name + profit + getvaluiq.com
- [ ] SMS → Messages opens, text pre-filled

---

## OFFLINE / ERROR HANDLING
- [ ] No network → scanner shows error, no crash
- [ ] API timeout → retry button or error message
- [ ] Invalid token → redirects to login
- [ ] Empty results → empty state shown, not blank screen

---

## WHAT TO REPORT BACK
For each ❌ FAIL, provide:
1. Screen name
2. What you tapped / what you did
3. What happened
4. What you expected

---

*ValuIQ Mobile Testing Checklist v1.0 — 23 screens, 200+ test cases*
