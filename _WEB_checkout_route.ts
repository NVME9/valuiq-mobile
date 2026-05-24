export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
});
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PLAN_TO_PRICE: Record<string, string> = {
  seller:        "price_1TYE6mDa11MSShNkJ2kk66sh",
  pro:           "price_1TYE7tDa11MSShNkHRasef2t",
  lifetime:      "price_1TYE9NDa11MSShNkGlOw6GrN",
  seller_annual: "price_1TY3J9Da11MSShNkTeL8tebq",
  pro_annual:    "price_1TY3KNDa11MSShNkZtmBa71u",
  lifetime497:   "price_1TY3H3Da11MSShNkj7D6UetR",
};

const LIFETIME_PRICES = new Set([
  "price_1TYE9NDa11MSShNkGlOw6GrN",
  "price_1TY3H3Da11MSShNkj7D6UetR",
]);

export async function POST(req: Request) {
  try {
    const { plan, priceId: clientPriceId, userToken } = await req.json();
    const finalPriceId = clientPriceId || PLAN_TO_PRICE[plan];
    if (!finalPriceId) {
      return NextResponse.json({ error: "Invalid plan: " + plan }, { status: 400 });
    }

    let userId = "";
    if (userToken) {
      try {
        const { data: { user } } = await supabase.auth.getUser(userToken);
        if (user) userId = user.id;
      } catch {}
    }

    const isLifetime = LIFETIME_PRICES.has(finalPriceId) || plan === "lifetime";
    const origin = req.headers.get("origin") || "https://www.getvaluiq.com";

    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? "payment" : "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: finalPriceId, quantity: 1 }],
      // NO customer_email — prevents Stripe Link from recognizing any saved account
      metadata: { userId, plan: plan || "direct" },
      success_url: origin + "/dashboard?upgrade_success=true&plan=" + (plan || "direct"),
      cancel_url: origin + "/pricing",
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe session missing URL" }, { status: 500 });
    }
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    console.error("Checkout error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
