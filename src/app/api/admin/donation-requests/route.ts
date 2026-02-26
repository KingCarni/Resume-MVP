// src/app/api/admin/donation-requests/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set(["gitajob.com@gmail.com"]);

function jsonOk(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email ?? "").trim().toLowerCase();

  if (!session || !email) return { ok: false as const, error: "Unauthorized" };
  if (!ADMIN_EMAILS.has(email)) return { ok: false as const, error: "Forbidden" };

  return { ok: true as const, session };
}

export async function GET(req: Request) {
  const guard = await requireAdminSession();
  if (!guard.ok) return jsonOk({ ok: false, error: guard.error }, { status: guard.error === "Forbidden" ? 403 : 401 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "").trim();

  const where: any = {};
  if (status) where.status = status;

  const rows = await prisma.donationRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      requestedCredits: true,
      reason: true,
      status: true,
      reviewNote: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  return jsonOk({ ok: true, requests: rows });
}