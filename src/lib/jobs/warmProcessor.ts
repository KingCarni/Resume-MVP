import { JobMatchWarmup } from "@prisma/client";

import { resolveJobMatchForUser } from "@/app/api/jobs/[id]/match/route";
import { listMatchCandidateJobIds } from "@/lib/jobs/queries";
import {
  claimJobMatchWarmupRun,
  getJobMatchWarmupState,
  isJobMatchWarmupReady,
  markJobMatchWarmupFailed,
  markJobMatchWarmupReady,
  updateJobMatchWarmupProgress,
} from "@/lib/jobs/warmup";

const BATCH_SIZE = 40;
const MAX_CANDIDATES = 240;
const MAX_BATCHES_PER_PASS = 3;
const RUN_LEASE_MS = 90_000;
const PASS_TIME_BUDGET_MS = 8_000;

export type JobMatchWarmupProcessorInput = {
  userId: string;
  resumeProfileId: string;
  q?: string | null;
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: number | null;
};

export type JobMatchWarmupPassResult = {
  ok: true;
  status: JobMatchWarmup["status"] | "idle";
  processed: number;
  totalCandidates: number;
  ready: boolean;
  didWork: boolean;
  continueRecommended: boolean;
  claimReason?: "claimed" | "created" | "ready" | "running" | "race_lost";
};

function getResumeIndex(args: {
  candidateIds: string[];
  processedCount: number;
  lastProcessedJobId?: string | null;
}) {
  const processedFromCount = Math.min(
    Math.max(0, Math.floor(args.processedCount)),
    args.candidateIds.length,
  );

  if (!args.lastProcessedJobId) {
    return processedFromCount;
  }

  const foundIndex = args.candidateIds.findIndex((id) => id === args.lastProcessedJobId);
  if (foundIndex < 0) {
    return processedFromCount;
  }

  return Math.max(processedFromCount, foundIndex + 1);
}

function getRunningWindow(args: {
  candidateIds: string[];
  processedCount: number;
  lastProcessedJobId?: string | null;
}) {
  const startIndex = getResumeIndex(args);
  const nextBatch = args.candidateIds.slice(startIndex, startIndex + BATCH_SIZE);

  return {
    startIndex,
    nextBatch,
  };
}

export async function runJobMatchWarmupPass(
  args: JobMatchWarmupProcessorInput,
): Promise<JobMatchWarmupPassResult> {
  const startedAt = Date.now();

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
  const claim = await claimJobMatchWarmupRun({
    userId: args.userId,
    resumeProfileId: args.resumeProfileId,
    totalCandidateCount: totalCandidates,
    leaseMs: RUN_LEASE_MS,
  });

  if (!claim.acquired) {
    const state = claim.state;

    return {
      ok: true,
      status: state?.status ?? "idle",
      processed: state?.processedCount ?? 0,
      totalCandidates: state?.totalCandidateCount ?? totalCandidates,
      ready: isJobMatchWarmupReady(state),
      didWork: false,
      continueRecommended: state?.status === "pending" || state?.status === "running",
      claimReason: claim.reason,
    };
  }

  let processedCount = claim.state.processedCount;
  let lastProcessedJobId = claim.state.lastProcessedJobId;
  let batchesCompleted = 0;

  try {
    if (totalCandidates === 0) {
      await markJobMatchWarmupReady({
        userId: args.userId,
        resumeProfileId: args.resumeProfileId,
        totalCandidateCount: 0,
        processedCount: 0,
        lastProcessedJobId: null,
      });

      return {
        ok: true,
        status: "ready",
        processed: 0,
        totalCandidates: 0,
        ready: true,
        didWork: true,
        continueRecommended: false,
        claimReason: claim.reason,
      };
    }

    while (batchesCompleted < MAX_BATCHES_PER_PASS) {
      if (Date.now() - startedAt >= PASS_TIME_BUDGET_MS) {
        break;
      }

      const window = getRunningWindow({
        candidateIds,
        processedCount,
        lastProcessedJobId,
      });

      if (window.nextBatch.length === 0) {
        processedCount = totalCandidates;
        await markJobMatchWarmupReady({
          userId: args.userId,
          resumeProfileId: args.resumeProfileId,
          totalCandidateCount: totalCandidates,
          processedCount,
          lastProcessedJobId,
        });

        return {
          ok: true,
          status: "ready",
          processed: processedCount,
          totalCandidates,
          ready: true,
          didWork: true,
          continueRecommended: false,
          claimReason: claim.reason,
        };
      }

      for (const jobId of window.nextBatch) {
        await resolveJobMatchForUser({
          userId: args.userId,
          resumeProfileId: args.resumeProfileId,
          jobId,
        });
      }

      batchesCompleted += 1;
      processedCount = Math.min(totalCandidates, window.startIndex + window.nextBatch.length);
      lastProcessedJobId = window.nextBatch[window.nextBatch.length - 1] ?? lastProcessedJobId;

      const ready = processedCount >= totalCandidates;
      if (ready) {
        await markJobMatchWarmupReady({
          userId: args.userId,
          resumeProfileId: args.resumeProfileId,
          totalCandidateCount: totalCandidates,
          processedCount,
          lastProcessedJobId,
        });

        return {
          ok: true,
          status: "ready",
          processed: processedCount,
          totalCandidates,
          ready: true,
          didWork: true,
          continueRecommended: false,
          claimReason: claim.reason,
        };
      }

      await updateJobMatchWarmupProgress({
        userId: args.userId,
        resumeProfileId: args.resumeProfileId,
        processedCount,
        totalCandidateCount: totalCandidates,
        lastProcessedJobId,
      });
    }

    const latest = await getJobMatchWarmupState({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
    });

    return {
      ok: true,
      status: latest?.status ?? "running",
      processed: latest?.processedCount ?? processedCount,
      totalCandidates: latest?.totalCandidateCount ?? totalCandidates,
      ready: isJobMatchWarmupReady(latest),
      didWork: batchesCompleted > 0,
      continueRecommended: true,
      claimReason: claim.reason,
    };
  } catch (error) {
    await markJobMatchWarmupFailed({
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      totalCandidateCount,
      processedCount,
      lastProcessedJobId,
      error,
    });

    throw error;
  }
}
