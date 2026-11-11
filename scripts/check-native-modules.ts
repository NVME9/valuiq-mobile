// scripts/check-native-modules.ts — OTA-safety preflight: fails if any file
// under src/ (or the app roots) imports a package that ships native code
// but isn't in the currently-shipping native binary's module list.
//
// WHY (2026-11-11, OTA crash incident): build #46's binary (iOS, 1.2.8) is
// the native code every OTA update runs against until the next store
// build. Any JS/TS file that's eagerly reachable from index.ts (which is
// effectively everything imported by App.tsx, directly or transitively -
// Metro has no lazy module boundary unless the code itself defers a
// require()) gets its imports evaluated the instant the bundle loads. A
// package whose entry file calls something like
// `TurboModuleRegistry.getEnforcing("X")` at module scope (a common Expo/
// RN pattern - see react-native-view-shot's NativeRNViewShot.ts) THROWS
// immediately if "X" isn't registered on the native side - before React
// ever mounts, so no error boundary can catch it. expo-updates' own
// ErrorRecovery then reports that as a fatal re-raised NSException and
// rolls the device back to the embedded bundle. This script can't catch
// every possible startup throw, but it catches the single most common and
// mechanical one: shipping a new native-requiring package (or using one
// for the first time at the TOP of an eagerly-loaded file) without a
// matching native build out yet.
//
// Run: npx tsx scripts/check-native-modules.ts
// Exit 0 = clean. Exit 1 = found an import the current binary can't serve.
//
// Regenerating the baseline (scripts/native-modules-build46.json): ONLY
// after a new native build actually ships (see this incident's own
// diagnosis for the exact commands - git worktree at the new build's
// commit, `npm install`, `npx expo-modules-autolinking resolve --platform
// ios`, plus that commit's package.json dependencies). Never hand-edit it
// to make this script pass - that defeats the entire point.
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const BASELINE_PATH = path.join(ROOT, "scripts", "native-modules-build46.json");

// Directories/files that are actually part of the shipped JS bundle -
// anything reachable from App.tsx. Deliberately NOT node_modules, scripts/,
// or *.bak-* files (dead code, never bundled).
const SCAN_ROOTS = ["App.tsx", "index.ts", "src", "components", "lib"];

// A bare import is only "a native-module import worth checking" if its
// root package name matches one of these prefixes - this is a heuristic,
// not a certainty (some expo-*/react-native-* packages are pure JS), but a
// false positive here just means the baseline needs that package added,
// which is a one-line, obviously-correct fix - the risk of a false
// NEGATIVE (missing a real native import) is the one this script exists to
// eliminate.
const NATIVE_PREFIXES = ["expo", "react-native", "@react-native"];

// Packages this project treats as always-safe even though they match a
// native prefix - pure-JS or web-only, never touches a native module.
const ALLOWLIST = new Set<string>(["react-native-web", "react-native-url-polyfill"]);

interface Baseline {
  nativePackages: Record<string, string>;
  expoAutolinkedModules: Record<string, string>;
}

function loadBaseline(): Set<string> {
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  return new Set([
    ...Object.keys(raw.nativePackages || {}),
    ...Object.keys(raw.expoAutolinkedModules || {}),
  ]);
}

function listFiles(dir: string, out: string[]) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // SCAN_ROOTS includes a couple of names that may not exist as dirs at repo root
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      listFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes(".bak")) {
      out.push(full);
    }
  }
}

// Root package name from an import path: scoped (@scope/pkg) keeps two
// segments, everything else keeps one, so "expo-image-manipulator/foo" and
// "@react-native-async-storage/async-storage/bar" both resolve correctly.
function rootPackageName(importPath: string): string | null {
  if (importPath.startsWith(".") || importPath.startsWith("/")) return null;
  const parts = importPath.split("/");
  if (importPath.startsWith("@")) return parts.slice(0, 2).join("/");
  return parts[0];
}

function findImports(source: string): string[] {
  const found: string[] = [];
  const importRe = /\bimport\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/g;
  const requireRe = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) found.push(m[1]);
  while ((m = requireRe.exec(source))) found.push(m[1]);
  return found;
}

function main() {
  const baseline = loadBaseline();
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const full = path.join(ROOT, root);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      listFiles(full, files);
    } else if (fs.existsSync(full)) {
      files.push(full);
    }
  }

  // offending package -> files that import it at top level
  const offenders = new Map<string, Set<string>>();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const imp of findImports(source)) {
      const pkg = rootPackageName(imp);
      if (!pkg || ALLOWLIST.has(pkg)) continue;
      const isNativePrefixed = NATIVE_PREFIXES.some((p) => pkg === p || pkg.startsWith(p + "-") || pkg.startsWith(p + "/"));
      if (!isNativePrefixed) continue;
      if (baseline.has(pkg)) continue;
      if (!offenders.has(pkg)) offenders.set(pkg, new Set());
      offenders.get(pkg)!.add(rel);
    }
  }

  if (offenders.size === 0) {
    console.log(`check-native-modules: OK - every native-prefixed import is in the build #46 baseline (${baseline.size} known packages).`);
    process.exit(0);
  }

  console.log("check-native-modules: FAILED\n");
  console.log("These packages ship native code and are imported by the current JS, but are NOT in the build #46 baseline (scripts/native-modules-build46.json) - an OTA publish built from this tree can crash on launch for every device still on that binary:\n");
  for (const [pkg, fileSet] of offenders) {
    console.log(`  ${pkg}`);
    for (const f of fileSet) console.log(`    imported by ${f}`);
  }
  console.log("\nFix: either lazy-require the module (guarded try/catch, feature hidden when it's missing - see RevealScreen.tsx/RevealPhotoEditor.tsx for the pattern), or hold this change for the next native build and regenerate the baseline from that build's commit.");
  process.exit(1);
}

main();
