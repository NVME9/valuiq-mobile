// checkItemConfirm.ts (2026-11-15, fix/share-cta-and-check-item) — pure,
// testable payload builder for the "Check This Item" card's "Yes, that's
// it" / "Edit name" re-run (ScannerScreen.tsx's result step). Both buttons
// call rerunScan() with this exact shape - the SAME function/endpoint
// contract ScanConfirmScreen's History-edit re-run already uses
// (confirmedIdentification/isReanalyze, baked into rerunScan itself), so a
// re-run from this card inherits that endpoint's "don't burn a second scan
// off the monthly cap" behavior rather than re-deriving it.
//
// Deliberately has no netProfit/roi/buyTarget field: a CHECK ITEM re-run's
// whole point is asking the server to derive those fresh from a confirmed
// identity, never carrying a stale or withheld number into the request.
export interface CheckItemConfirmSourceResult {
  itemName?: string;
  item_name?: string;
  brand?: string;
  category?: string;
}

export interface BuildCheckItemRerunPayloadInput {
  result: CheckItemConfirmSourceResult | null | undefined;
  editedName: string;
  resultCondition: string;
  enteredBp: number;
}

export interface CheckItemRerunPayload {
  itemName: string;
  brand: string;
  category: string;
  condition: string;
  buyPrice: number;
}

export function buildCheckItemRerunPayload(input: BuildCheckItemRerunPayloadInput): CheckItemRerunPayload {
  const fallbackName = input.result?.itemName || input.result?.item_name || "";
  const itemName = (input.editedName || fallbackName).trim();
  const brand = (input.result?.brand && input.result.brand !== "Unknown") ? input.result.brand : "Unknown";
  const category = input.result?.category || "Other";
  const condition = input.resultCondition || "used-good";
  const buyPrice = input.enteredBp > 0 ? input.enteredBp : 0;
  return { itemName, brand, category, condition, buyPrice };
}
