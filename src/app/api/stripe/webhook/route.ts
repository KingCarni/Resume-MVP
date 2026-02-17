import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Client } from "pg";

export async function GET() {
  return NextResponse.json({ ok: true, route: "stripe webhook alive" });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IMPORTANT: Stripe webhook needs the raw body, so we use req.text() below.

function getDbUrl() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    ""
  );
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

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err?.message);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  // Only handle completed Checkout sessions
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  const userId = String(session.metadata?.userId ?? "");
  const credits = Number(session.metadata?.credits ?? 0);

  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    console.error("Missing userId/credits in session metadata", session.metadata);
    return NextResponse.json({ ok: false, error: "Missing metadata userId/credits" }, { status: 400 });
  }

  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return NextResponse.json({ ok: false, error: "Missing DATABASE URL" }, { status: 500 });
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    // Idempotency: event.id unique means we never double credit
    await client.query(
      `insert into credit_ledger (user_id, delta, reason, stripe_session_id, stripe_event_id)
       values ($1, $2, 'purchase', $3, $4)
       on conflict (stripe_event_id) do nothing`,
      [userId, credits, session.id, event.id]
    );

    await client.query(
      `insert into credit_purchases (user_id, stripe_session_id, amount_cents, currency, credits)
       values ($1, $2, $3, $4, $5)
       on conflict (stripe_session_id) do nothing`,
      [
        userId,
        session.id,
        Number(session.amount_total ?? 0),
        String(session.currency ?? "usd"),
        credits,
      ]
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Webhook DB error:", e);
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 });
  } finally {
    await client.end();
  }

  return NextResponse.json({ ok: true });
}
