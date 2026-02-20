// src/app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pack = "standard" | "plus" | "pro" | "premium";

type ReqBody = {
  pack: Pack;
};

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

    const packInfo = PACKS[pack];
    if (!packInfo) {
      return NextResponse.json({ ok: false, error: "Invalid pack" }, { status: 400 });
    }

    const { credits, amountCents, label } = packInfo;
    const appUrl = getAppUrl(req);

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