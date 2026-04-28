// src/app/api/analyze/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";
import { computeVerbStrength } from "@/lib/verb_strength";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, getCreditBalance, refundCredits } from "@/lib/credits";
import { detectGameRole, detectRoleAndMissingTerms } from "@/lib/ats";
import { upsertLatestResumeProfileForUser } from "@/lib/resumeProfiles/buildProfile";
import {
  parseResumeDocument,
  toResumeParserCompatibilityOutput,
  type ParsedResumeDocument,
  type ResumeParserCompatibilityOutput,
  type ResumeParserExtractor,
} from "@/lib/resumeParser";

import { ocrPdfWithGoogleVision } from "@/lib/pdf_ocr_google";
import { assessPdfTextQuality } from "@/lib/pdf_quality";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BOOT_TAG = "analyze_route_boot_ok";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const PDF_WEIRD_WARNING = "PDF looks weird; DOCX recommended â€” weâ€™ll still try to extract.";

type ResumeBullet = {
  id: string;
  text: string;
  jobId?: string;
};

type AtsCategoryKey = "titles" | "core" | "tools" | "methods" | "domain" | "outcomes";
type AtsCategoryBuckets = Record<AtsCategoryKey, string[]>;

type AtsRoleScore = {
  roleKey: string;
  roleName: string;
  score: number;
  matchedTerms: number;
  categoryCoverage: Record<AtsCategoryKey, number>;
};

type AtsHit = {
  roleKey: string;
  roleName: string;
  category: AtsCategoryKey;
  term: string;
  count: number;
  weight: number;
  score: number;
};

type JobsAnalyticsMode = "resume" | "cover_letter" | "apply_pack" | "browse";

type JobsAnalyticsContext = {
  jobId: string;
  resumeProfileId?: string;
  sourceSlug?: string;
  company?: string;
  jobTitle?: string;
  mode?: JobsAnalyticsMode;
  bundleSessionId?: string;
};

function cleanOptionalString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function resolveResumeParserExtractor(args: {
  parserUsed: "pdfjs" | "vision_ocr" | "mammoth" | "txt" | "unknown";
  detectedType: string;
}): ResumeParserExtractor {
  if (args.parserUsed === "pdfjs") return "pdf_text";
  if (args.parserUsed === "vision_ocr") return "ocr_google_vision";
  if (args.parserUsed === "mammoth") return "docx_mammoth";
  if (args.parserUsed === "txt") return "plain_text";

  const detected = String(args.detectedType || "").toLowerCase();
  if (detected === "pdf") return "pdf_text";
  if (detected === "docx" || detected === "doc") return "docx_mammoth";
  if (detected === "txt") return "plain_text";

  return "unknown";
}

function formatResumeParserWarnings(parserOutput: ResumeParserCompatibilityOutput | null) {
  return (parserOutput?.parserDiagnostics?.warnings || [])
    .map((warning) => String(warning?.message || "").trim())
    .filter(Boolean);
}

function buildResumeParserDebug(parserOutput: ResumeParserCompatibilityOutput | null) {
  if (!parserOutput) return null;

  return {
    confidence: parserOutput.parserDiagnostics.confidence,
    quality: parserOutput.parserDiagnostics.quality,
    warningCount: parserOutput.parserDiagnostics.warnings.length,
    warnings: parserOutput.parserDiagnostics.warnings.map((warning) => ({
      code: warning.code,
      severity: warning.severity,
      message: warning.message,
    })),
    sectionKinds: Object.keys(parserOutput.sections || {}),
    jobsDetected: parserOutput.jobs.length,
    bulletsDetected: parserOutput.bullets.length,
  };
}

function buildJobsAnalyticsContext(input: {
  jobId?: unknown;
  resumeProfileId?: unknown;
  sourceSlug?: unknown;
  company?: unknown;
  jobTitle?: unknown;
  mode?: unknown;
  bundleSessionId?: unknown;
}) {
  const jobId = cleanOptionalString(input.jobId);
  if (!jobId) return null;

  const modeRaw = cleanOptionalString(input.mode);
  const mode: JobsAnalyticsMode | undefined =
    modeRaw === "apply_pack" || modeRaw === "cover_letter" || modeRaw === "browse" || modeRaw === "resume"
      ? modeRaw
      : "resume";

  return {
    jobId,
    resumeProfileId: cleanOptionalString(input.resumeProfileId),
    sourceSlug: cleanOptionalString(input.sourceSlug),
    company: cleanOptionalString(input.company),
    jobTitle: cleanOptionalString(input.jobTitle),
    mode,
    bundleSessionId: cleanOptionalString(input.bundleSessionId),
  } satisfies JobsAnalyticsContext;
}

async function writeJobsAnalyticsEvent(args: {
  userId: string;
  event: string;
  route: string;
  context: JobsAnalyticsContext | null;
  meta?: Record<string, unknown>;
}) {
  if (!args.context?.jobId) return;

  await prisma.event.create({
    data: {
      userId: args.userId,
      type: "analyze",
      metaJson: {
        tag: BOOT_TAG,
        category: "jobs",
        event: args.event,
        route: args.route,
        jobId: args.context.jobId,
        resumeProfileId: args.context.resumeProfileId ?? null,
        sourceSlug: args.context.sourceSlug ?? null,
        company: args.context.company ?? null,
        jobTitle: args.context.jobTitle ?? null,
        mode: args.context.mode ?? null,
        bundleSessionId: args.context.bundleSessionId ?? null,
        ...(typeof args.meta === "object" && args.meta ? toSafeJson(args.meta) : {}),
      },
    },
  });
}

function toSafeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}


const COST_TAILOR_RESUME = 5;
const COST_APPLY_PACK = 8;

function buildJobsChargeConfig(context: JobsAnalyticsContext | null, fallbackMode: JobsAnalyticsMode) {
  const mode = context?.mode === "apply_pack" ? "apply_pack" : fallbackMode;
  const bundleSessionId = cleanOptionalString(context?.bundleSessionId);
  const isApplyPack = mode === "apply_pack" && !!bundleSessionId;

  return {
    mode,
    isApplyPack,
    cost: isApplyPack ? COST_APPLY_PACK : COST_TAILOR_RESUME,
    reason: isApplyPack ? "job_apply_pack" : "job_tailor_resume",
    ref: isApplyPack ? `job_apply_pack:${bundleSessionId}` : undefined,
    bundleSessionId,
  } as const;
}

function okJson(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function normalizeJobText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

async function getCanonicalJobContextText(jobId: string) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      status: "active",
    },
    select: {
      title: true,
      company: true,
      location: true,
      remoteType: true,
      seniority: true,
      employmentType: true,
      description: true,
      requirementsText: true,
      responsibilitiesText: true,
    },
  });

  if (!job) return "";

  return [
    `${job.title} at ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    `Remote type: ${job.remoteType}`,
    `Seniority: ${job.seniority}`,
    `Employment type: ${job.employmentType}`,
    job.description || null,
    job.requirementsText || null,
    job.responsibilitiesText || null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function resolveEffectiveJobsAnalyticsContext(
  context: JobsAnalyticsContext | null,
  currentJobText: string,
  fallbackMode: JobsAnalyticsMode
) {
  const bundleSessionId = cleanOptionalString(context?.bundleSessionId);
  if (!context?.jobId || context?.mode !== "apply_pack" || !bundleSessionId) {
    return {
      context,
      bundleOverrideInvalidated: false,
    } as const;
  }

  const canonicalJobText = await getCanonicalJobContextText(context.jobId);
  const matchesCanonical = !!canonicalJobText && normalizeJobText(canonicalJobText) === normalizeJobText(currentJobText);

  if (matchesCanonical) {
    return {
      context,
      bundleOverrideInvalidated: false,
    } as const;
  }

  return {
    context: {
      ...context,
      mode: fallbackMode,
      bundleSessionId: undefined,
    },
    bundleOverrideInvalidated: true,
  } as const;
}

function normalizeResumeText(input: unknown) {
  const raw = String(input ?? "");
  return normalizePreviewText(raw)
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePreviewText(input: unknown) {
  return String(input ?? "")
    .replace(/\u00e2\u20ac\u00a2|\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a2|\u00ef\u201a\u00b7|\u00ef\u201a\u00a7|\u00e2\u2014\u008f|\u00e2\u2014\u00a6|\u00e2\u2013\u00aa|\u00c2\u00b7/g, "•")
    .replace(/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|\u00e2\u20ac\u2015|\u00e2\u20ac\u2014|\u2013|\u2014/g, "-")
    .replace(/\u00e2\u20ac\u0153|\u00e2\u20ac\u009d/g, '"')
    .replace(/\u00e2\u20ac\u02dc|\u00e2\u20ac\u2122/g, "'")
    .replace(/^[ \t]*(?:[•●◦▪▫·*\-]+[ \t]*){2,}/gm, "• ")
    .replace(/^[ \t]*[•●◦▪▫·*\-]+[ \t]+/gm, "• ");
}

function cleanPreviewText(input: unknown) {
  return normalizePreviewText(input).replace(/\s+/g, " ").trim();
}

function cleanPreviewBullet(input: unknown) {
  return cleanPreviewText(input)
    .replace(/^(?:[•●◦▪▫·*\-]+\s*)+/g, "")
    .trim();
}

function stripTagsToText(html: string) {
  return String(html ?? "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeResumeInput(input: unknown) {
  const s = String(input ?? "");
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(s);
  const stripped = looksHtml ? stripTagsToText(s) : s;
  return normalizeResumeText(stripped);
}

function digitsCount(s: string) {
  const m = String(s || "").match(/\d/g);
  return m ? m.length : 0;
}

function normalizeForContains(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€˜â€™]/g, "'")
    .trim();
}

function looksLikeContactOrReferenceLine(line: string) {
  const l = String(line || "").trim();
  if (!l) return true;

  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlRegex = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
  const linkedinRegex = /\blinkedin\.com\/in\/\S+/i;

  if (emailRegex.test(l)) return true;
  if (linkedinRegex.test(l)) return true;
  if (urlRegex.test(l)) return true;
  if (digitsCount(l) >= 7) return true;
  if (/^references?$/i.test(l)) return true;
  if (/available\s+upon\s+request/i.test(l)) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(l)) return true;
  if (/^(massage therapist|production manager|2\s*nd\s*ad)\b/i.test(l)) return true;

  return false;
}

function filterBadBullets(arr: string[]) {
  return (arr || [])
    .map((b) => String(b || "").trim())
    .filter(Boolean)
    .filter((b) => !looksLikeContactOrReferenceLine(b));
}

function cleanLeadingBulletGarbage(s: string) {
  return String(s || "").replace(/^[\sâ€¢â—\u2022\u00B7oï‚§-]+/g, "").trim();
}

function safeArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

function safeTitleArray(input: Array<string | null | undefined>) {
  return uniqueCaseInsensitive(
    input.map((item) => String(item || "").trim()).filter(Boolean)
  );
}

function buildAutoResumeProfileSummary(args: {
  targetPosition: string;
  parserUsed: string;
  ats?: any;
  highlights?: { gamesShipped?: string[]; keyMetrics?: string[] };
}) {
  const roleName =
    String(args.ats?.detectedResumeRole?.roleName || "").trim() ||
    String(args.ats?.targetRole?.roleName || "").trim() ||
    String(args.targetPosition || "").trim();

  const matchedTerms = safeArray(args.ats?.matchedTerms).slice(0, 4);
  const metricHint = safeArray(args.highlights?.keyMetrics).slice(0, 1);
  const parts: string[] = [];

  if (roleName) parts.push(`${roleName} profile auto-created from resume analysis.`);
  if (matchedTerms.length) parts.push(`Detected strengths: ${matchedTerms.join(", ")}.`);
  if (metricHint.length) parts.push(`Evidence captured: ${metricHint[0]}.`);
  if (args.parserUsed && args.parserUsed !== "unknown") parts.push(`Source parse: ${args.parserUsed}.`);

  return parts.join(" ").trim() || "Auto-created from resume analysis.";
}


function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}


function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function resolveRoleKeyFromTargetPosition(targetPosition: string): string | null {
  const normalized = normalizeJobText(targetPosition);
  if (!normalized) return null;
  const detection = detectGameRole(normalized);
  return detection.primaryRoleKey || null;
}

function buildAtsCategoryScores(args: {
  matchedByCategory?: Partial<AtsCategoryBuckets>;
  missingByCategory?: Partial<AtsCategoryBuckets>;
}) {
  const categories: AtsCategoryKey[] = ["titles", "core", "tools", "methods", "domain", "outcomes"];

  const byCategory: Record<AtsCategoryKey, number> = {
    titles: 0,
    core: 0,
    tools: 0,
    methods: 0,
    domain: 0,
    outcomes: 0,
  };

  for (const category of categories) {
    const matched = safeArray(args.matchedByCategory?.[category]);
    const missing = safeArray(args.missingByCategory?.[category]);
    const total = matched.length + missing.length;
    byCategory[category] = pct(matched.length, total);
  }

  return byCategory;
}

function buildOverallAtsScore(categoryScores: Record<AtsCategoryKey, number>) {
  const weights: Record<AtsCategoryKey, number> = {
    titles: 5,
    core: 4,
    tools: 3,
    methods: 2,
    domain: 2,
    outcomes: 2,
  };

  const weightedTotal =
    categoryScores.titles * weights.titles +
    categoryScores.core * weights.core +
    categoryScores.tools * weights.tools +
    categoryScores.methods * weights.methods +
    categoryScores.domain * weights.domain +
    categoryScores.outcomes * weights.outcomes;

  const divisor =
    weights.titles + weights.core + weights.tools + weights.methods + weights.domain + weights.outcomes;

  return pct(weightedTotal, divisor * 100);
}

function buildAtsAnalysis(args: { resumeText: string; jobText: string; targetPosition?: string }) {
  const resumeDetection = detectGameRole(args.resumeText);
  const targetPosition = normalizeJobText(args.targetPosition);
  const titleAnchoredJobDetection = targetPosition
    ? detectGameRole(`${targetPosition}\n${args.jobText}`)
    : detectGameRole(args.jobText);
  const rawJobDetection = detectGameRole(args.jobText);
  const jobDetection = titleAnchoredJobDetection?.primaryRoleKey ? titleAnchoredJobDetection : rawJobDetection;

  const resolvedTargetRoleKey =
    resolveRoleKeyFromTargetPosition(targetPosition) ||
    jobDetection.primaryRoleKey ||
    rawJobDetection.primaryRoleKey ||
    resumeDetection.primaryRoleKey ||
    null;

 const missingBundle = detectRoleAndMissingTerms(
  args.resumeText,
  resolvedTargetRoleKey || undefined,
  args.jobText,
  targetPosition
);
  const missingTerms = missingBundle?.missingTerms ?? null;

  const targetRoleKey = missingTerms?.targetRoleKey || resolvedTargetRoleKey;
  const targetRoleName = missingTerms?.targetRoleName || jobDetection.primaryRoleName || rawJobDetection.primaryRoleName || resumeDetection.primaryRoleName || null;

  const categoryScores = buildAtsCategoryScores({
    matchedByCategory: missingTerms?.matchedByCategory,
    missingByCategory: missingTerms?.missingByCategory,
  });

  const overallScore = buildOverallAtsScore(categoryScores);

  const resumeTopRoles = ((resumeDetection.roleScores || []) as AtsRoleScore[]).slice(0, 3).map((r: AtsRoleScore) => ({
    roleKey: r.roleKey,
    roleName: r.roleName,
    score: r.score,
    matchedTerms: r.matchedTerms,
    categoryCoverage: r.categoryCoverage,
  }));

  const jobTopRoles = ((jobDetection.roleScores || []) as AtsRoleScore[]).slice(0, 3).map((r: AtsRoleScore) => ({
    roleKey: r.roleKey,
    roleName: r.roleName,
    score: r.score,
    matchedTerms: r.matchedTerms,
    categoryCoverage: r.categoryCoverage,
  }));

  const matchedByCategory = missingTerms?.matchedByCategory ?? null;
  const missingByCategory = missingTerms?.missingByCategory ?? null;

  const targetHits = ((resumeDetection.hits || []) as AtsHit[])
    .filter((h: AtsHit) => h.roleKey === targetRoleKey)
    .slice(0, 24)
    .map((h: AtsHit) => ({
      category: h.category,
      term: h.term,
      count: h.count,
      score: h.score,
    }));

  const matchedTermsFromBuckets = matchedByCategory
    ? (Object.entries(matchedByCategory) as Array<[AtsCategoryKey, string[]]>)
        .flatMap(([category, terms]) => safeArray(terms).map((term) => ({ category, term, count: 1, score: 0 })))
    : [];

  const matchedTermsDetailed = matchedTermsFromBuckets.length ? matchedTermsFromBuckets : targetHits;

  const roleShift =
    resumeDetection.primaryRoleKey &&
    targetRoleKey &&
    resumeDetection.primaryRoleKey !== targetRoleKey
      ? {
          fromRoleKey: resumeDetection.primaryRoleKey,
          fromRoleName: resumeDetection.primaryRoleName,
          toRoleKey: targetRoleKey,
          toRoleName: targetRoleName,
        }
      : null;

  return {
    detectedResumeRole: {
      roleKey: resumeDetection.primaryRoleKey,
      roleName: resumeDetection.primaryRoleName,
      secondaryRoleKey: resumeDetection.secondaryRoleKey,
      secondaryRoleName: resumeDetection.secondaryRoleName,
      confidence: resumeDetection.confidence,
      topRoles: resumeTopRoles,
    },
    detectedJobRole: {
      roleKey: jobDetection.primaryRoleKey,
      roleName: jobDetection.primaryRoleName,
      secondaryRoleKey: jobDetection.secondaryRoleKey,
      secondaryRoleName: jobDetection.secondaryRoleName,
      confidence: jobDetection.confidence,
      topRoles: jobTopRoles,
    },
    targetRole: {
      roleKey: targetRoleKey,
      roleName: targetRoleName,
    },
    overallScore,
    categoryScores,
    matchedTerms: uniqueCaseInsensitive(matchedTermsDetailed.map((h) => h.term)),
    matchedTermsDetailed,
    missingCriticalTerms: safeArray(missingTerms?.tier1Critical).slice(0, 15),
    missingImportantTerms: safeArray(missingTerms?.tier2Important).slice(0, 15),
    missingNiceToHaveTerms: safeArray(missingTerms?.tier3NiceToHave).slice(0, 20),
    matchedByCategory,
    missingByCategory,
    notes: safeArray(missingTerms?.notes),
    roleShift,
  };
}


function classifyJdKeywordForAtsCategory(term: string): AtsCategoryKey {
  const normalized = normalizeJobText(term).toLowerCase();
  const compact = normalized.replace(/[.\s-]+/g, "");

  const toolTerms = new Set([
    "javascript", "typescript", "python", "java", "c#", "c++", "go", "golang", "ruby", "php", "lua", "swift", "kotlin", "scala",
    "html", "css", "sql", "rest", "rest api", "rest apis", "api", "apis",
    "react", "next.js", "nextjs", "node.js", "nodejs", "node", "vue", "angular", "svelte", "django", "rails", "spring",
    "zendesk", "jira", "mode", "looker", "tableau", "figma", "github", "gitlab", "docker", "kubernetes", "postman",
    "postgresql", "postgres", "mysql", "mongodb", "redis", "aws", "azure", "gcp",
  ]);

  if (toolTerms.has(normalized) || toolTerms.has(compact)) return "tools";

  if (/\b(ticket|ticketing|triage|escalation|escalations|incident|debug|troubleshoot|troubleshooting|quality|testing|test|documentation|process improvement|time management|customer support|technical support|communication|collaboration|self starter|customer-facing|customer facing)\b/i.test(normalized)) {
    return "methods";
  }

  if (/\b(game|gaming|finance|financial|banking|support|customer|developer tools|platform|saas|api platform|ai|database|data visualization|visualization)\b/i.test(normalized)) {
    return "domain";
  }

  if (/\b(reduce|improve|increase|optimize|quality|latency|performance|reliability|standards|impact|resolution)\b/i.test(normalized)) {
    return "outcomes";
  }

  return "core";
}

function mergeTerms(...groups: Array<unknown>): string[] {
  const values = groups.flatMap((group) => safeArray(group));
  return uniqueCaseInsensitive(values);
}

function mergeCategoryBuckets(
  base: Partial<AtsCategoryBuckets> | null | undefined,
  terms: string[],
) {
  const next: AtsCategoryBuckets = {
    titles: safeArray(base?.titles),
    core: safeArray(base?.core),
    tools: safeArray(base?.tools),
    methods: safeArray(base?.methods),
    domain: safeArray(base?.domain),
    outcomes: safeArray(base?.outcomes),
  };

  for (const term of terms) {
    const clean = String(term || "").trim();
    if (!clean) continue;
    const category = classifyJdKeywordForAtsCategory(clean);
    next[category] = uniqueCaseInsensitive([...next[category], clean]);
  }

  return next;
}

function bridgeJobDescriptionKeywordFitIntoAts(args: {
  ats: ReturnType<typeof buildAtsAnalysis>;
  analysis: any;
}) {
  const { ats, analysis } = args;
  const presentFromJobDescription = safeArray(analysis?.presentKeywords ?? analysis?.present).slice(0, 24);
  const missingFromJobDescription = safeArray(
    analysis?.highImpactMissing ?? analysis?.missingKeywords ?? analysis?.missing,
  ).slice(0, 24);

  if (!presentFromJobDescription.length && !missingFromJobDescription.length) return ats;

  const matchedByCategory = mergeCategoryBuckets(
    ats.matchedByCategory ?? undefined,
    presentFromJobDescription,
  );
  const missingByCategory = mergeCategoryBuckets(
    ats.missingByCategory ?? undefined,
    missingFromJobDescription,
  );

  const matchedTerms = mergeTerms(ats.matchedTerms, presentFromJobDescription).slice(0, 32);
  const matchedTermsDetailed = uniqueCaseInsensitive([
    ...safeArray(ats.matchedTermsDetailed?.map((hit) => hit.term)),
    ...presentFromJobDescription,
  ]).slice(0, 32).map((term) => ({
    category: classifyJdKeywordForAtsCategory(term),
    term,
    count: 1,
    score: 0,
  }));

  const jdMissingTools = missingFromJobDescription.filter((term) => classifyJdKeywordForAtsCategory(term) === "tools");
  const jdMissingCore = missingFromJobDescription.filter((term) => classifyJdKeywordForAtsCategory(term) === "core");
  const jdMissingMethods = missingFromJobDescription.filter((term) => classifyJdKeywordForAtsCategory(term) === "methods");
  const jdMissingDomain = missingFromJobDescription.filter((term) => classifyJdKeywordForAtsCategory(term) === "domain");
  const jdMissingOutcomes = missingFromJobDescription.filter((term) => classifyJdKeywordForAtsCategory(term) === "outcomes");

  const missingCriticalTerms = mergeTerms(ats.missingCriticalTerms, jdMissingTools, jdMissingCore).slice(0, 15);
  const missingImportantTerms = mergeTerms(ats.missingImportantTerms, jdMissingMethods, jdMissingDomain).slice(0, 15);
  const missingNiceToHaveTerms = mergeTerms(ats.missingNiceToHaveTerms, jdMissingOutcomes).slice(0, 20);

  const categoryScores = buildAtsCategoryScores({
    matchedByCategory,
    missingByCategory,
  });

  return {
    ...ats,
    matchedTerms,
    matchedTermsDetailed,
    missingCriticalTerms,
    missingImportantTerms,
    missingNiceToHaveTerms,
    matchedByCategory,
    missingByCategory,
    categoryScores,
    overallScore: buildOverallAtsScore(categoryScores),
    notes: uniqueCaseInsensitive([
      ...safeArray(ats.notes),
      "Job-description keywords were merged into ATS scoring so this role's actual tools and requirements are represented.",
    ]).slice(0, 8),
  };
}


function looksLikeDateRangeLine(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line) return false;

  const month = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const year = "(?:19|20)\\d{2}";
  const dateToken = `(?:${month}\\s+${year}|${year}|\\d{1,2}\\/${year}|present|current|now)`;
  const re = new RegExp(`\\b${dateToken}\\s*(?:-|to|through|thru)\\s*${dateToken}\\b`, "i");
  return re.test(line);
}

function looksLikeJobHeaderLine(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  if (!line) return false;
  if (!(line.includes("â€”") || line.includes("-"))) return false;
  if (!line.includes("|")) return false;
  return /^(.{2,140}?)\s*(â€”|-)\s*(.{2,220}?)\s*\|\s*(.{0,80})$/.test(line);
}

function parseJobHeaderLine(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  const m = line.match(/^(.{2,140}?)\s*(â€”|-)\s*(.{2,220}?)\s*\|\s*(.{0,80})$/);
  if (!m) return null;

  return {
    title: String(m[1] || "").trim(),
    company: String(m[3] || "").trim(),
    datesInline: String(m[4] || "").trim(),
  };
}

function looksLikeCompanyDashTitleHeader(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  if (!line) return false;
  if (/^[\s]*[â€¢â—\u2022\u00B7oï‚§-]\s+/.test(line)) return false;
  if (/^(highlights|experience|education|skills|projects|certifications|certificates|volunteer|interests)\b/i.test(line))
    return false;
  if (!line.includes(" - ") && !line.includes(" â€” ")) return false;
  if (line.includes("|")) return false;
  if (line.length < 8 || line.length > 170) return false;

  const normalized = line.replace(/\s+â€”\s+/g, " - ");
  const idx = normalized.indexOf(" - ");
  if (idx <= 0) return false;

  const left = normalized.slice(0, idx).trim();
  const right = normalized.slice(idx + 3).trim();
  if (!left || !right) return false;
  if (right.split(/\s+/).length < 2) return false;

  return true;
}

function parseCompanyDashTitleHeader(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  const normalized = line.replace(/\s+â€”\s+/g, " - ");
  const idx = normalized.indexOf(" - ");
  if (idx <= 0) return null;

  const company = normalized.slice(0, idx).trim();
  const title = normalized.slice(idx + 3).trim();
  if (!company || !title) return null;

  return { company, title };
}

function looksLikeMetaLine(s: string) {
  const t = String(s || "").trim();
  if (!t) return true;
  if (/^(highlights|experience|education|skills|projects|certifications|certificates|volunteer|interests)\b/i.test(t))
    return true;
  if (/^games shipped\s*:/i.test(t)) return true;
  if (/^tools\s*:/i.test(t)) return true;
  if (/^experi\s*e\s*n\s*ce$/i.test(t.replace(/\s+/g, ""))) return true;
  return false;
}

function looksLikePreviewNoiseLine(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return true;
  if (looksLikeContactOrReferenceLine(line)) return true;
  if (looksLikeMetaLine(line)) return true;
  if (looksLikePreviewSkillCategoryLine(line)) return true;
  if (looksLikePreviewExperienceBoundary(line)) return true;
  if (/^(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies|education|certifications?)\s*:?$/i.test(line)) return true;
  if (/^(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies)\s*:/i.test(line)) return true;
  return false;
}

function looksLikePreviewBulletNoise(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return true;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(line)) return true;
  if (/\blinkedin\.com\/in\/\S+|\bhttps?:\/\/\S+|\bwww\.\S+/i.test(line)) return true;
  if (/^references?$/i.test(line)) return true;
  if (/available\s+upon\s+request/i.test(line)) return true;
  if (looksLikePreviewSkillCategoryLine(line)) return true;
  if (looksLikePreviewExperienceBoundary(line)) return true;
  if (containsPreviewDateRange(line)) return true;
  if (/^(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies)\s*:?$/i.test(line)) return true;
  if (/^(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies)\s*:/i.test(line)) return true;
  return false;
}

function looksLikePreviewSkillHeader(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return false;
  return /^(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies|platforms|languages|frameworks|certifications?|education|languages?\s*&\s*frameworks?|ai[-\s]augmented development|systems?\s*&\s*architecture|tooling\s*&\s*delivery|engineering practices)\s*:?/i.test(line);
}

function looksLikePreviewSkillCategoryLine(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return false;
  return /^(languages?\s*&\s*frameworks?|frameworks?|ai[-\s]augmented development|systems?\s*&\s*architecture|tooling\s*&\s*delivery|engineering practices|technical skills|core skills|skills|tools|technologies|platforms|areas of expertise|expertise)\s*:?/i.test(line);
}

function looksLikePreviewExperienceBoundary(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return false;
  return /^(professional experience|work experience|job experience|employment history|career history|experience|education|certifications?|certificates|projects|volunteer|interests)\b/i.test(line);
}

function containsPreviewDateRange(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return false;
  return /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|(?:19|20)\d{2})\s*(?:-|–|—|to|through|thru)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|(?:19|20)\d{2}|present|current|now)\b/i.test(line);
}

function truncatePreviewLineAtBoundary(input: unknown) {
  let line = cleanPreviewText(input);
  if (!line) return "";

  const boundaryPatterns = [
    /\b(?:professional experience|work experience|job experience|employment history|career history|experience|education|certifications?|certificates|projects)\b/i,
    /\b(?:qa lead|software engineer|software test engineer|dev support|full-stack software engineer|freelancer developer|software design engineer internship)\s*[|,]/i,
    /\b[A-Z][A-Za-z0-9&./' -]{2,80}\s*[|,]\s*(?:QA|Quality|Software|Dev|Developer|Engineer|Manager|Analyst|Specialist|Lead)\b/,
  ];

  for (const pattern of boundaryPatterns) {
    const match = line.match(pattern);
    if (match && typeof match.index === "number" && match.index > 0) {
      line = line.slice(0, match.index).trim();
    }
  }

  return line;
}

function looksLikePreviewSkillList(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return false;
  if (looksLikePreviewBulletNoise(line)) return true;
  if (line.length > 120) return false;
  if (/\b(improved|managed|created|led|owned|tested|built|designed|implemented|automated|reduced|increased|shipped|launched|coordinated|analyzed|validated|executed)\b/i.test(line)) return false;
  const separatorCount = (line.match(/[,•|/]/g) || []).length;
  if (separatorCount >= 2) return true;
  if (/^(jira|testrail|selenium|cypress|playwright|postman|figma|unity|unreal|javascript|typescript|python|sql|excel|agile|scrum)\b/i.test(line)) return true;
  return false;
}

function looksLikePreviewAchievementOrSentence(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return true;

  const words = line.split(/\s+/).filter(Boolean);
  if (line.length > 90 || words.length > 8) return true;
  if (/[.!?]$/.test(line) && line.length > 28) return true;
  if (/\b(?:19|20)\d{2}\b/.test(line)) return true;
  if (/\b(?:by|from|to|through|across|while|using|with|for|including|supporting|contributing|lowering|improving|reducing|increasing)\b/i.test(line) && words.length > 5) return true;
  if (/%|\$\s?\d|\b\d+(?:\.\d+)?x\b|\b\d+(?:\.\d+)?\s?(?:ms|sec|secs|minutes|min|hrs|hours|days|weeks)\b/i.test(line)) return true;
  if (/\b(main contributor|release owner|production stability|hotfixes|regression testing|stakeholders?|requirements?|conversion|revenue|retention|churn|iteration time|maintenance costs|daily active users|live service|clinical environment)\b/i.test(line)) return true;

  return /\b(improved|managed|created|led|owned|tested|built|designed|implemented|automated|reduced|increased|shipped|launched|coordinated|analyzed|validated|executed|served|supported|reviewed|prepared|piloted|collaborated|developed|maintained|organized|hosted|delegated|completed|gathered|applied|architected|drove|integrated|worked|resolved|delivered|accelerated|upholding|contributed|participated|communicated|aligned)\b/i.test(line);
}

function looksLikeAllowedPreviewSkillItem(input: unknown) {
  const item = cleanPreviewText(input);
  if (!item) return false;
  if (looksLikeContactOrReferenceLine(item)) return false;
  if (looksLikeMetaLine(item)) return false;
  if (looksLikePreviewSkillCategoryLine(item)) return false;
  if (looksLikePreviewExperienceBoundary(item)) return false;
  if (looksLikePreviewAchievementOrSentence(item)) return false;
  if (containsPreviewDateRange(item)) return false;
  if (/\b(?:19|20)\d{2}\b/.test(item)) return false;
  if (/^(?:linkedin|github|portfolio|email|e-mail|phone|mobile|summary|profile|contact)$/i.test(item)) return false;
  if (/^(?:and|or|to|from|with|using|including|supporting|contributing|lowering|improving|reducing|increasing)\b/i.test(item)) return false;
  if (/[.!?]$/.test(item)) return false;
  if (/\b(?:gmail|hotmail|outlook|yahoo)\.com\b/i.test(item)) return false;
  if (/^(?:job experience|professional experience|experience|education|certifications?|summary|profile)$/i.test(item)) return false;

  const knownSkillOrDomain = /\b(?:qa|quality|testing|test|automation|automated|selenium|cypress|playwright|postman|jira|testrail|zephyr|confluence|excel|powerbi|perforce|unity|unreal|ue4|ue5|vr|biomedical|typescript|javascript|react|vue|node|sql|c#|\.net|java|python|docker|git|github|bitbucket|jenkins|ci\/?cd|agile|scrum|kanban|sdlc|oop|rest|api|apis|microservices|distributed|scalable|systems|architecture|prompt engineering|copilot|codex|growthbook|a\/?b testing|stakeholder|communication|documentation|test case|smoke checks|health checks|game testing|cross-platform|frameworks?)\b/i;
  if (knownSkillOrDomain.test(item)) return true;

  const words = item.split(/\s+/).filter(Boolean);
  if (words.length <= 5 && /^[A-Za-z0-9+#./&() -]+$/.test(item) && !/[.!?]$/.test(item)) return true;
  return false;
}

function splitPreviewSkillCandidates(input: unknown) {
  const line = truncatePreviewLineAtBoundary(input)
    .replace(/^(?:languages?\s*&\s*frameworks?|frameworks?|ai[-\s]augmented development|systems?\s*&\s*architecture|tooling\s*&\s*delivery|engineering practices|technical skills|core skills|skills|tools|technologies|areas of expertise|expertise)\s*:\s*/i, "")
    .trim();

  if (!line) return [] as string[];
  if (looksLikeContactOrReferenceLine(line)) return [] as string[];
  if (looksLikePreviewAchievementOrSentence(line)) return [] as string[];

  const pieces = line
    .split(/\s*[•|;,]\s*|\s+\/\s+/)
    .map((piece) => cleanPreviewText(piece))
    .filter(Boolean);

  const candidates = pieces.length > 1 ? pieces : [line];

  return candidates
    .map((candidate) => cleanPreviewText(candidate))
    .filter((candidate) => {
      if (!candidate || candidate.length < 2 || candidate.length > 70) return false;
      return looksLikeAllowedPreviewSkillItem(candidate);
    });
}

function extractBoundedPreviewExpertiseText(input: unknown) {
  const text = normalizeResumeText(input);
  if (!text) return "";

  const startMatch = text.match(/(?:^|\n|\r)\s*(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies)\b\s*:?/i);
  if (!startMatch || typeof startMatch.index !== "number") return "";

  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = text.slice(startIndex);
  const endMatch = afterStart.match(/(?:^|\n|\r|\s{2,})(professional experience|work experience|job experience|employment history|career history|experience|education|certifications?|certificates|projects|volunteer|interests)\b/i);
  const bounded = endMatch && typeof endMatch.index === "number" ? afterStart.slice(0, endMatch.index) : afterStart;

  return normalizeResumeText(bounded);
}

function extractPreviewExpertiseItemsFromText(input: unknown) {
  const text = extractBoundedPreviewExpertiseText(input);
  if (!text) return [] as string[];

  const lines = text
    .split("\n")
    .flatMap((line) => String(line || "").split(/\s{2,}/g))
    .map((line) => truncatePreviewLineAtBoundary(line))
    .map((line) => cleanPreviewText(line))
    .filter(Boolean);

  const skillLines: string[] = [];

  for (const rawLine of lines) {
    let line = truncatePreviewLineAtBoundary(rawLine);
    if (!line) continue;
    if (looksLikePreviewExperienceBoundary(line)) break;
    if (containsPreviewDateRange(line)) break;
    if (parsePreviewPipeJobHeaderLine(line) || parsePreviewInlineCompanyTitleTechDateHeader(line)) break;
    if (looksLikeContactOrReferenceLine(line)) continue;
    if (looksLikeMetaLine(line)) continue;

    line = line
      .replace(/^(?:languages?\s*&\s*frameworks?|frameworks?|ai[-\s]augmented development|systems?\s*&\s*architecture|tooling\s*&\s*delivery|engineering practices|technical skills|core skills|skills|tools|technologies|areas of expertise|expertise)\s*:\s*/i, "")
      .trim();

    if (!line) continue;
    if (looksLikePreviewAchievementOrSentence(line) && !looksLikePreviewSkillCategoryLine(rawLine)) continue;
    skillLines.push(line);
  }

  return uniqueCleanPreviewItems(skillLines.flatMap(splitPreviewSkillCandidates), 24).filter(looksLikeAllowedPreviewSkillItem);
}

function isUsefulPreviewExpertiseItem(input: unknown) {
  const item = cleanPreviewText(input);
  if (!item) return false;
  if (item.length < 2 || item.length > 70) return false;
  return looksLikeAllowedPreviewSkillItem(item);
}

function buildPreviewExpertiseItems(
  document: ParsedResumeDocument | null | undefined,
  parserCompatibility: ResumeParserCompatibilityOutput | null | undefined,
) {
  const parserSectionItems = uniqueCleanPreviewItems([
    ...extractPreviewExpertiseItemsFromText(parserCompatibility?.sections?.skills),
    ...extractPreviewExpertiseItemsFromText(parserCompatibility?.sections?.expertise),
  ], 18).filter(isUsefulPreviewExpertiseItem);

  if (parserSectionItems.length > 0) return parserSectionItems.slice(0, 18);

  const conservativeFallback = uniqueCleanPreviewItems([
    ...(document?.skills?.normalized || []),
    ...(document?.skills?.raw || []),
  ], 30)
    .flatMap(splitPreviewSkillCandidates)
    .filter(isUsefulPreviewExpertiseItem);

  return uniqueCleanPreviewItems(conservativeFallback, 12).filter(isUsefulPreviewExpertiseItem);
}

function parsePreviewInlineCompanyTitleTechDateHeader(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line || !line.includes(",")) return null;

  const dateMatch = line.match(/\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|\d{1,2}\/(?:19|20)\d{2}|(?:19|20)\d{2})\s*(?:-|to|through|thru)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|\d{1,2}\/(?:19|20)\d{2}|(?:19|20)\d{2}|present|current|now)\b/i);
  if (!dateMatch) return null;

  const beforeDate = line
    .replace(dateMatch[0], "")
    .replace(/\s*[|,•-]\s*$/g, "")
    .trim();

  const beforeSkillList = beforeDate.split(/\s*•\s*/)[0]?.trim() || "";
  const parts = beforeSkillList.split(/\s*,\s*/).map((part) => cleanPreviewText(part)).filter(Boolean);
  if (parts.length < 2) return null;

  const company = parts[0];
  const title = parts.slice(1).join(", ");
  if (!company || !title) return null;
  if (looksLikePreviewNoiseLine(company) || looksLikePreviewNoiseLine(title)) return null;
  if (!/\b(engineer|developer|designer|producer|manager|analyst|specialist|coordinator|lead|director|tester|qa|quality|support|administrator|consultant|intern)\b/i.test(title)) return null;

  return {
    company,
    title,
    dates: dateMatch[0],
  };
}

function sectionHasPreviewEmploymentSignal(section: {
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
}) {
  if (section.dates && looksLikeDateRangeLine(section.dates)) return true;
  const header = [section.title, section.company].filter(Boolean).join(" ");
  if (/\b(engineer|developer|designer|producer|manager|analyst|specialist|coordinator|lead|director|tester|qa|quality|support|administrator|consultant|intern)\b/i.test(header)) {
    return true;
  }
  return section.bullets.some((bullet) =>
    /\b(improved|managed|created|led|owned|tested|built|designed|implemented|automated|reduced|increased|shipped|launched|coordinated|analyzed|validated|executed)\b/i.test(bullet)
  );
}


function looksLikePreviewSkillPhraseOnly(input: unknown) {
  const line = cleanPreviewText(input);
  if (!line) return false;
  if (looksLikeContactOrReferenceLine(line)) return true;
  if (looksLikePreviewSkillCategoryLine(line)) return true;
  if (looksLikePreviewExperienceBoundary(line)) return true;
  if (containsPreviewDateRange(line)) return false;
  if (looksLikePreviewAchievementOrSentence(line)) return false;
  if (/\b(?:lead|manager|director|engineer|developer|analyst|specialist|coordinator|producer|designer|administrator|consultant|intern)\b/i.test(line)) return false;

  const knownSkillOrDomain = /\b(?:qa|quality|testing|test|automation|automated|selenium|cypress|playwright|postman|jira|testrail|zephyr|confluence|excel|powerbi|perforce|unity|unreal|ue4|ue5|vr|biomedical|typescript|javascript|react|vue|node|sql|c#|\.net|java|python|docker|git|github|bitbucket|jenkins|ci\/?cd|agile|scrum|kanban|sdlc|oop|rest|api|apis|microservices|distributed|scalable|systems|architecture|prompt engineering|copilot|codex|growthbook|a\/?b testing|stakeholder|communication|documentation|test case|smoke checks|health checks|game testing|cross-platform|frameworks?|process optimization|process excellence|module testing|cloud migration|unit testing|code reviews|design patterns)\b/i;
  return knownSkillOrDomain.test(line);
}

function shouldDropPreviewSection(section: {
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
}) {
  const headerLines = [section.company, section.title, section.dates, section.location].filter(Boolean);
  const hasSkillHeader = headerLines.some(looksLikePreviewSkillHeader);
  const hasNoiseHeader = headerLines.some(looksLikePreviewNoiseLine);
  const hasEmploymentSignal = sectionHasPreviewEmploymentSignal(section);

  if (headerLines.some(looksLikePreviewSkillCategoryLine)) return true;
  if (headerLines.some(looksLikePreviewExperienceBoundary)) return true;
  if (hasSkillHeader && !hasEmploymentSignal) return true;
  if (hasNoiseHeader && !hasEmploymentSignal && section.bullets.every(looksLikePreviewSkillList)) return true;
  if (!section.dates && section.bullets.length === 0 && headerLines.length && headerLines.every(looksLikePreviewSkillPhraseOnly)) return true;
  if (!section.dates && section.bullets.length === 0 && headerLines.some(looksLikePreviewSkillList)) return true;
  if (!section.company && !section.title && !section.dates && !section.location) return true;
  if (looksLikePreviewBrokenJobHeader(section)) return true;
  if (!hasEmploymentSignal && section.bullets.length === 0) return true;

  return false;
}

function uniqueCleanPreviewItems(items: unknown[], limit = 60) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of items || []) {
    const clean = cleanPreviewBullet(item);
    const key = normalizeForContains(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }

  return out;
}

function buildStructuredPreviewSnapshot(args: {
  document: ParsedResumeDocument | null;
  parserCompatibility: ResumeParserCompatibilityOutput | null;
  targetPosition: string;
}) {
  const document = args.document;
  const parserCompatibility = args.parserCompatibility;
  if (!document && !parserCompatibility) return null;

  const contact = document?.contact;
  const links = Array.isArray(contact?.links) ? contact.links.map((link) => cleanPreviewText(link)).filter(Boolean) : [];
  const linkedin = links.find((link) => /linkedin\.com/i.test(link)) || "";
  const portfolio = links.find((link) => link && link !== linkedin) || "";
  const firstPosition = document?.experience?.positions?.find((position) => cleanPreviewText(position.title));

  const parserJobs = Array.isArray(parserCompatibility?.jobs) ? parserCompatibility.jobs : [];
  const documentJobs = document?.experience?.positions?.length
    ? document.experience.positions.map((position) => ({
        id: position.id,
        company: position.company,
        title: position.title,
        dates: [position.startDate, position.endDate].filter(Boolean).join(" - "),
        location: position.location,
        bullets: position.bullets.map((bullet) => bullet.text),
      }))
    : [];

  const experienceSlice = extractExperienceSection(parserCompatibility?.resumeText || "");
  const explicitPreviewJobs = buildExperienceJobsFromExplicitResumeLines(experienceSlice.experienceText || parserCompatibility?.resumeText || "");
  const textPreviewJobs = buildExperienceJobsForPreviewFromText(experienceSlice.experienceText || parserCompatibility?.resumeText || "");

  const documentSections = normalizePreviewJobSections(documentJobs);
  const parserSections = normalizePreviewJobSections(parserJobs);
  const explicitSections = normalizePreviewJobSections(explicitPreviewJobs);
  const textSections = normalizePreviewJobSections(textPreviewJobs);

  const sections = selectBestPreviewJobSections([
    { name: "explicit", jobs: explicitSections },
    { name: "text", jobs: textSections },
    { name: "document", jobs: documentSections },
    { name: "parser", jobs: parserSections },
  ]);

  const recoveredProfile = derivePreviewProfileFromResumeText(parserCompatibility?.resumeText || "", {
    fullName: contact?.name,
    titleLine: firstPosition?.title,
    locationLine: contact?.location,
    email: contact?.email,
    phone: contact?.phone,
    linkedin,
    portfolio,
    summary: document?.summary?.rawText,
  });

  const educationItems = document?.education?.entries?.length
    ? uniqueCleanPreviewItems(document.education.entries.map((entry) => entry.rawText), 12)
    : [];
  const expertiseItems = buildPreviewExpertiseItems(document, parserCompatibility);

  const snapshot = {
    version: 1 as const,
    targetPosition: cleanPreviewText(args.targetPosition),
    template: "modern",
    profile: {
      fullName: recoveredProfile.fullName,
      titleLine: recoveredProfile.titleLine,
      locationLine: recoveredProfile.locationLine,
      email: recoveredProfile.email,
      phone: recoveredProfile.phone,
      linkedin: recoveredProfile.linkedin,
      portfolio: recoveredProfile.portfolio,
      summary: recoveredProfile.summary,
    },
    sections,
    educationItems,
    expertiseItems,
    metaGames: [] as string[],
    metaMetrics: [] as string[],
    shippedLabelMode: "games",
    includeMetaInResumeDoc: true,
    showShippedBlock: true,
    showMetricsBlock: true,
    showEducationOnResume: true,
    showExpertiseOnResume: true,
    showProfilePhoto: true,
    profilePhotoDataUrl: "",
    profilePhotoShape: "circle" as const,
    profilePhotoSize: 112,
  };

  const hasUsefulPreviewData =
    !!snapshot.profile.fullName ||
    !!snapshot.profile.email ||
    !!snapshot.profile.phone ||
    !!snapshot.profile.locationLine ||
    snapshot.sections.some((section) => section.bullets.length || section.company || section.title) ||
    snapshot.expertiseItems.length > 0;

  return hasUsefulPreviewData ? snapshot : null;
}


function looksLikeStrictPreviewExpertiseItem(input: unknown) {
  const item = cleanPreviewText(input);
  if (!item) return false;
  if (item.length < 2 || item.length > 64) return false;
  if (looksLikeContactOrReferenceLine(item)) return false;
  if (looksLikeMetaLine(item)) return false;
  if (looksLikePreviewSkillCategoryLine(item)) return false;
  if (looksLikePreviewExperienceBoundary(item)) return false;
  if (looksLikePreviewAchievementOrSentence(item)) return false;
  if (containsPreviewDateRange(item)) return false;
  if (/\b(?:19|20)\d{2}\b/.test(item)) return false;
  if (/^(?:linkedin|github|portfolio|email|e-mail|phone|mobile|summary|profile|contact)$/i.test(item)) return false;
  if (/^(?:and|or|to|from|with|using|including|supporting|contributing|lowering|improving|reducing|increasing)\b/i.test(item)) return false;
  if (/[.!?]$/.test(item)) return false;
  if (/\b(?:gmail|hotmail|outlook|yahoo)\.com\b/i.test(item)) return false;
  if (/\b(?:main contributor|release owner|production stability|hotfixes|subscription conversion|monthly revenue|daily active users|customer-facing|patient-facing|technical hiring|standups|sprint planning|retrospectives|requirements|stakeholders?|therapy outcomes)\b/i.test(item)) return false;
  if (/\b(?:increased|reduced|improved|built|designed|implemented|owned|served|led|drove|integrated|applied|gathered|worked|collaborated|maintained|developed|created|hosted|delegated|coordinated|reviewed|prepared|piloted|supported|architected|optimized|resolved|delivered)\b/i.test(item)) return false;

  const knownSkillOrDomain = /\b(?:qa|quality|testing|test|automation|automated|selenium|cypress|playwright|postman|jira|testrail|zephyr|confluence|excel|powerbi|perforce|unity|unreal|ue4|ue5|vr|biomedical|typescript|javascript|react|vue|node|sql|c#|\.net|java|python|docker|git|github|bitbucket|jenkins|ci\/?cd|agile|scrum|kanban|sdlc|oop|rest|api|apis|microservices|distributed|scalable|systems|architecture|prompt engineering|copilot|codex|growthbook|a\/?b testing|stakeholder|communication|documentation|test case|smoke checks|health checks|game testing|cross-platform|frameworks?|process optimization|process excellence|module testing|cloud migration|unit testing|code reviews|design patterns)\b/i;
  if (knownSkillOrDomain.test(item)) return true;

  const words = item.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  if (/[.!?]/.test(item)) return false;
  if (/^[A-Za-z0-9+#./&() -]+$/.test(item)) return true;
  return false;
}

function sanitizePreviewExpertiseItemsForResponse(items: unknown[]) {
  return uniqueCleanPreviewItems(
    (Array.isArray(items) ? items : [])
      .flatMap((item) => splitPreviewSkillCandidates(item))
      .map((item) => truncatePreviewLineAtBoundary(item)),
    24,
  )
    .filter(looksLikeStrictPreviewExpertiseItem)
    .slice(0, 18);
}

function looksLikeBadPreviewProfileName(value: unknown) {
  const line = cleanPreviewText(value);
  if (!line) return false;
  if (looksLikePreviewExperienceBoundary(line)) return true;
  if (looksLikePreviewSkillCategoryLine(line)) return true;
  if (looksLikePreviewAchievementOrSentence(line)) return true;
  if (/^(?:intricate|unorthodox|moldable|professional experience|job experience|skills|summary|profile)$/i.test(line)) return true;
  if (/[.!?]$/.test(line)) return true;
  return false;
}

function looksLikeBadPreviewLocationLine(value: unknown) {
  const line = cleanPreviewText(value);
  if (!line) return false;
  if (looksLikeContactOrReferenceLine(line)) return false;
  if (looksLikePreviewAchievementOrSentence(line)) return true;
  if (line.split(/\s+/).length > 8) return true;
  if (/[.!?]$/.test(line)) return true;
  return false;
}

function sanitizePreviewProfileForResponse(profile: any) {
  const fullName = cleanPreviewText(profile?.fullName);
  const locationLine = cleanPreviewText(profile?.locationLine);
  const portfolio = cleanPreviewText(profile?.portfolio);
  const email = cleanPreviewText(profile?.email);

  const fullNameIsBad = looksLikeBadPreviewProfileName(fullName) || (!!fullName && !looksLikeLikelyPreviewPersonName(fullName));
  const locationLooksLikeName = looksLikeLikelyPreviewPersonName(locationLine);
  const resolvedFullName = fullName && !fullNameIsBad ? fullName : locationLooksLikeName ? locationLine : "";

  return {
    ...profile,
    fullName: resolvedFullName,
    titleLine: cleanPreviewText(profile?.titleLine),
    locationLine: locationLooksLikeName || looksLikeBadPreviewLocationLine(locationLine) ? "" : locationLine,
    email,
    phone: cleanPreviewText(profile?.phone),
    linkedin: cleanPreviewText(profile?.linkedin),
    portfolio: portfolio && email && normalizeForContains(portfolio).includes(normalizeForContains(email.split("@")[1] || "")) ? "" : portfolio,
    summary: cleanPreviewText(profile?.summary),
  };
}

function sanitizeStructuredPreviewSnapshotForResponse(snapshot: ReturnType<typeof buildStructuredPreviewSnapshot>) {
  if (!snapshot) return null;

  const sections = normalizePreviewJobSections(snapshot.sections || []);
  const expertiseItems = sanitizePreviewExpertiseItemsForResponse(snapshot.expertiseItems || []);
  const educationItems = uniqueCleanPreviewItems(snapshot.educationItems || [], 12)
    .filter((item) => !looksLikeContactOrReferenceLine(item))
    .filter((item) => !looksLikePreviewSkillCategoryLine(item))
    .filter((item) => !looksLikePreviewExperienceBoundary(item));

  const sanitized = {
    ...snapshot,
    profile: sanitizePreviewProfileForResponse(snapshot.profile),
    sections,
    educationItems,
    expertiseItems,
  };

  const hasUsefulPreviewData =
    !!sanitized.profile.fullName ||
    !!sanitized.profile.email ||
    !!sanitized.profile.phone ||
    !!sanitized.profile.locationLine ||
    sanitized.sections.some((section) => section.bullets.length || section.company || section.title) ||
    sanitized.expertiseItems.length > 0;

  return hasUsefulPreviewData ? sanitized : null;
}

function sanitizeExperienceJobsForResponse(jobs: any[]) {
  return normalizePreviewJobSections(Array.isArray(jobs) ? jobs : []);
}

function hasPreviewRoleKeyword(value: unknown) {
  return /\b(engineer|developer|designer|producer|manager|analyst|specialist|coordinator|lead|director|tester|qa|quality|support|administrator|consultant|intern)\b/i.test(cleanPreviewText(value));
}

function looksLikeLikelyPreviewPersonName(value: unknown) {
  const line = cleanPreviewText(value);
  if (!line || line.length < 4 || line.length > 80) return false;
  if (looksLikeContactOrReferenceLine(line)) return false;
  if (looksLikePreviewSkillCategoryLine(line)) return false;
  if (looksLikePreviewExperienceBoundary(line)) return false;
  if (looksLikePreviewAchievementOrSentence(line)) return false;
  if (containsPreviewDateRange(line)) return false;
  if (/^(?:your name|name|job experience|professional experience|summary|profile|skills)$/i.test(line)) return false;
  if (/\b(?:engineer|developer|designer|producer|manager|analyst|specialist|coordinator|lead|director|tester|quality|support|administrator|consultant|intern|university|college|school|certificate|certification|microsoft|azure)\b/i.test(line)) return false;

  const withoutSuffix = line.replace(/,\s*(?:MASc|M\.?A\.?Sc\.?|MSc|PhD|MBA|BSc|BA|BS|PMP|CPA)\.?$/i, "").trim();
  const words = withoutSuffix.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  return words.every((word) => /^[A-Z][A-Za-z'.-]+$/.test(word) || /^[A-Z]{2,}$/.test(word));
}

function looksLikeStandalonePreviewCompanyLine(value: unknown) {
  const line = cleanPreviewText(value);
  if (!line || line.length < 2 || line.length > 90) return false;
  if (looksLikeContactOrReferenceLine(line)) return false;
  if (looksLikePreviewNoiseLine(line)) return false;
  if (looksLikePreviewSkillCategoryLine(line)) return false;
  if (looksLikePreviewExperienceBoundary(line)) return false;
  if (looksLikePreviewSkillList(line)) return false;
  if (looksLikePreviewAchievementOrSentence(line)) return false;
  if (containsPreviewDateRange(line)) return false;
  if (/^[•●◦▪▫·*\-]/.test(line)) return false;
  if (/^(?:company|role|title|dates)$/i.test(line)) return false;
  return /[A-Za-z]/.test(line);
}

function looksLikeStandalonePreviewTitleLine(value: unknown) {
  const line = cleanPreviewText(value);
  if (!line || line.length < 2 || line.length > 120) return false;
  if (!hasPreviewRoleKeyword(line)) return false;
  if (looksLikeContactOrReferenceLine(line)) return false;
  if (looksLikePreviewNoiseLine(line)) return false;
  if (looksLikePreviewSkillCategoryLine(line)) return false;
  if (looksLikePreviewExperienceBoundary(line)) return false;
  if (looksLikePreviewSkillList(line)) return false;
  if (looksLikePreviewAchievementOrSentence(line)) return false;
  if (containsPreviewDateRange(line)) return false;
  if (/^[•●◦▪▫·*\-]/.test(line)) return false;
  return true;
}

function extractPreviewDateRangeToken(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line) return null;

  const month = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const year = "(?:19|20)\\d{2}";
  const dateToken = `(?:${month}\\s+${year}|${year}|\\d{1,2}\\/${year}|present|current|now)`;
  const re = new RegExp(`\\b${dateToken}\\s*(?:-|to|through|thru)\\s*${dateToken}(?:\\s*\\([^)]{1,32}\\))?`, "ig");
  const matches = Array.from(line.matchAll(re));
  if (!matches.length) return null;

  const first = matches[0];
  const firstIndex = typeof first.index === "number" ? first.index : -1;
  if (firstIndex < 0) return null;

  let dates = first[0].trim();
  let endIndex = firstIndex + first[0].length;

  const second = matches[1];
  if (second && typeof second.index === "number") {
    const gap = line.slice(endIndex, second.index);
    if (/^\s*,\s*$/.test(gap) || /^\s*(?:and|&)\s*$/i.test(gap)) {
      dates = `${dates}, ${second[0].trim()}`;
      endIndex = second.index + second[0].length;
    }
  }

  return { dates, index: firstIndex, endIndex };
}

function parsePreviewDatedJobHeaderLine(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line || looksLikePreviewNoiseLine(line)) return null;
  if (/^[•●◦▪▫·*\-]+\s+/.test(line)) return null;

  const dateMatch = extractPreviewDateRangeToken(line);
  if (!dateMatch) return null;

  const beforeDate = line
    .slice(0, dateMatch.index)
    .replace(/\s*[|,•-]\s*$/g, "")
    .trim();

  if (!beforeDate || beforeDate.length < 5) return null;

  let company = "";
  let title = "";

  if (beforeDate.includes("|")) {
    const parts = beforeDate.split(/\s*\|\s*/).map((part) => cleanPreviewText(part)).filter(Boolean);
    if (parts.length >= 2) {
      const roleIndex = parts.findIndex((part) => hasPreviewRoleKeyword(part));
      if (roleIndex > 0) {
        company = parts.slice(0, roleIndex).join(" | ");
        title = parts[roleIndex];
      } else {
        title = parts[0];
        company = parts.slice(1).join(" | ");
      }
    }
  } else if (beforeDate.includes(",")) {
    const parts = beforeDate.split(/\s*,\s*/).map((part) => cleanPreviewText(part)).filter(Boolean);
    if (parts.length >= 2) {
      company = parts[0];
      title = parts.slice(1).join(", ");
    }
  } else {
    const dash = beforeDate.match(/^(.{2,90}?)\s+-\s+(.{2,140})$/);
    if (dash) {
      company = cleanPreviewText(dash[1]);
      title = cleanPreviewText(dash[2]);
    }
  }

  company = cleanPreviewText(company);
  title = cleanPreviewText(title);

  if (!company || !title) return null;
  if (looksLikePreviewNoiseLine(company) || looksLikePreviewNoiseLine(title)) return null;
  if (looksLikePreviewSkillList(company) || looksLikePreviewSkillList(title)) return null;
  if (!hasPreviewRoleKeyword(title)) return null;
  if (/^~?\d|%|latency|server costs|sdk|integration layers/i.test(company)) return null;

  return {
    company,
    title,
    dates: dateMatch.dates,
  };
}

function looksLikePreviewBrokenJobHeader(section: {
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
}) {
  const company = cleanPreviewText(section.company);
  const title = cleanPreviewText(section.title);
  if (section.dates) return false;
  if (!company && !title) return true;
  if (/^~?\d|%|latency|server costs|lowering server costs/i.test(company)) return true;
  if (/^~?\d|%|latency|server costs|lowering server costs/i.test(title)) return true;
  if (/\b(?:sdk|agnostic ad|ad integration|integration layers|multiple providers|network traffic)\b/i.test(company)) return true;
  if (!hasPreviewRoleKeyword(title)) return true;
  return false;
}

function parsePreviewPipeJobHeaderLine(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line || !line.includes("|")) return null;
  if (looksLikePreviewNoiseLine(line)) return null;

  const parts = line.split(/\s*\|\s*/).map((part) => cleanPreviewText(part)).filter(Boolean);
  if (parts.length < 3) return null;

  const datePartIndex = parts.findIndex((part) => looksLikeDateRangeLine(part) || /\b(?:19|20)\d{2}\s*(?:-|to|through|thru)\s*(?:present|current|now|(?:19|20)\d{2}|[a-z]{3,9}\s+(?:19|20)\d{2})\b/i.test(part));
  if (datePartIndex === -1) return null;

  const dates = parts[datePartIndex];
  const beforeDate = parts.slice(0, datePartIndex);
  if (beforeDate.length < 2) return null;

  const roleIndex = beforeDate.findIndex((part) => hasPreviewRoleKeyword(part));
  const title = roleIndex >= 0 ? beforeDate[roleIndex] : beforeDate[0];
  const company = roleIndex > 0
    ? beforeDate.slice(0, roleIndex).join(" | ")
    : beforeDate.slice(1).join(" | ");
  if (!title || !company) return null;
  if (looksLikePreviewNoiseLine(title) || looksLikePreviewNoiseLine(company)) return null;
  if (!hasPreviewRoleKeyword(title)) return null;

  return { company, title, dates };
}

function normalizePreviewJobSections(jobsIn: Array<any>) {
  const sections = (Array.isArray(jobsIn) ? jobsIn : [])
    .map((position, index) => {
      const company = cleanPreviewText(position?.company);
      const title = cleanPreviewText(position?.title);
      const dates = cleanPreviewText(position?.dates || [position?.startDate, position?.endDate].filter(Boolean).join(" - "));
      const location = cleanPreviewText(position?.location);
      const bullets = uniqueCleanPreviewItems(Array.isArray(position?.bullets) ? position.bullets : [], 30)
        .filter((bullet) => !looksLikePreviewBulletNoise(bullet))
        .filter((bullet) => !looksLikePreviewSkillList(bullet));

      const section = {
        id: cleanPreviewText(position?.id) || `position_${index + 1}`,
        company,
        title,
        dates,
        location,
        bullets,
      };

      if (!bullets.length && !company && !title) return null;
      if (looksLikePreviewNoiseLine(company) && !title && !bullets.length) return null;
      if (looksLikePreviewNoiseLine(title) && !company && !bullets.length) return null;
      const hasEmploymentSignal = sectionHasPreviewEmploymentSignal(section);
      if (looksLikePreviewSkillCategoryLine(company) || looksLikePreviewSkillCategoryLine(title)) return null;
      if (looksLikePreviewExperienceBoundary(company) || looksLikePreviewExperienceBoundary(title)) return null;
      if ((looksLikePreviewSkillList(company) || looksLikePreviewSkillList(title)) && !hasEmploymentSignal) return null;
      if (shouldDropPreviewSection(section)) return null;

      return section;
    })
    .filter((section): section is { id: string; company: string; title: string; dates: string; location: string; bullets: string[] } => Boolean(section));

  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = normalizeForContains([section.company, section.title, section.dates].filter(Boolean).join(" | "));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function previewSectionsQualityScore(sections: Array<{ company: string; title: string; dates: string; bullets: string[] }>) {
  return sections.reduce((score, section) => {
    let next = score;
    if (section.company) next += 2;
    if (section.title) next += 2;
    if (section.dates) next += 2;
    next += Math.min(4, section.bullets.length);
    if (section.bullets.length) next += 2;
    if (section.company && section.title && section.dates) next += 3;
    if (looksLikePreviewSkillList(section.company) || looksLikePreviewSkillList(section.title)) next -= 6;
    if (looksLikePreviewNoiseLine(section.company) || looksLikePreviewNoiseLine(section.title)) next -= 4;
    if (!section.dates && !section.bullets.length) next -= 5;
    return next;
  }, 0);
}

function selectBestPreviewJobSections(sources: Array<{ name: string; jobs: Array<any> }>) {
  const candidates = sources
    .map((source) => {
      const sections = normalizePreviewJobSections(source.jobs || []);
      const datedCount = sections.filter((section) => !!section.dates).length;
      const bulletCount = sections.reduce((sum, section) => sum + section.bullets.length, 0);
      const completeCount = sections.filter((section) => section.company && section.title && section.dates).length;
      const score =
        previewSectionsQualityScore(sections) +
        sections.length * 3 +
        datedCount * 4 +
        completeCount * 3 +
        Math.min(12, bulletCount);

      return { ...source, sections, datedCount, bulletCount, completeCount, score };
    })
    .filter((source) => source.sections.length > 0);

  if (!candidates.length) return [] as ReturnType<typeof normalizePreviewJobSections>;

  candidates.sort((a, b) => {
    if (b.completeCount !== a.completeCount) return b.completeCount - a.completeCount;
    if (b.datedCount !== a.datedCount) return b.datedCount - a.datedCount;
    if (b.sections.length !== a.sections.length) return b.sections.length - a.sections.length;
    if (b.score !== a.score) return b.score - a.score;
    return b.bulletCount - a.bulletCount;
  });

  return candidates[0].sections;
}


function isLikelyPreviewPersonName(value: unknown) {
  const line = cleanPreviewText(value);
  if (!line) return false;
  if (line.length < 4 || line.length > 70) return false;
  if (looksLikeContactOrReferenceLine(line)) return false;
  if (looksLikePreviewExperienceBoundary(line)) return false;
  if (looksLikePreviewSkillCategoryLine(line)) return false;
  if (looksLikePreviewAchievementOrSentence(line)) return false;
  if (/[.!?]$/.test(line)) return false;
  if (/^(?:linkedin|github|portfolio|email|phone|summary|profile|contact|areas of expertise)$/i.test(line)) return false;
  if (/\b(?:engineer|developer|designer|producer|manager|analyst|specialist|coordinator|lead|director|tester|qa|quality|support|administrator|consultant|intern)\b/i.test(line)) return false;

  const withoutCredential = line.replace(/,\s*(?:masc|msc|mba|phd|bsc|ba|b\.sc\.?|m\.sc\.?)\.?$/i, "");
  const parts = withoutCredential.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return parts.every((part) => /^[A-Z][A-Za-z'’-]*(?:-[A-Z][A-Za-z'’-]*)?$/.test(part) || /^[A-Z]{2,}$/.test(part));
}

function splitHeaderNameAndTitle(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line) return null;
  if (looksLikeContactOrReferenceLine(line)) return null;
  if (looksLikeBadPreviewProfileName(line)) return null;

  const roleStart = line.search(/\b(?:sr\.?|senior|jr\.?|junior|principal|staff|lead|qa|quality|software|web|frontend|front-end|backend|back-end|full-stack|full stack|game|product|project|program|devops|data|biomedical|test|automation)\b/i);
  if (roleStart <= 2) return null;

  const possibleName = cleanPreviewText(line.slice(0, roleStart));
  const possibleTitle = cleanPreviewText(line.slice(roleStart));
  if (!possibleName || !possibleTitle) return null;
  if (!hasPreviewRoleKeyword(possibleTitle)) return null;
  if (!isLikelyPreviewPersonName(possibleName)) return null;

  return { fullName: possibleName, titleLine: possibleTitle };
}

function derivePreviewProfileFromResumeText(resumeTextRaw: string, existingProfile?: Record<string, unknown> | null) {
  const lines = normalizeResumeText(resumeTextRaw)
    .split("\n")
    .map((line) => cleanPreviewText(line))
    .filter(Boolean)
    .slice(0, 18);

  const existing = existingProfile || {};
  const joined = lines.join(" \n ");
  const email = cleanPreviewText(existing.email) || joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = cleanPreviewText(existing.phone) || joined.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)?.[0] || "";
  const linkedin = cleanPreviewText(existing.linkedin) || joined.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+|linkedin\.com\/[^\s]+|\bLinkedIn\b/i)?.[0] || "";

  let fullName = cleanPreviewText(existing.fullName);
  let titleLine = cleanPreviewText(existing.titleLine);
  let locationLine = cleanPreviewText(existing.locationLine);
  let summary = cleanPreviewText(existing.summary);

  if (!fullName || looksLikeBadPreviewProfileName(fullName)) {
    fullName = "";
    for (const line of lines) {
      const split = splitHeaderNameAndTitle(line);
      if (split) {
        fullName = split.fullName;
        if (!titleLine || looksLikeBadPreviewProfileName(titleLine)) titleLine = split.titleLine;
        break;
      }
      if (isLikelyPreviewPersonName(line)) {
        fullName = line;
        break;
      }
    }
  }

  if (!titleLine || looksLikeBadPreviewProfileName(titleLine)) {
    titleLine = "";
    for (const line of lines) {
      if (line === fullName) continue;
      if (looksLikeContactOrReferenceLine(line)) continue;
      if (looksLikeBadPreviewProfileName(line)) continue;
      if (hasPreviewRoleKeyword(line) && line.length <= 90) {
        titleLine = line;
        break;
      }
    }
  }

  if (!summary) {
    const sloganIndex = lines.findIndex((line) => /intricate|unorthodox|moldable/i.test(line));
    const summaryCandidate = lines.find((line, index) => {
      if (sloganIndex >= 0 && index <= sloganIndex) return false;
      if (line === fullName || line === titleLine) return false;
      if (looksLikeContactOrReferenceLine(line)) return false;
      if (looksLikePreviewExperienceBoundary(line) || looksLikePreviewSkillCategoryLine(line)) return false;
      return line.split(/\s+/).length >= 8 && /[.!?]$/.test(line);
    });
    summary = summaryCandidate || "";
  }

  if (looksLikeBadPreviewLocationLine(locationLine)) locationLine = "";

  return { fullName, titleLine, locationLine, email, phone, linkedin, portfolio: cleanPreviewText(existing.portfolio), summary };
}

function parseExplicitPreviewJobHeaderLine(lineRaw: string) {
  const line = cleanPreviewText(lineRaw);
  if (!line || looksLikePreviewNoiseLine(line)) return null;
  if (looksLikeContactOrReferenceLine(line)) return null;
  if (looksLikePreviewSkillCategoryLine(line)) return null;
  if (/^[•●◦▪▫·*]\s+/.test(line)) return null;

  const date = extractPreviewDateRangeToken(line);
  if (!date) return null;

  const beforeDate = cleanPreviewText(line.slice(0, date.index).replace(/[|,•\-–—]+\s*$/g, ""));
  if (!beforeDate) return null;

  let company = "";
  let title = "";

  if (beforeDate.includes("|")) {
    const parts = beforeDate.split(/\s*\|\s*/).map((part) => cleanPreviewText(part)).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0];
      const second = parts[1];
      if (hasPreviewRoleKeyword(first) && !hasPreviewRoleKeyword(second)) {
        title = first;
        company = parts.slice(1).join(" | ");
      } else if (!hasPreviewRoleKeyword(first) && hasPreviewRoleKeyword(second)) {
        company = first;
        title = parts.slice(1).join(" | ");
      } else {
        title = first;
        company = parts.slice(1).join(" | ");
      }
    }
  } else {
    const dash = beforeDate.match(/^(.{2,100}?)\s+(?:-|–|—)\s+(.{2,140})$/);
    if (dash) {
      const left = cleanPreviewText(dash[1]);
      const right = cleanPreviewText(dash[2]);
      if (hasPreviewRoleKeyword(left) && !hasPreviewRoleKeyword(right)) {
        title = left;
        company = right;
      } else {
        company = left;
        title = right;
      }
    }
  }

  company = cleanPreviewText(company);
  title = cleanPreviewText(title);
  if (!company || !title || !hasPreviewRoleKeyword(title)) return null;
  if (looksLikePreviewSkillList(company) || looksLikePreviewSkillList(title)) return null;
  if (looksLikePreviewBrokenJobHeader({ company, title, dates: date.dates, location: "", bullets: [] })) return null;

  return { company, title, dates: date.dates };
}

function buildExperienceJobsFromExplicitResumeLines(experienceText: string) {
  const lines = normalizeResumeText(experienceText)
    .split("\n")
    .map((line) => cleanPreviewText(line))
    .filter(Boolean);

  const jobs: Array<{ id: string; company: string; title: string; dates: string; location: string; bullets: string[] }> = [];
  let current: { id: string; company: string; title: string; dates: string; location: string; bullets: string[] } | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const section = {
      ...current,
      bullets: uniqueCleanPreviewItems(current.bullets, 40)
        .map((bullet) => cleanPreviewBullet(bullet))
        .filter((bullet) => bullet.length >= 10)
        .filter((bullet) => !looksLikePreviewBulletNoise(bullet))
        .filter((bullet) => !looksLikePreviewSkillList(bullet)),
    };
    if ((section.company || section.title || section.bullets.length) && !shouldDropPreviewSection(section)) {
      jobs.push(section);
    }
    current = null;
  };

  for (const line of lines) {
    if (/^(?:professional experience|work experience|job experience|employment history|career history)$/i.test(line)) continue;
    if (/^(?:education|education & certifications|certifications?|certificates|projects|references)\b/i.test(line)) break;
    if (/^early career\b/i.test(line)) continue;

    const header = parseExplicitPreviewJobHeaderLine(line);
    if (header) {
      pushCurrent();
      current = {
        id: `position_${jobs.length + 1}`,
        company: header.company,
        title: header.title,
        dates: header.dates,
        location: "",
        bullets: [],
      };
      continue;
    }

    if (!current) continue;
    if (looksLikeContactOrReferenceLine(line)) continue;
    if (looksLikePreviewSkillCategoryLine(line)) continue;
    if (/^tools\s*:/i.test(line)) continue;

    const bullet = cleanPreviewBullet(line);
    if (!bullet || bullet.length < 10) continue;
    if (looksLikePreviewSkillList(bullet)) continue;
    current.bullets.push(bullet);
  }

  pushCurrent();
  return jobs;
}

function buildExperienceJobsForPreviewFromText(experienceText: string) {
  const lines = normalizeResumeText(experienceText)
    .split("\n")
    .map((l) => String(l || "").trim());

  const jobs: any[] = [];
  let current: any | null = null;
  let pendingHeader: { title: string; company: string } | null = null;

  const pushCurrent = () => {
    if (current) {
      const company = cleanPreviewText(current.company);
      const title = cleanPreviewText(current.title);
      const dates = cleanPreviewText(current.dates);
      const bullets = mergeWrappedBulletLines(Array.isArray(current.bullets) ? current.bullets : [])
        .filter((bullet) => !looksLikePreviewBulletNoise(bullet))
        .filter((bullet) => !looksLikePreviewSkillList(bullet));

      const section = {
        id: current.id || `job_${jobs.length + 1}`,
        company,
        title,
        dates,
        location: cleanPreviewText(current.location),
        bullets,
      };

      if ((section.company || section.title || section.bullets.length) && !shouldDropPreviewSection(section)) {
        jobs.push(section);
      }
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;

    if (/^(education|education & certifications|certifications?|certificates|projects)\b/i.test(cleanPreviewText(line)) && jobs.length > 0) break;
    if (looksLikePreviewSkillCategoryLine(line)) continue;
    if (looksLikePreviewExperienceBoundary(line) && jobs.length > 0 && !/^(professional experience|work experience|job experience|employment history|career history)$/i.test(cleanPreviewText(line))) break;

    const nextLine = cleanPreviewText(lines[i + 1]);
    const nextTwoLine = cleanPreviewText(lines[i + 2]);
    if (looksLikeStandalonePreviewCompanyLine(line) && looksLikeStandalonePreviewTitleLine(nextLine) && looksLikeDateRangeLine(nextTwoLine)) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: line,
        title: nextLine,
        dates: nextTwoLine,
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      i += 2;
      continue;
    }

    const datedHeader = parsePreviewDatedJobHeaderLine(line);
    if (datedHeader) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: datedHeader.company,
        title: datedHeader.title,
        dates: datedHeader.dates,
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      continue;
    }

    const pipeHeader = parsePreviewPipeJobHeaderLine(line);
    if (pipeHeader) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: pipeHeader.company,
        title: pipeHeader.title,
        dates: pipeHeader.dates,
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      continue;
    }

    const inlineTechHeader = parsePreviewInlineCompanyTitleTechDateHeader(line);
    if (inlineTechHeader) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: inlineTechHeader.company,
        title: inlineTechHeader.title,
        dates: inlineTechHeader.dates,
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      continue;
    }

    if (pendingHeader && looksLikeDateRangeLine(line)) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: pendingHeader.company,
        title: pendingHeader.title,
        dates: line.trim(),
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      continue;
    }

    if (looksLikeJobHeaderLine(line)) {
      const parsed = parseJobHeaderLine(line);
      if (parsed) {
        if (!parsed.datesInline) {
          pendingHeader = { title: parsed.title, company: parsed.company };
          continue;
        }

        pushCurrent();
        current = {
          id: `job_${jobs.length + 1}`,
          company: parsed.company,
          title: parsed.title,
          dates: parsed.datesInline,
          location: "",
          bullets: [],
        };
        pendingHeader = null;
      }
      continue;
    }

    if (looksLikeCompanyDashTitleHeader(line)) {
      const parsed = parseCompanyDashTitleHeader(line);
      if (parsed && hasPreviewRoleKeyword(parsed.title)) {
        pendingHeader = { title: parsed.title, company: parsed.company };
        continue;
      }
    }

    if (pendingHeader) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: pendingHeader.company,
        title: pendingHeader.title,
        dates: "",
        location: "",
        bullets: [],
      };
      pendingHeader = null;
    }

    if (!current) continue;
    if (looksLikeMetaLine(line)) continue;
    if (looksLikeContactOrReferenceLine(line)) continue;
    if (looksLikePreviewSkillCategoryLine(line)) continue;

    const isGlyphBullet = /^[â€¢â—\u2022\u00B7oï‚§-]\s+/.test(line);
    const cleaned = isGlyphBullet ? cleanLeadingBulletGarbage(line) : line;
    const candidate = String(cleaned || "").trim();
    if (!candidate || candidate.length < 12) continue;
    if (looksLikePreviewSkillList(candidate)) continue;

    current.bullets = mergeWrappedBulletLines([...(current.bullets || []), candidate]);
  }

  if (pendingHeader) {
    pushCurrent();
    current = {
      id: `job_${jobs.length + 1}`,
      company: pendingHeader.company,
      title: pendingHeader.title,
      dates: "",
      location: "",
      bullets: [],
    };
    pendingHeader = null;
  }
  pushCurrent();

  for (const j of jobs) {
    const seen = new Set<string>();
    j.bullets = (j.bullets || []).filter((b: string) => {
      const k = normalizeForContains(b);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  return normalizePreviewJobSections(jobs);
}

function jobsLookPlaceholder(jobs: any[]) {
  const arr = Array.isArray(jobs) ? jobs : [];
  if (!arr.length) return true;

  let placeholderCount = 0;
  for (const j of arr) {
    const company = String(j?.company ?? "").trim();
    const title = String(j?.title ?? "").trim();
    const dates = String(j?.dates ?? "").trim();

    const isPlaceholder =
      !company ||
      !title ||
      company === "Company" ||
      title === "Role" ||
      dates === "Dates" ||
      (dates.length === 0 && (company === "Company" || title === "Role"));

    if (isPlaceholder) placeholderCount++;
  }

  return placeholderCount / arr.length >= 0.4;
}

type SniffedType = "pdf" | "docx" | "doc" | "txt" | "unknown";

function startsWith(buf: Buffer, bytes: number[]) {
  if (!Buffer.isBuffer(buf)) return false;
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

function sniffBufferType(buf: Buffer): SniffedType {
  if (buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return "docx";
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc";

  const head = buf.slice(0, Math.min(buf.length, 4096));
  if (head.length) {
    let printable = 0;
    for (const b of head) {
      if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e)) printable++;
    }
    if (printable / head.length > 0.92) return "txt";
  }

  return "unknown";
}

function friendlyUnsupportedDocMsg(extra?: string) {
  return (
    "Unsupported Word format (.doc). Please convert it to .docx or export to PDF, then upload again." +
    (extra ? ` ${extra}` : "")
  );
}

function extractLiText(html: string): string[] {
  const matches = [...String(html ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const bullets = matches
    .map((m) => stripTagsToText(m[1]))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(bullets));
}

async function extractDocxTextAndBulletsFromBuffer(
  buffer: Buffer
): Promise<{ text: string; bullets: string[]; html: string }> {
  const sniffed = sniffBufferType(buffer);
  if (sniffed !== "docx") {
    if (sniffed === "doc") throw new Error(friendlyUnsupportedDocMsg());
    throw new Error(`File is not a valid .docx (zip). Detected: ${sniffed}. Please upload a real DOCX or PDF.`);
  }

  const { value: html } = await mammoth.convertToHtml({ buffer });
  const bullets = extractLiText(html);

  const text = stripTagsToText(html);
  const textWithBullets = bullets.length > 0 ? `${text}\n\n${bullets.map((b) => `- ${b}`).join("\n")}` : text;

  return { text: textWithBullets, bullets, html };
}

function extractExperienceSection(fullText: string) {
  const text = normalizeResumeText(fullText);
  const lower = text.toLowerCase();

  const endHeadingRegex =
    /\n\s*(skills|personal skills|technical skills|certificates|certifications|education|projects|references|achievements|training|volunteer|interests)\b/i;

  const startNeedles = ["professional experience", "work experience", "employment history", "experience"];

  let bestStartIdx = -1;
  let bestNeedle = "";
  for (const needle of startNeedles) {
    const idx = lower.indexOf(needle);
    if (idx !== -1 && (bestStartIdx === -1 || idx < bestStartIdx)) {
      bestStartIdx = idx;
      bestNeedle = needle;
    }
  }

  if (bestStartIdx !== -1) {
    const afterStart = text.slice(bestStartIdx);
    const endMatch = afterStart.match(endHeadingRegex);
    const endIdx = endMatch?.index;
    const experienceText = typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

    return { experienceText: normalizeResumeText(experienceText), foundSection: true, mode: `heading:${bestNeedle}` };
  }

  const lines = text.split("\n");
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const dash = "[â€“â€”-]";
  const dateRangeRegex = new RegExp(
    `\\b${month}\\s+${year}\\s*${dash}\\s*(${month}\\s+${year}|present|current)\\b`,
    "i"
  );

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (dateRangeRegex.test(l) && l.length >= 14) {
      startLine = i;
      break;
    }
  }

  if (startLine === -1) return { experienceText: text, foundSection: false, mode: "none" };

  const afterStart = lines.slice(startLine).join("\n");
  const endMatch = afterStart.match(endHeadingRegex);
  const endIdx = endMatch?.index;
  const experienceText = typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

  return { experienceText: normalizeResumeText(experienceText), foundSection: true, mode: "heuristic" };
}

function extractMetaBlocks(fullText: string) {
  const text = normalizeResumeText(fullText);

  const lines = text
    .split("\n")
    .map((l) => cleanLeadingBulletGarbage(l))
    .map((l) => l.trim())
    .filter(Boolean);

  const gamesShippedRegex = /^(?:ðŸŽ®\s*)?games shipped:\s*(.*)$/i;
  const metricLikeRegex = /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b)/i;
  const actionVerbRe = /\b(served|supported|managed|coordinated|tested|reviewed|developed|created|updated|collaborated|maintained|implemented|organized|completed|prepared|piloted|reported|ensured|integrated|wrote|followed|communicated)\b/i;

  const gamesShipped: string[] = [];
  const metrics: string[] = [];
  const seenGames = new Set<string>();
  const seenMetrics = new Set<string>();

  const pushGame = (value: string) => {
    const cleaned = value.replace(/^[-â€¢]\s*/, "").replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    if (cleaned.length > 90) return;
    if (actionVerbRe.test(cleaned)) return;
    const k = normalizeForContains(cleaned);
    if (!seenGames.has(k)) {
      seenGames.add(k);
      gamesShipped.push(cleaned);
    }
  };

  for (const l0 of lines) {
    const l = l0.replace(/\s+/g, " ").trim();
    if (!l) continue;

    const gamesMatch = l.match(gamesShippedRegex);
    if (gamesMatch) {
      const rest = String(gamesMatch[1] ?? "").trim();
      if (rest) {
        const parts = rest.split(/\s*[â€¢|]\s*|\s*,\s*(?=[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
        if (parts.length > 1) {
          parts.forEach(pushGame);
        } else {
          pushGame(rest);
        }
      }
      continue;
    }

    if (l.length <= 110 && metricLikeRegex.test(l)) {
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(19|20)\d{2}\b/i.test(l)) continue;
      if (/\b\d{3}[-.)\s]*\d{3}[-.\s]*\d{4}\b/.test(l)) continue;
      if (actionVerbRe.test(l) && !/%|\$\s?\d|\b\d+(\.\d+)?x\b/i.test(l)) continue;

      const k = normalizeForContains(l);
      if (!seenMetrics.has(k)) {
        seenMetrics.add(k);
        metrics.push(l);
      }
    }
  }

  return {
    gamesShipped: Array.from(new Set(gamesShipped)).slice(0, 24),
    metrics: Array.from(new Set(metrics)).slice(0, 50),
  };
}

async function ensurePdfJsPolyfills() {
  if (!(globalThis as any).DOMMatrix) {
    try {
      const dm: any = await import("dommatrix");
      (globalThis as any).DOMMatrix = dm?.DOMMatrix ?? dm?.default ?? dm;
    } catch {}
  }
  if (!(globalThis as any).Path2D) {
    (globalThis as any).Path2D = class Path2DStub {};
  }
  if (!(globalThis as any).ImageData) {
    (globalThis as any).ImageData = class ImageDataStub {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: any, width: number, height?: number) {
        this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data || []);
        this.width = Number(width || 0);
        this.height = Number(height ?? 0);
      }
    };
  }
}

function normalizePdfText(s: string) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\b([a-z])\s+([a-z]{1,2})\s+([a-z])\b/gi, "$1$2$3")
    .replace(/[ \t]+/g, " ")
    .trim();
}

type PdfItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hasEOL: boolean;
};

type PdfLine = {
  y: number;
  xMin: number;
  xMax: number;
  parts: { x: number; text: string }[];
};

function buildItemsFromTextContentItems(items: any[]): PdfItem[] {
  const out: PdfItem[] = [];
  for (const it of items) {
    const raw = String(it?.str ?? "");
    const text = normalizePdfText(raw);
    if (!text && !it?.hasEOL) continue;

    const tr = Array.isArray(it?.transform) ? it.transform : null;
    const x = tr ? Number(tr[4] ?? 0) : 0;
    const y = tr ? Number(tr[5] ?? 0) : 0;

    out.push({
      str: text,
      x,
      y,
      w: Number(it?.width ?? 0),
      h: Number(it?.height ?? 0),
      hasEOL: Boolean(it?.hasEOL),
    });
  }
  return out;
}

function groupItemsIntoLines(items: PdfItem[]) {
  const sorted = [...items].sort((a, b) => {
    if (b.y !== a.y) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PdfLine[] = [];
  const Y_TOL = 2.25;

  for (const it of sorted) {
    if (!it.str && !it.hasEOL) continue;

    let line = lines.find((l) => Math.abs(l.y - it.y) <= Y_TOL);
    if (!line) {
      line = { y: it.y, xMin: it.x, xMax: it.x + (it.w || 0), parts: [] };
      lines.push(line);
    }

    if (it.str) {
      line.parts.push({ x: it.x, text: it.str });
      line.xMin = Math.min(line.xMin, it.x);
      line.xMax = Math.max(line.xMax, it.x + (it.w || 0));
    }
  }

  const normalized: { y: number; xMin: number; xMax: number; text: string }[] = [];

  for (const l of lines) {
    const parts = [...l.parts].sort((a, b) => a.x - b.x);

    let s = "";
    let lastX: number | null = null;

    for (const p of parts) {
      const t = normalizePdfText(p.text);
      if (!t) continue;

      if (s.length === 0) {
        s = t;
        lastX = p.x;
        continue;
      }

      const gap = lastX == null ? 0 : p.x - lastX;
      if (gap > 6) s += " ";
      if (!s.endsWith(" ") && !/^[,.:;)\]]/.test(t) && !/[([/]\s*$/.test(s)) s += " ";

      s += t;
      lastX = p.x;
    }

    const text = normalizePdfText(s);
    if (!text) continue;
    normalized.push({ y: l.y, xMin: l.xMin, xMax: l.xMax, text });
  }

  normalized.sort((a, b) => b.y - a.y);
  return normalized;
}

function splitIntoColumnsIfNeeded(lines: { y: number; xMin: number; xMax: number; text: string }[]) {
  if (lines.length < 8) return { mode: "single" as const, columns: [lines] };

  const xMins = lines.map((l) => l.xMin).sort((a, b) => a - b);
  const medianXMin = xMins[Math.floor(xMins.length / 2)] ?? 0;
  const maxXMin = xMins[xMins.length - 1] ?? 0;
  const spread = maxXMin - medianXMin;

  if (spread < 140) return { mode: "single" as const, columns: [lines] };

  const splitX = medianXMin + Math.min(180, Math.max(120, spread * 0.55));

  const left: typeof lines = [];
  const right: typeof lines = [];

  for (const l of lines) {
    const mid = (l.xMin + l.xMax) / 2;
    if (mid >= splitX) right.push(l);
    else left.push(l);
  }

  if (right.length <= Math.max(3, Math.floor(lines.length * 0.12))) {
    return { mode: "single" as const, columns: [lines] };
  }

  return { mode: "two-column" as const, columns: [left, right] };
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    await ensurePdfJsPolyfills();

    if (!(globalThis as any).DOMMatrix) {
      throw new Error("DOMMatrix is not defined (polyfill failed).");
    }

    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
    }

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdf = await loadingTask.promise;
    let out = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const rawItems: any[] = Array.isArray(content?.items) ? content.items : [];

      if (!rawItems.length) {
        out += "\n\n";
        continue;
      }

      const items = buildItemsFromTextContentItems(rawItems);
      const lines = groupItemsIntoLines(items);
      const col = splitIntoColumnsIfNeeded(lines);
      out += col.columns.map((colLines) => colLines.map((l) => l.text).join("\n")).join("\n\n") + "\n\n";
    }

    return normalizeResumeText(out);
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : String(err);
    throw new Error(`PDF parse failed: ${msg}`);
  }
}

type PdfExtractionResult = {
  text: string;
  parserUsed: "pdfjs" | "vision_ocr";
  warnings: string[];
  pdfInfo: {
    pdfQuality?: ReturnType<typeof assessPdfTextQuality>;
    pdfjsError?: string | null;
    ocrPages?: number | null;
    gcsInputUri?: string;
    gcsOutputPrefix?: string;
  };
};

async function extractResumeTextFromPdfWithOcrGate(buffer: Buffer): Promise<PdfExtractionResult> {
  const warnings: string[] = [];
  let pdfjsText = "";
  let pdfjsError: string | null = null;

  try {
    pdfjsText = await extractTextFromPdfBuffer(buffer);
  } catch (e: any) {
    pdfjsError = e?.message ? String(e.message) : String(e);
    warnings.push(PDF_WEIRD_WARNING);
  }

  const quality = pdfjsText ? assessPdfTextQuality(pdfjsText) : null;

  if (!pdfjsText || (quality && !quality.ok)) {
    warnings.push(PDF_WEIRD_WARNING);

    const ocr = await ocrPdfWithGoogleVision(buffer);
    const ocrText = normalizeResumeText(ocr.text);

    return {
      text: ocrText,
      parserUsed: "vision_ocr",
      warnings: Array.from(new Set(warnings)),
      pdfInfo: {
        pdfQuality: quality ?? undefined,
        pdfjsError,
        ocrPages: ocr.pages ?? null,
        gcsInputUri: ocr.gcsInputUri,
        gcsOutputPrefix: ocr.gcsOutputPrefix,
      },
    };
  }

  return {
    text: normalizeResumeText(pdfjsText),
    parserUsed: "pdfjs",
    warnings: [],
    pdfInfo: {
      pdfQuality: quality ?? undefined,
      pdfjsError: null,
      ocrPages: null,
    },
  };
}

async function extractResumeFromFile(file: File): Promise<{
  text: string;
  bulletsFromFile?: string[];
  detectedType: string;
  parserUsed?: "pdfjs" | "vision_ocr";
  warnings?: string[];
  pdfInfo?: any;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffBufferType(buffer);

  if (sniffed === "pdf") {
    const gated = await extractResumeTextFromPdfWithOcrGate(buffer);
    return {
      text: gated.text,
      bulletsFromFile: undefined,
      detectedType: "pdf",
      parserUsed: gated.parserUsed,
      warnings: gated.warnings,
      pdfInfo: gated.pdfInfo,
    };
  }

  if (sniffed === "docx") {
    const { text, bullets } = await extractDocxTextAndBulletsFromBuffer(buffer);
    return { text, bulletsFromFile: bullets, detectedType: "docx" };
  }

  if (sniffed === "doc") throw new Error(friendlyUnsupportedDocMsg());
  if (sniffed === "txt") return { text: buffer.toString("utf8"), bulletsFromFile: undefined, detectedType: "txt" };

  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".doc")) throw new Error(friendlyUnsupportedDocMsg("(It looks like a legacy Word .doc file.)"));
  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}

function inferExtFromUrl(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "pdf";
  if (clean.endsWith(".docx")) return "docx";
  if (clean.endsWith(".doc")) return "doc";
  if (clean.endsWith(".txt")) return "txt";
  return "";
}

function inferTypeFromContentType(ct: string) {
  const c = (ct || "").toLowerCase();
  if (c.includes("application/pdf")) return "pdf";
  if (c.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) return "docx";
  if (c.includes("application/msword")) return "doc";
  if (c.includes("text/plain")) return "txt";
  return "";
}

async function fetchBlobAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const tryFetch = async (withAuth: boolean) => {
    const headers: Record<string, string> = {};
    if (withAuth) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { headers, cache: "no-store" });
  };

  let res = await tryFetch(false);
  if (!res.ok && (res.status === 401 || res.status === 403)) res = await tryFetch(true);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch resumeBlobUrl. Status ${res.status}. ${text ? `Body: ${text}` : ""}`);
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "",
  };
}

async function extractResumeFromUrl(resumeBlobUrl: string): Promise<{
  text: string;
  bulletsFromFile?: string[];
  sizeBytes: number;
  detectedType: string;
  parserUsed?: "pdfjs" | "vision_ocr";
  warnings?: string[];
  pdfInfo?: any;
}> {
  const { buffer, contentType } = await fetchBlobAsBuffer(resumeBlobUrl);

  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `File too large. Max size is ${MAX_FILE_MB}MB. Uploaded file is ${(buffer.byteLength / (1024 * 1024)).toFixed(
        2
      )}MB.`
    );
  }

  const sniffed = sniffBufferType(buffer);
  const typeFromCt = inferTypeFromContentType(contentType);
  const typeFromUrl = inferExtFromUrl(resumeBlobUrl);
  const detectedType = sniffed !== "unknown" ? sniffed : typeFromCt || typeFromUrl || "unknown";

  if (detectedType === "docx") {
    const { text, bullets } = await extractDocxTextAndBulletsFromBuffer(buffer);
    return { text, bulletsFromFile: bullets, sizeBytes: buffer.byteLength, detectedType };
  }

  if (detectedType === "pdf") {
    const gated = await extractResumeTextFromPdfWithOcrGate(buffer);
    return {
      text: gated.text,
      bulletsFromFile: undefined,
      sizeBytes: buffer.byteLength,
      detectedType,
      parserUsed: gated.parserUsed,
      warnings: gated.warnings,
      pdfInfo: gated.pdfInfo,
    };
  }

  if (detectedType === "doc") {
    throw new Error(
      friendlyUnsupportedDocMsg(`(Detected content-type "${contentType || "unknown"}", url "${resumeBlobUrl}")`)
    );
  }

  if (detectedType === "txt") {
    return { text: buffer.toString("utf8"), bulletsFromFile: undefined, sizeBytes: buffer.byteLength, detectedType };
  }

  throw new Error(
    `Unsupported resumeBlobUrl file type. Detected "${detectedType}". Content-Type was "${contentType || "unknown"}".`
  );
}

function parseOnlyExperienceFlagFromFormData(v: FormDataEntryValue | null) {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "on") return true;
  if (s === "false" || s === "0" || s === "off") return false;
  return undefined;
}

function normalizeBulletsForSuggestions(args: { bullets: string[]; bulletJobIds?: string[]; fallbackJobId?: string }) {
  const { bullets, bulletJobIds, fallbackJobId } = args;

  return (bullets || [])
    .map((t0, i) => {
      const text = String(t0 || "").trim();
      if (!text) return null;

      const jobId = bulletJobIds?.[i] || fallbackJobId || "job_default";
      const b: ResumeBullet = { id: `b${i + 1}`, text, jobId };
      return b;
    })
    .filter((x): x is ResumeBullet => Boolean(x));
}

function flattenFromJobs(jobsIn: any[]) {
  const outBullets: string[] = [];
  const outJobIds: string[] = [];

  for (const job of Array.isArray(jobsIn) ? jobsIn : []) {
    for (const b of Array.isArray(job?.bullets) ? job.bullets : []) {
      const t = String(b || "").trim();
      if (!t) continue;
      outBullets.push(t);
      outJobIds.push(String(job?.id ?? "job_default"));
    }
  }

  return { outBullets, outJobIds };
}

function looksLikeWrappedBulletContinuation(prev: string, next: string) {
  const a = String(prev || "").trim();
  const b = String(next || "").trim();
  if (!a || !b) return false;

  if (looksLikeMetaLine(b)) return false;
  if (looksLikeContactOrReferenceLine(b)) return false;
  if (looksLikeDateRangeLine(b)) return false;
  if (looksLikeJobHeaderLine(b)) return false;
  if (looksLikeCompanyDashTitleHeader(b)) return false;
  if (/^[â€¢â—\u2022\u00B7oï‚§-]\s+/.test(b)) return false;

  const prevEndsSentence = /[.!?]$/.test(a);
  const prevEndsSoftWrap =
    /[,;:()\/-]$/.test(a) ||
    /\b(and|or|to|of|for|with|by|in|on|from|using|including|through|across|via)\b$/i.test(a);
  const nextStartsLower = /^[a-z]/.test(b);
  const nextStartsDigitish = /^[\d(%$]/.test(b);
  const nextStartsConnector =
    /^(and|or|to|of|for|with|by|in|on|from|using|including|through|across|via|while|which|that)\b/i.test(b);

  if ((!prevEndsSentence || prevEndsSoftWrap) && (nextStartsLower || nextStartsDigitish || nextStartsConnector)) {
    return true;
  }

  if (!prevEndsSentence && (a.length <= 90 || b.length <= 90)) return true;
  return false;
}

function mergeWrappedBulletLines(linesIn: string[]) {
  const lines = (Array.isArray(linesIn) ? linesIn : []).map((x) => String(x || "").trim()).filter(Boolean);
  if (!lines.length) return [] as string[];

  const merged: string[] = [];
  for (const line of lines) {
    if (!merged.length) {
      merged.push(line);
      continue;
    }

    const prev = merged[merged.length - 1];
    if (looksLikeWrappedBulletContinuation(prev, line)) {
      merged[merged.length - 1] = `${prev} ${line}`.replace(/\s+/g, " ").trim();
    } else {
      merged.push(line);
    }
  }

  return merged;
}

function scanBulletsFromTextFallback(text: string) {
  const lines = normalizeResumeText(text)
    .split("\n")
    .map((l) => String(l || "").trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  const bulletRe = /^[\s]*([â€¢â—\u2022\u00B7oï‚§-])\s+/;
  let current: string | null = null;

  const flush = () => {
    const candidate = String(current || "").trim();
    current = null;
    if (!candidate || candidate.length < 12) return;
    if (looksLikeContactOrReferenceLine(candidate)) return;
    if (looksLikeMetaLine(candidate)) return;

    const k = normalizeForContains(candidate);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(candidate);
  };

  for (const line of lines) {
    if (bulletRe.test(line)) {
      flush();
      current = cleanLeadingBulletGarbage(line);
      continue;
    }

    if (current && looksLikeWrappedBulletContinuation(current, line)) {
      current = `${current} ${line}`.replace(/\s+/g, " ").trim();
      continue;
    }

    flush();
  }

  flush();
  return out;
}

export async function POST(req: Request) {
  console.log(BOOT_TAG, { at: new Date().toISOString() });

  let chargedUserId = "";
  let chargedCost = 0;
  let jobsAnalyticsContext: JobsAnalyticsContext | null = null;

  try {
    const contentType = req.headers.get("content-type") || "";

    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return okJson({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return okJson({ ok: false, error: "User not found" }, { status: 401 });

    let resumeText = "";
    let jobText = "";
    let targetPosition = "";
    let onlyExperienceBullets = true;
    let isFirstTimeSetup = false;

    let bulletsFromFile: string[] = [];
    let blobDebug: any = null;

    const warnings: string[] = [];
    let parserUsed: "pdfjs" | "vision_ocr" | "mammoth" | "txt" | "unknown" = "unknown";
    let pdfInfo: any = null;
    let detectedType = "unknown";
    let parserCompatibility: ResumeParserCompatibilityOutput | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText");
      const target = form.get("targetPosition");

      const flagRaw = form.get("onlyExperienceBullets");
      const parsedFlag = parseOnlyExperienceFlagFromFormData(flagRaw);
      if (typeof parsedFlag === "boolean") onlyExperienceBullets = parsedFlag;

      const firstTimeSetupRaw = form.get("isFirstTimeSetup");
      if (typeof firstTimeSetupRaw === "string") {
        isFirstTimeSetup = ["1", "true", "yes", "on"].includes(firstTimeSetupRaw.toLowerCase());
      }

      jobText = normalizeJobText(job);
      targetPosition = normalizeJobText(target);

      jobsAnalyticsContext = buildJobsAnalyticsContext({
        jobId: form.get("jobId"),
        resumeProfileId: form.get("resumeProfileId"),
        sourceSlug: form.get("sourceSlug"),
        company: form.get("company"),
        jobTitle: form.get("jobTitle") ?? target,
        mode: form.get("mode"),
        bundleSessionId: form.get("bundleSessionId"),
      });

      if (file && file instanceof File) {
        if (file.size > MAX_FILE_BYTES) {
          return okJson(
            {
              ok: false,
              error: `File too large. Max size is ${MAX_FILE_MB}MB. Tip: export an optimized PDF or upload DOCX.`,
            },
            { status: 400 }
          );
        }

        const extracted = await extractResumeFromFile(file);
        detectedType = extracted.detectedType;
        resumeText = sanitizeResumeInput(extracted.text);

        if (extracted.parserUsed) parserUsed = extracted.parserUsed;
        if (Array.isArray(extracted.warnings)) warnings.push(...extracted.warnings);
        if (extracted.pdfInfo) pdfInfo = extracted.pdfInfo;

        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];

        if (!extracted.parserUsed) {
          parserUsed = detectedType === "docx" ? "mammoth" : detectedType === "txt" ? "txt" : "unknown";
        }
      } else {
        resumeText = sanitizeResumeInput(resumeTextFallback);
      }
    } else if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as any;

      const resumeBlobUrl = String(body.resumeBlobUrl ?? "").trim();
      jobText = normalizeJobText(body.jobText ?? body.jobPostingText);
      targetPosition = normalizeJobText(body.targetPosition);

      jobsAnalyticsContext = buildJobsAnalyticsContext({
        jobId: body.jobId,
        resumeProfileId: body.resumeProfileId,
        sourceSlug: body.sourceSlug,
        company: body.company,
        jobTitle: body.jobTitle ?? body.targetPosition,
        mode: body.mode,
        bundleSessionId: body.bundleSessionId,
      });

      if (typeof body.onlyExperienceBullets === "boolean") {
        onlyExperienceBullets = body.onlyExperienceBullets;
      }

      if (typeof body.isFirstTimeSetup === "boolean") {
        isFirstTimeSetup = body.isFirstTimeSetup;
      }

      if (resumeBlobUrl) {
        const extracted = await extractResumeFromUrl(resumeBlobUrl);
        detectedType = extracted.detectedType;
        resumeText = sanitizeResumeInput(extracted.text);

        if (extracted.parserUsed) parserUsed = extracted.parserUsed;
        if (Array.isArray(extracted.warnings)) warnings.push(...extracted.warnings);
        if (extracted.pdfInfo) pdfInfo = extracted.pdfInfo;

        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];

        blobDebug = {
          usedBlobUrl: true,
          detectedType: extracted.detectedType,
          sizeBytes: extracted.sizeBytes,
          url: resumeBlobUrl,
          parserUsed: extracted.parserUsed ?? null,
        };

        const extra = sanitizeResumeInput(body.resumeText);
        if (extra && extra.length >= 200 && extra !== resumeText) {
          blobDebug.appendedResumeText = false;
          blobDebug.ignoredResumeText = true;
        }

        if (!extracted.parserUsed) {
          parserUsed = detectedType === "docx" ? "mammoth" : detectedType === "txt" ? "txt" : "unknown";
        }
      } else {
        resumeText = sanitizeResumeInput(body.resumeText);
      }
    } else {
      return okJson(
        { ok: false, error: "Unsupported content type. Send JSON or multipart/form-data (file upload)." },
        { status: 415 }
      );
    }

    let warningsUnique = Array.from(new Set(warnings));

    if (!resumeText || !jobText || !targetPosition) {
      return okJson({ ok: false, error: "Missing resumeText (or file/resumeBlobUrl), jobText, or targetPosition" }, { status: 400 });
    }

    if (resumeText.length < 300) {
      return okJson(
        {
          ok: false,
          error: "Resume text too short. If you uploaded a PDF, it may be scanned. Try DOCX or paste text.",
          warnings: warningsUnique,
          debug: {
            parserUsed,
            detectedType,
            pdfInfo,
            blobDebug,
            rawText: resumeText,
            normalizedText: normalizeResumeText(resumeText),
          },
        },
        { status: 400 }
      );
    }

    const parserDocument = parseResumeDocument(resumeText, {
      sourceMimeType: detectedType,
      extractor: resolveResumeParserExtractor({ parserUsed, detectedType }),
      extractedAt: new Date().toISOString(),
    });
    parserCompatibility = toResumeParserCompatibilityOutput(parserDocument);
    const parserStructuredPreview = buildStructuredPreviewSnapshot({
      document: parserDocument,
      parserCompatibility,
      targetPosition,
    });

    if (parserCompatibility.resumeText) {
      resumeText = sanitizeResumeInput(parserCompatibility.resumeText);
    }

    warnings.push(...formatResumeParserWarnings(parserCompatibility));
    warningsUnique = Array.from(new Set(warnings));

    const effectiveJobsContextResult = await resolveEffectiveJobsAnalyticsContext(
      jobsAnalyticsContext,
      jobText,
      "resume"
    );
    jobsAnalyticsContext = effectiveJobsContextResult.context;

    const chargeConfig = buildJobsChargeConfig(jobsAnalyticsContext, "resume");
    const eligibleForFreeSetup =
      isFirstTimeSetup &&
      chargeConfig.mode !== "apply_pack" &&
      (await prisma.resumeProfile.count({ where: { userId: dbUser.id } })) === 0;

    const charged = eligibleForFreeSetup
      ? { ok: true, balance: await getCreditBalance(dbUser.id), alreadyApplied: true }
      : await chargeCredits({
          userId: dbUser.id,
          cost: chargeConfig.cost,
          reason: chargeConfig.reason,
          eventType: "analyze",
          ref: chargeConfig.ref,
          meta: {
            cost: chargeConfig.cost,
            jobId: jobsAnalyticsContext?.jobId ?? null,
            resumeProfileId: jobsAnalyticsContext?.resumeProfileId ?? null,
            company: jobsAnalyticsContext?.company ?? null,
            jobTitle: jobsAnalyticsContext?.jobTitle ?? null,
            sourceSlug: jobsAnalyticsContext?.sourceSlug ?? null,
            mode: chargeConfig.mode,
            bundleSessionId: chargeConfig.bundleSessionId ?? null,
        bundleOverrideInvalidated: effectiveJobsContextResult.bundleOverrideInvalidated,
            setupMode: isFirstTimeSetup,
            freeSetupGranted: eligibleForFreeSetup,
          },
        });

    if (!charged.ok) {
      await writeJobsAnalyticsEvent({
        userId: dbUser.id,
        event: "job_resume_analysis_failed",
        route: "/resume",
        context: jobsAnalyticsContext,
        meta: {
          creditsCost: eligibleForFreeSetup ? 0 : chargeConfig.cost,
        freeSetupGranted: eligibleForFreeSetup,
          error: "OUT_OF_CREDITS",
          refunded: false,
          parserUsed,
          detectedType,
        },
      });

      if (jobsAnalyticsContext?.mode === "apply_pack") {
        await writeJobsAnalyticsEvent({
          userId: dbUser.id,
          event: "job_apply_pack_failed",
          route: "/resume",
          context: jobsAnalyticsContext,
          meta: {
            step: "resume_analyze",
            creditsCost: chargeConfig.cost,
            error: "OUT_OF_CREDITS",
            refunded: false,
          },
        });
      }

      return okJson({ ok: false, error: "OUT_OF_CREDITS", balance: charged.balance }, { status: 402 });
    }

    chargedUserId = dbUser.id;
    chargedCost = charged.alreadyApplied ? 0 : chargeConfig.cost;

    await writeJobsAnalyticsEvent({
      userId: dbUser.id,
      event: "job_resume_credit_charged",
      route: "/api/analyze",
      context: jobsAnalyticsContext,
      meta: {
        creditsCost: chargeConfig.cost,
        parserUsed,
        detectedType,
        targetPosition,
      },
    });

    const analysis: any = analyzeKeywordFit(jobText, resumeText);
    const metaBlocks = isFirstTimeSetup
      ? { gamesShipped: [] as string[], metrics: [] as string[] }
      : extractMetaBlocks(resumeText);
    const atsBase = buildAtsAnalysis({ resumeText, jobText, targetPosition });
    const ats = bridgeJobDescriptionKeywordFitIntoAts({ ats: atsBase, analysis });

    const highlights = {
      gamesShipped: metaBlocks.gamesShipped,
      keyMetrics: metaBlocks.metrics,
    };

    const experienceSlice = extractExperienceSection(resumeText);
    const bulletSourceText = onlyExperienceBullets ? experienceSlice.experienceText : resumeText;

    let experienceJobs: any[] = [];
    let bullets: string[] = [];
    let bulletJobIds: string[] = [];

    const normalizeJobs = (jobsIn: any[]) =>
      (Array.isArray(jobsIn) ? jobsIn : [])
        .map((j, index) => {
          const bullets = uniqueCleanPreviewItems(Array.isArray(j?.bullets) ? j.bullets : [], 40)
            .map((bullet) => cleanPreviewBullet(bullet))
            .filter((bullet) => !looksLikePreviewBulletNoise(bullet))
            .filter((bullet) => !looksLikePreviewSkillList(bullet));
          const company = cleanPreviewText(j?.company);
          const title = cleanPreviewText(j?.title);

          return {
            id: cleanPreviewText(j?.id) || `job_${index + 1}`,
            company: company || "Company",
            title: title || "Role",
            dates: cleanPreviewText(j?.dates),
            location: cleanPreviewText(j?.location),
            bullets,
          };
        })
        .filter((j) => j.bullets.length || (j.company !== "Company" || j.title !== "Role"));

    const parserJobs = normalizeJobs(parserCompatibility?.jobs || []);
    const parserFlat = flattenFromJobs(parserJobs);
    const parserBullets = filterBadBullets(
      parserFlat.outBullets.length
        ? parserFlat.outBullets
        : mergeWrappedBulletLines(uniqueCleanPreviewItems(parserCompatibility?.bullets || [], 80))
    );

    const explicitPreviewJobs = normalizeJobs(buildExperienceJobsFromExplicitResumeLines(experienceSlice.experienceText || bulletSourceText));
    const textPreviewJobs = normalizeJobs(buildExperienceJobsForPreviewFromText(experienceSlice.experienceText || bulletSourceText));
    const parserPreviewJobs = normalizePreviewJobSections(parserJobs);
    const selectedPreviewJobs = selectBestPreviewJobSections([
      { name: "explicit", jobs: explicitPreviewJobs },
      { name: "text", jobs: textPreviewJobs },
      { name: "parser", jobs: parserJobs },
    ]);
    const selectedPreviewDatedCount = selectedPreviewJobs.filter((job) => !!cleanPreviewText(job?.dates)).length;
    const parserPreviewDatedCount = parserPreviewJobs.filter((job) => !!cleanPreviewText(job?.dates)).length;
    const shouldPreferParserPreview =
      parserPreviewJobs.length > selectedPreviewJobs.length &&
      parserPreviewDatedCount >= selectedPreviewDatedCount + 2;
    const resolvedPreviewJobs = shouldPreferParserPreview ? parserPreviewJobs : selectedPreviewJobs;

    if (resolvedPreviewJobs.length) {
      experienceJobs = resolvedPreviewJobs;
      const selectedFlat = flattenFromJobs(experienceJobs);
      const selectedBullets = filterBadBullets(selectedFlat.outBullets);
      if (selectedBullets.length) {
        const keep = new Set(selectedBullets.map((b) => normalizeForContains(b)));
        bullets = selectedBullets;
        bulletJobIds = [];
        for (let i = 0; i < selectedFlat.outBullets.length; i++) {
          if (keep.has(normalizeForContains(selectedFlat.outBullets[i]))) {
            bulletJobIds.push(selectedFlat.outJobIds[i] || experienceJobs[0]?.id || "job_default");
          }
        }
      }
    } else if (parserJobs.length) {
      experienceJobs = parserJobs;
    }

    if (!bullets.length && parserBullets.length) {
      bullets = parserBullets;
      if (parserFlat.outBullets.length) {
        const keep = new Set(parserBullets.map((b) => normalizeForContains(b)));
        bulletJobIds = [];
        for (let i = 0; i < parserFlat.outBullets.length; i++) {
          if (keep.has(normalizeForContains(parserFlat.outBullets[i]))) {
            bulletJobIds.push(parserFlat.outJobIds[i] || experienceJobs[0]?.id || "job_default");
          }
        }
      } else {
        const fallbackJobId = experienceJobs[0]?.id || "job_default";
        bulletJobIds = bullets.map(() => fallbackJobId);
      }
    }

    const seededFileBulletsRaw = filterBadBullets(uniqueCleanPreviewItems(bulletsFromFile || [], 80));
    let seededFileBullets = seededFileBulletsRaw;

    if (onlyExperienceBullets) {
      const expHaystack = normalizeForContains(experienceSlice.experienceText);
      seededFileBullets = seededFileBullets.filter((b) => {
        const needle = normalizeForContains(b);
        return !!needle && expHaystack.includes(needle);
      });
    }

    if (!bullets.length && experienceJobs.length) {
      const flatJobs = flattenFromJobs(experienceJobs);
      bullets = filterBadBullets(flatJobs.outBullets);
      bulletJobIds = flatJobs.outJobIds;
    }

    if (!bullets.length) {
      const scanned = scanBulletsFromTextFallback(bulletSourceText);
      if (scanned.length) {
        bullets = scanned;
        const fallbackJobId = experienceJobs[0]?.id || "job_default";
        bulletJobIds = bullets.map(() => fallbackJobId);
      }
    }

    if (!bullets.length && seededFileBullets.length) {
      bullets = seededFileBullets;
      const fallbackJobId = experienceJobs[0]?.id || "job_default";
      bulletJobIds = bullets.map(() => fallbackJobId);
    }

    if (!bullets.length) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_analyze_no_bullets",
          eventType: "analyze",
          meta: {
            cost: chargedCost,
            foundExperienceSection: experienceSlice.foundSection,
            experienceMode: experienceSlice.mode,
            bulletsFromFileCount: (bulletsFromFile || []).length,
            seededFileBulletsCount: seededFileBullets.length,
            blobDebug,
            parserUsed,
            detectedType,
            warnings: warningsUnique,
            pdfInfo,
            parserDiagnostics: buildResumeParserDebug(parserCompatibility),
          },
        });

        await writeJobsAnalyticsEvent({
          userId: dbUser.id,
          event: "job_resume_analysis_failed",
          route: "/api/analyze",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: true,
            error: "NO_BULLETS_DETECTED",
            parserUsed,
            detectedType,
            foundExperienceSection: experienceSlice.foundSection,
            experienceMode: experienceSlice.mode,
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: dbUser.id,
            event: "job_apply_pack_failed",
            route: "/api/analyze",
            context: jobsAnalyticsContext,
            meta: {
              step: "resume_analyze",
              creditsCost: chargedCost,
              refunded: true,
              error: "NO_BULLETS_DETECTED",
            },
          });
        }

        return okJson(
          {
            ok: false,
            error:
              "No bullets detected. Your resume may not use bullet markers (â€¢, -, â—, etc.) or the experience section could not be parsed. Try uploading DOCX, or paste the resume with bullet characters.",
            refunded: true,
            balance: refunded.balance,
            warnings: warningsUnique,
            debug: {
              parserUsed,
              detectedType,
              pdfInfo,
              parserDiagnostics: buildResumeParserDebug(parserCompatibility),
              foundExperienceSection: experienceSlice.foundSection,
              experienceMode: experienceSlice.mode,
              experienceLen: experienceSlice.experienceText.length,
              bulletsFromFileCount: (bulletsFromFile || []).length,
              seededFileBulletsCount: seededFileBullets.length,
              blobDebug,
            },
          },
          { status: 400 }
        );
      } catch (refundErr: any) {
        await writeJobsAnalyticsEvent({
          userId: dbUser.id,
          event: "job_resume_analysis_failed",
          route: "/api/analyze",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: false,
            error: "NO_BULLETS_DETECTED",
            refundError: refundErr?.message || String(refundErr),
            parserUsed,
            detectedType,
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: dbUser.id,
            event: "job_apply_pack_failed",
            route: "/api/analyze",
            context: jobsAnalyticsContext,
            meta: {
              step: "resume_analyze",
              creditsCost: chargedCost,
              refunded: false,
              error: "NO_BULLETS_DETECTED",
              refundError: refundErr?.message || String(refundErr),
            },
          });
        }

        return okJson(
          {
            ok: false,
            error:
              "No bullets detected. Your resume may not use bullet markers (â€¢, -, â—, etc.) or the experience section could not be parsed. Try uploading DOCX, or paste the resume with bullet characters.",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
            warnings: warningsUnique,
            parserDiagnostics: buildResumeParserDebug(parserCompatibility),
          },
          { status: 400 }
        );
      }
    }

    if (bullets.length && jobsLookPlaceholder(experienceJobs)) {
      const previewJobs = buildExperienceJobsForPreviewFromText(experienceSlice.experienceText || bulletSourceText);
      if (previewJobs.length) {
        experienceJobs = previewJobs;

        const flatPreview = flattenFromJobs(experienceJobs);
        const filteredPreviewBullets = filterBadBullets(flatPreview.outBullets);

        if (filteredPreviewBullets.length === flatPreview.outBullets.length) {
          bullets = filteredPreviewBullets;
          bulletJobIds = flatPreview.outJobIds;
        } else {
          const keep = new Set(filteredPreviewBullets.map((b) => normalizeForContains(b)));
          const newIds: string[] = [];
          for (let i = 0; i < flatPreview.outBullets.length; i++) {
            const k = normalizeForContains(flatPreview.outBullets[i]);
            if (keep.has(k)) newIds.push(flatPreview.outJobIds[i]);
          }
          bullets = filteredPreviewBullets;
          bulletJobIds = newIds;
        }
      }
    }

    let bulletSuggestions: any[] = [];
    let weakBullets: any[] = [];

    try {
      const bulletObjs = normalizeBulletsForSuggestions({
        bullets,
        bulletJobIds,
        fallbackJobId: experienceJobs[0]?.id || "job_default",
      });

      const suggestionResult: any = suggestKeywordsForBullets(bulletObjs, jobText, analysis.missingKeywords);
      bulletSuggestions = suggestionResult?.bulletSuggestions ?? [];
      weakBullets = suggestionResult?.weakBullets ?? [];
    } catch {
      bulletSuggestions = [];
      weakBullets = [];
    }

    let rewritePlan: any[] = [];
    try {
      rewritePlan = buildRewritePlan(bulletSuggestions);
    } catch {
      rewritePlan = [];
    }

    if (!Array.isArray(rewritePlan) || rewritePlan.length === 0) {
      const seedKeywords = (analysis.highImpactMissing || analysis.missingKeywords || []).slice(0, 5);
      rewritePlan = bullets.map((b) => ({
        originalBullet: b,
        suggestedKeywords: seedKeywords,
        rewrittenBullet: "",
      }));
    }

    rewritePlan = (rewritePlan || []).map((item: any, i: number) => {
      const original =
        typeof item?.originalBullet === "string" ? item.originalBullet : String(item?.originalBullet ?? "");
      const jobId = bulletJobIds[i] || experienceJobs[0]?.id || "job_default";

      return {
        ...item,
        originalBullet: original,
        jobId,
        verbStrength: computeVerbStrength(original, { mode: "before" }),
      };
    });

    let autoResumeProfile: any = null;
    let autoResumeProfileError: string | null = null;

    try {
      autoResumeProfile = await upsertLatestResumeProfileForUser({
        userId: dbUser.id,
        title:
          String(ats?.detectedResumeRole?.roleName || "").trim() ||
          String(targetPosition || "").trim() ||
          null,
        rawText: resumeText,
        summary: buildAutoResumeProfileSummary({
          targetPosition,
          parserUsed,
          ats,
          highlights,
        }),
        skills: uniqueCaseInsensitive([
          ...safeArray(analysis?.presentKeywords),
          ...safeArray(ats?.matchedTerms),
        ]).slice(0, 40),
        titles: safeTitleArray([
          ats?.detectedResumeRole?.roleName,
          ats?.targetRole?.roleName,
          targetPosition,
        ]).slice(0, 10),
        keywords: uniqueCaseInsensitive([
          ...safeArray(analysis?.presentKeywords),
          ...safeArray(ats?.matchedTerms),
          ...safeArray(metaBlocks?.gamesShipped),
        ]).slice(0, 60),
      });
    } catch (profileErr: any) {
      autoResumeProfileError = profileErr?.message ? String(profileErr.message) : String(profileErr);
      console.error("resume profile auto-save failed:", profileErr);
    }

    await writeJobsAnalyticsEvent({
      userId: dbUser.id,
      event: "job_resume_analysis_completed",
      route: "/api/analyze",
      context: jobsAnalyticsContext,
      meta: {
        creditsCost: chargeConfig.cost,
        parserUsed,
        detectedType,
        targetPosition,
        bulletsCount: bullets.length,
        jobsDetected: experienceJobs.length,
        atsOverallScore: ats?.overallScore ?? null,
      },
    });

    const responseExperienceJobs = sanitizeExperienceJobsForResponse(experienceJobs);
    const recoveredResponseProfile = derivePreviewProfileFromResumeText(resumeText, parserStructuredPreview?.profile || null);
    const responseStructuredPreviewBaseRaw = sanitizeStructuredPreviewSnapshotForResponse(parserStructuredPreview);
    const responseStructuredPreviewBase = responseStructuredPreviewBaseRaw
      ? {
          ...responseStructuredPreviewBaseRaw,
          profile: sanitizePreviewProfileForResponse({
            ...responseStructuredPreviewBaseRaw.profile,
            fullName: responseStructuredPreviewBaseRaw.profile.fullName || recoveredResponseProfile.fullName,
            titleLine: responseStructuredPreviewBaseRaw.profile.titleLine || recoveredResponseProfile.titleLine,
            locationLine: responseStructuredPreviewBaseRaw.profile.locationLine || recoveredResponseProfile.locationLine,
            email: responseStructuredPreviewBaseRaw.profile.email || recoveredResponseProfile.email,
            phone: responseStructuredPreviewBaseRaw.profile.phone || recoveredResponseProfile.phone,
            linkedin: responseStructuredPreviewBaseRaw.profile.linkedin || recoveredResponseProfile.linkedin,
            portfolio: responseStructuredPreviewBaseRaw.profile.portfolio || recoveredResponseProfile.portfolio,
            summary: responseStructuredPreviewBaseRaw.profile.summary || recoveredResponseProfile.summary,
          }),
        }
      : null;
    const responseStructuredPreview = responseStructuredPreviewBase
      ? {
          ...responseStructuredPreviewBase,
          sections: responseExperienceJobs.length ? responseExperienceJobs : responseStructuredPreviewBase.sections,
        }
      : responseExperienceJobs.length
        ? {
            version: 1 as const,
            targetPosition: cleanPreviewText(targetPosition),
            template: "modern",
            profile: derivePreviewProfileFromResumeText(resumeText, {
              titleLine: responseExperienceJobs[0]?.title || "",
            }),
            sections: responseExperienceJobs,
            educationItems: [] as string[],
            expertiseItems: [] as string[],
            metaGames: [] as string[],
            metaMetrics: [] as string[],
            shippedLabelMode: "games",
            includeMetaInResumeDoc: true,
            showShippedBlock: true,
            showMetricsBlock: true,
            showEducationOnResume: true,
            showExpertiseOnResume: true,
            showProfilePhoto: true,
            profilePhotoDataUrl: "",
            profilePhotoShape: "circle" as const,
            profilePhotoSize: 112,
          }
        : null;

    return okJson({
      ok: true,
      balance: charged.balance,
      ...analysis,
      ats,
      experienceJobs: responseExperienceJobs,
      bullets,
      bulletJobIds,
      bulletSuggestions,
      weakBullets,
      rewritePlan,
      metaBlocks,
      highlights,
      warnings: autoResumeProfileError
        ? Array.from(new Set([...warningsUnique, "Resume profile auto-save failed."]))
        : warningsUnique,
      structuredData: responseStructuredPreview,
      autoResumeProfile: autoResumeProfile
        ? {
            id: autoResumeProfile.id,
            title: autoResumeProfile.title,
            updatedAt: autoResumeProfile.updatedAt,
          }
        : null,
      parserDiagnostics: buildResumeParserDebug(parserCompatibility),
      debug: {
        contentType,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        onlyExperienceBulletsUsed: onlyExperienceBullets,
        experienceLen: experienceSlice.experienceText.length,
        foundExperienceSection: experienceSlice.foundSection,
        experienceMode: experienceSlice.mode,
        bulletsFromFileCount: (bulletsFromFile || []).length,
        seededFileBulletsCount: seededFileBullets.length,
        jobsDetected: experienceJobs.length,
        jobsWithBullets: experienceJobs.filter((j) => j.bullets?.length).length,
        flattenedBulletCount: bullets.length,
        rewritePlanCount: Array.isArray(rewritePlan) ? rewritePlan.length : 0,
        metaGamesCount: metaBlocks.gamesShipped.length,
        metaMetricsCount: metaBlocks.metrics.length,
        maxFileMb: MAX_FILE_MB,
        blobDebug,
        jobsWerePlaceholder: jobsLookPlaceholder(experienceJobs),
        detectedType,
        parserUsed,
        pdfInfo,
        parserDiagnostics: buildResumeParserDebug(parserCompatibility),
        structuredPreviewReturned: !!parserStructuredPreview,
        previewSourceDebug: {
          parserJobsCount: parserJobs.length,
          explicitPreviewJobsCount: explicitPreviewJobs.length,
          textPreviewJobsCount: textPreviewJobs.length,
          finalResponseJobsCount: responseExperienceJobs.length,
          parserJobHeaders: parserJobs.slice(0, 12).map((job) => [job.company, job.title, job.dates].filter(Boolean).join(" | ")),
          explicitJobHeaders: explicitPreviewJobs.slice(0, 12).map((job) => [job.company, job.title, job.dates].filter(Boolean).join(" | ")),
          textJobHeaders: textPreviewJobs.slice(0, 12).map((job) => [job.company, job.title, job.dates].filter(Boolean).join(" | ")),
          finalJobHeaders: responseExperienceJobs.slice(0, 12).map((job) => [job.company, job.title, job.dates].filter(Boolean).join(" | ")),
          finalJobBulletCounts: responseExperienceJobs.slice(0, 12).map((job) => Array.isArray(job.bullets) ? job.bullets.length : 0),
          structuredProfile: responseStructuredPreview?.profile ?? null,
          structuredExpertiseItems: responseStructuredPreview?.expertiseItems ?? [],
        },
        rawText: resumeText,
        normalizedText: normalizeResumeText(resumeText),
        atsPrimaryResumeRole: ats?.detectedResumeRole?.roleKey ?? null,
        atsPrimaryJobRole: ats?.detectedJobRole?.roleKey ?? null,
        atsTargetRole: ats?.targetRole?.roleKey ?? null,
        atsOverallScore: ats?.overallScore ?? null,
        autoResumeProfileSaved: !!autoResumeProfile,
        autoResumeProfileId: autoResumeProfile?.id ?? null,
        autoResumeProfileError,
      },
    });
  } catch (e: any) {
    const message = e?.message ? String(e.message) : String(e);
    console.error("analyze route error:", e);

    if (chargedUserId && chargedCost > 0) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_analyze_failed",
          eventType: "analyze",
          meta: { cost: chargedCost, error: message },
        });

        await writeJobsAnalyticsEvent({
          userId: chargedUserId,
          event: "job_resume_analysis_failed",
          route: "/api/analyze",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: true,
            error: message || "Failed to analyze input",
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: chargedUserId,
            event: "job_apply_pack_failed",
            route: "/api/analyze",
            context: jobsAnalyticsContext,
            meta: {
              step: "resume_analyze",
              creditsCost: chargedCost,
              refunded: true,
              error: message || "Failed to analyze input",
            },
          });
        }

        return okJson(
          { ok: false, error: message || "Failed to analyze input", refunded: true, balance: refunded.balance },
          { status: 500 }
        );
      } catch (refundErr: any) {
        await writeJobsAnalyticsEvent({
          userId: chargedUserId,
          event: "job_resume_analysis_failed",
          route: "/api/analyze",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: false,
            error: message || "Failed to analyze input",
            refundError: refundErr?.message || String(refundErr),
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: chargedUserId,
            event: "job_apply_pack_failed",
            route: "/api/analyze",
            context: jobsAnalyticsContext,
            meta: {
              step: "resume_analyze",
              creditsCost: chargedCost,
              refunded: false,
              error: message || "Failed to analyze input",
              refundError: refundErr?.message || String(refundErr),
            },
          });
        }

        return okJson(
          {
            ok: false,
            error: message || "Failed to analyze input",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
          },
          { status: 500 }
        );
      }
    }

    return okJson({ ok: false, error: message || "Failed to analyze input" }, { status: 500 });
  }
}

export async function GET() {
  return okJson({ ok: false, route: "src/app/api/analyze/route.ts", tag: BOOT_TAG }, { status: 405 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
