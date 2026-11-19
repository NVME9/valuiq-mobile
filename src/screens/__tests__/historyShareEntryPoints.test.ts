// historyShareEntryPoints.test.ts — HISTORY WIN-REVEAL FIX (Share Studio
// v6, item B): every user-reachable path that shows a win/sale card must
// open ShareStudio with the real stored data, never the old FlexRevealCard
// (whose stat-fallback copy could drift from the Studio's own honest label/
// stamp - see shareCardPayload.ts's resolveHistoryWinData comment for the
// exact MEASURED bug: a loss sale's rounded "-$4 profit after fees" vs. the
// Studio's "-$4.33"). A source-scan guard (same pattern
// numericKeyboardDoneAccessory.test.ts already uses in this repo) rather
// than a full render - HistoryScreen.tsx pulls in camera/image-picker/
// supabase and isn't practical to mount in jest, but "does this screen
// still reference the old component, and does its View-reveal action route
// through the Studio" is a precise, regression-proof text check.
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const HISTORY_SCREEN = path.join(REPO_ROOT, "src", "screens", "HistoryScreen.tsx");

// Files allowed to still ACTUALLY USE (import or render) FlexRevealCard:
// the component itself, its shared useCountUp export (ProfitFlexHero.tsx
// imports ONLY that, not the card), and the two call sites that show data
// explicitly NOT the viewer's own - WinsDemoCard's labeled "Example from
// real reseller sales" teaser and CommunityScreen's labeled "RESELLER FLIP"
// feed item (see each file's own header/call-site comment for why these
// were kept). Plain prose mentions in comments elsewhere (e.g. "replaces
// the retired FlexRevealCard") are fine anywhere and not checked here - see
// the USAGE_PATTERN below, which only matches an import or a JSX render.
const ALLOWED_FLEXREVEALCARD_FILES = new Set([
  path.join("src", "components", "FlexRevealCard.tsx"),
  path.join("src", "components", "ProfitFlexHero.tsx"),
  path.join("src", "components", "WinsDemoCard.tsx"),
  path.join("src", "screens", "CommunityScreen.tsx"),
]);

const FLEXREVEALCARD_USAGE_PATTERN = /import\s+FlexRevealCard|<FlexRevealCard\b/;

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "__tests__", "ios", "android", ".expo", "dist", "build"]);

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
}

describe("History's win-reveal entry points open Share Studio, not the old FlexRevealCard", () => {
  test("HistoryScreen.tsx no longer imports or renders FlexRevealCard", () => {
    const text = fs.readFileSync(HISTORY_SCREEN, "utf8");
    expect(text).not.toMatch(/import FlexRevealCard/);
    expect(text).not.toMatch(/<FlexRevealCard/);
  });

  test("HistoryScreen.tsx's View-reveal action (openReveal) opens the Studio, not a separate flex-stat modal", () => {
    const text = fs.readFileSync(HISTORY_SCREEN, "utf8");
    const fn = text.match(/function openReveal\(item: any\) \{[\s\S]*?\n  \}/);
    expect(fn).toBeTruthy();
    expect(fn![0]).toMatch(/setStudioOpen\(true\)/);
    expect(fn![0]).toMatch(/setStudioTargetIsWin\(true\)/);
    expect(text).not.toMatch(/viewingReveal/);
  });

  test("every FlipActionsRow onViewReveal call site in HistoryScreen.tsx routes through openReveal", () => {
    const text = fs.readFileSync(HISTORY_SCREEN, "utf8");
    const matches = text.match(/onViewReveal=\{[^}]*\}/g) || [];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) expect(m).toMatch(/openReveal\(/);
  });

  test("the Studio call site builds win data from resolveHistoryWinData whenever studioTargetIsWin is set", () => {
    const text = fs.readFileSync(HISTORY_SCREEN, "utf8");
    expect(text).toMatch(/resolveHistoryWinData\(studioTarget\)/);
  });

  test("only the documented demo/community call sites still import or render FlexRevealCard anywhere in src/", () => {
    const srcRoot = path.join(REPO_ROOT, "src");
    const files: string[] = [];
    walk(srcRoot, files);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file);
      if (ALLOWED_FLEXREVEALCARD_FILES.has(rel)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (FLEXREVEALCARD_USAGE_PATTERN.test(text)) offenders.push(rel);
    }
    if (offenders.length) {
      throw new Error(`Unexpected FlexRevealCard import/render outside the allowed demo/community files:\n  ${offenders.join("\n  ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
