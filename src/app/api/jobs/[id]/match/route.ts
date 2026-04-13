import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { scoreResumeToJob } from "@/lib/jobs/scoring";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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

function jsonToStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort();
}

function buildScoringProfile(
  profile: Awaited<ReturnType<typeof prisma.resumeProfile.findFirst>>,
) {
  if (!profile) return null;

  return {
    ...profile,
    normalizedSkills: jsonToStringArray(profile.normalizedSkills),
    normalizedTitles: jsonToStringArray(profile.normalizedTitles),
    certifications: jsonToStringArray(profile.certifications),
    industries: jsonToStringArray(profile.industries),
    keywords: jsonToStringArray(profile.keywords),
  };
}

function isMatchStale(args: {
  existing: Awaited<ReturnType<typeof prisma.jobMatch.findUnique>>;
  profileUpdatedAt: Date;
  jobUpdatedAt: Date;
  now?: Date;
}) {
  const { existing, profileUpdatedAt, jobUpdatedAt } = args;
  const now = args.now ?? new Date();

  if (!existing) return true;
  if (now.getTime() - new Date(existing.computedAt).getTime() > STALE_AFTER_MS)
    return true;
  if (new Date(existing.updatedAt).getTime() < new Date(profileUpdatedAt).getTime())
    return true;
  if (new Date(existing.updatedAt).getTime() < new Date(jobUpdatedAt).getTime())
    return true;

  return false;
}

function didStoredMatchChange(args: {
  existing: Awaited<ReturnType<typeof prisma.jobMatch.findUnique>>;
  score: ReturnType<typeof scoreResumeToJob>;
}) {
  const { existing, score } = args;
  if (!existing) return true;

  if (existing.totalScore !== score.totalScore) return true;
  if (existing.titleScore !== score.titleScore) return true;
  if (existing.skillScore !== score.skillScore) return true;
  if (existing.seniorityScore !== score.seniorityScore) return true;
  if (existing.locationScore !== score.locationScore) return true;
  if (existing.keywordScore !== score.keywordScore) return true;
  if ((existing.explanationShort ?? "") !== score.explanationShort) return true;

  const existingMatching = jsonToStringArray(existing.matchingSkills);
  const existingMissing = jsonToStringArray(existing.missingSkills);

  if (JSON.stringify(existingMatching) !== JSON.stringify(score.matchingSkills)) return true;
  if (JSON.stringify(existingMissing) !== JSON.stringify(score.missingSkills)) return true;

  return false;
}

export async function resolveJobMatchForUser(args: {
  userId: string;
  jobId: string;
  resumeProfileId: string;
  now?: Date;
}) {
  const { userId, jobId, resumeProfileId } = args;
  const now = args.now ?? new Date();

  const [profile, job, existing] = await Promise.all([
    prisma.resumeProfile.findFirst({
      where: { id: resumeProfileId, userId },
    }),
    prisma.job.findFirst({
      where: { id: jobId, status: "active" },
    }),
    prisma.jobMatch.findUnique({
      where: {
        resumeProfileId_jobId: {
          resumeProfileId,
          jobId,
        },
      },
    }),
  ]);

  if (!profile) {
    return {
      ok: false as const,
      status: 404,
      error: "Resume profile not found",
    };
  }

  if (!job) {
    return {
      ok: false as const,
      status: 404,
      error: "Job not found",
    };
  }

  const scoringProfile = buildScoringProfile(profile);
  if (!scoringProfile) {
    return {
      ok: false as const,
      status: 500,
      error: "Could not build scoring profile",
    };
  }

  const stale = isMatchStale({
    existing,
    profileUpdatedAt: profile.updatedAt,
    jobUpdatedAt: job.updatedAt,
    now,
  });

  const score = scoreResumeToJob(scoringProfile, job);
  const changed = didStoredMatchChange({ existing, score });
  const shouldRefresh = stale || changed;

  const result = shouldRefresh
    ? await prisma.jobMatch.upsert({
        where: {
          resumeProfileId_jobId: {
            resumeProfileId,
            jobId,
          },
        },
        create: {
          userId,
          resumeProfileId,
          jobId,
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
          computedAt: now,
        },
      })
    : existing;

  return {
    ok: true as const,
    status: 200,
    stale: shouldRefresh,
    usedCache: !shouldRefresh,
    item: result,
  };
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await context.params;
  const resumeProfileId = new URL(request.url).searchParams.get("resumeProfileId");

  if (!resumeProfileId) {
    return NextResponse.json({ ok: false, error: "Missing resumeProfileId" }, { status: 400 });
  }

  const result = await resolveJobMatchForUser({
    userId,
    jobId,
    resumeProfileId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    item: result.item,
  });
}
