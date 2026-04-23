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



type ResumeDocumentPayload = {
  id: string;
  title: string | null;
  createdAt: Date;
  text?: string | null;
  html?: string | null;
  structuredData?: unknown;
  sourceFileName?: string | null;
  sourceMimeType?: string | null;
  sourceFileExtension?: string | null;
  sourceKind?: string | null;
};
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

function formatResumeDocument(document: ResumeDocumentPayload) {
  return {
    id: document.id,
    title: document.title,
    createdAt: document.createdAt,
    text: typeof document.text === "string" ? document.text : null,
    html: typeof document.html === "string" ? document.html : null,
    structuredData: document.structuredData ?? null,
    sourceFileName: document.sourceFileName ?? null,
    sourceMimeType: document.sourceMimeType ?? null,
    sourceFileExtension: document.sourceFileExtension ?? null,
    sourceKind: document.sourceKind ?? null,
  };
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
  sourceDocument?: ResumeDocumentPayload | null;
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
    sourceDocument: profile.sourceDocument ? formatResumeDocument(profile.sourceDocument) : null,
  };
}

async function backfillMissingResumeAttachments(userId: string) {
  const profiles = await prisma.resumeProfile.findMany({
    where: {
      userId,
      sourceDocumentId: null,
      rawText: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      rawText: true,
    },
  });

  const candidates = profiles.filter((profile) => String(profile.rawText ?? "").trim().length >= 120);
  if (!candidates.length) return;

  for (const profile of candidates) {
    const rawText = String(profile.rawText ?? "").trim();
    const document = await prisma.document.create({
      data: {
        userId,
        type: DocumentType.resume,
        title: profile.title || "Resume Profile",
        text: rawText,
        html: null,
        template: null,
        sourceKind: "resume_profile_backfill",
      },
      select: { id: true },
    });

    await prisma.resumeProfile.update({
      where: { id: profile.id },
      data: { sourceDocumentId: document.id },
    });
  }
}

export async function GET() {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const loadPayload = async () => {
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
              text: true,
              html: true,
              structuredData: true,
              sourceFileName: true,
              sourceMimeType: true,
              sourceFileExtension: true,
              sourceKind: true,
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
          text: true,
          html: true,
          structuredData: true,
          sourceFileName: true,
          sourceMimeType: true,
          sourceFileExtension: true,
          sourceKind: true,
        },
      }),
    ]);

    return {
      items: profiles.map(formatProfileItem),
      resumeDocuments: resumeDocuments.map(formatResumeDocument),
    };
  };

  let payload = await loadPayload();
  if (!payload.resumeDocuments.length && payload.items.some((item) => item.rawTextLength >= 120 && !item.sourceDocumentId)) {
    await backfillMissingResumeAttachments(userId);
    payload = await loadPayload();
  }

  return NextResponse.json({ ok: true, items: payload.items, resumeDocuments: payload.resumeDocuments });
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

  if (body.keywords !== undefined) {
    data.keywords = cleanTagArray(body.keywords);
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

  const currentSkills = cleanTagArray(jsonToStringArray(existing.normalizedSkills));
  const currentTitles = cleanTagArray(jsonToStringArray(existing.normalizedTitles));
  const currentKeywords = cleanTagArray(jsonToStringArray(existing.keywords));

  const nextSkills = Array.isArray(data.normalizedSkills)
    ? cleanTagArray(data.normalizedSkills as string[])
    : currentSkills;
  const nextTitles = Array.isArray(data.normalizedTitles)
    ? cleanTagArray(data.normalizedTitles as string[])
    : currentTitles;
  const nextKeywords = Array.isArray(data.keywords)
    ? cleanTagArray(data.keywords as string[])
    : currentKeywords;

  const rankingRelevantChanged =
    JSON.stringify(currentSkills) !== JSON.stringify(nextSkills) ||
    JSON.stringify(currentTitles) !== JSON.stringify(nextTitles) ||
    JSON.stringify(currentKeywords) !== JSON.stringify(nextKeywords);

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

  if (rankingRelevantChanged) {
    await markJobMatchWarmupStale({
      userId,
      resumeProfileId: id,
      reason: "Profile match metadata changed",
    });
  }

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
