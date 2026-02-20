// src/app/api/credits/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function bad(message: string, status = 400) {
  return ok({ ok: false, error: message }, { status });
}

async function getUserIdOr401() {
  const session = await getServerSession(authOptions);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) return null;
  return userId;
}

async function getBalance(userId: string) {
  const agg = await prisma.creditsLedger.aggregate({
    where: { userId },
    _sum: { delta: true },
  });

  const balance = Number(agg._sum.delta ?? 0);
  return Number.isFinite(balance) ? balance : 0;
}

/**
 * GET /api/credits
 * -> { ok:true, balance:number }
 */
export async function GET() {
  try {
    const userId = await getUserIdOr401();
    if (!userId) return bad("Unauthorized", 401);

    const balance = await getBalance(userId);
    return ok({ ok: true, balance });
  } catch (e: any) {
    return bad(e?.message || "Failed to load credits", 500);
  }
}

/**
 * POST /api/credits
 * Body: { amount:number, reason:string, ref?:string }
 * - amount > 0 means "spend" credits (we store as negative delta)
 * - optional ref lets you enforce idempotency per action
 */
export async function POST(req: Request) {
  try {
    const userId = await getUserIdOr401();
    if (!userId) return bad("Unauthorized", 401);

    const body = (await req.json().catch(() => null)) as any;
    const amount = Number(body?.amount);
    const reason = String(body?.reason ?? "").trim();
    const refRaw = body?.ref;
    const ref = typeof refRaw === "string" ? refRaw.trim() : undefined;

    if (!Number.isFinite(amount) || amount <= 0) {
      return bad("Invalid amount (must be a positive number).", 400);
    }
    if (!reason) return bad("Missing reason.", 400);

    // Optional idempotency: if a ref is provided and we already have it, do nothing.
    if (ref) {
      const exists = await prisma.creditsLedger.findFirst({
        where: { userId, ref },
        select: { id: true },
      });
      if (exists) {
        const balance = await getBalance(userId);
        return ok({ ok: true, balance, deduped: true });
      }
    }

    // Check balance before spending
    const balance = await getBalance(userId);
    if (balance < amount) return bad("Not enough credits.", 402);

    await prisma.creditsLedger.create({
      data: {
        userId,
        delta: -Math.trunc(amount),
        reason,
        ref: ref || null,
      },
    });

    const newBalance = await getBalance(userId);
    return ok({ ok: true, balance: newBalance });
  } catch (e: any) {
    // If ref uniqueness trips (rare race), treat as dedupe
    const msg = String(e?.message || "");
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("creditsledger_userid_ref")) {
      return ok({ ok: true, deduped: true });
    }
    return bad(e?.message || "Failed to spend credits", 500);
  }
}
