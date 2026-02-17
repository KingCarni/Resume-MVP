// src/app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");

const stripe = new Stripe(stripeSecret);

type ReqBody = {
  userId: string;
  pack: "starter" | "plus" | "pro";
};

const PACKS: Record<ReqBody["pack"], { credits: number; amountCents: number }> = {
  starter: { credits: 25, amountCents: 500 },
  plus: { credits: 75, amountCents: 1200 },
  pro: { credits: 200, amountCents: 2500 },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const userId = String(body.userId ?? "");
    const pack = (body.pack ?? "starter") as ReqBody["pack"];

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 });
    }
    if (!PACKS[pack]) {
      return NextResponse.json({ ok: false, error: "Invalid pack" }, { status: 400 });
    }

    const { credits, amountCents } = PACKS[pack];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}/?stripe=success`,
      cancel_url: `${appUrl}/?stripe=cancel`,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Git-a-Job Credits (${credits})` },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        credits: String(credits),
        pack,
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Checkout error" }, { status: 500 });
  }
}
