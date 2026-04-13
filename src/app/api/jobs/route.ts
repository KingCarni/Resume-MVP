import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import {
  authOptions,
} from "@/lib/auth";
import {
  getMatchCandidateWindow,
  listJobs,
  listMatchCandidateJobIds,
} from "@/lib/jobs/queries";
import { scoreResumeToJob } from "@/lib/jobs/scoring";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MATCH_BACKFILL_BATCH_SIZE = 20;

function parseNullableInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function jsonToStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function backfillMissingMatches(
  userId: string,
  resumeProfileId: string,
  jobIds: string[],
) {
  if (!jobIds.length) return;

  const existing = await prisma.jobMatch.findMany({
    where: {
      userId,
      resumeProfileId,
      jobId: { in: jobIds },
    },
    select: { jobId: true },
  });

  const existingSet = new Set(existing.map((row) => row.jobId));
  const missingIds = jobIds.filter((jobId) => !existingSet.has(jobId));

  if (!missingIds.length) return;

  const [profile, jobs] = await Promise.all([
    prisma.resumeProfile.findFirst({
      where: { id: resumeProfileId, userId },
    }),
    prisma.job.findMany({
      where: { id: { in: missingIds } },
    }),
  ]);

  if (!profile || !jobs.length) return;

  const scoringProfile = {
    ...profile,
    normalizedSkills: jsonToStringArray(profile.normalizedSkills),
    normalizedTitles: jsonToStringArray(profile.normalizedTitles),
    certifications: jsonToStringArray(profile.certifications),
    industries: jsonToStringArray(profile.industries),
    keywords: jsonToStringArray(profile.keywords),
  };

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const scoredRows = missingIds
    .map((jobId) => {
      const job = jobsById.get(jobId);
      if (!job) return null;
      return { job, score: scoreResumeToJob(scoringProfile, job) };
    })
    .filter(Boolean) as Array<{
    job: (typeof jobs)[number];
    score: ReturnType<typeof scoreResumeToJob>;
  }>;

  for (const batch of chunkArray(scoredRows, MATCH_BACKFILL_BATCH_SIZE)) {
    await Promise.all(
      batch.map(({ job, score }) =>
        prisma.jobMatch.upsert({
          where: {
            resumeProfileId_jobId: {
              resumeProfileId: profile.id,
              jobId: job.id,
            },
          },
          create: {
            userId,
            resumeProfileId: profile.id,
            jobId: job.id,
            totalScore: score.totalScore,
            titleScore: score.titleScore,
            skillScore: score.skillScore,
            seniorityScore: score.seniorityScore,
            locationScore: score.locationScore,
            keywordScore: score.keywordScore,
            explanationShort: score.explanationShort,
            matchingSkills: score.matchingSkills,
            missingSkills: score.missingSkills,
          },
          update: {
            userId,
            totalScore: score.totalScore,
            titleScore: score.titleScore,
            skillScore: score.skillScore,
            seniorityScore: score.seniorityScore,
            locationScore: score.locationScore,
            keywordScore: score.keywordScore,
            explanationShort: score.explanationShort,
            matchingSkills: score.matchingSkills,
            missingSkills: score.missingSkills,
            computedAt: new Date(),
          },
        }),
      ),
    );
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const resumeProfileId = searchParams.get("resumeProfileId");
  const q = searchParams.get("q");
  const remote = searchParams.get("remote");
  const location = searchParams.get("location");
  const seniority = searchParams.get("seniority");
  const minSalary = parseNullableInt(searchParams.get("minSalary"));
  const sort =
    (searchParams.get("sort") as "match" | "newest" | "salary" | null) ??
    "match";
  const page = parseNullableInt(searchParams.get("page"));
  const pageSize = parseNullableInt(searchParams.get("pageSize"));

  const input = {
    userId,
    resumeProfileId,
    q,
    remote,
    location,
    seniority,
    minSalary,
    sort,
    page,
    pageSize,
  };

  if (resumeProfileId) {
    if (sort === "match") {
      const candidateLimit = getMatchCandidateWindow();
      const candidateJobIds = await listMatchCandidateJobIds(input, candidateLimit);

      await backfillMissingMatches(userId, resumeProfileId, candidateJobIds);
    } else {
      const initial = await listJobs(input);
      await backfillMissingMatches(
        userId,
        resumeProfileId,
        initial.items.map((item) => item.id),
      );
    }
  }

  const result = await listJobs(input);

  return NextResponse.json({ ok: true, ...result });
}
