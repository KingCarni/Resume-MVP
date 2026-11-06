import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listJobs } from "@/lib/jobs/queries";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNullableInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function toIsoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : date.toISOString();
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

export async function GET(request: NextRequest) {
  try {
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
    const targetPosition = searchParams.get("targetPosition");
    const sort =
      (searchParams.get("sort") as "match" | "newest" | "salary" | null) ??
      "match";
    const page = parseNullableInt(searchParams.get("page"));
    const pageSize = parseNullableInt(searchParams.get("pageSize"));

    const result = await listJobs({
      userId,
      resumeProfileId,
      q,
      remote,
      location,
      seniority,
      minSalary,
      targetPosition,
      sort,
      page,
      pageSize,
    });

    return NextResponse.json({
      ok: true,
      items: result.jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        remoteType: job.remoteType,
        seniority: job.seniority,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        postedAt: toIsoOrNull(job.postedAt),
        createdAt: toIsoOrNull(job.createdAt),
        status: job.status,
        titleNormalized: job.titleNormalized,
        locationNormalized: job.locationNormalized,
        companyNormalized: job.companyNormalized,
        source: job.source
          ? { slug: job.source.slug, name: job.source.name }
          : { slug: "unknown", name: "Unknown" },
        application: job.application
          ? {
              status: job.application.status,
              appliedAt: toIsoOrNull(job.application.appliedAt),
              updatedAt: toIsoOrNull(job.application.updatedAt),
            }
          : null,
        match: job.matchScore != null
          ? {
              totalScore: job.matchScore,
              explanationShort: job.explanationShort ?? null,
              matchingSkills: job.matchingSkills ?? [],
              missingSkills: job.missingSkills ?? [],
              computedAt: toIsoOrNull(job.updatedAt),
            }
          : null,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      usedFallback: result.usedFallback,
      warmup: result.warmup,
    });
  } catch (error) {
    console.error("GET /api/jobs failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load jobs.",
      },
      { status: 500 },
    );
  }
}
