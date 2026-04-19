import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getJobMatchWarmupState,
  getJobMatchWarmupUiState,
  shouldUseJobMatchCache,
} from "@/lib/jobs/warmup";
import {
  getRoleFamilyMatchStrength,
  getRoleFamilyPriority,
  shouldHardExcludeRoleCandidate,
} from "@/lib/jobs/roleFamilies";

export type JobSort = "match" | "newest" | "salary";

export type ListJobsParams = {
  userId: string;
  resumeProfileId?: string | null;
  targetPosition?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
  sort?: JobSort;
};

const DEFAULT_PAGE_SIZE = 20;
const MIN_SCORE_TO_SURFACE = 21;

export async function listMatchCandidateJobIds(params: {
  q?: string | null;
  targetPosition?: string | null;
  limit: number;
}) {
  const jobs = await prisma.job.findMany({
    where: {
      status: "active",
      ...(params.q?.trim()
        ? {
            OR: [
              { title: { contains: params.q.trim(), mode: Prisma.QueryMode.insensitive } },
              { company: { contains: params.q.trim(), mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      postedAt: true,
      createdAt: true,
    },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: Math.max(params.limit * 3, params.limit),
  });

  const ranked = jobs
    .map((job) => {
      const rolePriority = getRoleFamilyPriority(params.targetPosition, job.title);
      const matchStrength = getRoleFamilyMatchStrength(params.targetPosition, job.title);
      const hardExcluded = shouldHardExcludeRoleCandidate(params.targetPosition, job.title);
      return {
        ...job,
        rolePriority,
        matchStrength,
        hardExcluded,
      };
    })
    .filter((job) => !job.hardExcluded)
    .sort((a, b) => {
      if (b.rolePriority !== a.rolePriority) return b.rolePriority - a.rolePriority;
      const postedA = a.postedAt?.getTime() ?? a.createdAt.getTime();
      const postedB = b.postedAt?.getTime() ?? b.createdAt.getTime();
      return postedB - postedA;
    });

  const filtered = ranked.filter((job) => job.matchStrength !== "exclude");
  const finalSlice = (filtered.length ? filtered : ranked).slice(0, params.limit);
  return finalSlice.map((job) => job.id);
}

export async function listJobs(params: ListJobsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const sort = params.sort ?? "match";

  const warmupState = params.resumeProfileId
    ? await getJobMatchWarmupState(params.resumeProfileId)
    : null;
  const warmupUiState = getJobMatchWarmupUiState(warmupState);

  if (sort === "match" && params.resumeProfileId && shouldUseJobMatchCache(warmupState)) {
    const matches = await prisma.jobMatch.findMany({
      where: {
        resumeProfileId: params.resumeProfileId,
        totalScore: { gte: MIN_SCORE_TO_SURFACE },
        job: {
          status: "active",
        },
      },
      orderBy: [{ totalScore: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        job: true,
      },
    });

    const total = await prisma.jobMatch.count({
      where: {
        resumeProfileId: params.resumeProfileId,
        totalScore: { gte: MIN_SCORE_TO_SURFACE },
        job: { status: "active" },
      },
    });

    return {
      jobs: matches.map((match) => ({
        ...match.job,
        matchScore: match.totalScore,
        matchingSkills: match.matchingSkills,
        missingSkills: match.missingSkills,
      })),
      total,
      usedFallback: false,
      matchWarmup: warmupUiState,
    };
  }

  const jobs = await prisma.job.findMany({
    where: { status: "active" },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.job.count({ where: { status: "active" } });

  return {
    jobs: jobs.map((job) => ({ ...job, matchScore: null, matchingSkills: [], missingSkills: [] })),
    total,
    usedFallback: sort === "match",
    matchWarmup: warmupUiState,
  };
}
