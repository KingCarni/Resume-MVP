// src/app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pack = "standard" | "plus" | "pro" | "premium";

type JobsCheckoutAnalytics = {
  source?: string;
  route?: string;
  jobId?: string;
  resumeProfileId?: string;
  company?: string;
  jobTitle?: string;
  sourceSlug?: string;
  mode?: "resume" | "cover_letter" | "apply_pack" | "browse";
};

type ReqBody = {
  pack: Pack;
  analytics?: JobsCheckoutAnalytics;
};

const BOOT_TAG = "jobs-analytics-v2";
const PACKS: Record<Pack, { credits: number; amountCents: number; label: string }> = {
  standard: { label: "Standard", credits: 25, amountCents: 500 }, // $5
  plus: { label: "Plus", credits: 75, amountCents: 1000 }, // $10
  pro: { label: "Pro", credits: 150, amountCents: 1500 }, // $15
  premium: { label: "Premium", credits: 500, amountCents: 2500 }, // $25
};

function getAppUrl(req: Request) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

function normalizePack(x: unknown): Pack | null {
  const p = String(x ?? "").trim().toLowerCase();
  if (p === "standard" || p === "plus" || p === "pro" || p === "premium") return p;
  return null;
}

function cleanOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeJobsAnalytics(input: unknown): JobsCheckoutAnalytics | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const source = cleanOptionalString((input as JobsCheckoutAnalytics).source);
  const jobId = cleanOptionalString((input as JobsCheckoutAnalytics).jobId);
  if (source !== "jobs" || !jobId) return null;

  const modeRaw = cleanOptionalString((input as JobsCheckoutAnalytics).mode);
  const mode =
    modeRaw === "resume" || modeRaw === "cover_letter" || modeRaw === "apply_pack" || modeRaw === "browse"
      ? modeRaw
      : null;

  return {
    source,
    route: cleanOptionalString((input as JobsCheckoutAnalytics).route) ?? "/buy-credits",
    jobId,
    resumeProfileId: cleanOptionalString((input as JobsCheckoutAnalytics).resumeProfileId),
    company: cleanOptionalString((input as JobsCheckoutAnalytics).company),
    jobTitle: cleanOptionalString((input as JobsCheckoutAnalytics).jobTitle),
    sourceSlug: cleanOptionalString((input as JobsCheckoutAnalytics).sourceSlug),
    mode: mode ?? undefined,
  };
}

async function writeJobsPurchaseEvent(args: {
  userId: string;
  event: string;
  creditsCost: number;
  analytics: JobsCheckoutAnalytics;
  meta?: Record<string, unknown>;
}) {
  await prisma.event.create({
    data: {
      userId: args.userId,
      type: "purchase",
      metaJson: {
        tag: BOOT_TAG,
        category: "jobs",
        event: args.event,
        path: args.analytics.route ?? "/buy-credits",
        route: args.analytics.route ?? "/buy-credits",
        jobId: args.analytics.jobId ?? null,
        resumeProfileId: args.analytics.resumeProfileId ?? null,
        company: args.analytics.company ?? null,
        jobTitle: args.analytics.jobTitle ?? null,
        sourceSlug: args.analytics.sourceSlug ?? null,
        mode: args.analytics.mode ?? null,
        creditsCost: args.creditsCost,
        meta: args.meta ?? null,
      },
    },
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    const stripe = new Stripe(stripeSecretKey);

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<ReqBody>;
    const pack: Pack = normalizePack(body.pack) ?? "standard";
    const analytics = normalizeJobsAnalytics(body.analytics);

    const packInfo = PACKS[pack];
    if (!packInfo) {
      return NextResponse.json({ ok: false, error: "Invalid pack" }, { status: 400 });
    }

    const { credits, amountCents, label } = packInfo;
    const appUrl = getAppUrl(req);

    const idemKey = `checkout:${dbUser.id}:${pack}:${Date.now()}`;

    if (analytics?.jobId) {
      await writeJobsPurchaseEvent({
        userId: dbUser.id,
        event: "job_buy_credits_checkout_started",
        creditsCost: credits,
        analytics,
        meta: {
          pack,
          source: analytics.source,
        },
      });
    }

    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${appUrl}/?stripe=success`,
        cancel_url: `${appUrl}/?stripe=cancel`,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `Git-a-Job Credits — ${label} (${credits})` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        customer_email: email,
        metadata: {
          userId: dbUser.id,
          credits: String(credits),
          pack,
          email,
          analyticsSource: analytics?.source ?? "",
          analyticsRoute: analytics?.route ?? "",
          analyticsJobId: analytics?.jobId ?? "",
          analyticsResumeProfileId: analytics?.resumeProfileId ?? "",
          analyticsCompany: analytics?.company ?? "",
          analyticsJobTitle: analytics?.jobTitle ?? "",
          analyticsSourceSlug: analytics?.sourceSlug ?? "",
          analyticsMode: analytics?.mode ?? "",
        },
      },
      { idempotencyKey: idemKey }
    );

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Checkout error" }, { status: 500 });
  }
}
