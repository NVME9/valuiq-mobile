// saleCapture.ts — the data moat: capture real sale outcomes (free, no SMS)
// Routes through the web API (same pattern as updateScan/getScanHistory),
// which uses the service-role key server-side. No direct Supabase, no RLS issues.
import { API_BASE } from "./api";

export type SaleOutcome = "sold" | "passed" | "not_yet";

export interface PendingScan {
  id: string;
  item_name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  net_profit?: number;
  sell_price?: number;
  best_platform?: string;
  created_at: string;
  daysListed: number;
}

// The saved row PATCH now hands back (deal-ai-pro scan-history/route.ts's
// PATCH does `.select().single()` and computes a true fee-adjusted
// net_profit from actual_sold_price server-side) - just the fields the
// Flex Reveal / stat-selection flow actually needs.
export interface SavedSale {
  id: string;
  item_name?: string;
  brand?: string;
  category?: string;
  buy_price?: number;
  actual_sold_price?: number;
  net_profit?: number;
  days_to_sale?: number;
  sold_status?: string;
}

export interface RecordSaleResult {
  success: boolean;
  scan: SavedSale | null;
}

// Record an outcome via the web PATCH (whitelisted moat fields).
// For "sold", pass the real price; days_to_sale defaults to createdAt-based
// but can be overridden (the 2-field sheet pre-fills it, editable) since a
// reseller often remembers the real listing date better than "now minus
// scan date" would guess.
export async function recordSaleOutcome(
  token: string,
  scanId: string,
  outcome: SaleOutcome,
  channel: "push" | "in_app",
  createdAt?: string,
  actualPrice?: number,
  daysOverride?: number
): Promise<RecordSaleResult> {
  const updates: any = {
    sold_status: outcome,
    capture_prompted_at: new Date().toISOString(),
    capture_channel: channel,
  };
  if (outcome === "sold") {
    const soldDate = new Date();
    updates.sold_date = soldDate.toISOString();
    if (typeof actualPrice === "number" && actualPrice > 0) {
      updates.actual_sold_price = actualPrice;
    }
    if (typeof daysOverride === "number" && daysOverride > 0) {
      updates.days_to_sale = Math.round(daysOverride);
    } else if (createdAt) {
      updates.days_to_sale = Math.max(
        1,
        Math.round((soldDate.getTime() - new Date(createdAt).getTime()) / 86400000)
      );
    }
  }
  try {
    const r = await fetch(
      `${API_BASE}/api/scan-history?token=${encodeURIComponent(token)}&id=${encodeURIComponent(scanId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    const j = await r.json().catch(() => ({}));
    return { success: !!j.success, scan: j.scan || null };
  } catch {
    return { success: false, scan: null };
  }
}

// Best-effort default days-to-sale for pre-filling the 2-field sheet -
// same "now minus scan created_at" math the server used to compute alone,
// exposed here so the UI can show it BEFORE saving, not just after.
export function defaultDaysToSale(createdAt?: string): number {
  if (!createdAt) return 1;
  return Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

// Turns a raw /api/scan-history row (snake_case: item_name, net_profit,
// sell_price, best_platform, created_at) into the PendingScan shape
// SaleCaptureCard needs.
export function toPendingScan(row: any): PendingScan {
  const createdAt = row.created_at || new Date().toISOString();
  return {
    id: row.id,
    item_name: row.item_name || row.itemName || "Item",
    brand: row.brand,
    category: row.category,
    image_url: row.image_url,
    net_profit: row.net_profit ?? row.netProfit,
    sell_price: row.sell_price ?? row.sellPrice,
    best_platform: row.best_platform ?? row.bestPlatform,
    created_at: createdAt,
    daysListed: Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 86400000)),
  };
}
