import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type JobSort = "match" | "newest" | "salary";

export type JobQueryInput = {
  userId: string;
  resumeProfileId?: string | null;
  q?: string | null;
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: number | null;
  sort?: JobSort | null;
  page?: number | null;
  pageSize?: number | null;
};

export type JobListRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: Date | null;
  createdAt: Date;
  status: string;
  titleNormalized: string | null;
  locationNormalized: string | null;
  companyNormalized: string | null;
  match: null | {
    totalScore: number;
    explanationShort: string | null;
    matchingSkills: unknown;
    missingSkills: unknown;
    computedAt: Date;
  };
  source: {
    slug: string;
    name: string;
  };
};

export type JobListResult = {
  items: JobListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SavedJobListRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: Date | null;
  createdAt: Date;
  savedAt: Date;
  source: {
    slug: string;
    name: string;
  };
  match: null | {
    totalScore: number;
    explanationShort: string | null;
    matchingSkills: unknown;
    missingSkills: unknown;
    computedAt: Date;
  };
};

type JobWithSource = Prisma.JobGetPayload<{
  include: {
    source: {
      select: {
        slug: true;
        name: true;
      };
    };
  };
}>;

type JobWithSourceAndMatches = Prisma.JobGetPayload<{
  include: {
    source: {
      select: {
        slug: true;
        name: true;
      };
    };
    matches: {
      select: {
        totalScore: true;
        explanationShort: true;
        matchingSkills: true;
        missingSkills: true;
        computedAt: true;
      };
    };
  };
}>;

type SavedJobWithSource = Prisma.SavedJobGetPayload<{
  include: {
    job: {
      include: {
        source: {
          select: {
            slug: true;
            name: true;
          };
        };
      };
    };
  };
}>;

type SavedJobWithSourceAndMatches = Prisma.SavedJobGetPayload<{
  include: {
    job: {
      include: {
        source: {
          select: {
            slug: true;
            name: true;
          };
        };
        matches: {
          select: {
            totalScore: true;
            explanationShort: true;
            matchingSkills: true;
            missingSkills: true;
            computedAt: true;
          };
        };
      };
    };
  };
}>;

const SEARCH_SYNONYMS: Record<string, string[]> = {
  qa: ["qa", "quality assurance", "quality", "test", "testing"],
  qas: ["qa", "quality assurance", "quality", "test", "testing"],
  tester: ["tester", "test", "quality assurance", "qa"],
  testers: ["tester", "test", "quality assurance", "qa"],
  sdet: [
    "sdet",
    "software development engineer in test",
    "test automation",
    "automation testing",
    "qa automation",
  ],
  ux: ["ux", "user experience"],
  ui: ["ui", "user interface"],
  pm: ["product manager", "program manager", "project manager"],
  devops: ["devops", "platform", "site reliability", "sre", "infrastructure"],
};

const DEFAULT_MATCH_CANDIDATE_LIMIT = 140;
const MIN_MATCH_CANDIDATE_LIMIT = 120;
const MATCH_CANDIDATE_BUFFER = 80;
const MAX_MATCH_CANDIDATE_LIMIT = 260;

export function normalizePage(value?: number | null): number {
  if (!value || Number.isNaN(value) || value < 1) return 1;
  return Math.floor(value);
}

export function normalizePageSize(value?: number | null): number {
  if (!value || Number.isNaN(value)) return 20;
  return Math.min(Math.max(Math.floor(value), 1), 50);
}

export function normalizeMinSalary(value?: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.max(0, Math.floor(value));
}

function toAndArray(
  andValue: Prisma.JobWhereInput["AND"],
): Prisma.JobWhereInput[] {
  if (!andValue) return [];
  return Array.isArray(andValue) ? andValue : [andValue];
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}+.#/\s-]+/gu, " ")
    .replace(/[_/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string): string | null {
  if (token.length <= 3) return null;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ses") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return null;
}

function buildSearchTermGroups(query: string): string[][] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const tokens = Array.from(
    new Set(
      normalizedQuery
        .split(" ")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );

  return tokens.slice(0, 8).map((token) => {
    const variants = new Set<string>([token]);

    const singular = singularizeToken(token);
    if (singular) variants.add(singular);

    for (const synonym of SEARCH_SYNONYMS[token] ?? []) {
      variants.add(normalizeSearchText(synonym));
    }

    return Array.from(variants).filter(Boolean);
  });
}

function buildTextSearchClauses(variants: string[]): Prisma.JobWhereInput[] {
  const uniqueVariants = Array.from(
    new Set(
      variants
        .map((value) => normalizeSearchText(value))
        .filter(Boolean),
    ),
  );

  const clauses: Prisma.JobWhereInput[] = [];

  for (const variant of uniqueVariants) {
    clauses.push({ title: { contains: variant, mode: "insensitive" } });
    clauses.push({ titleNormalized: { contains: variant, mode: "insensitive" } });
    clauses.push({ company: { contains: variant, mode: "insensitive" } });
    clauses.push({
      companyNormalized: { contains: variant, mode: "insensitive" },
    });
    clauses.push({ description: { contains: variant, mode: "insensitive" } });
    clauses.push({
      requirementsText: { contains: variant, mode: "insensitive" },
    });
    clauses.push({
      responsibilitiesText: { contains: variant, mode: "insensitive" },
    });
    clauses.push({ location: { contains: variant, mode: "insensitive" } });
    clauses.push({
      locationNormalized: { contains: variant, mode: "insensitive" },
    });
  }

  return clauses;
}

export function buildJobWhere(input: JobQueryInput): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {
    status: "active",
    hiddenBy: {
      none: {
        userId: input.userId,
      },
    },
  };

  const q = input.q?.trim();
  if (q) {
    const termGroups = buildSearchTermGroups(q);

    if (termGroups.length > 0) {
      where.AND = [
        ...toAndArray(where.AND),
        ...termGroups.map((group) => ({
          OR: buildTextSearchClauses(group),
        })),
      ];
    } else {
      where.OR = buildTextSearchClauses([q]);
    }
  }

  const remote = input.remote?.trim().toLowerCase();
  if (
    remote &&
    remote !== "all" &&
    ["remote", "hybrid", "onsite", "unknown"].includes(remote)
  ) {
    where.remoteType = remote as any;
  }

  const location = input.location?.trim();
  if (location) {
    where.AND = [
      ...toAndArray(where.AND),
      {
        OR: [
          { location: { contains: location, mode: "insensitive" } },
          {
            locationNormalized: {
              contains: location.toLowerCase(),
              mode: "insensitive",
            },
          },
        ],
      },
    ];
  }

  const seniority = input.seniority?.trim().toLowerCase();
  if (seniority && seniority !== "all") {
    where.seniority = seniority as any;
  }

  const minSalary = normalizeMinSalary(input.minSalary);
  if (minSalary != null) {
    where.AND = [
      ...toAndArray(where.AND),
      {
        OR: [
          { salaryMin: { gte: minSalary } },
          { salaryMax: { gte: minSalary } },
        ],
      },
    ];
  }

  return where;
}

function buildJobOrderBy(
  input: JobQueryInput,
): Prisma.JobOrderByWithRelationInput[] {
  const sort = input.sort ?? "match";

  if (sort === "salary") {
    return [
      { salaryMax: Prisma.SortOrder.desc },
      { salaryMin: Prisma.SortOrder.desc },
      { postedAt: Prisma.SortOrder.desc },
      { createdAt: Prisma.SortOrder.desc },
    ];
  }

  return [
    { postedAt: Prisma.SortOrder.desc },
    { createdAt: Prisma.SortOrder.desc },
  ];
}

function buildMatchCandidateOrderBy(): Prisma.JobOrderByWithRelationInput[] {
  return [
    { postedAt: Prisma.SortOrder.desc },
    { createdAt: Prisma.SortOrder.desc },
  ];
}

export function getMatchCandidateWindow(input?: {
  page?: number | null;
  pageSize?: number | null;
}): number {
  if (!input) return DEFAULT_MATCH_CANDIDATE_LIMIT;

  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const target = page * pageSize + MATCH_CANDIDATE_BUFFER;

  return Math.min(
    MAX_MATCH_CANDIDATE_LIMIT,
    Math.max(MIN_MATCH_CANDIDATE_LIMIT, target),
  );
}

export async function listMatchCandidateJobIds(
  input: JobQueryInput,
  limit?: number,
): Promise<string[]> {
  const take = limit ?? getMatchCandidateWindow(input);
  const rows = await prisma.job.findMany({
    where: buildJobWhere(input),
    orderBy: buildMatchCandidateOrderBy(),
    take,
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

function mapJobRow(job: JobWithSource, match: JobListRow["match"]): JobListRow {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    remoteType: String(job.remoteType),
    seniority: String(job.seniority),
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    postedAt: job.postedAt,
    createdAt: job.createdAt,
    status: String(job.status),
    titleNormalized: job.titleNormalized,
    locationNormalized: job.locationNormalized,
    companyNormalized: job.companyNormalized,
    match,
    source: job.source,
  };
}

export async function listJobs(input: JobQueryInput): Promise<JobListResult> {
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const where = buildJobWhere(input);
  const sort = input.sort ?? "match";

  let mapped: JobListRow[] = [];
  const total = await prisma.job.count({ where });

  if (input.resumeProfileId && sort === "match") {
    const candidateItems = await prisma.job.findMany({
      where,
      orderBy: buildMatchCandidateOrderBy(),
      take: getMatchCandidateWindow({ page, pageSize }),
      include: {
        source: {
          select: {
            slug: true,
            name: true,
          },
        },
        matches: {
          where: {
            resumeProfileId: input.resumeProfileId,
            userId: input.userId,
          },
          orderBy: {
            computedAt: "desc",
          },
          take: 1,
          select: {
            totalScore: true,
            explanationShort: true,
            matchingSkills: true,
            missingSkills: true,
            computedAt: true,
          },
        },
      },
    });

    mapped = (candidateItems as JobWithSourceAndMatches[])
      .map((job) => mapJobRow(job, job.matches.length > 0 ? job.matches[0] : null))
      .sort((left, right) => {
        const leftScore = left.match?.totalScore ?? -1;
        const rightScore = right.match?.totalScore ?? -1;
        if (leftScore !== rightScore) return rightScore - leftScore;

        const leftPosted = left.postedAt ? new Date(left.postedAt).getTime() : 0;
        const rightPosted = right.postedAt ? new Date(right.postedAt).getTime() : 0;
        if (leftPosted !== rightPosted) return rightPosted - leftPosted;

        return right.createdAt.getTime() - left.createdAt.getTime();
      })
      .slice((page - 1) * pageSize, page * pageSize);
  } else if (input.resumeProfileId) {
    const items = await prisma.job.findMany({
      where,
      orderBy: buildJobOrderBy(input),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        source: {
          select: {
            slug: true,
            name: true,
          },
        },
        matches: {
          where: {
            resumeProfileId: input.resumeProfileId,
            userId: input.userId,
          },
          orderBy: {
            computedAt: "desc",
          },
          take: 1,
          select: {
            totalScore: true,
            explanationShort: true,
            matchingSkills: true,
            missingSkills: true,
            computedAt: true,
          },
        },
      },
    });

    mapped = (items as JobWithSourceAndMatches[]).map((job) =>
      mapJobRow(job, job.matches.length > 0 ? job.matches[0] : null),
    );
  } else {
    const items = await prisma.job.findMany({
      where,
      orderBy: buildJobOrderBy(input),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        source: {
          select: {
            slug: true,
            name: true,
          },
        },
      },
    });

    mapped = (items as JobWithSource[]).map((job) => mapJobRow(job, null));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items: mapped,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getJobDetail(jobId: string, userId: string) {
  return prisma.job.findFirst({
    where: {
      id: jobId,
      status: "active",
    },
    include: {
      source: true,
      savedBy: {
        where: { userId },
        select: { id: true, createdAt: true },
        take: 1,
      },
      hiddenBy: {
        where: { userId },
        select: { id: true, createdAt: true, reason: true },
        take: 1,
      },
    },
  });
}

export async function listSavedJobs(args: {
  userId: string;
  resumeProfileId?: string | null;
}): Promise<SavedJobListRow[]> {
  const { userId, resumeProfileId } = args;

  if (resumeProfileId) {
    const rows = await prisma.savedJob.findMany({
      where: {
        userId,
        job: {
          status: "active",
          hiddenBy: {
            none: { userId },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        job: {
          include: {
            source: {
              select: {
                slug: true,
                name: true,
              },
            },
            matches: {
              where: {
                userId,
                resumeProfileId,
              },
              orderBy: {
                computedAt: "desc",
              },
              take: 1,
              select: {
                totalScore: true,
                explanationShort: true,
                matchingSkills: true,
                missingSkills: true,
                computedAt: true,
              },
            },
          },
        },
      },
    });

    return (rows as SavedJobWithSourceAndMatches[]).map((row) => ({
      id: row.job.id,
      title: row.job.title,
      company: row.job.company,
      location: row.job.location,
      remoteType: String(row.job.remoteType),
      seniority: String(row.job.seniority),
      salaryMin: row.job.salaryMin,
      salaryMax: row.job.salaryMax,
      salaryCurrency: row.job.salaryCurrency,
      postedAt: row.job.postedAt,
      createdAt: row.job.createdAt,
      savedAt: row.createdAt,
      source: row.job.source,
      match: row.job.matches.length > 0 ? row.job.matches[0] : null,
    }));
  }

  const rows = await prisma.savedJob.findMany({
    where: {
      userId,
      job: {
        status: "active",
        hiddenBy: {
          none: { userId },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      job: {
        include: {
          source: {
            select: {
              slug: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return (rows as SavedJobWithSource[]).map((row) => ({
    id: row.job.id,
    title: row.job.title,
    company: row.job.company,
    location: row.job.location,
    remoteType: String(row.job.remoteType),
    seniority: String(row.job.seniority),
    salaryMin: row.job.salaryMin,
    salaryMax: row.job.salaryMax,
    salaryCurrency: row.job.salaryCurrency,
    postedAt: row.job.postedAt,
    createdAt: row.job.createdAt,
    savedAt: row.createdAt,
    source: row.job.source,
    match: null,
  }));
}
