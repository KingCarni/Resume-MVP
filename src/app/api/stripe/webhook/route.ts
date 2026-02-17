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

  // Stripe v16+ recommends passing apiVersion, but it’s optional.
  // If you want, uncomment and set your pinned version:
  // const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
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

  // Extra safety: ensure actually paid (for card payments, should be "paid")
  if (session.payment_status && session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, ignored: `payment_status=${session.payment_status}` });
  }

  // Optional sanity: ensure environment matches what you expect.
  // IMPORTANT: return 200 on mismatch so Stripe doesn't retry forever.
  const expectedLivemode =
    process.env.STRIPE_EXPECT_LIVEMODE === "true"
      ? true
      : process.env.STRIPE_EXPECT_LIVEMODE === "false"
      ? false
      : undefined;

  if (typeof expectedLivemode === "boolean" && event.livemode !== expectedLivemode) {
    console.error("Stripe livemode mismatch:", { expectedLivemode, got: event.livemode });
    return NextResponse.json({ ok: true, ignored: "livemode_mismatch" });
  }

  const userId = String(session.metadata?.userId ?? "").trim();
  const credits = Number(session.metadata?.credits ?? 0);
  const pack = String(session.metadata?.pack ?? "").trim();

  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    console.error("Missing userId/credits in metadata:", session.metadata);
    // Return 200 so Stripe doesn't keep retrying a bad payload forever
    return NextResponse.json({ ok: true, ignored: "missing_metadata_userId_or_credits" });
  }

  const stripeEventId = event.id;
  const stripeSessionId = session.id;

  try {
    // ✅ Idempotency: if we already processed this Stripe event OR session, no-op.
    const existing = await prisma.event.findFirst({
      where: {
        type: "purchase",
        OR: [
          { metaJson: { path: ["stripeEventId"], equals: stripeEventId } } as any,
          { metaJson: { path: ["stripeSessionId"], equals: stripeSessionId } } as any,
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Optional: ensure user exists (prevents ledger rows for deleted users)
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!dbUser) {
      console.error("Webhook userId not found:", userId);
      return NextResponse.json({ ok: true, ignored: "user_not_found" });
    }

    // ✅ Credit + record purchase event in one transaction
    await prisma.$transaction([
      prisma.creditsLedger.create({
        data: {
          userId,
          delta: credits, // positive delta = top-up
          reason: "purchase_stripe",
        },
      }),
      prisma.event.create({
        data: {
          userId,
          type: "purchase",
          metaJson: {
            stripeEventId,
            stripeSessionId,
            credits,
            pack: pack || null,
            amountTotal: session.amount_total ?? null,
            currency: session.currency ?? null,
            paymentStatus: session.payment_status ?? null,
            livemode: event.livemode,
            customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
          },
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Stripe webhook DB error:", e);
    // Return 500 so Stripe retries transient DB issues (this is one case where retries CAN help)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
  }
}
