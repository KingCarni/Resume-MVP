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
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: number | null;
  page?: number | null;
  pageSize?: number | null;
  sort?: JobSort | null;
};

const DEFAULT_PAGE_SIZE = 20;
const MIN_SCORE_TO_SURFACE = 21;
const CANDIDATE_SCAN_MULTIPLIER = 3;
const WARMUP_SCAN_LIMIT = 2500;

function normalizedValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRemote(value: string | null | undefined) {
  const normalized = normalizedValue(value).toLowerCase();
  if (!normalized || normalized === "all") return null;
  if (
    normalized === "remote" ||
    normalized === "hybrid" ||
    normalized === "onsite" ||
    normalized === "unknown"
  ) {
    return normalized;
  }
  return null;
}

function normalizeSeniority(value: string | null | undefined) {
  const normalized = normalizedValue(value).toLowerCase();
  if (!normalized || normalized === "all") return null;
  return normalized;
}

function buildBaseJobWhere(params: Pick<ListJobsParams, "q" | "remote" | "location" | "seniority" | "minSalary">): Prisma.JobWhereInput {
  const q = normalizedValue(params.q);
  const remote = normalizeRemote(params.remote);
  const location = normalizedValue(params.location);
  const seniority = normalizeSeniority(params.seniority);
  const minSalary = typeof params.minSalary === "number" && Number.isFinite(params.minSalary)
    ? Math.max(0, Math.floor(params.minSalary))
    : null;

  return {
    status: "active",
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { company: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
    ...(remote ? { remoteType: remote } : {}),
    ...(location
      ? {
          OR: [
            { location: { contains: location, mode: Prisma.QueryMode.insensitive } },
            { locationNormalized: { contains: location.toLowerCase() } },
          ],
        }
      : {}),
    ...(seniority ? { seniority } : {}),
    ...(minSalary != null
      ? {
          OR: [
            { salaryMin: { gte: minSalary } },
            { salaryMax: { gte: minSalary } },
          ],
        }
      : {}),
  };
}

export async function listMatchCandidateJobIds(params: {
  q?: string | null;
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: number | null;
  targetPosition?: string | null;
  limit: number;
}) {
  const take = Math.max(params.limit * CANDIDATE_SCAN_MULTIPLIER, params.limit);
  const jobs = await prisma.job.findMany({
    where: buildBaseJobWhere(params),
    select: {
      id: true,
      title: true,
      postedAt: true,
      createdAt: true,
    },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take,
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
  const fallback = filtered.length > 0 ? filtered : ranked;
  return fallback.slice(0, params.limit).map((job) => job.id);
}

export async function listWarmupCandidateJobIds(params: {
  targetPosition?: string | null;
  limit?: number | null;
}) {
  const take = Math.max(200, Math.min(params.limit ?? WARMUP_SCAN_LIMIT, WARMUP_SCAN_LIMIT));
  const jobs = await prisma.job.findMany({
    where: { status: "active" },
    select: {
      id: true,
      title: true,
      postedAt: true,
      createdAt: true,
    },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take,
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
  const fallback = filtered.length > 0 ? filtered : ranked;
  return fallback.slice(0, take).map((job) => job.id);
}

export async function listJobs(params: ListJobsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE);
  const sort = params.sort ?? "match";
  const baseWhere = buildBaseJobWhere(params);

  const warmupState = params.resumeProfileId
    ? await getJobMatchWarmupState({
        userId: params.userId,
        resumeProfileId: params.resumeProfileId,
      })
    : null;

  const shouldUseCache =
    sort === "match" &&
    Boolean(params.resumeProfileId) &&
    shouldUseJobMatchCache(warmupState);

  const cacheWhere: Prisma.JobMatchWhereInput =
    sort === "match" && params.resumeProfileId
      ? {
          resumeProfileId: params.resumeProfileId,
          totalScore: { gte: MIN_SCORE_TO_SURFACE },
          job: baseWhere,
        }
      : {};

  const partialCacheCount =
    sort === "match" && params.resumeProfileId
      ? await prisma.jobMatch.count({ where: cacheWhere })
      : 0;

  const canUsePartialCache =
    sort === "match" &&
    Boolean(params.resumeProfileId) &&
    partialCacheCount > 0;

  const warmupUiState = getJobMatchWarmupUiState({
    state: warmupState,
    usedFallback: sort === "match" && Boolean(params.resumeProfileId) && !shouldUseCache,
  });

  if ((shouldUseCache || canUsePartialCache) && params.resumeProfileId) {
    const [matches, total] = await Promise.all([
      prisma.jobMatch.findMany({
        where: cacheWhere,
        orderBy: [{ totalScore: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { job: { include: { source: true } } },
      }),
      prisma.jobMatch.count({ where: cacheWhere }),
    ]);

    return {
      jobs: matches.map((match) => ({
        ...match.job,
        matchScore: match.totalScore,
        explanationShort: match.explanationShort,
        matchingSkills: match.matchingSkills,
        missingSkills: match.missingSkills,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      usedFallback: !shouldUseCache,
      warmup: {
        ...warmupUiState,
        usedFallback: !shouldUseCache,
      },
    };
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where: baseWhere,
      include: { source: true },
      orderBy:
        sort === "salary"
          ? [{ salaryMax: "desc" }, { salaryMin: "desc" }, { postedAt: "desc" }, { createdAt: "desc" }]
          : [{ postedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.job.count({ where: baseWhere }),
  ]);

  return {
    jobs: jobs.map((job) => ({
      ...job,
      matchScore: null,
      explanationShort: null,
      matchingSkills: [],
      missingSkills: [],
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    usedFallback: sort === "match" && Boolean(params.resumeProfileId),
    warmup: warmupUiState,
  };
}
