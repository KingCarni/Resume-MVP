import { prisma } from "@/lib/prisma";
import { listWarmupCandidateJobIds } from "@/lib/jobs/queries";
import { scoreResumeToJob } from "@/lib/jobs/scoring";
import {
  markJobMatchWarmupFailed,
  markJobMatchWarmupPending,
  markJobMatchWarmupProgress,
  markJobMatchWarmupReady,
  claimJobMatchWarmupRun,
  getJobMatchWarmupState,
} from "@/lib/jobs/warmup";

type ResumeProfileRow = {
  id: string;
  userId: string;
  title: string | null;
  normalizedSkills: unknown;
  normalizedTitles: unknown;
  seniority: string | null;
  yearsExperience: number | null;
  keywords: unknown;
  summary: string | null;
  updatedAt: Date;
};

// Weekend-safe cap: score a focused role-family candidate set first instead of warming hundreds/thousands.
const MAX_CANDIDATES = 500;
// Small batches keep each warmup request cheap and let /jobs refresh visible matches quickly.
const WARMUP_BATCH_SIZE = 15;

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function buildWarmupTargetPosition(
  profile: ResumeProfileRow,
  explicitTargetPosition?: string | null,
) {
  const normalizedExplicit = explicitTargetPosition?.trim();
  if (normalizedExplicit) return normalizedExplicit;

  const seeds = [
    profile.title ?? "",
    ...ensureStringArray(profile.normalizedTitles).slice(0, 3),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return seeds.join(", ") || null;
}

function toResumeProfileInput(profile: ResumeProfileRow) {
  return {
    id: profile.id,
    userId: profile.userId,
    normalizedSkills: ensureStringArray(profile.normalizedSkills),
    normalizedTitles: ensureStringArray(profile.normalizedTitles),
    seniority: profile.seniority,
    yearsExperience: profile.yearsExperience,
    keywords: ensureStringArray(profile.keywords),
    summary: profile.summary,
  };
}

function isDateObject(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isFreshCachedMatch(matchUpdatedAt: unknown) {
  return isDateObject(matchUpdatedAt);
}

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
  const profile = await prisma.resumeProfile.findFirst({
    where: {
      id: params.resumeProfileId,
      userId: params.userId,
    },
    select: {
      id: true,
      userId: true,
      title: true,
      normalizedSkills: true,
      normalizedTitles: true,
      seniority: true,
      yearsExperience: true,
      keywords: true,
      summary: true,
      updatedAt: true,
    },
  });

  if (!profile) {
    throw new Error("Resume profile not found for warmup.");
  }

  const warmupTargetPosition = buildWarmupTargetPosition(
    profile,
    params.targetPosition,
  );
  const candidateIds = await listWarmupCandidateJobIds({
    targetPosition: warmupTargetPosition,
    limit: MAX_CANDIDATES,
  });

  const existingMatches = candidateIds.length
    ? await prisma.jobMatch.findMany({
        where: {
          resumeProfileId: params.resumeProfileId,
          jobId: { in: candidateIds },
        },
        select: {
          jobId: true,
          updatedAt: true,
        },
      })
    : [];

  const freshMatchJobIds = new Set(
    existingMatches
      .filter((match) => isFreshCachedMatch(match.updatedAt))
      .map((match) => match.jobId),
  );

  const jobsNeedingScoreIds = candidateIds.filter(
    (jobId) => !freshMatchJobIds.has(jobId),
  );
  const totalCandidates = candidateIds.length;
  const alreadyProcessedCount = freshMatchJobIds.size;

  if (totalCandidates <= 0 || jobsNeedingScoreIds.length <= 0) {
    await markJobMatchWarmupReady({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      processedCount: totalCandidates,
      totalCandidateCount: totalCandidates,
      lastProcessedJobId: candidateIds[candidateIds.length - 1] ?? null,
    });

    return {
      status: "ready" as const,
      processed: totalCandidates,
      totalCandidates,
      ready: true,
      didWork: false,
      continueRecommended: false,
      claimReason: "cache-hot" as const,
    };
  }

  const currentWarmup = await getJobMatchWarmupState({
    userId: params.userId,
    resumeProfileId: params.resumeProfileId,
  });

  if (currentWarmup?.status === "ready") {
    await markJobMatchWarmupPending({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      totalCandidateCount: totalCandidates,
      processedCount: alreadyProcessedCount,
      lastProcessedJobId: currentWarmup.lastProcessedJobId ?? null,
      preserveProgress: true,
      reason: "New or unscored role candidates found for this profile.",
    });
  }

  const claim = await claimJobMatchWarmupRun({
    userId: params.userId,
    resumeProfileId: params.resumeProfileId,
    totalCandidateCount: totalCandidates,
    leaseMs: 30_000,
  });

  if (!claim.acquired) {
    return {
      status:
        claim.reason === "ready" ? ("ready" as const) : ("running" as const),
      processed: claim.state?.processedCount ?? 0,
      totalCandidates: claim.state?.totalCandidateCount ?? totalCandidates,
      ready: claim.reason === "ready",
      didWork: false,
      continueRecommended: claim.reason !== "ready",
      claimReason: claim.reason,
    };
  }

  try {
    const batchJobIds = jobsNeedingScoreIds.slice(0, WARMUP_BATCH_SIZE);

    const jobs = await prisma.job.findMany({
      where: { id: { in: batchJobIds }, status: "active" },
      select: {
        id: true,
        title: true,
        titleNormalized: true,
        company: true,
        companyNormalized: true,
        location: true,
        locationNormalized: true,
        remoteType: true,
        seniority: true,
        description: true,
        requirementsText: true,
        responsibilitiesText: true,
        skills: true,
        keywords: true,
      },
    });

    const idOrder = new Map(batchJobIds.map((id, index) => [id, index]));
    const orderedJobs = jobs.sort(
      (a, b) =>
        (idOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (idOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

    const batchTotal = orderedJobs.length;
    let batchProcessed = 0;
    const resumeProfileInput = toResumeProfileInput(profile);

    let lastHeartbeat = Date.now();
    let lastProcessedJobId: string | null =
      claim.state?.lastProcessedJobId ?? null;

    for (const job of orderedJobs) {
      const match = scoreResumeToJob(resumeProfileInput, job);

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
          totalScore: match.totalScore,
          titleScore: match.titleScore,
          skillScore: match.skillScore,
          seniorityScore: match.seniorityScore,
          locationScore: match.locationScore,
          keywordScore: match.keywordScore,
          explanationShort: match.explanationShort,
          missingSkills: match.missingSkills,
          matchingSkills: match.matchingSkills,
        },
        update: {
          totalScore: match.totalScore,
          titleScore: match.titleScore,
          skillScore: match.skillScore,
          seniorityScore: match.seniorityScore,
          locationScore: match.locationScore,
          keywordScore: match.keywordScore,
          explanationShort: match.explanationShort,
          missingSkills: match.missingSkills,
          matchingSkills: match.matchingSkills,
          updatedAt: new Date(),
        },
      });

      batchProcessed += 1;
      lastProcessedJobId = job.id;

      const now = Date.now();
      if (now - lastHeartbeat >= 8_000) {
        await markJobMatchWarmupProgress({
          userId: params.userId,
          resumeProfileId: params.resumeProfileId,
          processedCount: Math.min(
            totalCandidates,
            alreadyProcessedCount + batchProcessed,
          ),
          totalCandidateCount: totalCandidates,
          lastProcessedJobId,
        });
        lastHeartbeat = now;
      }
    }

    const processed = Math.min(
      totalCandidates,
      alreadyProcessedCount + batchProcessed,
    );
    const ready = processed >= totalCandidates || batchTotal <= 0;

    await markJobMatchWarmupProgress({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      processedCount: processed,
      totalCandidateCount: totalCandidates,
      lastProcessedJobId,
    });

    if (!ready) {
      await markJobMatchWarmupPending({
        userId: params.userId,
        resumeProfileId: params.resumeProfileId,
        totalCandidateCount: totalCandidates,
        processedCount: processed,
        lastProcessedJobId,
        preserveProgress: true,
      });
    }

    if (ready) {
      await markJobMatchWarmupReady({
        userId: params.userId,
        resumeProfileId: params.resumeProfileId,
        processedCount: totalCandidates,
        totalCandidateCount: totalCandidates,
        lastProcessedJobId,
      });
    }

    return {
      status: ready ? ("ready" as const) : ("running" as const),
      processed,
      totalCandidates,
      ready,
      didWork: batchProcessed > 0,
      continueRecommended: !ready,
      claimReason: "claimed" as const,
    };
  } catch (error) {
    await markJobMatchWarmupFailed({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      totalCandidateCount: totalCandidates,
      processedCount: alreadyProcessedCount,
      error,
    });
    throw error;
  }
}

export const runWarmProcessor = runJobMatchWarmupPass;
