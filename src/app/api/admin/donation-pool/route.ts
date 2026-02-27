// src/app/api/admin/donation-pool/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];
const POOL_EMAIL = "donation-pool@internal.local"; // ✅ same as donate route

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

function toInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(String(n ?? ""));
  return Number.isFinite(x) ? Math.trunc(x) : NaN;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return jsonOk({ ok: false, error: "Forbidden" }, { status: 403 });

  try {
    const poolUser = await prisma.user.findUnique({
      where: { email: POOL_EMAIL },
      select: { id: true, email: true, name: true },
    });

    if (!poolUser) {
      return jsonOk({ ok: false, error: `Pool user not found (${POOL_EMAIL})` }, { status: 404 });
    }

    const rows = await prisma.creditsLedger.findMany({
      where: { userId: poolUser.id },
      select: { delta: true },
    });

    const balance = rows.reduce((sum, r) => sum + (toInt(r.delta) || 0), 0);

    return jsonOk({
      ok: true,
      pool: { id: poolUser.id, email: poolUser.email, name: poolUser.name },
      balance,
    });
  } catch (err: any) {
    console.error("[admin/donation-pool] error", err);
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}