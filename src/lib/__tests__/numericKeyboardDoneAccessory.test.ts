// numericKeyboardDoneAccessory.test.ts — a simple source-scan guard for the
// NUMBER PAD LOCK fix: every numeric <TextInput/> (keyboardType number-pad/
// decimal-pad/numeric) must go through KeyboardDoneBar's numericFieldProps()
// so it always gets the Done-accessory id + the matching ScrollView wiring.
// A bare `keyboardType="decimal-pad"` (etc.) literal is exactly the old,
// broken pattern this fix replaces - iOS's number pads have no Return key
// at all, so that literal alone leaves the field with no way to dismiss the
// keyboard. This test fails the moment anyone reintroduces that literal
// anywhere in the app (new screen or an old one regressing), without having
// to mount/render every screen in the suite.
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCAN_DIRS = ["src", "."]; // "." picks up App.tsx at the repo root
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "__tests__", "ios", "android", ".expo", "dist", "build"]);
// The ONE file allowed to even mention these literals - they're legitimate
// here as plain string VALUES inside numericFieldProps() itself, never as a
// JSX `keyboardType="..."` attribute.
const ALLOWED_FILE = path.join("src", "components", "KeyboardDoneBar.tsx");

const BARE_KEYBOARD_TYPE = /keyboardType\s*=\s*["'](number-pad|decimal-pad|numeric)["']/g;

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

function collectSourceFiles(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const found: string[] = [];
    if (dir === ".") {
      // Only this directory's own files (not a recursive walk - "src" below
      // already covers the tree, and walking "." recursively would just
      // re-walk "src" a second time and double up node_modules exclusion
      // logic for no reason).
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
          found.push(path.join(abs, entry.name));
        }
      }
    } else {
      walk(abs, found);
    }
    for (const f of found) {
      const rel = path.relative(REPO_ROOT, f);
      if (!seen.has(rel)) { seen.add(rel); out.push(f); }
    }
  }
  return out;
}

describe("every numeric TextField gets the Done-accessory wrapper", () => {
  test("no source file uses a bare keyboardType number-pad/decimal-pad/numeric literal", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles()) {
      const rel = path.relative(REPO_ROOT, file);
      if (rel === ALLOWED_FILE) continue;
      const text = fs.readFileSync(file, "utf8");
      const matches = text.match(BARE_KEYBOARD_TYPE);
      if (matches) offenders.push(`${rel} (${matches.length} match${matches.length > 1 ? "es" : ""})`);
    }
    if (offenders.length) {
      throw new Error(
        `Found bare keyboardType="number-pad"/"decimal-pad"/"numeric" literals - these need ` +
        `{...numericFieldProps("decimal"|"integer")} from components/KeyboardDoneBar instead, ` +
        `so the field gets a working Done key on iOS:\n  ${offenders.join("\n  ")}`
      );
    }
    expect(offenders).toEqual([]);
  });
});
