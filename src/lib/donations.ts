import { prisma } from "@/lib/prisma";
import type { DonationRequestStatus, Prisma } from "@prisma/client";

export const DONATION_POOL_USER_ID = "donation_pool";

type DonationRequestView = {
  id: string;
  userId: string;
  requestedCredits: number;
  reason: string;
  status: DonationRequestStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewedByEmail: string | null;
  fulfilledAt: Date | null;
  fulfilledByEmail: string | null;
  fulfillRef: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FinalizeApprovalArgs = {
  requestId: string;
  adminEmail: string;
  reviewNote?: string | null;
  allowPending: boolean;
};

type FinalizeApprovalResult =
  | {
      ok: true;
      alreadyProcessed: boolean;
      request: DonationRequestView;
      credited: number;
      poolRemaining: number;
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "POOL_MISSING"
        | "BAD_STATUS"
        | "INSUFFICIENT_POOL"
        | "PARTIAL_SIDE_EFFECTS";
      message: string;
      status?: string;
      poolBalance?: number;
    };

type RejectDonationArgs = {
  requestId: string;
  adminEmail: string;
  reviewNote?: string | null;
};

type RejectDonationResult =
  | {
      ok: true;
      alreadyProcessed: boolean;
      request: DonationRequestView;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "BAD_STATUS" | "PARTIAL_SIDE_EFFECTS";
      message: string;
      status?: string;
    };

async function getPoolBalance(tx: Prisma.TransactionClient) {
  const agg = await tx.creditsLedger.aggregate({
    where: { userId: DONATION_POOL_USER_ID },
    _sum: { delta: true },
  });

  return Number(agg._sum.delta ?? 0);
}

async function getDonationRequestForUpdate(tx: Prisma.TransactionClient, requestId: string) {
  return tx.donationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      userId: true,
      requestedCredits: true,
      reason: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      reviewedByEmail: true,
      fulfilledAt: true,
      fulfilledByEmail: true,
      fulfillRef: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

function buildFulfillmentRefs(requestId: string, fulfillRef?: string | null) {
  const base = String(fulfillRef ?? "").trim() || `donation_fulfill:${requestId}`;
  return {
    fulfillRef: base,
    debitRef: `${base}:out`,
    creditRef: `${base}:in`,
  };
}

async function getFulfillmentLedgerState(
  tx: Prisma.TransactionClient,
  requestId: string,
  userId: string,
  fulfillRef?: string | null,
) {
  const refs = buildFulfillmentRefs(requestId, fulfillRef);
  const [debit, credit] = await Promise.all([
    tx.creditsLedger.findFirst({
      where: { userId: DONATION_POOL_USER_ID, ref: refs.debitRef },
      select: { id: true },
    }),
    tx.creditsLedger.findFirst({
      where: { userId, ref: refs.creditRef },
      select: { id: true },
    }),
  ]);

  return {
    ...refs,
    hasDebit: !!debit,
    hasCredit: !!credit,
  };
}

export async function finalizeDonationApproval(args: FinalizeApprovalArgs): Promise<FinalizeApprovalResult> {
  const requestId = String(args.requestId ?? "").trim();
  const adminEmail = String(args.adminEmail ?? "").trim().toLowerCase();
  const reviewNote = String(args.reviewNote ?? "").trim() || null;

  return prisma.$transaction(async (tx) => {
    const poolUser = await tx.user.findUnique({
      where: { id: DONATION_POOL_USER_ID },
      select: { id: true },
    });

    if (!poolUser) {
      return {
        ok: false,
        code: "POOL_MISSING",
        message: "donation_pool user is missing. Run the ensure-pool-user script.",
      } satisfies FinalizeApprovalResult;
    }

    const request = await getDonationRequestForUpdate(tx, requestId);
    if (!request) {
      return { ok: false, code: "NOT_FOUND", message: "Not found" } satisfies FinalizeApprovalResult;
    }

    const ledgerState = await getFulfillmentLedgerState(tx, request.id, request.userId, request.fulfillRef);

    if (ledgerState.hasDebit !== ledgerState.hasCredit) {
      return {
        ok: false,
        code: "PARTIAL_SIDE_EFFECTS",
        message: "Donation request is in a partial processed state. Manual repair required before retrying.",
      } satisfies FinalizeApprovalResult;
    }

    if (request.status === "fulfilled" || (ledgerState.hasDebit && ledgerState.hasCredit)) {
      const healed =
        request.status === "fulfilled"
          ? request
          : await tx.donationRequest.update({
              where: { id: request.id },
              data: {
                status: "fulfilled",
                fulfillRef: ledgerState.fulfillRef,
                fulfilledAt: request.fulfilledAt ?? new Date(),
                fulfilledByEmail: request.fulfilledByEmail ?? adminEmail,
              },
              select: {
                id: true,
                userId: true,
                requestedCredits: true,
                reason: true,
                status: true,
                reviewNote: true,
                reviewedAt: true,
                reviewedByEmail: true,
                fulfilledAt: true,
                fulfilledByEmail: true,
                fulfillRef: true,
                createdAt: true,
                updatedAt: true,
              },
            });

      return {
        ok: true,
        alreadyProcessed: true,
        request: healed,
        credited: healed.requestedCredits,
        poolRemaining: await getPoolBalance(tx),
      } satisfies FinalizeApprovalResult;
    }

    if (request.status === "rejected") {
      return {
        ok: false,
        code: "BAD_STATUS",
        message: "Cannot approve a rejected request.",
        status: request.status,
      } satisfies FinalizeApprovalResult;
    }

    if (request.status === "pending" && !args.allowPending) {
      return {
        ok: false,
        code: "BAD_STATUS",
        message: "Request must be approved before fulfillment.",
        status: request.status,
      } satisfies FinalizeApprovalResult;
    }

    if (request.status !== "pending" && request.status !== "approved") {
      return {
        ok: false,
        code: "BAD_STATUS",
        message: `Cannot process request in status '${request.status}'.`,
        status: request.status,
      } satisfies FinalizeApprovalResult;
    }

    const poolBalance = await getPoolBalance(tx);
    if (poolBalance < request.requestedCredits) {
      return {
        ok: false,
        code: "INSUFFICIENT_POOL",
        message: `Insufficient pool balance. Pool has ${poolBalance} credits.`,
        poolBalance,
      } satisfies FinalizeApprovalResult;
    }

    const now = new Date();

    await tx.creditsLedger.create({
      data: {
        userId: DONATION_POOL_USER_ID,
        delta: -request.requestedCredits,
        reason: "donation_pool_debit",
        ref: ledgerState.debitRef,
      },
    });

    await tx.creditsLedger.create({
      data: {
        userId: request.userId,
        delta: request.requestedCredits,
        reason: "donation_fulfillment",
        ref: ledgerState.creditRef,
      },
    });

    const updated = await tx.donationRequest.update({
      where: { id: request.id },
      data: {
        status: "fulfilled",
        reviewNote: reviewNote ?? request.reviewNote,
        reviewedAt: request.reviewedAt ?? now,
        reviewedByEmail: request.reviewedByEmail ?? adminEmail,
        fulfilledAt: request.fulfilledAt ?? now,
        fulfilledByEmail: request.fulfilledByEmail ?? adminEmail,
        fulfillRef: ledgerState.fulfillRef,
      },
      select: {
        id: true,
        userId: true,
        requestedCredits: true,
        reason: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        reviewedByEmail: true,
        fulfilledAt: true,
        fulfilledByEmail: true,
        fulfillRef: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      alreadyProcessed: false,
      request: updated,
      credited: updated.requestedCredits,
      poolRemaining: await getPoolBalance(tx),
    } satisfies FinalizeApprovalResult;
  });
}

export async function rejectDonationRequest(args: RejectDonationArgs): Promise<RejectDonationResult> {
  const requestId = String(args.requestId ?? "").trim();
  const adminEmail = String(args.adminEmail ?? "").trim().toLowerCase();
  const reviewNote = String(args.reviewNote ?? "").trim() || null;

  return prisma.$transaction(async (tx) => {
    const request = await getDonationRequestForUpdate(tx, requestId);
    if (!request) {
      return { ok: false, code: "NOT_FOUND", message: "Not found" } satisfies RejectDonationResult;
    }

    const ledgerState = await getFulfillmentLedgerState(tx, request.id, request.userId, request.fulfillRef);
    if (ledgerState.hasDebit || ledgerState.hasCredit || request.status === "fulfilled") {
      return {
        ok: false,
        code: "BAD_STATUS",
        message: `Cannot reject a request in status '${request.status}'.`,
        status: request.status,
      } satisfies RejectDonationResult;
    }

    if (request.status === "rejected") {
      return {
        ok: true,
        alreadyProcessed: true,
        request,
      } satisfies RejectDonationResult;
    }

    if (request.status !== "pending" && request.status !== "approved") {
      return {
        ok: false,
        code: "BAD_STATUS",
        message: `Cannot reject a request in status '${request.status}'.`,
        status: request.status,
      } satisfies RejectDonationResult;
    }

    const updated = await tx.donationRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        reviewNote: reviewNote ?? request.reviewNote,
        reviewedAt: request.reviewedAt ?? new Date(),
        reviewedByEmail: request.reviewedByEmail ?? adminEmail,
      },
      select: {
        id: true,
        userId: true,
        requestedCredits: true,
        reason: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        reviewedByEmail: true,
        fulfilledAt: true,
        fulfilledByEmail: true,
        fulfillRef: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ok: true,
      alreadyProcessed: false,
      request: updated,
    } satisfies RejectDonationResult;
  });
}
