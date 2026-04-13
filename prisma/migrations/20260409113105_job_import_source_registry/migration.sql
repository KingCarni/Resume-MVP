-- CreateEnum
CREATE TYPE "JobImportAdapter" AS ENUM ('greenhouse', 'lever', 'ashby');

-- CreateTable
CREATE TABLE "JobImportSource" (
    "id" TEXT NOT NULL,
    "adapter" "JobImportAdapter" NOT NULL,
    "tokenOrSite" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyOverride" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "refreshHours" INTEGER NOT NULL DEFAULT 24,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobImportSource_isActive_idx" ON "JobImportSource"("isActive");

-- CreateIndex
CREATE INDEX "JobImportSource_adapter_idx" ON "JobImportSource"("adapter");

-- CreateIndex
CREATE INDEX "JobImportSource_lastSuccessAt_idx" ON "JobImportSource"("lastSuccessAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobImportSource_adapter_tokenOrSite_key" ON "JobImportSource"("adapter", "tokenOrSite");
