// src/app/api/account/donate-credits/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ✅ Canonical pool user (MUST match DB)
const POOL_EMAIL = "donation-pool@internal.local";

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

async function resolveUserIdFromSession(session: any): Promise<string | null> {
  const id = String(session?.user?.id ?? "").trim();
  if (id) return id;

  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  if (!email) return null;

  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return u?.id ?? null;
}

const PURCHASE_REASONS = new Set([
  "purchase",
  "purchase_stripe", // ✅ your webhook reason
  "credit_purchase",
  "credits_purchase",
  "stripe_purchase",
]);

async function computePaidAndTotal(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.creditsLedger.findMany({
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
    if (PURCHASE_REASONS.has(reason) && d > 0) purchased += d;

    // donated out is negative donate_credits entries
    if (reason === "donate_credits" && d < 0) donatedOut += Math.abs(d);
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

async function computeBalance(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.creditsLedger.findMany({
    where: { userId },
    select: { delta: true },
  });
  return rows.reduce((sum, r) => sum + (toInt(r.delta) || 0), 0);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return jsonOk({ ok: false, error: "Could not resolve userId" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const credits = toInt(body?.credits);
  const note = String(body?.note ?? "").trim().slice(0, 500);

  if (!Number.isFinite(credits) || credits <= 0) {
    return jsonOk({ ok: false, error: "credits must be a positive integer" }, { status: 400 });
  }

  const MIN = 5;
  const MAX = 500;
  if (credits < MIN || credits > MAX) {
    return jsonOk({ ok: false, error: `credits must be between ${MIN} and ${MAX}` }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const poolUser = await tx.user.findUnique({
        where: { email: POOL_EMAIL },
        select: { id: true, email: true },
      });

      if (!poolUser) {
        return { ok: false as const, error: `Pool user not found (${POOL_EMAIL})` };
      }

      const donorBefore = await computePaidAndTotal(tx, userId);

      // Enforce paid-only donation
      if (donorBefore.paidCredits < credits) {
        return {
          ok: false as const,
          error: `You can only donate paid credits. Paid available: ${donorBefore.paidCredits}.`,
        };
      }

      const refBase = `donate_to_pool:${userId}:${Date.now()}`;

      // subtract from donor
      await tx.creditsLedger.create({
        data: {
          userId,
          delta: -credits,
          reason: "donate_credits",
          ref: `${refBase}:out`,
        },
      });

      // add to pool
      await tx.creditsLedger.create({
        data: {
          userId: poolUser.id,
          delta: credits,
          reason: "donation_in",
          ref: `${refBase}:in`,
        },
      });

      const poolBalance = await computeBalance(tx, poolUser.id);
      const donorAfter = await computePaidAndTotal(tx, userId);

      return {
        ok: true as const,
        donated: credits,
        note: note || null,
        pool: { email: poolUser.email, id: poolUser.id },
        poolBalance,
        donor: donorAfter,
      };
    });

    if (!result.ok) return jsonOk({ ok: false, error: result.error }, { status: 400 });
    return jsonOk(result);
  } catch (err: any) {
    console.error("[account/donate-credits] error", { message: err?.message, code: err?.code, meta: err?.meta });
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}