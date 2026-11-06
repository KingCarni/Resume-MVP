import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin";
import { runJobMatchWarmupPass } from "@/lib/jobs/warmProcessor";
import {
  getJobMatchWarmupState,
  listJobMatchWarmupAdminRows,
  markJobMatchWarmupStale,
  retryJobMatchWarmup,
} from "@/lib/jobs/warmup";
import { prisma } from "@/lib/prisma";

type ActionName = "retry" | "mark_stale" | "run_pass";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function parseLimit(value: string | null) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.floor(parsed), 1), 200);
}

function parseStatus(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") return "all";
  if (
    normalized === "pending" ||
    normalized === "running" ||
    normalized === "ready" ||
    normalized === "failed" ||
    normalized === "stale"
  ) {
    return normalized;
  }
  return "all";
}

async function parseActionRequest(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as {
      action?: ActionName;
      resumeProfileId?: string;
    };
  }

  const formData = await req.formData().catch(() => null);
  return {
    action: String(formData?.get("action") ?? "") as ActionName,
    resumeProfileId: String(formData?.get("resumeProfileId") ?? ""),
  };
}

export async function GET(req: Request) {
  const { isAdmin, email } = await getAdminSession();
  if (!isAdmin) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const url = new URL(req.url);
  const rows = await listJobMatchWarmupAdminRows({
    limit: parseLimit(url.searchParams.get("limit")),
    status: parseStatus(url.searchParams.get("status")),
  });

  return json({
    ok: true,
    email,
    rows,
  });
}

export async function POST(req: Request) {
  const { isAdmin, email } = await getAdminSession();
  if (!isAdmin) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  const body = await parseActionRequest(req);
  const action = body.action;
  const resumeProfileId = typeof body.resumeProfileId === "string" ? body.resumeProfileId.trim() : "";

  if (!resumeProfileId) {
    return json({ ok: false, error: "Missing resumeProfileId" }, 400);
  }

  if (action !== "retry" && action !== "mark_stale" && action !== "run_pass") {
    return json({ ok: false, error: "Unsupported action" }, 400);
  }

  const warmup = await prisma.jobMatchWarmup.findUnique({
    where: {
      resumeProfileId,
    },
    select: {
      userId: true,
      resumeProfileId: true,
      processedCount: true,
      totalCandidateCount: true,
      status: true,
    },
  });

  if (!warmup) {
    return json({ ok: false, error: "Warmup not found" }, 404);
  }

  let actionResult: unknown = null;

  if (action === "retry") {
    actionResult = await retryJobMatchWarmup({
      userId: warmup.userId,
      resumeProfileId: warmup.resumeProfileId,
    });
  } else if (action === "mark_stale") {
    actionResult = await markJobMatchWarmupStale({
      userId: warmup.userId,
      resumeProfileId: warmup.resumeProfileId,
      processedCount: warmup.processedCount,
      totalCandidateCount: warmup.totalCandidateCount,
      reason: `Marked stale by admin ${email ?? "unknown"}`,
    });
  } else if (action === "run_pass") {
    actionResult = await runJobMatchWarmupPass({
      userId: warmup.userId,
      resumeProfileId: warmup.resumeProfileId,
    });
  }

  const updated = await getJobMatchWarmupState({
    userId: warmup.userId,
    resumeProfileId: warmup.resumeProfileId,
  });

  return json({
    ok: true,
    action,
    actionResult,
    updated,
  });
}
