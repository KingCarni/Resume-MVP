// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, route: "stripe_webhook" });
}

function jsonOk(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) return jsonOk({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  if (!webhookSecret) return jsonOk({ ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return jsonOk({ ok: false, error: "Missing stripe-signature" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-01-28.clover" });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[stripe-webhook] signature verification failed:", err?.message || err);
    return jsonOk({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  // Only handle successful checkout completion
  if (event.type !== "checkout.session.completed") {
    return jsonOk({ ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Only credit if actually paid
  if (session.payment_status && session.payment_status !== "paid") {
    return jsonOk({ ok: true, ignored: `payment_status=${session.payment_status}` });
  }

  // Optional environment guard: prevent mixing test/live
  const expectedLivemode =
    process.env.STRIPE_EXPECT_LIVEMODE === "true"
      ? true
      : process.env.STRIPE_EXPECT_LIVEMODE === "false"
      ? false
      : undefined;

  if (typeof expectedLivemode === "boolean" && event.livemode !== expectedLivemode) {
    console.error("[stripe-webhook] livemode mismatch:", { expectedLivemode, got: event.livemode });
    return jsonOk({ ok: true, ignored: "livemode_mismatch" });
  }

  const userId = String(session.metadata?.userId ?? "").trim();
  const credits = Number(session.metadata?.credits ?? 0);
  const pack = String(session.metadata?.pack ?? "").trim();

  // Bad payload: return 200 so Stripe doesn't retry forever
  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    console.error("[stripe-webhook] missing metadata userId/credits:", {
      metadata: session.metadata,
      sessionId: session.id,
      eventId: event.id,
    });
    return jsonOk({ ok: true, ignored: "missing_metadata_userId_or_credits" });
  }

  const stripeEventId = event.id; // evt_...
  const stripeSessionId = session.id; // cs_...
  const amountCents = session.amount_total ?? null;
  const currency = session.currency ?? null;
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;

  try {
    // Ensure the user exists
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!dbUser) {
      console.error("[stripe-webhook] userId not found:", { userId, stripeEventId, stripeSessionId });
      return jsonOk({ ok: true, ignored: "user_not_found" });
    }

    await prisma.$transaction(async (tx) => {
      // Idempotency via @@unique([userId, ref]) on CreditsLedger
      // Stripe retries will hit P2002 and exit without double-crediting.
      try {
        await tx.creditsLedger.create({
          data: {
            userId,
            delta: credits,
            reason: "purchase_stripe",
            ref: stripeEventId,
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") return; // already processed
        throw e;
      }

      // NOTE: We intentionally do NOT write tx.event.create({ type: "purchase" })
      // because your production DB enum "EventType" doesn't include "purchase" yet.
      // Once you add it with:
      //   ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'purchase';
      // you can re-enable analytics logging safely.

      // (Optional) If you still want a breadcrumb without touching EventType,
      // you can log to console here:
      console.log("[stripe-webhook] credited", {
        userId,
        credits,
        pack: pack || null,
        stripeEventId,
        stripeSessionId,
        amountCents,
        currency,
        customerEmail,
        livemode: event.livemode,
      });
    });

    return jsonOk({ ok: true });
  } catch (err: any) {
    console.error("[stripe-webhook] DB error", {
      message: err?.message,
      code: err?.code,
      meta: err?.meta,
      detail: err?.detail,
      stack: err?.stack,
      userId,
      stripeSessionId,
      stripeEventId,
      eventType: event.type,
      livemode: event.livemode,
    });
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}
