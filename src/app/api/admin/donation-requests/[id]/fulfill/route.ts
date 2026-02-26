// src/app/api/admin/donation-requests/[id]/fulfill/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"]; // allowlist
const POOL_USER_ID = "donation_pool"; // must match the User.id you created

function jsonOk(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function isAdmin(session: any) {
  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

function normalizeText(s: unknown, max = 2000) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, max);
}

// ✅ tx in $transaction is a TransactionClient (not full PrismaClient)
async function getPoolBalance(tx: Prisma.TransactionClient) {
  const agg = await tx.creditsLedger.aggregate({
    where: { userId: POOL_USER_ID },
    _sum: { delta: true },
  });
  return Number(agg._sum.delta ?? 0);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> } // Next 15/16 can pass params as Promise
) {
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return jsonOk({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const requestId = String(id ?? "").trim();
  if (!requestId) return jsonOk({ ok: false, error: "Missing id" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json().catch(() => null);
  } catch {
    body = null;
  }
  const reviewNote = normalizeText(body?.reviewNote, 2000);

  // Refs for idempotency (unique per user via @@unique([userId, ref]))
  const refOut = `donation_fulfill_out:${requestId}`; // pool debit
  const refIn = `donation_fulfill_in:${requestId}`; // recipient credit

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Ensure pool user exists
      const pool = await tx.user.findUnique({
        where: { id: POOL_USER_ID },
        select: { id: true },
      });
      if (!pool) throw new Error("POOL_MISSING");

      const reqRow = await tx.donationRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          userId: true,
          requestedCredits: true,
          status: true,
        },
      });

      if (!reqRow) throw new Error("NOT_FOUND");
      if (reqRow.status !== "approved") throw new Error(`BAD_STATUS:${reqRow.status}`);

      // prevent double-fulfill (either side existing means we bail)
      const alreadyOut = await tx.creditsLedger.findFirst({
        where: { userId: POOL_USER_ID, ref: refOut },
        select: { id: true },
      });
      const alreadyIn = await tx.creditsLedger.findFirst({
        where: { userId: reqRow.userId, ref: refIn },
        select: { id: true },
      });
      if (alreadyOut || alreadyIn) throw new Error("ALREADY_FULFILLED");

      // Check pool balance
      const poolBalance = await getPoolBalance(tx);
      if (poolBalance < reqRow.requestedCredits) {
        throw new Error(`INSUFFICIENT_POOL:${poolBalance}`);
      }

      // 1) Debit pool
      await tx.creditsLedger.create({
        data: {
          userId: POOL_USER_ID,
          delta: -reqRow.requestedCredits,
          reason: "donation_pool_debit",
          ref: refOut,
        },
      });

      // 2) Credit recipient
      await tx.creditsLedger.create({
        data: {
          userId: reqRow.userId,
          delta: reqRow.requestedCredits,
          reason: "donation_fulfillment",
          ref: refIn,
        },
      });

      // 3) Mark fulfilled (+ optional note)
      const updated = await tx.donationRequest.update({
        where: { id: requestId },
        data: {
          status: "fulfilled",
          reviewNote: reviewNote || null,
        },
        select: {
          id: true,
          userId: true,
          requestedCredits: true,
          reason: true,
          status: true,
          reviewNote: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const remaining = await getPoolBalance(tx);

      return { updated, poolRemaining: remaining };
    });

    return jsonOk({
      ok: true,
      request: result.updated,
      credited: result.updated.requestedCredits,
      poolRemaining: result.poolRemaining,
    });
  } catch (err: any) {
    const msg = String(err?.message || "");

    if (msg === "POOL_MISSING") {
      return jsonOk(
        { ok: false, error: "donation_pool user is missing. Run the ensure-pool-user script." },
        { status: 500 }
      );
    }
    if (msg === "NOT_FOUND") return jsonOk({ ok: false, error: "Not found" }, { status: 404 });
    if (msg.startsWith("BAD_STATUS:")) {
      const s = msg.split(":")[1] || "unknown";
      return jsonOk(
        { ok: false, error: `Request must be approved before fulfillment (currently ${s})` },
        { status: 400 }
      );
    }
    if (msg === "ALREADY_FULFILLED") {
      return jsonOk({ ok: false, error: "Already fulfilled" }, { status: 409 });
    }
    if (msg.startsWith("INSUFFICIENT_POOL:")) {
      const bal = msg.split(":")[1] || "0";
      return jsonOk(
        { ok: false, error: `Insufficient pool balance. Pool has ${bal} credits.` },
        { status: 409 }
      );
    }

    console.error("[admin/fulfill] error", err);
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}