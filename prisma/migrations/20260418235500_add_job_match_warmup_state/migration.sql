-- CreateEnum
CREATE TYPE "JobMatchWarmupStatus" AS ENUM ('pending', 'running', 'ready', 'failed', 'stale');

-- CreateTable
CREATE TABLE "JobMatchWarmup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeProfileId" TEXT NOT NULL,
    "status" "JobMatchWarmupStatus" NOT NULL DEFAULT 'pending',
    "totalCandidateCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedJobId" TEXT,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatchWarmup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobMatchWarmup_resumeProfileId_key" ON "JobMatchWarmup"("resumeProfileId");

-- CreateIndex
CREATE INDEX "JobMatchWarmup_userId_status_idx" ON "JobMatchWarmup"("userId", "status");

-- CreateIndex
CREATE INDEX "JobMatchWarmup_status_updatedAt_idx" ON "JobMatchWarmup"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "JobMatchWarmup" ADD CONSTRAINT "JobMatchWarmup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchWarmup" ADD CONSTRAINT "JobMatchWarmup_resumeProfileId_fkey" FOREIGN KEY ("resumeProfileId") REFERENCES "ResumeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
