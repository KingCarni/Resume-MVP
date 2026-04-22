
import { DocumentType, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { buildResumeProfile, rebuildResumeProfile } from "@/lib/resumeProfiles/buildProfile";
import { sanitizeResumeSourceMeta, sanitizeStructuredResumeSnapshot } from "@/lib/resumeProfiles/structuredResume";
import { normalizeLegacyResumeTemplateId } from "@/lib/templates/resumeTemplates";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncBody = {
  profileId?: string | null;
  title?: string | null;
  summary?: string | null;
  rawText?: string | null;
  html?: string | null;
  template?: string | null;
  skills?: string[];
  titles?: string[];
  keywords?: string[];
  yearsExperience?: number | null;
  seniority?: string | null;
  structuredData?: unknown;
  sourceMeta?: unknown;
};

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;
  if (!userEmail) return null;
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } });
  return user?.id ?? null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
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
  sourceDocumentId: string | null;
}) {
  const normalizedSkills = toStringArray(profile.normalizedSkills);
  const normalizedTitles = toStringArray(profile.normalizedTitles);
  const keywords = toStringArray(profile.keywords);
  return {
    id: profile.id,
    title: profile.title,
    summary: profile.summary,
    seniority: String(profile.seniority),
    yearsExperience: profile.yearsExperience,
    updatedAt: profile.updatedAt,
    sourceDocumentId: profile.sourceDocumentId,
    normalizedSkills,
    normalizedTitles,
    keywords,
    skillsCount: normalizedSkills.length,
    titlesCount: normalizedTitles.length,
  };
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SyncBody | null;
  const profileId = String(body?.profileId ?? "").trim();
  const structuredData = sanitizeStructuredResumeSnapshot(body?.structuredData);
  const templateMigration = normalizeLegacyResumeTemplateId(body?.template);
  const normalizedTemplate = templateMigration.resolvedLegacyId;
  const sourceMeta = sanitizeResumeSourceMeta(body?.sourceMeta);
  const structuredDataValue: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = structuredData
    ? (structuredData as Prisma.InputJsonValue)
    : Prisma.JsonNull;
  const existingProfile = await prisma.resumeProfile.findFirst({
    where: profileId ? { userId, id: profileId } : { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      summary: true,
      sourceDocumentId: true,
      normalizedSkills: true,
      normalizedTitles: true,
      keywords: true,
      yearsExperience: true,
      seniority: true,
    },
  });

  const existingSourceDocument = existingProfile?.sourceDocumentId
    ? await prisma.document.findFirst({
        where: { id: existingProfile.sourceDocumentId, userId, type: DocumentType.resume },
        select: {
          id: true,
          title: true,
          template: true,
          html: true,
          text: true,
          structuredData: true,
          sourceFileName: true,
          sourceMimeType: true,
          sourceFileExtension: true,
          sourceKind: true,
        },
      })
    : null;

  const latestResumeDocument = await prisma.document.findFirst({
    where: { userId, type: DocumentType.resume },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      template: true,
      html: true,
      text: true,
      structuredData: true,
      sourceFileName: true,
      sourceMimeType: true,
      sourceFileExtension: true,
      sourceKind: true,
    },
  });

  const recoveredDocument =
    existingSourceDocument && String(existingSourceDocument.text ?? "").trim().length >= 120
      ? existingSourceDocument
      : latestResumeDocument && String(latestResumeDocument.text ?? "").trim().length >= 120
        ? latestResumeDocument
        : existingSourceDocument ?? latestResumeDocument;

  const rawText = String(body?.rawText ?? "").trim() || String(recoveredDocument?.text ?? "").trim();
  if (rawText.length < 120) {
    return NextResponse.json({ ok: false, error: "Resume text too short to sync" }, { status: 400 });
  }

  const nextTitle = String(body?.title ?? existingProfile?.title ?? recoveredDocument?.title ?? "").trim() || null;
  const nextSummary = body?.summary !== undefined ? String(body.summary ?? "").trim() || null : existingProfile?.summary ?? null;
  const nextSkills = toStringArray(body?.skills).length ? toStringArray(body?.skills) : toStringArray(existingProfile?.normalizedSkills);
  const nextTitles = toStringArray(body?.titles).length ? toStringArray(body?.titles) : toStringArray(existingProfile?.normalizedTitles);
  const nextKeywords = toStringArray(body?.keywords).length ? toStringArray(body?.keywords) : toStringArray(existingProfile?.keywords);
  const nextYearsExperience = body?.yearsExperience ?? existingProfile?.yearsExperience ?? null;
  const nextSeniority = body?.seniority ?? (existingProfile ? String(existingProfile.seniority) : null);

  let sourceDocumentId = existingProfile?.sourceDocumentId ?? recoveredDocument?.id ?? null;
  const documentData = {
    title: nextTitle,
    template: normalizedTemplate || recoveredDocument?.template || null,
    html: String(body?.html ?? "").trim() || String(recoveredDocument?.html ?? "").trim() || null,
    text: rawText,
    structuredData: structuredData ? structuredDataValue : ((recoveredDocument?.structuredData as Prisma.InputJsonValue | null) ?? Prisma.JsonNull),
    sourceFileName: sourceMeta?.fileName ?? recoveredDocument?.sourceFileName ?? null,
    sourceMimeType: sourceMeta?.mimeType ?? recoveredDocument?.sourceMimeType ?? null,
    sourceFileExtension: sourceMeta?.extension ?? recoveredDocument?.sourceFileExtension ?? null,
    sourceKind: sourceMeta?.sourceKind ?? recoveredDocument?.sourceKind ?? null,
  };

  if (sourceDocumentId) {
    await prisma.document.updateMany({
      where: { id: sourceDocumentId, userId, type: DocumentType.resume },
      data: documentData,
    });
  } else {
    const createdDocument = await prisma.document.create({
      data: {
        userId,
        type: DocumentType.resume,
        ...documentData,
      },
      select: { id: true },
    });
    sourceDocumentId = createdDocument.id;
  }

  const buildInput = {
    userId,
    sourceDocumentId,
    title: nextTitle,
    summary: nextSummary,
    rawText,
    skills: nextSkills,
    titles: nextTitles,
    keywords: nextKeywords,
    yearsExperience: nextYearsExperience,
    seniority: nextSeniority,
  };

  const item = existingProfile
    ? await rebuildResumeProfile(existingProfile.id, buildInput)
    : await buildResumeProfile(buildInput);

  return NextResponse.json({ ok: true, item: formatProfileItem(item), templateMigration });
}
