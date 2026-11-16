// money.ts — single display-money formatter, shared so the sign-placement
// fix below only has to exist once.
//
// MEASURED BUG (2026-11-16): two separate ad-hoc fmtMoney copies
// (ScannerScreen.tsx, lib/checkItemCard.ts) built the string as
// `$${n}`/`$${n.toFixed(2)}` on the SIGNED value directly - for a real
// loss (n = -26.7) that put the "$" before the minus sign, rendering
// "$-26.70" on screen instead of the conventional "-$26.70". Fixed once
// here: sign is pulled off first, "$" always prefixes the absolute value.
// Whole-dollar amounts stay undecorated ($21), only a genuine fractional
// amount gets padded to two decimals ($21.10) - same precision rule the
// original fmtMoney used, just sign-safe.
export function formatMoney(n: number): string {
  const sign = n < 0 ? "-$" : "$";
  const abs = Math.abs(n);
  return sign + (Number.isInteger(abs) ? String(abs) : abs.toFixed(2));
}
