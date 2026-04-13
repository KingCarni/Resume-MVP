import { resolveJobMatchForUser } from "../app/api/jobs/[id]/match/route";
import { getJobDetail, listJobs } from "../lib/jobs/queries";
import { prisma } from "../lib/prisma";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function newestSortValue(item: {
  postedAt: Date | null;
  createdAt: Date;
}) {
  return item.postedAt ? item.postedAt.getTime() : item.createdAt.getTime();
}

async function getValidationFixture() {
  const profile = await prisma.resumeProfile.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!profile) {
    throw new Error("No ResumeProfile rows found. Create or analyze a resume first, then re-run validation.");
  }

  const activeJob = await prisma.job.findFirst({
    where: { status: "active" },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  if (!activeJob) {
    throw new Error("No active Job rows found. Import/seed jobs first, then re-run validation.");
  }

  return {
    userId: profile.userId,
    resumeProfileId: profile.id,
    seedJobId: activeJob.id,
  };
}

async function validatePaginationAndStableSorting(userId: string, resumeProfileId: string) {
  const page1a = await listJobs({
    userId,
    resumeProfileId,
    sort: "newest",
    page: 1,
    pageSize: 10,
  });

  const page1b = await listJobs({
    userId,
    resumeProfileId,
    sort: "newest",
    page: 1,
    pageSize: 10,
  });

  const page2 = await listJobs({
    userId,
    resumeProfileId,
    sort: "newest",
    page: 2,
    pageSize: 10,
  });

  assert(
    JSON.stringify(page1a.items.map((item) => item.id)) === JSON.stringify(page1b.items.map((item) => item.id)),
    "Stable sorting failed: page 1 order changed across identical requests."
  );

  for (let i = 1; i < page1a.items.length; i += 1) {
    const previous = newestSortValue(page1a.items[i - 1]);
    const current = newestSortValue(page1a.items[i]);
    assert(previous >= current, "Newest sorting failed: results are not descending by postedAt/createdAt.");
  }

  const page1Ids = new Set(page1a.items.map((item) => item.id));
  const overlap = page2.items.filter((item) => page1Ids.has(item.id));
  assert(overlap.length === 0, "Pagination failed: page 1 and page 2 contain overlapping jobs.");

  console.log("[PASS] /api/jobs pagination and newest sorting are stable");
}

async function validateHiddenJobsExclusion(userId: string, resumeProfileId: string) {
  const hiddenJobs = await prisma.job.findMany({
    where: {
      status: "active",
      hiddenBy: {
        some: { userId },
      },
    },
    select: { id: true },
    take: 50,
  });

  if (!hiddenJobs.length) {
    console.log("[SKIP] hidden jobs exclusion check (no hidden active jobs found for selected user)");
    return;
  }

  const hiddenIds = new Set(hiddenJobs.map((job) => job.id));
  const result = await listJobs({
    userId,
    resumeProfileId,
    sort: "newest",
    page: 1,
    pageSize: 50,
  });

  const leaked = result.items.filter((item) => hiddenIds.has(item.id));
  assert(leaked.length === 0, "Hidden jobs leaked into visible listJobs results.");

  console.log("[PASS] hidden jobs are excluded from visible results");
}

async function validateSavedStateAndDetailPayload(userId: string, fallbackJobId: string) {
  const savedJob = await prisma.job.findFirst({
    where: {
      status: "active",
      savedBy: {
        some: { userId },
      },
    },
    select: { id: true },
  });

  const jobId = savedJob?.id ?? fallbackJobId;
  const detail = await getJobDetail(jobId, userId);

  assert(detail, "getJobDetail returned null for an active job.");

  assert(!!detail.source, "getJobDetail missing source relation.");
  assert(Array.isArray(detail.savedBy), "getJobDetail missing savedBy relation array.");
  assert(Array.isArray(detail.hiddenBy), "getJobDetail missing hiddenBy relation array.");

  if (savedJob) {
    assert(detail.savedBy.length > 0, "Saved job did not surface savedBy state for current user.");
    console.log("[PASS] saved state is present where surfaced");
  } else {
    console.log("[SKIP] saved state check (no saved active jobs found for selected user)");
  }

  console.log("[PASS] /api/jobs/[id] detail payload shape is valid");
}

async function validateMatchCacheAndRecalculation(userId: string, resumeProfileId: string, jobId: string) {
  const warm = await resolveJobMatchForUser({
    userId,
    resumeProfileId,
    jobId,
  });

  assert(warm.ok, "Initial match resolution failed.");
  assert(!!warm.item, "Initial match resolution returned no item.");

  const sentinel = "__JOB73_CACHE_SENTINEL__";

  await prisma.jobMatch.update({
    where: {
      resumeProfileId_jobId: {
        resumeProfileId,
        jobId,
      },
    },
    data: {
      totalScore: 1,
      titleScore: 0,
      skillScore: 0,
      seniorityScore: 0,
      locationScore: 0,
      keywordScore: 1,
      explanationShort: sentinel,
      matchingSkills: [],
      missingSkills: [],
      computedAt: new Date(),
    },
  });

  const cached = await resolveJobMatchForUser({
    userId,
    resumeProfileId,
    jobId,
  });

  assert(cached.ok, "Cached match resolution failed.");
  assert(cached.usedCache === true, "Expected cached path, but route logic recalculated.");
  assert(cached.item?.explanationShort === sentinel, "Cached value did not come back from existing jobMatch row.");

  const staleComputedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  await prisma.jobMatch.update({
    where: {
      resumeProfileId_jobId: {
        resumeProfileId,
        jobId,
      },
    },
    data: {
      explanationShort: sentinel,
      computedAt: staleComputedAt,
    },
  });

  const refreshed = await resolveJobMatchForUser({
    userId,
    resumeProfileId,
    jobId,
  });

  assert(refreshed.ok, "Stale match refresh failed.");
  assert(refreshed.usedCache === false, "Expected recalculation path for stale cache.");
  assert(refreshed.item?.explanationShort !== sentinel, "Stale cache was not recalculated.");

  console.log("[PASS] /api/jobs/[id]/match uses cache when fresh");
  console.log("[PASS] /api/jobs/[id]/match recalculates when cache is stale");
}

async function main() {
  const fixture = await getValidationFixture();

  await validatePaginationAndStableSorting(fixture.userId, fixture.resumeProfileId);
  await validateHiddenJobsExclusion(fixture.userId, fixture.resumeProfileId);
  await validateSavedStateAndDetailPayload(fixture.userId, fixture.seedJobId);
  await validateMatchCacheAndRecalculation(fixture.userId, fixture.resumeProfileId, fixture.seedJobId);

  console.log("[PASS] validate-jobs-api.ts complete");
}

main()
  .catch((error) => {
    console.error("[FAIL] validate-jobs-api.ts");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
