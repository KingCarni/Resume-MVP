
import { JobMatchWarmupStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WarmupStatus = JobMatchWarmupStatus;

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
}) {
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "pending",
      totalCandidateCount: args.totalCandidateCount ?? 0,
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
      totalCandidateCount: args.totalCandidateCount ?? 0,
      processedCount: 0,
    },
  });
}

export async function markJobMatchWarmupRunning(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount: number;
}) {
  const now = new Date();
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "running",
      totalCandidateCount: args.totalCandidateCount,
      lastError: null,
      startedAt: now,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "running",
      totalCandidateCount: args.totalCandidateCount,
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
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: args.processedCount >= args.totalCandidateCount ? "ready" : "running",
      processedCount: args.processedCount,
      totalCandidateCount: args.totalCandidateCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: null,
      completedAt: args.processedCount >= args.totalCandidateCount ? new Date() : null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: args.processedCount >= args.totalCandidateCount ? "ready" : "running",
      processedCount: args.processedCount,
      totalCandidateCount: args.totalCandidateCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      completedAt: args.processedCount >= args.totalCandidateCount ? new Date() : null,
    },
  });
}

export async function markJobMatchWarmupReady(args: {
  userId: string;
  resumeProfileId: string;
  totalCandidateCount: number;
  processedCount: number;
  lastProcessedJobId?: string | null;
}) {
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "ready",
      totalCandidateCount: args.totalCandidateCount,
      processedCount: args.processedCount,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: null,
      completedAt: new Date(),
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "ready",
      totalCandidateCount: args.totalCandidateCount,
      processedCount: args.processedCount,
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
  const message = args.error instanceof Error ? args.error.message : String(args.error ?? "Unknown warmup error");
  return prisma.jobMatchWarmup.upsert({
    where: {
      resumeProfileId: args.resumeProfileId,
    },
    update: {
      userId: args.userId,
      status: "failed",
      totalCandidateCount: args.totalCandidateCount ?? 0,
      processedCount: args.processedCount ?? 0,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: message,
      completedAt: null,
    },
    create: {
      userId: args.userId,
      resumeProfileId: args.resumeProfileId,
      status: "failed",
      totalCandidateCount: args.totalCandidateCount ?? 0,
      processedCount: args.processedCount ?? 0,
      lastProcessedJobId: args.lastProcessedJobId ?? null,
      lastError: message,
    },
  });
}
