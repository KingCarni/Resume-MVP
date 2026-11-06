import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { rejectDonationRequest } from "@/lib/donations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];

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
  ctx: { params: Promise<{ id: string }> },
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
  const adminEmail = String(session.user?.email ?? "").trim().toLowerCase();

  const result = await rejectDonationRequest({
    requestId,
    adminEmail,
    reviewNote,
  });

  if (!result.ok) {
    if (result.code === "NOT_FOUND") return jsonOk({ ok: false, error: result.message }, { status: 404 });
    if (result.code === "PARTIAL_SIDE_EFFECTS") return jsonOk({ ok: false, error: result.message }, { status: 409 });
    return jsonOk({ ok: false, error: result.message }, { status: 409 });
  }

  return jsonOk({
    ok: true,
    alreadyProcessed: result.alreadyProcessed,
    request: result.request,
  });
}
