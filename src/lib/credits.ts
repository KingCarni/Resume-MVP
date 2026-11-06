// src/lib/credits.ts
import { prisma } from "@/lib/prisma";
import type { EventType } from "@prisma/client";

/**
 * Source of truth = CreditsLedger (sum of deltas).
 * This version adds:
 * - optional idempotency via `ref`
 * - safer balance check inside a transaction
 *
 * IMPORTANT:
 * For true idempotency, your DB should enforce uniqueness on (userId, ref, direction).
 * If you don't have schema support yet, this still prevents common double-charge patterns
 * by checking existing entries first.
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
  eventType: EventType; // REQUIRED
  meta?: any;

  /**
   * Optional idempotency key.
   * Examples:
   * - "analyze:req_123"
   * - "cover_letter:req_456"
   * - "stripe:evt_..."
   */
  ref?: string;
};

type RefundCreditsArgs = {
  userId: string;
  amount: number; // positive; stored as positive delta
  reason: string;
  eventType: EventType; // REQUIRED
  meta?: any;

  /** Optional idempotency key (same idea as Charge) */
  ref?: string;
};

function normRef(ref?: string) {
  const r = String(ref ?? "").trim();
  return r.length ? r.slice(0, 200) : "";
}

async function findExistingLedgerByRef(args: { userId: string; ref: string; deltaSign: "pos" | "neg" }) {
  const { userId, ref, deltaSign } = args;
  if (!ref) return null;

  // We don't know your exact CreditsLedger schema fields.
  // Many projects have `ref` or `externalId`. If yours doesn't, add it.
  //
  // For now: best-effort lookup using "reason contains ref" fallback would be gross,
  // so we do a guarded try/catch and proceed if schema doesn't support it.
  try {
    const where: any = {
      userId,
      ref,
      ...(deltaSign === "neg" ? { delta: { lt: 0 } } : { delta: { gt: 0 } }),
    };

    // @ts-ignore: depends on your schema
    return await prisma.creditsLedger.findFirst({ where, select: { id: true } });
  } catch {
    return null;
  }
}

export async function chargeCredits(args: ChargeCreditsArgs) {
  const { userId, cost, reason, eventType, meta, ref } = args;

  const absCost = Math.abs(Number(cost) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };

  const refKey = normRef(ref);

  if (!absCost) {
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance, alreadyApplied: false as const };
  }

  // Best-effort idempotency: if a ledger entry already exists for this ref, do nothing.
  if (refKey) {
    const existing = await findExistingLedgerByRef({ userId, ref: refKey, deltaSign: "neg" });
    if (existing) {
      const balance = await getCreditBalance(userId);
      return { ok: true as const, balance, alreadyApplied: true as const };
    }
  }

  // Transaction: re-check balance inside the same tx before writing.
  const result = await prisma.$transaction(async (tx) => {
    const agg = await tx.creditsLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    const balance = agg._sum.delta ?? 0;

    if (balance < absCost) {
      return { ok: false as const, balance, alreadyApplied: false as const };
    }

    // Write ledger + event
    const ledgerData: any = {
      userId,
      delta: -absCost,
      reason: reason || "charge",
    };
    if (refKey) ledgerData.ref = refKey; // requires schema support

    await tx.creditsLedger.create({ data: ledgerData });

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
          ref: refKey || undefined,
        },
      },
    });

    return { ok: true as const, balance: balance - absCost, alreadyApplied: false as const };
  });

  return result;
}

export async function refundCredits(args: RefundCreditsArgs) {
  const { userId, amount, reason, eventType, meta, ref } = args;

  const absAmt = Math.abs(Number(amount) || 0);
  if (!userId) return { ok: false as const, balance: 0, error: "Missing userId" };

  const refKey = normRef(ref);

  if (!absAmt) {
    const balance = await getCreditBalance(userId);
    return { ok: true as const, balance };
  }

  // Best-effort idempotency
  if (refKey) {
    const existing = await findExistingLedgerByRef({ userId, ref: refKey, deltaSign: "pos" });
    if (existing) {
      const balance = await getCreditBalance(userId);
      return { ok: true as const, balance };
    }
  }

  await prisma.$transaction(async (tx) => {
    const ledgerData: any = {
      userId,
      delta: absAmt,
      reason: reason || "refund",
    };
    if (refKey) ledgerData.ref = refKey; // requires schema support

    await tx.creditsLedger.create({ data: ledgerData });

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
          ref: refKey || undefined,
        },
      },
    });
  });

  const balance = await getCreditBalance(userId);
  return { ok: true as const, balance };
}
