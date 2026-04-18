import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { resolveJobMatchForUser } from "@/app/api/jobs/[id]/match/route";
import { authOptions } from "@/lib/auth";
import { listMatchCandidateJobIds } from "@/lib/jobs/queries";
import {
  markJobMatchWarmupFailed,
  markJobMatchWarmupPending,
  markJobMatchWarmupReady,
  markJobMatchWarmupRunning,
  updateJobMatchWarmupProgress,
} from "@/lib/jobs/warmup";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 24;
const MAX_CANDIDATES = 240;

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

async function buildMatchesForProfile(args: {
  userId: string;
  resumeProfileId: string;
  q?: string | null;
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: number | null;
}) {
  const candidateIds = await listMatchCandidateJobIds(
    {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      q: args.q,
      remote: args.remote,
      location: args.location,
      seniority: args.seniority,
      minSalary: args.minSalary,
      sort: "match",
      page: 1,
      pageSize: MAX_CANDIDATES,
    },
    MAX_CANDIDATES,
  );

  await markJobMatchWarmupPending({
    userId: args.userId,
    resumeProfileId: args.resumeProfileId,
    totalCandidateCount: candidateIds.length,
  });

  await markJobMatchWarmupRunning({
    userId: args.userId,
    resumeProfileId: args.resumeProfileId,
    totalCandidateCount: candidateIds.length,
  });

  let processed = 0;
  let lastProcessedJobId: string | null = null;
  for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
    const batch = candidateIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((jobId) =>
        resolveJobMatchForUser({
          userId: args.userId,
          resumeProfileId: args.resumeProfileId,
          jobId,
        }),
      ),
    );
    processed += batch.length;
    lastProcessedJobId = batch.length > 0 ? batch[batch.length - 1] : lastProcessedJobId;

    await updateJobMatchWarmupProgress({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      processedCount: processed,
      totalCandidateCount: candidateIds.length,
      lastProcessedJobId,
    });
  }

  await markJobMatchWarmupReady({
    userId: args.userId,
    resumeProfileId: args.resumeProfileId,
    totalCandidateCount: candidateIds.length,
    processedCount: processed,
    lastProcessedJobId,
  });

  return { processed, totalCandidates: candidateIds.length };
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    resumeProfileId?: string;
    q?: string;
    remote?: string;
    location?: string;
    seniority?: string;
    minSalary?: number | null;
  };

  const resumeProfileId = typeof body.resumeProfileId === "string" ? body.resumeProfileId : "";
  if (!resumeProfileId) {
    return NextResponse.json({ ok: false, error: "Missing resumeProfileId" }, { status: 400 });
  }

  const profile = await prisma.resumeProfile.findFirst({
    where: { id: resumeProfileId, userId },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Resume profile not found" }, { status: 404 });
  }

  try {
    const result = await buildMatchesForProfile({
      userId,
      resumeProfileId,
      q: body.q ?? null,
      remote: body.remote ?? null,
      location: body.location ?? null,
      seniority: body.seniority ?? null,
      minSalary: typeof body.minSalary === "number" ? body.minSalary : null,
    });

    const ready = result.totalCandidates > 0 && result.processed >= result.totalCandidates;
    return NextResponse.json({ ok: true, ...result, ready });
  } catch (error) {
    await markJobMatchWarmupFailed({
      userId,
      resumeProfileId,
      error,
    });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Warmup failed" }, { status: 500 });
  }
}
