// shareStudioEntryPointCoverage.test.ts — v7, founder device finding #6:
// "add the on-screen debug line src= for each [route]; list any path still
// not routed." ShareStudio.tsx already renders `src=${entryPoint}` in its
// owner-only readout (see that file's renderReadout) for WHICHEVER value
// entryPoint resolves to - the actual risk is a future (or missed existing)
// call site that mounts <ShareStudio> without passing entryPoint at all,
// which would silently fall back to "unknown" and make a stamp/tone
// mismatch unrepro-able. A static source scan (same pattern
// historyShareEntryPoints.test.ts already uses for FlexRevealCard) across
// every real call site, rather than a full render - several of these
// screens pull in camera/image-picker/supabase and aren't practical to
// mount in jest.
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

// Every file in src/ that actually MOUNTS <ShareStudio - confirmed by hand
// against this branch's call sites: ScannerScreen (scan result + win
// hand-off), HistoryScreen (share / view-reveal / logged-win), App.tsx
// (push-tap win hand-off), SaleCapturePrompt (post-sale win hand-off).
const EXPECTED_CALL_SITES = [
  path.join("src", "screens", "ScannerScreen.tsx"),
  path.join("src", "screens", "HistoryScreen.tsx"),
  path.join("src", "components", "SaleCapturePrompt.tsx"),
  path.join("App.tsx"),
];

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "__tests__", "ios", "android", ".expo", "dist", "build"]);

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
}

// Finds every `<ShareStudio ... />` JSX block (balanced on `/>`) in a file's
// text - good enough for this codebase's actual call sites, which never
// nest another `/>`-closed self-closing tag's props inside ShareStudio's own
// prop list.
function findShareStudioBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /<ShareStudio\b[\s\S]*?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) blocks.push(m[0]);
  return blocks;
}

describe("every real <ShareStudio> call site passes entryPoint (the owner debug readout's src=)", () => {
  test("the expected call sites still exist and still mount ShareStudio at least once", () => {
    for (const rel of EXPECTED_CALL_SITES) {
      const full = path.join(REPO_ROOT, rel);
      expect(fs.existsSync(full)).toBe(true);
      const text = fs.readFileSync(full, "utf8");
      expect(findShareStudioBlocks(text).length).toBeGreaterThan(0);
    }
  });

  test("every <ShareStudio> block anywhere in src/ or App.tsx passes a non-empty entryPoint", () => {
    const roots = [path.join(REPO_ROOT, "src"), path.join(REPO_ROOT, "App.tsx")];
    const files: string[] = [];
    for (const r of roots) {
      if (fs.statSync(r).isDirectory()) walk(r, files);
      else files.push(r);
    }
    // ShareStudio.tsx itself never mounts <ShareStudio> - its own header/
    // JSDoc comments just MENTION the tag in prose (e.g. "see ShareStudio.tsx"
    // or "<ShareStudio> UNGATED"), which would otherwise false-positive here.
    const SHARE_STUDIO_COMPONENT = path.join(REPO_ROOT, "src", "components", "ShareStudio.tsx");
    const missing: string[] = [];
    let totalBlocks = 0;
    for (const file of files) {
      if (file === SHARE_STUDIO_COMPONENT) continue;
      const text = fs.readFileSync(file, "utf8");
      const blocks = findShareStudioBlocks(text);
      for (const block of blocks) {
        totalBlocks++;
        // Any assignment at all (string literal, ternary, ref) - not
        // checking the value shape, just that the prop is actually passed.
        if (!/entryPoint=/.test(block)) {
          missing.push(`${path.relative(REPO_ROOT, file)}: ${block.replace(/\s+/g, " ").slice(0, 100)}…`);
        }
      }
    }
    expect(totalBlocks).toBeGreaterThan(0);
    if (missing.length) {
      throw new Error(`<ShareStudio> call site(s) with no entryPoint - the owner readout's src= would read "unknown":\n  ${missing.join("\n  ")}`);
    }
    expect(missing).toEqual([]);
  });
});
