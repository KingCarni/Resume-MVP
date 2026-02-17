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

  const userId = String(session.metadata?.userId ?? "");
  const credits = Number(session.metadata?.credits ?? 0);

  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    console.error("Missing userId/credits in metadata:", session.metadata);
    return NextResponse.json({ ok: false, error: "Missing metadata userId/credits" }, { status: 400 });
  }

  // Idempotency: do not credit twice if Stripe retries
  // Requires a unique constraint in Prisma (recommended) OR we fallback to checking by reason string.
  const eventId = event.id;
  const sessionId = session.id;

  try {
    // If you have a field to store stripeEventId on creditsLedger, use it.
    // If not, we still prevent duplicates by storing a matching Event row keyed by sessionId/eventId.
    // ---- Recommended approach: create an Event row keyed by stripe event id ----

    // 1) If we already processed this Stripe event, no-op.
    const existing = await prisma.event.findFirst({
  where: {
    metaJson: {
      path: ["stripeEventId"],
      equals: eventId,
    } as any,
  },
  select: { id: true },
});


    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // 2) Credit + record event in one transaction
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
          type: "analyze", // change to "purchase" if your enum supports it
          metaJson: {
            stripeEventId: eventId,
            stripeSessionId: sessionId,
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
