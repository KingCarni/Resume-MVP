// src/app/api/admin/donation-pool/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"]; // your allowlist

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return jsonOk({ ok: false, error: "Forbidden" }, { status: 403 });

  // Prefer stable ID (avoids email typos)
  const pool = await prisma.user.findUnique({
    where: { id: "donation_pool" },
    select: { id: true },
  });

  if (!pool) {
    return jsonOk({ ok: false, error: "Pool user not found (id: donation_pool)" }, { status: 500 });
  }

  // Sum all ledger deltas for pool user (pool balance)
  const agg = await prisma.creditsLedger.aggregate({
    where: { userId: pool.id },
    _sum: { delta: true },
  });

  const balance = Number(agg._sum.delta ?? 0);

  return jsonOk({ ok: true, balance, poolUserId: pool.id });
}