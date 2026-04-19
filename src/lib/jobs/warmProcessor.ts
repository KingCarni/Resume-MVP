import { prisma } from "@/lib/prisma";
import { listMatchCandidateJobIds } from "@/lib/jobs/queries";
import {
  markJobMatchWarmupFailed,
  markJobMatchWarmupPending,
  markJobMatchWarmupProgress,
  markJobMatchWarmupReady,
  markJobMatchWarmupRunning,
} from "@/lib/jobs/warmup";
import {
  getRoleFamilyMatchStrength,
  shouldHardExcludeRoleCandidate,
} from "@/lib/jobs/roleFamilies";

const MAX_CANDIDATES = 240;
const BATCH_SIZE = 40;
const MAX_BATCHES_PER_PASS = 3;
const MIN_SURVIVOR_POOL = 80;

export async function runWarmProcessor(params: {
  resumeProfileId: string;
  targetPosition?: string | null;
  q?: string | null;
}) {
  try {
    await markJobMatchWarmupRunning(params.resumeProfileId);

    const candidateIds = await listMatchCandidateJobIds({
      q: params.q,
      targetPosition: params.targetPosition,
      limit: MAX_CANDIDATES,
    });

    const jobs = await prisma.job.findMany({
      where: { id: { in: candidateIds }, status: "active" },
      select: { id: true, title: true },
    });

    const survivors = jobs.filter((job) => {
      if (shouldHardExcludeRoleCandidate(params.targetPosition, job.title)) {
        return false;
      }
      const strength = getRoleFamilyMatchStrength(params.targetPosition, job.title);
      return strength === "exact" || strength === "adjacent";
    });

    const effectiveCandidates = (survivors.length >= MIN_SURVIVOR_POOL ? survivors : jobs).slice(0, MAX_CANDIDATES);

    let processed = 0;
    const total = effectiveCandidates.length;
    let batchCount = 0;

    for (let index = 0; index < effectiveCandidates.length; index += BATCH_SIZE) {
      const batch = effectiveCandidates.slice(index, index + BATCH_SIZE);
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
            userId: "system",
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
      await markJobMatchWarmupProgress(params.resumeProfileId, {
        processedCount: processed,
        totalCandidateCount: total,
        lastProcessedJobId,
      });

      if (batchCount >= MAX_BATCHES_PER_PASS && processed < total) {
        await markJobMatchWarmupPending(params.resumeProfileId);
        return {
          status: "partial" as const,
          processed,
          total,
        };
      }
    }

    await markJobMatchWarmupReady(params.resumeProfileId, {
      processedCount: processed,
      totalCandidateCount: total,
    });

    return {
      status: "ready" as const,
      processed,
      total,
    };
  } catch (error) {
    await markJobMatchWarmupFailed(
      params.resumeProfileId,
      error instanceof Error ? error.message : "Unknown warmup failure",
    );
    throw error;
  }
}
