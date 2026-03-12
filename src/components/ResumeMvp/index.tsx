"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { buildRewriteBulletPayload } from "@/lib/rewritePayload";
import { upload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import { useSession } from "next-auth/react";

/** ---------------- Types ---------------- */

type VerbStrength = {
  score: number;
  label: "Weak" | "OK" | "Strong";
  detectedVerb?: string;
  suggestion?: string;
  baseScore?: number;
  rewriteBonusApplied?: number;
};

type RewritePlanItem = {
  originalBullet?: any;
  suggestedKeywords?: any;
  rewrittenBullet?: any;

  needsMoreInfo?: boolean;
  notes?: string[];
  keywordHits?: string[];
  blockedKeywords?: string[];

  verbStrength?: VerbStrength; // BEFORE (from analyze)
  jobId?: string; // server-provided mapping
};

type ResumeTemplateId =
  | "modern"
  | "classic"
  | "minimal"
  | "executive"
  | "compact"
  | "sidebar"
  | "serif"
  | "ats"
  | "arcade"
  | "neon"
  | "terminal"
  | "blueprint"
  | "monochrome"
  | "noir"
  | "paper"
  | "ink"
  | "corporate"
  | "contrast"
  | "minimalist"
  | "grid"
  | "retro"
  | "pastel"
  | "aura"
  | "lavender"
  | "sunset"
  | "forest"
  | "ocean"
  | "sand"
  | "royal"
  | "gold"
  | "bubblegum"
  | "limepop"
  | "citrus"
  | "electric"
  | "confetti"
  | "rainbow"
  | "sunny"
  | "watermelon"
  | "grape"
  | "tropical"
  | "mint"
  | "sky"
  | "coral"
  | "flamingo"
  | "popart"
  | "arcade2"
  | "hologram"
  | "galaxy"
  | "synthwave"
  | "lava"
  | "lemonade"
  | "cottoncandy"
  | "sprinkles"
  | "comic"
  | "playground";

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

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  matchScore?: number;
  missingKeywords?: string[];
  bullets?: any[];
  rewritePlan?: RewritePlanItem[];
  debug?: any;

  metaBlocks?: {
    gamesShipped?: string[];
    metrics?: string[];
  };

  experienceJobs?: ExperienceJobFromApi[];
  bulletJobIds?: string[];
};

/** ---------------- Credits cost labels ---------------- */
/**
 * NOTE: These are UI labels only.
 * Keep them aligned with server charging (api routes / lib/credits).
 */
const CREDIT_COSTS = {
  analyze: 3, // matches /api/analyze COST_ANALYZE
  rewriteBullet: 1, // set to whatever /api/rewrite-bullet charges
} as const;

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

function bulletToText(b: any): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object") {
    const v = b.text ?? b.value ?? b.bullet ?? b.originalBullet ?? b.content;
    if (typeof v === "string") return v;
    return String(v ?? "");
  }
  return String(b ?? "");
}

function planItemToText(item: any): string {
  if (!item) return "";
  const raw = item.originalBullet ?? item.bullet ?? item.original ?? item.text ?? item;
  return bulletToText(raw).trim();
}

function keywordsToArray(k: any): string[] {
  if (Array.isArray(k)) return k.map((x) => String(x).trim()).filter(Boolean);
  if (typeof k === "string")
    return k
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (k && typeof k === "object" && Array.isArray((k as any).keywords)) {
    return (k as any).keywords.map((x: any) => String(x).trim()).filter(Boolean);
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
          ? "border-black/10 bg-black/5 text-black/60 dark:border-white/10 dark:bg-white/5 dark:text-black/90"
          : "border-black/10 bg-black/10 text-black/80 dark:border-white/10 dark:bg-white/10 dark:text-black/90",
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


function HtmlDocPreview({ html, footer }: { html: string; footer?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-black/80 dark:text-black/85">Document Preview (HTML)</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-black/20">
        <iframe
          title="resume-preview"
          className="h-[820px] w-full border-0"
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

function templateStylesResume(template: ResumeTemplateId) {
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
function templateStyles(template: ResumeTemplateId) {
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

  if (template === "modern") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.72)",
      line: "rgba(15,23,42,.14)",
      accent: "#2563eb",
      accent2: "#10b981",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(37,99,235,.06)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "minimal") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.14)",
      accent: "#111827",
      accent2: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(17,24,39,.04)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 14,
      shadow: "0 14px 40px rgba(2,6,23,.06)",
      borderStyle: "solid",
    });
  }

  if (template === "executive") {
    return mkThemeCss({
      font: "serif",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.16)",
      accent: "#7c3aed",
      accent2: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(124,58,237,.06)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 18,
      shadow: "0 22px 60px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

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

  if (template === "serif") {
    return mkThemeCss({
      font: "serif",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.16)",
      accent: "#0f172a",
      accent2: "#0f172a",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(15,23,42,.04)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 18px 48px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "ats") {
    return `
${classicCss}
.page{ border: none; }
.top{ border-bottom: 1px solid #111; }
.chip{ border: none; background: transparent; box-shadow: none; padding: 0; }
.meta, .box{ border: none; padding: 0; background: transparent; }
.h{ color: #111; letter-spacing: 0; }
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
  .jobmetaRight{ white-space: normal; }
}
`.trim();
  }

  if (template === "arcade") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.74)",
      line: "rgba(11,18,32,.18)",
      accent: "#a855f7",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(168,85,247,.10), rgba(34,197,94,.08))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 18,
      shadow: "0 22px 60px rgba(2,6,23,.10)",
      borderStyle: "dashed",
      headerAfterGrid: true,
    });
  }

  if (template === "neon") {
    return mkThemeCss({
      font: "sans",
      ink: "#e5e7eb",
      muted: "rgba(229,231,235,.78)",
      line: "rgba(229,231,235,.18)",
      accent: "#22d3ee",
      accent2: "#f472b6",
      bodyBg: "#05060a",
      pageBg: "#05060a",
      headerBg: "linear-gradient(135deg, rgba(34,211,238,.10), rgba(244,114,182,.10))",
      cardBg: "rgba(255,255,255,.06)",
      radius: 18,
      shadow: "0 22px 60px rgba(0,0,0,.40)",
      borderStyle: "solid",
    });
  }

  if (template === "terminal") {
    return mkThemeCss({
      font: "mono",
      ink: "#d1fae5",
      muted: "rgba(209,250,229,.76)",
      line: "rgba(209,250,229,.18)",
      accent: "#34d399",
      accent2: "#22c55e",
      bodyBg: "#06120b",
      pageBg: "#06120b",
      headerBg: "rgba(52,211,153,.07)",
      cardBg: "rgba(255,255,255,.04)",
      radius: 14,
      shadow: "0 22px 60px rgba(0,0,0,.20)",
      borderStyle: "solid",
    });
  }

  if (template === "blueprint") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.72)",
      line: "rgba(11,18,32,.16)",
      accent: "#2563eb",
      accent2: "#0ea5e9",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg:
        "repeating-linear-gradient(45deg, rgba(37,99,235,.05), rgba(37,99,235,.05) 8px, rgba(14,165,233,.04) 8px, rgba(14,165,233,.04) 16px)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 20px 55px rgba(2,6,23,.08)",
      borderStyle: "dashed",
    });
  }

  if (template === "monochrome") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.18)",
      accent: "#111827",
      accent2: "#374151",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(17,24,39,.04)",
      cardBg: "rgba(255,255,255,.94)",
      radius: 18,
      shadow: "0 18px 48px rgba(2,6,23,.08)",
    });
  }

  if (template === "noir") {
    return mkThemeCss({
      font: "serif",
      ink: "#f9fafb",
      muted: "rgba(249,250,251,.76)",
      line: "rgba(249,250,251,.16)",
      accent: "#fbbf24",
      accent2: "#f472b6",
      bodyBg: "#0a0a0b",
      pageBg: "#0a0a0b",
      headerBg: "linear-gradient(135deg, rgba(251,191,36,.10), rgba(244,114,182,.08))",
      cardBg: "rgba(255,255,255,.06)",
      radius: 18,
      shadow: "0 22px 60px rgba(0,0,0,.45)",
    });
  }

  if (template === "paper") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f2937",
      muted: "rgba(31,41,55,.70)",
      line: "rgba(31,41,55,.16)",
      accent: "#b45309",
      accent2: "#92400e",
      bodyBg: "#fff7ed",
      pageBg: "#fff7ed",
      headerBg: "rgba(180,83,9,.06)",
      cardBg: "rgba(255,255,255,.85)",
      radius: 18,
      shadow: "0 18px 50px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

  if (template === "ink") {
    return mkThemeCss({
      font: "serif",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.72)",
      line: "rgba(15,23,42,.20)",
      accent: "#0f172a",
      accent2: "#0f172a",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(15,23,42,.03)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 18,
      shadow: "0 12px 36px rgba(2,6,23,.06)",
      borderStyle: "dashed",
    });
  }

  if (template === "corporate") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.72)",
      line: "rgba(15,23,42,.16)",
      accent: "#0ea5e9",
      accent2: "#2563eb",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(14,165,233,.06)",
      cardBg: "rgba(255,255,255,.94)",
      radius: 16,
      shadow: "0 18px 48px rgba(2,6,23,.08)",
    });
  }

  if (template === "contrast") {
    return mkThemeCss({
      font: "sans",
      ink: "#000000",
      muted: "rgba(0,0,0,.72)",
      line: "rgba(0,0,0,.22)",
      accent: "#000000",
      accent2: "#111827",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(0,0,0,.04)",
      cardBg: "rgba(255,255,255,.96)",
      radius: 14,
      shadow: "0 10px 28px rgba(2,6,23,.08)",
    });
  }

  if (template === "minimalist") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.12)",
      accent: "#22c55e",
      accent2: "#16a34a",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "rgba(34,197,94,.06)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 22,
      shadow: "0 16px 44px rgba(2,6,23,.06)",
    });
  }

  if (template === "grid") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.72)",
      line: "rgba(37,99,235,.20)",
      accent: "#2563eb",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg:
        "linear-gradient(135deg, rgba(37,99,235,.07), rgba(34,197,94,.05)), repeating-linear-gradient(0deg, rgba(37,99,235,.06), rgba(37,99,235,.06) 1px, transparent 1px, transparent 16px), repeating-linear-gradient(90deg, rgba(37,99,235,.06), rgba(37,99,235,.06) 1px, transparent 1px, transparent 16px)",
      cardBg: "rgba(255,255,255,.92)",
      radius: 16,
      shadow: "0 18px 52px rgba(2,6,23,.08)",
      borderStyle: "dashed",
    });
  }

  if (template === "retro") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "rgba(31,41,55,.72)",
      line: "rgba(31,41,55,.16)",
      accent: "#f97316",
      accent2: "#f59e0b",
      bodyBg: "#fff7ed",
      pageBg: "#fff7ed",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.10), rgba(245,158,11,.10))",
      cardBg: "rgba(255,255,255,.86)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }

  if (template === "pastel") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.12)",
      accent: "#a78bfa",
      accent2: "#34d399",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.14), rgba(52,211,153,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "aura") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#10b981",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(16,185,129,.14), rgba(34,197,94,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
      borderStyle: "solid",
    });
  }

  if (template === "lavender") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "rgba(15,23,42,.70)",
      line: "rgba(15,23,42,.14)",
      accent: "#a78bfa",
      accent2: "#7c3aed",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.16), rgba(124,58,237,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "sunset") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "rgba(17,24,39,.70)",
      line: "rgba(17,24,39,.14)",
      accent: "#fb7185",
      accent2: "#f59e0b",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.14), rgba(245,158,11,.12))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "forest") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#16a34a",
      accent2: "#22c55e",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(22,163,74,.14), rgba(34,197,94,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "ocean") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#0ea5e9",
      accent2: "#2563eb",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(14,165,233,.14), rgba(37,99,235,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "sand") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f2937",
      muted: "rgba(31,41,55,.70)",
      line: "rgba(31,41,55,.16)",
      accent: "#d97706",
      accent2: "#b45309",
      bodyBg: "#fffbeb",
      pageBg: "#fffbeb",
      headerBg: "linear-gradient(135deg, rgba(217,119,6,.12), rgba(180,83,9,.08))",
      cardBg: "rgba(255,255,255,.86)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.10)",
    });
  }

  if (template === "royal") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1220",
      muted: "rgba(11,18,32,.70)",
      line: "rgba(11,18,32,.14)",
      accent: "#2563eb",
      accent2: "#7c3aed",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(37,99,235,.14), rgba(124,58,237,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 18px 50px rgba(2,6,23,.08)",
    });
  }

  if (template === "gold") {
    return mkThemeCss({
      font: "serif",
      ink: "#111827",
      muted: "rgba(17,24,39,.72)",
      line: "rgba(17,24,39,.16)",
      accent: "#f59e0b",
      accent2: "#fbbf24",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(245,158,11,.12), rgba(251,191,36,.10))",
      cardBg: "rgba(255,255,255,.92)",
      radius: 20,
      shadow: "0 22px 60px rgba(2,6,23,.10)",
      borderStyle: "solid",
    });
  }
  // ---------- FUN / BRIGHT THEMES (NEW x25) ----------
  if (template === "bubblegum") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd1dc",
      accent: "#ff3ea5",
      accent2: "#8b5cf6",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(255,62,165,.18), rgba(255,255,255,0)), #fff5fb",
      pageBg: "#fff5fb",
      headerBg: "linear-gradient(135deg, rgba(255,62,165,.20), rgba(139,92,246,.12))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "limepop") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1f17",
      muted: "#255c45",
      line: "#c9f7d6",
      accent: "#22c55e",
      accent2: "#84cc16",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(34,197,94,.18), rgba(255,255,255,0)), #f3fff7",
      pageBg: "#f3fff7",
      headerBg: "linear-gradient(135deg, rgba(34,197,94,.18), rgba(132,204,22,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(11,31,23,.10)",
      hasChips: true,
    });
  }

  if (template === "citrus") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1b12",
      muted: "#6b3f2a",
      line: "#ffe4c7",
      accent: "#f97316",
      accent2: "#f59e0b",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(249,115,22,.18), rgba(255,255,255,0)), #fff8ed",
      pageBg: "#fff8ed",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.20), rgba(245,158,11,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,27,18,.10)",
      hasChips: true,
    });
  }

  if (template === "electric") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#00e5ff",
      accent2: "#7c3aed",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(0,229,255,.18), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(124,58,237,.12), rgba(255,255,255,0)), #f7fbff",
      pageBg: "#eef7ff",
      headerBg: "linear-gradient(135deg, rgba(0,229,255,.18), rgba(124,58,237,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.10)",
      hasChips: true,
    });
  }

  if (template === "confetti") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#4b5563",
      line: "#e5e7eb",
      accent: "#fb7185",
      accent2: "#60a5fa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(96,165,250,.14), rgba(255,255,255,0)), #fff7fb",
      pageBg: "#fff7fb",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(96,165,250,.12))",
      cardBg: "#ffffff",
      radius: 22,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }

  if (template === "rainbow") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#475569",
      line: "#e5e7eb",
      accent: "#ef4444",
      accent2: "#3b82f6",
      bodyBg:
        "radial-gradient(900px 520px at 15% 10%, rgba(239,68,68,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 50% 20%, rgba(34,197,94,.12), rgba(255,255,255,0)), radial-gradient(900px 520px at 85% 10%, rgba(59,130,246,.14), rgba(255,255,255,0)), #ffffff",
      pageBg: "#ffffff",
      headerBg:
        "linear-gradient(135deg, rgba(239,68,68,.16), rgba(245,158,11,.12), rgba(34,197,94,.10), rgba(59,130,246,.14), rgba(124,58,237,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }

  if (template === "sunny") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#fff2b3",
      accent: "#facc15",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(250,204,21,.18), rgba(255,255,255,0)), #fffdf0",
      pageBg: "#fffdf0",
      headerBg: "linear-gradient(135deg, rgba(250,204,21,.18), rgba(249,115,22,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "watermelon") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd3d8",
      accent: "#fb7185",
      accent2: "#22c55e",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(34,197,94,.10), rgba(255,255,255,0)), #fff6f7",
      pageBg: "#fff6f7",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(34,197,94,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "grape") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f1b2e",
      muted: "#5b4f78",
      line: "#e8defa",
      accent: "#7c3aed",
      accent2: "#a78bfa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), #fbf8ff",
      pageBg: "#fbf8ff",
      headerBg: "linear-gradient(135deg, rgba(124,58,237,.18), rgba(167,139,250,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 48px rgba(31,27,46,.10)",
      hasChips: true,
    });
  }

  if (template === "tropical") {
    return mkThemeCss({
      font: "sans",
      ink: "#061a2a",
      muted: "#21506f",
      line: "#cfe7ff",
      accent: "#06b6d4",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(6,182,212,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(251,113,133,.12), rgba(255,255,255,0)), #f4fbff",
      pageBg: "#f4fbff",
      headerBg: "linear-gradient(135deg, rgba(6,182,212,.16), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(6,26,42,.10)",
      hasChips: true,
    });
  }

  if (template === "mint") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1324",
      muted: "#44546a",
      line: "#c6f6e6",
      accent: "#14b8a6",
      accent2: "#22c55e",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(20,184,166,.16), rgba(255,255,255,0)), #f0fffb",
      pageBg: "#f0fffb",
      headerBg: "linear-gradient(135deg, rgba(20,184,166,.18), rgba(34,197,94,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 45px rgba(11,19,36,.10)",
      hasChips: true,
    });
  }

  if (template === "sky") {
    return mkThemeCss({
      font: "sans",
      ink: "#061a2a",
      muted: "#21506f",
      line: "#cfe7ff",
      accent: "#3b82f6",
      accent2: "#0ea5e9",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(59,130,246,.16), rgba(255,255,255,0)), #f4fbff",
      pageBg: "#f4fbff",
      headerBg: "linear-gradient(135deg, rgba(59,130,246,.16), rgba(14,165,233,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(6,26,42,.10)",
      hasChips: true,
    });
  }

  if (template === "coral") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1b12",
      muted: "#6b3f2a",
      line: "#ffe4d6",
      accent: "#fb7185",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), #fff7f5",
      pageBg: "#fff7f5",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(249,115,22,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,27,18,.10)",
      hasChips: true,
    });
  }

  if (template === "flamingo") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd3ea",
      accent: "#ec4899",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(236,72,153,.18), rgba(255,255,255,0)), #fff5fb",
      pageBg: "#fff5fb",
      headerBg: "linear-gradient(135deg, rgba(236,72,153,.18), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "popart") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#111827",
      line: "#0b0f18",
      accent: "#f97316",
      accent2: "#3b82f6",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(249,115,22,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(59,130,246,.12), rgba(255,255,255,0)), #ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.16), rgba(59,130,246,.12))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 10,
      shadow: "0 12px 30px rgba(0,0,0,.08)",
      hasChips: true,
    });
  }

  if (template === "arcade2") {
    return mkThemeCss({
      font: "sans",
      ink: "#120a2a",
      muted: "#3b2a66",
      line: "#e7d7ff",
      accent: "#7c3aed",
      accent2: "#06b6d4",
      bodyBg:
        "radial-gradient(1200px 600px at 10% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), radial-gradient(1000px 600px at 90% 20%, rgba(6,182,212,.12), rgba(255,255,255,0)), #fbf7ff",
      pageBg: "#fbf7ff",
      headerBg: "linear-gradient(135deg, rgba(124,58,237,.18), rgba(6,182,212,.12))",
      cardBg: "linear-gradient(180deg, rgba(124,58,237,.05), rgba(255,255,255,0))",
      radius: 20,
      shadow: "0 16px 45px rgba(18,10,42,.12)",
      headerAfterGrid: true,
      hasChips: true,
    });
  }

  if (template === "hologram") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#22d3ee",
      accent2: "#a78bfa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(34,211,238,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(167,139,250,.14), rgba(255,255,255,0)), #f7fbff",
      pageBg: "#f2f6ff",
      headerBg: "linear-gradient(135deg, rgba(34,211,238,.16), rgba(167,139,250,.12))",
      cardBg: "rgba(255,255,255,.92)",
      borderStyle: "solid",
      radius: 22,
      shadow: "0 22px 70px rgba(11,16,32,.10)",
      hasChips: true,
    });
  }

  if (template === "galaxy") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dbeafe",
      accent: "#a78bfa",
      accent2: "#22d3ee",
      bodyBg:
        "radial-gradient(900px 520px at 25% 10%, rgba(167,139,250,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(34,211,238,.12), rgba(255,255,255,0)), #f7f9ff",
      pageBg: "#f4f4ff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.18), rgba(34,211,238,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.12)",
      hasChips: true,
    });
  }

  if (template === "synthwave") {
    return mkThemeCss({
      font: "sans",
      ink: "#140a2a",
      muted: "#3b2a66",
      line: "#f5d0fe",
      accent: "#ff00e5",
      accent2: "#00e5ff",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(255,0,229,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(0,229,255,.12), rgba(255,255,255,0)), #fff5ff",
      pageBg: "#fff5ff",
      headerBg: "linear-gradient(135deg, rgba(255,0,229,.18), rgba(0,229,255,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(20,10,42,.12)",
      hasChips: true,
    });
  }

  if (template === "lava") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b120f",
      muted: "#6b2a24",
      line: "#ffd1c7",
      accent: "#ef4444",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(239,68,68,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(249,115,22,.12), rgba(255,255,255,0)), #fff6f5",
      pageBg: "#fff6f5",
      headerBg: "linear-gradient(135deg, rgba(239,68,68,.16), rgba(249,115,22,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,18,15,.10)",
      hasChips: true,
    });
  }

  if (template === "lemonade") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#fff2b3",
      accent: "#facc15",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(250,204,21,.18), rgba(255,255,255,0)), #fffdf0",
      pageBg: "#fffdf0",
      headerBg: "linear-gradient(135deg, rgba(250,204,21,.18), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "cottoncandy") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#ffd7f5",
      accent: "#a78bfa",
      accent2: "#fb7185",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(167,139,250,.18), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(251,113,133,.14), rgba(255,255,255,0)), #fff7fd",
      pageBg: "#fff7fd",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.18), rgba(251,113,133,.10))",
      cardBg: "#ffffff",
      radius: 22,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "sprinkles") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#4b5563",
      line: "#e5e7eb",
      accent: "#60a5fa",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 15% 10%, rgba(96,165,250,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 50% 15%, rgba(34,197,94,.12), rgba(255,255,255,0)), radial-gradient(900px 520px at 85% 10%, rgba(249,115,22,.14), rgba(255,255,255,0)), #fff",
      pageBg: "#ffffff",
      headerBg:
        "linear-gradient(135deg, rgba(96,165,250,.16), rgba(34,197,94,.12), rgba(249,115,22,.12))",
      cardBg: "#ffffff",
      radius: 22,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }

  if (template === "comic") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#111827",
      line: "#0b0f18",
      accent: "#facc15",
      accent2: "#3b82f6",
      bodyBg: "#ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(250,204,21,.20), rgba(59,130,246,.12))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 10,
      shadow: "0 12px 30px rgba(0,0,0,.10)",
      hasChips: true,
    });
  }

  if (template === "playground") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#475569",
      line: "#e5e7eb",
      accent: "#3b82f6",
      accent2: "#ef4444",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(59,130,246,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(239,68,68,.12), rgba(255,255,255,0)), #ffffff",
      pageBg: "#ffffff",
      headerBg: "linear-gradient(135deg, rgba(59,130,246,.16), rgba(239,68,68,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(17,24,39,.08)",
      hasChips: true,
    });
  }
  if (template === "classic") return classicCss;

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

  const hasBar =
    template === "modern" ||
    template === "arcade" ||
    template === "neon" ||
    template === "blueprint" ||
    template === "monochrome" ||
    template === "noir" ||
    template === "paper" ||
    template === "ink" ||
    template === "corporate" ||
    template === "contrast" ||
    template === "minimalist" ||
    template === "grid" ||
    template === "retro" ||
    template === "pastel" ||
    template === "aura" ||
    template === "lavender" ||
    template === "sunset" ||
    template === "forest" ||
    template === "ocean" ||
    template === "sand" ||
    template === "royal" ||
    template === "gold" ||
    template === "terminal";

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


  const expertiseHtml =
    showExpertiseOnResume && Array.isArray(expertiseItems) && expertiseItems.length
      ? `
    <div class="section">
      <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Areas of Expertise</div>
      <div class="box">
        <div class="small">${expertiseItems
          .slice(0, 12)
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

  if (template === "sidebar") {
    const sidebarContact = contactBits.map((c) => `<div class="chip">${c}</div>`).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resume - ${safe(profile.fullName || "Updated")}</title>
  <style>
    ${templateStylesResume(template)}
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

  const useChips = template !== "ats" && template !== "terminal";

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

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resume - ${safe(profile.fullName || "Updated")}</title>
  <style>
    ${templateStylesResume(template)}
    ${
      template === "terminal"
        ? `
/* ✅ Terminal contact layout parity (no chips, simple stacked lines) */
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
    <div class="top">
      <div class="top-main">
        <div class="top-copy">
          <h1 class="name">${safe(profile.fullName || "Your Name")}</h1>
          <div class="title">${safe(profile.titleLine || "")}</div>

          <div class="contact">
            ${topContact}
          </div>

          ${inlineSummary}
        </div>

        ${standardPhotoHtml}
      </div>
    </div>

    <div class="content">
      ${summaryBlock}
      ${metaHtml}
      ${expertiseHtml}

      <div class="section">
        <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Experience</div>
        ${jobsHtml || `<div class="summary">No experience sections yet.</div>`}
      </div>
    </div>
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
    /{|\}/,
    /;\s*$/,
    /^\s*\./,
    /^\s*#/,
    /^\s*@/,
    /^\s*[a-z-]+\s*:\s*[^;]+;?/i,
  ];
  return (lines || [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .filter((x) => !bad.some((re) => re.test(x)))
    .slice(0, 24);
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


function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

/** ---------------- Component ---------------- */

const TEMPLATE_OPTIONS: Array<{ id: ResumeTemplateId; label: string }> = [
  { id: "modern", label: "Modern (clean)" },
  { id: "classic", label: "Classic (standard)" },
  { id: "minimal", label: "Minimal (serif-lite)" },
  { id: "executive", label: "Executive (premium)" },
  { id: "compact", label: "Compact (dense)" },
  { id: "sidebar", label: "Sidebar (2-column)" },
  { id: "serif", label: "Serif (traditional)" },
  { id: "ats", label: "ATS (plain)" },
  { id: "arcade", label: "Arcade (fun)" },
  { id: "neon", label: "Neon (cyber)" },
  { id: "terminal", label: "Terminal (dev)" },
  { id: "blueprint", label: "Blueprint (tech)" },
  { id: "monochrome", label: "Monochrome (sleek)" },
  { id: "noir", label: "Noir (moody)" },
  { id: "paper", label: "Paper (warm serif)" },
  { id: "ink", label: "Ink (dashed editorial)" },
  { id: "corporate", label: "Corporate (polished)" },
  { id: "contrast", label: "High Contrast (bold)" },
  { id: "minimalist", label: "Minimalist (soft)" },
  { id: "grid", label: "Grid (blueprint+)" },
  { id: "retro", label: "Retro (sunburst)" },
  { id: "pastel", label: "Pastel (gentle)" },
  { id: "aura", label: "Aura (teal/green)" },
  { id: "lavender", label: "Lavender (calm)" },
  { id: "sunset", label: "Sunset (pink/orange)" },
  { id: "forest", label: "Forest (green)" },
  { id: "ocean", label: "Ocean (blue)" },
  { id: "sand", label: "Sand (golden)" },
  { id: "royal", label: "Royal (blue/purple)" },
  { id: "gold", label: "Gold (premium)" },
  { id: "bubblegum", label: "Bubblegum (pink pop)" },
  { id: "limepop", label: "Lime Pop (bright green)" },
  { id: "citrus", label: "Citrus (orange/lemon)" },
  { id: "electric", label: "Electric (cyan/purple)" },
  { id: "confetti", label: "Confetti (party)" },
  { id: "rainbow", label: "Rainbow (bold)" },
  { id: "sunny", label: "Sunny (yellow)" },
  { id: "watermelon", label: "Watermelon (pink/green)" },
  { id: "grape", label: "Grape (purple)" },
  { id: "tropical", label: "Tropical (teal/coral)" },
  { id: "mint", label: "Mint (fresh)" },
  { id: "sky", label: "Sky (bright blue)" },
  { id: "coral", label: "Coral (warm)" },
  { id: "flamingo", label: "Flamingo (hot pink)" },
  { id: "popart", label: "Pop Art (comic)" },
  { id: "arcade2", label: "Arcade+ (extra fun)" },
  { id: "hologram", label: "Hologram (iridescent)" },
  { id: "galaxy", label: "Galaxy (space neon)" },
  { id: "synthwave", label: "Synthwave (80s)" },
  { id: "lava", label: "Lava (red/orange)" },
  { id: "lemonade", label: "Lemonade (summer)" },
  { id: "cottoncandy", label: "Cotton Candy (pastel pop)" },
  { id: "sprinkles", label: "Sprinkles (cute)" },
  { id: "comic", label: "Comic (ink + color)" },
  { id: "playground", label: "Playground (primary)" },
];

export default function ResumeMvp() {
  const { status } = useSession();

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
  const [jobText, setJobText] = useState("");
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

  // ✅ Selecting bullets = apply rewrite (if rewritten exists)
  const [selectedBulletIdx, setSelectedBulletIdx] = useState<Set<number>>(() => new Set());
  const [loadingBatchRewrite, setLoadingBatchRewrite] = useState(false);
  const [includeMetaInResumeDoc, setIncludeMetaInResumeDoc] = useState(true);
  const [showShippedBlock, setShowShippedBlock] = useState(true);
  const [showMetricsBlock, setShowMetricsBlock] = useState(true);
  const [showExpertiseOnResume, setShowExpertiseOnResume] = useState(true);

  const [resumeTemplate, setResumeTemplate] = useState<ResumeTemplateId>("modern");
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

  const canAnalyze = useMemo(() => {
    const hasResume = !!file || resumeText.trim().length > 0;
    const hasJob = jobText.trim().length > 0;
    return hasResume && hasJob;
  }, [file, resumeText, jobText]);

  const resetDerivedState = useCallback(() => {
    setAnalysis(null);
    setSelectedBulletIdx(new Set());
    setAssignments({});
    setError(null);
    setLoadingRewriteIndex(null);
    setLoadingBatchRewrite(false);
    setSections([{ id: "default", company: "Experience", title: "", dates: "", location: "" }]);
    setResumeBlobUrl("");
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
    } catch (e: any) {
      setError(e?.message || "Could not load profile photo.");
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
    setLoadingAnalyze(true);
    setError(null);
    setAnalysis(null);
    setSelectedBulletIdx(new Set());
    setAssignments({});

    try {
      let res: Response;

      const resumeInput = resumeText.trim();
      const resumePlain = looksLikeHtmlInput(resumeInput) ? htmlToPlainText(resumeInput) : resumeInput;
      const resumeTextForApi = resumePlain ? normalizeResumeTextForParsing(resumePlain) : "";

      if (file) {
        const url = await ensureResumeUploadedToBlob(file);

        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeBlobUrl: url,
            jobText,
            onlyExperienceBullets,
            resumeText: resumeTextForApi || "",
          }),
        });
      } else {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeText: resumeTextForApi || resumePlain,
            jobText,
            onlyExperienceBullets,
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
        const errMsg = typeof payload === "string" ? payload : (payload as any)?.error || "Analyze failed";
        if ((payload as any)?.error === "OUT_OF_CREDITS") {
          const bal = (payload as any)?.balance;
          throw new Error(`Out of credits. Balance: ${bal ?? 0}.`);
        }
        throw new Error(errMsg);
      }

      if (typeof payload === "string") {
        throw new Error("Analyze returned unexpected non-JSON response.");
      }

      const data = payload as AnalyzeResponse;
      setAnalysis(data);

      const rewritePlanLocal = Array.isArray(data?.rewritePlan) ? data.rewritePlan! : [];
      const planLen = rewritePlanLocal.length;

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

      refreshCredits();
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
      refreshCredits();
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function postRewriteWithFallback(body: any) {
    const safeBody = buildRewriteBulletPayload(body);

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

    const res = await fetch("/api/rewrite-bullet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
    });

    const payload = await parseApiResponse(res);

    if (logNetworkDebug) {
      console.log("[rewrite] status:", res.status);
      console.log("[rewrite] payload:", payload);
    }

    return { res, payload };
  }

  async function handleRewriteBullet(index: number) {
    if (!analysis) return;

    const row = liveBulletRows[index];
    if (!row) return;

    const originalBullet = String(row.originalText ?? row.text ?? "").trim();
    const suggestedKeywordsRaw = row.suggestedKeywords;
    const suggestedKeywords = normalizeSuggestedKeywordsForBullet(originalBullet, suggestedKeywordsRaw);

    if (!originalBullet) {
      setError("Missing original bullet for rewrite. Re-run Analyze or confirm bullets extracted.");
      return;
    }

    if (isTrainingLikeBullet(originalBullet)) {
      const rewrittenTraining = defaultTrainingRewrite(originalBullet);
      if (!rewrittenTraining) {
        setError("Training bullet detected, but could not generate a safe rewrite.");
        return;
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
          suggestedKeywords,
        };

        return { ...prev, rewritePlan: nextPlan };
      });

      setEditorBulletsBySection((prev: Record<string, string[]>) => {
        const next = [...(prev[row.sectionId] || [])];
        next[row.bulletIndex] = rewrittenTraining;
        return { ...prev, [row.sectionId]: next };
      });

      refreshCredits();
      return;
    }

    setLoadingRewriteIndex(index);
    setError(null);

    try {
      const rewritePlanLocal = Array.isArray(analysis.rewritePlan) ? analysis.rewritePlan : [];
      const targetProducts = csvToArray(targetProductsCsv);
      const blockedTerms = csvToArray(blockedTermsCsv);
      const jobTextCapped = String(jobText ?? "").slice(0, 6000);

      const norm = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

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

      const otherTexts: string[] = liveBulletRows
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

      const guaranteedAtsKeywords = pickGuaranteedAtsKeywordsForBullet({
        originalBullet,
        suggestedKeywords,
        jobText: jobTextCapped,
        maxGuaranteed: 2,
      });

      const baseRequestBody = {
        originalBullet,
        suggestedKeywords,
        jobText: jobTextCapped,

        constraints: [
          "Do not add responsibilities not present in the original bullet.",
          "Do not add 'daily testing' unless the original bullet explicitly mentions it.",
          "Preserve the original meaning and scope; only improve clarity and impact.",
          "Avoid generic filler; keep it concise and specific.",
          "Do not start with the same opener verb used in other bullets; avoid repeating lead verbs.",
          ...(guaranteedAtsKeywords.length
            ? [
                `When it fits naturally and truthfully, include these exact ATS keywords from the job posting: ${guaranteedAtsKeywords.join(", ")}.`,
                "Do not force every keyword into the bullet. Only include keywords that match the original experience.",
              ]
            : []),
        ],
        mustPreserveMeaning: true,

        avoidPhrases: ["collaborated", "developed", "executed", "created", "documented", "completed"],
        preferVerbVariety: true,

        usedOpeners,
        usedPhrases,

        sourceCompany: sourceCompany.trim(),
        targetCompany: targetCompany.trim(),
        targetProducts,
        blockedTerms,

        role: "",
        tone: "",
      };

      async function runRewriteAttempt(extraConstraints: string[] = []) {
        const requestBody = {
          ...baseRequestBody,
          constraints: [...baseRequestBody.constraints, ...extraConstraints],
        };

        const { res, payload } = await postRewriteWithFallback(requestBody);

        if (isHtmlDoc(payload)) {
          throw new Error(`Rewrite returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`);
        }

        if (!res.ok) {
          const errMsg = typeof payload === "string" ? payload : payload?.error || "Rewrite failed";
          if (payload?.error === "OUT_OF_CREDITS") {
            const bal = payload?.balance;
            throw new Error(`Out of credits. Balance: ${bal ?? 0}.`);
          }
          throw new Error(errMsg);
        }

        if (typeof payload === "string") {
          throw new Error("Rewrite returned unexpected non-JSON response.");
        }

        return payload;
      }

      let payload = await runRewriteAttempt();

      let rewrittenBullet = String(payload?.rewrittenBullet ?? "").trim();
      let needsMoreInfo = !!payload?.needsMoreInfo;
      let notes = Array.isArray(payload?.notes) ? payload.notes : [];
      let keywordHits = Array.isArray(payload?.keywordHits) ? payload.keywordHits : [];
      let blockedKeywords = Array.isArray(payload?.blockedKeywords) ? payload.blockedKeywords : [];

      if (
        shouldForceLowScoreRetry({
          original: originalBullet,
          rewritten: rewrittenBullet,
          keywordHits,
          suggestedKeywords,
          needsMoreInfo,
        })
      ) {
        payload = await runRewriteAttempt([
          "This bullet still needs a more noticeable rewrite. Keep it truthful, but strengthen the opener, tighten the structure, and make the improvement obvious.",
          "Do not return a near-copy of the original. Make a clear wording upgrade while preserving the original facts.",
        ]);

        rewrittenBullet = String(payload?.rewrittenBullet ?? "").trim();
        needsMoreInfo = !!payload?.needsMoreInfo;
        notes = Array.isArray(payload?.notes) ? payload.notes : [];
        keywordHits = Array.isArray(payload?.keywordHits) ? payload.keywordHits : [];
        blockedKeywords = Array.isArray(payload?.blockedKeywords) ? payload.blockedKeywords : [];
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

      if (appendedPlanIndex !== null) {
        setAssignments((prev) => ({
          ...prev,
          [appendedPlanIndex as number]: { sectionId: row.sectionId },
        }));
      }

      refreshCredits();
    } catch (e: any) {
      setError(e?.message || "Rewrite failed");
      refreshCredits();
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
      };

      return { ...prev, rewritePlan: nextPlan };
    });

    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = [...(prev[row.sectionId] || [])];
      next[row.bulletIndex] = row.originalText || next[row.bulletIndex] || "";
      return { ...prev, [row.sectionId]: next };
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

    try {
      for (const i of selected) {
        // eslint-disable-next-line no-await-in-loop
        await handleRewriteBullet(i);
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

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dragState, setDragState] = useState<{ sectionId: string; index: number } | null>(null);
  const editorBulletRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const goToEditorBullet = useCallback((sectionId: string, bulletIndex: number) => {
    const key = `${sectionId}:${bulletIndex}`;
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: false }));

    window.setTimeout(() => {
      const node = editorBulletRefs.current[key];
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        const field = node.querySelector("textarea") as HTMLTextAreaElement | null;
        field?.focus();
      }
    }, 80);
  }, []);

  useEffect(() => {
    setEditorBulletsBySection((prev) => {
      const hasExisting = Object.keys(prev).length > 0;
      if (hasExisting) return prev;

      const seeded: Record<string, string[]> = {};
      Object.entries(bulletsBySection).forEach(([sectionId, bullets]) => {
        seeded[sectionId] = [...bullets].map((x) => String(x ?? ""));
      });
      return seeded;
    });
  }, [bulletsBySection]);

  useEffect(() => {
    setEditorMetaGames(metaGames);
  }, [analysis?.metaBlocks?.gamesShipped]);

  useEffect(() => {
    setEditorMetaMetrics(metaMetrics);
  }, [analysis?.metaBlocks?.metrics]);

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

  function deleteEditorBullet(sectionId: string, index: number) {
    setEditorBulletsBySection((prev: Record<string, string[]>) => {
      const next = [...(prev[sectionId] || [])];
      next.splice(index, 1);
      return { ...prev, [sectionId]: next };
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
        const matched = bucket[bulletIndex];
        const matchedItem = matched?.item;

        rows.push({
          key: `${section.id}:${bulletIndex}`,
          sectionId: section.id,
          sectionLabel,
          bulletIndex,
          text,
          originalText: String(matchedItem?.originalBullet ?? text ?? "").trim(),
          planIndex: typeof matched?.planIndex === "number" ? matched.planIndex : null,
          rewrittenBullet: String(matchedItem?.rewrittenBullet ?? "").trim(),
          suggestedKeywords: keywordsToArray(matchedItem?.suggestedKeywords),
          needsMoreInfo: !!matchedItem?.needsMoreInfo,
          notes: Array.isArray(matchedItem?.notes) ? matchedItem.notes : [],
          keywordHits: Array.isArray(matchedItem?.keywordHits) ? matchedItem.keywordHits : [],
          blockedKeywords: Array.isArray(matchedItem?.blockedKeywords) ? matchedItem.blockedKeywords : [],
        });
      });
    });

    return rows;
  }, [sections, editorBulletsBySection, planBucketsBySection]);

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
    return (resumeHtmlDraft || compiledResumeHtml || "").trim();
  }, [resumeHtmlDraft, compiledResumeHtml]);

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
    } catch (e: any) {
      setError(e?.message || "PDF download failed");
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

  const fileIsPdf = useMemo(() => {
    if (!file) return false;
    const name = String(file.name || "").toLowerCase();
    return name.endsWith(".pdf") || file.type === "application/pdf";
  }, [file]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-black dark:text-black">
      {error ? (
        <div className="mb-4">
          <Callout title="Error" tone="danger">
            <div className="whitespace-pre-wrap text-sm">{error}</div>
          </Callout>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inputs */}
        <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">Inputs</h2>
            <div className="flex items-center gap-2 text-xs text-black/60 dark:text-black/70">
              <span className="rounded-full border border-black/10 px-2 py-0.5 dark:border-white/10">
                {creditsLoading ? "Credits…" : creditsBalance === null ? "Credits: —" : `Credits: ${creditsBalance}`}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <div className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/90 dark:text-black/70">Upload resume file</div>

              <input
                id="resume-upload"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  resetDerivedState();
                }}
                className="block w-full text-sm text-black
                  file:mr-3 file:rounded-lg file:border file:border-emerald-700/40
                  file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-extrabold file:text-black
                  file:shadow-md hover:file:bg-emerald-700 hover:file:shadow-lg
                  dark:text-black dark:file:border-emerald-300/30 dark:file:bg-emerald-500 dark:hover:file:bg-emerald-600"
              />

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

            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/90 dark:text-black/90">Job posting text</div>
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={6}
                placeholder="Post job description/requirements here"
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
              />
            </label>

            {/* Template */}
            <div className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 text-sm font-extrabold text-black/80 dark:text-black/90">Template</div>

              <select
                value={resumeTemplate}
                onChange={(e) => setResumeTemplate(e.target.value as ResumeTemplateId)}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Header details */}
            <div className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 text-sm font-extrabold text-black/80 dark:text-black/70">Header details</div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={profile.fullName}
                  onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
                <input
                  value={profile.titleLine}
                  onChange={(e) => setProfile((p) => ({ ...p, titleLine: e.target.value }))}
                  placeholder="Professional Title (e.g. QA Lead | Game & VR Systems)"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />

                <input
                  value={profile.locationLine}
                  onChange={(e) => setProfile((p) => ({ ...p, locationLine: e.target.value }))}
                  placeholder="Location"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />

                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />

                <input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <input
                  value={profile.linkedin}
                  onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
                  placeholder="LinkedIn"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
                <input
                  value={profile.portfolio}
                  onChange={(e) => setProfile((p) => ({ ...p, portfolio: e.target.value }))}
                  placeholder="Portfolio / Website"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 text-sm font-extrabold text-black/80 dark:text-black/70">Profile photo (Optional)</div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const img = e.target.files?.[0] ?? null;
                        void handleProfilePhotoUpload(img);
                        e.currentTarget.value = "";
                      }}
                      className="block w-full text-sm text-black
                        file:mr-3 file:rounded-lg file:border file:border-emerald-700/40
                        file:bg-emerald-600 file:px-3 file:py-2 file:text-sm file:font-extrabold file:text-black
                        file:shadow-md hover:file:bg-emerald-700 hover:file:shadow-lg
                        dark:text-black dark:file:border-emerald-300/30 dark:file:bg-emerald-500 dark:hover:file:bg-emerald-600"
                    />

                    <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                      <input
                        type="checkbox"
                        checked={showProfilePhoto}
                        onChange={(e) => setShowProfilePhoto(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Show profile photo on resume
                    </label>

                    {profilePhotoDataUrl ? (
                      <button
                        type="button"
                        onClick={clearProfilePhoto}
                        className="w-fit text-sm font-extrabold underline opacity-80 hover:opacity-100"
                      >
                        Remove photo
                      </button>
                    ) : (
                      <div className="text-xs text-black/80 dark:text-black/860">
                        Optional. Best results: square headshot, PNG/JPG/WEBP, under 2MB.
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3">
                    {profilePhotoDataUrl ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={profilePhotoDataUrl}
                          alt="Profile preview"
                          className={[
                            "h-20 w-20 border border-black/10 object-cover",
                            profilePhotoShape === "circle"
                              ? "rounded-full"
                              : profilePhotoShape === "rounded"
                              ? "rounded-2xl"
                              : "rounded-none",
                          ].join(" ")}
                        />
                        <div className="text-xs text-black/70 dark:text-black/70">
                          Preview only. Final size/shape comes from the controls below.
                        </div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs font-extrabold text-black/90 dark:text-black/90">Shape</span>
                        <select
                          value={profilePhotoShape}
                          onChange={(e) => setProfilePhotoShape(e.target.value as "circle" | "rounded" | "square")}
                          className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                        >
                          <option value="circle">Circle</option>
                          <option value="rounded">Rounded</option>
                          <option value="square">Square</option>
                        </select>
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs font-extrabold text-black/90 dark:text-black/90">Size</span>
                        <select
                          value={String(profilePhotoSize)}
                          onChange={(e) => setProfilePhotoSize(Number(e.target.value))}
                          className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                        >
                          <option value="88">Small</option>
                          <option value="112">Medium</option>
                          <option value="136">Large</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <textarea
                  value={profile.summary}
                  onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                  rows={3}
                  placeholder="Summary (optional)"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-black/80 dark:text-black/70">Areas of Expertise (Auto Parsed)</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-black/60 dark:text-black/70">
                      {editorExpertiseItems.filter((x) => String(x ?? "").trim()).length} items
                    </div>
                    <button
                      type="button"
                      onClick={addExpertiseItem}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {editorExpertiseItems.length ? (
                  <div className="flex flex-wrap gap-2">
                    {editorExpertiseItems.map((item, i) => (
                      <div
                        key={`expertise-${i}`}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-black/20"
                      >
                        <input
                          value={item}
                          onChange={(e) => updateExpertiseItem(i, e.target.value)}
                          className="min-w-[120px] max-w-[260px] bg-transparent text-xs font-extrabold text-black outline-none placeholder:text-black/40 dark:text-black"
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
                  <div className="text-xs text-black/60 dark:text-black/70">
                    No expertise detected yet. Add resume text, bullets, or a stronger summary and analyze again.
                  </div>
                )}

                <div className="mt-2 text-xs text-black/60 dark:text-black/70">
                  You can edit these bubbles directly. They are auto-parsed from your uploaded resume, pasted resume text, edited bullets, and summary.
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyExperienceBullets}
                  onChange={(e) => setOnlyExperienceBullets(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-extrabold text-black/90 dark:text-black/90">Only experience bullets</span>
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze || loadingAnalyze}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg"
                >
                  {loadingAnalyze ? "Analyzing…" : `Analyze (${CREDIT_COSTS.analyze} credits)`}
                </button>

                <div className="ml-1 text-xs text-black/60 dark:text-black/60">
                  Costs: Analyze {CREDIT_COSTS.analyze} • Rewrite {CREDIT_COSTS.rewriteBullet} each
                </div>

                <label className="ml-1 flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                  <input
                    type="checkbox"
                    checked={includeMetaInResumeDoc}
                    onChange={(e) => setIncludeMetaInResumeDoc(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Include meta blocks
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                  <input
                    type="checkbox"
                    checked={showExpertiseOnResume}
                    onChange={(e) => setShowExpertiseOnResume(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show Areas of Expertise on resume
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                  <input
                    type="checkbox"
                    checked={showDebugJson}
                    onChange={(e) => setShowDebugJson(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show debug
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                  <input
                    type="checkbox"
                    checked={logNetworkDebug}
                    onChange={(e) => setLogNetworkDebug(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Console logs
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
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black p-3 text-xs text-black/80">
                  {JSON.stringify(analysis, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        </section>

        {/* Preview */}
        <section>
          <HtmlDocPreview
            html={liveResumeHtml}
            footer={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  disabled={!liveResumeHtml}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                >
                  Copy
                </button>

                <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black dark:border-white/10 dark:bg-black/20 dark:text-black">
                  .pdf
                </div>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={!liveResumeHtml}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  Download PDF (5 credits)
                </button>

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  disabled={!liveResumeHtml}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                >
                  Print
                </button>
              </div>
            }
          />

          <div className="mt-3 rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="mb-2 text-xs font-extrabold text-black/80 dark:text-black/80">
              Edit highlight blocks
            </div>
            <div className="mb-3 text-xs text-black/90 dark:text-black/90">
              Update the highlight cards shown in the resume preview. Toggle between Games and Apps for the shipped label.
            </div>

            <div className="grid gap-3">
              <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 text-sm font-extrabold text-black/90 dark:text-black/90">Highlight visibility</div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                    <input
                      type="checkbox"
                      checked={showShippedBlock}
                      onChange={(e) => setShowShippedBlock(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show {shippedLabelMode} Shipped on resume
                  </label>

                  <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                    <input
                      type="checkbox"
                      checked={showMetricsBlock}
                      onChange={(e) => setShowMetricsBlock(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Show Key Metrics on resume
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-black/90 dark:text-black/90">Shipped label</div>
                  <div className="inline-flex rounded-xl border border-black/10 bg-white p-1 dark:border-white/10 dark:bg-black/20">
                    {(["Games", "Apps"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setShippedLabelMode(mode)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                          shippedLabelMode === mode
                            ? "bg-emerald-600 text-black"
                            : "text-black hover:bg-black/5 dark:text-black"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-black/80 dark:text-black/80">
                  Preview title: {shippedLabelMode} Shipped
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-black/90 dark:text-black/90">{shippedLabelMode} Shipped</div>
                  <button
                    type="button"
                    onClick={() => setEditorMetaGames((prev) => [...prev, ""])}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
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
                          className="flex-1 rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
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
                    <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-sm text-black/80 dark:border-white/10 dark:bg-black/10 dark:text-black/80">
                      No shipped items yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-extrabold text-black/90 dark:text-black/90">Key Metrics</div>
                  <button
                    type="button"
                    onClick={() => setEditorMetaMetrics((prev) => [...prev, ""])}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
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
                          className="flex-1 rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
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
                    <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-sm text-black/80 dark:border-white/10 dark:bg-black/10 dark:text-black/80">
                      No key metrics yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>      </div>

      {/* ✅ BULLETS PANEL */}
      {analysis && liveBulletRows.length ? (
        <section className="mt-4 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">Bullets</h2>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => selectAll(liveBulletRows.length)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
              >
                Select all
              </button>

              <button
                type="button"
                onClick={selectNone}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
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

              <label className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                <input
                  type="checkbox"
                  checked={showRewriteScorecard}
                  onChange={(e) => setShowRewriteScorecard(e.target.checked)}
                  className="h-4 w-4"
                />
                Show scorecard
              </label>

              <div className="text-xs text-black/90 dark:text-black/90">
                Selecting a bullet includes it in batch rewrite. Preview and editor use the same live bullet text.
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            {liveBulletRows.map((row, i) => {
              const original = row.originalText || row.text;
              const rewritten = row.rewrittenBullet;
              const assigned = row.sectionId;
              const selected = selectedBulletIdx.has(i);
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
                  className="rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(i)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-extrabold">Bullet {i + 1}</span>
                      {rewritten ? <Chip text="Has rewrite" /> : <Chip text="Original" muted />}
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
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
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold outline-none disabled:opacity-60 dark:border-white/10 dark:bg-black/30 dark:text-black"
                      >
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.company} — {s.title}
                          </option>
                        ))}
                      </select>

                      {rewritten ? (
                        <button
                          type="button"
                          onClick={() => handleUndoRewrite(i)}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                        >
                          Undo Rewrite
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => goToEditorBullet(row.sectionId, row.bulletIndex)}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                      >
                        Go To Bullet
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRewriteBullet(i)}
                        disabled={loadingRewriteIndex !== null && loadingRewriteIndex !== i}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black transition-all duration-200 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-50"
                      >
                        {loadingRewriteIndex === i ? "Rewriting…" : `Rewrite (${CREDIT_COSTS.rewriteBullet})`}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2">
                    <div className="text-xs font-extrabold text-black/90 dark:text-black/90">Original</div>
                    <div className="whitespace-pre-wrap text-sm">{original}</div>

                    {rewritten ? (
                      <>
                        <div className="mt-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                          Rewritten {selected ? "(APPLIED)" : "(not applied)"}
                        </div>

                        {showRewriteScorecard && scorecard ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                            <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                              AI Improvement Scorecard
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                              <div className="rounded-lg bg-white/80 p-2 dark:bg-black/10">
                                <div className="font-extrabold text-black/90 dark:text-black/90">Score</div>
                                <div className="mt-1 text-sm font-black text-emerald-700 dark:text-emerald-300">
                                  {scorecard.total}/100
                                </div>
                              </div>
                              <div className="rounded-lg bg-white/80 p-2 dark:bg-black/10">
                                <div className="font-extrabold text-black/90 dark:text-black/90">Confidence</div>
                                <div className="mt-1 text-sm font-black text-black/90 dark:text-black/90">
                                  {scorecard.confidence}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="text-xs font-extrabold text-black/80 dark:text-black/80">
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
            <div className="mb-2 text-xs font-extrabold text-black/90 dark:text-black/90">
              Edit resume bullets (live preview)
            </div>
            <div className="mb-3 text-xs text-black/60 dark:text-black/90">
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
                      <div className="text-lg font-black text-black dark:text-black">
                        {s.title || "Untitled Role"} — {s.company || "Untitled Company"} {s.dates ? `| ${s.dates}` : ""}
                      </div>
                      <div className="text-sm text-black/60 dark:text-black/70">
                        {(editorBulletsBySection[s.id] || []).length} bullets
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-extrabold text-black/90 dark:text-black/90">
                      {collapsedSections[s.id] ? "Expand" : "Collapse"}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditorBulletsBySection((prev: Record<string, string[]>) => ({
                        ...prev,
                        [s.id]: [...(prev[s.id] || []), ""],
                      }));
                      setCollapsedSections((prev) => ({ ...prev, [s.id]: false }));
                    }}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                  >
                    + Add bullet
                  </button>
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
                              className="rounded-xl border border-black/10 bg-white/80 p-3 dark:border-white/10 dark:bg-black/20"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs font-extrabold text-black/90 dark:text-black/90">
                                  <span className="cursor-grab select-none">⋮⋮</span>
                                  <span>Bullet {i + 1}</span>
                                </div>

                                <div className="flex items-center gap-2">
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
                                className="w-full rounded-lg border border-black/10 bg-white p-2 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                              />
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-black/10 bg-white/50 p-3 text-sm text-black/90 dark:border-white/10 dark:bg-black/10 dark:text-black/90">
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
    </main>
  );
}