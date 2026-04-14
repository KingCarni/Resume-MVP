import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createRebuildInputFromStoredProfile,
  rebuildResumeProfile,
} from "@/lib/resumeProfiles/buildProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RebuildBody = {
  profileId?: string | null;
  rebuildAll?: boolean;
};

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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function formatRebuiltProfile(profile: {
  id: string;
  title: string | null;
  summary: string | null;
  seniority: unknown;
  yearsExperience: number | null;
  normalizedSkills: unknown;
  normalizedTitles: unknown;
  keywords: unknown;
  updatedAt: Date;
}) {
  return {
    id: profile.id,
    title: profile.title,
    summary: profile.summary,
    seniority: String(profile.seniority),
    yearsExperience: profile.yearsExperience,
    normalizedSkills: toStringArray(profile.normalizedSkills),
    normalizedTitles: toStringArray(profile.normalizedTitles),
    keywords: toStringArray(profile.keywords),
    updatedAt: profile.updatedAt,
  };
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RebuildBody;
  const profileId = String(body.profileId ?? "").trim();

  if (!body.rebuildAll && !profileId) {
    return NextResponse.json(
      { ok: false, error: "Provide profileId or rebuildAll=true" },
      { status: 400 },
    );
  }

  const profiles = await prisma.resumeProfile.findMany({
    where: body.rebuildAll
      ? { userId }
      : { userId, id: profileId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userId: true,
      sourceDocumentId: true,
      title: true,
      rawText: true,
      summary: true,
      normalizedSkills: true,
      normalizedTitles: true,
      certifications: true,
      industries: true,
      keywords: true,
      yearsExperience: true,
      seniority: true,
      sourceDocument: {
        select: {
          title: true,
          text: true,
        },
      },
    },
  });

  if (!profiles.length) {
    return NextResponse.json({ ok: false, error: "Resume profile not found" }, { status: 404 });
  }

  const rebuilt = [];
  const skipped = [];

  for (const profile of profiles) {
    const rebuildInput = createRebuildInputFromStoredProfile({
      userId: profile.userId,
      sourceDocumentId: profile.sourceDocumentId,
      sourceDocument: profile.sourceDocument,
      title: profile.title,
      rawText: profile.rawText,
      summary: profile.summary,
      normalizedSkills: toStringArray(profile.normalizedSkills),
      normalizedTitles: toStringArray(profile.normalizedTitles),
      certifications: toStringArray(profile.certifications),
      industries: toStringArray(profile.industries),
      keywords: toStringArray(profile.keywords),
      yearsExperience: profile.yearsExperience,
      seniority: String(profile.seniority),
    });

    if (!rebuildInput) {
      skipped.push({ id: profile.id, reason: "No stored resume source available" });
      continue;
    }

    const before = formatRebuiltProfile(profile);
    const afterProfile = await rebuildResumeProfile(profile.id, rebuildInput);
    const after = formatRebuiltProfile(afterProfile);

    rebuilt.push({
      id: profile.id,
      before,
      after,
      diff: {
        skillsBefore: before.normalizedSkills.length,
        skillsAfter: after.normalizedSkills.length,
        titlesBefore: before.normalizedTitles.length,
        titlesAfter: after.normalizedTitles.length,
        keywordsBefore: before.keywords.length,
        keywordsAfter: after.keywords.length,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    rebuilt,
    skipped,
    rebuiltCount: rebuilt.length,
    skippedCount: skipped.length,
  });
}
