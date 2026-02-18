// src/lib/credits.ts
import { prisma } from "@/lib/prisma";
import type { EventType } from "@prisma/client";

/**
 * Source of truth = CreditsLedger (sum of deltas).
 * Adds:
 * - idempotency via `ref` (Stripe event id / request id)
 * - safer balance check inside a transaction
 */

export async function getCreditBalance(userId: string) {
  const agg = await prisma.creditsLedger.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

type ChargeCreditsArgs = {
  userId: string;
  cost: number; // positive; stored as negative delta
  reason: string;
  eventType: EventType; // REQUIRED (prevents drift)
  meta?: any;

  /** Optional idempotency key (recommended) */
  ref?: string;
};

type RefundCreditsArgs = {
  userId: string;
  amount: number; // positive; stored as positive delta
  reason: string;
  eventType: EventType; // REQUIRED
  meta?: any;

  /** Optional idempotency key (recommended) */
  ref?: string;
};

function normRef(ref?: string) {
  const r = String(ref ?? "").trim();
  return r.length ? r.slice(0, 200) : "";
}

export async function chargeCredits(args: ChargeCreditsArgs) {
  const { userId, cost, reason, eventType, meta } = args;
  const ref = normRef(args.ref);

  const absCost = Math.abs(Number(cost) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };

  if (!absCost) {
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance };
  }

  // ✅ Idempotency: if already charged for this ref, no-op
  if (ref) {
    const existing = await prisma.creditsLedger.findFirst({
      where: { userId, ref },
      select: { id: true },
    });
    if (existing) {
      const balance = await getCreditBalance(userId);
      return { ok: true as const, balance };
    }
  }

  // ✅ Transaction: re-check balance inside tx, then write ledger+event
  const result = await prisma.$transaction(async (tx) => {
    const agg = await tx.creditsLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const balance = agg._sum.delta ?? 0;

    if (balance < absCost) return { ok: false as const, balance };

    await tx.creditsLedger.create({
      data: {
        userId,
        delta: -absCost,
        reason: reason || "charge",
        ref: ref || null,
      },
    });

    await tx.event.create({
      data: {
        userId,
        type: eventType,
        metaJson: {
          ...(meta ?? null),
          amount: absCost,
          reason: reason || "charge",
          direction: "debit",
          eventType,
          ref: ref || undefined,
        },
      },
    });

    return { ok: true as const, balance: balance - absCost };
  });

  return result;
}

export async function refundCredits(args: RefundCreditsArgs) {
  const { userId, amount, reason, eventType, meta } = args;
  const ref = normRef(args.ref);

  const absAmt = Math.abs(Number(amount) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };

  if (!absAmt) {
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance };
  }

  // ✅ Idempotency: if already refunded for this ref, no-op
  if (ref) {
    const existing = await prisma.creditsLedger.findFirst({
      where: { userId, ref },
      select: { id: true },
    });
    if (existing) {
      const balance = await getCreditBalance(userId);
      return { ok: true as const, balance };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.creditsLedger.create({
      data: {
        userId,
        delta: absAmt,
        reason: reason || "refund",
        ref: ref || null,
      },
    });

    await tx.event.create({
      data: {
        userId,
        type: eventType,
        metaJson: {
          ...(meta ?? null),
          amount: absAmt,
          reason: reason || "refund",
          direction: "credit",
          eventType,
          ref: ref || undefined,
        },
      },
    });
  });

  const balance = await getCreditBalance(userId);
  return { ok: true as const, balance };
}
