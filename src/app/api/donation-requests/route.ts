// src/app/api/donation-requests/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonOk(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function normalizeText(s: unknown, max = 2000) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, max);
}

function toInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(String(n ?? ""));
  return Number.isFinite(x) ? Math.trunc(x) : NaN;
}

async function resolveUserIdFromSession(session: any): Promise<string | null> {
  const id = String(session?.user?.id ?? "").trim();
  if (id) return id;

  // Fallback: if your NextAuth session doesn't include user.id,
  // resolve via email (common TS warning you hit earlier).
  const email = String(session?.user?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return null;

  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return u?.id ?? null;
}

export async function GET(req: Request) {
  // Optional: list *your own* donation requests (simple UX)
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return jsonOk({ ok: false, error: "Could not resolve userId" }, { status: 401 });

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "").trim();

  const where: any = { userId };
  if (status) where.status = status;

  const rows = await prisma.donationRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      requestedCredits: true,
      reason: true,
      status: true,
      reviewNote: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return jsonOk({ ok: true, requests: rows });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return jsonOk({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = await resolveUserIdFromSession(session);
  if (!userId) return jsonOk({ ok: false, error: "Could not resolve userId" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedCredits = toInt(body?.requestedCredits);
  const reason = normalizeText(body?.reason, 2000);

  // Guardrails (tweak whenever)
  const MIN_CREDITS = 5;
  const MAX_CREDITS = 100;
  if (!Number.isFinite(requestedCredits)) {
    return jsonOk({ ok: false, error: "requestedCredits must be a number" }, { status: 400 });
  }
  if (requestedCredits < MIN_CREDITS || requestedCredits > MAX_CREDITS) {
    return jsonOk(
      { ok: false, error: `requestedCredits must be between ${MIN_CREDITS} and ${MAX_CREDITS}` },
      { status: 400 }
    );
  }
  if (reason.length < 10) {
    return jsonOk({ ok: false, error: "Please add a short reason (10+ characters)." }, { status: 400 });
  }

  // Anti-spam: limit pending requests + cooldown
  const MAX_PENDING = 2;
  const COOLDOWN_HOURS = 24;

  const pendingCount = await prisma.donationRequest.count({
    where: { userId, status: "pending" },
  });

  if (pendingCount >= MAX_PENDING) {
    return jsonOk(
      { ok: false, error: `You already have ${pendingCount} pending request(s). Please wait for review.` },
      { status: 429 }
    );
  }

  const lastReq = await prisma.donationRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastReq?.createdAt) {
    const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;
    const ageMs = Date.now() - new Date(lastReq.createdAt).getTime();
    if (ageMs < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - ageMs) / (60 * 60 * 1000));
      return jsonOk(
        { ok: false, error: `Please wait before requesting again (about ${hoursLeft}h remaining).` },
        { status: 429 }
      );
    }
  }

  try {
    const created = await prisma.donationRequest.create({
      data: {
        userId,
        requestedCredits,
        reason,
        // status defaults to pending in schema
      },
      select: {
        id: true,
        requestedCredits: true,
        reason: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk({ ok: true, request: created });
  } catch (err: any) {
    console.error("[donation-requests] create failed", {
      message: err?.message,
      code: err?.code,
      meta: err?.meta,
    });
    return jsonOk({ ok: false, error: "DB error" }, { status: 500 });
  }
}