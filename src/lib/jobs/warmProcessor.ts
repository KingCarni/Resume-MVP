import { prisma } from "@/lib/prisma";
import { listWarmupCandidateJobIds } from "@/lib/jobs/queries";
import { scoreResumeToJob } from "@/lib/jobs/scoring";
import {
  markJobMatchWarmupFailed,
  markJobMatchWarmupPending,
  markJobMatchWarmupProgress,
  markJobMatchWarmupReady,
  claimJobMatchWarmupRun,
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
};

const MAX_CANDIDATES = 1500;
const BATCH_SIZE = 40;

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function buildWarmupTargetPosition(profile: ResumeProfileRow, explicitTargetPosition?: string | null) {
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
    },
  });

  if (!profile) {
    throw new Error("Resume profile not found for warmup.");
  }

  const warmupTargetPosition = buildWarmupTargetPosition(profile, params.targetPosition);
  const candidateIds = await listWarmupCandidateJobIds({
    targetPosition: warmupTargetPosition,
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

    const idOrder = new Map(candidateIds.map((id, index) => [id, index]));
    const orderedJobs = jobs.sort(
      (a, b) =>
        (idOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (idOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

    const total = orderedJobs.length;
    let processed = claim.state?.processedCount ?? 0;
    const startIndex = Math.min(processed, total);
    const resumeProfileInput = toResumeProfileInput(profile);

    for (let index = startIndex; index < total; index += BATCH_SIZE) {
      const batch = orderedJobs.slice(index, index + BATCH_SIZE);
      if (batch.length === 0) break;

      for (const job of batch) {
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

    }

    await markJobMatchWarmupReady({
      userId: params.userId,
      resumeProfileId: params.resumeProfileId,
      processedCount: processed,
      totalCandidateCount: total,
      lastProcessedJobId: orderedJobs[orderedJobs.length - 1]?.id ?? null,
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
