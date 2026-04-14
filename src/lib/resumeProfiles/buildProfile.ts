import { prisma } from "@/lib/prisma";
import {
  normalizeResumeProfile,
  ResumeNormalizationInput,
} from "@/lib/resumeProfiles/normalizeResume";

export type BuildResumeProfileInput = ResumeNormalizationInput & {
  userId: string;
  sourceDocumentId?: string | null;
};

type NormalizedResumeProfile = ReturnType<typeof normalizeResumeProfile>;

const TITLE_STOP_WORDS = new Set([
  "resume",
  "cv",
  "profile",
  "document",
  "untitled",
  "your name",
  "skills",
  "experience",
  "job experience",
  "areas of expertise",
]);

const TITLE_NOISE_PATTERNS = [
  /\b(job experience|areas of expertise|key metrics|skills|resume|profile)\b/i,
  /^[A-Z\s&/+.-]{12,}$/,
  /\b(?:pdfjs|mammoth)\b/i,
];

const GENERIC_SINGLE_WORD_TITLES = new Set([
  "engineer",
  "developer",
  "manager",
  "designer",
  "analyst",
  "architect",
  "administrator",
  "specialist",
  "consultant",
  "coordinator",
  "scientist",
  "tester",
  "technician",
  "artist",
  "producer",
  "programmer",
  "animator",
]);

const CORE_ROLE_PATTERNS = [
  /\bsoftware engineer\b/i,
  /\bsoftware developer\b/i,
  /\bsoftware design engineer\b/i,
  /\bfull(?:-|\s)?stack software engineer\b/i,
  /\bgame engineer\b/i,
  /\bgame developer\b/i,
  /\bgameplay engineer\b/i,
  /\bgameplay programmer\b/i,
  /\bengine programmer\b/i,
  /\bengine developer\b/i,
  /\btools programmer\b/i,
  /\btools engineer\b/i,
  /\bqa engineer\b/i,
  /\bqa tester\b/i,
  /\btest engineer\b/i,
];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function uniqueTitles(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value.trim());
  }

  return output;
}

function stripResumeSuffix(value: string) {
  return value
    .replace(/\.(pdf|docx|doc|txt)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCandidateTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = stripResumeSuffix(value);
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (TITLE_STOP_WORDS.has(lower)) return null;
  if (/^[a-z\s]+$/.test(lower) && lower.length <= 8) return null;
  if (/\d{4}/.test(cleaned)) return null;
  if (TITLE_NOISE_PATTERNS.some((pattern) => pattern.test(cleaned))) return null;

  return cleaned;
}

function normalizeTitleVariant(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(intern|internship|new grad|graduate|junior|jr)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function seniorityRank(value: string) {
  const lower = value.toLowerCase();

  if (/\b(entry|intern|internship|graduate|new grad|junior|jr)\b/.test(lower)) return 0;
  if (/\b(mid|intermediate)\b/.test(lower)) return 1;
  if (/\b(senior|sr)\b/.test(lower)) return 2;
  if (/\b(lead|staff|principal)\b/.test(lower)) return 3;
  if (/\b(manager|head|director|vp|vice president|chief|cto|cpo|ceo)\b/.test(lower)) return 4;

  return 1;
}

function titleSpecificityScore(value: string) {
  const lower = value.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  let score = 0;

  if (
    /\b(qa|quality assurance|sdet|test|automation|engineer|developer|designer|artist|producer|analyst|programmer|manager|administrator|architect|scientist|specialist|consultant|coordinator|technician|support|security|product|project|program|data|devops|cloud|platform|reliability|operations|network|system|ux|ui|game|gameplay|level|narrative|economy|technical|frontend|backend|full stack|fullstack|mobile|ios|android|unity|unreal|community|insights|software|full-stack|tools|engine)\b/.test(lower)
  ) {
    score += 4;
  }

  if (CORE_ROLE_PATTERNS.some((pattern) => pattern.test(value))) {
    score += 5;
  }

  if (words.length >= 2 && words.length <= 5) {
    score += 3;
  }

  if (/\b(full-stack|software|tools|engine|gameplay|qa|platform|support|devops|unity|technical)\b/.test(lower)) {
    score += 2;
  }

  if (/\b(intern|internship|new grad|graduate|junior|jr)\b/.test(lower)) {
    score -= 5;
  }

  if (/\b(lead|principal|manager|director|head|chief|vp)\b/.test(lower)) {
    score -= 2;
  }

  if (words.length === 1 && GENERIC_SINGLE_WORD_TITLES.has(words[0])) {
    score -= 4;
  }

  if (value.length > 48) score -= 2;
  if (value.length < 4) score -= 2;

  return score;
}

function candidateTitleSupportScore(value: string, allTitles: string[]) {
  const lower = value.toLowerCase();
  const normalizedVariant = normalizeTitleVariant(value);
  let score = 0;

  const exactRepeats = allTitles.filter((title) => title.toLowerCase() === lower).length;
  score += exactRepeats * 4;

  const variantSupport = allTitles.filter((title) => normalizeTitleVariant(title) === normalizedVariant).length;
  score += variantSupport * 3;

  if (!/\b(intern|internship|new grad|graduate|junior|jr)\b/.test(lower) && variantSupport > exactRepeats) {
    score += 4;
  }

  return score;
}

function pickSaferProfileTitle(input: BuildResumeProfileInput, normalized: NormalizedResumeProfile) {
  const explicitTitle = cleanCandidateTitle((input as { title?: unknown }).title);
  const rawTitles = toStringArray((input as { titles?: unknown }).titles)
    .map(cleanCandidateTitle)
    .filter(Boolean) as string[];
  const normalizedTitles = toStringArray((normalized as { normalizedTitles?: unknown }).normalizedTitles)
    .map(cleanCandidateTitle)
    .filter(Boolean) as string[];

  const candidatePool = uniqueTitles([
    ...rawTitles,
    ...normalizedTitles,
    ...(explicitTitle ? [explicitTitle] : []),
  ]);

  if (candidatePool.length > 0) {
    return [...candidatePool].sort((left, right) => {
      const leftScore = titleSpecificityScore(left) + candidateTitleSupportScore(left, candidatePool);
      const rightScore = titleSpecificityScore(right) + candidateTitleSupportScore(right, candidatePool);
      if (leftScore !== rightScore) return rightScore - leftScore;

      const seniorityDiff = seniorityRank(left) - seniorityRank(right);
      if (seniorityDiff !== 0) return seniorityDiff * 4;

      return left.length - right.length;
    })[0];
  }

  return explicitTitle || "Resume Profile";
}

function buildProfilePayload(input: BuildResumeProfileInput) {
  const normalized = normalizeResumeProfile(input) as NormalizedResumeProfile;

  return {
    userId: input.userId,
    sourceDocumentId: input.sourceDocumentId ?? null,
    title: pickSaferProfileTitle(input, normalized),
    rawText: normalized.rawText,
    summary: normalized.summary,
    normalizedSkills: normalized.normalizedSkills,
    normalizedTitles: normalized.normalizedTitles,
    certifications: normalized.certifications,
    industries: normalized.industries,
    keywords: normalized.keywords,
    yearsExperience: normalized.yearsExperience,
    seniority: normalized.seniority,
  };
}

export async function buildResumeProfile(input: BuildResumeProfileInput) {
  return prisma.resumeProfile.create({
    data: buildProfilePayload(input),
  });
}

export async function rebuildResumeProfile(resumeProfileId: string, input: BuildResumeProfileInput) {
  return prisma.resumeProfile.update({
    where: { id: resumeProfileId },
    data: buildProfilePayload(input),
  });
}

export async function upsertLatestResumeProfileForUser(input: BuildResumeProfileInput) {
  if (input.sourceDocumentId) {
    const existingForDocument = await prisma.resumeProfile.findFirst({
      where: {
        userId: input.userId,
        sourceDocumentId: input.sourceDocumentId,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existingForDocument) {
      return rebuildResumeProfile(existingForDocument.id, input);
    }
  }

  const rawText = typeof input.rawText === "string" ? input.rawText.trim() : "";
  if (rawText) {
    const existingForText = await prisma.resumeProfile.findFirst({
      where: {
        userId: input.userId,
        rawText,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existingForText) {
      return rebuildResumeProfile(existingForText.id, input);
    }
  }

  return buildResumeProfile(input);
}

export type StoredResumeProfileRebuildSource = {
  userId: string;
  sourceDocumentId?: string | null;
  sourceDocument?: {
    title?: string | null;
    text?: string | null;
  } | null;
  title?: string | null;
  rawText?: string | null;
  summary?: string | null;
  normalizedSkills?: string[];
  normalizedTitles?: string[];
  certifications?: string[];
  industries?: string[];
  keywords?: string[];
  yearsExperience?: number | null;
  seniority?: string | null;
};

export function createRebuildInputFromStoredProfile(
  profile: StoredResumeProfileRebuildSource,
): BuildResumeProfileInput | null {
  const nextRawText = profile.sourceDocument?.text?.trim() || profile.rawText?.trim() || "";
  if (!nextRawText) return null;

  const nextTitle = profile.sourceDocument?.title?.trim() || profile.title?.trim() || null;

  return {
    userId: profile.userId,
    sourceDocumentId: profile.sourceDocumentId ?? null,
    title: nextTitle,
    rawText: nextRawText,
    summary: profile.summary ?? null,
    skills: toStringArray(profile.normalizedSkills),
    titles: toStringArray(profile.normalizedTitles),
    certifications: toStringArray(profile.certifications),
    industries: toStringArray(profile.industries),
    keywords: toStringArray(profile.keywords),
    yearsExperience: profile.yearsExperience ?? null,
    seniority: profile.seniority ?? null,
  };
}
