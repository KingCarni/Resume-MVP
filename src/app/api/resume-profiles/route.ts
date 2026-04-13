import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  buildResumeProfile,
  rebuildResumeProfile,
  upsertLatestResumeProfileForUser,
} from "@/lib/resumeProfiles/buildProfile";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResumeProfileCreateBody = {
  title?: string | null;
  rawText?: string | null;
  summary?: string | null;
  sourceDocumentId?: string | null;
  skills?: string[];
  titles?: string[];
  certifications?: string[];
  industries?: string[];
  keywords?: string[];
  yearsExperience?: number | null;
  seniority?: string | null;
  replaceLatest?: boolean;
  autoMode?: boolean;
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

function jsonToStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function GET() {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await prisma.resumeProfile.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      seniority: true,
      yearsExperience: true,
      updatedAt: true,
      normalizedSkills: true,
      normalizedTitles: true,
      sourceDocumentId: true,
    },
  });

  const items = profiles.map((profile) => ({
    ...profile,
    normalizedSkills: jsonToStringArray(profile.normalizedSkills),
    normalizedTitles: jsonToStringArray(profile.normalizedTitles),
    skillsCount: jsonToStringArray(profile.normalizedSkills).length,
    titlesCount: jsonToStringArray(profile.normalizedTitles).length,
  }));

  return NextResponse.json({ ok: true, items });
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ResumeProfileCreateBody;

  if (!body.rawText?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing rawText" }, { status: 400 });
  }

  const baseInput = {
    userId,
    title: body.title,
    rawText: body.rawText,
    summary: body.summary,
    sourceDocumentId: body.sourceDocumentId,
    skills: body.skills,
    titles: body.titles,
    certifications: body.certifications,
    industries: body.industries,
    keywords: body.keywords,
    yearsExperience: body.yearsExperience,
    seniority: body.seniority,
  };

  if (body.autoMode) {
    const item = await upsertLatestResumeProfileForUser(baseInput);
    return NextResponse.json({ ok: true, item });
  }

  if (body.replaceLatest) {
    const latest = await prisma.resumeProfile.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (latest) {
      const item = await rebuildResumeProfile(latest.id, baseInput);
      return NextResponse.json({ ok: true, item });
    }
  }

  const item = await buildResumeProfile(baseInput);
  return NextResponse.json({ ok: true, item });
}
