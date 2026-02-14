// src/app/api/donate/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  amountCad: number;
};

function toCents(amountCad: number) {
  return Math.round(amountCad * 100);
}

export async function POST(req: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_SECRET_KEY in .env.local" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(secretKey);

    const body = (await req.json()) as Partial<ReqBody>;
    const amountCad = Number(body.amountCad);

    if (!Number.isFinite(amountCad) || amountCad < 1 || amountCad > 250) {
      return NextResponse.json(
        { ok: false, error: "Invalid amountCad. Use a value between 1 and 250." },
        { status: 400 }
      );
    }

    const origin =
      req.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      success_url: `${origin}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/donate/cancel`,
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: { name: "Support Resume MVP" },
            unit_amount: toCents(amountCad),
          },
          quantity: 1,
        },
      ],
      metadata: {
        app: "Resume-MVP",
        type: "donation",
        amountCad: String(amountCad),
      },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    console.error("donate POST error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
