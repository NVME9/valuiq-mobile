// ShareStudio.render.test.tsx — renders the exported card (StudioCardContent)
// once per look, plus the Win variant, proving none of them throw on a
// normal payload. Same TestRenderer+act pattern resultComponents.crash.test.tsx
// already uses for the result screen's own sub-components.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StudioCardContent } from "../ShareStudio";
import { buildCardText, buildWinCardText, StudioLook } from "../../lib/shareStudio";

const FRAME = { w: 300, h: 533 };
const IMG_SIZE = { w: 1200, h: 1600 };
const CROP = { scale: 1.3, translate: { x: 10, y: -8 } };

const CARD_TEXT = buildCardText({
  itemName: "Vintage Carhartt Detroit Jacket, Size XL",
  verdictEmoji: "✅",
  verdictLabel: "BUY IT",
  paidPrice: 20,
  sellPrice: 85,
  profit: 52,
  roi: 160,
  confidence: "sold-backed",
  hidePrice: false,
});

const WIN_HEADLINE = buildWinCardText({ boughtPrice: 20, soldPrice: 85, profit: 52 }).headline;

async function renderOk(el: React.ReactElement) {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(el);
  });
  return tree!;
}

describe("StudioCardContent", () => {
  const looks: StudioLook[] = ["dark", "light", "bold", "clean"];

  for (const look of looks) {
    test(`renders the find card for the "${look}" look without throwing`, async () => {
      const tree = await renderOk(
        <StudioCardContent
          look={look}
          frame={FRAME}
          photoUri="data:image/jpeg;base64,abc123"
          imgSize={IMG_SIZE}
          crop={CROP}
          handle="@thriftflips"
          isWin={false}
          cardText={CARD_TEXT}
          isLoss={false}
        />
      );
      expect(tree.toJSON()).not.toBeNull();
    });

    test(`renders the Win card for the "${look}" look without throwing`, async () => {
      const tree = await renderOk(
        <StudioCardContent
          look={look}
          frame={FRAME}
          photoUri="data:image/jpeg;base64,abc123"
          imgSize={IMG_SIZE}
          crop={CROP}
          handle=""
          isWin
          winHeadline={WIN_HEADLINE}
          cardText={CARD_TEXT}
          isLoss={false}
        />
      );
      expect(tree.toJSON()).not.toBeNull();
    });
  }

  test("renders with no photo (null photoUri/imgSize) without throwing", async () => {
    const tree = await renderOk(
      <StudioCardContent
        look="dark"
        frame={FRAME}
        photoUri={null}
        imgSize={null}
        crop={{ scale: 1, translate: { x: 0, y: 0 } }}
        handle=""
        isWin={false}
        cardText={CARD_TEXT}
        isLoss={false}
      />
    );
    expect(tree.toJSON()).not.toBeNull();
  });

  test("a logged loss on the Win card still renders (honest, not hidden)", async () => {
    const lossHeadline = buildWinCardText({ boughtPrice: 50, soldPrice: 40, profit: -10 }).headline;
    const tree = await renderOk(
      <StudioCardContent
        look="bold"
        frame={FRAME}
        photoUri={null}
        imgSize={null}
        crop={{ scale: 1, translate: { x: 0, y: 0 } }}
        handle=""
        isWin
        winHeadline={lossHeadline}
        cardText={CARD_TEXT}
        isLoss
      />
    );
    expect(tree.toJSON()).not.toBeNull();
  });
});
