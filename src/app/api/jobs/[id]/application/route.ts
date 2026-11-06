import { JobApplicationStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });

  return user?.id ?? null;
}

const VALID_STATUSES = new Set<JobApplicationStatus>([
  JobApplicationStatus.applied,
  JobApplicationStatus.interview,
  JobApplicationStatus.offer,
  JobApplicationStatus.rejected,
  JobApplicationStatus.archived,
]);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function resolveStatus(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const normalized = typeof body.status === "string" ? body.status.trim().toLowerCase() : "applied";
  return VALID_STATUSES.has(normalized as JobApplicationStatus)
    ? (normalized as JobApplicationStatus)
    : null;
}

export async function POST(request: Request, context: RouteContext) {
  const userId = await getUserIdFromSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await context.params;
  const status = await resolveStatus(request);
  if (!status) {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, status: "active" },
    select: { id: true },
  });
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const item = await prisma.jobApplication.upsert({
    where: {
      userId_jobId: {
        userId,
        jobId,
      },
    },
    create: {
      userId,
      jobId,
      status,
    },
    update: {
      status,
    },
  });

  return NextResponse.json({ ok: true, item });
}

export async function PATCH(request: Request, context: RouteContext) {
  return POST(request, context);
}
