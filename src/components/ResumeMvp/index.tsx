// src/components/ResumeMvp/index.tsx
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
  | "gold";

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
          ? "border-black/10 bg-black/5 text-black/60 dark:border-white/10 dark:bg-white/5 dark:text-black/60"
          : "border-black/10 bg-black/10 text-black/80 dark:border-white/10 dark:bg-white/10 dark:text-black/80",
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

.meta{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

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

.jobhead{
  display:flex;
  justify-content:space-between;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px var(--borderstyle) var(--line);
  margin-bottom: 8px;
}

.jobtitle{
  font-weight: 800;
}

.jobmeta{
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

ul{
  margin: 0;
  padding-left: 18px;
}

li{
  margin: 0 0 6px 0;
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
}

.jobtitle{ font-weight: 900; }

.jobmeta{
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

ul{ margin: 6px 0 0 18px; padding: 0; }
li{ margin: 6px 0; line-height: 1.35; }

.meta{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

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
.meta{ display:grid; grid-template-columns: 1fr; gap: 10px; }
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
}
.jobtitle{ font-weight: 800; }
.jobmeta{ color: var(--muted); font-size: 12px; white-space: nowrap; }
ul{ margin:0; padding-left: 18px; }
li{ margin: 0 0 6px 0; }
${headerContactChipsCss()}
${printLockCss()}

@media print{
  body{ padding: 0 !important; background: var(--bodybg) !important; }
  .page{ background: var(--pagebg) !important; }
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
  includeMeta: boolean;
}) {
  const { template, profile, sections, bulletsBySection, metaGames, metaMetrics, includeMeta } = args;

  const safe = (s: string) => escapeHtml(s || "");

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

  const metaHtml =
    includeMeta && (metaGames.length || metaMetrics.length)
      ? `
    <div class="section">
      <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Highlights</div>
      <div class="meta">
        ${
          metaGames.length
            ? `<div class="box">
                <div class="boxtitle">Games Shipped</div>
                <div class="small">${metaGames
                  .slice(0, 14)
                  .map((x) => `• ${safe(String(x))}`)
                  .join("<br/>")}</div>
              </div>`
            : `<div></div>`
        }
        ${
          metaMetrics.length
            ? `<div class="box">
                <div class="boxtitle">Key Metrics</div>
                <div class="small">${metaMetrics
                  .slice(0, 14)
                  .map((x) => `• ${safe(String(x))}`)
                  .join("<br/>")}</div>
              </div>`
            : `<div></div>`
        }
      </div>
    </div>`
      : "";

  const jobsHtml = sections
    .map((sec) => {
      const list = bulletsBySection[sec.id] || [];
      if (!list.length) return "";

      const headerLeft = `${safe(sec.company || "Company")} — ${safe(sec.title || "Role")}`;
      const headerRight = [sec.location?.trim() ? safe(sec.location) : "", safe(sec.dates || "")]
        .filter(Boolean)
        .join(" • ");

      return `
        <div class="job">
          <div class="jobhead">
            <div class="jobtitle">${headerLeft}</div>
            <div class="jobmeta">${headerRight}</div>
          </div>
          <ul>
            ${list.map((b) => `<li>${safe(b)}</li>`).join("")}
          </ul>
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
      <div>
        <h1 class="name">${safe(profile.fullName || "Your Name")}</h1>
        <div class="title">${safe(profile.titleLine || "")}</div>

        <div class="contact">
          ${topContact}
        </div>

        ${inlineSummary}
      </div>
    </div>

    <div class="content">
      ${summaryBlock}
      ${metaHtml}

      <div class="section">
        <div class="h">${hasBar ? `<span class="bar"></span>` : ""}Experience</div>
        ${jobsHtml || `<div class="summary">No experience sections yet.</div>`}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function openPreviewWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Popup blocked. Allow popups for this site to use Preview.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
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

  // ✅ Selecting bullets = apply rewrite (if rewritten exists)
  const [selectedBulletIdx, setSelectedBulletIdx] = useState<Set<number>>(() => new Set());
  const [loadingBatchRewrite, setLoadingBatchRewrite] = useState(false);
  const [includeMetaInResumeDoc, setIncludeMetaInResumeDoc] = useState(true);

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
  const [showPreviewEditor, setShowPreviewEditor] = useState(false);
  const [previewHtmlDraft, setPreviewHtmlDraft] = useState("");
  const [previewHtmlOverride, setPreviewHtmlOverride] = useState<string>("");

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
    setShowPreviewEditor(false);
    setPreviewHtmlDraft("");
    setPreviewHtmlOverride("");
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
              dates: String(j.dates || "Dates"),
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

    const bullets = Array.isArray(analysis.bullets) ? analysis.bullets : [];
    const rewritePlanLocal = Array.isArray(analysis.rewritePlan) ? analysis.rewritePlan : [];
    const planItem = rewritePlanLocal[index];

    const originalBullet = (planItemToText(planItem) || bulletToText(bullets[index])).trim();
    const suggestedKeywordsRaw = keywordsToArray(planItem?.suggestedKeywords);
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

      refreshCredits();
      return;
    }

    setLoadingRewriteIndex(index);
    setError(null);

    try {
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

      const otherTexts: string[] = [];
      for (let i = 0; i < rewritePlanLocal.length; i++) {
        if (i === index) continue;

        const it = rewritePlanLocal[i];
        const txt =
          (it?.rewrittenBullet && String(it.rewrittenBullet).trim()) ||
          planItemToText(it) ||
          bulletToText(bullets[i] ?? "").trim();

        if (txt) otherTexts.push(txt);
      }

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

      const requestBody = {
        originalBullet,
        suggestedKeywords,
        jobText: jobTextCapped,

        constraints: [
          "Do not add responsibilities not present in the original bullet.",
          "Do not add 'daily testing' unless the original bullet explicitly mentions it.",
          "Preserve the original meaning and scope; only improve clarity and impact.",
          "Avoid generic filler; keep it concise and specific.",
          "Do not start with the same opener verb used in other bullets; avoid repeating lead verbs.",
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

      const rewrittenBullet = String(payload?.rewrittenBullet ?? "").trim();
      const needsMoreInfo = !!payload?.needsMoreInfo;
      const notes = Array.isArray(payload?.notes) ? payload.notes : [];
      const keywordHits = Array.isArray(payload?.keywordHits) ? payload.keywordHits : [];
      const blockedKeywords = Array.isArray(payload?.blockedKeywords) ? payload.blockedKeywords : [];

      if (!rewrittenBullet) throw new Error("AI returned empty rewrite");

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
          suggestedKeywords,
          rewrittenBullet,
          needsMoreInfo,
          notes,
          keywordHits,
          blockedKeywords,
          verbStrength: payload?.verbStrengthAfter ?? nextPlan[index].verbStrength,
        };

        return { ...prev, rewritePlan: nextPlan };
      });

      refreshCredits();
    } catch (e: any) {
      setError(e?.message || "Rewrite failed");
      refreshCredits();
    } finally {
      setLoadingRewriteIndex(null);
    }
  }

  function handleUndoRewrite(index: number) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const prevPlan = Array.isArray(prev.rewritePlan) ? prev.rewritePlan : [];
      if (!prevPlan.length) return prev;

      const nextPlan = [...prevPlan];
      const cur = nextPlan[index];
      if (!cur) return prev;

      nextPlan[index] = {
        ...cur,
        rewrittenBullet: "",
        needsMoreInfo: false,
      };

      return { ...prev, rewritePlan: nextPlan };
    });

    setSelectedBulletIdx((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }

  async function handleRewriteSelected() {
    if (!analysis) return;

    const plan = Array.isArray(analysis.rewritePlan) ? analysis.rewritePlan : [];
    const bullets = Array.isArray(analysis.bullets) ? analysis.bullets : [];

    const effectiveLen = plan.length || bullets.length;
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
  const metaMetrics = sanitizeMetaLines(
    Array.isArray(analysis?.metaBlocks?.metrics) ? analysis!.metaBlocks!.metrics! : []
  );

  const guardrailTerms = useMemo(() => {
    const terms: string[] = [];
    if (targetCompany.trim()) terms.push(targetCompany.trim());
    terms.push(...csvToArray(targetProductsCsv));
    terms.push(...csvToArray(blockedTermsCsv));
    return terms.filter(Boolean);
  }, [targetCompany, targetProductsCsv, blockedTermsCsv]);

  const selectedCount = selectedBulletIdx.size;

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
      const sectionId = assignments[i]?.sectionId || fallback;
      if (!by[sectionId]) by[sectionId] = [];
      by[sectionId].push(appliedBulletText[i]);
    }

    return by;
  }, [appliedBulletText, assignments, sections]);

  const resumeHtml = useMemo(() => {
    if (!analysis || !effectivePlan.length) return "";
    return buildResumeHtml({
      template: resumeTemplate,
      profile,
      sections,
      bulletsBySection,
      metaGames,
      metaMetrics,
      includeMeta: includeMetaInResumeDoc,
    });
  }, [analysis, effectivePlan.length, resumeTemplate, profile, sections, bulletsBySection, metaGames, metaMetrics, includeMetaInResumeDoc]);

  const effectiveResumeHtml = useMemo(() => {
    return (previewHtmlOverride || resumeHtml || "").trim();
  }, [previewHtmlOverride, resumeHtml]);

  const activeResumeHtml = useMemo(() => {
    if (showPreviewEditor) return (previewHtmlDraft || effectiveResumeHtml || "").trim();
    return (previewHtmlOverride || effectiveResumeHtml || "").trim();
  }, [showPreviewEditor, previewHtmlDraft, previewHtmlOverride, effectiveResumeHtml]);

  async function handleCopyOutput() {
    const html = activeResumeHtml;
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
    const html = activeResumeHtml;
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
    const html = activeResumeHtml;
    if (!html) return;
    openPrintWindow(html);
  }

  function handleViewPreview() {
    const html = activeResumeHtml;
    if (!html) return;
    openPreviewWindow(html);
  }

  const debugInjected = useMemo(() => {
    const hits = effectivePlan
      .map((p) => String(p?.rewrittenBullet ?? ""))
      .flatMap((t) => findInjectedTerms(t, guardrailTerms));
    return Array.from(new Set(hits));
  }, [effectivePlan, guardrailTerms]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-black dark:text-black">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Git-a-Job: Resume Compiler</h1>
        <p className="mt-2 max-w-3xl text-sm text-black/70 dark:text-black/70">
          Analyze → assign bullets → rewrite selected → compile into your chosen template.
        </p>

        {/* Optional: tiny credits badge if you want it here */}
        {status === "authenticated" ? (
          <div className="mt-2 text-xs text-black/60 dark:text-black/70">
            Credits: {creditsLoading ? "…" : creditsBalance ?? "—"}
          </div>
        ) : null}
      </div>

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
              <span className="hidden sm:inline">Theme ready</span>
              <span className="rounded-full border border-black/10 px-2 py-0.5 dark:border-white/10">
                next-themes
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/70 dark:text-black/70">
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  resetDerivedState();
                }}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-black/10 file:bg-black/5 file:px-3 file:py-2 file:text-sm file:font-extrabold hover:file:bg-black/10 dark:file:border-white/10 dark:file:bg-white/10 dark:hover:file:bg-white/15"
              />

              <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Recommended: <strong>.docx</strong> (best parsing). PDFs can cause formatting issues.
              </div>

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
                  {uploadingResume ? (
                    <span className="text-xs text-black/60dark:text-black/70">Uploading…</span>
                  ) : null}
                </div>
              ) : null}
            </label>

            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/70 dark:text-black/70">
                Resume text (paste if not uploading)
              </div>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
              />
              {resumeText.trim() ? (
                <div className="text-xs text-black/60 dark:text-black/60">
                  Tip: If you accidentally paste HTML (from the preview editor), we auto-strip it to plain text on Analyze.
                </div>
              ) : null}
            </label>

            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/70 dark:text-black/70">Job posting text</div>
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
              <div className="mb-2 text-sm font-extrabold text-black/80 dark:text-black/70">Template</div>

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

              <div className="mt-3">
                <textarea
                  value={profile.summary}
                  onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                  rows={3}
                  placeholder="Summary (optional)"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
                />
              </div>

              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyExperienceBullets}
                  onChange={(e) => setOnlyExperienceBullets(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-extrabold text-black/70 dark:text-black/70">Only experience bullets</span>
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze || loadingAnalyze}
                  className="rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-extrabold text-black hover:opacity-90 disabled:opacity-50 dark:border-white/10"
                >
                  {loadingAnalyze ? "Analyzing…" : `Analyze (${CREDIT_COSTS.analyze} credits)`}
                </button>

                <div className="ml-1 text-xs text-black/60 dark:text-black/60">
                  Costs: Analyze {CREDIT_COSTS.analyze} • Rewrite {CREDIT_COSTS.rewriteBullet} each
                </div>

                <label className="ml-1 flex items-center gap-2 text-xs font-extrabold text-black/70 dark:text-black/70">
                  <input
                    type="checkbox"
                    checked={includeMetaInResumeDoc}
                    onChange={(e) => setIncludeMetaInResumeDoc(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Include meta blocks
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/70 dark:text-black/70">
                  <input
                    type="checkbox"
                    checked={showDebugJson}
                    onChange={(e) => setShowDebugJson(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show debug
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/70 dark:text-black/70">
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
        <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">Preview</h2>
            <div className="text-xs text-black/60 dark:text-black/70">
              {effectiveResumeHtml ? "Ready" : "Waiting for analyze/rewrite"}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyOutput}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
            >
              Copy
            </button>

            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold dark:border-white/10 dark:bg-black/20">
              .pdf
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
            >
              Download
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
            >
              Print
            </button>

            <button
              type="button"
              onClick={() => {
                setPreviewHtmlDraft(activeResumeHtml || "");
                setShowPreviewEditor(true);
              }}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
            >
              Edit Live Preview
            </button>

            <button
              type="button"
              onClick={handleViewPreview}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
            >
              Preview
            </button>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-black/10 bg-transparent dark:border-white/10">
            <iframe
              title="resume-preview"
              className="h-[820px] w-full border-0"
              sandbox="allow-same-origin"
              srcDoc={
                (showPreviewEditor ? previewHtmlDraft : effectiveResumeHtml) ||
                "<!doctype html><html><head><meta charset='utf-8' /></head><body></body></html>"
              }
            />
          </div>

          {showPreviewEditor ? (
            <div className="mt-4 rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-black/60 dark:text-black/70">
                  Edit resume HTML (live preview)
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewHtmlDraft(effectiveResumeHtml || "")}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPreviewEditor(false)}
                    className="text-sm font-extrabold underline opacity-80 hover:opacity-100"
                  >
                    Close
                  </button>
                </div>
              </div>

              <textarea
                value={previewHtmlDraft}
                onChange={(e) => setPreviewHtmlDraft(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full rounded-xl border border-black/10 bg-white p-3 font-mono text-xs outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
              />

              <div className="mt-2 text-xs text-black/60 dark:text-black/70">
                Tip: While this editor is open, Download/Print/Preview uses the edited HTML.
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {/* ✅ BULLETS PANEL */}
      {analysis && effectivePlan.length ? (
        <section className="mt-4 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold">Bullets</h2>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => selectAll(effectivePlan.length)}
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
                className="rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-extrabold text-black hover:opacity-90 disabled:opacity-50 dark:border-white/10"
              >
                {loadingBatchRewrite
                  ? "Rewriting…"
                  : `Rewrite Selected (${selectedCount}) (${CREDIT_COSTS.rewriteBullet} credit ea)`}
              </button>

              <div className="text-xs text-black/60 dark:text-black/70">
                Selecting a bullet applies its rewrite (if available) to the compiled resume.
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            {effectivePlan.map((item, i) => {
              const original = planItemToText(item);
              const rewritten = String(item?.rewrittenBullet ?? "").trim();
              const assigned = assignments[i]?.sectionId || sections[0]?.id || "default";
              const selected = selectedBulletIdx.has(i);

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
                        onChange={(e) =>
                          setAssignments((prev) => ({
                            ...prev,
                            [i]: { sectionId: e.target.value },
                          }))
                        }
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold outline-none dark:border-white/10 dark:bg-black/30 dark:text-black"
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
                        onClick={() => handleRewriteBullet(i)}
                        disabled={loadingRewriteIndex !== null && loadingRewriteIndex !== i}
                        className="rounded-xl border border-black/10 bg-black px-3 py-2 text-sm font-extrabold text-black hover:opacity-90 disabled:opacity-50 dark:border-white/10"
                      >
                        {loadingRewriteIndex === i ? "Rewriting…" : `Rewrite (${CREDIT_COSTS.rewriteBullet})`}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2">
                    <div className="text-xs font-extrabold text-black/60 dark:text-black/70">Original</div>
                    <div className="whitespace-pre-wrap text-sm">{original}</div>

                    {rewritten ? (
                      <>
                        <div className="mt-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                          Rewritten {selected ? "(APPLIED)" : "(not applied)"}
                        </div>
                        <div className="whitespace-pre-wrap text-sm">{rewritten}</div>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}