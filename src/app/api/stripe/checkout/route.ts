import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecret = process.env.STRIPE_SECRET_KEY;

if (!stripeSecret) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(stripeSecret);

type ReqBody = {
  userId: string;
  pack: "starter" | "plus" | "pro";
};

const PACKS: Record<
  ReqBody["pack"],
  { credits: number; amountCents: number }
> = {
  starter: { credits: 25, amountCents: 500 },
  plus: { credits: 75, amountCents: 1200 },
  pro: { credits: 200, amountCents: 2500 },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;

    if (!body.userId) {
      return NextResponse.json(
        { ok: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    const pack = body.pack ?? "starter";
    const selected = PACKS[pack];

    if (!selected) {
      return NextResponse.json(
        { ok: false, error: "Invalid pack" },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}?success=true`,
      cancel_url: `${appUrl}?canceled=true`,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Git-a-Job Credits (${selected.credits})`,
            },
            unit_amount: selected.amountCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: body.userId,
        credits: String(selected.credits),
      },
    });

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
