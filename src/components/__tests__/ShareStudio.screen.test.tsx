// ShareStudio.screen.test.tsx — renders the FULL Studio screen (not just
// StudioCardContent) and proves the PERSONALIZE panel - the 4 hook chips,
// the Custom hook pill, the handle pill, and the Hide price toggle pill -
// is rendered, ALWAYS VISIBLE (no collapse/sheet/dropdown), in BOTH the
// plain scan variant (winData omitted) and the Win variant (winData set).
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import ShareStudio from "../ShareStudio";

// Collects every rendered Text node's string content, flattened.
function collectText(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out)); return out; }
  if (typeof node !== "object") return out;
  if (node.type === "Text" && node.children) {
    const txt = Array.isArray(node.children) ? node.children.join("") : String(node.children);
    out.push(txt);
  }
  if (node.children) collectText(node.children, out);
  return out;
}

const BASE_PROPS = {
  onClose: () => {},
  token: "test-token",
  scanId: "scan-1",
  itemName: "Vintage Carhartt Jacket",
  photoBase64: null,
  paidPrice: 20,
  sellPrice: 65,
  profit: 38,
  roi: 133,
  profitConfidence: "sold-backed" as const,
  heroVerdict: "SOLID" as const,
  isOwner: false,
};

async function renderStudio(extraProps: Record<string, any> = {}) {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(<ShareStudio visible {...BASE_PROPS} {...extraProps} />);
  });
  // Flush the microtask queue (loadStudioPrefs is async) so prefs-driven
  // UI (handle pill text, etc.) has settled before assertions run.
  await act(async () => { await Promise.resolve(); });
  return tree!;
}

const HOOK_PRESETS = ["Would you flip it?", "Found this at the thrift", "Pass or buy?", "Real find, real numbers."];

function expectPersonalizePanel(tree: TestRenderer.ReactTestRenderer) {
  const texts = collectText(tree.toJSON());
  for (const hook of HOOK_PRESETS) {
    expect(texts).toContain(hook);
  }
  expect(texts).toContain("Custom hook");
  expect(texts.some((t) => t === "+ Add your @handle" || t.startsWith("@"))).toBe(true);
  expect(texts.some((t) => t === "Hide price" || t === "Price hidden")).toBe(true);
  expect(texts).toContain("PERSONALIZE");
}

describe("ShareStudio screen - Personalize panel always visible", () => {
  test("scan (find) variant: all 4 hook chips, Custom hook, handle pill, Hide price toggle all present", async () => {
    const tree = await renderStudio();
    expectPersonalizePanel(tree);
  });

  test("Win variant: the SAME Personalize panel is present (only the card content variant differs)", async () => {
    const tree = await renderStudio({
      winData: { boughtPrice: 20, soldPrice: 65, profit: 45 },
    });
    expectPersonalizePanel(tree);
    // Win variant's own card copy shows up too.
    const texts = collectText(tree.toJSON());
    expect(texts.some((t) => t.includes("profit"))).toBe(true);
  });

  test("Row 1 (Dark/Light/Bold) and the Share button are both present, in both variants", async () => {
    for (const winData of [undefined, { boughtPrice: 20, soldPrice: 65, profit: 45 }]) {
      const tree = await renderStudio(winData ? { winData } : {});
      const texts = collectText(tree.toJSON());
      expect(texts).toContain("Dark");
      expect(texts).toContain("Light");
      expect(texts).toContain("Bold");
      expect(texts).toContain("Share");
    }
  });
});
