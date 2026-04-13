/*
  Warnings:

  - A unique constraint covering the columns `[userId,ref]` on the table `CreditsLedger` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DonationRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'fulfilled');

-- CreateEnum
CREATE TYPE "JobSourceKind" AS ENUM ('manual', 'ats_feed', 'api');

-- CreateEnum
CREATE TYPE "RemoteType" AS ENUM ('remote', 'hybrid', 'onsite', 'unknown');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "SeniorityLevel" AS ENUM ('entry', 'junior', 'mid', 'senior', 'lead', 'staff', 'principal', 'manager', 'director', 'executive', 'unknown');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('active', 'closed', 'expired');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'purchase';

-- AlterTable
ALTER TABLE "CreditsLedger" ADD COLUMN     "ref" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDailyBonusAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DonationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedCredits" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DonationRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByEmail" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledByEmail" TEXT,
    "fulfillRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "title" TEXT,
    "rawText" TEXT,
    "normalizedSkills" JSONB,
    "normalizedTitles" JSONB,
    "seniority" "SeniorityLevel" NOT NULL DEFAULT 'unknown',
    "yearsExperience" INTEGER,
    "industries" JSONB,
    "certifications" JSONB,
    "keywords" JSONB,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "JobSourceKind" NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT,
    "company" TEXT NOT NULL,
    "companyNormalized" TEXT,
    "title" TEXT NOT NULL,
    "titleNormalized" TEXT,
    "location" TEXT,
    "locationNormalized" TEXT,
    "remoteType" "RemoteType" NOT NULL DEFAULT 'unknown',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'unknown',
    "seniority" "SeniorityLevel" NOT NULL DEFAULT 'unknown',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "description" TEXT NOT NULL,
    "requirementsText" TEXT,
    "responsibilitiesText" TEXT,
    "skills" JSONB,
    "keywords" JSONB,
    "postedAt" TIMESTAMP(3),
    "applyUrl" TEXT,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeProfileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "titleScore" INTEGER NOT NULL,
    "skillScore" INTEGER NOT NULL,
    "seniorityScore" INTEGER NOT NULL,
    "locationScore" INTEGER NOT NULL,
    "keywordScore" INTEGER NOT NULL,
    "explanationShort" TEXT,
    "missingSkills" JSONB,
    "matchingSkills" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DonationRequest_status_createdAt_idx" ON "DonationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DonationRequest_userId_createdAt_idx" ON "DonationRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DonationRequest_userId_status_createdAt_idx" ON "DonationRequest"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DonationRequest_reviewedAt_idx" ON "DonationRequest"("reviewedAt");

-- CreateIndex
CREATE INDEX "DonationRequest_fulfilledAt_idx" ON "DonationRequest"("fulfilledAt");

-- CreateIndex
CREATE UNIQUE INDEX "DonationRequest_fulfillRef_key" ON "DonationRequest"("fulfillRef");

-- CreateIndex
CREATE INDEX "ResumeProfile_userId_createdAt_idx" ON "ResumeProfile"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ResumeProfile_userId_updatedAt_idx" ON "ResumeProfile"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ResumeProfile_sourceDocumentId_idx" ON "ResumeProfile"("sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_slug_key" ON "JobSource"("slug");

-- CreateIndex
CREATE INDEX "JobSource_kind_isActive_idx" ON "JobSource"("kind", "isActive");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Job_status_postedAt_idx" ON "Job"("status", "postedAt");

-- CreateIndex
CREATE INDEX "Job_companyNormalized_idx" ON "Job"("companyNormalized");

-- CreateIndex
CREATE INDEX "Job_titleNormalized_idx" ON "Job"("titleNormalized");

-- CreateIndex
CREATE INDEX "Job_locationNormalized_idx" ON "Job"("locationNormalized");

-- CreateIndex
CREATE INDEX "Job_remoteType_status_idx" ON "Job"("remoteType", "status");

-- CreateIndex
CREATE INDEX "Job_seniority_status_idx" ON "Job"("seniority", "status");

-- CreateIndex
CREATE INDEX "Job_sourceId_status_idx" ON "Job"("sourceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_sourceId_externalId_key" ON "Job"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "JobMatch_userId_createdAt_idx" ON "JobMatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JobMatch_jobId_totalScore_idx" ON "JobMatch"("jobId", "totalScore");

-- CreateIndex
CREATE INDEX "JobMatch_resumeProfileId_computedAt_idx" ON "JobMatch"("resumeProfileId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_resumeProfileId_jobId_key" ON "JobMatch"("resumeProfileId", "jobId");

-- CreateIndex
CREATE INDEX "SavedJob_userId_createdAt_idx" ON "SavedJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedJob_jobId_idx" ON "SavedJob"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_userId_jobId_key" ON "SavedJob"("userId", "jobId");

-- CreateIndex
CREATE INDEX "HiddenJob_userId_createdAt_idx" ON "HiddenJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HiddenJob_jobId_idx" ON "HiddenJob"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenJob_userId_jobId_key" ON "HiddenJob"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditsLedger_userId_ref_key" ON "CreditsLedger"("userId", "ref");

-- AddForeignKey
ALTER TABLE "DonationRequest" ADD CONSTRAINT "DonationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeProfile" ADD CONSTRAINT "ResumeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeProfile" ADD CONSTRAINT "ResumeProfile_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_resumeProfileId_fkey" FOREIGN KEY ("resumeProfileId") REFERENCES "ResumeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenJob" ADD CONSTRAINT "HiddenJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenJob" ADD CONSTRAINT "HiddenJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
