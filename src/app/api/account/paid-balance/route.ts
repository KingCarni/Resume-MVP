// src/app/api/account/paid-balance/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonOk(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function toInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(String(n ?? ""));
  return Number.isFinite(x) ? Math.trunc(x) : NaN;
}

// Try to resolve userId from session.user.id; fallback to email lookup
async function resolveUserIdFromSession(session: any): Promise<string | null> {
  const id = String(session?.user?.id ?? "").trim();
  if (id) return id;

  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  if (!email) return null;

  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return u?.id ?? null;
}

/**
 * Paid-only policy (no schema changes):
 * - "Purchased" credits = CreditsLedger rows with reason in PURCHASE_REASONS AND delta > 0
 * - "Donated out" = negative rows with reason === "donate_credits"
 *
 * Donatable paid balance = min(totalCredits, (purchased - donatedOut))
 * so you can't donate more than you currently have, and can't donate free credits.
 *
 * IMPORTANT: make sure this matches your stripe webhook reason.
 * Your webhook currently uses: reason: "purchase_stripe"
 */
const PURCHASE_REASONS = new Set([
  "purchase_stripe", // <-- matches your webhook
  "purchase",
  "credit_purchase",
  "credits_purchase",
  "stripe_purchase",
]);

async function computeBalances(userId: string) {
  const rows = await prisma.creditsLedger.findMany({
    where: { userId },
    select: { delta: true, reason: true },
  });

  let total = 0;
  let purchased = 0;
  let donatedOut = 0;

  for (const r of rows) {
    const d = toInt(r.delta);
    if (!Number.isFinite(d)) continue;

    total += d;

    const reason = String(r.reason ?? "").trim();

    // Purchased credits are positive deltas with a purchase reason
    if (PURCHASE_REASONS.has(reason) && d > 0) {
      purchased += d;
    }

    // Donated out should be created as a negative delta
    if (reason === "donate_credits" && d < 0) {
      donatedOut += Math.abs(d);
    }
  }

  const paidAvailable = Math.max(0, purchased - donatedOut);
  const paidCredits = Math.max(0, Math.min(total, paidAvailable));

  return {
    totalCredits: total,
    paidCredits,
    purchasedCredits: purchased,
    donatedOutCredits: donatedOut,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return jsonOk({ ok: false, error: "Could not resolve userId" }, { status: 401 });

  try {
    const b = await computeBalances(userId);
    return jsonOk({
      ok: true,
      paidCredits: b.paidCredits,
      totalCredits: b.totalCredits,
      // helpful debug fields (safe):
      purchasedCredits: b.purchasedCredits,
      donatedOutCredits: b.donatedOutCredits,
    });
  } catch (err: any) {
    console.error("[paid-balance] error", err);
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}