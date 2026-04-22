import { Prisma, SeniorityLevel } from "@prisma/client";
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

function normalizeSeniority(value: string | null | undefined): SeniorityLevel | null {
  const normalized = normalizedValue(value).toLowerCase();
  if (!normalized || normalized === "all") return null;

  if ((Object.values(SeniorityLevel) as string[]).includes(normalized)) {
    return normalized as SeniorityLevel;
  }

  return null;
}

function safeDateMs(value: unknown) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function buildBaseJobWhere(
  params: Pick<
    ListJobsParams,
    "q" | "remote" | "location" | "seniority" | "minSalary"
  >,
): Prisma.JobWhereInput {
  const q = normalizedValue(params.q);
  const remote = normalizeRemote(params.remote);
  const location = normalizedValue(params.location);
  const seniority = normalizeSeniority(params.seniority);
  const minSalary =
    typeof params.minSalary === "number" && Number.isFinite(params.minSalary)
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
          OR: [{ salaryMin: { gte: minSalary } }, { salaryMax: { gte: minSalary } }],
        }
      : {}),
  };
}

function mapApplication(application: { status: string; appliedAt: Date; updatedAt: Date } | null) {
  return application
    ? {
        status: application.status,
        appliedAt: application.appliedAt,
        updatedAt: application.updatedAt,
      }
    : null;
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
      const postedA = safeDateMs(a.postedAt) || safeDateMs(a.createdAt);
      const postedB = safeDateMs(b.postedAt) || safeDateMs(b.createdAt);
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
      const postedA = safeDateMs(a.postedAt) || safeDateMs(a.createdAt);
      const postedB = safeDateMs(b.postedAt) || safeDateMs(b.createdAt);
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
          job: {
            ...baseWhere,
            hiddenBy: { none: { userId: params.userId } },
          },
        }
      : {};

  const partialCacheCount =
    sort === "match" && params.resumeProfileId
      ? await prisma.jobMatch.count({ where: cacheWhere })
      : 0;

  const canUsePartialCache =
    sort === "match" && Boolean(params.resumeProfileId) && partialCacheCount > 0;

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
        include: {
          job: {
            include: {
              source: true,
              applications: {
                where: { userId: params.userId },
                take: 1,
                orderBy: { updatedAt: "desc" },
              },
            },
          },
        },
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
        application: mapApplication(match.job.applications[0] ?? null),
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

  const visibleWhere: Prisma.JobWhereInput = {
    ...baseWhere,
    hiddenBy: { none: { userId: params.userId } },
  };

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where: visibleWhere,
      include: {
        source: true,
        applications: {
          where: { userId: params.userId },
          take: 1,
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy:
        sort === "salary"
          ? [
              { salaryMax: "desc" },
              { salaryMin: "desc" },
              { postedAt: "desc" },
              { createdAt: "desc" },
            ]
          : [{ postedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.job.count({ where: visibleWhere }),
  ]);

  return {
    jobs: jobs.map((job) => ({
      ...job,
      matchScore: null,
      explanationShort: null,
      matchingSkills: [],
      missingSkills: [],
      application: mapApplication(job.applications[0] ?? null),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    usedFallback: sort === "match" && Boolean(params.resumeProfileId),
    warmup: warmupUiState,
  };
}

export async function getJobDetail(jobId: string, userId: string) {
  return prisma.job.findFirst({
    where: {
      id: jobId,
      status: "active",
      hiddenBy: {
        none: { userId },
      },
    },
    include: {
      source: true,
      savedBy: {
        where: { userId },
        orderBy: { createdAt: "desc" },
      },
      hiddenBy: {
        where: { userId },
        orderBy: { createdAt: "desc" },
      },
      applications: {
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function listSavedJobs(params: {
  userId: string;
  resumeProfileId?: string | null;
}) {
  const savedJobs = await prisma.savedJob.findMany({
    where: {
      userId: params.userId,
      job: {
        status: "active",
        hiddenBy: {
          none: { userId: params.userId },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      job: {
        include: {
          source: true,
          applications: {
            where: { userId: params.userId },
            take: 1,
            orderBy: { updatedAt: "desc" },
          },
          matches: params.resumeProfileId
            ? {
                where: {
                  userId: params.userId,
                  resumeProfileId: params.resumeProfileId,
                },
                orderBy: { updatedAt: "desc" },
                take: 1,
              }
            : false,
        },
      },
    },
  });

  return savedJobs
    .filter((savedJob) => savedJob.job.applications.length === 0)
    .map((savedJob) => {
      const match = params.resumeProfileId ? savedJob.job.matches[0] ?? null : null;
      return {
        id: savedJob.job.id,
        title: savedJob.job.title,
        company: savedJob.job.company,
        location: savedJob.job.location,
        remoteType: savedJob.job.remoteType,
        seniority: savedJob.job.seniority,
        salaryMin: savedJob.job.salaryMin,
        salaryMax: savedJob.job.salaryMax,
        salaryCurrency: savedJob.job.salaryCurrency,
        postedAt: savedJob.job.postedAt,
        createdAt: savedJob.job.createdAt,
        savedAt: savedJob.createdAt,
        source: savedJob.job.source
          ? {
              slug: savedJob.job.source.slug,
              name: savedJob.job.source.name,
            }
          : {
              slug: "unknown",
              name: "Unknown",
            },
        application: null,
        match: match
          ? {
              totalScore: match.totalScore,
              explanationShort: match.explanationShort,
              matchingSkills: match.matchingSkills,
              missingSkills: match.missingSkills,
              computedAt: match.updatedAt,
            }
          : null,
      };
    });
}

export async function listAppliedJobs(params: {
  userId: string;
  resumeProfileId?: string | null;
}) {
  const applications = await prisma.jobApplication.findMany({
    where: {
      userId: params.userId,
      job: {
        status: "active",
        hiddenBy: { none: { userId: params.userId } },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      job: {
        include: {
          source: true,
          matches: params.resumeProfileId
            ? {
                where: {
                  userId: params.userId,
                  resumeProfileId: params.resumeProfileId,
                },
                orderBy: { updatedAt: "desc" },
                take: 1,
              }
            : false,
          savedBy: {
            where: { userId: params.userId },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  return applications.map((application) => {
    const match = params.resumeProfileId ? application.job.matches[0] ?? null : null;
    return {
      id: application.job.id,
      title: application.job.title,
      company: application.job.company,
      location: application.job.location,
      remoteType: application.job.remoteType,
      seniority: application.job.seniority,
      salaryMin: application.job.salaryMin,
      salaryMax: application.job.salaryMax,
      salaryCurrency: application.job.salaryCurrency,
      postedAt: application.job.postedAt,
      createdAt: application.job.createdAt,
      savedAt: application.job.savedBy[0]?.createdAt ?? null,
      source: application.job.source
        ? {
            slug: application.job.source.slug,
            name: application.job.source.name,
          }
        : {
            slug: "unknown",
            name: "Unknown",
          },
      application: {
        status: application.status,
        appliedAt: application.appliedAt,
        updatedAt: application.updatedAt,
      },
      match: match
        ? {
            totalScore: match.totalScore,
            explanationShort: match.explanationShort,
            matchingSkills: match.matchingSkills,
            missingSkills: match.missingSkills,
            computedAt: match.updatedAt,
          }
        : null,
    };
  });
}
