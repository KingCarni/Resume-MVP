import { JobMatchWarmup, JobMatchWarmupStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WarmupStatus = JobMatchWarmupStatus;
export type JobMatchWarmupState = JobMatchWarmup;

export const JOB_MATCH_WARMUP_RUN_LEASE_MS = 90_000;
export const JOB_MATCH_WARMUP_RUNNING_STUCK_MS = 5 * 60_000;
export const JOB_MATCH_WARMUP_PENDING_STUCK_MS = 15 * 60_000;

export type JobMatchWarmupUiState = {
  status: WarmupStatus | "idle";
  ready: boolean;
  active: boolean;
  usedFallback: boolean;
  processedCount: number;
  totalCandidateCount: number;
  progressPercent: number;
  shouldPoll: boolean;
  shouldTriggerWarmup: boolean;
  lastError: string | null;
  shortLabel: string;
  message: string;
};

export type JobMatchWarmupAdminRow = {
  id: string;
  userId: string;
  resumeProfileId: string;
  profileTitle: string | null;
  userEmail: string | null;
  status: WarmupStatus;
  processedCount: number;
  totalCandidateCount: number;
  progressPercent: number;
  cachedMatchCount: number;
  lastProcessedJobId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  isStuck: boolean;
  stuckReason: string | null;
  canRetry: boolean;
  canRunPass: boolean;
  canMarkStale: boolean;
};

function normalizeNonNegativeInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeWarmupCounts(args: {
  processedCount?: number | null;
  totalCandidateCount?: number | null;
}) {
  const totalCandidateCount = normalizeNonNegativeInt(args.totalCandidateCount);
  const processedCount = Math.min(
    normalizeNonNegativeInt(args.processedCount),
    totalCandidateCount,
  );

  return {
    processedCount,
    totalCandidateCount,
  };
}

function calculateProgressPercent(args: {
  processedCount?: number | null;
  totalCandidateCount?: number | null;
}) {
  const counts = normalizeWarmupCounts(args);
  if (counts.totalCandidateCount <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((counts.processedCount / counts.totalCandidateCount) * 100)),
  );
}

function getElapsedMs(value: Date | null | undefined) {
  if (!value) return null;
  return Date.now() - value.getTime();
}

export function isJobMatchWarmupReady(
  state: Pick<
    JobMatchWarmup,
    "status" | "processedCount" | "totalCandidateCount"
  > | null | undefined,
) {
  if (!state) return false;
  if (state.status !== "ready") return false;
  return state.processedCount >= state.totalCandidateCount;
}

export function isJobMatchWarmupActive(
  state: Pick<JobMatchWarmup, "status"> | null | undefined,
) {
  if (!state) return false;
  return state.status === "pending" || state.status === "running";
}

export function shouldUseJobMatchCache(
  state: Pick<
    JobMatchWarmup,
    "status" | "processedCount" | "totalCandidateCount"
  > | null | undefined,
) {
  return isJobMatchWarmupReady(state);
}

export function getJobMatchWarmupHealth(
  state: Pick<
    JobMatchWarmup,
    "status" | "updatedAt" | "processedCount" | "totalCandidateCount"
  > | null | undefined,
) {
  if (!state) {
    return {
      isStuck: false,
      stuckReason: null as string | null,
      canRetry: true,
      canRunPass: true,
      canMarkStale: false,
    };
  }

  const updatedAgeMs = getElapsedMs(state.updatedAt);
  const runningLooksStuck =
    state.status === "running" &&
    updatedAgeMs != null &&
    updatedAgeMs >= JOB_MATCH_WARMUP_RUNNING_STUCK_MS;
  const pendingLooksStuck =
    state.status === "pending" &&
    updatedAgeMs != null &&
    updatedAgeMs >= JOB_MATCH_WARMUP_PENDING_STUCK_MS;
  const isStuck = runningLooksStuck || pendingLooksStuck;

  let stuckReason: string | null = null;
  if (runningLooksStuck) {
    stuckReason = "running lease looks stale";
  } else if (pendingLooksStuck) {
    stuckReason = "pending warmup has not advanced";
  }

  const canRetry =
    state.status === "failed" ||
    state.status === "stale" ||
    isStuck;

  return {
    isStuck,
    stuckReason,
    canRetry,
    canRunPass: state.status !== "ready",
    canMarkStale: state.status === "running" || state.status === "pending",
  };
}

export async function getJobMatchWarmupState(args: {
  userId: string;
  resumeProfileId: string;
}) {
  return prisma.jobMatchWarmup.findFirst({
    where: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
    },
  });
}

export async function ensureJobMatchWarmupState(args: {
  userId: string;
  resumeProfileId: string;
}) {
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "pending",
    },
  });
}

export async function markJobMatchWarmupPending(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount?: number;
  processedCount?: number;
  lastProcessedJobId?: string | null;
  preserveProgress?: boolean;
  reason?: string | null;
}) {
  const counts = normalizeWarmupCounts({
    processedCount: args.preserveProgress ? (args.processedCount ?? 0) : 0,
    totalCandidateCount: args.totalCandidateCount ?? 0,
  });

  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "pending",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId: args.preserveProgress ? (args.lastProcessedJobId ?? null) : null,
      lastError: args.reason ?? null,
      startedAt: null,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "pending",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId: args.preserveProgress ? (args.lastProcessedJobId ?? null) : null,
      lastError: args.reason ?? null,
    },
  });
}

export async function markJobMatchWarmupRunning(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount: number;
}) {
  const now = new Date();
  const counts = normalizeWarmupCounts({
    processedCount: 0,
    totalCandidateCount: args.totalCandidateCount,
  });

  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "running",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: 0,
      lastProcessedJobId: null,
      lastError: null,
      startedAt: now,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "running",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: 0,
      startedAt: now,
    },
  });
}

export async function updateJobMatchWarmupProgress(args: {
  userId: string;
  resumeProfileId: string;
  processedCount: number;
  totalCandidateCount: number;
  lastProcessedJobId?: string | null;
}) {
  const counts = normalizeWarmupCounts({
    processedCount: args.processedCount,
    totalCandidateCount: args.totalCandidateCount,
  });
  const isReady = counts.processedCount >= counts.totalCandidateCount;

  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: isReady ? "ready" : "running",
      processedCount: counts.processedCount,
      totalCandidateCount: counts.totalCandidateCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: null,
      completedAt: isReady ? new Date() : null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: isReady ? "ready" : "running",
      processedCount: counts.processedCount,
      totalCandidateCount: counts.totalCandidateCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      completedAt: isReady ? new Date() : null,
    },
  });
}


export async function markJobMatchWarmupProgress(args: {
  userId: string;
  resumeProfileId: string;
  processedCount: number;
  totalCandidateCount: number;
  lastProcessedJobId?: string | null;
}) {
  return updateJobMatchWarmupProgress(args);
}

export async function markJobMatchWarmupReady(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount: number;
  processedCount: number;
  lastProcessedJobId?: string | null;
}) {
  const counts = normalizeWarmupCounts({
    processedCount: args.processedCount,
    totalCandidateCount: args.totalCandidateCount,
  });

  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "ready",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: null,
      completedAt: new Date(),
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "ready",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      completedAt: new Date(),
    },
  });
}

export async function markJobMatchWarmupFailed(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount?: number;
  processedCount?: number;
  lastProcessedJobId?: string | null;
  error: unknown;
}) {
  const counts = normalizeWarmupCounts({
    processedCount: args.processedCount ?? 0,
    totalCandidateCount: args.totalCandidateCount ?? 0,
  });
  const message =
    args.error instanceof Error
      ? args.error.message
      : typeof args.error === "string"
        ? args.error
        : "Unknown warmup failure";

  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "failed",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: message,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "failed",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: message,
    },
  });
}

export async function markJobMatchWarmupStale(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount?: number;
  processedCount?: number;
  reason?: string | null;
}) {
  const existing = await getJobMatchWarmupState(args);
  const counts = normalizeWarmupCounts({
    processedCount: args.processedCount ?? existing?.processedCount ?? 0,
    totalCandidateCount: args.totalCandidateCount ?? existing?.totalCandidateCount ?? 0,
  });

  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "stale",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastError: args.reason ?? existing?.lastError ?? null,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "stale",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastError: args.reason ?? null,
    },
  });
}

export async function retryJobMatchWarmup(args: {
  userId: string;
  resumeProfileId: string;
}) {
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "pending",
      totalCandidateCount: 0,
      processedCount: 0,
      lastProcessedJobId: null,
      lastError: null,
      startedAt: null,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "pending",
    },
  });
}

export async function claimJobMatchWarmupRun(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount: number;
  leaseMs?: number;
}) {
  const existing = await getJobMatchWarmupState({
    userId: args.userId,
    resumeProfileId: args.resumeProfileId,
  });

  if (isJobMatchWarmupReady(existing)) {
    return {
      acquired: false as const,
      reason: "ready" as const,
      state: existing,
    };
  }

  const leaseMs = Math.max(15_000, Math.floor(args.leaseMs ?? JOB_MATCH_WARMUP_RUN_LEASE_MS));
  const now = Date.now();
  const canStealRunningLease =
    existing?.status === "running" &&
    existing.updatedAt != null &&
    now - existing.updatedAt.getTime() >= leaseMs;

  if (existing?.status === "running" && !canStealRunningLease) {
    return {
      acquired: false as const,
      reason: "running" as const,
      state: existing,
    };
  }

  const counts = normalizeWarmupCounts({
    processedCount:
      canStealRunningLease || existing?.status === "failed" || existing?.status === "stale"
        ? 0
        : existing?.processedCount ?? 0,
    totalCandidateCount: args.totalCandidateCount,
  });

  const startedAt = new Date();
  const updated = await prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "running",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      lastProcessedJobId:
        canStealRunningLease || existing?.status === "failed" || existing?.status === "stale"
          ? null
          : existing?.lastProcessedJobId ?? null,
      lastError: null,
      startedAt,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "running",
      totalCandidateCount: counts.totalCandidateCount,
      processedCount: counts.processedCount,
      startedAt,
    },
  });

  return {
    acquired: true as const,
    reason: existing ? (canStealRunningLease ? "claimed" : "claimed") : ("created" as const),
    state: updated,
  };
}

export async function getOrCreateRunningWarmup(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount: number;
}) {
  const claim = await claimJobMatchWarmupRun(args);
  return claim.state;
}

export function getJobMatchWarmupUiState(args: {
  state: Pick<
    JobMatchWarmup,
    "status" | "processedCount" | "totalCandidateCount" | "lastError" | "updatedAt"
  > | null | undefined;
  usedFallback?: boolean;
}) {
  const state = args.state;
  const usedFallback = Boolean(args.usedFallback);
  const ready = isJobMatchWarmupReady(state);
  const active = isJobMatchWarmupActive(state);
  const processedCount = normalizeNonNegativeInt(state?.processedCount);
  const totalCandidateCount = normalizeNonNegativeInt(state?.totalCandidateCount);
  const progressPercent = calculateProgressPercent({
    processedCount,
    totalCandidateCount,
  });

  if (!state) {
    return {
      status: "idle",
      ready: false,
      active: false,
      usedFallback,
      processedCount,
      totalCandidateCount,
      progressPercent,
      shouldPoll: false,
      shouldTriggerWarmup: usedFallback,
      lastError: null,
      shortLabel: "Getting best matches ready",
      message: "We are starting a role search based on your selected resume profile.",
    } satisfies JobMatchWarmupUiState;
  }

  if (state.status === "ready" && ready) {
    return {
      status: "ready",
      ready: true,
      active: false,
      usedFallback: false,
      processedCount,
      totalCandidateCount,
      progressPercent: totalCandidateCount > 0 ? 100 : 0,
      shouldPoll: false,
      shouldTriggerWarmup: false,
      lastError: null,
      shortLabel: "Best matches ready",
      message: "Your role search is ready and best matches are now ranked for this resume profile.",
    } satisfies JobMatchWarmupUiState;
  }

  if (state.status === "failed") {
    return {
      status: "failed",
      ready: false,
      active: false,
      usedFallback: true,
      processedCount,
      totalCandidateCount,
      progressPercent,
      shouldPoll: false,
      shouldTriggerWarmup: false,
      lastError: state.lastError ?? "Warmup failed",
      shortLabel: "We hit a snag",
      message: "We could not finish ranking roles for this profile yet. Showing recent jobs for now while you retry.",
    } satisfies JobMatchWarmupUiState;
  }

  if (state.status === "stale") {
    return {
      status: "stale",
      ready: false,
      active: false,
      usedFallback: true,
      processedCount,
      totalCandidateCount,
      progressPercent,
      shouldPoll: false,
      shouldTriggerWarmup: true,
      lastError: state.lastError ?? null,
      shortLabel: "Refreshing your best matches",
      message: "We are updating role matches for your selected resume profile. Recent jobs are showing while the refresh finishes.",
    } satisfies JobMatchWarmupUiState;
  }

  if (state.status === "running") {
    return {
      status: "running",
      ready: false,
      active: true,
      usedFallback: true,
      processedCount,
      totalCandidateCount,
      progressPercent,
      shouldPoll: true,
      shouldTriggerWarmup: false,
      lastError: null,
      shortLabel: "Searching for strong matches",
      message:
        totalCandidateCount > 0
          ? `We are ranking roles for your selected resume profile (${processedCount}/${totalCandidateCount}).`
          : "We are ranking roles for your selected resume profile.",
    } satisfies JobMatchWarmupUiState;
  }

  return {
    status: "pending",
    ready: false,
    active: true,
    usedFallback: true,
    processedCount,
    totalCandidateCount,
    progressPercent,
    shouldPoll: true,
    shouldTriggerWarmup: true,
    lastError: null,
    shortLabel: "Searching is queued",
    message: "We have queued a role search for your selected resume profile. Recent jobs are showing for now.",
  } satisfies JobMatchWarmupUiState;
}

export async function listJobMatchWarmupAdminRows(args?: {
  limit?: number;
  status?: WarmupStatus | "all" | null;
}) {
  const limit = Math.min(Math.max(args?.limit ?? 50, 1), 200);
  const statusFilter = args?.status && args.status !== "all" ? args.status : undefined;

  const warmups = await prisma.jobMatchWarmup.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
      resumeProfile: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: limit,
  });

  const resumeProfileIds = warmups.map((warmup) => warmup.resumeProfileId);
  const cachedCounts =
    resumeProfileIds.length > 0
      ? await prisma.jobMatch.groupBy({
          by: ["resumeProfileId"],
          where: {
            resumeProfileId: {
              in: resumeProfileIds,
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];

  const cachedCountMap = new Map(
    cachedCounts.map((row) => [row.resumeProfileId, row._count._all]),
  );

  return warmups.map((warmup) => {
    const health = getJobMatchWarmupHealth(warmup);

    return {
      id: warmup.id,
      userId: warmup.userId,
      resumeProfileId: warmup.resumeProfileId,
      profileTitle: warmup.resumeProfile?.title ?? null,
      userEmail: warmup.user?.email ?? null,
      status: warmup.status,
      processedCount: warmup.processedCount,
      totalCandidateCount: warmup.totalCandidateCount,
      progressPercent: calculateProgressPercent(warmup),
      cachedMatchCount: cachedCountMap.get(warmup.resumeProfileId) ?? 0,
      lastProcessedJobId: warmup.lastProcessedJobId ?? null,
      lastError: warmup.lastError ?? null,
      createdAt: warmup.createdAt.toISOString(),
      updatedAt: warmup.updatedAt.toISOString(),
      startedAt: warmup.startedAt ? warmup.startedAt.toISOString() : null,
      completedAt: warmup.completedAt ? warmup.completedAt.toISOString() : null,
      isStuck: health.isStuck,
      stuckReason: health.stuckReason,
      canRetry: health.canRetry,
      canRunPass: health.canRunPass,
      canMarkStale: health.canMarkStale,
    } satisfies JobMatchWarmupAdminRow;
  });
}
