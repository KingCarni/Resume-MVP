import { DocumentType, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];
const DONATION_POOL_EMAIL = "donation-pool@internal.local";

type DebugAction =
  | "lookupUser"
  | "addCredits"
  | "removeCredits"
  | "addDonationPoolCredits"
  | "resetFtueState"
  | "resetResumeData";

type DebugBody = {
  action?: DebugAction;
  email?: string;
  userId?: string;
  amount?: number | string;
  reason?: string;
  confirm?: string;
};

function json(payload: unknown, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function isAdminEmail(email: string | null | undefined) {
  const normalized = normalizeString(email).toLowerCase();
  return !!normalized && ADMIN_EMAILS.includes(normalized);
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = normalizeString(session?.user?.email).toLowerCase();
  if (!email) return { ok: false as const, status: 401, email: "" };
  if (!isAdminEmail(email)) return { ok: false as const, status: 403, email };
  return { ok: true as const, email };
}

function toAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

async function getUserByEmailOrId(args: { email?: string; userId?: string }) {
  const email = normalizeString(args.email).toLowerCase();
  const userId = normalizeString(args.userId);

  if (userId) {
    return prisma.user.findUnique({ where: { id: userId } });
  }
  if (email) {
    return prisma.user.findUnique({ where: { email } });
  }
  return null;
}

async function summarizeUser(userId: string) {
  const [user, balanceAgg, ledgerRows, profileCount, resumeDocCount, savedCount, applicationCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        lastDailyBonusAt: true,
      },
    }),
    prisma.creditsLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    }),
    prisma.creditsLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, delta: true, reason: true, ref: true, createdAt: true },
    }),
    prisma.resumeProfile.count({ where: { userId } }),
    prisma.document.count({ where: { userId, type: DocumentType.resume } }),
    prisma.savedJob.count({ where: { userId } }),
    prisma.jobApplication.count({ where: { userId } }),
  ]);

  return {
    user,
    balance: balanceAgg._sum.delta ?? 0,
    profileCount,
    resumeDocCount,
    savedCount,
    applicationCount,
    ledgerRows: ledgerRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

async function writeAdminEvent(args: {
  adminEmail: string;
  targetUserId: string;
  action: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.event.create({
    data: {
      userId: args.targetUserId,
      type: "purchase",
      metaJson: {
        category: "admin_debug",
        adminEmail: args.adminEmail,
        action: args.action,
        ...(args.meta ?? {}),
      },
    },
  });
}

async function addLedgerDelta(args: {
  targetUserId: string;
  delta: number;
  reason: string;
  adminEmail: string;
  meta?: Record<string, unknown>;
}) {
  const ref = `admin_debug:${args.reason}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  await prisma.$transaction(async (tx) => {
    await tx.creditsLedger.create({
      data: {
        userId: args.targetUserId,
        delta: args.delta,
        reason: args.reason,
        ref,
      },
    });

    await tx.event.create({
      data: {
        userId: args.targetUserId,
        type: "purchase",
        metaJson: {
          category: "admin_debug",
          action: args.reason,
          adminEmail: args.adminEmail,
          delta: args.delta,
          ref,
          ...(args.meta ?? {}),
        },
      },
    });
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return json({ ok: false, error: admin.status === 401 ? "Unauthorized" : "Forbidden" }, { status: admin.status });
  }

  const email = request.nextUrl.searchParams.get("email") || "";
  const userId = request.nextUrl.searchParams.get("userId") || "";
  const user = await getUserByEmailOrId({ email, userId });

  if (!user) {
    return json({ ok: true, item: null, message: "No user found." });
  }

  return json({ ok: true, item: await summarizeUser(user.id) });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return json({ ok: false, error: admin.status === 401 ? "Unauthorized" : "Forbidden" }, { status: admin.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as DebugBody;
    const action = body.action;

    if (!action) return json({ ok: false, error: "Missing action." }, { status: 400 });

    if (action === "lookupUser") {
      const user = await getUserByEmailOrId({ email: body.email, userId: body.userId });
      if (!user) return json({ ok: true, item: null, message: "No user found." });
      return json({ ok: true, item: await summarizeUser(user.id) });
    }

    if (action === "addDonationPoolCredits") {
      const amount = toAmount(body.amount);
      if (amount <= 0) return json({ ok: false, error: "Amount must be positive." }, { status: 400 });

      const poolUser = await prisma.user.upsert({
        where: { email: DONATION_POOL_EMAIL },
        update: {},
        create: {
          email: DONATION_POOL_EMAIL,
          name: "Donation Pool",
        },
      });

      await addLedgerDelta({
        targetUserId: poolUser.id,
        delta: amount,
        reason: "admin_donation_pool_credit",
        adminEmail: admin.email,
        meta: { note: normalizeString(body.reason) || undefined },
      });

      return json({ ok: true, message: `Added ${amount} credits to the donation pool.`, item: await summarizeUser(poolUser.id) });
    }

    const targetUser = await getUserByEmailOrId({ email: body.email, userId: body.userId });
    if (!targetUser) return json({ ok: false, error: "Target user not found." }, { status: 404 });

    if (action === "addCredits" || action === "removeCredits") {
      const amount = toAmount(body.amount);
      if (amount <= 0) return json({ ok: false, error: "Amount must be positive." }, { status: 400 });
      const delta = action === "addCredits" ? amount : -amount;
      const reason = action === "addCredits" ? "admin_credit_grant" : "admin_credit_remove";

      await addLedgerDelta({
        targetUserId: targetUser.id,
        delta,
        reason,
        adminEmail: admin.email,
        meta: { note: normalizeString(body.reason) || undefined },
      });

      return json({ ok: true, message: `Updated credits by ${delta}.`, item: await summarizeUser(targetUser.id) });
    }

    if (action === "resetFtueState") {
      await writeAdminEvent({
        adminEmail: admin.email,
        targetUserId: targetUser.id,
        action: "reset_ftue_state_requested",
        meta: {
          note: "No dedicated FTUE state column exists in this schema. User should be routed by profile presence.",
        },
      });

      return json({
        ok: true,
        message: "FTUE reset noted. This schema gates setup by profile presence, so delete resume profiles if you need to force setup again.",
        item: await summarizeUser(targetUser.id),
      });
    }

    if (action === "resetResumeData") {
      if (normalizeString(body.confirm) !== "RESET") {
        return json({ ok: false, error: "Type RESET to confirm resume/profile reset." }, { status: 400 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.jobMatchWarmup.deleteMany({ where: { userId: targetUser.id } });
        await tx.jobMatch.deleteMany({ where: { userId: targetUser.id } });
        await tx.resumeProfile.deleteMany({ where: { userId: targetUser.id } });
        await tx.document.deleteMany({ where: { userId: targetUser.id, type: DocumentType.resume } });
        await tx.event.create({
          data: {
            userId: targetUser.id,
            type: "purchase",
            metaJson: {
              category: "admin_debug",
              action: "reset_resume_data",
              adminEmail: admin.email,
            },
          },
        });
      });

      return json({ ok: true, message: "Resume profiles, resume documents, and related match cache were reset.", item: await summarizeUser(targetUser.id) });
    }

    return json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("/api/admin/debug failed", error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError ? error.message : error instanceof Error ? error.message : "Admin debug action failed.";
    return json({ ok: false, error: message }, { status: 500 });
  }
}
