import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { resolveJobMatchForUser } from "@/app/api/jobs/[id]/match/route";
import { authOptions } from "@/lib/auth";
import { listMatchCandidateJobIds } from "@/lib/jobs/queries";
import {
  getJobMatchWarmupState,
  getOrCreateRunningWarmup,
  markJobMatchWarmupFailed,
  markJobMatchWarmupReady,
  updateJobMatchWarmupProgress,
} from "@/lib/jobs/warmup";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 40;
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

  const totalCandidates = candidateIds.length;
  const warmup = await getOrCreateRunningWarmup({
    userId: args.userId,
    resumeProfileId: args.resumeProfileId,
    totalCandidateCount: totalCandidates,
  });

  if (totalCandidates === 0) {
    await markJobMatchWarmupReady({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      totalCandidateCount: 0,
      processedCount: 0,
      lastProcessedJobId: null,
    });

    return { processed: 0, totalCandidates: 0, ready: true };
  }

  let startIndex = 0;
  if (warmup.lastProcessedJobId) {
    const foundIndex = candidateIds.findIndex((id) => id === warmup.lastProcessedJobId);
    if (foundIndex >= 0) {
      startIndex = foundIndex + 1;
    }
  }

  const alreadyProcessed = Math.min(warmup.processedCount, startIndex);
  const nextBatch = candidateIds.slice(startIndex, startIndex + BATCH_SIZE);

  if (nextBatch.length === 0) {
    await markJobMatchWarmupReady({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      totalCandidateCount: totalCandidates,
      processedCount: totalCandidates,
      lastProcessedJobId: warmup.lastProcessedJobId,
    });

    return { processed: totalCandidates, totalCandidates, ready: true };
  }

  for (const jobId of nextBatch) {
    await resolveJobMatchForUser({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      jobId,
    });
  }

  const processed = Math.min(totalCandidates, alreadyProcessed + nextBatch.length);
  const lastProcessedJobId = nextBatch[nextBatch.length - 1] ?? null;
  const ready = processed >= totalCandidates;

  if (ready) {
    await markJobMatchWarmupReady({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      totalCandidateCount: totalCandidates,
      processedCount: processed,
      lastProcessedJobId,
    });
  } else {
    await updateJobMatchWarmupProgress({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      processedCount: processed,
      totalCandidateCount: totalCandidates,
      lastProcessedJobId,
    });
  }

  return { processed, totalCandidates, ready };
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

  const currentState = await getJobMatchWarmupState({
    userId,
    resumeProfileId,
  });

  if (currentState?.status === "ready") {
    return NextResponse.json({
      ok: true,
      processed: currentState.processedCount,
      totalCandidates: currentState.totalCandidateCount,
      ready: true,
    });
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

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const stateAfterFailure = await getJobMatchWarmupState({
      userId,
      resumeProfileId,
    });

    await markJobMatchWarmupFailed({
      userId,
      resumeProfileId,
      totalCandidateCount: stateAfterFailure?.totalCandidateCount,
      processedCount: stateAfterFailure?.processedCount,
      lastProcessedJobId: stateAfterFailure?.lastProcessedJobId,
      error,
    });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Warmup failed" }, { status: 500 });
  }
}
