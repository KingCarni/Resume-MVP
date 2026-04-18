// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOT_TAG = "jobs-analytics-v2";

function jsonOk(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

export async function GET() {
  return jsonOk({ ok: true, route: "/api/stripe/webhook" });
}

function toInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(String(n ?? ""));
  return Number.isFinite(x) ? Math.trunc(x) : NaN;
}

function cleanOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

async function writeJobsPurchaseCompletedEvent(args: {
  userId: string;
  credits: number;
  metadata: Record<string, string | null>;
  stripeSessionId: string;
  livemode: boolean;
}) {
  if (args.metadata.analyticsSource !== "jobs" || !args.metadata.analyticsJobId) return;

  await prisma.event.create({
    data: {
      userId: args.userId,
      type: "purchase",
      metaJson: {
        tag: BOOT_TAG,
        category: "jobs",
        event: "job_buy_credits_purchase_completed",
        route: args.metadata.analyticsRoute ?? "/buy-credits",
        path: args.metadata.analyticsRoute ?? "/buy-credits",
        jobId: args.metadata.analyticsJobId,
        resumeProfileId: args.metadata.analyticsResumeProfileId ?? null,
        company: args.metadata.analyticsCompany ?? null,
        jobTitle: args.metadata.analyticsJobTitle ?? null,
        sourceSlug: args.metadata.analyticsSourceSlug ?? null,
        mode: args.metadata.analyticsMode ?? null,
        creditsCost: args.credits,
        meta: {
          stripeSessionId: args.stripeSessionId,
          livemode: args.livemode,
        },
      },
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

  if (event.type !== "checkout.session.completed") {
    return jsonOk({ ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status && session.payment_status !== "paid") {
    console.log("[stripe-webhook] ignoring unpaid session", {
      sessionId: session.id,
      payment_status: session.payment_status,
    });
    return jsonOk({ ok: true, ignored: `payment_status=${session.payment_status}` });
  }

  const expectLive =
    process.env.STRIPE_EXPECT_LIVEMODE === "true"
      ? true
      : process.env.STRIPE_EXPECT_LIVEMODE === "false"
        ? false
        : undefined;

  if (typeof expectLive === "boolean" && event.livemode !== expectLive) {
    console.error("[stripe-webhook] livemode mismatch", { expectLive, got: event.livemode });
    return jsonOk({ ok: true, ignored: "livemode_mismatch" });
  }

  const userId = String(session.metadata?.userId ?? "").trim();
  const credits = toInt(session.metadata?.credits);
  const pack = String(session.metadata?.pack ?? "").trim() || null;

  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    console.error("[stripe-webhook] missing metadata userId/credits — not crediting", {
      sessionId: session.id,
      eventId: event.id,
      metadata: session.metadata,
    });
    return jsonOk({ ok: true, ignored: "missing_metadata_userId_or_credits" });
  }

  const analyticsMetadata = {
    analyticsSource: cleanOptionalString(session.metadata?.analyticsSource),
    analyticsRoute: cleanOptionalString(session.metadata?.analyticsRoute),
    analyticsJobId: cleanOptionalString(session.metadata?.analyticsJobId),
    analyticsResumeProfileId: cleanOptionalString(session.metadata?.analyticsResumeProfileId),
    analyticsCompany: cleanOptionalString(session.metadata?.analyticsCompany),
    analyticsJobTitle: cleanOptionalString(session.metadata?.analyticsJobTitle),
    analyticsSourceSlug: cleanOptionalString(session.metadata?.analyticsSourceSlug),
    analyticsMode: cleanOptionalString(session.metadata?.analyticsMode),
  };

  const stripeSessionId = session.id;
  const ref = `stripe_checkout_session:${stripeSessionId}`;

  try {
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!dbUser) {
      console.error("[stripe-webhook] user not found — not crediting", { userId, sessionId: stripeSessionId });
      return jsonOk({ ok: true, ignored: "user_not_found" });
    }

    await prisma.$transaction(async (tx) => {
      try {
        await tx.creditsLedger.create({
          data: {
            userId,
            delta: credits,
            reason: "purchase",
            ref,
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") {
          console.log("[stripe-webhook] already processed", { userId, ref });
          return;
        }
        throw e;
      }

      if (analyticsMetadata.analyticsSource === "jobs" && analyticsMetadata.analyticsJobId) {
        await tx.event.create({
          data: {
            userId,
            type: "purchase",
            metaJson: {
              tag: BOOT_TAG,
              category: "jobs",
              event: "job_buy_credits_purchase_completed",
              route: analyticsMetadata.analyticsRoute ?? "/buy-credits",
              path: analyticsMetadata.analyticsRoute ?? "/buy-credits",
              jobId: analyticsMetadata.analyticsJobId,
              resumeProfileId: analyticsMetadata.analyticsResumeProfileId ?? null,
              company: analyticsMetadata.analyticsCompany ?? null,
              jobTitle: analyticsMetadata.analyticsJobTitle ?? null,
              sourceSlug: analyticsMetadata.analyticsSourceSlug ?? null,
              mode: analyticsMetadata.analyticsMode ?? null,
              creditsCost: credits,
              meta: {
                stripeSessionId,
                livemode: event.livemode,
                pack,
              },
            },
          },
        });
      }

      console.log("[stripe-webhook] credited", {
        userId,
        credits,
        pack,
        sessionId: stripeSessionId,
        livemode: event.livemode,
      });
    });

    return jsonOk({ ok: true, credited: credits });
  } catch (err: any) {
    console.error("[stripe-webhook] DB error", {
      message: err?.message,
      code: err?.code,
      meta: err?.meta,
      userId,
      sessionId: stripeSessionId,
      livemode: event.livemode,
    });
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}
