import { prisma } from "@/lib/prisma";
import { listMatchCandidateJobIds } from "@/lib/jobs/queries";
import {
  markJobMatchWarmupFailed,
  markJobMatchWarmupPending,
  markJobMatchWarmupProgress,
  markJobMatchWarmupReady,
  claimJobMatchWarmupRun,
} from "@/lib/jobs/warmup";
import {
  getRoleFamilyMatchStrength,
  shouldHardExcludeRoleCandidate,
} from "@/lib/jobs/roleFamilies";

const MAX_CANDIDATES = 240;
const BATCH_SIZE = 40;
const MAX_BATCHES_PER_PASS = 3;
const MIN_SURVIVOR_POOL = 80;

export async function runJobMatchWarmupPass(params: {
  userId: string;
  resumeProfileId: string;
  q?: string | null;
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: number | null;
  targetPosition?: string | null;
}) {
  const candidateIds = await listMatchCandidateJobIds({
    q: params.q,
    remote: params.remote,
    location: params.location,
    seniority: params.seniority,
    minSalary: params.minSalary,
    targetPosition: params.targetPosition,
    limit: MAX_CANDIDATES,
  });

  const totalCandidates = candidateIds.length;
  const claim = await claimJobMatchWarmupRun({
    userId: params.userId,
    resumeProfileId: params.resumeProfileId,
    totalCandidateCount: totalCandidates,
  });

  if (!claim.acquired) {
    return {
      status: claim.reason === "ready" ? ("ready" as const) : ("running" as const),
      processed: claim.state?.processedCount ?? 0,
      totalCandidates: claim.state?.totalCandidateCount ?? totalCandidates,
      ready: claim.reason === "ready",
      didWork: false,
      continueRecommended: claim.reason !== "ready",
      claimReason: claim.reason,
    };
  }

  try {
    const jobs = await prisma.job.findMany({
      where: { id: { in: candidateIds }, status: "active" },
      select: { id: true, title: true },
    });

    const idOrder = new Map(candidateIds.map((id, index) => [id, index]));
    const orderedJobs = jobs.sort(
      (a, b) => (idOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (idOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

    const survivors = orderedJobs.filter((job) => {
      if (shouldHardExcludeRoleCandidate(params.targetPosition, job.title)) {
        return false;
      }
      const strength = getRoleFamilyMatchStrength(params.targetPosition, job.title);
      return strength === "exact" || strength === "adjacent";
    });

    const effectiveCandidates = (survivors.length >= MIN_SURVIVOR_POOL ? survivors : orderedJobs).slice(0, MAX_CANDIDATES);
    const total = effectiveCandidates.length;
    let processed = claim.state?.processedCount ?? 0;
    let batchCount = 0;
    const startIndex = Math.min(processed, total);

    for (let index = startIndex; index < total; index += BATCH_SIZE) {
      const batch = effectiveCandidates.slice(index, index + BATCH_SIZE);
      if (batch.length === 0) break;
      batchCount += 1;

      for (const job of batch) {
        await prisma.jobMatch.upsert({
          where: {
            resumeProfileId_jobId: {
              resumeProfileId: params.resumeProfileId,
              jobId: job.id,
            },
          },
          create: {
            userId: params.userId,
            resumeProfileId: params.resumeProfileId,
            jobId: job.id,
            totalScore: 50,
            titleScore: 10,
            skillScore: 20,
            seniorityScore: 10,
            locationScore: 5,
            keywordScore: 5,
            explanationShort: "Warmup placeholder score",
            missingSkills: [],
            matchingSkills: [],
          },
          update: {
            updatedAt: new Date(),
          },
        });
      }

      processed += batch.length;
      const lastProcessedJobId = batch[batch.length - 1]?.id ?? null;
      await markJobMatchWarmupProgress({
        userId: params.userId,
        resumeProfileId: params.resumeProfileId,
        processedCount: processed,
        totalCandidateCount: total,
        lastProcessedJobId,
      });

      if (batchCount >= MAX_BATCHES_PER_PASS && processed < total) {
        await markJobMatchWarmupPending({
          userId: params.userId,
          resumeProfileId: params.resumeProfileId,
          totalCandidateCount: total,
          processedCount: processed,
          lastProcessedJobId,
          preserveProgress: true,
          reason: null,
        });
        return {
          status: "pending" as const,
          processed,
          totalCandidates: total,
          ready: false,
          didWork: true,
          continueRecommended: true,
          claimReason: "claimed" as const,
        };
      }
    }

    await markJobMatchWarmupReady({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      processedCount: processed,
      totalCandidateCount: total,
      lastProcessedJobId: effectiveCandidates[effectiveCandidates.length - 1]?.id ?? null,
    });

    return {
      status: "ready" as const,
      processed,
      totalCandidates: total,
      ready: true,
      didWork: true,
      continueRecommended: false,
      claimReason: "claimed" as const,
    };
  } catch (error) {
    await markJobMatchWarmupFailed({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      error,
    });
    throw error;
  }
}

export const runWarmProcessor = runJobMatchWarmupPass;
