// ShareStudio.render.test.tsx — renders the exported card (StudioCardContent)
// once per look x format, plus the Win variant, proving none of them throw
// on a normal payload, AND asserts every single Text node in the rendered
// tree has allowFontScaling={false} (item 2's root cause: a device with a
// large system text size must never be able to blow up this layout).
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StudioCardContent } from "../ShareStudio";
import {
  buildPriceBlock, buildWinCardText, stampForHeroVerdict,
  StudioLook, StudioFormat,
} from "../../lib/shareStudio";

const IMG_SIZE = { w: 1200, h: 1600 };
const CROP = { scale: 1.3, translate: { x: 10, y: -8 } };

const PRICE_BLOCK = buildPriceBlock({
  paidPrice: 20, sellPrice: 85, profit: 52, roi: 160, confidence: "sold-backed", hidePrice: false,
});
const WIN_TEXT = buildWinCardText({ boughtPrice: 20, soldPrice: 85, profit: 52 });

async function renderOk(el: React.ReactElement) {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(el);
  });
  return tree!;
}

// Recursively collects every rendered host node of type "Text" (RN's own
// Text host component shows up as "Text" in the test renderer's JSON tree).
function collectTextNodes(node: any, out: any[] = []): any[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectTextNodes(n, out));
    return out;
  }
  if (typeof node !== "object") return out;
  if (node.type === "Text") out.push(node);
  if (node.children) collectTextNodes(node.children, out);
  return out;
}

const LOOKS: StudioLook[] = ["dark", "light", "bold"];
const FORMATS: StudioFormat[] = ["story", "feed", "square"];

describe("StudioCardContent", () => {
  for (const look of LOOKS) {
    for (const format of FORMATS) {
      test(`renders the find card for "${look}" x "${format}" without throwing, every Text has allowFontScaling false`, async () => {
        const tree = await renderOk(
          <StudioCardContent
            format={format}
            scale={0.3}
            look={look}
            photoUri="data:image/jpeg;base64,abc123"
            imgSize={IMG_SIZE}
            crop={CROP}
            handle="@thriftflips"
            hook="Would you flip it?"
            isWin={false}
            stampText={stampForHeroVerdict("SOLID")}
            priceBlock={PRICE_BLOCK}
            itemName="Vintage Carhartt Detroit Jacket, Size XL, Union Made in USA"
            isLoss={false}
          />
        );
        const json = tree.toJSON();
        expect(json).not.toBeNull();
        const textNodes = collectTextNodes(json);
        expect(textNodes.length).toBeGreaterThan(0);
        for (const n of textNodes) {
          expect(n.props.allowFontScaling).toBe(false);
        }
      });
    }

    test(`renders the Win card for "${look}" without throwing, every Text has allowFontScaling false`, async () => {
      const tree = await renderOk(
        <StudioCardContent
          format="story"
          scale={1}
          look={look}
          photoUri={null}
          imgSize={null}
          crop={{ scale: 1, translate: { x: 0, y: 0 } }}
          handle=""
          hook={null}
          isWin
          winText={WIN_TEXT}
          stampText={null}
          priceBlock={PRICE_BLOCK}
          itemName="Vintage Carhartt Detroit Jacket"
          isLoss={false}
        />
      );
      const json = tree.toJSON();
      expect(json).not.toBeNull();
      const textNodes = collectTextNodes(json);
      for (const n of textNodes) {
        expect(n.props.allowFontScaling).toBe(false);
      }
    });
  }

  test("CHECK ITEM verdict renders with no stamp at all (no stray node, no 'UNCONFIRMED' text)", async () => {
    const tree = await renderOk(
      <StudioCardContent
        format="feed"
        scale={1}
        look="dark"
        photoUri={null}
        imgSize={null}
        crop={{ scale: 1, translate: { x: 0, y: 0 } }}
        handle=""
        hook={null}
        isWin={false}
        stampText={stampForHeroVerdict("CHECK ITEM")}
        priceBlock={PRICE_BLOCK}
        itemName="Mystery Item"
        isLoss={false}
      />
    );
    const json = tree.toJSON();
    const textNodes = collectTextNodes(json);
    const allText = textNodes.map((n) => (Array.isArray(n.children) ? n.children.join("") : n.children)).join(" ");
    expect(allText).not.toContain("UNCONFIRMED");
  });

  test("a logged loss on the Win card still renders (honest, not hidden)", async () => {
    const lossText = buildWinCardText({ boughtPrice: 50, soldPrice: 40, profit: -10 });
    const tree = await renderOk(
      <StudioCardContent
        format="square"
        scale={1}
        look="bold"
        photoUri={null}
        imgSize={null}
        crop={{ scale: 1, translate: { x: 0, y: 0 } }}
        handle=""
        hook={null}
        isWin
        winText={lossText}
        stampText={null}
        priceBlock={PRICE_BLOCK}
        itemName="Item"
        isLoss
      />
    );
    expect(tree.toJSON()).not.toBeNull();
  });

  test("renders with no photo (null photoUri/imgSize) without throwing", async () => {
    const tree = await renderOk(
      <StudioCardContent
        format="story"
        scale={1}
        look="dark"
        photoUri={null}
        imgSize={null}
        crop={{ scale: 1, translate: { x: 0, y: 0 } }}
        handle=""
        hook={null}
        isWin={false}
        stampText={null}
        priceBlock={PRICE_BLOCK}
        itemName="Item"
        isLoss={false}
      />
    );
    expect(tree.toJSON()).not.toBeNull();
  });
});
