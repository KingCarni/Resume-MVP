// src/app/api/stripe/checkout/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) throw new Error("Missing STRIPE_SECRET_KEY");

const stripe = new Stripe(stripeSecret);

type ReqBody = {
  pack: "starter" | "plus" | "pro";
};

const PACKS: Record<ReqBody["pack"], { credits: number; amountCents: number }> = {
  starter: { credits: 25, amountCents: 500 },
  plus: { credits: 75, amountCents: 1200 },
  pro: { credits: 200, amountCents: 2500 },
};

function getAppUrl(req: Request) {
  // Prefer explicit env var
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  // Fallback: infer from request host (works on Vercel)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  try {
    // ✅ Require login
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // ✅ Map email -> DB user
    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<ReqBody>;
    const pack = (body.pack ?? "starter") as ReqBody["pack"];

    if (!PACKS[pack]) {
      return NextResponse.json({ ok: false, error: "Invalid pack" }, { status: 400 });
    }

    const { credits, amountCents } = PACKS[pack];
    const appUrl = getAppUrl(req);

    const checkout = await stripe.checkout.sessions.create({
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
      metadata: {
        userId: dbUser.id, // ✅ real user id in prod DB
        credits: String(credits),
        pack,
        email, // optional, helps debugging
      },
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Checkout error" }, { status: 500 });
  }
}
