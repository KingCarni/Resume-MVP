// src/app/api/credits/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits } from "@/lib/credits";

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

function err(message: string, status = 400) {
  return ok({ ok: false, error: message }, { status });
}

/**
 * Your Prisma client indicates the model accessor is `creditsLedger`.
 * We'll compute current balance from ledger sum.
 *
 * NOTE:
 * - We intentionally use `(prisma as any)` so this file compiles even if:
 *   - the ledger field isn't named `delta`
 *   - the model fields differ slightly
 *   (You can tighten types once you confirm exact field names.)
 */
async function getBalanceFromLedger(userId: string): Promise<number> {
  try {
    const ledger = (prisma as any).creditsLedger;

    if (!ledger?.aggregate) return 0;

    // Try common field names. We'll attempt `delta` first (most common),
    // then fall back to `amount` if needed.
    try {
      const agg = await ledger.aggregate({
        where: { userId },
        _sum: { delta: true },
      });

      const n = Number(agg?._sum?.delta ?? 0);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    } catch {
      const agg = await ledger.aggregate({
        where: { userId },
        _sum: { amount: true },
      });

      const n = Number(agg?._sum?.amount ?? 0);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
  } catch {
    return 0;
  }
}

/**
 * GET /api/credits
 * Returns { ok: true, balance }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) return err("Unauthorized", 401);

    const balance = await getBalanceFromLedger(userId);
    return ok({ ok: true, balance });
  } catch (e: any) {
    return err(e?.message || "Failed to fetch credits", 500);
  }
}

/**
 * POST /api/credits
 * Body: { amount: number, reason: string }
 * DEDUCTS credits by `amount` (amount must be positive).
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id as string | undefined;

    if (!userId) return err("Unauthorized", 401);

    const body = (await req.json().catch(() => null)) as any;
    const amount = Number(body?.amount);
    const reason = String(body?.reason ?? "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return err("Invalid amount (must be a positive number).", 400);
    }
    if (!reason) return err("Missing reason.", 400);

    // Friendly insufficient balance error (instead of a vague 500)
    const balance = await getBalanceFromLedger(userId);
    if (balance < amount) return err("Not enough credits.", 402);

    // Your existing helper should handle atomic deduction + ledger write.
    // If it expects a different signature, paste it and I’ll align this call.
    await (chargeCredits as any)({
      prisma,
      userId,
      amount,
      reason,
    });

    const newBalance = await getBalanceFromLedger(userId);
    return ok({ ok: true, balance: newBalance });
  } catch (e: any) {
    const msg = e?.message || "Failed to charge credits";
    const status = msg.toLowerCase().includes("not enough") ? 402 : 500;
    return err(msg, status);
  }
}
