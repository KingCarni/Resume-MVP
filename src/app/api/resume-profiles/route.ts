import { DocumentType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  buildResumeProfile,
  rebuildResumeProfile,
  upsertLatestResumeProfileForUser,
} from "@/lib/resumeProfiles/buildProfile";
import { prisma } from "@/lib/prisma";
import { markJobMatchWarmupStale } from "@/lib/jobs/warmup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResumeProfileCreateBody = {
  id?: string | null;
  title?: string | null;
  rawText?: string | null;
  summary?: string | null;
  sourceDocumentId?: string | null;
  skills?: string[];
  titles?: string[];
  normalizedSkills?: string[];
  normalizedTitles?: string[];
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

function normalizeTagValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanTagArray(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeTagValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function formatProfileItem(profile: {
  id: string;
  title: string | null;
  summary: string | null;
  seniority: unknown;
  yearsExperience: number | null;
  updatedAt: Date;
  normalizedSkills: unknown;
  normalizedTitles: unknown;
  keywords: unknown;
  rawText?: string | null;
  sourceDocumentId: string | null;
  sourceDocument?: { id: string; title: string | null; createdAt: Date } | null;
}) {
  const normalizedSkills = jsonToStringArray(profile.normalizedSkills);
  const normalizedTitles = jsonToStringArray(profile.normalizedTitles);
  const keywords = jsonToStringArray(profile.keywords);

  return {
    ...profile,
    seniority: String(profile.seniority),
    normalizedSkills,
    normalizedTitles,
    keywords,
    rawTextLength: typeof profile.rawText === "string" ? profile.rawText.length : 0,
    skillsCount: normalizedSkills.length,
    titlesCount: normalizedTitles.length,
    sourceDocument: profile.sourceDocument
      ? {
          id: profile.sourceDocument.id,
          title: profile.sourceDocument.title,
          createdAt: profile.sourceDocument.createdAt,
        }
      : null,
  };
}

export async function GET() {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [profiles, resumeDocuments] = await Promise.all([
    prisma.resumeProfile.findMany({
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
        keywords: true,
        rawText: true,
        sourceDocumentId: true,
        sourceDocument: {
          select: {
            id: true,
            title: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.document.findMany({
      where: {
        userId,
        type: DocumentType.resume,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    }),
  ]);

  const items = profiles.map(formatProfileItem);

  return NextResponse.json({ ok: true, items, resumeDocuments });
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

export async function PATCH(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ResumeProfileCreateBody;
  const id = String(body.id ?? "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing profile id" }, { status: 400 });
  }

  const existing = await prisma.resumeProfile.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      summary: true,
      seniority: true,
      yearsExperience: true,
      updatedAt: true,
      normalizedSkills: true,
      normalizedTitles: true,
      keywords: true,
      sourceDocumentId: true,
      sourceDocument: {
        select: {
          id: true,
          title: true,
          createdAt: true,
        },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Resume profile not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const nextTitle = String(body.title ?? "").trim();
    if (!nextTitle) {
      return NextResponse.json({ ok: false, error: "Profile title cannot be blank" }, { status: 400 });
    }
    data.title = nextTitle;
  }

  const nextSkillsSource = body.normalizedSkills ?? body.skills;
  if (nextSkillsSource !== undefined) {
    data.normalizedSkills = cleanTagArray(nextSkillsSource);
  }

  const nextTitlesSource = body.normalizedTitles ?? body.titles;
  if (nextTitlesSource !== undefined) {
    data.normalizedTitles = cleanTagArray(nextTitlesSource);
  }

  if (body.sourceDocumentId !== undefined) {
    const nextSourceDocumentId = String(body.sourceDocumentId ?? "").trim();

    if (!nextSourceDocumentId) {
      data.sourceDocumentId = null;
    } else {
      const sourceDocument = await prisma.document.findFirst({
        where: {
          id: nextSourceDocumentId,
          userId,
          type: DocumentType.resume,
        },
        select: { id: true },
      });

      if (!sourceDocument) {
        return NextResponse.json(
          { ok: false, error: "Resume document not found for this account" },
          { status: 400 },
        );
      }

      data.sourceDocumentId = sourceDocument.id;
    }
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ ok: false, error: "No profile changes submitted" }, { status: 400 });
  }

  const item = await prisma.resumeProfile.update({
    where: { id },
    data,
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
      sourceDocument: {
        select: {
          id: true,
          title: true,
          createdAt: true,
        },
      },
    },
  });

  await markJobMatchWarmupStale({
    userId,
    resumeProfileId: id,
  });

  return NextResponse.json({ ok: true, item: formatProfileItem(item) });
}


export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing profile id" }, { status: 400 });
  }

  const existing = await prisma.resumeProfile.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Resume profile not found" }, { status: 404 });
  }

  await prisma.resumeProfile.delete({ where: { id } });

  return NextResponse.json({ ok: true, deletedId: id });
}
