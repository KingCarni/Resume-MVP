import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  previewScheduledJobImportRun,
  runScheduledJobImports,
  getScheduledJobImportDecision,
} from "@/lib/jobs/importScheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function isAuthorizedCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const headerToken = getBearerToken(request);
  const queryToken = request.nextUrl.searchParams.get("secret")?.trim() ?? "";

  return headerToken === secret || queryToken === secret;
}

function isAdminSession(session: Awaited<ReturnType<typeof getServerSession>>) {
  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.floor(parsed));
}

function shouldForce(request: NextRequest) {
  return request.nextUrl.searchParams.get("force") === "true";
}

function noStoreJson(payload: unknown, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(request: NextRequest) {
  const cronAuthorized = isAuthorizedCronRequest(request);
  const session = cronAuthorized ? null : await getServerSession(authOptions);
  const isAdmin = cronAuthorized ? false : isAdminSession(session);

  if (!cronAuthorized && !isAdmin) {
    return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const decision = getScheduledJobImportDecision();
  const sourceLimit = parsePositiveInt(request.nextUrl.searchParams.get("limit"));
  const preview = await previewScheduledJobImportRun({ sourceLimit });

  return noStoreJson({
    ok: true,
    authMode: cronAuthorized ? "cron" : "admin",
    schedule: decision,
    preview,
  });
}

export async function POST(request: NextRequest) {
  const cronAuthorized = isAuthorizedCronRequest(request);
  const session = cronAuthorized ? null : await getServerSession(authOptions);
  const isAdmin = cronAuthorized ? false : isAdminSession(session);

  if (!cronAuthorized && !isAdmin) {
    return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force = cronAuthorized ? false : shouldForce(request);
  const sourceLimit = parsePositiveInt(request.nextUrl.searchParams.get("limit"));

  try {
    const result = await runScheduledJobImports({
      force,
      sourceLimit,
      reason: cronAuthorized ? "cron" : force ? "admin_manual_force" : "admin_manual_due_only",
    });

    console.log("[jobs-refresh] completed", {
      authMode: cronAuthorized ? "cron" : "admin",
      force,
      ok: result.ok,
      counts: result.counts,
      dueSourceCount: result.dueSourceCount,
      selectedSourceCount: result.selectedSourceCount,
      skippedSourceCount: result.skippedSourceCount,
    });

    return noStoreJson({ ok: result.ok, ...result }, { status: result.ok ? 200 : 207 });
  } catch (error) {
    console.error("[jobs-refresh] failed", error);

    return noStoreJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown refresh failure",
      },
      { status: 500 }
    );
  }
}
