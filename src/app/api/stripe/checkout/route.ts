// src/app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  pack: "starter" | "plus" | "pro";
};

const PACKS: Record<ReqBody["pack"], { credits: number; amountCents: number }> = {
  starter: { credits: 25, amountCents: 500 },
  plus: { credits: 75, amountCents: 1200 },
  pro: { credits: 200, amountCents: 2500 },
};

function getAppUrl(req: Request) {
  // Prefer explicit env var (Production-safe)
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  // Fallback: infer from request host (works on Vercel)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

function normalizePack(x: unknown): ReqBody["pack"] | null {
  const p = String(x ?? "").trim();
  if (p === "starter" || p === "plus" || p === "pro") return p;
  return null;
}

export async function POST(req: Request) {
  try {
    // ✅ Require login
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Require Stripe key (check at request-time, not module-load)
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }
    const stripe = new Stripe(stripeSecretKey);

    // ✅ Map email -> DB user
    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });
    }

    // Parse input
    const body = (await req.json().catch(() => ({}))) as Partial<ReqBody>;
    const pack = normalizePack(body.pack) ?? "starter";

    const packInfo = PACKS[pack];
    if (!packInfo) {
      return NextResponse.json({ ok: false, error: "Invalid pack" }, { status: 400 });
    }

    const { credits, amountCents } = packInfo;
    const appUrl = getAppUrl(req);

    // Optional anti-double-click idempotency key:
    // stable enough for retries, but different between separate attempts
    const idemKey = `checkout:${dbUser.id}:${pack}:${Date.now()}`;

    const checkout = await stripe.checkout.sessions.create(
      {
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

        // Optional: helps Stripe UX + receipts
        customer_email: email,

        metadata: {
          userId: dbUser.id, // ✅ derived from session/db, not client
          credits: String(credits),
          pack,
          email, // optional, helps debugging
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
