// src/app/api/admin/donation-requests/[id]/reject/route.ts
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

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  if (!session || !email) return { ok: false as const, error: "Unauthorized" };
  if (!ADMIN_EMAILS.has(email)) return { ok: false as const, error: "Forbidden" };
  return { ok: true as const };
}

function normalizeText(s: unknown, max = 1000) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, max);
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return jsonOk({ ok: false, error: guard.error }, { status: guard.error === "Forbidden" ? 403 : 401 });

  const id = String(ctx?.params?.id ?? "").trim();
  if (!id) return jsonOk({ ok: false, error: "Missing id" }, { status: 400 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const reviewNote = normalizeText(body?.reviewNote, 1000);

  const existing = await prisma.donationRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) return jsonOk({ ok: false, error: "Not found" }, { status: 404 });
  if (existing.status !== "pending") {
    return jsonOk({ ok: false, error: `Cannot reject from status "${existing.status}"` }, { status: 400 });
  }

  const updated = await prisma.donationRequest.update({
    where: { id },
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