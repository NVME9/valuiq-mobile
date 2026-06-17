// purchases.ts — Apple In-App Purchase via RevenueCat.
// Handles init, fetching offerings, purchasing, restoring, and unlocking the plan
// in our backend (user_plans) so getPlan() reflects the purchase.
import Purchases, { PurchasesOffering, CustomerInfo } from "react-native-purchases";
import { Platform } from "react-native";
import { API_BASE } from "./api";

// TODO: paste your RevenueCat Public SDK key (starts with appl_) here.
const RC_APPLE_KEY = "appl_NNZQuUUREjkiLNoLfPXDfKKXXuN";

// The entitlement identifier configured in RevenueCat that means "has a paid plan".
const ENTITLEMENT = "ValuIQ Pro";

let _configured = false;

export function configurePurchases(appUserId?: string) {
  if (_configured) return;
  if (Platform.OS === "ios") {
    Purchases.configure({ apiKey: RC_APPLE_KEY, appUserID: appUserId });
    _configured = true;
  }
}

// Fetch the current offering (the set of packages to show on the paywall).
export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

// Determine the active product id from customer info (for plan mapping).
function activeProductId(info: CustomerInfo): string | null {
  const ent = info.entitlements.active[ENTITLEMENT];
  if (ent) return ent.productIdentifier;
  // fallback: any active subscription
  const subs = info.activeSubscriptions;
  if (subs && subs.length) return subs[0];
  return null;
}

// Tell our backend to set the plan based on the customer's entitlements.
async function syncPlanToBackend(token: string, info: CustomerInfo): Promise<string> {
  const active = !!info.entitlements.active[ENTITLEMENT] ||
    (info.activeSubscriptions && info.activeSubscriptions.length > 0) ||
    // non-consumable (lifetime) shows up in allPurchasedProductIdentifiers
    (info.allPurchasedProductIdentifiers || []).some((p) => p.toLowerCase().includes("lifetime"));
  const productId =
    activeProductId(info) ||
    (info.allPurchasedProductIdentifiers || []).find((p) => p.toLowerCase().includes("lifetime")) ||
    "";
  try {
    const r = await fetch(`${API_BASE}/api/set-plan-iap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, productId, active }),
    });
    const d = await r.json();
    return d.plan || "free";
  } catch {
    return "free";
  }
}

// Purchase a package. Returns the new plan on success, or throws on real errors.
export async function purchasePackage(
  token: string,
  pkg: any
): Promise<{ plan: string; cancelled?: boolean }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const plan = await syncPlanToBackend(token, customerInfo);
    return { plan };
  } catch (e: any) {
    if (e.userCancelled) return { plan: "free", cancelled: true };
    throw e;
  }
}

// Restore purchases (Apple requires this). Returns the resulting plan.
export async function restorePurchases(token: string): Promise<string> {
  const info = await Purchases.restorePurchases();
  return syncPlanToBackend(token, info);
}

// On app launch (after login), refresh entitlement state and sync to backend.
export async function refreshEntitlements(token: string): Promise<string> {
  try {
    const info = await Purchases.getCustomerInfo();
    return syncPlanToBackend(token, info);
  } catch {
    return "free";
  }
}
