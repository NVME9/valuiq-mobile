// tagConfirmState.ts (2026-10-19) — pure state-transition functions for the
// tag-read confirm/edit flow (ScannerScreen's "We read $X off the tag —
// correct?" card). Extracted out of ScannerScreen.tsx's inline
// setBuyPrice/setTagConfirmPending calls so this logic is testable without
// rendering a component - see scripts/test_tag_confirm_state.ts for the
// pure-function tests. Behavior is UNCHANGED from the inline version this
// replaces; this is a pure refactor, not a logic change.

export interface TagConfirmInput {
  retailPriceRead: number | null | undefined;
  retailPriceNeedsConfirmation: boolean | null | undefined;
}

// Derives whether the tag-confirm card should show for a FRESH scan result
// - "withheld": the two-pass tag read (see deal-ai-pro's lib/lensPricing.ts
// readTagPriceTwoPass) found a price but the two independent passes either
// disagreed or weren't both high-confidence, so it's a suggestion needing
// one tap, never silently trusted as the buy price.
export function deriveTagConfirmPending(input: TagConfirmInput): boolean {
  return Number(input.retailPriceRead) > 0 && !!input.retailPriceNeedsConfirmation;
}

export interface TagConfirmUIState {
  buyPrice: string;
  tagConfirmPending: boolean;
}

// "accepted": user taps "Confirm $X" - the suggested tag price becomes the
// real buy price, same as if they'd typed it.
export function confirmTagRead(retailPriceRead: number): TagConfirmUIState {
  return { buyPrice: String(retailPriceRead), tagConfirmPending: false };
}

// "edit": user taps "Edit" - dismisses the suggestion without accepting it,
// leaves the field blank for manual entry (never silently keeps the
// withheld number around).
export function editTagRead(): TagConfirmUIState {
  return { buyPrice: "", tagConfirmPending: false };
}

// "clear": a fresh scan (or rescan) starts - resets state from whatever the
// PREVIOUS scan left behind, before this new scan's own tagConfirmPending
// is derived (via deriveTagConfirmPending) from ITS OWN result. Without
// this, a confirmed/edited price from scan N could leak into scan N+1's
// initial render for one frame before the new result lands.
export function clearForNewScan(): TagConfirmUIState {
  return { buyPrice: "", tagConfirmPending: false };
}
