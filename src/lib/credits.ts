// src/lib/credits.ts
import { prisma } from "@/lib/prisma";
import { EventType } from "@prisma/client";

/**
 * Source of truth = CreditsLedger (sum of deltas).
 * NOTE: This is simple, but NOT race-proof under high concurrency.
 * If you expect concurrency, add User.creditsBalance and update it atomically.
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

  eventType: EventType; // ✅ require explicit event type so it never drifts
  meta?: any;
};

export async function chargeCredits(args: ChargeCreditsArgs) {
  const { userId, reason, meta } = args;

  const absCost = Math.abs(Number(args.cost) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };

  if (!absCost) {
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance };
  }

  const eventType: EventType = args.eventType;

  const balance = await getCreditBalance(userId);
  if (balance < absCost) {
    return { ok: false as const, balance };
  }

  await prisma.$transaction([
    prisma.creditsLedger.create({
      data: {
        userId,
        delta: -absCost,
        reason: reason || "charge",
      },
    }),
    prisma.event.create({
      data: {
        userId,
        type: eventType,
        metaJson: {
          ...(meta ?? null),
          amount: absCost,
          reason: reason || "charge",
          direction: "debit",
        },
      },
    }),
  ]);

  return { ok: true as const, balance: balance - absCost };
}

type RefundCreditsArgs = {
  userId: string;
  amount: number; // positive; stored as positive delta
  reason: string;

  eventType: EventType;
  meta?: any;
};

export async function refundCredits(args: RefundCreditsArgs) {
  const { userId, reason, meta } = args;

  const absAmt = Math.abs(Number(args.amount) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };

  if (!absAmt) {
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance };
  }

  const eventType: EventType = args.eventType;

  await prisma.$transaction([
    prisma.creditsLedger.create({
      data: {
        userId,
        delta: absAmt,
        reason: reason || "refund",
      },
    }),
    prisma.event.create({
      data: {
        userId,
        type: eventType,
        metaJson: {
          ...(meta ?? null),
          amount: absAmt,
          reason: reason || "refund",
          direction: "credit",
        },
      },
    }),
  ]);

  const balance = await getCreditBalance(userId);
  return { ok: true as const, balance };
}
