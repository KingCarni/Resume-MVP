// src/lib/credits.ts
import { prisma } from "@/lib/prisma";

/**
 * Source of truth = CreditsLedger (sum of deltas).
 * This keeps things simple and avoids balance desync issues.
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
  cost: number; // positive number, we will store as negative delta
  reason: string;

  /**
   * Optional: tie a credit charge to an Event row for metrics.
   * Must match your Prisma enum EventType in schema.prisma.
   */
  eventType?: "analyze" | "rewrite_bullet" | "rewrite_batch" | "resume_pdf" | "cover_letter" | "login";

  /**
   * Optional metadata to store in Event.metaJson
   */
  meta?: any;
};

/**
 * Charges credits atomically:
 * - Checks balance
 * - Writes a negative ledger delta
 * - Writes an Event row (type configurable)
 */
export async function chargeCredits(args: ChargeCreditsArgs) {
  const { userId, cost, reason, meta } = args;

  const absCost = Math.abs(Number(cost) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };
  if (!absCost) {
    // No-op charge (treat as success)
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance };
  }

  // Default eventType if caller doesn't supply one
  const eventType: ChargeCreditsArgs["eventType"] =
    args.eventType ??
    (reason === "rewrite" || reason === "rewrite_bullet" ? "rewrite_bullet" : "analyze");

  const balance = await getCreditBalance(userId);
  if (balance < absCost) {
    return { ok: false as const, balance };
  }

  await prisma.$transaction([
    prisma.creditsLedger.create({
      data: {
        userId,
        delta: -absCost,
        reason: reason || eventType || "charge",
      },
    }),
    prisma.event.create({
      data: {
        userId,
        type: eventType ?? "analyze",
        metaJson: {
          ...(meta ?? null),
          cost: absCost,
          reason: reason || eventType || "charge",
        },
      },
    }),
  ]);

  return { ok: true as const, balance: balance - absCost };
}
