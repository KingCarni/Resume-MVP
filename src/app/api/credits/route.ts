// src/app/api/credits/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const email = session?.user?.email || null;
    if (!email) {
      return ok({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user?.id) {
      return ok({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const agg = await prisma.creditsLedger.aggregate({
      where: { userId: user.id },
      _sum: { delta: true },
    });

    const balance = Number(agg._sum.delta ?? 0);

    return ok({ ok: true, balance });
  } catch (err: any) {
    console.error("GET /api/credits error:", err);
    return ok(
      { ok: false, error: err?.message || "CREDITS_FETCH_FAILED" },
      { status: 500 }
    );
  }
}
