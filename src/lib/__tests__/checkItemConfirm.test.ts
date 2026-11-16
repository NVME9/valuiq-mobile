import { buildCheckItemRerunPayload } from "../checkItemConfirm";

describe("buildCheckItemRerunPayload", () => {
  test("uses the edited name, trimmed, over the result's original guess", () => {
    const payload = buildCheckItemRerunPayload({
      result: { itemName: "Mystery Figurine" },
      editedName: "  Spawn Action Figure  ",
      resultCondition: "used-good",
      enteredBp: 0,
    });
    expect(payload.itemName).toBe("Spawn Action Figure");
  });

  test("falls back to result.itemName when nothing was edited", () => {
    const payload = buildCheckItemRerunPayload({
      result: { itemName: "Mystery Figurine" },
      editedName: "",
      resultCondition: "",
      enteredBp: 0,
    });
    expect(payload.itemName).toBe("Mystery Figurine");
  });

  test("falls back to result.item_name (snake_case) when itemName is absent", () => {
    const payload = buildCheckItemRerunPayload({
      result: { item_name: "Thrift Store Lamp" },
      editedName: "",
      resultCondition: "",
      enteredBp: 0,
    });
    expect(payload.itemName).toBe("Thrift Store Lamp");
  });

  test("brand defaults to Unknown when missing or already Unknown", () => {
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "", enteredBp: 0 }).brand).toBe("Unknown");
    expect(buildCheckItemRerunPayload({ result: { brand: "Unknown" }, editedName: "Item", resultCondition: "", enteredBp: 0 }).brand).toBe("Unknown");
    expect(buildCheckItemRerunPayload({ result: { brand: "Coach" }, editedName: "Item", resultCondition: "", enteredBp: 0 }).brand).toBe("Coach");
  });

  test("category defaults to Other", () => {
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "", enteredBp: 0 }).category).toBe("Other");
    expect(buildCheckItemRerunPayload({ result: { category: "Toys" }, editedName: "Item", resultCondition: "", enteredBp: 0 }).category).toBe("Toys");
  });

  test("condition defaults to used-good chip when none was ever selected", () => {
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "", enteredBp: 0 }).condition).toBe("used-good");
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "new-in-box", enteredBp: 0 }).condition).toBe("new-in-box");
  });

  test("buyPrice is 0, never negative/NaN, when no price was entered", () => {
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "", enteredBp: 0 }).buyPrice).toBe(0);
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "", enteredBp: -5 }).buyPrice).toBe(0);
    expect(buildCheckItemRerunPayload({ result: {}, editedName: "Item", resultCondition: "", enteredBp: 12 }).buyPrice).toBe(12);
  });

  test("handles a null result (never throws, never fabricates a name)", () => {
    const payload = buildCheckItemRerunPayload({ result: null, editedName: "", resultCondition: "", enteredBp: 0 });
    expect(payload.itemName).toBe("");
    expect(payload.brand).toBe("Unknown");
    expect(payload.category).toBe("Other");
  });

  test("payload shape never carries a profit/verdict field - only what a re-run request needs", () => {
    const payload = buildCheckItemRerunPayload({
      result: { itemName: "Item", brand: "Coach", category: "Bags" },
      editedName: "",
      resultCondition: "used-good",
      enteredBp: 10,
    });
    expect(Object.keys(payload).sort()).toEqual(["brand", "buyPrice", "category", "condition", "itemName"]);
  });
});
