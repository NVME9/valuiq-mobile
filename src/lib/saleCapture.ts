// saleCapture.ts — the data moat: capture real sale outcomes (free, no SMS)
// Routes through the web API (same pattern as updateScan/getScanHistory),
// which uses the service-role key server-side. No direct Supabase, no RLS issues.
import { API_BASE } from "./api";

export type SaleOutcome = "sold" | "passed" | "not_yet";

function cleanItemName(n: string): string {
  return (n || "")
    .replace(/^run_\d+\s*/i, "")
    .split(/\|\|\||data:image|;base64|\/9j\//i)[0]
    .replace(/\s+(Etsy|eBay|Poshmark|Mercari|Depop)\s*$/i, "")
    .trim() || "Item";
}

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

// Fetch BUY scans 10+ days old that still need an outcome (server filters type=pending_sale).
// Applies a client-side cooldown so we don't re-prompt items asked about in the last `cooldownDays`.
export async function getPendingSaleScans(
  token: string,
  cooldownDays = 4,
  limit = 5
): Promise<PendingScan[]> {
  try {
    const url =
      `${API_BASE}/api/scan-history?token=${encodeURIComponent(token)}&type=pending_sale&limit=50`;
    const rows = await fetch(url).then((r) => r.json());
    if (!Array.isArray(rows)) return [];
    const now = Date.now();
    const cooldownMs = cooldownDays * 86400000;
    return rows
      .filter((r: any) => {
        // skip if prompted recently
        if (r.capture_prompted_at) {
          const last = new Date(r.capture_prompted_at).getTime();
          if (now - last < cooldownMs) return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((r: any) => ({
        id: r.id,
        item_name: cleanItemName(r.item_name),
        brand: r.brand,
        category: r.category,
        image_url: r.image_url,
        net_profit: r.net_profit,
        sell_price: r.sell_price,
        best_platform: r.best_platform,
        created_at: r.created_at,
        daysListed: Math.max(1, Math.round((now - new Date(r.created_at).getTime()) / 86400000)),
      }));
  } catch {
    return [];
  }
}

// Record an outcome via the web PATCH (whitelisted moat fields).
// For "sold", pass the real price; days_to_sale is computed here from createdAt.
export async function recordSaleOutcome(
  token: string,
  scanId: string,
  outcome: SaleOutcome,
  channel: "push" | "in_app",
  createdAt?: string,
  actualPrice?: number
): Promise<boolean> {
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
    if (createdAt) {
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
    return !!j.success;
  } catch {
    return false;
  }
}

// User dismissed without answering -> set capture_prompted_at so it goes quiet for the cooldown.
export async function snoozeCapture(token: string, scanId: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${API_BASE}/api/scan-history?token=${encodeURIComponent(token)}&id=${encodeURIComponent(scanId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_prompted_at: new Date().toISOString() }),
      }
    );
    const j = await r.json().catch(() => ({}));
    return !!j.success;
  } catch {
    return false;
  }
}
