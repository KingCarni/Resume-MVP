"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { buildRewriteBulletPayload } from "@/lib/rewritePayload";
import { upload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { trackJobEvent } from "@/lib/analytics/jobs";
import { hasStructuredResumeBullets, sanitizeStructuredResumeSnapshot, structuredSnapshotToAnalyzeText, structuredSnapshotToResumeText, type ResumeSourceMeta, type StructuredResumeSnapshot } from "@/lib/resumeProfiles/structuredResume";
import { buildResumeTemplateSelection, getRecommendedColorSchemeForLayout, isLegacyResumeTemplateId, resolveLegacyResumeTemplateSelection, RESUME_COLOR_SCHEME_OPTIONS, RESUME_LAYOUT_CATEGORY_LABELS, RESUME_LAYOUT_CATEGORY_ORDER, RESUME_LAYOUT_OPTIONS, type ResumeTemplateId } from "@/lib/templates/resumeTemplates";
import { COLOR_SCHEMES, type ColorSchemeId } from "@/lib/templates/colorSchemes";

/** ---------------- Types ---------------- */

type VerbStrength = {
  score: number;
  label: "Weak" | "OK" | "Strong";
  detectedVerb?: string;
  suggestion?: string;
  baseScore?: number;
  rewriteBonusApplied?: number;
};

type TruthRisk = {
  score: number;
  level: "safe" | "review" | "risky";
  reasons: string[];
  addedTerms: string[];
  riskyPhrases: string[];
  unsupportedClaims: string[];
};

type RewritePlanItem = {
  originalBullet?: string;
  suggestedKeywords?: string[];
  rewrittenBullet?: string;

  needsMoreInfo?: boolean;
  notes?: string[];
  keywordHits?: string[];
  blockedKeywords?: string[];
  truthRisk?: TruthRisk;

  verbStrength?: VerbStrength; // BEFORE (from analyze)
  jobId?: string; // server-provided mapping
};

type LatestResumePayload = {
  ok?: boolean;
  item?: {
    id: string;
    title: string | null;
    template: string | null;
    text: string | null;
    html: string | null;
    structuredData?: StructuredResumeSnapshot | null;
    sourceFileName?: string | null;
    sourceMimeType?: string | null;
    sourceFileExtension?: string | null;
    sourceKind?: string | null;
    createdAt: string;
  } | null;
  error?: string;
};


type ResumeDocumentHydrationItem = {
  id: string;
  title: string | null;
  createdAt: string;
  text?: string | null;
  html?: string | null;
  structuredData?: StructuredResumeSnapshot | null;
  sourceFileName?: string | null;
  sourceMimeType?: string | null;
  sourceFileExtension?: string | null;
  sourceKind?: string | null;
};

type ResumeProfileHydrationItem = {
  id: string;
  title?: string | null;
  summary?: string | null;
  updatedAt?: string | null;
  rawText?: string | null;
  sourceDocumentId?: string | null;
  sourceDocument?: ResumeDocumentHydrationItem | null;
  normalizedTitles?: string[];
};

type WorkflowChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

type ResumeProfile = {
  fullName: string;
  titleLine: string;
  locationLine: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  summary: string;
};

type ExperienceSection = {
  id: string;
  company: string;
  title: string;
  dates: string;
  location?: string;
};

type BulletAssignment = {
  sectionId: string;
};

type ExperienceJobFromApi = {
  id: string;
  company: string;
  title: string;
  dates: string;
  location?: string;
  bullets: string[];
  rawHeader?: string;
};

function inferExtension(fileName: string, mimeType?: string | null) {
  const fromName = String(fileName || "").trim().split(".").pop() || "";
  if (fromName && fromName !== fileName) return fromName.toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  if (lowerMime.includes("pdf")) return "pdf";
  if (lowerMime.includes("wordprocessingml")) return "docx";
  if (lowerMime == "application/msword") return "doc";
  if (lowerMime.includes("plain")) return "txt";
  return "";
}

type AnalyzeAtsPayload = {
  detectedResumeRole?: {
    roleKey?: string | null;
    roleName?: string | null;
    secondaryRoleKey?: string | null;
    secondaryRoleName?: string | null;
    confidence?: "low" | "medium" | "high";
    topRoles?: Array<{
      roleKey: string;
      roleName: string;
      score: number;
      matchedTerms: number;
      categoryCoverage: Record<string, number>;
    }>;
  };
  detectedJobRole?: {
    roleKey?: string | null;
    roleName?: string | null;
    secondaryRoleKey?: string | null;
    secondaryRoleName?: string | null;
    confidence?: "low" | "medium" | "high";
    topRoles?: Array<{
      roleKey: string;
      roleName: string;
      score: number;
      matchedTerms: number;
      categoryCoverage: Record<string, number>;
    }>;
  };
  targetRole?: {
    roleKey?: string | null;
    roleName?: string | null;
  };
  overallScore?: number;
  categoryScores?: Record<string, number>;
  matchedTerms?: string[];
  matchedTermsDetailed?: Array<{
    category: string;
    term: string;
    count: number;
    score: number;
  }>;
  missingCriticalTerms?: string[];
  missingImportantTerms?: string[];
  missingNiceToHaveTerms?: string[];
  matchedByCategory?: Record<string, string[]>;
  missingByCategory?: Record<string, string[]>;
  notes?: string[];
  roleShift?: {
    fromRoleKey?: string | null;
    fromRoleName?: string | null;
    toRoleKey?: string | null;
    toRoleName?: string | null;
  } | null;
};

type ApplyPackBundle = {
  bundle?: string;
  jobId?: string;
  resumeProfileId?: string;
  nextStep?: string;
  createdAt?: string;
  sourceSlug?: string;
  bundleSessionId?: string;
  job?: {
    id?: string;
    title?: string;
    company?: string;
    location?: string | null;
    remoteType?: string;
    seniority?: string;
    employmentType?: string;
    applyUrl?: string | null;
    sourceUrl?: string | null;
    description?: string;
    requirementsText?: string | null;
    responsibilitiesText?: string | null;
    postedAt?: string | null;
    jobContextText?: string;
  };
};

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  matchScore?: number;
  missingKeywords?: string[];
  presentKeywords?: string[];
  bullets?: unknown[];
  rewritePlan?: RewritePlanItem[];
  debug?: {
    rawText?: string | null;
    normalizedText?: string | null;
  } | null;
  ats?: AnalyzeAtsPayload;

  metaBlocks?: {
    gamesShipped?: string[];
    metrics?: string[];
  };


  experienceJobs?: ExperienceJobFromApi[];
  bulletJobIds?: string[];
  autoResumeProfile?: {
    id?: string | null;
    title?: string | null;
  } | null;
};

/** ---------------- Credits cost labels ---------------- */
/**
 * NOTE: These are UI labels only.
 * Keep them aligned with server charging (api routes / lib/credits).
 */
const CREDIT_COSTS = {
  analyze: 5, // matches /api/analyze COST_TAILOR_RESUME in standard job-aware mode
  rewriteBullet: 1, // set to whatever /api/rewrite-bullet charges
} as const;

const REWRITE_FIRST_ATTEMPT_TIMEOUT_MS = 25_000;
const REWRITE_RETRY_TIMEOUT_MS = 15_000;

/** ---------------- Helpers ---------------- */

async function parseApiResponse(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

function isHtmlDoc(x: unknown) {
  return (
    typeof x === "string" &&
    (x.includes("<!DOCTYPE html>") ||
      x.includes("<!doctype html>") ||
      x.includes('id="__NEXT_DATA__"') ||
      x.includes("<html") ||
      x.includes("<head") ||
      x.includes("<body"))
  );
}

function looksLikeHtmlInput(s: string) {
  const t = String(s || "").trim();
  if (!t) return false;
  if (t.startsWith("<!doctype") || t.startsWith("<!DOCTYPE")) return true;
  return /<\s*(html|head|body|div|span|ul|li|style|script)\b/i.test(t);
}

function bulletToText(b: unknown): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    const record = b as Record<string, unknown>;
    const v = record.text ?? record.value ?? record.bullet ?? record.originalBullet ?? record.content;
    if (typeof v === "string") return v;
    return String(v ?? "");
  }
  return String(b ?? "");
}

function planItemToText(item: unknown): string {
  if (!item) return "";
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const raw = record.originalBullet ?? record.bullet ?? record.original ?? record.text ?? item;
    return bulletToText(raw).trim();
  }
  return bulletToText(item).trim();
}

function keywordsToArray(k: unknown): string[] {
  if (Array.isArray(k)) return k.map((x) => String(x).trim()).filter(Boolean);
  if (typeof k === "string")
    return k
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (k && typeof k === "object" && Array.isArray((k as { keywords?: unknown }).keywords)) {
    return (k as { keywords?: unknown[] }).keywords?.map((x: unknown) => String(x).trim()).filter(Boolean) || [];
  }
  return [];
}

function csvToArray(s: string): string[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeForMatch(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}


function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function findInjectedTerms(text: string, terms: string[]) {
  const t = normalizeForMatch(text);
  const hits: string[] = [];
  for (const raw of terms) {
    const term = normalizeForMatch(raw);
    if (!term) continue;
    if (t.includes(term)) hits.push(raw);
  }
  return Array.from(new Set(hits));
}

/** ---------------- keyword + rewrite guardrail helpers ---------------- */

function normalizeSuggestedKeywordsForBullet(originalBullet: string, suggested: string[]) {
  const text = normalizeForMatch(originalBullet);

  const bannedStarts = [
    "coordinate daily testing",
    "coordinated daily testing",
    "daily testing operations",
    "daily testing priorities",
  ].map(normalizeForMatch);

  let cleaned = (suggested || [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .filter((s) => {
      const ns = normalizeForMatch(s);
      return !bannedStarts.some((b) => ns.startsWith(b));
    });

  cleaned = cleaned.filter((k) => {
    const kk = normalizeForMatch(k);
    if (kk.length <= 6) return true;
    return text.includes(kk);
  });

  if (cleaned.length < 2) cleaned = ["qa", "test planning", "release", "jira"];

  return cleaned.slice(0, 5);
}

function pickGuaranteedAtsKeywordsForBullet(args: {
  originalBullet: string;
  suggestedKeywords: string[];
  jobText: string;
  maxGuaranteed?: number;
}) {
  const original = normalizeForMatch(args.originalBullet);
  const jobTextNorm = normalizeForMatch(args.jobText);
  const maxGuaranteed = Math.max(0, Math.min(args.maxGuaranteed ?? 2, 3));

  const priorityTerms = (args.suggestedKeywords || [])
    .map((k) => String(k).trim())
    .filter(Boolean)
    .filter((k) => {
      const kk = normalizeForMatch(k);
      if (!kk) return false;
      if (!jobTextNorm.includes(kk)) return false;
      if (original.includes(kk)) return false;
      return true;
    })
    .sort((a, b) => b.length - a.length);

  return priorityTerms.slice(0, maxGuaranteed);
}

function isTrainingLikeBullet(bullet: string) {
  const s = String(bullet || "");
  return /\b(training|trained|certif|certificate|certification|course|workshop|program|bootcamp|completed|graduated)\b/i.test(
    s
  );
}

function defaultTrainingRewrite(original: string) {
  const raw = String(original || "")
    .trim()
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
    .trim();

  if (!raw) return "";

  const startsWithTrainingVerb =
    /^(completed|earned|achieved|graduated|attended|finished|passed|certified|trained)\b/i.test(raw);

  const base = raw.replace(/\s+/g, " ").trim();
  const cleaned = base.replace(/^\s*completed\s+/i, "Completed ");

  if (startsWithTrainingVerb) {
    const alreadyHasOutcome =
      /\b(strengthen(ed|ing)|improv(ed|ing)|building|develop(ed|ing))\b/i.test(cleaned);

    return alreadyHasOutcome
      ? cleaned
      : `${cleaned}, strengthening leadership, coaching, and cross-team communication skills.`;
  }

  return `Completed ${base}, strengthening leadership, coaching, and cross-team communication skills.`;
}

/**
 * Client-side resume text normalization to improve job header parsing.
 */
function normalizeResumeTextForParsing(input: string) {
  const text = String(input ?? "");
  if (!text.trim()) return text;

  const month =
    "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const dash = "[–—-]";
  const dateRange = new RegExp(
    `\\b${month}\\s+\\d{4}\\s*${dash}\\s*(Present|Current|${month}\\s+\\d{4})\\b`,
    "i"
  );

  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/^[\u2022\u00B7o\s]+/gm, (m) => (m.trim() ? "- " : m))
    .replace(/[ \t]+/g, " ")
    .trimEnd();

  const lines = cleaned.split("\n");
  const out: string[] = [];

  for (const lineRaw of lines) {
    const line = String(lineRaw ?? "");
    const m = line.match(dateRange);

    if (!m || /^\s*[-•]/.test(line)) {
      out.push(lineRaw);
      continue;
    }

    const range = m[0];
    const idx = line.toLowerCase().indexOf(range.toLowerCase());

    if (idx === -1) {
      out.push(lineRaw);
      continue;
    }

    const left = line.slice(0, idx).trim();
    const right = line.slice(idx + range.length).trim();

    if (left && right) {
      const company = left.replace(/\s{2,}/g, " ").replace(/[•|]+$/g, "").trim();
      const title = right.replace(/^[•|]+/g, "").trim();

      const titleLooksReal = title.length >= 3 && !/^(vancouver|remote|hybrid)\b/i.test(title);

      if (titleLooksReal) {
        out.push(`${company} — ${title} (${range})`);
        continue;
      }
    }

    out.push(lineRaw);
  }

  return out.join("\n");
}

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold",
        muted
          ? "border-black/10 bg-black/5 text-black/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-100/90"
          : "border-black/10 bg-black/10 text-black/90 dark:border-white/10 dark:bg-white/10 dark:text-slate-100/90",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

function Callout({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone: "warn" | "danger" | "info";
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amber-300/60 bg-amber-100/60 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
      : tone === "danger"
      ? "border-red-300/60 bg-red-100/60 text-red-950 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100"
      : "border-sky-300/60 bg-sky-100/60 text-sky-950 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100";

  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <div className="font-extrabold">{title}</div>
      <div className="mt-1 opacity-90">{children}</div>
    </div>
  );
}



function openHtmlPreviewInNewWindow(title: string, html: string) {
  const docHtml =
    html && String(html).trim()
      ? String(html)
      : "<!doctype html><html><head><title>Preview</title></head><body></body></html>";

  const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Preview popup was blocked by the browser.");
  }

  try {
    win.focus();
  } catch {}

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 60000);
}

function HtmlDocPreview({ html, footer }: { html: string; footer?: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 rounded-2xl border border-black/10 bg-white/60 p-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div id="resume-output" className="text-sm font-extrabold text-black/80 dark:text-slate-100/85">Document Preview (HTML)</div>
      </div>

      <div className="w-full min-w-0 overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black/20">
        <iframe
          title="resume-preview"
          className="block h-[1180px] w-full min-w-0 border-0"
          sandbox="allow-same-origin"
          srcDoc={html || "<!doctype html><html><body></body></html>"}
        />
      </div>

      {footer ? <div className="mt-3 flex flex-wrap items-center gap-2">{footer}</div> : null}
    </div>
  );
}

/** ---------- Resume Template HTML ---------- */

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function headerContactChipsCss() {
  return `
/* --- Arcade-style header contact chips (unified) --- */
.top .contact{
  margin-top: 12px !important;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  gap: 10px !important;
  align-items: center !important;
  justify-content: flex-start !important;
  text-align: left !important;
  max-width: none !important;
  padding-left: 0 !important;
  margin-left: 0 !important;
}

.top .chip{
  display: inline-flex !important;
  align-items: center !important;
  max-width: 100% !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
`.trim();
}

function printLockCss() {
  return `
html, body{
  margin:0;
  padding:0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page{
  width: 8.5in !important;
  min-height: 11in !important;
  max-width: none !important;
  margin: 0 auto !important;
}

@page{
  size: Letter;
  margin: 0;
}
`.trim();
}

type ThemeArgs = {
  font: "sans" | "serif" | "mono";
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2?: string;

  bodyBg: string;
  pageBg: string;
  headerBg: string;
  cardBg: string;

  radius: number;
  shadow: string;

  borderStyle?: "solid" | "dashed";
  headerAfterGrid?: boolean;
  hasChips?: boolean;
};

function mkThemeCss(t: ThemeArgs) {
  const borderStyle = t.borderStyle ?? "solid";
  const accent2 = t.accent2 ?? t.accent;

  const PAGE_SIZE = "Letter";
  const PAGE_MARGIN = "0.35in";

  const fontFamily =
    t.font === "serif"
      ? `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
      : t.font === "mono"
      ? `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
      : `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`;

  return `
:root{
  --ink:${t.ink};
  --muted:${t.muted};
  --line:${t.line};
  --accent:${t.accent};
  --accent2:${accent2};

  --bodybg:${t.bodyBg};
  --pagebg:${t.pageBg};
  --headerbg:${t.headerBg};
  --cardbg:${t.cardBg};

  --radius:${t.radius}px;
  --shadow:${t.shadow};
  --borderstyle:${borderStyle};
}

*{ box-sizing:border-box; }

html, body{
  margin:0;
  padding:0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  height: 100%;
}

body{
  min-height: 100vh;
  padding: 18px;
  font-family: ${fontFamily};
  color: var(--ink);
  background: var(--bodybg);
  line-height: 1.35;

  /* ✅ base resume size (fixes “large font”) */
  font-size: 12.5px;
  -webkit-text-size-adjust: 100%;
}

@page{
  size: ${PAGE_SIZE};
  margin: ${PAGE_MARGIN};
}

.page{
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto;
  padding: 18px 22px;
  background: var(--pagebg);
  border-radius: var(--radius);
}

.top{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  padding: 14px 16px;
  border: 1px var(--borderstyle) var(--line);
  border-radius: var(--radius);
  background: var(--headerbg);
  box-shadow: var(--shadow);
}

.top-main{
  display:flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 14px;
  align-items:flex-start;
}

.top-copy{
  flex: 1 1 auto;
  min-width: 0;
}

.top-photo{
  flex: 0 0 auto;
  display:flex;
  align-items:flex-start;
  justify-content:flex-end;
}

.profile-photo{
  display:block;
  object-fit: cover;
  border: 1px var(--borderstyle) var(--line);
  background: var(--cardbg);
  box-shadow: 0 10px 25px rgba(2,6,23,.08);
}

.profile-photo.circle{ border-radius: 999px; }
.profile-photo.rounded{ border-radius: 18px; }
.profile-photo.square{ border-radius: 0; }

.name{
  margin:0;
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.2px;
}

.title{
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}

.chip{
  display:inline-block;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px var(--borderstyle) var(--line);
  background: var(--cardbg);
  box-shadow: 0 10px 25px rgba(2,6,23,.06);
}

.content{
  margin-top: 14px;
}

.section{
  margin-top: 14px;
}

.h{
  display:flex;
  align-items:center;
  gap:10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .14em;
  font-size: 12px;
  margin-bottom: 8px;
}

.bar{
  display:inline-block;
  width: 14px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
}

.summary{
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.5;
}

/* ✅ meta grid auto-fills space (no empty boxes) */
.meta{
  display:grid;
  gap: 12px;
}
.meta.two{ grid-template-columns: 1fr 1fr; }
.meta.one{ grid-template-columns: 1fr; }

.box{
  border: 1px var(--borderstyle) var(--line);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--cardbg);
  box-shadow: var(--shadow);
}

.boxtitle{
  font-weight: 800;
  margin-bottom: 6px;
}

.small{
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

.job{
  margin-top: 12px;
}

/* ✅ Resume-25 style: job header left, dates right */
.jobhead{
  display:flex;
  justify-content:space-between;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px var(--borderstyle) var(--line);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.jobtitle{
  font-weight: 800;
  min-width: 240px;
}

.jobcompany{
  font-weight: 900;
}

.jobmetaRight{
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
}

/* Allow wrap on narrow / long locations */
@media print{
  .jobmetaRight{ white-space: normal; }
}

/* Keep jobmeta safe (some templates still use it elsewhere) */
.jobmeta{
  color: var(--muted);
  font-size: 11px;
  white-space: normal;
}

ul{
  margin: 0;
  padding-left: 18px;
}

li{
  margin: 0 0 6px 0;
  font-size: 12.5px;
  line-height: 1.35;
}

${t.headerAfterGrid ? `.top:after{content:"";display:block;height:10px;margin-top:10px;border-top:1px dashed var(--line);width:100%;}` : ""}

${headerContactChipsCss()}

@media print{
  body{
    background: var(--bodybg) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 0 !important;
  }
  .page{
    background: var(--pagebg) !important;
    box-shadow: none !important;
    margin: 0 auto !important;
  }
}
`.trim();
}

function templateStylesResume(template: ResumeTemplateId): string {
  return `
${templateStyles(template)}

@media print {
  html, body{
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body{
    background: var(--bodybg) !important;
    padding: 0 !important;
  }

  .page{
    background: var(--pagebg, var(--bodybg)) !important;
    box-shadow: none !important;
    margin: 0 auto !important;
    border-radius: 0 !important;
  }

  .top:after{ display:none !important; }
}
`.trim();
}

/**
 * ✅ INCLUDED: full templateStyles() with theme parity fixes
 * - No recursion
 * - Lowercase variables matching cover letter generator
 * - .page uses --pagebg
 */
function templateStyles(template: ResumeTemplateId): string {
  const directColorScheme = COLOR_SCHEMES[template as ColorSchemeId];

  if (directColorScheme) {
    if (template === "ats") {
      return `
${mkThemeCss(directColorScheme.theme)}
.page{ border: none; }
.top{ border-bottom: 1px solid #111; }
.chip{ border: none; background: transparent; box-shadow: none; padding: 0; }
.meta, .box{ border: none; padding: 0; background: transparent; box-shadow:none; }
.h{ color: #111; letter-spacing: 0; }
${printLockCss()}
`.trim();
    }

    return mkThemeCss(directColorScheme.theme);
  }

  const classicCss = `
:root{
  --ink:#111;
  --muted:#444;
  --line:#e7e7e7;
  --accent:#111;
  --accent2:#111;

  --bodybg:#ffffff;
  --pagebg:#ffffff;
  --headerbg:#ffffff;
  --cardbg:#ffffff;

  --radius: 0px;
  --shadow: none;
  --borderstyle: solid;
}

*{ box-sizing:border-box; }

body{
  font-family: Calibri, Arial, Helvetica, sans-serif;
  color: var(--ink);
  margin: 0;
  padding: 18px;
  background: var(--bodybg);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  line-height: 1.35;
  font-size: 12.5px;
}

.page{
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto;
  border: 1px solid var(--line);
  padding: 18px 22px;
  background: var(--pagebg);
  border-radius: var(--radius);
}

.top{
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
  background: var(--headerbg);
}

.name{
  font-size: 28px;
  font-weight: 900;
  margin: 0;
}

.title{
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 700;
}

.contact{
  font-size: 12px;
  color: var(--muted);
  text-align: right;
  display: grid;
  gap: 4px;
}

.h{
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 900;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: .06em;
}

.summary{
  color: var(--muted);
  line-height: 1.45;
  font-size: 13px;
}

.job{
  margin-top: 10px;
  border-top: 1px solid var(--line);
  padding-top: 10px;
}

.jobhead{
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: baseline;
}

.jobtitle{ font-weight: 900; }

.jobmetaRight{
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  margin-left: auto;
  text-align: right;
  white-space: nowrap;
}

ul{ margin: 6px 0 0 18px; padding: 0; }
li{ margin: 6px 0; line-height: 1.35; }

.meta{ display: grid; gap: 14px; }
.meta.two{ grid-template-columns: 1fr 1fr; }
.meta.one{ grid-template-columns: 1fr; }

.box{
  border: 1px solid var(--line);
  padding: 10px;
  background: var(--cardbg);
}

.boxtitle{
  font-weight: 900;
  font-size: 12px;
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: .06em;
}

.small{ font-size: 12px; color: var(--muted); }

${headerContactChipsCss()}
${printLockCss()}
`.trim();

  if (template === "compact") {
    return `
${classicCss}
.page { padding: 14px 18px; }
.name { font-size: 24px; }
li { margin: 4px 0; }
.job { margin-top: 8px; padding-top: 8px; }
${printLockCss()}
`.trim();
  }

  if (template === "sidebar") {
    return `
:root{
  --ink:#0f172a;
  --muted: rgba(15,23,42,.72);
  --line: rgba(15,23,42,.14);
  --accent:#2563eb;
  --accent2:#10b981;

  --bodybg:#ffffff;
  --pagebg:#ffffff;
  --headerbg: rgba(37,99,235,.06);
  --cardbg: rgba(255,255,255,.92);

  --radius:16px;
  --shadow: 0 18px 50px rgba(2,6,23,.08);
  --borderstyle: solid;
}
body{
  margin:0;
  background: var(--bodybg);
  color:var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  padding: 18px;
  font-size: 12.5px;
}
.page{
  width: 8.5in; min-height: 11in; margin: 0 auto;
  padding: 18px 22px;
  display:grid;
  grid-template-columns: 2.7fr 5.3fr;
  gap: 16px;
  background: var(--pagebg);
  border-radius: var(--radius);
}
.side{
  border: 1px var(--borderstyle) solid var(--line);
  border-radius: 16px;
  padding: 14px 14px;
  background: var(--headerbg);
  box-shadow: var(--shadow);
}
.main{
  border: 1px var(--borderstyle) solid var(--line);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgba(255,255,255,.95);
  box-shadow: 0 18px 50px rgba(2,6,23,.06);
}
.name{ margin:0; font-size: 26px; letter-spacing: -.2px; }
.title{ margin-top: 6px; color: var(--muted); font-size: 13px; font-weight: 700; }
.contact{ margin-top: 10px; display:grid; gap: 8px; }
.chip{
  display:inline-flex; align-items:center; gap:8px;
  border:1px var(--borderstyle) solid var(--line);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--cardbg);
}
.section{ margin-top: 12px; }
.h{
  font-weight: 800; text-transform: uppercase;
  letter-spacing: .14em; font-size: 12px; margin: 0 0 8px 0;
}
.summary{ font-size: 12.5px; color: var(--muted); line-height: 1.5; }
.meta{ display:grid; gap: 10px; }
.meta.two{ grid-template-columns: 1fr; }
.meta.one{ grid-template-columns: 1fr; }
.box{
  border:1px var(--borderstyle) solid var(--line);
  border-radius: 14px;
  padding: 10px;
  background: var(--cardbg);
  box-shadow: var(--shadow);
}
.boxtitle{ font-weight: 800; margin-bottom: 6px; }
.small{ font-size: 12px; color: var(--muted); line-height: 1.45; }
.job{ margin-top: 12px; }
.jobhead{
  display:flex; justify-content:space-between; gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px var(--borderstyle) solid var(--line);
  margin-bottom: 8px;
  flex-wrap:wrap;
  align-items: baseline;
}
.jobtitle{ font-weight: 800; min-width: 240px; }
.jobmetaRight{ color: var(--muted); font-size: 11px; font-weight: 700; margin-left: auto; text-align: right; white-space: nowrap; }
ul{ margin:0; padding-left: 18px; }
li{ margin: 0 0 6px 0; }
${headerContactChipsCss()}
${printLockCss()}

@media print{
  body{ padding: 0 !important; background: var(--bodybg) !important; }
  .page{ background: var(--pagebg) !important; }
  .main, .side{ box-shadow:none !important; }
}
`.trim();
  }

  const legacyLayoutFallbackSchemes: Partial<Record<ResumeTemplateId, ColorSchemeId>> = {
    sidebarright: "modern",
    gridblueprint: "blueprint",
    profilepanel: "minimal",
    timelineprofessional: "classic",
    corporatepolishedlayout: "corporate",
    technicalgridlayout: "terminal",
  };

  const fallbackSchemeId = legacyLayoutFallbackSchemes[template];
  if (fallbackSchemeId) {
    return mkThemeCss(COLOR_SCHEMES[fallbackSchemeId].theme);
  }

  return classicCss;
}

function buildResumeHtml(args: {
  template: ResumeTemplateId;
  profile: ResumeProfile;
  sections: ExperienceSection[];
  bulletsBySection: Record<string, string[]>;
  metaGames: string[];
  metaMetrics: string[];
  shippedLabel?: "Games" | "Apps";
  includeMeta: boolean;
  showShippedBlock?: boolean;
  showMetricsBlock?: boolean;
  educationItems?: string[];
  showEducationOnResume?: boolean;
  expertiseItems?: string[];
  showExpertiseOnResume?: boolean;
  profilePhotoDataUrl?: string;
  showProfilePhoto?: boolean;
  profilePhotoShape?: "circle" | "rounded" | "square";
  profilePhotoSize?: number;
}) {
  const {
    template,
    profile,
    sections,
    bulletsBySection,
    metaGames,
    metaMetrics,
    shippedLabel,
    includeMeta,
    showShippedBlock,
    showMetricsBlock,
    educationItems,
    showEducationOnResume,
    expertiseItems,
    showExpertiseOnResume,
    profilePhotoDataUrl,
    showProfilePhoto,
    profilePhotoShape,
    profilePhotoSize,
  } = args;

  const safe = (s: string) => escapeHtml(s || "");

  const safePhotoUrl =
    showProfilePhoto && profilePhotoDataUrl && /^data:image\//i.test(profilePhotoDataUrl.trim())
      ? profilePhotoDataUrl.trim()
      : "";

  const photoSize = Math.max(72, Math.min(Number(profilePhotoSize || 112), 180));
  const photoShape = profilePhotoShape || "circle";

  const standardPhotoHtml = safePhotoUrl
    ? `<div class="top-photo">
        <img
          src="${safePhotoUrl}"
          alt="Profile photo"
          class="profile-photo ${safe(photoShape)}"
          style="width:${photoSize}px;height:${photoSize}px;"
        />
      </div>`
    : "";

  const sidebarPhotoHtml = safePhotoUrl
    ? `<div style="margin-bottom:12px;">
        <img
          src="${safePhotoUrl}"
          alt="Profile photo"
          class="profile-photo ${safe(photoShape)}"
          style="width:${photoSize}px;height:${photoSize}px;"
        />
      </div>`
    : "";

  const contactBits = [
    profile.email?.trim() ? safe(profile.email) : "",
    profile.locationLine?.trim() ? safe(profile.locationLine) : "",
    profile.phone?.trim() ? safe(profile.phone) : "",
    profile.linkedin?.trim() ? safe(profile.linkedin) : "",
    profile.portfolio?.trim() ? safe(profile.portfolio) : "",
  ].filter(Boolean);

  const resolvedTemplate = resolveLegacyResumeTemplateSelection(template);
  const activeLayoutId = resolvedTemplate.layoutId;
  const activeCapabilities = resolvedTemplate.layout.capabilities;
  const activeColorSchemeTheme = resolvedTemplate.colorScheme.theme;
  const hasBar = activeCapabilities.usesHeaderBar;

  // ✅ Meta blocks: if only one exists, it fills the whole row (no blank placeholder box)
  const visibleGames = showShippedBlock ? metaGames : [];
  const visibleMetrics = showMetricsBlock ? metaMetrics : [];
  const metaCount = Number(visibleGames.length > 0) + Number(visibleMetrics.length > 0);
  const metaClass = metaCount <= 1 ? "meta one" : "meta two";

  const metaHtml =
    includeMeta && (visibleGames.length || visibleMetrics.length)
      ? `
    <div class="section">
      <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Highlights</div>
      <div class="${metaClass}">
        ${
          visibleGames.length
            ? `<div class="box">
                <div class="boxtitle">${safe(shippedLabel || "Games")} Shipped</div>
                <div class="small">${visibleGames
                  .slice(0, 14)
                  .map((x) => `• ${safe(String(x))}`)
                  .join("<br/>")}</div>
              </div>`
            : ""
        }
        ${
          visibleMetrics.length
            ? `<div class="box">
                <div class="boxtitle">Key Metrics</div>
                <div class="small">${visibleMetrics
                  .slice(0, 14)
                  .map((x) => `• ${safe(String(x))}`)
                  .join("<br/>")}</div>
              </div>`
            : ""
        }
      </div>
    </div>`
      : "";

  const educationHtml =
    showEducationOnResume && Array.isArray(educationItems) && educationItems.length
      ? `
    <div class="section">
      <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Education</div>
      <div class="box">
        <div class="small">${educationItems
          .slice(0, 8)
          .map((x) => `• ${safe(String(x))}`)
          .join("<br/>")}</div>
      </div>
    </div>`
      : "";

  const expertiseHtml =
    showExpertiseOnResume && Array.isArray(expertiseItems) && expertiseItems.length
      ? `
    <div class="section">
      <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Areas of Expertise</div>
      <div class="box">
        <div class="small">${expertiseItems
          .slice(0, 24)
          .map((x) => `• ${safe(String(x))}`)
          .join(" ")}</div>
      </div>
    </div>`
      : "";

  // ✅ Experience jobs:
  // - Always render the job header (so it never “disappears”)
  // - Dates/location go on the far right (Resume 25 style)
  const jobsHtml = sections
    .map((sec) => {
      const list = (bulletsBySection[sec.id] || []).map((x: string) => String(x ?? "").trim()).filter(Boolean);

      const company = safe(sec.company || "Company");
      const role = safe(sec.title || "Role");

      const metaRight = [sec.dates?.trim() ? safe(sec.dates) : "", sec.location?.trim() ? safe(sec.location) : ""]
        .filter(Boolean)
        .join(" • ");

      const bulletsHtml =
        list.length > 0
          ? `<ul>${list.map((b: string) => `<li>${safe(b)}</li>`).join("")}</ul>`
          : ``;

      return `
        <div class="job">
          <div class="jobhead">
            <div class="jobtitle">
              <span class="jobcompany">${company}</span> — ${role}
            </div>
            ${metaRight ? `<div class="jobmetaRight">${metaRight}</div>` : ""}
          </div>
          ${bulletsHtml}
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  const jobsHtmlTimeline = sections
    .map((sec) => {
      const list = (bulletsBySection[sec.id] || []).map((x: string) => String(x ?? "").trim()).filter(Boolean);
      const company = safe(sec.company || "Company");
      const role = safe(sec.title || "Role");
      const metaLeft = [sec.dates?.trim() ? safe(sec.dates) : "", sec.location?.trim() ? safe(sec.location) : ""]
        .filter(Boolean)
        .join(" • ");
      const bulletsHtml =
        list.length > 0
          ? `<ul>${list.map((b: string) => `<li>${safe(b)}</li>`).join("")}</ul>`
          : `<div class="summary">No bullets added yet.</div>`;

      return `
        <div class="job timeline-job">
          <div class="timeline-meta">${metaLeft || "Experience"}</div>
          <div class="timeline-body">
            <div class="jobtitle"><span class="jobcompany">${company}</span> — ${role}</div>
            ${bulletsHtml}
          </div>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  const useRailLayout = ["grid-blueprint", "technical-grid", "profile-panel"].includes(activeLayoutId);
  const useTimelineLayout = activeLayoutId === "timeline";
  const useCorporateLayout = activeLayoutId === "corporate-polished";
  const useSidebarLayout = activeLayoutId === "sidebar" || activeLayoutId === "sidebar-right";
  const useCompactLayout = activeLayoutId === "compact";
  const useExecutiveLayout = activeLayoutId === "executive";

  const layoutCss = `
    ${useSidebarLayout ? `.page{ width:8.5in; min-height:11in; margin:0 auto; padding:18px 22px; display:grid; grid-template-columns:2.7fr 5.3fr; gap:16px; background:var(--pagebg); border-radius:var(--radius); } .side{ border:1px var(--borderstyle) solid var(--line); border-radius:16px; padding:14px 14px; background:var(--headerbg); box-shadow:var(--shadow); } .main{ border:1px var(--borderstyle) solid var(--line); border-radius:16px; padding:14px 16px; background:var(--cardbg); box-shadow:0 18px 50px rgba(2,6,23,.06); } .side .name{ margin:0; font-size:26px; letter-spacing:-.2px; } .side .title{ margin-top:6px; color:var(--muted); font-size:13px; font-weight:700; } .side .contact{ margin-top:10px; display:grid; gap:8px; } .side .chip{ display:inline-flex; align-items:center; gap:8px; border:1px var(--borderstyle) solid var(--line); border-radius:999px; padding:6px 10px; background:var(--cardbg); } .side .section{ margin-top:12px; } .side .h{ font-weight:800; text-transform:uppercase; letter-spacing:.14em; font-size:12px; margin:0 0 8px 0; } .side .summary{ font-size:12.5px; color:var(--muted); line-height:1.5; } .side .meta{ display:grid; gap:10px; } .side .meta.two,.side .meta.one{ grid-template-columns:1fr; } .side .box{ border:1px var(--borderstyle) solid var(--line); border-radius:14px; padding:10px; background:var(--cardbg); box-shadow:var(--shadow); } .side .boxtitle{ font-weight:800; margin-bottom:6px; } .side .small{ font-size:12px; color:var(--muted); line-height:1.45; } .main .job{ margin-top:12px; } .main .jobhead{ display:flex; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px var(--borderstyle) solid var(--line); margin-bottom:8px; flex-wrap:wrap; align-items:baseline; } .main .jobtitle{ font-weight:800; min-width:240px; } .main .jobmetaRight{ color:var(--muted); font-size:11px; font-weight:700; margin-left:auto; text-align:right; white-space:nowrap; } .main ul{ margin:0; padding-left:18px; } .main li{ margin:0 0 6px 0; } @media print{ body{ padding:0 !important; background:var(--bodybg) !important; } .page{ background:var(--pagebg) !important; } .main,.side{ box-shadow:none !important; } }` : ""}
    ${activeLayoutId === "sidebar-right" ? `.page{ grid-template-columns: 5.3fr 2.7fr; } .main{ order:1; } .side{ order:2; }` : ""}
    ${useCompactLayout ? `.page{ padding:14px 18px; } .name{ font-size:24px; } li{ margin:4px 0; } .job{ margin-top:8px; padding-top:8px; } .section{ margin-top:12px; } .top{ padding-bottom:10px; }` : ""}
    ${useExecutiveLayout ? `.page{ padding:28px 32px; } .top{ padding-bottom:18px; border-bottom:2px solid var(--line); margin-bottom:18px; } .name{ font-size:34px; letter-spacing:-.03em; } .title{ font-size:15px; margin-top:8px; } .contact{ gap:8px; } .section{ margin-top:18px; } .h{ font-size:11px; letter-spacing:.18em; margin-bottom:10px; } .summary{ font-size:13px; line-height:1.6; } .job{ margin-top:14px; padding-top:12px; } .jobhead{ padding-bottom:8px; border-bottom:1px solid var(--line); margin-bottom:10px; } .box{ border-radius:12px; box-shadow:none; }` : ""}
    ${useRailLayout ? `.content.rail-layout{ display:grid; grid-template-columns:${activeLayoutId === "profile-panel" ? "320px 1fr" : "minmax(240px,.8fr) 1.2fr"}; gap:18px; align-items:start; } .rail-column,.main-column{ display:grid; gap:16px; } .rail-layout .section{ margin:0; }` : ""}
    ${activeLayoutId === "grid-blueprint" ? `.rail-layout .box, .rail-layout .section{ border-style:dashed; } .rail-layout .main-column .section:first-child{ background:var(--headerbg); padding:12px; border:1px dashed var(--line); box-shadow:var(--shadow); } .rail-layout .main-column .section:first-child .h{ color:var(--accent); }` : ""}
    ${activeLayoutId === "technical-grid" ? `.rail-layout .box, .rail-layout .section{ border-style:dashed; } .rail-layout .jobhead{ align-items:flex-start; } .rail-layout ul{ margin-left:16px; } .rail-layout .jobtitle,.rail-layout .jobcompany{ color:var(--accent); }` : ""}
    ${activeLayoutId === "profile-panel" ? `.top.profile-panel-top{ border-bottom:none; padding-bottom:0; } .profile-summary-card{ border:1px solid var(--line); background:var(--headerbg); padding:14px; border-radius:var(--radius); box-shadow:var(--shadow); } .profile-summary-card .summary{ margin-top:8px; } .profile-summary-card .h{ color:var(--accent); }` : ""}
    ${useTimelineLayout ? `.timeline-layout .job.timeline-job{ display:grid; grid-template-columns:160px 1fr; gap:16px; border-top:1px solid var(--line); padding-top:12px; } .timeline-layout .timeline-meta{ color:var(--accent); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; } .timeline-layout .timeline-body ul{ margin-top:8px; }` : ""}
    ${useCorporateLayout ? `.top{ background:var(--headerbg); border:1px solid var(--line); border-radius:var(--radius); padding:18px; box-shadow:var(--shadow); margin-bottom:18px; } .content.corporate-layout{ display:grid; gap:18px; } .corporate-layout .section{ border:1px solid var(--line); padding:14px; background:var(--cardbg); border-radius:var(--radius); box-shadow:var(--shadow); } .corporate-layout .h{ border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:12px; color:var(--accent); } .corporate-layout .jobhead{ padding-bottom:8px; border-bottom:1px solid var(--line); margin-bottom:10px; }` : ""}
  `;

  if (activeLayoutId === "sidebar" || activeLayoutId === "sidebar-right") {
    const sidebarContact = contactBits.map((c) => `<div class="chip">${c}</div>`).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resume - ${safe(profile.fullName || "Updated")}</title>
  <style>
    ${templateStylesResume(resolvedTemplate.colorSchemeId as ResumeTemplateId)}
    ${layoutCss}
  </style>
</head>
<body>
  <div class="page">
    <div class="side">
      ${sidebarPhotoHtml}
      <h1 class="name">${safe(profile.fullName || "Your Name")}</h1>
      <div class="title">${safe(profile.titleLine || "")}</div>

      <div class="contact">
        ${sidebarContact}
      </div>

      <div class="section">
        <div class="h">Summary</div>
        <div class="summary">${safe(profile.summary || "")}</div>
      </div>

      ${metaHtml}
      ${educationHtml}
      ${expertiseHtml}
    </div>

    <div class="main">
      <div class="section">
        <div class="h">Experience</div>
        ${jobsHtml || `<div class="summary">No experience sections yet.</div>`}
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  const useChips = activeCapabilities.usesChips && activeColorSchemeTheme.font !== "mono";

  const topContact = contactBits
    .map((c) => (useChips ? `<div class="chip">${c}</div>` : `<div>${c}</div>`))
    .join("");

  const inlineSummary = hasBar
    ? `<div style="margin-top:10px; color:var(--muted); font-size:12px;">
        ${safe(profile.summary || "")}
       </div>`
    : "";

  const summaryBlock = hasBar
    ? ""
    : `<div class="section">
         <div class="h">Summary</div>
         <div class="summary">${safe(profile.summary || "")}</div>
       </div>`;

  const experienceHtml = `
      <div class="section experience-section">
        <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Experience</div>
        ${(useTimelineLayout ? jobsHtmlTimeline : jobsHtml) || `<div class="summary">No experience sections yet.</div>`}
      </div>`;

  const contentHtml = useRailLayout
    ? `
      <div class="content rail-layout">
        <div class="rail-column">
          ${activeLayoutId === "profile-panel" ? `<div class="profile-summary-card"><div class="h">Profile</div><div class="summary">${safe(profile.summary || "")}</div></div>` : summaryBlock}
          ${metaHtml}
          ${educationHtml}
          ${expertiseHtml}
        </div>
        <div class="main-column">
          ${experienceHtml}
        </div>
      </div>`
    : `
      <div class="content ${useTimelineLayout ? "timeline-layout" : useCorporateLayout ? "corporate-layout" : ""}">
        ${summaryBlock}
        ${metaHtml}
        ${educationHtml}
        ${expertiseHtml}
        ${experienceHtml}
      </div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resume - ${safe(profile.fullName || "Updated")}</title>
  <style>
    ${templateStylesResume(resolvedTemplate.colorSchemeId as ResumeTemplateId)}
    ${layoutCss}
    ${
      resolvedTemplate.colorSchemeId === "terminal" || activeColorSchemeTheme.font === "mono"
        ? `
.top .contact{
  margin-top: 10px !important;
  display: grid !important;
  gap: 6px !important;
}
`
        : ""
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top ${activeLayoutId === "profile-panel" ? "profile-panel-top" : ""}">
      <div class="top-main">
        <div class="top-copy">
          <h1 class="name">${safe(profile.fullName || "Your Name")}</h1>
          <div class="title">${safe(profile.titleLine || "")}</div>

          <div class="contact">
            ${topContact}
          </div>

          ${activeLayoutId === "profile-panel" ? "" : inlineSummary}
        </div>

        ${standardPhotoHtml}
      </div>
    </div>

    ${contentHtml}
  </div>
</body>
</html>`;
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Popup blocked. Allow popups for this site to use Print.");
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();

  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {}
  }, 250);
}

function htmlToPlainText(html: string) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body?.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
}

function sanitizeMetaLines(lines: string[]) {
  const bad = [
    /max-width\s*:/i,
    /!important/i,
    /\{|\}/,
    /;\s*$/,
    /^\s*\./,
    /^\s*#/,
    /^\s*@/,
    /^\s*[a-z-]+\s*:\s*[^;]+;?/i,
  ];

  const actionVerbRe = /\b(served|supported|managed|coordinated|tested|reviewed|developed|created|updated|collaborated|maintained|implemented|organized|completed|prepared|piloted|reported|ensured|integrated|wrote|followed|communicated)\b/i;

  const cleaned: string[] = [];
  for (const raw of lines || []) {
    const trimmed = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    if (bad.some((re) => re.test(trimmed))) continue;

    const normalized = trimmed
      .replace(/^(?:🎮\s*)?games shipped\s*:\s*/i, "")
      .replace(/^key metrics\s*:\s*/i, "")
      .trim();

    if (!normalized) continue;

    const parts = normalized
      .split(/\s*[•|]\s*|\s*,\s*(?=[A-Z0-9])/)
      .map((x) => x.trim())
      .filter(Boolean);

    const candidates = parts.length > 1 ? parts : [normalized];
    for (const candidate of candidates) {
      const value = candidate.trim();
      if (!value) continue;
      if (value.length > 90) continue;
      if (/[.!?].+[.!?]/.test(value)) continue;
      if (actionVerbRe.test(value)) continue;
      cleaned.push(value);
    }
  }

  return Array.from(new Set(cleaned)).slice(0, 24);
}

function parseEducationLines(input: string) {
  const text = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!text) return [];

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const schoolRe = /\b(university|college|institute|polytechnic|academy|school)\b/i;
  const degreeRe = /\b(bachelor|master|doctorate|phd|mba|masc|msc|beng|b\.eng|bsc|b\.sc|ba|b\.a|bs|m\.sc|m\.a|ms|ma|associate|diploma)\b/i;
  const certRe = /\b(certification|certifications|certificate|certified|license|licence|az-900|aws|gcp|azure|microsoft certified|google cloud|scrum|pmp|istqb)\b/i;
  const headingRe = /^\s*(education|education & certifications|education and certifications|certifications|training)\s*:?\s*$/i;
  const stopRe = /^\s*(experience|work experience|professional experience|employment|projects|skills|technical skills|areas of expertise|summary|profile|highlights)\s*:?\s*$/i;
  const actionVerbRe = /\b(served|supported|managed|coordinated|tested|reviewed|developed|created|updated|collaborated|maintained|implemented|organized|completed|prepared|piloted|reported|ensured|integrated|wrote|followed|communicated)\b/i;

  const out: string[] = [];
  let inEducationSection = false;

  for (const raw of lines) {
    const line = raw.replace(/\(link to thesis\)/gi, "").replace(/\s+/g, " ").trim();
    if (!line) continue;

    if (headingRe.test(line)) {
      inEducationSection = true;
      continue;
    }
    if (inEducationSection && stopRe.test(line)) {
      inEducationSection = false;
      continue;
    }

    const looksEducational = schoolRe.test(line) || degreeRe.test(line) || certRe.test(line);
    if (!looksEducational) continue;
    if (actionVerbRe.test(line)) continue;
    if (line.length > 160) continue;

    if (!out.some((x) => x.toLowerCase() === line.toLowerCase())) {
      out.push(line);
    }
  }

  return out.slice(0, 8);
}

function parseAreasOfExpertise(args: {
  resumeText: string;
  summary?: string;
  bulletsBySection?: Record<string, string[]>;
  analysisBullets?: string[];
  maxItems?: number;
}) {
  const sourceParts = [
    String(args.resumeText ?? ""),
    String(args.summary ?? ""),
    ...(args.analysisBullets ?? []).map((x) => String(x ?? "")),
    ...Object.values(args.bulletsBySection ?? {}).flat().map((x) => String(x ?? "")),
  ];

  const source = sourceParts.join("\n").toLowerCase();
  const maxItems = Math.max(6, Math.min(args.maxItems ?? 12, 16));

  const catalog: Array<{ label: string; terms: string[]; weight?: number }> = [
    { label: "Quality Assurance", terms: ["\\bquality assurance\\b", "\\bqa\\b"], weight: 4 },
    { label: "Test Automation", terms: ["\\btest automation\\b", "\\bautomation testing\\b", "\\bautomation\\b"], weight: 4 },
    { label: "Manual Testing", terms: ["\\bmanual testing\\b"], weight: 2 },
    { label: "Regression Testing", terms: ["\\bregression testing\\b", "\\bregression\\b"], weight: 3 },
    { label: "API Testing", terms: ["\\bapi testing\\b", "\\bapi\\b", "\\bpostman\\b"], weight: 4 },
    { label: "UI Testing", terms: ["\\bui testing\\b", "\\bfrontend testing\\b", "\\buser interface testing\\b"], weight: 2 },
    { label: "End-to-End Testing", terms: ["\\bend-to-end testing\\b", "\\be2e\\b", "\\bend to end\\b"], weight: 3 },
    { label: "Performance Testing", terms: ["\\bperformance testing\\b", "\\bload testing\\b", "\\bstress testing\\b"], weight: 3 },
    { label: "Mobile Testing", terms: ["\\bmobile testing\\b", "\\bios\\b", "\\bandroid\\b"], weight: 2 },
    { label: "Web Testing", terms: ["\\bweb testing\\b", "\\bbrowser testing\\b"], weight: 2 },
    { label: "Game Testing", terms: ["\\bgame testing\\b", "\\bgame qa\\b", "\\bgameplay testing\\b"], weight: 3 },
    { label: "Playwright", terms: ["\\bplaywright\\b"], weight: 4 },
    { label: "Selenium", terms: ["\\bselenium\\b"], weight: 4 },
    { label: "Cypress", terms: ["\\bcypress\\b"], weight: 4 },
    { label: "Postman", terms: ["\\bpostman\\b"], weight: 3 },
    { label: "Jira", terms: ["\\bjira\\b"], weight: 3 },
    { label: "TestRail", terms: ["\\btestrail\\b"], weight: 3 },
    { label: "SQL", terms: ["\\bsql\\b", "\\bpostgres\\b", "\\bmysql\\b"], weight: 3 },
    { label: "CI/CD", terms: ["\\bci/cd\\b", "\\bcontinuous integration\\b", "\\bcontinuous delivery\\b"], weight: 3 },
    { label: "Jenkins", terms: ["\\bjenkins\\b"], weight: 3 },
    { label: "Agile", terms: ["\\bagile\\b", "\\bscrum\\b", "\\bkanban\\b"], weight: 3 },
    { label: "Cross-Functional Collaboration", terms: ["\\bcross-functional\\b", "\\bcross functional\\b", "\\bstakeholders\\b"], weight: 2 },
    { label: "Defect Triage", terms: ["\\bdefect triage\\b", "\\bbug triage\\b", "\\btriage\\b"], weight: 3 },
    { label: "Release Testing", terms: ["\\brelease testing\\b", "\\brelease validation\\b", "\\bgo-live\\b"], weight: 3 },
    { label: "Test Planning", terms: ["\\btest planning\\b", "\\btest plans\\b", "\\btest strategy\\b"], weight: 3 },
    { label: "Documentation", terms: ["\\bdocumentation\\b", "\\btest cases\\b", "\\btest scripts\\b"], weight: 2 },
  ];

  const scored = catalog
    .map((item) => {
      const hits = item.terms.reduce((n, term) => {
        try {
          const re = new RegExp(term, "i");
          return n + (re.test(source) ? 1 : 0);
        } catch {
          return n + (source.includes(term.toLowerCase()) ? 1 : 0);
        }
      }, 0);
      return { label: item.label, score: hits * (item.weight ?? 1) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return scored.slice(0, maxItems).map((x) => x.label);
}


function tokenizeWords(s: string) {
  return String(s ?? "").trim().split(/\s+/).filter(Boolean);
}

function countCommonPrefixWords(a: string[], b: string[]) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function countCommonSuffixWords(a: string[], b: string[], prefixLen: number) {
  let i = 0;
  while (
    a.length - 1 - i >= prefixLen &&
    b.length - 1 - i >= prefixLen &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) {
    i += 1;
  }
  return i;
}

function diffRewriteWords(original: string, rewritten: string) {
  const a = tokenizeWords(original);
  const b = tokenizeWords(rewritten);

  const prefixLen = countCommonPrefixWords(a, b);
  const suffixLen = countCommonSuffixWords(a, b, prefixLen);

  return {
    prefix: b.slice(0, prefixLen).join(" "),
    changed: b.slice(prefixLen, b.length - suffixLen).join(" "),
    suffix: b.slice(b.length - suffixLen).join(" "),
  };
}

function scoreVerbStrength(text: string) {
  const first = tokenizeWords(text)[0]?.toLowerCase().replace(/[^a-z-]/g, "") || "";
  const strong = new Set([
    "led", "drove", "delivered", "built", "launched", "optimized", "improved", "increased",
    "reduced", "streamlined", "owned", "implemented", "accelerated", "scaled", "boosted",
    "designed", "created", "mentored", "shipped", "spearheaded", "modernized", "stabilized",
    "strengthened", "transformed", "orchestrated", "resolved", "advanced", "upgraded"
  ]);
  const medium = new Set([
    "managed", "supported", "coordinated", "tested", "analyzed", "reviewed", "developed",
    "documented", "collaborated", "maintained", "executed", "organized", "facilitated",
    "investigated", "validated", "monitored", "triaged", "integrated", "migrated", "updated"
  ]);
  if (strong.has(first)) return 3;
  if (medium.has(first)) return 2;
  return first ? 1 : 0;
}

function buildRewriteScorecard(args: {
  original: string;
  rewritten: string;
  keywordHits?: string[];
  suggestedKeywords?: string[];
  needsMoreInfo?: boolean;
}) {
  const originalText = String(args.original ?? "").trim();
  const rewrittenText = String(args.rewritten ?? "").trim();

  const originalWords = tokenizeWords(originalText);
  const rewrittenWords = tokenizeWords(rewrittenText);

  const verbDelta = Math.max(0, scoreVerbStrength(rewrittenText) - scoreVerbStrength(originalText));
  const keywordHits = Array.isArray(args.keywordHits) ? args.keywordHits.length : 0;
  const keywordTotal = Array.isArray(args.suggestedKeywords) ? args.suggestedKeywords.length : 0;
  const keywordCoverage = keywordTotal > 0 ? keywordHits / keywordTotal : 0;

  const wordDelta = rewrittenWords.length - originalWords.length;

  const numberLike = /\b(?:\d+(?:\.\d+)?%?|\$\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?x)\b/g;
  const originalNums = (originalText.match(numberLike) || []).length;
  const rewrittenNums = (rewrittenText.match(numberLike) || []).length;

  const impactSignals = /\b(increased|reduced|improved|boosted|cut|saved|grew|raised|lowered|optimized|streamlined|accelerated|delivered|launched|resolved|stabilized|strengthened|enhanced|expanded)\b/i;
  const impactDelta =
    Math.max(0, rewrittenNums - originalNums) +
    (impactSignals.test(rewrittenText) && !impactSignals.test(originalText) ? 1 : 0);

  const normalizedOriginal = normalizeForMatch(originalText);
  const normalizedRewritten = normalizeForMatch(rewrittenText);
  const exactCopy = normalizedOriginal === normalizedRewritten;

  const diff = diffRewriteWords(originalText, rewrittenText);
  const changedWords = tokenizeWords(diff.changed).length;
  const nearCopy = !exactCopy && changedWords <= 3;

  const structureGain =
    rewrittenWords.length > originalWords.length
      ? Math.min(10, Math.max(4, Math.round((rewrittenWords.length - originalWords.length) * 1.1)))
      : rewrittenWords.length < originalWords.length
      ? 6
      : 5;

  const clarityGain =
    rewrittenWords.length >= Math.max(4, Math.round(originalWords.length * 0.7)) ? 8 : 0;

  const total = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        64 +
          verbDelta * 8 +
          impactDelta * 8 +
          keywordCoverage * 6 +
          structureGain +
          clarityGain +
          (args.needsMoreInfo ? -10 : 6) +
          (wordDelta > 0 ? 4 : 2) -
          (exactCopy ? 35 : 0) -
          (nearCopy ? 12 : 0)
      )
    )
  );

  return {
    total,
    wordDelta,
    impactDelta,
    confidence:
      args.needsMoreInfo
        ? "Review"
        : total >= 88
        ? "Strong"
        : total >= 72
        ? "Good"
        : total >= 58
        ? "Fair"
        : "Weak",
  };
}


function shouldForceLowScoreRetry(args: {
  original: string;
  rewritten: string;
  keywordHits?: string[];
  suggestedKeywords?: string[];
  needsMoreInfo?: boolean;
}) {
  const rewritten = String(args.rewritten ?? "").trim();
  const original = String(args.original ?? "").trim();

  if (!rewritten) return true;
  if (normalizeForMatch(rewritten) === normalizeForMatch(original)) return true;

  const score = buildRewriteScorecard(args);
  return score.total < 80;
}


type AtsScoreResult = {
  overall: number;
  label: "Weak" | "Fair" | "Good" | "Strong";
  keywordCoverage: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  metricsCount: number;
  strongVerbCount: number;
  bulletQualityAverage: number;
  sectionCompleteness: number;
  roleFocus: string[];
  signature: string;
  notes: string[];
};

function normalizeAtsText(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^\w+.#/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupAtsKeyword(term: string) {
  return normalizeAtsText(term)
    .replace(/\b(and|or|with|for|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string) {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWholeWord(text: string, term: string) {
  const cleaned = cleanupAtsKeyword(term);
  if (!cleaned) return false;
  const pattern = `(^|\\s)${escapeRegex(cleaned)}(?=$|\\s)`;
  return new RegExp(pattern, "i").test(text);
}

function countMetricSignals(text: string) {
  const source = String(text ?? "");
  const numberHits = source.match(/\b(?:\d+(?:\.\d+)?%?|\$\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?x)\b/g) || [];
  return numberHits.length;
}


function uniqueTerms(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value ?? "").trim();
    const key = cleanupAtsKeyword(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function combineBackendPrimaryMissingTerms(ats?: AnalyzeAtsPayload) {
  return uniqueTerms([
    ...(ats?.missingCriticalTerms ?? []),
    ...(ats?.missingImportantTerms ?? []),
  ]);
}


function combineBackendMissingTerms(ats?: AnalyzeAtsPayload) {
  return uniqueTerms([
    ...combineBackendPrimaryMissingTerms(ats),
    ...(ats?.missingNiceToHaveTerms ?? []),
  ]);
}

function capMissingTitleNoise(ats: AnalyzeAtsPayload | undefined, terms: string[], maxTitleTerms = 1) {
  const titleTerms = new Set(
    uniqueTerms(ats?.missingByCategory?.titles ?? []).map((term) => cleanupAtsKeyword(term))
  );

  let titleCount = 0;
  const out: string[] = [];

  for (const term of terms) {
    const key = cleanupAtsKeyword(term);
    const isTitle = titleTerms.has(key);
    if (isTitle) {
      if (titleCount >= maxTitleTerms) continue;
      titleCount += 1;
    }
    out.push(term);
  }

  return out;
}


type AtsMissingCategoryKey = "titles" | "core" | "tools" | "methods" | "domain" | "outcomes";
type AtsRoleFamily =
  | "qa"
  | "game_production"
  | "event_production"
  | "engineering"
  | "art"
  | "product"
  | "data"
  | "general";

const ATS_EVIDENCE_STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "by",
  "from",
  "at",
  "into",
  "across",
  "through",
  "plus",
]);

const ATS_ROLE_FAMILY_PATTERNS: Record<AtsRoleFamily, RegExp[]> = {
  qa: [
    /\bqa\b/i,
    /\bquality assurance\b/i,
    /\btest(?:ing| plans?| strategy| rail)?\b/i,
    /\btestrail\b/i,
    /\bbug\b/i,
    /\bdefect\b/i,
    /\btrc\b/i,
    /\btcr\b/i,
    /\bcertification\b/i,
    /\bconsole certification\b/i,
  ],
  game_production: [
    /\bproduction director\b/i,
    /\bexecutive producer\b/i,
    /\bsenior producer\b/i,
    /\bproducer\b/i,
    /\bproduction leadership\b/i,
    /\bgame development\b/i,
    /\bdevelopment lifecycle\b/i,
    /\bconcept through launch\b/i,
    /\blive support\b/i,
    /\bexternal development\b/i,
    /\bpartner management\b/i,
    /\bstakeholder management\b/i,
    /\bproduction culture\b/i,
    /\bbest[- ]in[- ]class production\b/i,
    /\bcreative leadership\b/i,
    /\bcreative vision\b/i,
    /\bplayer-first\b/i,
    /\bfranchise\b/i,
    /\baaa\b/i,
    /\barpg\b/i,
    /\brpg\b/i,
    /\btradeoffs?\b/i,
    /\brisk management\b/i,
    /\bprogram management\b/i,
    /\bschedule management\b/i,
    /\bmilestones?\b/i,
    /\bbacklog management\b/i,
    /\bdependency management\b/i,
    /\bissue tracking\b/i,
    /\bescalation management\b/i,
    /\bgantt\b/i,
  ],
  event_production: [
    /\blive entertainment\b/i,
    /\blive event\b/i,
    /\bevent production\b/i,
    /\bvenue\b/i,
    /\bpermitting\b/i,
    /\bcad drawings?\b/i,
    /\blighting\b/i,
    /\bsound\b/i,
    /\bstage\b/i,
    /\bvideo\b/i,
    /\bproduction budgets?\b/i,
    /\bv(?:endor|endors)\b/i,
    /\bvendor\b/i,
    /\bmsa contracts?\b/i,
    /\bp&l\b/i,
    /\binvoice management\b/i,
    /\bsite visits?\b/i,
  ],
  engineering: [
    /\bengineer(?:ing)?\b/i,
    /\bdeveloper\b/i,
    /\bsoftware\b/i,
    /\bprogramming\b/i,
    /\bsystem design\b/i,
    /\barchitecture\b/i,
    /\bapi\b/i,
    /\bbackend\b/i,
    /\bfrontend\b/i,
    /\bc\+\+\b/i,
    /\bc#\b/i,
    /\bunity\b/i,
    /\bunreal\b/i,
    /\baws\b/i,
    /\bdocker\b/i,
    /\bkubernetes\b/i,
    /\bsql\b/i,
  ],
  art: [
    /\bart\b/i,
    /\bartist\b/i,
    /\bconcept art\b/i,
    /\b3d\b/i,
    /\b2d\b/i,
    /\bmodeling\b/i,
    /\banimation\b/i,
    /\brigging\b/i,
    /\bzbrush\b/i,
    /\bmaya\b/i,
    /\bblender\b/i,
    /\bphotoshop\b/i,
    /\billustration\b/i,
  ],
  product: [
    /\bproduct\b/i,
    /\bproduct owner\b/i,
    /\bproduct manager\b/i,
    /\broadmap\b/i,
    /\broadmapping\b/i,
    /\bprioritization\b/i,
    /\bexperimentation\b/i,
    /\ba\/b testing\b/i,
    /\bfeature adoption\b/i,
    /\brequirements\b/i,
    /\bacceptance criteria\b/i,
  ],
  data: [
    /\bdata\b/i,
    /\banalytics\b/i,
    /\bmachine learning\b/i,
    /\bml\b/i,
    /\btelemetry\b/i,
    /\bsnowflake\b/i,
    /\bbigquery\b/i,
    /\bairflow\b/i,
    /\bdbt\b/i,
    /\bpython\b/i,
    /\bpandas\b/i,
    /\bforecast(?:ing)?\b/i,
  ],
  general: [],
};

const ATS_FAMILY_TERM_PATTERNS: Array<{ family: AtsRoleFamily; pattern: RegExp }> = [
  { family: "qa", pattern: /\b(qa|quality assurance|game qa lead|qa lead|test plans?|test planning|test strategy|qa strategy|risk-based testing|testrail|trc|tcr|console certification|live ops qa|bug triage|defect tracking|regression testing|smoke testing)\b/i },
  { family: "event_production", pattern: /\b(live entertainment|event production|venue|permitting|cad drawings?|lighting|sound|stage|video|production budget|vendor|msa contracts?|invoice management|p&l|site visits?)\b/i },
  { family: "game_production", pattern: /\b(production director|executive producer|producer|game production|production leadership|production culture|program management|schedule management|milestones?|backlog management|dependency management|risk management|issue tracking|escalation management|external development|co-development|outsourcing|vertical slice|aaa development|aa development|franchise|live support|partner management|stakeholder management|tradeoffs?|gantt)\b/i },
  { family: "engineering", pattern: /\b(engineer(?:ing)?|developer|software|system design|architecture|api|backend|frontend|c\+\+|c#|unity|unreal engine|aws|docker|kubernetes|sql|nintendo switch)\b/i },
  { family: "art", pattern: /\b(art|artist|concept art|3d|2d|modeling|animation|rigging|maya|blender|zbrush|photoshop|illustration)\b/i },
  { family: "product", pattern: /\b(product|product owner|product manager|roadmap|roadmapping|prioritization|experimentation|a\/b testing|requirements|acceptance criteria)\b/i },
  { family: "data", pattern: /\b(data|analytics|machine learning|telemetry|snowflake|bigquery|airflow|dbt|forecast(?:ing)?)\b/i },
];

function stemAtsToken(token: string) {
  const t = cleanupAtsKeyword(token);
  if (!t) return "";
  if (t.endsWith("ies") && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
  if (t.endsWith("ed") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("es") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("s") && t.length > 3) return t.slice(0, -1);
  return t;
}

function tokenizeAtsEvidence(value: string) {
  return cleanupAtsKeyword(value)
    .split(/\s+/)
    .map((token) => stemAtsToken(token))
    .filter((token) => token && token.length >= 3 && !ATS_EVIDENCE_STOPWORDS.has(token));
}

function buildAtsTermVariants(term: string) {
  const base = cleanupAtsKeyword(term);
  if (!base) return [];

  const variants = new Set<string>([
    base,
    base.replace(/-/g, " "),
    base.replace(/\//g, " "),
    base.replace(/\s+/g, "-"),
    base.replace(/\s+/g, ""),
  ]);

  const tokens = base.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    variants.add(tokens.join(" "));
    variants.add(tokens.join("-"));
  }

  if (base.endsWith("s")) {
    variants.add(base.slice(0, -1));
  } else {
    variants.add(`${base}s`);
  }

  if (base.endsWith("ies")) {
    variants.add(`${base.slice(0, -3)}y`);
  } else if (base.endsWith("y")) {
    variants.add(`${base.slice(0, -1)}ies`);
  }

  return Array.from(variants).filter(Boolean);
}

function getAtsMissingTermsByCategory(ats: AnalyzeAtsPayload | undefined, category: AtsMissingCategoryKey) {
  return uniqueTerms(ats?.missingByCategory?.[category] ?? []);
}

function buildJobEvidenceIndex(jobText: string) {
  const normalized = normalizeAtsText(jobText);
  const tokens = tokenizeAtsEvidence(normalized);
  const tokenSet = new Set(tokens);
  return {
    normalized,
    tokenSet,
  };
}

function detectJobRoleFamily(args: {
  targetPosition?: string;
  ats?: AnalyzeAtsPayload;
  jobText?: string;
}) : AtsRoleFamily {
  const explicitTitle = String(args.targetPosition ?? "").trim();
  const title = explicitTitle
    ? explicitTitle
    : [
        String(args.ats?.detectedJobRole?.roleName ?? "").trim(),
        String(args.ats?.targetRole?.roleName ?? "").trim(),
      ]
        .filter(Boolean)
        .join(" | ");

  const body = String(args.jobText ?? "");
  const combined = `${title}
${body}`;

  const titleFirst: Array<{ family: AtsRoleFamily; pattern: RegExp }> = [
    { family: "qa", pattern: /(qa|quality assurance|test lead|qa lead|qa manager|quality lead)/i },
    { family: "game_production", pattern: /(production director|director of production|executive producer|senior producer|production lead|producer)/i },
    { family: "event_production", pattern: /(event producer|live event producer|event production|venue production)/i },
    { family: "engineering", pattern: /(engineer|developer|programmer|sdet|technical director)/i },
    { family: "art", pattern: /(artist|art director|technical artist|animator)/i },
    { family: "product", pattern: /(product owner|product manager|director of product)/i },
    { family: "data", pattern: /(data scientist|data engineer|analytics engineer|machine learning)/i },
  ];

  if (explicitTitle) {
    if (/(production director|director of production|executive producer|senior producer|production lead)/i.test(explicitTitle)) {
      if (/(live entertainment|event production|venue|permitting|cad drawings?|lighting|sound|stage|video|p&l|msa contracts?)/i.test(combined)) {
        return "event_production";
      }
      return "game_production";
    }

    for (const entry of titleFirst) {
      if (entry.pattern.test(explicitTitle)) return entry.family;
    }
  }

  const scored: Array<{ family: AtsRoleFamily; score: number }> = (Object.keys(ATS_ROLE_FAMILY_PATTERNS) as AtsRoleFamily[])
    .filter((family) => family !== "general")
    .map((family) => {
      const score = ATS_ROLE_FAMILY_PATTERNS[family].reduce((sum, pattern) => sum + (pattern.test(combined) ? 1 : 0), 0);
      return { family, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored[0]?.score) return scored[0].family;
  return "general";
}

function classifyAtsTermFamily(term: string): AtsRoleFamily | "mixed" | "general" {
  const families = ATS_FAMILY_TERM_PATTERNS
    .filter((entry) => entry.pattern.test(term))
    .map((entry) => entry.family);

  const uniqueFamilies = Array.from(new Set(families));
  if (!uniqueFamilies.length) return "general";
  if (uniqueFamilies.length > 1) return "mixed";
  return uniqueFamilies[0];
}

function familyAllowsFallback(family: AtsRoleFamily, category: AtsMissingCategoryKey) {
  if (family === "general") return category === "core" || category === "methods" || category === "outcomes";
  if (family === "qa") return category !== "domain";
  if (family === "engineering") return category !== "titles";
  if (family === "game_production" || family === "event_production") return category !== "tools";
  return category === "core" || category === "methods" || category === "outcomes";
}

function familyMatchWeight(args: {
  dominantFamily: AtsRoleFamily;
  term: string;
  category: AtsMissingCategoryKey;
  evidence: ReturnType<typeof evaluateJobTermEvidence>;
}) {
  const termFamily = classifyAtsTermFamily(args.term);
  if (args.dominantFamily === "general") return 0;
  if (termFamily === "general" || termFamily === "mixed") return 0;
  if (termFamily === args.dominantFamily) return 28;
  if (args.evidence.exactVariant || args.evidence.strong) return -6;
  if (!familyAllowsFallback(args.dominantFamily, args.category)) return -90;
  if (args.evidence.moderate) return -28;
  return -120;
}

function evaluateJobTermEvidence(
  jobText: string,
  term: string,
  category: AtsMissingCategoryKey,
  dominantFamily: AtsRoleFamily = "general"
) {
  const normalizedJob = normalizeAtsText(jobText);
  const jobIndex = buildJobEvidenceIndex(jobText);
  const variants = buildAtsTermVariants(term);
  const termTokens = tokenizeAtsEvidence(term);

  const exactVariant = variants.some((variant) => {
    if (!variant) return false;
    return hasWholeWord(normalizedJob, variant) || normalizedJob.includes(` ${variant} `);
  });

  const tokenHits = termTokens.filter((token) => jobIndex.tokenSet.has(token)).length;
  const tokenRatio = termTokens.length ? tokenHits / termTokens.length : 0;

  const multiWord = termTokens.length >= 2;
  const singleWord = termTokens.length <= 1;

  const categoryStrictness: Record<AtsMissingCategoryKey, { strong: number; moderate: number }> = {
    titles: { strong: 1, moderate: 1 },
    core: { strong: 0.67, moderate: 0.5 },
    tools: { strong: 1, moderate: 0.75 },
    methods: { strong: 0.67, moderate: 0.5 },
    domain: { strong: 1, moderate: 0.67 },
    outcomes: { strong: 0.67, moderate: 0.5 },
  };

  const thresholds = categoryStrictness[category];

  const strong =
    exactVariant ||
    (multiWord && tokenRatio >= thresholds.strong) ||
    (!singleWord && tokenHits >= 2 && tokenRatio >= thresholds.moderate);

  const moderate =
    strong ||
    (multiWord && tokenRatio >= thresholds.moderate) ||
    (singleWord && tokenHits >= 1 && (category === "core" || category === "methods" || category === "outcomes"));

  const fallbackEligible = familyAllowsFallback(dominantFamily, category);

  const familyWeight = familyMatchWeight({
    dominantFamily,
    term,
    category,
    evidence: {
      exactVariant,
      strong,
      moderate,
      fallbackEligible,
      tokenHits,
      tokenRatio,
      score: 0,
      familyWeight: 0,
      blockedByFamily: false,
    },
  });

  const blockedByFamily = familyWeight <= -100 && !exactVariant && !strong;

  const score =
    (exactVariant ? 140 : 0) +
    tokenHits * 20 +
    Math.round(tokenRatio * 30) +
    (strong ? 25 : 0) +
    (moderate ? 10 : 0) +
    (fallbackEligible ? 4 : 0) +
    familyWeight;

  return {
    exactVariant,
    strong,
    moderate,
    fallbackEligible,
    tokenHits,
    tokenRatio,
    score,
    familyWeight,
    blockedByFamily,
  };
}

function rankTermsByJobPosting(
  jobText: string,
  terms: string[],
  category: AtsMissingCategoryKey,
  dominantFamily: AtsRoleFamily
) {
  return uniqueTerms(terms)
    .map((term, index) => {
      const evidence = evaluateJobTermEvidence(jobText, term, category, dominantFamily);
      return {
        term,
        index,
        evidence,
      };
    })
    .filter((entry) => !entry.evidence.blockedByFamily)
    .sort((a, b) => b.evidence.score - a.evidence.score || a.index - b.index)
    .map((entry) => entry.term);
}

function buildCategoryAwareMissingTerms(args: {
  ats?: AnalyzeAtsPayload;
  jobText?: string;
  targetPosition?: string;
}) {
  const ats = args.ats;
  const jobText = String(args.jobText ?? "").trim();
  const targetPosition = String(args.targetPosition ?? "").trim();
  const dominantFamily = detectJobRoleFamily({
    targetPosition,
    ats,
    jobText,
  });

  const criticalSet = new Set(uniqueTerms(ats?.missingCriticalTerms ?? []).map((term) => cleanupAtsKeyword(term)));
  const importantSet = new Set(uniqueTerms(ats?.missingImportantTerms ?? []).map((term) => cleanupAtsKeyword(term)));

  const quotaOrder: Array<{ category: AtsMissingCategoryKey; quota: number }> = [
    { category: "core", quota: 4 },
    { category: "methods", quota: 4 },
    { category: "outcomes", quota: 2 },
    { category: "tools", quota: dominantFamily === "engineering" ? 4 : dominantFamily === "qa" ? 4 : 2 },
    { category: "domain", quota: dominantFamily === "qa" ? 3 : dominantFamily === "game_production" ? 2 : dominantFamily === "event_production" ? 2 : 1 },
    { category: "titles", quota: 1 },
  ];

  const buckets = quotaOrder.map(({ category, quota }) => {
    const baseTerms = getAtsMissingTermsByCategory(ats, category).filter((term) => {
      const key = cleanupAtsKeyword(term);
      return criticalSet.has(key) || importantSet.has(key);
    });

    const ranked = jobText ? rankTermsByJobPosting(jobText, baseTerms, category, dominantFamily) : baseTerms;

    const exact = jobText ? ranked.filter((term) => evaluateJobTermEvidence(jobText, term, category, dominantFamily).exactVariant) : [];
    const strong = jobText
      ? ranked.filter((term) => {
          const ev = evaluateJobTermEvidence(jobText, term, category, dominantFamily);
          return !ev.exactVariant && ev.strong;
        })
      : [];
    const moderate = jobText
      ? ranked.filter((term) => {
          const ev = evaluateJobTermEvidence(jobText, term, category, dominantFamily);
          return !ev.exactVariant && !ev.strong && ev.moderate;
        })
      : [];

    const fallback = ranked.filter((term) => {
      const ev = jobText ? evaluateJobTermEvidence(jobText, term, category, dominantFamily) : null;
      if (!jobText) return true;
      if (!ev) return false;
      if (ev.blockedByFamily) return false;

      const isToolOrDomain = category === "tools" || category === "domain";
      if (isToolOrDomain) {
        return ev.exactVariant || ev.strong || (ev.moderate && ev.tokenHits >= 1);
      }

      if (!targetPosition) return false;

      if (category === "core" || category === "methods" || category === "outcomes") {
        return ev.fallbackEligible && ev.familyWeight >= 0;
      }

      return false;
    });

    return { category, quota, exact, strong, moderate, fallback };
  });

  const selected: string[] = [];
  const seen = new Set<string>();

  const pushTerm = (term: string) => {
    const key = cleanupAtsKeyword(term);
    if (!term || !key || seen.has(key)) return;
    seen.add(key);
    selected.push(term);
  };

  for (const bucket of buckets) {
    for (const term of bucket.exact.slice(0, bucket.quota)) pushTerm(term);
  }

  for (const bucket of buckets) {
    if ((bucket.exact.length || 0) >= bucket.quota) continue;
    const needed = bucket.quota - bucket.exact.length;
    for (const term of bucket.strong.slice(0, needed)) pushTerm(term);
  }

  for (const bucket of buckets) {
    const already = selected.filter((term) => {
      const key = cleanupAtsKeyword(term);
      return getAtsMissingTermsByCategory(ats, bucket.category).some((candidate) => cleanupAtsKeyword(candidate) === key);
    }).length;
    if (already >= bucket.quota) continue;
    const needed = bucket.quota - already;
    for (const term of bucket.moderate.slice(0, needed)) pushTerm(term);
  }

  const selectedCountBeforeFallback = selected.length;
  if (selectedCountBeforeFallback < 8) {
    for (const bucket of buckets) {
      const already = selected.filter((term) => {
        const key = cleanupAtsKeyword(term);
        return getAtsMissingTermsByCategory(ats, bucket.category).some((candidate) => cleanupAtsKeyword(candidate) === key);
      }).length;
      if (already >= bucket.quota) continue;
      const needed = bucket.quota - already;
      for (const term of bucket.fallback.slice(0, needed)) pushTerm(term);
    }
  }

  const backendPrimary = uniqueTerms([
    ...(ats?.missingCriticalTerms ?? []),
    ...(ats?.missingImportantTerms ?? []),
  ]);

  const finalSelected = capMissingTitleNoise(ats, selected, 1).slice(0, 16);
  if (finalSelected.length > 0) return finalSelected;

  return capMissingTitleNoise(ats, backendPrimary, 1).slice(0, 16);
}


function buildDisplayedAtsKeywords(args: {
  ats?: AnalyzeAtsPayload;
  jobText?: string;
  targetPosition?: string;
  expertiseItems?: string[];
  ignoredMissingKeywords?: string[];
}) {
  const ats = args.ats;
  const jobText = String(args.jobText ?? "").trim();
  const targetPosition = String(args.targetPosition ?? "").trim();
  const dominantFamily = detectJobRoleFamily({
    targetPosition,
    ats,
    jobText,
  });

  const expertiseSet = new Set(
    uniqueTerms(args.expertiseItems ?? []).map((term) => cleanupAtsKeyword(term))
  );
  const ignoredSet = new Set(
    uniqueTerms(args.ignoredMissingKeywords ?? []).map((term) => cleanupAtsKeyword(term))
  );

  const baseMatchedAll = uniqueTerms(ats?.matchedTerms ?? []);
  const primaryMissingAll = combineBackendPrimaryMissingTerms(ats);

  const jobAnchoredMatched = jobText
    ? uniqueTerms(
        baseMatchedAll
          .map((term) => {
            const category: AtsMissingCategoryKey =
              getAtsMissingTermsByCategory(ats, "tools").some((candidate) => cleanupAtsKeyword(candidate) === cleanupAtsKeyword(term))
                ? "tools"
                : getAtsMissingTermsByCategory(ats, "domain").some((candidate) => cleanupAtsKeyword(candidate) === cleanupAtsKeyword(term))
                  ? "domain"
                  : getAtsMissingTermsByCategory(ats, "methods").some((candidate) => cleanupAtsKeyword(candidate) === cleanupAtsKeyword(term))
                    ? "methods"
                    : "core";

            return {
              term,
              evidence: evaluateJobTermEvidence(jobText, term, category, dominantFamily),
            };
          })
          .filter((entry) => !entry.evidence.blockedByFamily)
          .filter((entry) => {
            if (entry.evidence.exactVariant || entry.evidence.strong) return true;
            return entry.evidence.moderate && entry.evidence.tokenHits >= 1;
          })
          .sort((a, b) => b.evidence.score - a.evidence.score)
          .map((entry) => entry.term)
      )
    : baseMatchedAll.slice(0, 16);

  const primaryMissing = buildCategoryAwareMissingTerms({
    ats,
    jobText,
    targetPosition,
  });

  const jdExplicitToolDomainBoost = jobText
    ? uniqueTerms([
        ...getAtsMissingTermsByCategory(ats, "tools")
          .filter((term) => {
            const ev = evaluateJobTermEvidence(jobText, term, "tools", dominantFamily);
            return !ev.blockedByFamily && (ev.exactVariant || ev.strong || (ev.moderate && ev.tokenHits >= 1));
          })
          .slice(0, 4),
        ...getAtsMissingTermsByCategory(ats, "domain")
          .filter((term) => {
            const ev = evaluateJobTermEvidence(jobText, term, "domain", dominantFamily);
            return !ev.blockedByFamily && (ev.exactVariant || ev.strong || (ev.moderate && ev.tokenHits >= 1));
          })
          .slice(0, 3),
      ])
    : [];

  const expertiseSatisfied = primaryMissingAll.filter((term) => expertiseSet.has(cleanupAtsKeyword(term)));

  const matchedKeywords = uniqueTerms([
    ...jobAnchoredMatched,
    ...expertiseSatisfied.filter((term) => !jobText || !evaluateJobTermEvidence(jobText, term, "core", dominantFamily).blockedByFamily),
    ...baseMatchedAll.filter((term) => expertiseSet.has(cleanupAtsKeyword(term))),
  ]).slice(0, 16);

  const missingKeywords = uniqueTerms([
    ...jdExplicitToolDomainBoost,
    ...primaryMissing,
  ]).filter((term) => {
    const key = cleanupAtsKeyword(term);
    return !ignoredSet.has(key) && !expertiseSet.has(key);
  }).slice(0, 16);

  const backendMatchedFallback = baseMatchedAll
    .filter((term) => !expertiseSet.has(cleanupAtsKeyword(term)) || true)
    .slice(0, 16);

  const backendMissingFallback = primaryMissingAll.filter((term) => {
    const key = cleanupAtsKeyword(term);
    return !ignoredSet.has(key) && !expertiseSet.has(key);
  }).slice(0, 16);

  return {
    matchedKeywords: matchedKeywords.length ? matchedKeywords : backendMatchedFallback,
    missingKeywords: missingKeywords.length ? missingKeywords : backendMissingFallback,
  };
}

function computeDisplayedKeywordCoverage(matchedKeywords: string[], missingKeywords: string[]) {
  const total = matchedKeywords.length + missingKeywords.length;
  if (!total) return 0;
  return matchedKeywords.length / total;
}

function atsRoleDisplayLabel(ats?: AnalyzeAtsPayload, fallbackTargetPosition = "") {
  const explicit = String(fallbackTargetPosition ?? "").trim();
  if (explicit) return explicit;

  const jobRole = String(ats?.detectedJobRole?.roleName ?? "").trim();
  if (jobRole) return jobRole;

  const targetRole = String(ats?.targetRole?.roleName ?? "").trim();
  if (targetRole) return targetRole;

  const resumeRole = String(ats?.detectedResumeRole?.roleName ?? "").trim();
  if (resumeRole) return resumeRole;

  return "General";
}

function computeOverallAtsScore(args: {
  analysis: AnalyzeResponse | null;
  jobText?: string;
  targetPosition?: string;
  bulletQualityAverage: number;
  metricsCount: number;
  strongVerbCount: number;
  sectionCompleteness: number;
  expertiseItems?: string[];
  ignoredMissingKeywords?: string[];
}) : AtsScoreResult {
  const ats = args.analysis?.ats;
  const { matchedKeywords, missingKeywords } = buildDisplayedAtsKeywords({
    ats,
    jobText: args.jobText,
    targetPosition: args.targetPosition,
    expertiseItems: args.expertiseItems,
    ignoredMissingKeywords: args.ignoredMissingKeywords,
  });
  const keywordCoverage = computeDisplayedKeywordCoverage(matchedKeywords, missingKeywords);
  const backendOverall = Number(ats?.overallScore ?? 0);

  const bulletQualityScore = Math.max(0, Math.min(100, args.bulletQualityAverage)) / 100;
  const metricsScore = Math.min(1, args.metricsCount / 8);
  const strongVerbScore = Math.min(1, args.strongVerbCount / 6);

  const liveOverall = Math.max(
  20,
  Math.min(
    99,
    Math.round(
      keywordCoverage * 55 +
        bulletQualityScore * 30 +
        metricsScore * 8 +
        Math.max(0, Math.min(1, args.sectionCompleteness)) * 5 +
        strongVerbScore * 2
    )
  )
);

const overall =
  Number.isFinite(backendOverall) && backendOverall > 0
    ? Math.max(Math.round(backendOverall), liveOverall)
    : liveOverall;

  const label: AtsScoreResult["label"] =
    overall >= 85 ? "Strong" : overall >= 70 ? "Good" : overall >= 55 ? "Fair" : "Weak";

  const roleFocusLabel = atsRoleDisplayLabel(ats, args.targetPosition ?? "");

  const signature = JSON.stringify({
    overall,
    matchedKeywords,
    missingKeywords,
    metricsCount: args.metricsCount,
    strongVerbCount: args.strongVerbCount,
    bulletQualityAverage: args.bulletQualityAverage,
    sectionCompleteness: args.sectionCompleteness,
    roleFocusLabel,
    expertiseItems: uniqueTerms(args.expertiseItems ?? []),
    ignoredMissingKeywords: uniqueTerms(args.ignoredMissingKeywords ?? []),
    jobText: normalizeAtsText(args.jobText ?? ""),
    ats,
  });

  return {
    overall,
    label,
    keywordCoverage,
    matchedKeywords,
    missingKeywords,
    metricsCount: args.metricsCount,
    strongVerbCount: args.strongVerbCount,
    bulletQualityAverage: Math.max(0, Math.min(100, Math.round(args.bulletQualityAverage))),
    sectionCompleteness: Math.max(0, Math.min(1, args.sectionCompleteness)),
    roleFocus: [roleFocusLabel],
    signature,
    notes: uniqueTerms(ats?.notes ?? []),
  };
}


function formatAtsUpdatedAt(ts: number | null) {

  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}


function RewriteDiff({
  original,
  rewritten,
}: {
  original: string;
  rewritten: string;
}) {
  const diff = diffRewriteWords(original, rewritten);

  if (!diff.changed) {
    return <div className="whitespace-pre-wrap text-sm">{rewritten}</div>;
  }

  return (
    <div className="whitespace-pre-wrap text-sm leading-6">
      {diff.prefix ? <span>{diff.prefix} </span> : null}
      <mark className="rounded bg-emerald-100 px-1 py-0.5 text-black">{diff.changed}</mark>
      {diff.suffix ? <span> {diff.suffix}</span> : null}
    </div>
  );
}



function looksLikePersonName(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return false;
  if (cleaned.length > 60) return false;
  if (/[@]|https?:\/\//i.test(cleaned)) return false;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word) => /^[A-Za-z][A-Za-z'’.-]*$/.test(word));
}

function deriveProfileFromResumeText(args: {
  resumeText: string;
  fallbackTitle?: string | null;
  fallbackSummary?: string | null;
  normalizedTitles?: string[];
}) {
  const lines = String(args.resumeText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 18);

  const joined = lines.join(" \n ");
  const emailMatch = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = joined.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const linkedinMatch = joined.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/i);
  const websiteMatch = joined.match(/https?:\/\/(?!www\.)[^\s]+/i);

  let fullName = "";
  let titleLine = "";
  let locationLine = "";

  const nameIndex = lines.findIndex(looksLikePersonName);
  if (nameIndex >= 0) {
    fullName = lines[nameIndex];
  }

  const fallbackTitle = String(args.fallbackTitle || "").trim();
  const normalizedTitle = Array.isArray(args.normalizedTitles) && args.normalizedTitles.length
    ? String(args.normalizedTitles[0] || "").trim()
    : "";

  const titleCandidate = lines.find((line, index) => {
    if (index === nameIndex) return false;
    if (emailMatch && line.includes(emailMatch[0])) return false;
    if (phoneMatch && line.includes(phoneMatch[0])) return false;
    if (linkedinMatch && line.includes(linkedinMatch[0])) return false;
    if (/linkedin|portfolio|website/i.test(line)) return false;
    return line.length <= 90;
  });
  titleLine = fallbackTitle || normalizedTitle || titleCandidate || "";

  const locationCandidate = lines.find((line) => {
    if (fullName && line === fullName) return false;
    if (titleLine && line === titleLine) return false;
    if (emailMatch && line.includes(emailMatch[0])) return false;
    if (phoneMatch && line.includes(phoneMatch[0])) return false;
    return /,/.test(line) && line.length <= 80;
  });
  locationLine = locationCandidate || "";

  return {
    fullName,
    titleLine,
    locationLine,
    email: emailMatch?.[0] || "",
    phone: phoneMatch?.[0] || "",
    linkedin: linkedinMatch?.[0] || "",
    portfolio: websiteMatch?.[0] && websiteMatch[0] !== linkedinMatch?.[0] ? websiteMatch[0] : "",
    summary: String(args.fallbackSummary || "").trim(),
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

/** ---------------- Component ---------------- */

type ResumeMvpProps = {
  mode?: "standard" | "setup";
};

export default function ResumeMvp({ mode = "standard" }: ResumeMvpProps) {
  const isSetupMode = mode === "setup";
  const { status } = useSession();
  const router = useRouter();

  // ✅ Credits UI state
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const refreshCredits = useCallback(async () => {
    if (status !== "authenticated") {
      setCreditsBalance(null);
      return;
    }
    setCreditsLoading(true);
    try {
      const res = await fetch("/api/credits", { method: "GET", cache: "no-store" });
      const payload = await parseApiResponse(res);
      if (!res.ok || typeof payload === "string") {
        setCreditsBalance(null);
        return;
      }
      if (payload?.ok) setCreditsBalance(Number(payload.balance ?? payload.credits ?? 0));
      else setCreditsBalance(null);
    } finally {
      setCreditsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") refreshCredits();
    if (status === "unauthenticated") setCreditsBalance(null);
  }, [status, refreshCredits]);

  const [resumeText, setResumeText] = useState("");
  const [preserveStructuredDuringAnalyze, setPreserveStructuredDuringAnalyze] = useState(false);
  const [jobText, setJobText] = useState("");
  const [targetPosition, setTargetPosition] = useState("");
  const [applyPackBundle, setApplyPackBundle] = useState<ApplyPackBundle | null>(null);
  const [jobTextOverrideMode, setJobTextOverrideMode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeBlobUrl, setResumeBlobUrl] = useState<string>("");
  const [uploadingResume, setUploadingResume] = useState(false);

  const [onlyExperienceBullets, setOnlyExperienceBullets] = useState(true);

  const [sourceCompany, setSourceCompany] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [targetProductsCsv, setTargetProductsCsv] = useState("");
  const [blockedTermsCsv, setBlockedTermsCsv] = useState("");

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [loadingRewriteIndex, setLoadingRewriteIndex] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [showDebugJson, setShowDebugJson] = useState(false);
  const [logNetworkDebug, setLogNetworkDebug] = useState(true);
  const [showRewriteScorecard, setShowRewriteScorecard] = useState(true);
  const [rewriteProofByRow, setRewriteProofByRow] = useState<Record<string, Partial<RewritePlanItem>>>({});

  // ✅ Selecting bullets = apply rewrite (if rewritten exists)
  const [selectedBulletIdx, setSelectedBulletIdx] = useState<Set<number>>(() => new Set());
  const [loadingBatchRewrite, setLoadingBatchRewrite] = useState(false);
  const [includeMetaInResumeDoc, setIncludeMetaInResumeDoc] = useState(true);
  const [showShippedBlock, setShowShippedBlock] = useState(true);
  const [showMetricsBlock, setShowMetricsBlock] = useState(true);
  const [showEducationOnResume, setShowEducationOnResume] = useState(true);
  const [showExpertiseOnResume, setShowExpertiseOnResume] = useState(true);

  const [resumeTemplate, setResumeTemplate] = useState<ResumeTemplateId>("modern");
  const selectedTemplate = resolveLegacyResumeTemplateSelection(resumeTemplate);
  const [profile, setProfile] = useState<ResumeProfile>({
    fullName: "",
    titleLine: "",
    locationLine: "",
    email: "",
    phone: "",
    linkedin: "",
    portfolio: "",
    summary: "",
  });

  const [sections, setSections] = useState<ExperienceSection[]>([
    { id: "default", company: "Experience", title: "", dates: "", location: "" },
  ]);

  const [assignments, setAssignments] = useState<Record<number, BulletAssignment>>({});
  const [showProfilePhoto, setShowProfilePhoto] = useState(true);
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState("");
  const [profilePhotoShape, setProfilePhotoShape] = useState<"circle" | "rounded" | "square">("circle");
  const [profilePhotoSize, setProfilePhotoSize] = useState(112);
  const [resumeHtmlDraft, setResumeHtmlDraft] = useState("");
  const [confirmedAtsScore, setConfirmedAtsScore] = useState<AtsScoreResult | null>(null);
  const [atsScoreUpdatedAt, setAtsScoreUpdatedAt] = useState<number | null>(null);
  const [atsScoreInitialized, setAtsScoreInitialized] = useState(false);
  const [ignoredMissingKeywords, setIgnoredMissingKeywords] = useState<string[]>([]);
  const [showAtsKeywords, setShowAtsKeywords] = useState(false);
  const [showExpertiseEditor, setShowExpertiseEditor] = useState(false);
  const [rewriteSessions, setRewriteSessions] = useState<
    Record<string, { sessionId: string; attemptNumber: number; maxAttempts: number }>
  >({});

  const trackedResumeEntryRef = useRef("");
  const [profileSyncSaving, setProfileSyncSaving] = useState(false);
  const profileSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProfileSyncSignatureRef = useRef("");
  const latestResumeHydratedRef = useRef(false);
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [latestResumeMeta, setLatestResumeMeta] = useState<{ title: string; createdAt: string } | null>(null);
  const [resumeSourceMeta, setResumeSourceMeta] = useState<ResumeSourceMeta | null>(null);
  const setupModeJobText = useMemo(() => {
    const safeTarget = targetPosition.trim() || "the user's target role";
    return [
      `${safeTarget} core responsibilities`,
      "Relevant experience and transferable results",
      "Clear execution, collaboration, and communication",
      "Process improvement, ownership, and measurable impact",
      "ATS-friendly phrasing without inventing experience",
    ].join("\n");
  }, [targetPosition]);

  const scrollToSection = useCallback((sectionId: string) => {
    if (typeof window === "undefined") return;
    const node = document.getElementById(sectionId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const isApplyPackFlow = useMemo(() => {
    const queryBundle = String(searchParams.get("bundle") || "").trim();
    const queryJobId = String(searchParams.get("jobId") || "").trim();
    return queryBundle === "apply-pack" && !!queryJobId;
  }, [searchParams]);

  const applyPackPricingEligible = useMemo(() => {
    if (!isApplyPackFlow || jobTextOverrideMode) return false;
    const activeJobId = String(searchParams.get("jobId") || applyPackBundle?.jobId || "").trim();
    const savedJobText = String(applyPackBundle?.job?.jobContextText || "").trim();
    const currentJobText = String(jobText || "").trim();
    return !!activeJobId && !!savedJobText && currentJobText === savedJobText;
  }, [isApplyPackFlow, jobTextOverrideMode, searchParams, applyPackBundle, jobText]);


  const continueToCoverLetter = useCallback(() => {
    if (typeof window !== "undefined" && applyPackBundle) {
      const nextBundle = {
        ...applyPackBundle,
        nextStep: "cover-letter",
      };
      window.sessionStorage.setItem("gitajob.applyPack", JSON.stringify(nextBundle));
    }

    const params = new URLSearchParams();
    if (applyPackBundle?.jobId) params.set("jobId", applyPackBundle.jobId);
    if (applyPackBundle?.resumeProfileId) params.set("resumeProfileId", applyPackBundle.resumeProfileId);
    params.set("bundle", "apply-pack");
    params.set("next", "cover-letter");

    router.push(`/cover-letter?${params.toString()}`);
  }, [applyPackBundle, router]);

  function createRewriteSessionId() {
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
      }
    } catch {}
    return `rw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getRewriteSessionKey(row: { sectionId: string; bulletIndex: number }) {
    return `${row.sectionId}:${row.bulletIndex}`;
  }

  const canAnalyze = useMemo(() => {
    const hasResume = !!file || resumeText.trim().length > 0 || !!resumeHtmlDraft.trim();
    if (isSetupMode) return hasResume;
    const hasJob = jobText.trim().length > 0;
    const hasTargetPosition = targetPosition.trim().length > 0;
    return hasResume && hasJob && hasTargetPosition;
  }, [file, resumeText, resumeHtmlDraft, jobText, targetPosition, isSetupMode]);

  const applyStructuredSnapshot = useCallback((snapshot: StructuredResumeSnapshot | null | undefined) => {
    const next = sanitizeStructuredResumeSnapshot(snapshot);
    if (!next) return false;

    setTargetPosition(next.targetPosition || "");
    if (isLegacyResumeTemplateId(next.template)) {
      setResumeTemplate(next.template);
    }
    setProfile({
      fullName: next.profile.fullName,
      titleLine: next.profile.titleLine,
      locationLine: next.profile.locationLine,
      email: next.profile.email,
      phone: next.profile.phone,
      linkedin: next.profile.linkedin,
      portfolio: next.profile.portfolio,
      summary: next.profile.summary,
    });

    const nextSections = next.sections.length
      ? next.sections
      : [{ id: "default", company: "Experience", title: "", dates: "", location: "", bullets: [] }];

    setSections(nextSections.map(({ bullets: _bullets, ...section }) => section));
    setEditorBulletsBySection(
      nextSections.reduce<Record<string, string[]>>((acc, section) => {
        acc[section.id] = Array.isArray(section.bullets)
          ? section.bullets.map((bullet) => String(bullet ?? ""))
          : [];
        return acc;
      }, {})
    );
    setEditorEducationItems(next.educationItems);
    setEditorExpertiseItems(next.expertiseItems);
    setEditorMetaGames(next.metaGames);
    setEditorMetaMetrics(next.metaMetrics);
    setShippedLabelMode(next.shippedLabelMode === "apps" ? "Apps" : "Games");
    setIncludeMetaInResumeDoc(next.includeMetaInResumeDoc);
    setShowShippedBlock(next.showShippedBlock);
    setShowMetricsBlock(next.showMetricsBlock);
    setShowEducationOnResume(next.showEducationOnResume);
    setShowExpertiseOnResume(next.showExpertiseOnResume);
    setShowProfilePhoto(next.showProfilePhoto);
    setProfilePhotoDataUrl(next.profilePhotoDataUrl);
    setProfilePhotoShape(next.profilePhotoShape);
    setProfilePhotoSize(next.profilePhotoSize);

    return true;
  }, []);

  const hydrateLatestSavedResume = useCallback(
    async (options?: { force?: boolean; preferredProfileId?: string | null }) => {
      if (status !== "authenticated") return null;
      if (!options?.force && latestResumeHydratedRef.current) return null;

      const preferredProfileId = String(options?.preferredProfileId || "").trim();

      if (preferredProfileId) {
        try {
          const response = await fetch("/api/resume-profiles", { method: "GET", cache: "no-store" });
          const payload = (await parseApiResponse(response)) as { ok?: boolean; items?: Array<Record<string, unknown>> } | string;

          if (response.ok && typeof payload !== "string" && payload?.ok && Array.isArray(payload.items)) {
            const matchedProfile = payload.items.find((item) => String(item?.id || "").trim() === preferredProfileId) as ResumeProfileHydrationItem | undefined;
            const resumeDocuments = Array.isArray((payload as { resumeDocuments?: ResumeDocumentHydrationItem[] }).resumeDocuments)
              ? ((payload as { resumeDocuments?: ResumeDocumentHydrationItem[] }).resumeDocuments as ResumeDocumentHydrationItem[])
              : [];

            const preferredDocument = matchedProfile?.sourceDocument
              || resumeDocuments.find((document) => String(document.id || "").trim() === String(matchedProfile?.sourceDocumentId || "").trim())
              || null;

            const profileText = String(matchedProfile?.rawText || "").trim();
            const documentText = String(preferredDocument?.text || "").trim();
            const htmlText = String(preferredDocument?.html || "").trim()
              ? htmlToPlainText(String(preferredDocument?.html || ""))
              : "";
            const structuredApplied = applyStructuredSnapshot(preferredDocument?.structuredData || null);
            const structuredText = structuredApplied && preferredDocument?.structuredData
              ? structuredSnapshotToResumeText(preferredDocument.structuredData)
              : "";
            const structuredAnalyzeText = structuredApplied && preferredDocument?.structuredData
              ? structuredSnapshotToAnalyzeText(preferredDocument.structuredData)
              : "";
            const preferredText = structuredApplied
              ? structuredAnalyzeText || structuredText || profileText || documentText || htmlText
              : profileText || documentText || htmlText || structuredText;

            if (preferredText || structuredApplied) {
              latestResumeHydratedRef.current = true;
              if (preferredText) {
                setResumeText(preferredText);
              }

              if (!structuredApplied && preferredText) {
                setProfile(deriveProfileFromResumeText({
                  resumeText: preferredText,
                  fallbackTitle: matchedProfile?.title,
                  fallbackSummary: matchedProfile?.summary,
                  normalizedTitles: matchedProfile?.normalizedTitles,
                }));
              } else if (!structuredApplied && matchedProfile?.summary) {
                setProfile((prev) => ({ ...prev, summary: String(matchedProfile.summary || "") }));
              }

              setResumeSourceMeta({
                fileName: preferredDocument?.sourceFileName || String(preferredDocument?.title || matchedProfile?.title || "").trim() || null,
                mimeType: preferredDocument?.sourceMimeType || null,
                extension: preferredDocument?.sourceFileExtension || null,
                sourceKind: preferredDocument?.sourceKind || (preferredDocument ? "saved_resume" : "resume_profile"),
              });
              setLatestResumeMeta({
                title: String(preferredDocument?.title || matchedProfile?.title || "Resume profile").trim() || "Resume profile",
                createdAt: String(preferredDocument?.createdAt || matchedProfile?.updatedAt || "").trim(),
              });

              return {
                text: preferredText,
                structuredText,
                htmlText,
              };
            }
          }
        } catch {
          // fall back to latest saved resume
        }
      }

      try {
        const response = await fetch("/api/resume-latest", { method: "GET", cache: "no-store" });
        const payload = (await parseApiResponse(response)) as LatestResumePayload | string;

        if (!response.ok || typeof payload === "string" || !payload?.ok || !payload.item) return null;

        const latest = payload.item;
        const nextText = String(latest.text || "").trim();
        const structuredApplied = applyStructuredSnapshot(latest.structuredData || null);
        const structuredText = structuredApplied && latest.structuredData
          ? structuredSnapshotToResumeText(latest.structuredData)
          : "";
        const structuredAnalyzeText = structuredApplied && latest.structuredData
          ? structuredSnapshotToAnalyzeText(latest.structuredData)
          : "";
        const htmlText = String(latest.html || "").trim()
          ? htmlToPlainText(String(latest.html || ""))
          : "";
        const preferredText = structuredApplied
          ? structuredAnalyzeText || structuredText || nextText || htmlText
          : nextText || htmlText || structuredText;

        if (!preferredText && !structuredApplied) return null;

        latestResumeHydratedRef.current = true;

        if (preferredText) {
          setResumeText(preferredText);
        }

        if (latest.template && isLegacyResumeTemplateId(latest.template)) {
          setResumeTemplate(latest.template);
        }

        setResumeSourceMeta({
          fileName: latest.sourceFileName || null,
          mimeType: latest.sourceMimeType || null,
          extension: latest.sourceFileExtension || null,
          sourceKind: latest.sourceKind || "saved_resume",
        });
        setLatestResumeMeta({
          title: String(latest.title || latest.sourceFileName || "Latest saved resume"),
          createdAt: latest.createdAt,
        });

        return {
          text: preferredText,
          structuredText,
          htmlText,
        };
      } catch {
        return null;
      }
    },
    [status, applyStructuredSnapshot]
  );

  useEffect(() => {
    if (status !== "authenticated" || latestResumeHydratedRef.current) return;
    if (file || resumeText.trim() || analysis) return;

    let cancelled = false;

    async function hydrateLatestResume() {
      const preferredProfileId = (() => {
        if (typeof window === "undefined") return "";
        const stored = window.localStorage.getItem("activeResumeProfileId") || "";
        return String(searchParams.get("resumeProfileId") || stored).trim();
      })();

      const hydrated = await hydrateLatestSavedResume({ preferredProfileId });
      if (!hydrated || cancelled) return;
    }

    void hydrateLatestResume();

    return () => {
      cancelled = true;
    };
  }, [status, file, resumeText, analysis, hydrateLatestSavedResume, searchParams]);


  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function hydrateApplyPack() {
      const queryJobId = String(searchParams.get("jobId") || "").trim();
      const queryResumeProfileId = String(searchParams.get("resumeProfileId") || "").trim();
      const queryBundle = String(searchParams.get("bundle") || "").trim();
      const queryNext = String(searchParams.get("next") || "").trim();

      let parsed: ApplyPackBundle | null = null;

      try {
        const raw = window.sessionStorage.getItem("gitajob.applyPack");
        if (raw) {
          parsed = JSON.parse(raw) as ApplyPackBundle;
        }
      } catch {
        parsed = null;
      }

      const storedJobId = String(parsed?.jobId || "").trim();
      const storedJobText = String(parsed?.job?.jobContextText || "").trim();
      const storedTargetPosition = String(parsed?.job?.title || "").trim();
      const isJobAwareResumeEntry = !!queryJobId;

      const needsFreshJobContext =
        isJobAwareResumeEntry &&
        (queryJobId !== storedJobId || !storedJobText || queryBundle !== "apply-pack");

      if (needsFreshJobContext) {
        try {
          const response = await fetch(`/api/jobs/${encodeURIComponent(queryJobId)}/context`, {
            method: "GET",
            cache: "no-store",
          });
          const json = (await response.json().catch(() => null)) as
            | { ok?: boolean; item?: ApplyPackBundle["job"]; error?: string }
            | null;

          if (response.ok && json?.ok && json.item) {
            const fetchedJob = json.item;
            const nextBundle: ApplyPackBundle = {
              bundle: "apply-pack",
              jobId: queryJobId,
              resumeProfileId:
                queryResumeProfileId || String(parsed?.resumeProfileId || "").trim() || undefined,
              createdAt: new Date().toISOString(),
              nextStep: queryNext || parsed?.nextStep || "resume",
              job: fetchedJob,
            };

            if (queryBundle === "apply-pack") {
              window.sessionStorage.setItem("gitajob.applyPack", JSON.stringify(nextBundle));
            }

            if (cancelled) return;

            setApplyPackBundle(queryBundle === "apply-pack" ? nextBundle : null);
            setJobText((current) => (current.trim() ? current : String(fetchedJob.jobContextText || "").trim()));
            if (String(fetchedJob.title || "").trim()) setTargetPosition(String(fetchedJob.title || "").trim());
            setJobTextOverrideMode(false);
            return;
          }
        } catch {
          // fall through to stored bundle
        }
      }

      if (!parsed || parsed.bundle !== "apply-pack" || cancelled) return;

      const isActiveApplyPackResumeEntry = queryBundle === "apply-pack" && !!queryJobId;
      if (!isActiveApplyPackResumeEntry) {
        setApplyPackBundle(null);
        setJobTextOverrideMode(false);
        return;
      }

      setApplyPackBundle(parsed);

      const sameRequestedJob = queryJobId === storedJobId;

      if (sameRequestedJob && storedJobText) {
        setJobText((current) => (current.trim() ? current : storedJobText));
      }

      if (sameRequestedJob && storedTargetPosition) {
        setTargetPosition(storedTargetPosition);
      }
    }

    hydrateApplyPack();

    return () => {
      cancelled = true;
    };
  }, [searchParamsKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const queryBundle = String(searchParams.get("bundle") || "").trim();
    const queryJobId = String(searchParams.get("jobId") || "").trim();
    const isDirectResumeEntry = queryBundle !== "apply-pack" || !queryJobId;

    if (!isDirectResumeEntry) return;

    setApplyPackBundle(null);
    setJobTextOverrideMode(false);
  }, [searchParamsKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const queryJobId = searchParams.get("jobId") || "";
    const queryResumeProfileId = searchParams.get("resumeProfileId") || "";
    const bundle = searchParams.get("bundle") || "";
    const next = searchParams.get("next") || "";

    const storedJobId = String(applyPackBundle?.jobId || "").trim();
    const storedResumeProfileId = String(applyPackBundle?.resumeProfileId || "").trim();
    const activeJobId = queryJobId || storedJobId;
    const activeResumeProfileId = queryResumeProfileId || storedResumeProfileId;
    const activeTitle = String(applyPackBundle?.job?.title || targetPosition || "").trim();
    const activeCompany = String(applyPackBundle?.job?.company || "").trim();

    if (!activeJobId) return;

    const entryKey = JSON.stringify({
      activeJobId,
      activeResumeProfileId,
      bundle,
      next,
      activeTitle,
      activeCompany,
    });

    if (trackedResumeEntryRef.current === entryKey) return;
    trackedResumeEntryRef.current = entryKey;

    trackJobEvent({
      event: "job_context_resume_entry",
      jobId: activeJobId,
      resumeProfileId: activeResumeProfileId || undefined,
      company: activeCompany || undefined,
      jobTitle: activeTitle || undefined,
      route: "/resume",
      mode: bundle === "apply-pack" ? "apply_pack" : "resume",
      meta: {
        next: next || undefined,
        hasBundlePayload: !!applyPackBundle,
      },
    });
  }, [applyPackBundle, targetPosition, searchParamsKey]);

  function syncJobTextFromApplyPack() {
    const savedJobText = String(applyPackBundle?.job?.jobContextText || "").trim();
    const savedTargetPosition = String(applyPackBundle?.job?.title || "").trim();

    if (savedJobText) setJobText(savedJobText);
    if (savedTargetPosition) setTargetPosition(savedTargetPosition);
    setJobTextOverrideMode(false);
  }

  const resetDerivedState = useCallback(() => {
    setAnalysis(null);
    setSelectedBulletIdx(new Set());
    setAssignments({});
    setRewriteSessions({});
    setRewriteProofByRow({});
    setConfirmedAtsScore(null);
    setAtsScoreUpdatedAt(null);
    setAtsScoreInitialized(false);
    setIgnoredMissingKeywords([]);
    setError(null);
    setLoadingRewriteIndex(null);
    setLoadingBatchRewrite(false);
    setSections([{ id: "default", company: "Experience", title: "", dates: "", location: "" }]);
    setEditorBulletsBySection({});
    setEditorEducationItems([]);
    setEditorExpertiseItems([]);
    setEditorMetaGames([]);
    setEditorMetaMetrics([]);
    setResumeBlobUrl("");
    setResumeHtmlDraft("");
    setResumeText("");
    setPreserveStructuredDuringAnalyze(false);
    setLatestResumeMeta(null);
    setResumeSourceMeta(null);
    setProfile({
      fullName: "",
      titleLine: "",
      locationLine: "",
      email: "",
      phone: "",
      linkedin: "",
      portfolio: "",
      summary: "",
    });
    setProfilePhotoDataUrl("");
    setConfirmedAtsScore(null);
    setAtsScoreUpdatedAt(null);
    setAtsScoreInitialized(false);
  }, []);

  const ensureResumeUploadedToBlob = useCallback(
    async (f: File) => {
      if (resumeBlobUrl) return resumeBlobUrl;

      setUploadingResume(true);
      try {
        const safeName = f.name.replace(/\s+/g, "-");
        const pathname = `resume/${Date.now()}-${safeName}`;

        const blob = (await upload(pathname, f, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
        })) as PutBlobResult;

        setResumeBlobUrl(blob.url);
        return blob.url;
      } finally {
        setUploadingResume(false);
      }
    },
    [resumeBlobUrl]
  );

  const clearFile = useCallback(() => {
    latestResumeHydratedRef.current = false;
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetDerivedState();
  }, [resetDerivedState]);

  const handleProfilePhotoUpload = useCallback(async (incoming: File | null) => {
    if (!incoming) return;

    if (!incoming.type.startsWith("image/")) {
      setError("Profile photo must be an image file.");
      return;
    }

    if (incoming.size > 2 * 1024 * 1024) {
      setError("Profile photo is too large. Keep it under 2MB.");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(incoming);
      setProfilePhotoDataUrl(dataUrl);
      setShowProfilePhoto(true);
      setError(null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Could not load profile photo."));
    }
  }, []);

  const clearProfilePhoto = useCallback(() => {
    setProfilePhotoDataUrl("");
  }, []);

  const toggleSelected = useCallback((i: number) => {
    setSelectedBulletIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const selectAll = useCallback((count: number) => {
    setSelectedBulletIdx(new Set(Array.from({ length: count }, (_, i) => i)));
  }, []);

  const selectNone = useCallback(() => {
    setSelectedBulletIdx(new Set());
  }, []);

  function ensureAssignmentsForPlan(planLen: number, fallbackSectionId: string) {
    setAssignments((prev) => {
      const next = { ...prev };
      for (let i = 0; i < planLen; i++) {
        if (!next[i]) next[i] = { sectionId: fallbackSectionId };
      }
      return next;
    });
  }

  function buildAssignmentsFromServerMapping(args: {
    rewritePlan: RewritePlanItem[];
    bulletJobIds?: string[];
    knownSectionIds: Set<string>;
    fallbackSectionId: string;
  }) {
    const { rewritePlan, bulletJobIds, knownSectionIds, fallbackSectionId } = args;

    const next: Record<number, BulletAssignment> = {};
    for (let i = 0; i < rewritePlan.length; i++) {
      const jobIdFromPlan = String(rewritePlan[i]?.jobId ?? "").trim();
      const jobIdFromArray = String(bulletJobIds?.[i] ?? "").trim();
      const candidate = jobIdFromPlan || jobIdFromArray;

      next[i] = {
        sectionId: candidate && knownSectionIds.has(candidate) ? candidate : fallbackSectionId,
      };
    }
    return next;
  }

  async function handleAnalyze() {
    if (!isSetupMode && !targetPosition.trim()) {
      setError("Target position is required for ATS analysis.");
      return;
    }

    setLoadingAnalyze(true);
    setError(null);
    setAnalysis(null);
    setSelectedBulletIdx(new Set());
    setAssignments({});

    try {
      let res: Response;

      const hasCanonicalStructuredResume = hasStructuredResumeBullets(structuredResumeSnapshot);
      const shouldPreserveStructuredSource = hasCanonicalStructuredResume;
      setPreserveStructuredDuringAnalyze(shouldPreserveStructuredSource);

      let structuredSnapshotText = shouldPreserveStructuredSource
        ? structuredSnapshotToResumeText(structuredResumeSnapshot)
        : "";
      let htmlDraftPlain = liveResumeHtml.trim() ? htmlToPlainText(liveResumeHtml) : "";
      const savedResumeText = resumeText.trim();
      let resumeInput = shouldPreserveStructuredSource
        ? structuredSnapshotText || savedResumeText || htmlDraftPlain
        : file
          ? savedResumeText
          : savedResumeText || structuredSnapshotText || htmlDraftPlain;

      if (shouldPreserveStructuredSource && structuredSnapshotText) {
        resumeInput = structuredSnapshotText || savedResumeText;
      }

      if (!file && !String(resumeInput).trim()) {
        const hydrated = await hydrateLatestSavedResume({ force: true });
        if (hydrated) {
          structuredSnapshotText = hydrated.structuredText || structuredSnapshotText;
          htmlDraftPlain = hydrated.htmlText || htmlDraftPlain;
          resumeInput = hydrated.text || hydrated.structuredText || hydrated.htmlText || resumeInput;
        }
      }

      const resumePlain = looksLikeHtmlInput(resumeInput) ? htmlToPlainText(resumeInput) : resumeInput;
      const resumeTextForApi = resumePlain ? normalizeResumeTextForParsing(resumePlain) : "";

      if (!file && !resumeTextForApi.trim()) {
        throw new Error("No saved resume was loaded. Open your saved FTUE resume first or upload a file.");
      }

      const effectiveTargetPosition = isSetupMode ? "Professional Resume" : targetPosition.trim();

      const analyticsParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const analyticsJobId =
        analyticsParams?.get("jobId") || String(applyPackBundle?.jobId || "").trim();
      const analyticsResumeProfileId =
        analyticsParams?.get("resumeProfileId") || String(applyPackBundle?.resumeProfileId || "").trim();
      const analyticsBundle =
        analyticsParams?.get("bundle") || String(applyPackBundle?.bundle || "").trim();
      const analyticsMode = analyticsBundle === "apply-pack" && applyPackPricingEligible ? "apply_pack" : "resume";
      const effectiveJobText = isSetupMode ? setupModeJobText : jobText;

      if (analyticsJobId) {
        trackJobEvent({
          event: analyticsMode === "apply_pack" ? "job_apply_pack_started" : "job_resume_analysis_started",
          jobId: analyticsJobId,
          resumeProfileId: analyticsResumeProfileId || undefined,
          company: String(applyPackBundle?.job?.company || "").trim() || undefined,
          jobTitle: String(applyPackBundle?.job?.title || effectiveTargetPosition || "").trim() || undefined,
          route: "/resume",
          mode: analyticsMode,
          meta: {
            hasResumeFile: !!file,
            hasResumeText: !!resumeText.trim(),
            hasJobText: !!effectiveJobText.trim(),
            hasTargetPosition: !!effectiveTargetPosition.trim(),
          },
        });
      }

      const shouldAnalyzeFromBlob = !!file && !shouldPreserveStructuredSource;

      if (shouldAnalyzeFromBlob) {
        const url = await ensureResumeUploadedToBlob(file!);

        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeBlobUrl: url,
            jobText: effectiveJobText,
            targetPosition: effectiveTargetPosition,
            isFirstTimeSetup: isSetupMode,
            onlyExperienceBullets,
            resumeText: "",
            jobId: analyticsJobId || undefined,
            resumeProfileId: analyticsResumeProfileId || undefined,
            sourceSlug: String(applyPackBundle?.sourceSlug || "").trim() || undefined,
            company: String(applyPackBundle?.job?.company || "").trim() || undefined,
            jobTitle: String(applyPackBundle?.job?.title || effectiveTargetPosition || "").trim() || undefined,
            mode: analyticsMode,
            bundleSessionId: analyticsMode === "apply_pack" ? String(applyPackBundle?.bundleSessionId || "").trim() || undefined : undefined,
          }),
        });
      } else {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeText: resumeTextForApi || resumePlain,
            jobText: effectiveJobText,
            targetPosition: effectiveTargetPosition,
            onlyExperienceBullets,
            isFirstTimeSetup: isSetupMode,
            jobId: analyticsJobId || undefined,
            resumeProfileId: analyticsResumeProfileId || undefined,
            sourceSlug: String(applyPackBundle?.sourceSlug || "").trim() || undefined,
            company: String(applyPackBundle?.job?.company || "").trim() || undefined,
            jobTitle: String(applyPackBundle?.job?.title || effectiveTargetPosition || "").trim() || undefined,
            mode: analyticsMode,
            bundleSessionId: analyticsMode === "apply_pack" ? String(applyPackBundle?.bundleSessionId || "").trim() || undefined : undefined,
          }),
        });
      }

      const payload = await parseApiResponse(res);

      if (logNetworkDebug) {
        console.log("[analyze] status:", res.status);
        console.log("[analyze] onlyExperienceBullets:", onlyExperienceBullets);
        if (resumeInput) console.log("[analyze] pasted HTML detected:", looksLikeHtmlInput(resumeInput));
        console.log("[analyze] payload:", payload);
      }

      if (isHtmlDoc(payload)) {
        throw new Error(`Analyze returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`);
      }

      if (!res.ok) {
        const apiError = typeof payload === "object" && payload !== null ? payload as { error?: string; balance?: number } : null;
        const errMsg = typeof payload === "string" ? payload : apiError?.error || "Analyze failed";
        if (apiError?.error === "OUT_OF_CREDITS") {
          const bal = apiError?.balance;
          throw new Error(`Out of credits. Balance: ${bal ?? 0}.`);
        }
        throw new Error(errMsg);
      }

      if (typeof payload === "string") {
        throw new Error("Analyze returned unexpected non-JSON response.");
      }

      const data = payload as AnalyzeResponse;
      const normalizedAnalysis = shouldPreserveStructuredSource
        ? {
            ...data,
            metaBlocks: {
              gamesShipped: [],
              metrics: [],
            },
            highlights: {
              gamesShipped: [],
              keyMetrics: [],
            },
          }
        : data;
      setAnalysis(normalizedAnalysis);
      if (shouldPreserveStructuredSource) {
        const canonicalAnalyzeText = structuredSnapshotToAnalyzeText(structuredResumeSnapshot).trim();
        if (canonicalAnalyzeText) {
          setResumeText(canonicalAnalyzeText);
        }
      } else if (resumeTextForApi.trim()) {
        setResumeText(resumeTextForApi);
      }

      if (typeof window !== "undefined") {
        const autoProfileId = String(data?.autoResumeProfile?.id || "").trim();
        if (autoProfileId) {
          window.localStorage.setItem("activeResumeProfileId", autoProfileId);
        }
      }

      const rewritePlanLocal = Array.isArray(data?.rewritePlan) ? data.rewritePlan! : [];
      const planLen = rewritePlanLocal.length;

      if (shouldPreserveStructuredSource) {
        setAssignments({});
      } else {
        const jobs = Array.isArray(data?.experienceJobs) ? data.experienceJobs! : [];
        const nextSections: ExperienceSection[] =
          jobs.length > 0
            ? jobs.map((j) => ({
                id: String(j.id),
                company: String(j.company || "Company"),
                title: String(j.title || "Role"),
                // ✅ IMPORTANT: no placeholder “Dates”
                dates: String(j.dates || ""),
                location: j.location ? String(j.location) : "",
              }))
            : [{ id: "default", company: "Experience", title: "", dates: "", location: "" }];

        setSections(nextSections);

        const knownSectionIds = new Set(nextSections.map((s) => s.id));
        const fallbackId = nextSections[0]?.id || "default";

        const analyzedEditorBullets: Record<string, string[]> = {};
        const apiBulletJobIds = Array.isArray(data?.bulletJobIds) ? data.bulletJobIds : [];
        const apiBullets = Array.isArray(data?.bullets) ? data.bullets : [];

        apiBullets.forEach((bullet, index) => {
          const cleanBullet = String(bullet ?? "").trim();
          if (!cleanBullet) return;
          const sectionId = String(apiBulletJobIds[index] || fallbackId).trim() || fallbackId;
          if (!analyzedEditorBullets[sectionId]) analyzedEditorBullets[sectionId] = [];
          analyzedEditorBullets[sectionId].push(cleanBullet);
        });

        if (!Object.keys(analyzedEditorBullets).length && jobs.length) {
          jobs.forEach((job) => {
            const sectionId = String(job?.id || fallbackId).trim() || fallbackId;
            const sectionBullets = Array.isArray(job?.bullets)
              ? job.bullets.map((bullet) => String(bullet ?? "").trim()).filter(Boolean)
              : [];
            if (sectionBullets.length) {
              analyzedEditorBullets[sectionId] = sectionBullets;
            }
          });
        }

        setEditorBulletsBySection(analyzedEditorBullets);

        if (planLen) {
          const bulletJobIds = Array.isArray(data?.bulletJobIds) ? data.bulletJobIds : undefined;
          const auto = buildAssignmentsFromServerMapping({
            rewritePlan: rewritePlanLocal,
            bulletJobIds,
            knownSectionIds,
            fallbackSectionId: fallbackId,
          });

          setAssignments(auto);
          ensureAssignmentsForPlan(planLen, fallbackId);
        } else {
          setAssignments({});
        }
      }

      refreshCredits();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Analyze failed"));
      refreshCredits();
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function postRewriteWithFallback(body: Record<string, unknown>, options?: { timeoutMs?: number }) {
    const safeBody = {
      ...buildRewriteBulletPayload(body),
      rewriteSessionId: body?.rewriteSessionId,
      attemptNumber: body?.attemptNumber,
      maxAttempts: body?.maxAttempts,
    };

    const json = JSON.stringify(safeBody);
    const bytes = new TextEncoder().encode(json).length;

    if (logNetworkDebug) {
      console.log("[rewrite] request bytes:", bytes);
      console.log("[rewrite] jobText chars:", String(safeBody.jobText ?? "").length);
      console.log(
        "[rewrite] keywords count:",
        Array.isArray(safeBody.suggestedKeywords) ? safeBody.suggestedKeywords.length : 0
      );
    }

    if (bytes > 150_000) {
      const jt = String(safeBody.jobText ?? "");
      throw new Error(
        `Request too large (${bytes.toLocaleString()} bytes). jobText is ${jt.length.toLocaleString()} chars. Trim the job posting before rewriting.`
      );
    }

    const timeoutMs = Math.max(1_000, Number(options?.timeoutMs ?? REWRITE_FIRST_ATTEMPT_TIMEOUT_MS));
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch("/api/rewrite-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        signal: controller.signal,
      });
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === "AbortError") {
        throw new Error(`Rewrite request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      }
      throw err;
    } finally {
      window.clearTimeout(timeoutId);
    }

    const payload = await parseApiResponse(res);

    if (logNetworkDebug) {
      console.log("[rewrite] status:", res.status);
      console.log("[rewrite] payload:", payload);
    }

    return { res, payload };
  }

  async function handleRewriteBullet(index: number, options?: { safer?: boolean }): Promise<boolean> {
    if (!analysis) return false;

    const rowsSnapshot = liveBulletRowsRef.current.length ? liveBulletRowsRef.current : liveBulletRows;
    const row = rowsSnapshot[index];
    if (!row) return false;

    const sessionKey = getRewriteSessionKey(row);
    const existingSession = rewriteSessions[sessionKey];
    const activeSession = existingSession ?? {
      sessionId: createRewriteSessionId(),
      attemptNumber: 0,
      maxAttempts: 5,
    };

    if (activeSession.attemptNumber >= activeSession.maxAttempts) {
      setError(`Rewrite attempt limit reached for this bullet (${activeSession.maxAttempts}). Edit the bullet to start a new rewrite session.`);
      return false;
    }

    const originalBullet = String(row.originalText ?? row.text ?? "").trim();
    const suggestedKeywordsRaw = row.suggestedKeywords;
    const suggestedKeywords = normalizeSuggestedKeywordsForBullet(originalBullet, suggestedKeywordsRaw);

    if (!originalBullet) {
      setError("Missing original bullet for rewrite. Re-run Analyze or confirm bullets extracted.");
      return false;
    }

    if (isTrainingLikeBullet(originalBullet)) {
      const rewrittenTraining = defaultTrainingRewrite(originalBullet);
      if (!rewrittenTraining) {
        setError("Training bullet detected, but could not generate a safe rewrite.");
        return false;
      }

      setAnalysis((prev) => {
        if (!prev) return prev;

        const prevBullets = Array.isArray(prev.bullets) ? prev.bullets : [];
        const prevPlan = Array.isArray(prev.rewritePlan) ? prev.rewritePlan : [];

        const nextPlan =
          prevPlan.length > 0
            ? [...prevPlan]
            : prevBullets.slice(0, 200).map((b) => ({
                originalBullet: bulletToText(b),
                suggestedKeywords: [],
                rewrittenBullet: "",
                needsMoreInfo: false,
                notes: [],
                keywordHits: [],
                blockedKeywords: [],
                truthRisk: undefined,
                verbStrength: undefined,
                jobId: undefined,
              }));

        if (!nextPlan[index]) {
          nextPlan[index] = {
            originalBullet,
            suggestedKeywords,
            rewrittenBullet: "",
            needsMoreInfo: false,
            notes: [],
            keywordHits: [],
            blockedKeywords: [],
            verbStrength: undefined,
            jobId: undefined,
          };
        }

        nextPlan[index] = {
          ...nextPlan[index],
          rewrittenBullet: rewrittenTraining,
          needsMoreInfo: false,
          notes: ["Training/education bullet detected; rewrite kept faithful (no invented duties)."],
          keywordHits: [],
          blockedKeywords: [],
          truthRisk: {
            score: 0,
            level: "safe",
            reasons: ["Training bullet rewrite kept close to the original claim."],
            addedTerms: [],
            riskyPhrases: [],
            unsupportedClaims: [],
          },
          suggestedKeywords,
        };

        return { ...prev, rewritePlan: nextPlan };
      });

      setEditorBulletsBySection((prev: Record<string, string[]>) => {
        const next = [...(prev[row.sectionId] || [])];
        next[row.bulletIndex] = rewrittenTraining;
        return { ...prev, [row.sectionId]: next };
      });

      setRewriteProofByRow((prev) => ({
        ...prev,
        [row.key]: {
          originalBullet,
          suggestedKeywords,
          rewrittenBullet: rewrittenTraining,
          needsMoreInfo: false,
          notes: ["Training/education bullet detected; rewrite kept faithful (no invented duties)."],
          keywordHits: [],
          blockedKeywords: [],
          truthRisk: {
            score: 0,
            level: "safe",
            reasons: ["Training bullet rewrite kept close to the original claim."],
            addedTerms: [],
            riskyPhrases: [],
            unsupportedClaims: [],
          },
          jobId: row.sectionId,
        },
      }));

      refreshCredits();
      return true;
    }

    setLoadingRewriteIndex(index);
    setError(null);

    try {
      const rewritePlanLocal = Array.isArray(analysis.rewritePlan) ? analysis.rewritePlan : [];
      const targetProducts = csvToArray(targetProductsCsv);
      const blockedTerms = csvToArray(blockedTermsCsv);
      const jobTextCapped = String(jobText ?? "").slice(0, 6000);

      const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

      const extractOpenerVerb = (bullet: string) => {
        const s = String(bullet ?? "")
          .trim()
          .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
          .replace(/[“”"]/g, '"')
          .trim();

        const words = s.split(/\s+/).filter(Boolean);
        for (const w of words.slice(0, 6)) {
          const clean = w.replace(/[^\w-]/g, "").toLowerCase();
          if (!clean) continue;
          if (["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with"].includes(clean))
            continue;
          return clean;
        }
        return "";
      };

      const buildPhrasesFromText = (text: string) => {
        const stop = new Set([
          "the",
          "a",
          "an",
          "and",
          "or",
          "to",
          "of",
          "in",
          "on",
          "for",
          "with",
          "by",
          "as",
          "at",
          "from",
          "into",
          "is",
          "was",
          "were",
          "be",
          "been",
          "being",
          "that",
          "this",
          "these",
          "those",
          "it",
          "its",
          "their",
        ]);

        const tokens = norm(text)
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter(Boolean)
          .filter((t) => t.length > 2 && !stop.has(t));

        const phrases: string[] = [];
        for (let i = 0; i < tokens.length - 1; i++) phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
        for (let i = 0; i < tokens.length - 2; i++) phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
        return phrases;
      };

      const buildTailPhrasesFromText = (text: string) => {
        const tokens = norm(text)
          .replace(/[^a-z0-9\s-]/g, " ")
          .split(/\s+/)
          .filter(Boolean);

        const tails: string[] = [];
        if (tokens.length >= 2) tails.push(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
        if (tokens.length >= 3) tails.push(`${tokens[tokens.length - 3]} ${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
        if (tokens.length >= 4) tails.push(`${tokens[tokens.length - 4]} ${tokens[tokens.length - 3]} ${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);

        return tails;
      };

      const otherTexts: string[] = rowsSnapshot
        .filter((_, rowIndex) => rowIndex !== index)
        .map((liveRow) => {
          const rewritten = String(liveRow.rewrittenBullet ?? "").trim();
          return rewritten || String(liveRow.text ?? "").trim();
        })
        .filter(Boolean);

      const usedOpeners = Array.from(new Set(otherTexts.map(extractOpenerVerb).map(norm).filter(Boolean)));

      const phraseCounts = new Map<string, number>();
      for (const t of otherTexts) {
        for (const p of buildPhrasesFromText(t)) {
          phraseCounts.set(p, (phraseCounts.get(p) ?? 0) + 1);
        }
      }

      const usedPhrases = Array.from(phraseCounts.entries())
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([phrase]) => phrase);

      const tailCounts = new Map<string, number>();
      for (const t of otherTexts) {
        for (const tail of buildTailPhrasesFromText(t)) {
          tailCounts.set(tail, (tailCounts.get(tail) ?? 0) + 1);
        }
      }

      const usedTailPhrases = Array.from(tailCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([tail]) => tail);

      const backendMatchedTerms = uniqueTerms(analysis?.ats?.matchedTerms ?? []);
      const backendMissingTerms = combineBackendMissingTerms(analysis?.ats);
      const roleKeywordPool = uniqueTerms([
        ...backendMatchedTerms,
        ...backendMissingTerms,
      ]).map((term, index) => ({
        term: cleanupAtsKeyword(term),
        weight: Math.max(1, 10 - Math.min(index, 8)),
      }));
      const normalizedOriginalBullet = normalizeAtsText(originalBullet);
      const atsSnapshot = liveAtsScoreRef.current ?? liveAtsScore;
      const prioritizedMissingKeywords = atsSnapshot.missingKeywords
        .filter((term) => !ignoredMissingKeywords.some((ignored) => cleanupAtsKeyword(ignored) === cleanupAtsKeyword(term)))
        .filter((term) => !hasWholeWord(normalizedOriginalBullet, term))
        .sort((a, b) => {
          const aWeight = roleKeywordPool.find((entry) => entry.term === cleanupAtsKeyword(a))?.weight ?? 0;
          const bWeight = roleKeywordPool.find((entry) => entry.term === cleanupAtsKeyword(b))?.weight ?? 0;
          return bWeight - aWeight || a.localeCompare(b);
        })
        .slice(0, 4);

      const reinforcingMatchedKeywords = atsSnapshot.matchedKeywords
        .filter((term) => hasWholeWord(normalizedOriginalBullet, term))
        .slice(0, 3);

      const guaranteedAtsKeywords = Array.from(new Set([
        ...pickGuaranteedAtsKeywordsForBullet({
          originalBullet,
          suggestedKeywords,
          jobText: jobTextCapped,
          maxGuaranteed: 2,
        }),
        ...prioritizedMissingKeywords,
        ...reinforcingMatchedKeywords,
      ])).slice(0, 5);

      const enrichedSuggestedKeywords = Array.from(new Set([
        ...suggestedKeywords,
        ...prioritizedMissingKeywords,
        ...reinforcingMatchedKeywords,
      ])).slice(0, 10);

      const resumeSkills = editorExpertiseItems
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .slice(0, 24);

      const currentSection = sections.find((s) => s.id === row.sectionId);

      const sectionBullets = (editorBulletsBySection[row.sectionId] || [])
        .map((x) => String(x ?? "").trim())
        .filter(Boolean);

      const sectionSkillCandidates = [
        currentSection?.title || "",
        currentSection?.company || "",
        ...(sectionBullets.slice(0, 12)),
        ...reinforcingMatchedKeywords,
      ];

      const sectionSkills = Array.from(
        new Set(
          sectionSkillCandidates
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
        )
      ).slice(0, 24);

      const allowedTerms = Array.from(
        new Set(
          [
            ...reinforcingMatchedKeywords,
            ...guaranteedAtsKeywords.filter((term) => hasWholeWord(normalizedOriginalBullet, term)),
            ...suggestedKeywords.filter((term) => hasWholeWord(normalizedOriginalBullet, term)),
          ]
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
        )
      ).slice(0, 24);

      const baseRequestBody = {
        originalBullet,
        suggestedKeywords: enrichedSuggestedKeywords,
        jobText: jobTextCapped,

        constraints: [
          "Do not add responsibilities not present in the original bullet.",
          "Do not add 'daily testing' unless the original bullet explicitly mentions it.",
          "Preserve the original meaning and scope; only improve clarity and impact.",
          "Avoid generic filler; keep it concise and specific.",
          "Do not start with the same opener verb used in other bullets; avoid repeating lead verbs.",
          ...(guaranteedAtsKeywords.length
            ? [
                `When it fits naturally and truthfully, include these ATS keywords where appropriate: ${guaranteedAtsKeywords.join(", ")}.`,
                "Prioritize missing ATS keywords first, then reinforce one already-matched keyword only when it improves clarity.",
                "Do not force every keyword into the bullet. Only include keywords that match the original experience.",
              ]
            : []),
          ...(targetPosition.trim()
            ? [`Write this as if it is being optimized for the target position: ${targetPosition.trim()}.`]
  : []),
        ],
        mustPreserveMeaning: true,

        avoidPhrases: ["collaborated", "developed", "executed", "created", "documented", "completed"],
        preferVerbVariety: true,

        usedOpeners,
        usedPhrases,
        usedTailPhrases,

        sourceCompany: sourceCompany.trim(),
        targetCompany: targetCompany.trim(),
        targetProducts,
        blockedTerms,

        role: targetPosition.trim() || (analysis?.ats?.targetRole?.roleName ?? analysis?.ats?.detectedJobRole?.roleName ?? analysis?.ats?.detectedResumeRole?.roleName ?? "General"),
        targetPosition: targetPosition.trim(),
        priorityMissingKeywords: prioritizedMissingKeywords,
        matchedKeywords: reinforcingMatchedKeywords,
        ignoredMissingKeywords,
        tone: "",

        resumeSkills,
        sectionSkills,
        allowedTerms,
        rewriteSessionId: activeSession.sessionId,
        attemptNumber: activeSession.attemptNumber + 1,
        maxAttempts: activeSession.maxAttempts,
      };

      async function runRewriteAttempt(extraConstraints: string[] = [], requestAttemptNumber?: number, timeoutMs = REWRITE_FIRST_ATTEMPT_TIMEOUT_MS) {
        const nextAttemptNumber =
          typeof requestAttemptNumber === "number"
            ? requestAttemptNumber
            : activeSession.attemptNumber + 1;

        const requestBody = {
          ...baseRequestBody,
          attemptNumber: nextAttemptNumber,
          constraints: [
            ...baseRequestBody.constraints,
            ...(options?.safer
              ? [
                  "Safer rewrite mode: prefer conservative wording over impressive wording.",
                  "Do not increase ownership, leadership, scale, or business impact beyond what the original bullet explicitly supports.",
                  "Do not add revenue, engagement, retention, conversion, or growth claims unless they are explicitly stated in the original bullet.",
                  "If uncertain, choose the less aggressive phrasing.",
                ]
              : []),
            ...extraConstraints,
          ],
        };

        const { res, payload } = await postRewriteWithFallback(requestBody, { timeoutMs });

        if (isHtmlDoc(payload)) {
          throw new Error(`Rewrite returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`);
        }

        if (!res.ok) {
          if (typeof payload !== "string" && payload?.error === "ATTEMPT_LIMIT_REACHED") {
            setRewriteSessions((prev) => ({
              ...prev,
              [sessionKey]: {
                sessionId: activeSession.sessionId,
                attemptNumber: Number(payload?.maxAttempts ?? activeSession.maxAttempts),
                maxAttempts: Number(payload?.maxAttempts ?? activeSession.maxAttempts),
              },
            }));
            throw new Error(`Rewrite attempt limit reached for this bullet (${payload?.maxAttempts ?? activeSession.maxAttempts}). Edit the bullet to start a new rewrite session.`);
          }

          const errMsg = typeof payload === "string" ? payload : payload?.error || "Rewrite failed";
          if (typeof payload !== "string" && payload?.error === "OUT_OF_CREDITS") {
            const bal = payload?.balance;
            throw new Error(`Out of credits. Balance: ${bal ?? 0}.`);
          }
          throw new Error(errMsg);
        }

        if (typeof payload === "string") {
          throw new Error("Rewrite returned unexpected non-JSON response.");
        }

        const returnedSessionId = String(payload?.rewriteSessionId ?? activeSession.sessionId);
        const returnedAttemptNumber = Number(payload?.attemptNumber ?? nextAttemptNumber);
        const returnedMaxAttempts = Number(payload?.maxAttempts ?? activeSession.maxAttempts);

        setRewriteSessions((prev) => ({
          ...prev,
          [sessionKey]: {
            sessionId: returnedSessionId,
            attemptNumber: returnedAttemptNumber,
            maxAttempts: returnedMaxAttempts,
          },
        }));

        return payload;
      }

      async function runRewriteAttemptWithTimeoutRetry(extraConstraints: string[] = [], requestAttemptNumber?: number) {
        const firstAttemptNumber =
          typeof requestAttemptNumber === "number"
            ? requestAttemptNumber
            : activeSession.attemptNumber + 1;

        try {
          return await runRewriteAttempt(extraConstraints, firstAttemptNumber, REWRITE_FIRST_ATTEMPT_TIMEOUT_MS);
        } catch (e: unknown) {
          const message = getErrorMessage(e, "Rewrite failed");
          if (!/timed out|abort/i.test(message)) throw e;

          return await runRewriteAttempt(
            [
              ...extraConstraints,
              "The previous rewrite request timed out. Return one concise, faithful rewrite without extra explanation.",
            ],
            firstAttemptNumber + 1,
            REWRITE_RETRY_TIMEOUT_MS
          );
        }
      }

      let payload = await runRewriteAttemptWithTimeoutRetry();

      let rewrittenBullet = String(payload?.rewrittenBullet ?? "").trim();
      let needsMoreInfo = !!payload?.needsMoreInfo;
      let notes = Array.isArray(payload?.notes) ? payload.notes : [];
      let keywordHits = Array.isArray(payload?.keywordHits) ? payload.keywordHits : [];
      let blockedKeywords = Array.isArray(payload?.blockedKeywords) ? payload.blockedKeywords : [];
      let truthRisk: TruthRisk | null = payload?.truthRisk
        ? {
            score: Number(payload.truthRisk.score ?? 0),
            level: payload.truthRisk.level === "risky" ? "risky" : payload.truthRisk.level === "review" ? "review" : "safe",
            reasons: Array.isArray(payload.truthRisk.reasons) ? payload.truthRisk.reasons : [],
            addedTerms: Array.isArray(payload.truthRisk.addedTerms) ? payload.truthRisk.addedTerms : [],
            riskyPhrases: Array.isArray(payload.truthRisk.riskyPhrases) ? payload.truthRisk.riskyPhrases : [],
            unsupportedClaims: Array.isArray(payload.truthRisk.unsupportedClaims) ? payload.truthRisk.unsupportedClaims : [],
          }
        : null;

      if (
        shouldForceLowScoreRetry({
          original: originalBullet,
          rewritten: rewrittenBullet,
          keywordHits,
          suggestedKeywords,
          needsMoreInfo,
        })
      ) {
        payload = await runRewriteAttemptWithTimeoutRetry(
          [
            "This bullet still needs a more noticeable rewrite. Keep it truthful, but strengthen the opener, tighten the structure, and make the improvement obvious.",
            "Do not return a near-copy of the original. Make a clear wording upgrade while preserving the original facts.",
          ],
          activeSession.attemptNumber + 2
        );

        rewrittenBullet = String(payload?.rewrittenBullet ?? "").trim();
        needsMoreInfo = !!payload?.needsMoreInfo;
        notes = Array.isArray(payload?.notes) ? payload.notes : [];
        keywordHits = Array.isArray(payload?.keywordHits) ? payload.keywordHits : [];
        blockedKeywords = Array.isArray(payload?.blockedKeywords) ? payload.blockedKeywords : [];
        truthRisk = payload?.truthRisk
          ? {
              score: Number(payload.truthRisk.score ?? 0),
              level: payload.truthRisk.level === "risky" ? "risky" : payload.truthRisk.level === "review" ? "review" : "safe",
              reasons: Array.isArray(payload.truthRisk.reasons) ? payload.truthRisk.reasons : [],
              addedTerms: Array.isArray(payload.truthRisk.addedTerms) ? payload.truthRisk.addedTerms : [],
              riskyPhrases: Array.isArray(payload.truthRisk.riskyPhrases) ? payload.truthRisk.riskyPhrases : [],
              unsupportedClaims: Array.isArray(payload.truthRisk.unsupportedClaims) ? payload.truthRisk.unsupportedClaims : [],
            }
          : truthRisk;
      }

      if (!rewrittenBullet) throw new Error("AI returned empty rewrite");

      let appendedPlanIndex: number | null = null;

      setAnalysis((prev) => {
        if (!prev) return prev;

        const prevBullets = Array.isArray(prev.bullets) ? prev.bullets : [];
        const prevPlan = Array.isArray(prev.rewritePlan) ? prev.rewritePlan : [];

        const nextPlan =
          prevPlan.length > 0
            ? [...prevPlan]
            : prevBullets.slice(0, 200).map((b) => ({
                originalBullet: bulletToText(b),
                suggestedKeywords: [],
                rewrittenBullet: "",
                needsMoreInfo: false,
                notes: [],
                keywordHits: [],
                blockedKeywords: [],
                truthRisk: undefined,
                verbStrength: undefined,
                jobId: undefined,
              }));

        const targetPlanIndex = row.planIndex ?? nextPlan.length;
        if (row.planIndex === null) appendedPlanIndex = targetPlanIndex;

        if (!nextPlan[targetPlanIndex]) {
          nextPlan[targetPlanIndex] = {
            originalBullet,
            suggestedKeywords,
            rewrittenBullet: "",
            needsMoreInfo: false,
            notes: [],
            keywordHits: [],
            blockedKeywords: [],
            truthRisk: undefined,
            verbStrength: undefined,
            jobId: row.sectionId,
          };
        }

        nextPlan[targetPlanIndex] = {
          ...nextPlan[targetPlanIndex],
          originalBullet: nextPlan[targetPlanIndex].originalBullet ?? originalBullet,
          suggestedKeywords,
          rewrittenBullet,
          needsMoreInfo,
          notes,
          keywordHits,
          blockedKeywords,
          truthRisk: truthRisk ?? undefined,
          jobId: row.sectionId,
          verbStrength: payload?.verbStrengthAfter ?? nextPlan[targetPlanIndex].verbStrength,
        };

        return { ...prev, rewritePlan: nextPlan };
      });

      setEditorBulletsBySection((prev: Record<string, string[]>) => {
        const next = [...(prev[row.sectionId] || [])];
        next[row.bulletIndex] = rewrittenBullet;
        return { ...prev, [row.sectionId]: next };
      });

      setRewriteProofByRow((prev) => ({
        ...prev,
        [row.key]: {
          originalBullet,
          suggestedKeywords,
          rewrittenBullet,
          needsMoreInfo,
          notes,
          keywordHits,
          blockedKeywords,
          truthRisk: truthRisk ?? undefined,
          verbStrength: payload?.verbStrengthAfter,
          jobId: row.sectionId,
        },
      }));

      if (appendedPlanIndex !== null) {
        setAssignments((prev) => ({
          ...prev,
          [appendedPlanIndex as number]: { sectionId: row.sectionId },
        }));
      }

      refreshCredits();
      return true;
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Rewrite failed"));
      refreshCredits();
      return false;
    } finally {
      setLoadingRewriteIndex(null);
    }
  }

  function handleUndoRewrite(index: number) {
    const row = liveBulletRows[index];
    if (!row || row.planIndex === null) {
      setSelectedBulletIdx((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      return;
    }

    setAnalysis((prev) => {
      if (!prev) return prev;
      const prevPlan = Array.isArray(prev.rewritePlan) ? prev.rewritePlan : [];
      if (!prevPlan.length) return prev;

      const nextPlan = [...prevPlan];
      const planIndex = row.planIndex;
      const cur = planIndex === null ? undefined : nextPlan[planIndex];
      if (!cur) return prev;

      if (planIndex === null) return prev;

      nextPlan[planIndex] = {
        ...cur,
        rewrittenBullet: "",
        needsMoreInfo: false,
        truthRisk: undefined,
      };

      return { ...prev, rewritePlan: nextPlan };
    });

    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = [...(prev[row.sectionId] || [])];
      next[row.bulletIndex] = row.originalText || next[row.bulletIndex] || "";
      return { ...prev, [row.sectionId]: next };
    });

    setRewriteProofByRow((prev) => {
      if (!(row.key in prev)) return prev;
      const next = { ...prev };
      delete next[row.key];
      return next;
    });

    setSelectedBulletIdx((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }


  function commitEditorBulletUpdate(sectionId: string, index: number) {
    const nextText = String(editorBulletsBySection[sectionId]?.[index] ?? "").trim();

    if (!nextText) {
      setError("Bullet cannot be empty.");
      return;
    }

    const row = liveBulletRows.find((r) => r.sectionId === sectionId && r.bulletIndex === index);

    const planIndex = row?.planIndex;
if (typeof planIndex === "number") {
  setAnalysis((prev) => {
    if (!prev) return prev;

    const idx: number = planIndex;
    const nextPlan = Array.isArray(prev.rewritePlan) ? [...prev.rewritePlan] : [];
    const nextBullets = Array.isArray(prev.bullets) ? [...prev.bullets] : [];

    if (nextPlan[idx]) {
      nextPlan[idx] = {
        ...nextPlan[idx],
        originalBullet: nextText,
        rewrittenBullet: "",
        needsMoreInfo: false,
        notes: [],
        keywordHits: [],
        blockedKeywords: [],
        truthRisk: undefined,
      };
    }

    if (nextBullets[idx] !== undefined) {
      nextBullets[idx] = nextText;
    }

    return {
      ...prev,
      bullets: nextBullets,
      rewritePlan: nextPlan,
    };
  });
}

    const rebuiltResumeText = sections
      .map((section) => {
        const bullets = (editorBulletsBySection[section.id] || [])
          .map((bullet) => String(bullet ?? "").trim())
          .filter(Boolean);

        const headerParts = [
          String(section.company || "").trim(),
          String(section.title || "").trim(),
          String(section.dates || "").trim(),
          String(section.location || "").trim(),
        ].filter(Boolean);

        const header = headerParts.join(" | ");
        const bulletLines = bullets.map((bullet) => `- ${bullet}`);
        return [header, ...bulletLines].filter(Boolean).join("\n");
      })
      .filter(Boolean)
      .join("\n\n");

    setResumeText(rebuiltResumeText);

    const rewriteSessionKey = `${sectionId}:${index}`;
    setRewriteProofByRow((prev) => {
      if (!(rewriteSessionKey in prev)) return prev;
      const next = { ...prev };
      delete next[rewriteSessionKey];
      return next;
    });

    setRewriteSessions((prev) => {
      if (!(rewriteSessionKey in prev)) return prev;
      const next = { ...prev };
      delete next[rewriteSessionKey];
      return next;
    });

    setSelectedBulletIdx((prev) => {
      const next = new Set(prev);
      const liveIndex = liveBulletRows.findIndex((r) => r.sectionId === sectionId && r.bulletIndex === index);
      if (liveIndex >= 0) next.delete(liveIndex);
      return next;
    });
  }

  async function handleRewriteSelected() {
    if (!analysis) return;

    const effectiveLen = liveBulletRows.length;
    if (!effectiveLen) {
      setError("No bullets available. Run Analyze first.");
      return;
    }

    const selected = Array.from(selectedBulletIdx).sort((a, b) => a - b);
    if (!selected.length) {
      setError("Select at least one bullet to rewrite.");
      return;
    }

    setLoadingBatchRewrite(true);
    setError(null);

    let successCount = 0;
    let failedCount = 0;

    try {
      for (const i of selected) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await handleRewriteBullet(i);
        if (ok) successCount += 1;
        else failedCount += 1;
      }

      if (failedCount > 0) {
        setError(`Rewrote ${successCount} of ${selected.length} selected bullets. ${failedCount} failed or timed out and were skipped.`);
      }
    } finally {
      setLoadingBatchRewrite(false);
      refreshCredits();
    }
  }

  const effectivePlan: RewritePlanItem[] = useMemo(() => {
    const plan = Array.isArray(analysis?.rewritePlan) ? analysis!.rewritePlan! : [];
    if (plan.length) return plan;

    const bullets = Array.isArray(analysis?.bullets) ? analysis!.bullets! : [];
    return bullets.map((b) => ({
      originalBullet: bulletToText(b),
      suggestedKeywords: [],
      rewrittenBullet: "",
      needsMoreInfo: false,
      notes: [],
      keywordHits: [],
      blockedKeywords: [],
      verbStrength: undefined,
      jobId: undefined,
    }));
  }, [analysis]);

  const metaGames = sanitizeMetaLines(
    Array.isArray(analysis?.metaBlocks?.gamesShipped) ? analysis!.metaBlocks!.gamesShipped! : []
  );
  const metaMetrics = sanitizeMetaLines(Array.isArray(analysis?.metaBlocks?.metrics) ? analysis!.metaBlocks!.metrics! : []);

  const [editorMetaGames, setEditorMetaGames] = useState<string[]>([]);
  const [editorMetaMetrics, setEditorMetaMetrics] = useState<string[]>([]);
  const lastMetaGamesSeedKeyRef = useRef<string>("");
  const lastMetaMetricsSeedKeyRef = useRef<string>("");
  const [shippedLabelMode, setShippedLabelMode] = useState<"Games" | "Apps">("Games");

  const guardrailTerms = useMemo(() => {
    const terms: string[] = [];
    if (targetCompany.trim()) terms.push(targetCompany.trim());
    terms.push(...csvToArray(targetProductsCsv));
    terms.push(...csvToArray(blockedTermsCsv));
    return terms.filter(Boolean);
  }, [targetCompany, targetProductsCsv, blockedTermsCsv]);

  const selectedCount = [...selectedBulletIdx].filter((i) => i < effectivePlan.length).length;

  const appliedBulletText = useMemo(() => {
    if (!effectivePlan.length) return [];
    return effectivePlan.map((item, i) => {
      const original = planItemToText(item);
      const rewritten = String(item?.rewrittenBullet ?? "").trim();
      const isSelected = selectedBulletIdx.has(i);
      if (isSelected && rewritten) return rewritten;
      return original;
    });
  }, [effectivePlan, selectedBulletIdx]);

  const bulletsBySection = useMemo(() => {
    const by: Record<string, string[]> = {};
    const fallback = sections[0]?.id || "default";

    for (let i = 0; i < appliedBulletText.length; i++) {
      const text = String(appliedBulletText[i] ?? "").trim();
      if (!text) continue;

      const sectionId = assignments[i]?.sectionId || fallback;
      if (!by[sectionId]) by[sectionId] = [];
      by[sectionId].push(text);
    }

    return by;
  }, [appliedBulletText, assignments, sections]);

  const [editorBulletsBySection, setEditorBulletsBySection] = useState<Record<string, string[]>>({});

  
  const autoParsedExpertise = useMemo(() => {
    return parseAreasOfExpertise({
      resumeText,
      summary: profile.summary,
      bulletsBySection: editorBulletsBySection,
      analysisBullets: effectivePlan.map((item) => planItemToText(item)).filter(Boolean),
      maxItems: 12,
    });
  }, [resumeText, profile.summary, editorBulletsBySection, effectivePlan]);

  const [editorExpertiseItems, setEditorExpertiseItems] = useState<string[]>([]);
  const [editorEducationItems, setEditorEducationItems] = useState<string[]>([]);

  const structuredResumeSnapshot = useMemo<StructuredResumeSnapshot>(() => ({
    version: 1,
    targetPosition: targetPosition.trim(),
    template: resumeTemplate,
    profile,
    sections: sections.map((section) => ({
      ...section,
      bullets: (editorBulletsBySection[section.id] || []).map((bullet) => String(bullet ?? "").trim()).filter(Boolean),
    })),
    educationItems: editorEducationItems.filter((x) => String(x ?? "").trim()),
    expertiseItems: editorExpertiseItems.filter((x) => String(x ?? "").trim()),
    metaGames: editorMetaGames.filter((x) => String(x ?? "").trim()),
    metaMetrics: editorMetaMetrics.filter((x) => String(x ?? "").trim()),
    shippedLabelMode: shippedLabelMode === "Apps" ? "apps" : "games",
    includeMetaInResumeDoc,
    showShippedBlock,
    showMetricsBlock,
    showEducationOnResume,
    showExpertiseOnResume,
    showProfilePhoto,
    profilePhotoDataUrl,
    profilePhotoShape,
    profilePhotoSize,
  }), [
    targetPosition,
    resumeTemplate,
    profile,
    sections,
    editorBulletsBySection,
    editorEducationItems,
    editorExpertiseItems,
    editorMetaGames,
    editorMetaMetrics,
    shippedLabelMode,
    includeMetaInResumeDoc,
    showShippedBlock,
    showMetricsBlock,
    showEducationOnResume,
    showExpertiseOnResume,
    showProfilePhoto,
    profilePhotoDataUrl,
    profilePhotoShape,
    profilePhotoSize,
  ]);

  useEffect(() => {
    if (hasStructuredResumeBullets(structuredResumeSnapshot)) return;

    setEditorEducationItems((prev) => {
      const cleanedPrev = prev.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (cleanedPrev.length) return prev;

      const parsed = parseEducationLines(resumeText);
      return parsed.length ? parsed : prev;
    });
  }, [resumeText, structuredResumeSnapshot]);

  useEffect(() => {
    if (!analysis) return;
    if (hasStructuredResumeBullets(structuredResumeSnapshot)) return;

    setEditorEducationItems((prev) => {
      const cleanedPrev = prev.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (cleanedPrev.length) return prev;

      const sourceText =
        String(analysis?.debug?.rawText ?? "") ||
        String(analysis?.debug?.normalizedText ?? "") ||
        String(resumeText ?? "");

      const parsed = parseEducationLines(sourceText);
      return parsed.length ? parsed : prev;
    });
  }, [analysis, resumeText, structuredResumeSnapshot]);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dragState, setDragState] = useState<{ sectionId: string; index: number } | null>(null);
  const [highlightedNavTarget, setHighlightedNavTarget] = useState<string | null>(null);
  const editorBulletRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const goToEditorBullet = useCallback((sectionId: string, bulletIndex: number) => {
    const key = `${sectionId}:${bulletIndex}`;
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: false }));

    window.setTimeout(() => {
      const node = editorBulletRefs.current[key];
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedNavTarget(`editor:${key}`);
        window.setTimeout(() => setHighlightedNavTarget((prev) => (prev === `editor:${key}` ? null : prev)), 1800);
        const field = node.querySelector("textarea") as HTMLTextAreaElement | null;
        field?.focus();
      }
    }, 80);
  }, []);

  const goToRewrite = useCallback((sectionId: string, bulletIndex: number) => {
    const key = `${sectionId}:${bulletIndex}`;
    const node = document.getElementById(`rewrite-bullet-${key}`);
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedNavTarget(`rewrite:${key}`);
    window.setTimeout(() => setHighlightedNavTarget((prev) => (prev === `rewrite:${key}` ? null : prev)), 1800);
  }, []);

  const analysisSeedKey = useMemo(() => {
    if (!analysis) return "";
    const jobIds = Array.isArray(analysis?.bulletJobIds) ? analysis.bulletJobIds.join("|") : "";
    const bullets = Array.isArray(analysis?.bullets) ? analysis.bullets.join("|") : "";
    const jobs = Array.isArray(analysis?.experienceJobs)
      ? analysis.experienceJobs
          .map((job) => `${String(job?.id || "")}:${Array.isArray(job?.bullets) ? job.bullets.join("|") : ""}`)
          .join("||")
      : "";
    return `${jobIds}::${bullets}::${jobs}`;
  }, [analysis]);
  const metaGamesSeedKey = useMemo(() => `${analysisSeedKey}::games::${metaGames.join("|")}`, [analysisSeedKey, metaGames]);
  const metaMetricsSeedKey = useMemo(() => `${analysisSeedKey}::metrics::${metaMetrics.join("|")}`, [analysisSeedKey, metaMetrics]);

  useEffect(() => {
    if (!analysisSeedKey) return;
    if (preserveStructuredDuringAnalyze && hasStructuredResumeBullets(structuredResumeSnapshot)) return;

    const seeded: Record<string, string[]> = {};
    Object.entries(bulletsBySection).forEach(([sectionId, bullets]) => {
      seeded[sectionId] = [...bullets].map((x) => String(x ?? ""));
    });

    if (!Object.keys(seeded).length) return;

    setEditorBulletsBySection((prev) => {
      const prevKeys = Object.keys(prev);
      const seededKeys = Object.keys(seeded);

      if (prevKeys.length === seededKeys.length) {
        const same = seededKeys.every((sectionId) => {
          const prevBullets = prev[sectionId] || [];
          const nextBullets = seeded[sectionId] || [];
          if (prevBullets.length !== nextBullets.length) return false;
          return nextBullets.every((bullet, index) => prevBullets[index] === bullet);
        });

        if (same) return prev;
      }

      return seeded;
    });
  }, [analysisSeedKey, bulletsBySection, preserveStructuredDuringAnalyze, structuredResumeSnapshot]);

  useEffect(() => {
    if (!metaGamesSeedKey) return;
    if (preserveStructuredDuringAnalyze && hasStructuredResumeBullets(structuredResumeSnapshot)) return;
    if (lastMetaGamesSeedKeyRef.current === metaGamesSeedKey) return;

    lastMetaGamesSeedKeyRef.current = metaGamesSeedKey;
    setEditorMetaGames((prev) => {
      const cleanedPrev = prev.map((x) => String(x ?? "").trim()).filter(Boolean);
      const cleanedNext = metaGames.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (cleanedPrev.length === cleanedNext.length && cleanedNext.every((value, index) => cleanedPrev[index] === value)) {
        return prev;
      }
      return metaGames;
    });
  }, [metaGamesSeedKey, preserveStructuredDuringAnalyze, structuredResumeSnapshot, metaGames]);

  useEffect(() => {
    if (!metaMetricsSeedKey) return;
    if (preserveStructuredDuringAnalyze && hasStructuredResumeBullets(structuredResumeSnapshot)) return;
    if (lastMetaMetricsSeedKeyRef.current === metaMetricsSeedKey) return;

    lastMetaMetricsSeedKeyRef.current = metaMetricsSeedKey;
    setEditorMetaMetrics((prev) => {
      const cleanedPrev = prev.map((x) => String(x ?? "").trim()).filter(Boolean);
      const cleanedNext = metaMetrics.map((x) => String(x ?? "").trim()).filter(Boolean);
      if (cleanedPrev.length === cleanedNext.length && cleanedNext.every((value, index) => cleanedPrev[index] === value)) {
        return prev;
      }
      return metaMetrics;
    });
  }, [metaMetricsSeedKey, preserveStructuredDuringAnalyze, structuredResumeSnapshot, metaMetrics]);

  useEffect(() => {
    setCollapsedSections((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of sections) {
        next[s.id] = prev[s.id] ?? true;
      }
      return next;
    });
  }, [sections]);

  useEffect(() => {
    setEditorExpertiseItems((prev) => {
      const cleanedPrev = prev.map((x) => String(x ?? "").trim()).filter(Boolean);
      const cleanedAuto = autoParsedExpertise.map((x) => String(x ?? "").trim()).filter(Boolean);

      if (!cleanedPrev.length) return cleanedAuto;
      return prev;
    });
  }, [autoParsedExpertise]);

  function toggleSectionCollapsed(sectionId: string) {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }

  function updateEditorBullet(sectionId: string, index: number, value: string) {
    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = [...(prev[sectionId] || [])];
      next[index] = value;
      return { ...prev, [sectionId]: next };
    });
  }

  function addEditorBullet(sectionId: string) {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: false }));
    setEditorBulletsBySection((prev: Record<string, string[]>) => ({
      ...prev,
      [sectionId]: [...(prev[sectionId] || []), ""],
    }));
  }

  function getSectionById(sectionId: string) {
    return sections.find((section) => section.id === sectionId);
  }

  function getSectionDisplayHeader(section: ExperienceSection) {
    const left = [section.company?.trim(), section.location?.trim()].filter(Boolean).join(", ");
    const right = String(section.title ?? "").trim() || "Untitled Role";
    return left ? `${left} — ${right}` : right;
  }

  function editSectionHeader(sectionId: string) {
    const current = getSectionById(sectionId);
    if (!current) return;

    const nextHeader = window.prompt("Edit full job header line", getSectionDisplayHeader(current));
    if (nextHeader === null) return;

    const cleaned = String(nextHeader ?? "").trim();
    if (!cleaned) return;

    const [leftPart, ...rightParts] = cleaned.split("—");
    const right = rightParts.join("—").trim();

    let company = "";
    let location = "";
    if (leftPart) {
      const leftBits = leftPart
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      company = leftBits.shift() ?? "";
      location = leftBits.join(", ");
    }

    const title = right || cleaned;

    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              title,
              company,
              location,
            }
          : section
      )
    );
  }


  function editSectionMeta(sectionId: string) {
    const current = sections.find((section) => section.id === sectionId);
    if (!current) return;

    const nextTitle = window.prompt("Edit job title", String(current.title ?? ""));
    if (nextTitle === null) return;

    const nextCompany = window.prompt("Edit company", String(current.company ?? ""));
    if (nextCompany === null) return;

    const nextLocation = window.prompt("Edit location", String(current.location ?? ""));
    if (nextLocation === null) return;

    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              title: String(nextTitle ?? "").trim(),
              company: String(nextCompany ?? "").trim(),
              location: String(nextLocation ?? "").trim(),
            }
          : section
      )
    );
  }

  function deleteEditorSection(sectionId: string) {
    const sectionLiveRows = liveBulletRows.filter((r) => r.sectionId === sectionId);
    const removedPlanIndices = sectionLiveRows
      .map((r) => r.planIndex)
      .filter((idx): idx is number => typeof idx === "number")
      .sort((a, b) => a - b);
    const removedLiveIndexes = liveBulletRows
      .map((row, liveIndex) => ({ row, liveIndex }))
      .filter(({ row }) => row.sectionId === sectionId)
      .map(({ liveIndex }) => liveIndex)
      .sort((a, b) => a - b);

    setSections((prev) => {
      const next = prev.filter((section) => section.id !== sectionId);
      return next.length
        ? next
        : [{ id: "default", company: "Experience", title: "", dates: "", location: "" }];
    });

    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });

    setCollapsedSections((prev) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });

    Object.keys(editorBulletRefs.current).forEach((key) => {
      if (key.startsWith(`${sectionId}:`)) delete editorBulletRefs.current[key];
    });

    setDragState((prev) => (prev?.sectionId === sectionId ? null : prev));

    setRewriteSessions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${sectionId}:`)) delete next[key];
      });
      return next;
    });

    if (removedPlanIndices.length) {
      setAnalysis((prev) => {
        if (!prev) return prev;

        const nextPlan = Array.isArray(prev.rewritePlan) ? [...prev.rewritePlan] : [];
        const nextBullets = Array.isArray(prev.bullets) ? [...prev.bullets] : [];

        for (const idx of [...removedPlanIndices].sort((a, b) => b - a)) {
          if (idx >= 0 && idx < nextPlan.length) nextPlan.splice(idx, 1);
          if (idx >= 0 && idx < nextBullets.length) nextBullets.splice(idx, 1);
        }

        return {
          ...prev,
          rewritePlan: nextPlan,
          bullets: nextBullets,
        };
      });

      setAssignments((prev) => {
        const removedSet = new Set(removedPlanIndices);
        const next: Record<number, BulletAssignment> = {};

        Object.entries(prev).forEach(([rawKey, value]) => {
          const key = Number(rawKey);
          if (Number.isNaN(key) || removedSet.has(key)) return;

          const shift = removedPlanIndices.filter((idx) => idx < key).length;
          next[key - shift] = value;
        });

        return next;
      });
    }

    if (removedLiveIndexes.length) {
      const removedSet = new Set(removedLiveIndexes);
      setSelectedBulletIdx((prev) => {
        const next = new Set<number>();
        Array.from(prev).forEach((selectedIndex) => {
          if (removedSet.has(selectedIndex)) return;
          const shift = removedLiveIndexes.filter((idx) => idx < selectedIndex).length;
          next.add(selectedIndex - shift);
        });
        return next;
      });
    }
  }

  function deleteEditorBullet(sectionId: string, index: number) {
    const row = liveBulletRows.find((r) => r.sectionId === sectionId && r.bulletIndex === index);
    const removedLiveIndex = liveBulletRows.findIndex((r) => r.sectionId === sectionId && r.bulletIndex === index);
    const removedPlanIndex = row?.planIndex;

    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = [...(prev[sectionId] || [])];
      next.splice(index, 1);
      return { ...prev, [sectionId]: next };
    });

    setRewriteSessions((prev) => {
      const next = { ...prev };
      delete next[`${sectionId}:${index}`];
      return next;
    });

    if (typeof removedPlanIndex === "number") {
      setAnalysis((prev) => {
        if (!prev) return prev;

        const nextPlan = Array.isArray(prev.rewritePlan) ? [...prev.rewritePlan] : [];
        const nextBullets = Array.isArray(prev.bullets) ? [...prev.bullets] : [];

        if (removedPlanIndex >= 0 && removedPlanIndex < nextPlan.length) nextPlan.splice(removedPlanIndex, 1);
        if (removedPlanIndex >= 0 && removedPlanIndex < nextBullets.length) nextBullets.splice(removedPlanIndex, 1);

        return {
          ...prev,
          rewritePlan: nextPlan,
          bullets: nextBullets,
        };
      });

      setAssignments((prev) => {
        const next: Record<number, BulletAssignment> = {};
        Object.entries(prev).forEach(([rawKey, value]) => {
          const key = Number(rawKey);
          if (Number.isNaN(key) || key === removedPlanIndex) return;
          next[key > removedPlanIndex ? key - 1 : key] = value;
        });
        return next;
      });
    }

    setSelectedBulletIdx((prev) => {
      const next = new Set<number>();
      Array.from(prev).forEach((selectedIndex) => {
        if (removedLiveIndex === -1) {
          next.add(selectedIndex);
          return;
        }
        if (selectedIndex === removedLiveIndex) return;
        next.add(selectedIndex > removedLiveIndex ? selectedIndex - 1 : selectedIndex);
      });
      return next;
    });
  }

  function updateExpertiseItem(index: number, value: string) {
    setEditorExpertiseItems((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  }

  function addExpertiseItem() {
    setEditorExpertiseItems((prev) => [...prev, ""]);
  }

  function deleteExpertiseItem(index: number) {
    setEditorExpertiseItems((prev) => prev.filter((_, idx) => idx !== index));
  }


  function updateEducationItem(index: number, value: string) {
    setEditorEducationItems((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  }

  function addEducationItem() {
    setEditorEducationItems((prev) => [...prev, ""]);
  }

  function deleteEducationItem(index: number) {
    setEditorEducationItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addKeywordToExpertise(term: string) {
    const cleaned = String(term ?? "").trim();
    if (!cleaned) return;
    setEditorExpertiseItems((prev) => {
      const exists = prev.some((item) => cleanupAtsKeyword(item) === cleanupAtsKeyword(cleaned));
      if (exists) return prev;
      return [...prev, cleaned];
    });
    setIgnoredMissingKeywords((prev) =>
      prev.filter((item) => cleanupAtsKeyword(item) !== cleanupAtsKeyword(cleaned))
    );
    setShowExpertiseEditor(true);
  }

  function moveEditorBullet(sectionId: string, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = [...(prev[sectionId] || [])];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= next.length ||
        toIndex >= next.length
      ) {
        return prev;
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...prev, [sectionId]: next };
    });
  }

  type LiveBulletRow = {
    key: string;
    sectionId: string;
    sectionLabel: string;
    bulletIndex: number;
    text: string;
    originalText: string;
    planIndex: number | null;
    rewrittenBullet: string;
    suggestedKeywords: string[];
    needsMoreInfo: boolean;
    notes: string[];
    keywordHits: string[];
    blockedKeywords: string[];
    truthRisk: TruthRisk | null;
  };

  const planBucketsBySection = useMemo(() => {
    const buckets: Record<string, Array<{ item: RewritePlanItem; planIndex: number }>> = {};
    const fallback = sections[0]?.id || "default";

    effectivePlan.forEach((item, planIndex) => {
      const sectionId = assignments[planIndex]?.sectionId || fallback;
      if (!buckets[sectionId]) buckets[sectionId] = [];
      buckets[sectionId].push({ item, planIndex });
    });

    return buckets;
  }, [effectivePlan, assignments, sections]);

  const liveBulletRows = useMemo<LiveBulletRow[]>(() => {
    const rows: LiveBulletRow[] = [];

    sections.forEach((section) => {
      const editedBullets = (editorBulletsBySection[section.id] || []).map((x) => String(x ?? ""));
      const bucket = planBucketsBySection[section.id] || [];
      const sectionLabel = `${section.company || "Untitled Company"} — ${section.title || "Untitled Role"}`;

      editedBullets.forEach((text, bulletIndex) => {
        const rowKey = `${section.id}:${bulletIndex}`;
        const matched = bucket[bulletIndex];
        const matchedItem = matched?.item;
        const proofItem = rewriteProofByRow[rowKey];
        const proofTruthRisk = proofItem?.truthRisk as TruthRisk | undefined;

        rows.push({
          key: rowKey,
          sectionId: section.id,
          sectionLabel,
          bulletIndex,
          text,
          originalText: String(matchedItem?.originalBullet ?? proofItem?.originalBullet ?? text ?? "").trim(),
          planIndex: typeof matched?.planIndex === "number" ? matched.planIndex : null,
          rewrittenBullet: String(matchedItem?.rewrittenBullet ?? proofItem?.rewrittenBullet ?? "").trim(),
          suggestedKeywords: keywordsToArray(matchedItem?.suggestedKeywords ?? proofItem?.suggestedKeywords),
          needsMoreInfo: !!(matchedItem?.needsMoreInfo ?? proofItem?.needsMoreInfo),
          notes: Array.isArray(matchedItem?.notes) ? matchedItem.notes : Array.isArray(proofItem?.notes) ? proofItem.notes : [],
          keywordHits: Array.isArray(matchedItem?.keywordHits) ? matchedItem.keywordHits : Array.isArray(proofItem?.keywordHits) ? proofItem.keywordHits : [],
          blockedKeywords: Array.isArray(matchedItem?.blockedKeywords) ? matchedItem.blockedKeywords : Array.isArray(proofItem?.blockedKeywords) ? proofItem.blockedKeywords : [],
          truthRisk: matchedItem?.truthRisk
            ? {
                score: Number(matchedItem.truthRisk.score ?? 0),
                level: matchedItem.truthRisk.level === "risky" ? "risky" : matchedItem.truthRisk.level === "review" ? "review" : "safe",
                reasons: Array.isArray(matchedItem.truthRisk.reasons) ? matchedItem.truthRisk.reasons : [],
                addedTerms: Array.isArray(matchedItem.truthRisk.addedTerms) ? matchedItem.truthRisk.addedTerms : [],
                riskyPhrases: Array.isArray(matchedItem.truthRisk.riskyPhrases) ? matchedItem.truthRisk.riskyPhrases : [],
                unsupportedClaims: Array.isArray(matchedItem.truthRisk.unsupportedClaims) ? matchedItem.truthRisk.unsupportedClaims : [],
              }
            : proofTruthRisk
              ? {
                  score: Number(proofTruthRisk.score ?? 0),
                  level: proofTruthRisk.level === "risky" ? "risky" : proofTruthRisk.level === "review" ? "review" : "safe",
                  reasons: Array.isArray(proofTruthRisk.reasons) ? proofTruthRisk.reasons : [],
                  addedTerms: Array.isArray(proofTruthRisk.addedTerms) ? proofTruthRisk.addedTerms : [],
                  riskyPhrases: Array.isArray(proofTruthRisk.riskyPhrases) ? proofTruthRisk.riskyPhrases : [],
                  unsupportedClaims: Array.isArray(proofTruthRisk.unsupportedClaims) ? proofTruthRisk.unsupportedClaims : [],
                }
              : null,
        });
      });
    });

    return rows;
  }, [sections, editorBulletsBySection, planBucketsBySection, rewriteProofByRow]);

  const liveBulletRowsRef = useRef<LiveBulletRow[]>([]);
  const liveAtsScoreRef = useRef<AtsScoreResult | null>(null);

  useEffect(() => {
    liveBulletRowsRef.current = liveBulletRows;
  }, [liveBulletRows]);

  const compiledBulletsBySection = useMemo(() => {
    const next: Record<string, string[]> = {};

    liveBulletRows.forEach((row, liveIndex) => {
      const outputText =
        selectedBulletIdx.has(liveIndex) && row.rewrittenBullet
          ? String(row.rewrittenBullet ?? "").trim()
          : String(row.text ?? "").trim();

      if (!next[row.sectionId]) next[row.sectionId] = [];
      next[row.sectionId].push(outputText);
    });

    return next;
  }, [liveBulletRows, selectedBulletIdx]);

  const liveBulletQualityAverage = useMemo(() => {
    if (!liveBulletRows.length) return 0;

    const scores = liveBulletRows
      .map((row, liveIndex) => {
        const appliedRewrite = selectedBulletIdx.has(liveIndex) && String(row.rewrittenBullet ?? "").trim();

        if (appliedRewrite) {
          return buildRewriteScorecard({
            original: String(row.originalText ?? row.text ?? "").trim(),
            rewritten: String(row.rewrittenBullet ?? "").trim(),
            keywordHits: row.keywordHits,
            suggestedKeywords: row.suggestedKeywords,
            needsMoreInfo: row.needsMoreInfo,
          }).total;
        }

        const currentText = String(row.text ?? "").trim();
        if (!currentText) return null;

        const wordCount = tokenizeWords(currentText).length;
        const verbScore = scoreVerbStrength(currentText);
        const metrics = (currentText.match(/\b(?:\d+(?:\.\d+)?%?|\$\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?x)\b/g) || []).length;
        const score =
          Math.max(
            35,
            Math.min(
              92,
              Math.round(
                (verbScore / 3) * 32 +
                  Math.min(1, metrics / 2) * 28 +
                  (wordCount >= 10 && wordCount <= 28 ? 1 : wordCount >= 7 ? 0.78 : 0.48) * 40
              )
            )
          );

        return score;
      })
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

    return scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;
  }, [liveBulletRows, selectedBulletIdx]);

  const liveMetricsCount = useMemo(() => {
    const source = [...editorMetaGames, ...editorMetaMetrics, ...liveBulletRows.map((row) => String(row.text ?? ""))].join(" ");
    const hits = source.match(/\b(?:\d+(?:\.\d+)?%?|\$\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?x)\b/g) || [];
    return hits.length;
  }, [editorMetaGames, editorMetaMetrics, liveBulletRows]);

  const liveStrongVerbCount = useMemo(() => {
    return liveBulletRows.reduce((sum, row) => {
      const rowText = String(row.text ?? "").trim();
      return sum + (scoreVerbStrength(rowText) >= 2 ? 1 : 0);
    }, 0);
  }, [liveBulletRows]);

  const liveSectionCompleteness = useMemo(() => {
    let completenessPoints = 0;
    if (String(profile.fullName ?? "").trim()) completenessPoints += 2;
    if (String(profile.titleLine ?? "").trim()) completenessPoints += 1;
    if (String(profile.summary ?? "").trim()) completenessPoints += 2;
    if (liveBulletRows.length >= 3) completenessPoints += 3;
    if (liveBulletRows.length >= 6) completenessPoints += 1;
    if (sections.some((s) => String(s.company ?? "").trim() && String(s.title ?? "").trim())) completenessPoints += 2;
    if (editorExpertiseItems.filter((x) => String(x ?? "").trim()).length) completenessPoints += 1;
    if (editorMetaGames.length || editorMetaMetrics.length) completenessPoints += 1;
    return Math.min(1, completenessPoints / 13);
  }, [profile.fullName, profile.titleLine, profile.summary, liveBulletRows.length, sections, editorExpertiseItems, editorMetaGames.length, editorMetaMetrics.length]);

  const liveAtsScore = useMemo(() => {
    return computeOverallAtsScore({
      analysis,
      jobText,
      targetPosition,
      bulletQualityAverage: liveBulletQualityAverage,
      metricsCount: liveMetricsCount,
      strongVerbCount: liveStrongVerbCount,
      sectionCompleteness: liveSectionCompleteness,
      expertiseItems: editorExpertiseItems.filter((x) => String(x ?? "").trim()),
      ignoredMissingKeywords,
    });
  }, [
    analysis,
    jobText,
    targetPosition,
    liveBulletQualityAverage,
    liveMetricsCount,
    liveStrongVerbCount,
    liveSectionCompleteness,
    editorExpertiseItems,
    ignoredMissingKeywords,
  ]);


  useEffect(() => {
    liveAtsScoreRef.current = liveAtsScore;
  }, [liveAtsScore]);

  const atsScoreDirty = useMemo(() => {
    if (!confirmedAtsScore) return false;
    return confirmedAtsScore.signature !== liveAtsScore.signature;
  }, [confirmedAtsScore, liveAtsScore]);

  const toggleIgnoreMissingKeyword = useCallback((term: string) => {
    const cleaned = cleanupAtsKeyword(term);
    if (!cleaned) return;
    setIgnoredMissingKeywords((prev) =>
      prev.some((item) => cleanupAtsKeyword(item) === cleaned)
        ? prev.filter((item) => cleanupAtsKeyword(item) !== cleaned)
        : [...prev, term]
    );
  }, []);

  const clearIgnoredMissingKeywords = useCallback(() => {
    setIgnoredMissingKeywords([]);
  }, []);

  useEffect(() => {
    if (!analysis || !liveBulletRows.length || atsScoreInitialized) return;
    setConfirmedAtsScore(liveAtsScore);
    setAtsScoreUpdatedAt(Date.now());
    setAtsScoreInitialized(true);
  }, [analysis, liveBulletRows.length, liveAtsScore, atsScoreInitialized]);

  const resumeProfileSyncSignature = useMemo(() => {
    const structuredDraft = hasStructuredResumeBullets(structuredResumeSnapshot)
      ? structuredSnapshotToAnalyzeText(structuredResumeSnapshot)
      : "";
    const draftSource = structuredDraft || resumeText.trim() || htmlToPlainText(resumeHtmlDraft || "");
    const normalizedDraft = normalizeResumeTextForParsing(draftSource);
    if (normalizedDraft.length < 120) return "";

    const activeResumeProfileId = (() => {
      if (typeof window === "undefined") return "";
      const stored = window.localStorage.getItem("activeResumeProfileId") || "";
      return String(searchParams.get("resumeProfileId") || applyPackBundle?.resumeProfileId || stored).trim();
    })();

    const nextTitle = String(
      profile.titleLine || targetPosition || analysis?.ats?.detectedResumeRole?.roleName || analysis?.ats?.targetRole?.roleName || ""
    ).trim();

    const nextTitles = uniqueTerms(
      [
        profile.titleLine,
        targetPosition,
        analysis?.ats?.detectedResumeRole?.roleName,
        analysis?.ats?.targetRole?.roleName,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ).slice(0, 12);

    const nextKeywords = uniqueTerms([
      ...((analysis?.presentKeywords ?? []) as string[]),
      ...((analysis?.ats?.matchedTerms ?? []) as string[]),
      ...editorExpertiseItems,
      ...editorMetaGames,
      ...editorMetaMetrics,
    ]).slice(0, 80);

    const nextSkills = uniqueTerms([
      ...((analysis?.presentKeywords ?? []) as string[]),
      ...((analysis?.ats?.matchedTerms ?? []) as string[]),
      ...editorExpertiseItems,
    ]).slice(0, 60);

    return JSON.stringify({
      profileId: activeResumeProfileId || null,
      title: nextTitle,
      rawText: normalizedDraft,
      template: resumeTemplate,
      skills: nextSkills,
      titles: nextTitles,
      keywords: nextKeywords,
    });
  }, [
    resumeText,
    resumeHtmlDraft,
    searchParamsKey,
    applyPackBundle,
    profile.titleLine,
    analysis,
    targetPosition,
    editorExpertiseItems,
    editorMetaGames,
    editorMetaMetrics,
    resumeTemplate,
  ]);

  const profileSyncDirty = useMemo(() => {
    if (!analysis || !resumeProfileSyncSignature) return false;
    return lastProfileSyncSignatureRef.current !== resumeProfileSyncSignature;
  }, [analysis, resumeProfileSyncSignature]);

  useEffect(() => {
    setSelectedBulletIdx((prev) => {
      const filtered = [...prev].filter((i) => i < liveBulletRows.length);
      return filtered.length === prev.size ? prev : new Set(filtered);
    });
  }, [liveBulletRows.length]);


const resumeHtml = useMemo(() => {
    if (!analysis || !liveBulletRows.length) return "";
    return buildResumeHtml({
      template: resumeTemplate,
      profile,
      sections,
      bulletsBySection: compiledBulletsBySection,
      metaGames: editorMetaGames,
      metaMetrics: editorMetaMetrics,
      shippedLabel: shippedLabelMode,
      includeMeta: includeMetaInResumeDoc,
      showShippedBlock,
      showMetricsBlock,
      educationItems: editorEducationItems.filter((x) => String(x ?? "").trim()),
      showEducationOnResume,
      expertiseItems: editorExpertiseItems.filter((x) => String(x ?? "").trim()),
      showExpertiseOnResume,
      profilePhotoDataUrl,
      showProfilePhoto,
      profilePhotoShape,
      profilePhotoSize,
    });
  }, [
    analysis,
    liveBulletRows.length,
    resumeTemplate,
    profile,
    sections,
    compiledBulletsBySection,
    editorMetaGames,
    editorMetaMetrics,
    shippedLabelMode,
    includeMetaInResumeDoc,
    showEducationOnResume,
    editorEducationItems,
    showExpertiseOnResume,
    editorExpertiseItems,
    profilePhotoDataUrl,
    showProfilePhoto,
    profilePhotoShape,
    profilePhotoSize,
  ]);

  const compiledResumeHtml = useMemo(() => {
    return (resumeHtml || "").trim();
  }, [resumeHtml]);

  useEffect(() => {
    setResumeHtmlDraft(compiledResumeHtml);
  }, [compiledResumeHtml]);

  const liveResumeHtml = useMemo(() => {
    return (compiledResumeHtml || "").trim();
  }, [compiledResumeHtml]);

  const refreshCurrentJobMatch = useCallback(async (resumeProfileIdOverride?: string | null) => {
    if (typeof window === "undefined") return null;

    const activeJobId = String(searchParams.get("jobId") || applyPackBundle?.jobId || "").trim();
    const storedResumeProfileId = window.localStorage.getItem("activeResumeProfileId") || "";
    const activeResumeProfileId = String(
      resumeProfileIdOverride ||
      searchParams.get("resumeProfileId") ||
      applyPackBundle?.resumeProfileId ||
      storedResumeProfileId
    ).trim();

    if (!activeJobId || !activeResumeProfileId) return null;

    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(activeJobId)}/match?resumeProfileId=${encodeURIComponent(activeResumeProfileId)}`,
        { method: "GET", cache: "no-store" }
      );
      const payload = await parseApiResponse(response);
      if (!response.ok || typeof payload === "string" || !payload?.ok) return null;
      return payload?.item ?? null;
    } catch {
      return null;
    }
  }, [searchParamsKey, applyPackBundle]);


const syncResumeProfileDraft = useCallback(async () => {
  if (status !== "authenticated" || !analysis) return null;

  setProfileSyncSaving(true);

  const activeResumeProfileId = (() => {
    if (typeof window === "undefined") return "";
    const stored = window.localStorage.getItem("activeResumeProfileId") || "";
    return String(searchParams.get("resumeProfileId") || applyPackBundle?.resumeProfileId || stored).trim();
  })();

  const structuredDraft = hasStructuredResumeBullets(structuredResumeSnapshot)
    ? structuredSnapshotToResumeText(structuredResumeSnapshot)
    : "";
  const draftSource = structuredDraft || resumeText.trim() || htmlToPlainText(resumeHtmlDraft || "");
  const normalizedDraft = normalizeResumeTextForParsing(draftSource);
  if (normalizedDraft.length < 120) {
    setProfileSyncSaving(false);
    return activeResumeProfileId || null;
  }

  const nextTitle = String(
    profile.titleLine || targetPosition || analysis?.ats?.detectedResumeRole?.roleName || analysis?.ats?.targetRole?.roleName || ""
  ).trim();

  const nextSummary = String(profile.summary || analysis?.autoResumeProfile?.title || "").trim();

  const nextTitles = uniqueTerms(
    [
      profile.titleLine,
      analysis?.ats?.detectedResumeRole?.roleName,
      analysis?.ats?.targetRole?.roleName,
      targetPosition,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  ).slice(0, 12);

  const nextKeywords = uniqueTerms([
    ...((analysis?.presentKeywords ?? []) as string[]),
    ...((analysis?.ats?.matchedTerms ?? []) as string[]),
    ...editorExpertiseItems,
    ...editorMetaGames,
    ...editorMetaMetrics,
  ]).slice(0, 80);

  const nextSkills = uniqueTerms([
    ...((analysis?.presentKeywords ?? []) as string[]),
    ...((analysis?.ats?.matchedTerms ?? []) as string[]),
    ...editorExpertiseItems,
  ]).slice(0, 60);

  const signature = resumeProfileSyncSignature;

  if (!signature || lastProfileSyncSignatureRef.current === signature) {
    setProfileSyncSaving(false);
    return activeResumeProfileId || null;
  }

  try {
    const response = await fetch("/api/resume-profiles/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: activeResumeProfileId || undefined,
        title: nextTitle || undefined,
        summary: nextSummary || undefined,
        rawText: normalizedDraft,
        html: liveResumeHtml || undefined,
        template: resumeTemplate,
        skills: nextSkills,
        titles: nextTitles,
        keywords: nextKeywords,
        structuredData: structuredResumeSnapshot,
        sourceMeta: resumeSourceMeta,
      }),
    });

    const payload = await parseApiResponse(response);
    if (!response.ok || typeof payload === "string" || !payload?.ok) return null;

    lastProfileSyncSignatureRef.current = signature;

    const syncedProfileId = String(payload?.item?.id || "").trim();
    if (typeof window !== "undefined" && syncedProfileId) {
      window.localStorage.setItem("activeResumeProfileId", syncedProfileId);
    }
    const nextProfileId = syncedProfileId || activeResumeProfileId || null;
    await refreshCurrentJobMatch(nextProfileId);
    return nextProfileId;
  } catch {
    return null;
  } finally {
    setProfileSyncSaving(false);
  }
}, [
  status,
  analysis,
  searchParamsKey,
  applyPackBundle,
  resumeText,
  resumeHtmlDraft,
  liveResumeHtml,
  resumeTemplate,
  profile.titleLine,
  profile.summary,
  targetPosition,
  editorExpertiseItems,
  editorMetaGames,
  editorMetaMetrics,
  structuredResumeSnapshot,
  resumeSourceMeta,
  refreshCurrentJobMatch,
]);


  const finishSetupAndGoToJobs = useCallback(async () => {
    const syncedProfileId = await syncResumeProfileDraft();
    const fallbackProfileId = (() => {
      if (typeof window === "undefined") return "";
      const stored = window.localStorage.getItem("activeResumeProfileId") || "";
      return String(searchParams.get("resumeProfileId") || applyPackBundle?.resumeProfileId || stored).trim();
    })();
    const resumeProfileId = String(syncedProfileId || fallbackProfileId || "").trim();

    if (resumeProfileId) {
      router.push(`/jobs?resumeProfileId=${encodeURIComponent(resumeProfileId)}`);
      return;
    }

    if (!profileSyncDirty && analysis) {
      router.push("/jobs");
    }
  }, [syncResumeProfileDraft, router, profileSyncDirty, analysis, searchParamsKey, applyPackBundle]);

useEffect(() => {
  if (status !== "authenticated" || !analysis || !atsScoreInitialized) return;

  if (profileSyncTimeoutRef.current) {
    clearTimeout(profileSyncTimeoutRef.current);
  }

  profileSyncTimeoutRef.current = setTimeout(() => {
    void syncResumeProfileDraft();
  }, 1600);

  return () => {
    if (profileSyncTimeoutRef.current) {
      clearTimeout(profileSyncTimeoutRef.current);
      profileSyncTimeoutRef.current = null;
    }
  };
}, [status, analysis, atsScoreInitialized, syncResumeProfileDraft]);

  const handleRefreshAtsScore = useCallback(async () => {
    setConfirmedAtsScore(liveAtsScore);
    setAtsScoreUpdatedAt(Date.now());
    setAtsScoreInitialized(true);
    const syncedProfileId = await syncResumeProfileDraft();
    await refreshCurrentJobMatch(syncedProfileId);
  }, [liveAtsScore, syncResumeProfileDraft, refreshCurrentJobMatch]);

  
  async function handleCopyOutput() {
    const html = liveResumeHtml;
    if (!html) return;

    const txt = htmlToPlainText(html);
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  async function handleDownloadPdf() {
    const html = liveResumeHtml;
    if (!html) return;

    setError(null);

    try {
      const res = await fetch("/api/resume-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          filename: "resume.pdf",
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `PDF render failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "PDF download failed"));
    }
  }

  function handlePrintPdf() {
    const html = liveResumeHtml;
    if (!html) return;
    openPrintWindow(html);
  }


  const debugInjected = useMemo(() => {
    const hits = effectivePlan
      .map((p) => String(p?.rewrittenBullet ?? ""))
      .flatMap((t) => findInjectedTerms(t, guardrailTerms));
    return Array.from(new Set(hits));
  }, [effectivePlan, guardrailTerms]);

  const checklistItems = useMemo<WorkflowChecklistItem[]>(() => {
    const hasResumeSource = !!file || resumeText.trim().length > 0;
    const hasTemplate = !!resumeTemplate;
    const hasHeader = [profile.fullName, profile.titleLine, profile.email].some((value) => String(value || "").trim());
    const hasSummary = profile.summary.trim().length > 0;
    const hasAnalyzed = !!analysis;
    const hasKeywordReview = !analysis || showAtsKeywords;
    const hasShippedProducts = editorMetaGames.some((item) => String(item || "").trim());
    const hasMetrics = editorMetaMetrics.some((item) => String(item || "").trim());
    const hasEditedBullets = liveBulletRows.length > 0;
    const hasOutput = !!liveResumeHtml.trim();

    return [
      { id: "resume-source", label: isSetupMode ? "Upload your base resume" : "Resume source loaded", done: hasResumeSource, actionLabel: "Go", onAction: () => scrollToSection("resume-source") },
      ...(isSetupMode ? [] : [{ id: "job-setup", label: "Target position / job context", done: !!targetPosition.trim() && !!jobText.trim(), actionLabel: "Go", onAction: () => scrollToSection("job-setup") }]),
      { id: "template", label: "Choose template", done: hasTemplate, actionLabel: "Go", onAction: () => scrollToSection("resume-template") },
      { id: "header", label: "Header details", done: hasHeader, actionLabel: "Go", onAction: () => scrollToSection("header-details") },
      { id: "summary", label: "Add summary", done: hasSummary, actionLabel: "Go", onAction: () => scrollToSection("summary-section") },
      { id: "analyze", label: hasAnalyzed ? (isSetupMode ? "Base resume analyzed" : "Resume analyzed") : (isSetupMode ? "Analyze base resume" : "Analyze resume"), done: hasAnalyzed, actionLabel: "Go", onAction: () => scrollToSection("analyze-resume") },
      ...(isSetupMode ? [] : [{ id: "ats", label: "Review ATS + Areas of Expertise", done: hasAnalyzed && hasKeywordReview, actionLabel: "Go", onAction: () => scrollToSection("ats-panel") }]),
      { id: "shipped", label: "Add shipped products", done: hasShippedProducts, actionLabel: "Go", onAction: () => scrollToSection("shipped-products") },
      { id: "metrics", label: "Add metrics", done: hasMetrics, actionLabel: "Go", onAction: () => scrollToSection("key-metrics") },
      { id: "bullets", label: isSetupMode ? "Edit bullets" : "Edit / rewrite bullets", done: hasEditedBullets, actionLabel: "Go", onAction: () => scrollToSection("bullets-panel") },
      { id: "output", label: isSetupMode ? "Update profile" : "View / print / download resume", done: hasOutput, actionLabel: "Go", onAction: () => scrollToSection("resume-output") },
    ];
  }, [
    file,
    resumeText,
    targetPosition,
    jobText,
    resumeTemplate,
    profile.fullName,
    profile.titleLine,
    profile.email,
    profile.summary,
    analysis,
    showAtsKeywords,
    editorMetaGames,
    editorMetaMetrics,
    liveBulletRows.length,
    liveResumeHtml,
    scrollToSection,
    isSetupMode,
  ]);
  const checklistCompletedCount = checklistItems.filter((item) => item.done).length;
  const canContinueToCoverLetter = !isSetupMode && !!analysis && !atsScoreDirty;

  const fileIsPdf = useMemo(() => {
    if (!file) return false;
    const name = String(file.name || "").toLowerCase();
    return name.endsWith(".pdf") || file.type === "application/pdf";
  }, [file]);

  return (
    <main className="mx-auto max-w-[1900px] px-2 py-6 md:px-3 xl:px-4 2xl:px-5 text-black dark:text-slate-100">
      {error ? (
        <div className="mb-4">
          <Callout title="Error" tone="danger">
            <div className="whitespace-pre-wrap text-sm">{error}</div>
          </Callout>
        </div>
      ) : null}


      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* Inputs */}
        <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 rounded-2xl border border-black/10 bg-white/80 p-3 dark:border-white/10 dark:bg-black/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">Resume workflow guide</div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {checklistCompletedCount}/{checklistItems.length} completed
                  {latestResumeMeta ? ` · Latest resume loaded: ${latestResumeMeta.title}` : ""}
                  {isSetupMode ? " · First-time setup is free" : ""}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {checklistItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${item.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
                      {item.done ? "✓" : "•"}
                    </span>
                    <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-white">{item.label}</span>
                  </div>
                  {item.onAction ? (
                    <button
                      type="button"
                      onClick={item.onAction}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-extrabold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      {item.actionLabel || "Open"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-stretch gap-2">
              <button
                type="button"
                onClick={handleRefreshAtsScore}
                disabled={!analysis}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
              >
                {analysis
                  ? "Refresh ATS + Profile Sync"
                  : isSetupMode
                    ? "Analyze base resume first"
                    : isApplyPackFlow
                      ? "Finalize Resume"
                      : "Analyze resume first"}
              </button>
              {isSetupMode ? (
                <button
                  type="button"
                  onClick={finishSetupAndGoToJobs}
                  disabled={!analysis || profileSyncSaving}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black shadow-md transition-all duration-200 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {profileSyncSaving ? "Finishing setup…" : "Finish Setup & Go to Job Board"}
                </button>
              ) : isApplyPackFlow ? (
                <>
                  <button
                    type="button"
                    onClick={continueToCoverLetter}
                    disabled={!canContinueToCoverLetter}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black shadow-md transition-all duration-200 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Continue to Cover Letter
                  </button>
                  <div className="min-w-[170px] rounded-xl border border-amber-400/30 bg-amber-50/90 px-3 py-2 text-[11px] font-bold text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100">
                    Must complete to use Credit Pack
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <div id="resume-source" className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/90 dark:text-slate-100/90">{isSetupMode ? "Upload your base resume" : "Resume source"}</div>
              {isSetupMode ? (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">This first setup is free. DOCX is still the best source when you have it.</div>
              ) : (
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  Your current synced resume profile is loaded automatically in job flow. Upload a new file only if you want to replace it for this pass.
                </div>
              )}

              <input
                id="resume-upload"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setResumeSourceMeta(
                    nextFile
                      ? {
                          fileName: nextFile.name,
                          mimeType: nextFile.type || null,
                          extension: inferExtension(nextFile.name, nextFile.type),
                          sourceKind: "upload",
                        }
                      : null
                  );
                  resetDerivedState();
                }}
                className="sr-only"
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-emerald-700/40 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black shadow-md transition hover:bg-emerald-700 hover:shadow-lg dark:border-emerald-300/30 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                >
                  Choose File
                </button>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {file
                    ? `Current: ${file.name}`
                    : !isSetupMode && (latestResumeMeta || resumeText.trim())
                      ? "Current: User Profile"
                      : "No file chosen"}
                </div>
              </div>

              {/* ✅ Exact wording you asked for when PDFs are sketchy */}
              {fileIsPdf ? (
                <div className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900">
                  PDF looks weird; DOCX recommended (we’ll still try to extract).
                </div>
              ) : (
                <div className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-800">
                  Recommended: <strong>.docx</strong> (best parsing). PDFs can cause formatting issues.
                </div>
              )}

              {!isSetupMode && !file && (latestResumeMeta || resumeText.trim()) ? (
                <div className="mt-1 rounded-lg border border-emerald-500/20 bg-emerald-50/80 px-3 py-2 text-[11px] font-semibold text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                  Header details, summary, education, shipped products, and key metrics are auto-filled from your current saved resume data when available.
                </div>
              ) : null}

              {file ? (
                <div className="mt-1 flex items-center gap-2">
                  <Chip text={file.name} />
                  <button
                    type="button"
                    onClick={clearFile}
                    className="text-sm font-extrabold underline opacity-80 hover:opacity-100"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            {!isSetupMode ? (
              <div id="job-setup" className="grid gap-3">
                <>
                  <label className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                        {applyPackBundle?.job?.jobContextText ? "Job context (from Job Board)" : "Job posting text"}
                      </div>

                      {applyPackBundle?.job?.jobContextText ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setJobTextOverrideMode((v) => !v)}
                            className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-extrabold text-black/80 hover:bg-white dark:border-white/10 dark:bg-black/20 dark:text-white"
                          >
                            {jobTextOverrideMode ? "Using manual override" : "Override saved job text"}
                          </button>
                          <button
                            type="button"
                            onClick={syncJobTextFromApplyPack}
                            className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[11px] font-extrabold text-black/80 hover:bg-white dark:border-white/10 dark:bg-black/20 dark:text-white"
                          >
                            Re-sync saved job
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <textarea
                      value={jobText}
                      onChange={(e) => setJobText(e.target.value)}
                      rows={6}
                      placeholder={applyPackBundle?.job?.jobContextText ? "Saved job context loaded from Job Board" : "Post job description/requirements here"}
                      className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
                    />

                    <div className="text-xs text-black/70 dark:text-slate-200/80">
                      {applyPackBundle?.job?.jobContextText
                        ? jobTextOverrideMode
                          ? "You are editing a local override. Re-sync anytime to restore the saved Job Board job context."
                          : "This field was prefilled from the saved job you selected via the Job Board. You can still override it if needed."
                        : "Paste a job posting manually, or launch this page from the Job Board to prefill it automatically."}
                    </div>
                  </label>

                  <label className="grid gap-1.5">
                    <div className="text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                      {applyPackBundle?.job?.title ? "Target position (prefilled from saved job)" : "Target position (required)"}
                    </div>
                    <input
                      value={targetPosition}
                      onChange={(e) => setTargetPosition(e.target.value)}
                      placeholder="Production Director, QA Engineer, Product Owner..."
                      className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                    />
                    {applyPackBundle?.job?.title ? (
                      <div className="text-xs text-black/70 dark:text-slate-200/80">
                        Prefilled from Job Board: {applyPackBundle.job.title}
                      </div>
                    ) : null}
                  </label>
                </>
              </div>
            ) : null}

            {/* Template + Color Scheme */}
            <div id="resume-template" className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-1 text-sm font-extrabold text-black/90 dark:text-slate-100/90">Resume style</div>
              <div className="mb-3 text-[11px] text-black/65 dark:text-slate-300/75">
                Real layout + separate palette. Layout changes structure. Color scheme only changes the visual theme.
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-black/70 dark:text-slate-300/80">
                    Template layout
                  </div>
                  <select
                    value={selectedTemplate.layoutId}
                    onChange={(e) => {
                      const next = buildResumeTemplateSelection(
                        e.target.value as typeof selectedTemplate.layoutId,
                        selectedTemplate.colorSchemeId,
                      );
                      setResumeTemplate(next.templateId);
                    }}
                    className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-extrabold text-black outline-none focus:border-black/20 dark:border-white/10 dark:bg-white dark:text-black dark:focus:border-black/20"
                    style={{ color: "#111827", backgroundColor: "#ffffff" }}
                  >
                    {RESUME_LAYOUT_CATEGORY_ORDER.map((category) => {
                      const options = RESUME_LAYOUT_OPTIONS.filter((option) => option.category === category);
                      if (!options.length) return null;

                      return (
                        <optgroup key={category} label={RESUME_LAYOUT_CATEGORY_LABELS[category]}>
                          {options.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              style={{ color: "#111827", backgroundColor: "#ffffff" }}
                            >
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>

                <label className="grid gap-1.5">
                  <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-black/70 dark:text-slate-300/80">
                    Color scheme
                  </div>
                  <select
                    value={selectedTemplate.colorSchemeId}
                    onChange={(e) => {
                      const next = buildResumeTemplateSelection(
                        selectedTemplate.layoutId,
                        e.target.value as typeof selectedTemplate.colorSchemeId,
                      );
                      setResumeTemplate(next.templateId);
                    }}
                    className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-extrabold text-black outline-none focus:border-black/20 dark:border-white/10 dark:bg-white dark:text-black dark:focus:border-black/20"
                    style={{ color: "#111827", backgroundColor: "#ffffff" }}
                  >
                    {[...new Set(RESUME_COLOR_SCHEME_OPTIONS.map((option) => option.category))].map((category) => {
                      const options = RESUME_COLOR_SCHEME_OPTIONS.filter((option) => option.category === category);
                      if (!options.length) return null;

                      return (
                        <optgroup key={category} label={options[0]?.categoryLabel ?? "Color Schemes"}>
                          {options.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              style={{ color: "#111827", backgroundColor: "#ffffff" }}
                            >
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </label>

                <div className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-[11px] text-black/70 dark:border-white/10 dark:bg-black/20 dark:text-slate-300/80">
                  <span className="font-extrabold text-black/85 dark:text-slate-100/90">Current:</span>{" "}
                  {selectedTemplate.layout.label} + {selectedTemplate.colorScheme.label}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = buildResumeTemplateSelection(
                      selectedTemplate.layoutId,
                      getRecommendedColorSchemeForLayout(selectedTemplate.layoutId),
                    );
                    setResumeTemplate(next.templateId);
                  }}
                  className="w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-[11px] font-extrabold text-black/80 hover:bg-white dark:border-white/10 dark:bg-black/20 dark:text-white"
                >
                  Reset this layout to its recommended color
                </button>
              </div>
            </div>

            <div id="summary-section" className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 text-sm font-extrabold text-black/90 dark:text-slate-100/90">Summary</div>
              <textarea
                value={profile.summary}
                onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                placeholder="Summary (optional)"
                rows={4}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
              />
              <div className="mt-2 text-xs text-black/70 dark:text-slate-300/80">
                Add a short summary that frames your fit before the experience section.
              </div>
            </div>

            {/* Header details */}
            <div id="header-details" className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 text-sm font-extrabold text-black/90 dark:text-slate-100/90">Header details</div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={profile.fullName}
                  onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />
                <input
                  value={profile.titleLine}
                  onChange={(e) => setProfile((p) => ({ ...p, titleLine: e.target.value }))}
                  placeholder="Professional Title (e.g. QA Lead | Game & VR Systems)"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />

                <input
                  value={profile.locationLine}
                  onChange={(e) => setProfile((p) => ({ ...p, locationLine: e.target.value }))}
                  placeholder="Location"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />

                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />

                <input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <input
                  value={profile.linkedin}
                  onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
                  placeholder="LinkedIn"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />
                <input
                  value={profile.portfolio}
                  onChange={(e) => setProfile((p) => ({ ...p, portfolio: e.target.value }))}
                  placeholder="Portfolio / Website"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                />
              </div>


              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze || loadingAnalyze}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg"
                >
                  {loadingAnalyze ? "Analyzing…" : analysis ? (isSetupMode ? "Re-analyze Base Resume" : applyPackPricingEligible ? "Re-analyze Resume (included in 8-credit pack)" : `Re-analyze Resume (${CREDIT_COSTS.analyze} credits)`) : (isSetupMode ? "Analyze Base Resume (free)" : applyPackPricingEligible ? "Analyze Resume (included in 8-credit pack)" : `Analyze Resume (${CREDIT_COSTS.analyze} credits)`)}
                </button>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                  <input
                    type="checkbox"
                    checked={showExpertiseOnResume}
                    onChange={(e) => setShowExpertiseOnResume(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show Areas of Expertise on resume
                </label>

                <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyExperienceBullets}
                  onChange={(e) => setOnlyExperienceBullets(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-extrabold text-black/90 dark:text-slate-100/90">Only experience bullets</span>
              </label>
                                
              </div>


              {debugInjected.length ? (
                <div className="mt-2">
                  <Callout title="Guardrail terms detected in rewrites" tone="warn">
                    <div className="flex flex-wrap gap-2">
                      {debugInjected.map((t) => (
                        <Chip key={t} text={t} />
                      ))}
                    </div>
                  </Callout>
                </div>
              ) : null}

              {showDebugJson && analysis ? (
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black p-3 text-xs text-black/90">
                  {JSON.stringify(analysis, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        </section>

        {/* Preview */}
        <section className="min-w-0">
          <HtmlDocPreview
            html={liveResumeHtml}
            footer={
              isSetupMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={finishSetupAndGoToJobs}
                    disabled={!analysis || profileSyncSaving || !liveResumeHtml}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-50"
                  >
                    {profileSyncSaving ? "Finishing setup…" : "Update Profile & Go to Job Board"}
                  </button>

                  <div className="text-xs text-black/70 dark:text-slate-200/80">
                    PDF export unlocks after you tailor this resume for a real role.
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={!liveResumeHtml}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-50"
                  >
                    Download PDF (5 credits if exporting)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        openHtmlPreviewInNewWindow("Resume Preview", liveResumeHtml);
                      } catch (e: unknown) {
                        setError(getErrorMessage(e, "Preview failed"));
                      }
                    }}
                    disabled={!liveResumeHtml}
                    className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                  >
                    Preview
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintPdf}
                    disabled={!liveResumeHtml}
                    className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                  >
                    Print
                  </button>
                </div>
              )
            }
          />



          <div className="mt-3 rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="mb-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
              Edit highlight blocks
            </div>
            <div className="mb-3 text-xs text-black/90 dark:text-slate-100/90">
              Update the highlight cards shown in the resume preview. Toggle between Games and Apps for the shipped label.
            </div>

            <div className="grid gap-3">
              <div id="shipped-products" className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">Shipped label</div>
                  <div className="inline-flex rounded-xl border border-black/10 bg-white p-1 dark:border-white/10 dark:bg-black/20">
                    {(["Games", "Apps"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setShippedLabelMode(mode)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                          shippedLabelMode === mode
                            ? "bg-emerald-600 text-black"
                            : "text-black hover:bg-black/5 dark:text-slate-100"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-black/90 dark:text-slate-200/80">
                  Preview title: {shippedLabelMode} Shipped
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">{shippedLabelMode} Shipped</div>
                    <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                      <input
                        type="checkbox"
                        checked={showShippedBlock}
                        onChange={(e) => setShowShippedBlock(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Show on resume
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditorMetaGames((prev) => [...prev, ""])}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                  >
                    + Add item
                  </button>
                </div>
                <div className="grid gap-2">
                  {editorMetaGames.length ? (
                    editorMetaGames.map((item, i) => (
                      <div key={`meta-game-${i}`} className="flex items-start gap-2">
                        <textarea
                          value={item}
                          onChange={(e) =>
                            setEditorMetaGames((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                          }
                                rows={2}
                          className="flex-1 rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setEditorMetaGames((prev) => prev.filter((_, idx) => idx !== i))}
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-sm text-black/90 dark:border-white/10 dark:bg-black/10 dark:text-slate-100/90">
                      No shipped items yet.
                    </div>
                  )}
                </div>
              </div>

              <div id="key-metrics" className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">Key Metrics</div>
                    <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                      <input
                        type="checkbox"
                        checked={showMetricsBlock}
                        onChange={(e) => setShowMetricsBlock(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Show on resume
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditorMetaMetrics((prev) => [...prev, ""])}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                  >
                    + Add metric
                  </button>
                </div>
                <div className="grid gap-2">
                  {editorMetaMetrics.length ? (
                    editorMetaMetrics.map((item, i) => (
                      <div key={`meta-metric-${i}`} className="flex items-start gap-2">
                        <textarea
                          value={item}
                          onChange={(e) =>
                            setEditorMetaMetrics((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                          }
                                rows={2}
                          className="flex-1 rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setEditorMetaMetrics((prev) => prev.filter((_, idx) => idx !== i))}
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-sm text-black/90 dark:border-white/10 dark:bg-black/10 dark:text-slate-100/90">
                      No key metrics yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                  <div className="mb-2 text-sm font-extrabold text-black/90 dark:text-slate-100/90">Profile photo (Optional)</div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="profile-photo-upload"
                          className="inline-flex cursor-pointer items-center rounded-lg border border-emerald-700/40 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black shadow-md transition hover:bg-emerald-700 hover:shadow-lg dark:border-emerald-300/30 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                        >
                          Choose File
                        </label>

                        <input
                          id="profile-photo-upload"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            const img = e.currentTarget.files?.[0] ?? null;
                            void handleProfilePhotoUpload(img);
                            e.currentTarget.value = "";
                          }}
                          className="hidden"
                        />

                        {profilePhotoDataUrl ? (
                          <button
                            type="button"
                            onClick={clearProfilePhoto}
                            className="text-xs font-extrabold underline opacity-80 hover:opacity-100"
                          >
                            Remove photo
                          </button>
                        ) : null}
                      </div>

                      <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                        <input
                          type="checkbox"
                          checked={showProfilePhoto}
                          onChange={(e) => setShowProfilePhoto(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Show profile photo on resume
                      </label>
                    </div>

                    <div className="grid gap-3">
                      {profilePhotoDataUrl ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={profilePhotoDataUrl}
                            alt="Profile preview"
                            className={[
                              "h-14 w-14 border border-black/10 object-cover",
                              profilePhotoShape === "circle"
                                ? "rounded-full"
                                : profilePhotoShape === "rounded"
                                ? "rounded-2xl"
                                : "rounded-none",
                            ].join(" ")}
                          />
                          <div className="text-xs text-black/90 dark:text-slate-100/90">
                            Preview only. Final size/shape comes from the controls below.
                          </div>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1">
                          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-black/70 dark:text-slate-300/80">Shape</div>
                          <select
                            value={profilePhotoShape}
                            onChange={(e) => setProfilePhotoShape(e.target.value as "circle" | "rounded" | "square")}
                            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold text-black outline-none focus:border-black/20 dark:border-white/10 dark:bg-white dark:text-black dark:focus:border-black/20"
                            style={{ color: "#111827", backgroundColor: "#ffffff" }}
                          >
                            <option value="circle">Circle</option>
                            <option value="rounded">Rounded</option>
                            <option value="square">Square</option>
                          </select>
                        </label>

                        <label className="grid gap-1">
                          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-black/70 dark:text-slate-300/80">Size</div>
                          <select
                            value={String(profilePhotoSize)}
                            onChange={(e) => setProfilePhotoSize(Number(e.target.value) as 48 | 64 | 80 | 96 | 112)}
                            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold text-black outline-none focus:border-black/20 dark:border-white/10 dark:bg-white dark:text-black dark:focus:border-black/20"
                            style={{ color: "#111827", backgroundColor: "#ffffff" }}
                          >
                            <option value="48">Small</option>
                            <option value="64">Medium</option>
                            <option value="80">Large</option>
                            <option value="96">XL</option>
                            <option value="112">2XL</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">Education (Editable)</div>
                      <div className="text-xs text-black/90 dark:text-slate-100/90">
                        {editorEducationItems.filter((x) => String(x ?? "").trim()).length} items
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                        <input
                          type="checkbox"
                          checked={showEducationOnResume}
                          onChange={(e) => setShowEducationOnResume(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Show on resume
                      </label>

                      <button
                        type="button"
                        onClick={addEducationItem}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {editorEducationItems.length ? (
                    <div className="mt-3 grid gap-2">
                      {editorEducationItems.map((item, i) => (
                        <div key={`education-${i}`} className="flex items-center gap-2">
                          <input
                            value={item}
                            onChange={(e) => updateEducationItem(i, e.target.value)}
                            className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black outline-none placeholder:text-black/40 dark:border-white/10 dark:bg-black/20 dark:text-slate-100"
                            placeholder="Education or certification"
                          />
                          <button
                            type="button"
                            onClick={() => deleteEducationItem(i)}
                            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-700 hover:bg-red-100"
                            aria-label={`Delete education ${i + 1}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-black/90 dark:text-slate-100/90">
                      No education detected yet. Add it manually here if the parser misses anything.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

      <section id="ats-panel" className="col-span-full mt-4 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">ATS + Areas of Expertise</div>
            <div className="text-xs text-black/90 dark:text-slate-100/90">
              Keep your expertise list and ATS keyword coverage together in one clear full-width section.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExpertiseEditor((prev) => !prev)}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg"
            >
              {showExpertiseEditor ? "Hide Expertise" : "Show Expertise"}
            </button>

            {showExpertiseEditor ? (
              <button
                type="button"
                onClick={addExpertiseItem}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
              >
                + Add
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setShowAtsKeywords((prev) => {
                  const next = !prev;
                  if (next) setShowExpertiseEditor(true);
                  return next;
                });
              }}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg"
            >
              {showAtsKeywords ? "Hide ATS Keywords" : "Show ATS Keywords"}
            </button>

            <button
              type="button"
              onClick={handleRefreshAtsScore}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg"
            >
              Refresh ATS + Profile Sync
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wide text-black/90 dark:text-slate-100/90">ATS Score</div>
            <div className="mt-1 flex items-end gap-3">
              <div className="text-3xl font-black text-black dark:text-slate-100">
                {confirmedAtsScore?.overall ?? liveAtsScore.overall}
              </div>
              <div className="pb-1 text-sm font-extrabold text-black/90 dark:text-slate-100/90">
                {confirmedAtsScore?.label ?? liveAtsScore.label}
              </div>
              {atsScoreDirty ? (
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-900">
                  Changes pending review
                </span>
              ) : (
                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-900">
                  Up to date
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-black/90 dark:text-slate-100/90">
              Live estimate: {liveAtsScore.overall} · Last updated: {formatAtsUpdatedAt(atsScoreUpdatedAt) || "Not saved yet"}
            </div>
            <div className="mt-1 text-xs text-black/90 dark:text-slate-100/90">
              Role focus: {liveAtsScore.roleFocus[0] || "General"}
            </div>
          </div>

          <div className="grid min-w-[220px] flex-1 gap-2 sm:grid-cols-3 xl:max-w-[720px]">
            <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-black/90 dark:text-slate-100/90">Keyword Coverage</div>
              <div className="mt-1 text-lg font-black text-black dark:text-slate-100">
                {Math.round(liveAtsScore.keywordCoverage * 100)}%
              </div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-black/90 dark:text-slate-100/90">Metrics</div>
              <div className="mt-1 text-lg font-black text-black dark:text-slate-100">
                {liveAtsScore.metricsCount}
              </div>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-black/90 dark:text-slate-100/90">Completeness</div>
              <div className="mt-1 text-lg font-black text-black dark:text-slate-100">
                {Math.round(liveAtsScore.sectionCompleteness * 100)}%
              </div>
            </div>
          </div>
        </div>

        {liveAtsScore.notes.length ? (
          <div className="mt-3 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
            <div className="text-xs font-extrabold uppercase tracking-wide text-black/90 dark:text-slate-100/90">ATS Notes</div>
            <ul className="mt-2 list-disc pl-5 text-xs text-black/90 dark:text-slate-100/90">
              {liveAtsScore.notes.slice(0, 4).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">Areas of Expertise (Editable)</div>
                <div className="text-xs text-black/90 dark:text-slate-100/90">
                  {editorExpertiseItems.filter((x) => String(x ?? "").trim()).length} items
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                <input
                  type="checkbox"
                  checked={showExpertiseOnResume}
                  onChange={(e) => setShowExpertiseOnResume(e.target.checked)}
                  className="h-4 w-4"
                />
                Show on resume
              </label>
            </div>

            {!showExpertiseEditor ? (
              <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-xs text-black/90 dark:border-white/10 dark:bg-black/10 dark:text-slate-100/90">
                Expertise is minimized by default. Click <span className="font-extrabold">Show Expertise</span> to review or edit items.
              </div>
            ) : editorExpertiseItems.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {editorExpertiseItems.map((item, i) => (
                  <div
                    key={`expertise-${i}`}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20"
                  >
                    <input
                      value={item}
                      onChange={(e) => updateExpertiseItem(i, e.target.value)}
                      className="min-w-[120px] max-w-[260px] bg-transparent text-xs font-extrabold text-black outline-none placeholder:text-black/40 dark:text-slate-100"
                      placeholder="Expertise"
                    />
                    <button
                      type="button"
                      onClick={() => deleteExpertiseItem(i)}
                      className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-700 hover:bg-red-100"
                      aria-label={`Delete expertise ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-black/90 dark:text-slate-100/90">
                No expertise detected yet. Add resume text, bullets, or a stronger summary and analyze again.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-black/90 dark:text-slate-100/90">ATS Keywords</div>
                <div className="text-[11px] text-black/90 dark:text-slate-100/90">Matched keywords and job-post-relevant missing terms stay tied to Areas of Expertise here.</div>
              </div>
            </div>

            {showAtsKeywords ? (
              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/5">
                  <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-700">
                    Matched Keywords ({liveAtsScore.matchedKeywords.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {liveAtsScore.matchedKeywords.length ? (
                      liveAtsScore.matchedKeywords.slice(0, 16).map((term) => <Chip key={`matched-${term}`} text={term} />)
                    ) : (
                      <span className="text-xs text-black/90 dark:text-slate-100/90">No strong keyword matches yet.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-700">
                      Missing Keywords ({liveAtsScore.missingKeywords.length})
                    </div>
                    {ignoredMissingKeywords.length ? (
                      <button
                        type="button"
                        onClick={clearIgnoredMissingKeywords}
                        className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                      >
                        Reset removed
                      </button>
                    ) : null}
                  </div>
                  <div className="mb-2 text-[11px] text-black/90 dark:text-slate-100/90">
                    Use the <span className="font-extrabold text-emerald-700">+</span> to add a keyword to Areas of Expertise and count it as covered, or the <span className="font-extrabold text-red-600">−</span> to remove it from ATS scoring for this application.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {liveAtsScore.missingKeywords.length ? (
                      liveAtsScore.missingKeywords.slice(0, 16).map((term) => (
                        <div
                          key={`missing-${term}`}
                          className="inline-flex items-center overflow-hidden rounded-full border border-black/10 bg-black/5 text-xs font-extrabold text-black/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-100/90"
                        >
                          <button
                            type="button"
                            onClick={() => addKeywordToExpertise(term)}
                            className="flex items-center justify-center bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-700 dark:hover:bg-emerald-500/20"
                            title="Add this keyword to Areas of Expertise"
                          >
                            +
                          </button>
                          <span className="px-2.5 py-1">{term}</span>
                          <button
                            type="button"
                            onClick={() => toggleIgnoreMissingKeyword(term)}
                            className="flex items-center justify-center bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-600 dark:hover:bg-red-500/20"
                            title="Remove this keyword from ATS scoring"
                          >
                            −
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-black/90 dark:text-slate-100/90">Coverage looks solid.</span>
                    )}
                  </div>
                  {ignoredMissingKeywords.length ? (
                    <div className="mt-3">
                      <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-700 dark:text-sky-700">Removed From Scoring ({ignoredMissingKeywords.length})</div>
                      <div className="flex flex-wrap gap-2">
                        {ignoredMissingKeywords.map((term) => (
                          <button
                            key={`ignored-${term}`}
                            type="button"
                            onClick={() => toggleIgnoreMissingKeyword(term)}
                            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-extrabold text-sky-800 hover:bg-sky-100"
                            title="Add this keyword back into ATS scoring"
                          >
                            <span>{term}</span>
                            <span aria-hidden>+</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-xs text-black/90 dark:border-white/10 dark:bg-black/10 dark:text-slate-100/90">
                ATS keyword details are hidden for now. Click <span className="font-extrabold">Show ATS Keywords</span> to review matched, missing, and removed terms.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ✅ BULLETS PANEL */}
      {analysis && liveBulletRows.length ? (
        <section id="bullets-panel" className="col-span-full mt-4 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">Bullets</h2>

            {isSetupMode ? (
              <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-extrabold text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
                Setup mode uses manual bullet editing only. AI rewrites unlock during job tailoring.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectAll(liveBulletRows.length)}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                >
                  Select all
                </button>

                <button
                  type="button"
                  onClick={selectNone}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                >
                  Select none
                </button>

                <button
                  type="button"
                  onClick={handleRewriteSelected}
                  disabled={!analysis || loadingBatchRewrite || selectedCount === 0}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    selectedCount === 0
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-70"
                      : "bg-emerald-300 text-black hover:bg-gray-800 active:scale-95 shadow-md"
                  }`}
                >
                  {loadingBatchRewrite
                    ? "Rewriting…"
                    : `Rewrite Selected (${selectedCount}) (${CREDIT_COSTS.rewriteBullet} credit ea)`}
                </button>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                  <input
                    type="checkbox"
                    checked={showRewriteScorecard}
                    onChange={(e) => setShowRewriteScorecard(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show scorecard
                </label>

                <div className="text-xs text-black/90 dark:text-slate-100/90">
                  Selecting a bullet includes it in batch rewrite. Preview and editor use the same live bullet text.
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 grid gap-3">
            {liveBulletRows.map((row, i) => {
              const original = row.originalText || row.text;
              const rewritten = row.rewrittenBullet;
              const assigned = row.sectionId;
              const selected = selectedBulletIdx.has(i);
              const truthRisk = row.truthRisk;
              const scorecard = rewritten
                ? buildRewriteScorecard({
                    original,
                    rewritten,
                    keywordHits: row.keywordHits,
                    suggestedKeywords: row.suggestedKeywords,
                    needsMoreInfo: row.needsMoreInfo,
                  })
                : null;

              return (
                <div
                  key={i}
                  id={`rewrite-bullet-${row.sectionId}:${row.bulletIndex}`}
                  className={[
                    "rounded-2xl border border-black/10 bg-white p-3 transition-all duration-300 dark:border-white/10 dark:bg-black/20",
                    highlightedNavTarget === `rewrite:${row.sectionId}:${row.bulletIndex}`
                      ? "ring-2 ring-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2">
                      {!isSetupMode ? (
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelected(i)}
                          className="h-4 w-4"
                        />
                      ) : null}
                      <span className="text-sm font-extrabold">Bullet {i + 1}</span>
                      {rewritten ? <Chip text="Has rewrite" /> : <Chip text="Original" muted />}
                    </label>

                    {!isSetupMode ? (
                      <select
                        value={assigned}
                        onChange={(e) => {
                          if (row.planIndex === null) return;
                          setAssignments((prev) => ({
                            ...prev,
                            [row.planIndex as number]: { sectionId: e.target.value },
                          }));
                        }}
                        disabled={row.planIndex === null}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold outline-none disabled:opacity-60 dark:border-white/10 dark:bg-black/30 dark:text-slate-100"
                      >
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {getSectionDisplayHeader(s)}
                          </option>
                        ))}
                      </select>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      {!isSetupMode && rewritten ? (
                        <button
                          type="button"
                          onClick={() => handleUndoRewrite(i)}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                        >
                          Restore Original
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => goToEditorBullet(row.sectionId, row.bulletIndex)}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                      >
                        Go To Bullet
                      </button>

                      <button
                        type="button"
                        onClick={() => editSectionHeader(row.sectionId)}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                      >
                        Edit Header
                      </button>

                      {!isSetupMode ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleRewriteBullet(i)}
                            disabled={loadingRewriteIndex !== null && loadingRewriteIndex !== i}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-50"
                          >
                            {loadingRewriteIndex === i ? "Rewriting…" : `Rewrite (${CREDIT_COSTS.rewriteBullet})`}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRewriteBullet(i, { safer: true })}
                            disabled={loadingRewriteIndex !== null && loadingRewriteIndex !== i}
                            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                          >
                            Safer Rewrite
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2">
                    <div className="text-xs font-extrabold text-black/90 dark:text-slate-100/90">Original</div>
                    <div className="whitespace-pre-wrap text-sm">{original}</div>

                    {rewritten ? (
                      <>
                        <div className="mt-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-700">
                          Rewritten {selected ? "(APPLIED)" : "(not applied)"}
                        </div>


                        {showRewriteScorecard && scorecard ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-400/20 dark:bg-emerald-700/10">
                            <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-700">
                              AI Improvement Scorecard
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                              <div className="rounded-lg bg-white/80 p-2 dark:bg-black/10">
                                <div className="font-extrabold text-black/90 dark:text-slate-100/90">Score</div>
                                <div className="mt-1 text-sm font-black text-emerald-700 dark:text-emerald-700">
                                  {scorecard.total}/100
                                </div>
                              </div>
                              <div className="rounded-lg bg-white/80 p-2 dark:bg-black/10">
                                <div className="font-extrabold text-black/90 dark:text-slate-100/90">Confidence</div>
                                <div className="mt-1 text-sm font-black text-black/90 dark:text-slate-100/90">
                                  {scorecard.confidence}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="text-xs font-extrabold text-black/80 dark:text-slate-200/80">
                          What changed
                        </div>
                        <RewriteDiff original={original} rewritten={rewritten} />
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="mb-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
              Edit resume bullets (live preview)
            </div>
            <div className="mb-3 text-xs text-black/90 dark:text-slate-100/90">
              Drag bullets to reorder them, edit text inline, or add and remove bullets per section.
            </div>

            <div className="grid gap-3">
              {sections.map((s) => {
                const sectionBullets = editorBulletsBySection[s.id] || [];
                const isCollapsed = collapsedSections[s.id] ?? true;

                return (
                  <div key={s.id} className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                    <div className="flex w-full items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggleSectionCollapsed(s.id)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-lg font-black text-black dark:text-slate-100">
                        {getSectionDisplayHeader(s)} {s.dates ? `| ${s.dates}` : ""}
                      </div>
                      <div className="text-sm text-black/90 dark:text-slate-100/90">
                        {(editorBulletsBySection[s.id] || []).length} bullets
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-extrabold text-black/90 dark:text-slate-100/90">
                      {collapsedSections[s.id] ? "Expand" : "Collapse"}
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addEditorBullet(s.id)}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                    >
                      + Add bullet
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteEditorSection(s.id)}
                      className="px-1 py-2 text-xs font-extrabold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete Section
                    </button>
                  </div>
                </div>

                    {!isCollapsed ? (
                      <div className="mt-3 grid gap-3">
                        {sectionBullets.length ? (
                          sectionBullets.map((b, i) => (
                            <div
                              key={`${s.id}-${i}`}
                              ref={(node) => {
                                editorBulletRefs.current[`${s.id}:${i}`] = node;
                              }}
                              draggable
                              onDragStart={() => setDragState({ sectionId: s.id, index: i })}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (!dragState || dragState.sectionId !== s.id) return;
                                moveEditorBullet(s.id, dragState.index, i);
                                setDragState(null);
                              }}
                              onDragEnd={() => setDragState(null)}
                              className={[
                                "rounded-xl border border-black/10 bg-white/80 p-3 transition-all duration-300 dark:border-white/10 dark:bg-black/20",
                                highlightedNavTarget === `editor:${s.id}:${i}`
                                  ? "ring-2 ring-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]"
                                  : "",
                              ].join(" ")}
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-slate-100/90">
                                  <span className="cursor-grab select-none">⋮⋮</span>
                                  <span>Bullet {i + 1}</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => goToRewrite(s.id, i)}
                                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                                  >
                                    Go To Rewrite
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => commitEditorBulletUpdate(s.id, i)}
                                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100"
                                  >
                                    Update
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteEditorBullet(s.id, i)}
                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>

                              <textarea
                                value={b}
                                onChange={(e) => updateEditorBullet(s.id, i, e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-black/10 bg-white p-2.5 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-slate-100 dark:focus:border-white/20"
                              />
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-sm text-black/90 dark:border-white/10 dark:bg-black/10 dark:text-slate-100/90">
                            No bullets in this section yet.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
      </div>
    </main>
  );
}
 