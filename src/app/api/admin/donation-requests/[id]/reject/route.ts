// src/app/api/admin/donation-requests/[id]/reject/route.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"]; // allowlist

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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ✅ Next expects Promise here
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

  const existing = await prisma.donationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true },
  });

  if (!existing) return jsonOk({ ok: false, error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") {
    return jsonOk(
      { ok: false, error: `Cannot reject a request in status '${existing.status}'` },
      { status: 409 }
    );
  }

  const updated = await prisma.donationRequest.update({
    where: { id: requestId },
    data: {
      status: "rejected",
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

  return jsonOk({ ok: true, request: updated });
}