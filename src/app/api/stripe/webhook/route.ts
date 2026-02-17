// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helps you confirm the route exists in prod (browser GET)
export async function GET() {
  return NextResponse.json({ ok: true, route: "stripe webhook alive" });
}

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err?.message);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  // Only credit on successful Checkout completion
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Safety: ensure payment is actually paid (when Stripe includes it)
  // For card payments it should be "paid"
  if (session.payment_status && session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, ignored: `payment_status=${session.payment_status}` });
  }

  const userId = String(session.metadata?.userId ?? "");
  const credits = Number(session.metadata?.credits ?? 0);

  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    console.error("Missing userId/credits in metadata:", session.metadata);
    return NextResponse.json({ ok: false, error: "Missing metadata userId/credits" }, { status: 400 });
  }

  const stripeEventId = event.id;
  const stripeSessionId = session.id;

  try {
    // Idempotency: if we already processed this Stripe event, no-op.
    // We dedupe by stripeEventId stored in Event.metaJson.
    const existing = await prisma.event.findFirst({
      where: {
        metaJson: {
          path: ["stripeEventId"],
          equals: stripeEventId,
        } as any,
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Credit + record event in one transaction
    await prisma.$transaction([
      prisma.creditsLedger.create({
        data: {
          userId,
          delta: credits, // ✅ positive delta = top-up
          reason: "purchase_stripe",
        },
      }),
      prisma.event.create({
        data: {
          userId,
          type: "analyze", // ✅ temporary until you add "purchase" to enum
          metaJson: {
            stripeEventId: stripeEventId,
            stripeSessionId: stripeSessionId,
            credits,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
          },
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Stripe webhook DB error:", e);
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
  }
}
