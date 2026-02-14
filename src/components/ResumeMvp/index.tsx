"use client";

import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import ImpactVote from "@/components/ImpactVote";
import FeedbackWidget from "@/components/FeedbackWidget";
import { buildRewriteBulletPayload } from "@/lib/rewritePayload";

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
  // --- NEW THEMES (18) ---
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

/** ---------------- Helpers ---------------- */

async function parseApiResponse(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

function isHtmlDoc(x: unknown) {
  return (
    typeof x === "string" &&
    (x.includes("<!DOCTYPE html>") || x.includes('id="__NEXT_DATA__"'))
  );
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

/** ---------------- NEW: keyword + rewrite guardrail helpers ---------------- */

function normalizeSuggestedKeywordsForBullet(originalBullet: string, suggested: string[]) {
  const text = normalizeForMatch(originalBullet);

  // ban generic "anchor" phrases that cause repeated rewrites
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

  // keep keywords that plausibly match the bullet OR are short useful tokens
  cleaned = cleaned.filter((k) => {
    const kk = normalizeForMatch(k);
    if (kk.length <= 6) return true; // allow short ones like "jira", "qa", "ue5"
    return text.includes(kk);
  });

  // fallback if we removed too much or the analyze returned junk
  if (cleaned.length < 2) {
    cleaned = ["qa", "test planning", "release", "jira"];
  }

  // cap to avoid keyword spam
  return cleaned.slice(0, 5);
}

function isTrainingLikeBullet(bullet: string) {
  const s = String(bullet || "");
  // includes common training/certification language
  return /\b(training|trained|certif|certificate|certification|course|workshop|program|bootcamp|completed|graduated)\b/i.test(
    s
  );
}

function defaultTrainingRewrite(original: string) {
  const raw = String(original || "")
    .trim()
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "") // strip bullet glyphs
    .trim();

  if (!raw) return "";

  // If it already starts with a strong training verb, DO NOT prepend another verb.
  // Just tighten and add a safe outcome clause.
  const startsWithTrainingVerb =
    /^(completed|earned|achieved|graduated|attended|finished|passed|certified|trained)\b/i.test(
      raw
    );

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

      const titleLooksReal =
        title.length >= 3 && !/^(vancouver|remote|hybrid)\b/i.test(title);

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
          ? "border-black/10 bg-black/5 text-black/60 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
          : "border-black/10 bg-black/10 text-black/80 dark:border-white/10 dark:bg-white/15 dark:text-white/90",
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
      ? "border-amber-300/60 bg-amber-100/60 text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100"
      : tone === "danger"
      ? "border-red-300/60 bg-red-100/60 text-red-950 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100"
      : "border-sky-300/60 bg-sky-100/60 text-sky-950 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-100";

  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <div className="font-extrabold">{title}</div>
      <div className="mt-1 opacity-90">{children}</div>
    </div>
  );
}

/** Client-side verb scoring (After display) */
function computeVerbStrength(bullet: string): VerbStrength {
  const raw = String(bullet ?? "").trim();
  const lower = raw.toLowerCase();

  const cleaned = lower
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
    .replace(/[“”"]/g, '"')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const opener = words.slice(0, 10).join(" ");

  const weakPhrases = [
    "worked with",
    "worked on",
    "helped",
    "assisted",
    "supported",
    "participated in",
    "involved in",
    "exposed to",
    "responsible for",
    "collaborated with",
    "was responsible for",
    "was involved in",
    "was tasked with",
    "was part of",
  ];

  const strongLeadVerbs = new Set([
    "led",
    "owned",
    "drove",
    "delivered",
    "shipped",
    "launched",
    "spearheaded",
    "directed",
    "managed",
    "mentored",
    "architected",
    "designed",
    "implemented",
    "automated",
    "optimized",
    "improved",
    "increased",
    "reduced",
    "cut",
    "saved",
    "prevented",
    "unblocked",
  ]);

  const solidVerbs = new Set([
    "tested",
    "validated",
    "executed",
    "created",
    "built",
    "documented",
    "triaged",
    "investigated",
    "debugged",
    "monitored",
    "coordinated",
    "refactored",
    "integrated",
    "migrated",
    "standardized",
    "streamlined",
  ]);

  const outcomeSignals =
    /\b(increased|reduced|improved|cut|saved|prevented|boosted|grew|decreased|accelerated|shortened)\b/i.test(
      raw
    );

  const metricSignals =
    /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b|\b\d{2,}\b)/i.test(
      raw
    );

  const scopeSignals =
    /\b(api|pipeline|ci\/cd|release|deployment|automation|framework|test plan|test strategy|coverage|regression|observability|monitoring|dashboards|kpi|experiment|a\/b|tracking|instrumentation|backend|frontend|mobile|vr|ue4|ue5|unreal)\b/i.test(
      raw
    );

  const vagueSignals =
    /\b(various|several|some|things|stuff|etc|multiple tasks|as needed)\b/i.test(raw);

  const passiveSignals =
    /\b(was responsible for|was involved in|was tasked with|was assigned to|was part of)\b/i.test(
      opener
    );

  const filler = new Set([
    "successfully",
    "effectively",
    "proactively",
    "actively",
    "efficiently",
    "responsible",
    "for",
    "the",
    "a",
    "an",
    "to",
    "and",
    "with",
    "in",
    "on",
    "of",
  ]);

  let detectedVerb: string | undefined;
  for (const w of words.slice(0, 8)) {
    const word = w.replace(/[^\w-]/g, "");
    if (!word || filler.has(word)) continue;

    if (strongLeadVerbs.has(word) || solidVerbs.has(word)) {
      detectedVerb = word;
      break;
    }
    if (word.length >= 5 && word.endsWith("ed")) {
      detectedVerb = word;
      break;
    }
  }

  let baseScore = 62;
  const reasons: string[] = [];

  const matchedWeak = weakPhrases.find((p) => opener.startsWith(p));
  if (matchedWeak) {
    baseScore -= 10;
    reasons.push(`Weak opener (“${matchedWeak}”)`);
  }
  if (passiveSignals) {
    baseScore -= 8;
    reasons.push("Passive voice opener");
  }
  if (vagueSignals) {
    baseScore -= 6;
    reasons.push("Vague wording");
  }

  if (detectedVerb) {
    if (strongLeadVerbs.has(detectedVerb)) {
      baseScore += 22;
      reasons.push(`Strong verb (“${detectedVerb}”)`);
    } else if (solidVerbs.has(detectedVerb)) {
      baseScore += 10;
      reasons.push(`Solid verb (“${detectedVerb}”)`);
    } else {
      baseScore += 6;
      reasons.push(`Action verb (“${detectedVerb}”)`);
    }
  } else {
    baseScore -= 4;
    reasons.push("No clear action verb early");
  }

  if (scopeSignals) {
    baseScore += 10;
    reasons.push("Clear scope/system");
  }
  if (outcomeSignals) {
    baseScore += 12;
    reasons.push("Outcome language");
  }
  if (metricSignals) {
    baseScore += 12;
    reasons.push("Quantified impact");
  }

  baseScore = Math.max(0, Math.min(100, baseScore));

  const score = baseScore;
  const label: VerbStrength["label"] = score < 50 ? "Weak" : score < 80 ? "OK" : "Strong";

  let suggestion: string | undefined;
  if (label !== "Strong") {
    suggestion = reasons.length
      ? `Why: ${reasons.slice(0, 3).join(", ")}`
      : "Try a stronger opener and add outcome/metrics if truthful.";
  }

  return { score, label, detectedVerb, suggestion, baseScore };
}

/** ---------- Resume Template HTML ---------- */

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * ✅ Arcade-style header contact chips (forced across ALL templates)
 * - wraps cleanly
 * - consistent spacing
 * - prevents long email/links from breaking layout
 */
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

type ThemeArgs = {
  font: "sans" | "serif";
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2?: string;

  bodyBg: string;
  headerBg: string;
  cardBg: string;

  radius: number;
  shadow: string;

  borderStyle?: "solid" | "dashed";
  hasChips?: boolean;
  headerAfterGrid?: boolean;
};

function mkThemeCss(t: ThemeArgs) {
  const borderStyle = t.borderStyle ?? "solid";
  const accent2 = t.accent2 ?? t.accent;

  const PAGE_SIZE = "Letter";
  const PAGE_MARGIN = "0.35in";

  return `
:root{
  --ink:${t.ink};
  --muted:${t.muted};
  --line:${t.line};
  --accent:${t.accent};
  --accent2:${accent2};
  --bodyBg:${t.bodyBg};
  --headerBg:${t.headerBg};
  --cardBg:${t.cardBg};
  --radius:${t.radius}px;
  --shadow:${t.shadow};
  --borderStyle:${borderStyle};
}

*{ box-sizing:border-box; }

html, body{
  margin:0;
  padding:0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@page{
  size: ${PAGE_SIZE};
  margin: ${PAGE_MARGIN};
}

/* Base */
body{
  font-family: ${
    t.font === "serif"
      ? `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
      : `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`
  };
  color: var(--ink);
  background: var(--bodyBg);
  line-height: 1.35;
}

/* Sheet */
.page{
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto;
  padding: 18px 22px;
  background: rgba(255,255,255,0.0);
}

/* Top header */
.top{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  padding: 14px 16px;
  border: 1px var(--borderStyle) var(--line);
  border-radius: var(--radius);
  background: var(--headerBg);
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

/* Base chip style */
.chip{
  display:inline-block;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px var(--borderStyle) var(--line);
  background: var(--cardBg);
  box-shadow: 0 10px 25px rgba(2,6,23,.06);
}

/* Content */
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
  border: 1px var(--borderStyle) var(--line);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--cardBg);
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

/* Jobs */
.job{
  margin-top: 12px;
}

.jobhead{
  display:flex;
  justify-content:space-between;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 1px var(--borderStyle) var(--line);
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

/* Optional: grid header decoration */
${
  t.headerAfterGrid
    ? `
.top:after{
  content:"";
  display:block;
  height: 10px;
  margin-top: 10px;
  border-top: 1px dashed var(--line);
  width: 100%;
}
`
    : ""
}

/* ✅ Force Arcade-style header chips for ALL mkThemeCss themes */
${headerContactChipsCss()}

@media print{
  /* Keep the same appearance as preview */
  body{ background: var(--bodyBg) !important; }
  .page{
    width: 8.5in !important;
    min-height: 11in !important;
    margin: 0 auto !important;
  }
}

`.trim();
}

function printLockCss() {
  const PAGE_SIZE = "Letter";
  const PAGE_MARGIN = "0.35in";

  return `
/* --- PRINT LOCK: keep layout stable, DON'T restyle --- */
html, body{
  margin:0;
  padding:0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@page{
  size: ${PAGE_SIZE};
  margin: ${PAGE_MARGIN};
}

/* IMPORTANT:
   We intentionally do NOT change background/shadows in print.
   PDF should match the on-screen preview. */
@media print{
  .page{
    width: 8.5in !important;
    min-height: 11in !important;
    max-width: none !important;
    margin: 0 auto !important;
  }
}
`.trim();
}


function templateStyles(template: ResumeTemplateId) {
  // ---------- EXISTING THEMES ----------
  if (template === "modern") {
    return `
      :root { --ink:#111; --muted:#555; --line:#e7e7e7; --accent:#0b57d0; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:#f6f7fb; }
      .page { max-width: 860px; margin: 22px auto; background:white; border:1px solid var(--line); border-radius: 16px; overflow:hidden; box-shadow: 0 10px 30px rgba(0,0,0,.06); }
      .top { display:grid; grid-template-columns: 1.2fr 0.8fr; gap: 18px; padding: 26px 26px 18px; background: linear-gradient(180deg, rgba(11,87,208,.08), rgba(255,255,255,0)); border-bottom:1px solid var(--line); }
      .name { font-size: 30px; font-weight: 900; letter-spacing: -.02em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:700; }
      .contact { font-size: 12px; color:var(--muted); display:grid; gap: 6px; justify-items:end; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; }
      .content { padding: 18px 26px 26px; }
      .section { margin-top: 16px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 900; letter-spacing: .08em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: var(--accent); }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 12px; border:1px solid var(--line); border-radius: 12px; padding: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); border-radius: 12px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 900; font-size: 12px; color: var(--ink); margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "minimal") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; }
      body { font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; color:var(--ink); margin:0; background:#fff; }
      .page { max-width: 820px; margin: 26px auto; padding: 0 22px 22px; }
      .top { padding: 16px 0 10px; border-bottom: 1px solid var(--line); }
      .name { font-size: 30px; font-weight: 800; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); }
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .content { padding-top: 10px; }
      .h { margin: 14px 0 6px; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform:uppercase; }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 10px; padding-top: 10px; border-top:1px solid var(--line); }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border-top:1px solid var(--line); padding-top:10px; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "arcade") {
    return `
      :root { --ink:#120a2a; --muted:#3b2a66; --line:#e7d7ff; --accent:#7c3aed; --accent2:#06b6d4; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:
        radial-gradient(1200px 600px at 10% 10%, rgba(124,58,237,.12), rgba(255,255,255,0)),
        radial-gradient(1000px 600px at 90% 20%, rgba(6,182,212,.10), rgba(255,255,255,0)),
        #fbf7ff;
      }
      .page { max-width: 860px; margin: 22px auto; background:white; border:1px solid var(--line); border-radius: 18px; overflow:hidden; box-shadow: 0 14px 40px rgba(18,10,42,.10); }
      .top { padding: 24px 26px 18px; background: linear-gradient(135deg, rgba(124,58,237,.16), rgba(6,182,212,.10)); border-bottom:1px solid var(--line); position:relative; }
      .top:after { content:""; position:absolute; inset:0; background-image: linear-gradient(rgba(0,0,0,0) 24px, rgba(18,10,42,.03) 25px); background-size: 100% 25px; pointer-events:none; }
      .name { font-size: 32px; font-weight: 1000; letter-spacing: -.03em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:800; }
      .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; box-shadow: 0 2px 0 rgba(124,58,237,.08); }
      .content { padding: 18px 26px 26px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 1000; letter-spacing: .10em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
      .job { margin-top: 12px; border:1px solid var(--line); border-radius: 14px; padding: 12px; background: linear-gradient(180deg, rgba(124,58,237,.04), rgba(255,255,255,0)); }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 1000; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); border-radius: 14px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 1000; font-size: 12px; color: var(--ink); margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "neon") {
    return `
      :root { --ink:#0b1020; --muted:#2a3558; --line:#dde3ff; --accent:#00e5ff; --accent2:#ff00e5; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:
        radial-gradient(900px 500px at 20% 10%, rgba(0,229,255,.14), rgba(255,255,255,0)),
        radial-gradient(900px 500px at 80% 20%, rgba(255,0,229,.10), rgba(255,255,255,0)),
        #f7f9ff;
      }
      .page { max-width: 860px; margin: 22px auto; background:white; border:1px solid var(--line); border-radius: 18px; overflow:hidden; box-shadow: 0 18px 50px rgba(11,16,32,.10); }
      .top { padding: 26px; border-bottom:1px solid var(--line); background: linear-gradient(135deg, rgba(0,229,255,.12), rgba(255,0,229,.08)); }
      .name { font-size: 32px; font-weight: 950; letter-spacing: -.03em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:900; }
      .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; box-shadow: 0 0 0 2px rgba(0,229,255,.06), 0 0 0 2px rgba(255,0,229,.04) inset; }
      .content { padding: 18px 26px 26px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 950; letter-spacing: .12em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); box-shadow: 0 0 12px rgba(0,229,255,.24); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
      .job { margin-top: 12px; border:1px solid var(--line); border-radius: 14px; padding: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:900; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); border-radius: 14px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "terminal") {
    return `
      :root { --ink:#e6f3ea; --muted:#b7d6c2; --line:#2a4f3a; --accent:#39ff14; }
      body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; color:var(--ink); margin:0; background:#061a10; }
      .page { max-width: 900px; margin: 18px auto; border:1px solid var(--line); background:#071f13; border-radius: 14px; overflow:hidden; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
      .top { padding: 18px 18px 14px; border-bottom:1px solid var(--line); background:
        linear-gradient(180deg, rgba(57,255,20,.10), rgba(0,0,0,0));
      }
      .name { font-size: 26px; font-weight: 900; margin:0; color:var(--accent); }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:800; }
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:#062014; color:var(--ink); }
      .content { padding: 14px 18px 18px; }
      .h { margin: 14px 0 6px; font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform:uppercase; color:var(--accent); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 12.5px; }
      .job { margin-top: 10px; border-top:1px dashed var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.4; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 10px; background:#061a10; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; color:var(--accent); }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "blueprint") {
    return `
      :root { --ink:#0b1a2a; --muted:#2a4a6a; --line:#cfe7ff; --accent:#0b57d0; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0;
        background:
          linear-gradient(90deg, rgba(11,87,208,.05) 1px, rgba(255,255,255,0) 1px),
          linear-gradient(180deg, rgba(11,87,208,.05) 1px, rgba(255,255,255,0) 1px),
          #f7fbff;
        background-size: 26px 26px;
      }
      .page { max-width: 860px; margin: 22px auto; background:white; border:1px solid var(--line); border-radius: 16px; overflow:hidden; box-shadow: 0 10px 30px rgba(11,26,42,.08); }
      .top { padding: 22px 26px 18px; border-bottom:1px solid var(--line); background: linear-gradient(180deg, rgba(11,87,208,.08), rgba(255,255,255,0)); }
      .name { font-size: 30px; font-weight: 950; letter-spacing: -.02em; margin:0; }
      .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:800; }
      .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:white; }
      .content { padding: 18px 26px 26px; }
      .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 950; letter-spacing: .10em; text-transform:uppercase; }
      .bar { height: 10px; width: 10px; border-radius: 3px; background: var(--accent); }
      .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
      .job { margin-top: 12px; border:1px dashed var(--line); border-radius: 14px; padding: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px dashed var(--line); border-radius: 14px; padding: 12px; background:#fff; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "executive") {
    return `
      :root { --ink:#0f172a; --muted:#475569; --line:#e2e8f0; --accent:#111827; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:#fff; }
      .page { max-width: 900px; margin: 22px auto; background:white; border:1px solid var(--line); padding: 22px 26px; }
      .top { display:flex; justify-content:space-between; gap: 16px; border-bottom:1px solid var(--line); padding-bottom: 14px; }
      .name { font-size: 30px; font-weight: 950; margin:0; letter-spacing:-.02em; }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:800; }
      .contact { font-size: 12px; color:var(--muted); text-align:right; display:grid; gap:4px; font-weight:700; }
      .h { margin: 16px 0 8px; font-size: 12px; font-weight: 950; letter-spacing: .14em; text-transform:uppercase; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.55; font-size: 13px; }
      .job { margin-top: 12px; border-top:1px solid var(--line); padding-top: 12px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 8px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.45; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 12px; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "compact") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --accent:#111827; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:#fff; }
      .page { max-width: 900px; margin: 16px auto; border: 1px solid var(--line); padding: 14px 18px; }
      .top { display:flex; justify-content:space-between; gap: 10px; border-bottom:1px solid var(--line); padding-bottom: 8px; }
      .name { font-size: 24px; font-weight: 950; margin:0; }
      .title { margin-top:4px; font-size: 12px; color:var(--muted); font-weight:800; }
      .contact { font-size: 11px; color:var(--muted); text-align:right; display:grid; gap:2px; font-weight:700; }
      .h { margin: 10px 0 4px; font-size: 12px; font-weight: 950; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.35; font-size: 12px; }
      .job { margin-top: 8px; border-top:1px solid var(--line); padding-top: 8px; }
      .jobhead { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 11px; font-weight:800; }
      ul { margin: 6px 0 0 16px; padding:0; }
      li { margin: 4px 0; line-height: 1.28; font-size: 12px; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 950; font-size: 11px; margin:0 0 6px; }
      .small { font-size: 11px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "sidebar") {
    return `
      :root { --ink:#111; --muted:#555; --line:#e7e7e7; --accent:#0b57d0; --side:#f4f6fb; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:var(--ink); margin:0; background:#fff; }
      .page { max-width: 980px; margin: 22px auto; border:1px solid var(--line); border-radius: 16px; overflow:hidden; display:grid; grid-template-columns: 280px 1fr; }
      .top { grid-column: 1 / -1; display:none; }
      .side { background: var(--side); padding: 18px; border-right:1px solid var(--line); }
      .main { padding: 18px 22px; }
      .name { font-size: 24px; font-weight: 950; margin:0; }
      .title { margin-top:6px; font-size: 12px; color:var(--muted); font-weight:800; }
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
      .chip { display:inline-block; border:1px solid var(--line); padding:6px 10px; border-radius: 999px; background:#fff; }
      .h { margin: 14px 0 6px; font-size: 12px; font-weight: 950; letter-spacing: .12em; text-transform:uppercase; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 950; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr; gap: 10px; }
      .box { border:1px solid var(--line); border-radius: 12px; padding: 10px; background:#fff; }
      .boxtitle { font-weight: 950; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      .content { padding:0; }
      .section { margin-top: 0; }
      ${printLockCss()}
    `;
  }

  if (template === "serif") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --accent:#0f172a; }
      body { font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif; color:var(--ink); margin:0; background:#fafafa; }
      .page { max-width: 860px; margin: 22px auto; background:white; border:1px solid var(--line); padding: 22px 26px; }
      .top { display:flex; justify-content:space-between; gap: 16px; border-bottom:2px solid var(--line); padding-bottom: 12px; }
      .name { font-size: 30px; font-weight: 800; margin:0; }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:700; }
      .contact { font-size: 12px; color:var(--muted); text-align:right; display:grid; gap:4px; font-weight:700; }
      .h { margin: 14px 0 6px; font-size: 13px; font-weight: 900; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.55; font-size: 13px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.45; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  if (template === "ats") {
    return `
      :root { --ink:#111; --muted:#333; --line:#ddd; --accent:#111; }
      body { font-family: Arial, Helvetica, sans-serif; color:var(--ink); margin:0; background:#fff; }
      .page { max-width: 900px; margin: 16px auto; background:white; padding: 16px 18px; }
      .top { display:flex; justify-content:space-between; gap: 12px; border-bottom:1px solid var(--line); padding-bottom: 10px; }
      .name { font-size: 24px; font-weight: 800; margin:0; }
      .title { margin-top:6px; font-size: 12px; color:var(--muted); font-weight:700; }
      .contact { font-size: 11px; color:var(--muted); text-align:right; display:grid; gap:3px; font-weight:700; }
      .h { margin: 12px 0 6px; font-size: 12px; font-weight: 800; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.4; font-size: 12px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 800; }
      .jobmeta { color: var(--muted); font-size: 11px; font-weight:700; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 5px 0; line-height: 1.35; font-size: 12px; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 800; font-size: 11px; margin:0 0 6px; }
      .small { font-size: 11px; color: var(--muted); }
      ${printLockCss()}
    `;
  }

  // classic fallback
  if (template === "classic") {
    return `
      :root { --ink:#111; --muted:#444; --line:#e7e7e7; --accent:#1f2937; }
      body { font-family: Calibri, Arial, Helvetica, sans-serif; color:var(--ink); margin:0; background:#fff; }
      .page { max-width: 850px; margin: 18px auto; border: 1px solid var(--line); padding: 18px 22px; }
      .top { display:flex; justify-content:space-between; gap: 12px; border-bottom:1px solid var(--line); padding-bottom: 10px; }
      .name { font-size: 28px; font-weight: 900; margin:0; }
      .title { margin-top:6px; font-size: 13px; color:var(--muted); font-weight:700; }
      .contact { font-size: 12px; color:var(--muted); text-align:right; display:grid; gap:4px; }
      .h { margin: 14px 0 6px; font-size: 13px; font-weight: 900; color: var(--accent); }
      .summary { color:var(--muted); line-height: 1.45; font-size: 13px; }
      .job { margin-top: 10px; border-top:1px solid var(--line); padding-top: 10px; }
      .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
      .jobtitle { font-weight: 900; }
      .jobmeta { color: var(--muted); font-size: 12px; font-weight:700; }
      ul { margin: 6px 0 0 18px; padding:0; }
      li { margin: 6px 0; line-height: 1.35; }
      .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .box { border:1px solid var(--line); padding: 10px; }
      .boxtitle { font-weight: 900; font-size: 12px; margin:0 0 6px; }
      .small { font-size: 12px; color: var(--muted); }
      ${headerContactChipsCss()}
      ${printLockCss()}
    `;
  }

  // ---------- NEW THEMES (18) ----------
  if (template === "monochrome") {
    return mkThemeCss({
      font: "sans",
      ink: "#0f172a",
      muted: "#334155",
      line: "#e2e8f0",
      accent: "#111827",
      bodyBg: "#f8fafc",
      headerBg: "linear-gradient(180deg, rgba(15,23,42,.08), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 45px rgba(2,6,23,.08)",
      hasChips: true,
    });
  }

  if (template === "noir") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#2b3446",
      line: "#e5e7eb",
      accent: "#0b0f18",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(15,23,42,.10), rgba(255,255,255,0)), #f6f7fb",
      headerBg: "linear-gradient(135deg, rgba(2,6,23,.10), rgba(255,255,255,0))",
      cardBg: "linear-gradient(180deg, rgba(2,6,23,.03), rgba(255,255,255,0))",
      radius: 16,
      shadow: "0 18px 55px rgba(2,6,23,.12)",
      hasChips: true,
    });
  }

  if (template === "paper") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f2937",
      muted: "#4b5563",
      line: "#e5e7eb",
      accent: "#1f2937",
      bodyBg:
        "radial-gradient(900px 480px at 20% 10%, rgba(17,24,39,.06), rgba(255,255,255,0)), #fffdf7",
      headerBg: "linear-gradient(180deg, rgba(245,158,11,.08), rgba(255,255,255,0))",
      cardBg: "#fffef9",
      borderStyle: "solid",
      radius: 12,
      shadow: "0 10px 28px rgba(31,41,55,.08)",
    });
  }

  if (template === "ink") {
    return mkThemeCss({
      font: "serif",
      ink: "#0b1220",
      muted: "#334155",
      line: "#cbd5e1",
      accent: "#0f172a",
      bodyBg:
        "radial-gradient(1000px 520px at 10% 10%, rgba(15,23,42,.10), rgba(255,255,255,0)), #f8fafc",
      headerBg: "linear-gradient(180deg, rgba(15,23,42,.10), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "dashed",
      radius: 18,
      shadow: "0 14px 40px rgba(15,23,42,.10)",
    });
  }

  if (template === "corporate") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1324",
      muted: "#44546a",
      line: "#d6deea",
      accent: "#0b57d0",
      accent2: "#111827",
      bodyBg: "#f3f6fb",
      headerBg: "linear-gradient(135deg, rgba(11,87,208,.10), rgba(17,24,39,.04))",
      cardBg: "#ffffff",
      radius: 14,
      shadow: "0 16px 45px rgba(11,19,36,.10)",
      hasChips: true,
    });
  }

  if (template === "contrast") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b0f18",
      muted: "#111827",
      line: "#0b0f18",
      accent: "#0b0f18",
      accent2: "#0b0f18",
      bodyBg: "#ffffff",
      headerBg: "linear-gradient(180deg, rgba(0,0,0,.08), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 0,
      shadow: "none",
    });
  }

  if (template === "minimalist") {
    return mkThemeCss({
      font: "sans",
      ink: "#111827",
      muted: "#6b7280",
      line: "#eef2f7",
      accent: "#111827",
      bodyBg: "#ffffff",
      headerBg: "linear-gradient(180deg, rgba(17,24,39,.04), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 24,
      shadow: "0 10px 30px rgba(17,24,39,.06)",
    });
  }

  if (template === "grid") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1a2a",
      muted: "#2a4a6a",
      line: "#bfe3ff",
      accent: "#0b57d0",
      accent2: "#06b6d4",
      bodyBg:
        "linear-gradient(90deg, rgba(11,87,208,.05) 1px, rgba(255,255,255,0) 1px), linear-gradient(180deg, rgba(6,182,212,.05) 1px, rgba(255,255,255,0) 1px), #f7fbff",
      headerBg: "linear-gradient(135deg, rgba(11,87,208,.12), rgba(6,182,212,.08))",
      cardBg: "rgba(255,255,255,.92)",
      borderStyle: "dashed",
      radius: 18,
      shadow: "0 18px 55px rgba(11,26,42,.10)",
      headerAfterGrid: true,
      hasChips: true,
    });
  }

  if (template === "retro") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1b12",
      muted: "#6b3f2a",
      line: "#f0d9c7",
      accent: "#f97316",
      accent2: "#f59e0b",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(249,115,22,.12), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(245,158,11,.10), rgba(255,255,255,0)), #fff7ed",
      headerBg: "linear-gradient(135deg, rgba(249,115,22,.16), rgba(245,158,11,.10))",
      cardBg: "linear-gradient(180deg, rgba(249,115,22,.04), rgba(255,255,255,0))",
      radius: 18,
      shadow: "0 16px 45px rgba(43,27,18,.10)",
      hasChips: true,
    });
  }

  if (template === "pastel") {
    return mkThemeCss({
      font: "sans",
      ink: "#1f2937",
      muted: "#52607a",
      line: "#e7e3ff",
      accent: "#a78bfa",
      accent2: "#60a5fa",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(167,139,250,.18), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(96,165,250,.14), rgba(255,255,255,0)), #fbfaff",
      headerBg: "linear-gradient(135deg, rgba(167,139,250,.18), rgba(96,165,250,.12))",
      cardBg: "#ffffff",
      radius: 20,
      shadow: "0 18px 55px rgba(31,41,55,.08)",
      hasChips: true,
    });
  }

  if (template === "aura") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#22c55e",
      accent2: "#06b6d4",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(34,197,94,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(6,182,212,.12), rgba(255,255,255,0)), #f7fbff",
      headerBg: "linear-gradient(135deg, rgba(34,197,94,.14), rgba(6,182,212,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.10)",
      hasChips: true,
    });
  }

  if (template === "lavender") {
    return mkThemeCss({
      font: "serif",
      ink: "#1f1b2e",
      muted: "#5b4f78",
      line: "#e8defa",
      accent: "#7c3aed",
      accent2: "#a78bfa",
      bodyBg: "radial-gradient(900px 520px at 20% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), #fbf8ff",
      headerBg: "linear-gradient(180deg, rgba(167,139,250,.22), rgba(255,255,255,0))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 16px 48px rgba(31,27,46,.10)",
      hasChips: true,
    });
  }

  if (template === "sunset") {
    return mkThemeCss({
      font: "sans",
      ink: "#2b1220",
      muted: "#6b2a3a",
      line: "#ffd3d8",
      accent: "#fb7185",
      accent2: "#f97316",
      bodyBg:
        "radial-gradient(900px 520px at 25% 10%, rgba(251,113,133,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(249,115,22,.12), rgba(255,255,255,0)), #fff6f7",
      headerBg: "linear-gradient(135deg, rgba(251,113,133,.18), rgba(249,115,22,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 18px 55px rgba(43,18,32,.10)",
      hasChips: true,
    });
  }

  if (template === "forest") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1f17",
      muted: "#2a5a44",
      line: "#cfe8dc",
      accent: "#16a34a",
      accent2: "#0ea5e9",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(22,163,74,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(14,165,233,.08), rgba(255,255,255,0)), #f3fbf7",
      headerBg: "linear-gradient(135deg, rgba(22,163,74,.16), rgba(14,165,233,.08))",
      cardBg: "#ffffff",
      radius: 16,
      shadow: "0 18px 55px rgba(11,31,23,.10)",
      hasChips: true,
    });
  }

  if (template === "ocean") {
    return mkThemeCss({
      font: "sans",
      ink: "#061a2a",
      muted: "#21506f",
      line: "#cfe7ff",
      accent: "#0ea5e9",
      accent2: "#06b6d4",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(14,165,233,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(6,182,212,.12), rgba(255,255,255,0)), #f4fbff",
      headerBg: "linear-gradient(135deg, rgba(14,165,233,.16), rgba(6,182,212,.12))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(6,26,42,.10)",
      hasChips: true,
    });
  }

  if (template === "sand") {
    return mkThemeCss({
      font: "serif",
      ink: "#2b2012",
      muted: "#6b5a2a",
      line: "#f1e2c7",
      accent: "#d97706",
      accent2: "#f59e0b",
      bodyBg: "radial-gradient(900px 520px at 20% 10%, rgba(217,119,6,.14), rgba(255,255,255,0)), #fffbf2",
      headerBg: "linear-gradient(180deg, rgba(245,158,11,.16), rgba(255,255,255,0))",
      cardBg: "#fffdf7",
      radius: 14,
      shadow: "0 14px 40px rgba(43,32,18,.08)",
      hasChips: true,
    });
  }

  if (template === "royal") {
    return mkThemeCss({
      font: "sans",
      ink: "#0b1020",
      muted: "#2a3558",
      line: "#dde3ff",
      accent: "#1d4ed8",
      accent2: "#7c3aed",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(29,78,216,.14), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(124,58,237,.12), rgba(255,255,255,0)), #f7f9ff",
      headerBg: "linear-gradient(135deg, rgba(29,78,216,.16), rgba(124,58,237,.10))",
      cardBg: "#ffffff",
      radius: 18,
      shadow: "0 20px 60px rgba(11,16,32,.12)",
      hasChips: true,
    });
  }

  if (template === "gold") {
    return mkThemeCss({
      font: "serif",
      ink: "#1a1410",
      muted: "#5b4b3a",
      line: "#f2e6c9",
      accent: "#b45309",
      accent2: "#f59e0b",
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(245,158,11,.16), rgba(255,255,255,0)), radial-gradient(900px 520px at 80% 20%, rgba(180,83,9,.10), rgba(255,255,255,0)), #fffaf0",
      headerBg: "linear-gradient(135deg, rgba(245,158,11,.18), rgba(180,83,9,.10))",
      cardBg: "#ffffff",
      borderStyle: "solid",
      radius: 18,
      shadow: "0 18px 55px rgba(26,20,16,.10)",
      hasChips: true,
    });
  }

  return templateStyles("classic");
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
  const { template, profile, sections, bulletsBySection, metaGames, metaMetrics, includeMeta } =
    args;

  const safe = (s: string) => escapeHtml(s || "");

  // ✅ Order: email then location then phone etc (your preference)
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
    template === "gold";

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

  // Sidebar template has its own layout
  if (template === "sidebar") {
    const sidebarContact = contactBits.map((c) => `<div class="chip">${c}</div>`).join("");

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Resume - ${safe(profile.fullName || "Updated")}</title>
  <style>
    ${templateStyles(template)}
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

  // ✅ Chips everywhere except ATS (keep ATS plain)
  const useChips = template !== "ats";
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
    ${templateStyles(template)}
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

function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openPreviewWindow(html: string) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 250);
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

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadAsTxt(filenameBase: string, html: string) {
  const txt = htmlToPlainText(html);
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  downloadBlob(`${filenameBase}.txt`, blob);
}

function downloadAsWordHtml(filename: string, html: string, mime: string) {
  const docHtml = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${html}</body></html>`;
  const blob = new Blob([docHtml], { type: `${mime};charset=utf-8` });
  downloadBlob(filename, blob);
}

function downloadAsDoc(filenameBase: string, html: string) {
  downloadAsWordHtml(`${filenameBase}.doc`, html, "application/msword");
}

function downloadAsDocx(filenameBase: string, html: string) {
  downloadAsWordHtml(
    `${filenameBase}.docx`,
    html,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function downloadAsMhtml(filenameBase: string, html: string) {
  const boundary = "----=_NextPart_" + Math.random().toString(16).slice(2);
  const mhtml =
    `From: <Saved by Resume MVP>\r\n` +
    `Subject: Resume\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset="utf-8"\r\n` +
    `Content-Transfer-Encoding: 7bit\r\n\r\n` +
    `${html}\r\n\r\n` +
    `--${boundary}--\r\n`;

  const blob = new Blob([mhtml], { type: "multipart/related;charset=utf-8" });
  downloadBlob(`${filenameBase}.mhtml`, blob);
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
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  function resetDerivedState() {
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
  }

  type DownloadFormat = ".txt" | ".doc" | ".docx" | ".pdf" | ".mhtml";
  const [downloadFormat, setDownloadFormat] = useState<DownloadFormat>(".txt");

  async function handleCopyOutput() {
    if (!effectiveResumeHtml) return;
    const txt = htmlToPlainText(effectiveResumeHtml);
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

  async function handleDownloadByFormat() {
    if (!effectiveResumeHtml) return;

    const base = "resume";
    const html = effectiveResumeHtml;

    if (downloadFormat === ".txt") return downloadAsTxt(base, html);
    if (downloadFormat === ".doc") return downloadAsDoc(base, html);
    if (downloadFormat === ".docx") return downloadAsDocx(base, html);
    if (downloadFormat === ".mhtml") return downloadAsMhtml(base, html);

    if (downloadFormat === ".pdf") {
      const res = await fetch("/api/resume-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, filename: base }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "PDF export failed");
      }

      const blob = await res.blob();
      downloadBlob(`${base}.pdf`, blob);
      return;
    }
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    resetDerivedState();
  }

  function toggleSelected(i: number) {
    setSelectedBulletIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function selectAll(count: number) {
    setSelectedBulletIdx(new Set(Array.from({ length: count }, (_, i) => i)));
  }

  function selectNone() {
    setSelectedBulletIdx(new Set());
  }

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

      const resumeTextForApi = resumeText.trim()
        ? normalizeResumeTextForParsing(resumeText.trim())
        : "";

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("jobText", jobText);

        if (resumeTextForApi) fd.append("resumeText", resumeTextForApi);

        fd.append("onlyExperienceBullets", String(onlyExperienceBullets));
        res = await fetch("/api/analyze", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeText: resumeTextForApi || resumeText,
            jobText,
            onlyExperienceBullets,
          }),
        });
      }

      const payload = await parseApiResponse(res);

      if (logNetworkDebug) {
        console.log("[analyze] status:", res.status);
        console.log("[analyze] onlyExperienceBullets:", onlyExperienceBullets);
        if (resumeText.trim()) {
          console.log(
            "[analyze] resumeText normalized?:",
            resumeTextForApi && resumeTextForApi !== resumeText.trim()
          );
        }
        console.log("[analyze] payload:", payload);
      }

      if (isHtmlDoc(payload)) {
        throw new Error(
          `Analyze returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`
        );
      }

      if (!res.ok) {
        throw new Error(
          typeof payload === "string" ? payload : (payload as any)?.error || "Analyze failed"
        );
      }

      if (typeof payload === "string") {
        throw new Error("Analyze returned unexpected non-JSON response.");
      }

      setAnalysis(payload as AnalyzeResponse);

      const rewritePlanLocal = Array.isArray((payload as any)?.rewritePlan)
        ? ((payload as any).rewritePlan as RewritePlanItem[])
        : [];
      const planLen = rewritePlanLocal.length;

      const jobs = Array.isArray((payload as any)?.experienceJobs)
        ? ((payload as any).experienceJobs as ExperienceJobFromApi[])
        : [];

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
        const bulletJobIds = Array.isArray((payload as any)?.bulletJobIds)
          ? ((payload as any).bulletJobIds as string[])
          : undefined;

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
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setLoadingAnalyze(false);
    }
  }

  async function postRewriteWithFallback(body: any) {
  const safeBody = buildRewriteBulletPayload(body);

  const res = await fetch("/api/rewrite-bullet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(safeBody),
  });

    const payload = await parseApiResponse(res);

    if (logNetworkDebug) {
      console.log("[rewrite] status:", res.status);
      console.log("[rewrite] payload:", payload);
    }

    return { res, payload, url: "/api/rewrite-bullet" };
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
      setError(
        "Missing original bullet for rewrite. Re-run Analyze or confirm bullets are being extracted."
      );
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
            : prevBullets.slice(0, 20).map((b) => ({
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
          notes: [
            "Training/education bullet detected; kept rewrite faithful (no invented testing duties).",
          ],
          keywordHits: [],
          blockedKeywords: [],
          suggestedKeywords,
        };

        return { ...prev, rewritePlan: nextPlan };
      });

      return;
    }

    setLoadingRewriteIndex(index);
    setError(null);

    try {
      const targetProducts = csvToArray(targetProductsCsv);
      const blockedTerms = csvToArray(blockedTermsCsv);

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
        for (let i = 0; i < tokens.length - 2; i++)
          phrases.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
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

      const usedOpeners = Array.from(
        new Set(otherTexts.map(extractOpenerVerb).map(norm).filter(Boolean))
      );

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
        jobText,

        constraints: [
          "Do not add responsibilities not present in the original bullet.",
          "Do not add 'daily testing' unless the original bullet explicitly mentions it.",
          "Preserve the original meaning and scope; only improve clarity and impact.",
          "Avoid generic filler; keep it concise and specific.",
          "Do not start with the same opener verb used in other bullets; avoid repeating the same lead verb across bullets.",
          "Avoid starting with 'Collaborated', 'Developed', or 'Completed' unless the original bullet uses that verb and it's unavoidable.",
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
        throw new Error(
          `Rewrite returned HTML (server error). Check terminal logs.\nStatus: ${res.status}`
        );
      }

      if (!res.ok) {
        throw new Error(typeof payload === "string" ? payload : payload?.error || "Rewrite failed");
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
            : prevBullets.slice(0, 20).map((b) => ({
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
    } catch (e: any) {
      setError(e?.message || "Rewrite failed");
    } finally {
      setLoadingRewriteIndex(null);
    }
  }

  async function handleRewriteSelected() {
    if (!analysis) return;

    const plan = Array.isArray(analysis.rewritePlan) ? analysis.rewritePlan : [];
    if (!plan.length) {
      setError("No rewrite plan available. Run Analyze first.");
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
    }
  }

  const rewritePlan = Array.isArray(analysis?.rewritePlan) ? analysis!.rewritePlan! : [];

  const metaGames = Array.isArray(analysis?.metaBlocks?.gamesShipped)
    ? analysis!.metaBlocks!.gamesShipped!
    : [];
  const metaMetrics = Array.isArray(analysis?.metaBlocks?.metrics)
    ? analysis!.metaBlocks!.metrics!
    : [];

  const guardrailTerms = useMemo(() => {
    const terms: string[] = [];
    if (targetCompany.trim()) terms.push(targetCompany.trim());
    terms.push(...csvToArray(targetProductsCsv));
    terms.push(...csvToArray(blockedTermsCsv));
    return terms.filter(Boolean);
  }, [targetCompany, targetProductsCsv, blockedTermsCsv]);

  const selectedCount = selectedBulletIdx.size;

  const appliedBulletText = useMemo(() => {
    if (!rewritePlan.length) return [];
    return rewritePlan.map((item, i) => {
      const original = planItemToText(item);
      const rewritten = String(item?.rewrittenBullet ?? "").trim();
      const isSelected = selectedBulletIdx.has(i);
      if (isSelected && rewritten) return rewritten;
      return original;
    });
  }, [rewritePlan, selectedBulletIdx]);

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
    if (!analysis || !rewritePlan.length) return "";
    return buildResumeHtml({
      template: resumeTemplate,
      profile,
      sections,
      bulletsBySection,
      metaGames,
      metaMetrics,
      includeMeta: includeMetaInResumeDoc,
    });
  }, [
    analysis,
    rewritePlan.length,
    resumeTemplate,
    profile,
    sections,
    bulletsBySection,
    metaGames,
    metaMetrics,
    includeMetaInResumeDoc,
  ]);

  const effectiveResumeHtml = useMemo(() => {
    return (previewHtmlOverride || resumeHtml || "").trim();
  }, [previewHtmlOverride, resumeHtml]);

  function openEditPreview() {
    if (!resumeHtml) return;
    const seed = (previewHtmlOverride || resumeHtml || "").trim();
    setPreviewHtmlDraft(seed);
    setShowPreviewEditor(true);
  }

  function applyPreviewEdits() {
    setPreviewHtmlOverride(previewHtmlDraft);
  }

  function resetPreviewEdits() {
    setPreviewHtmlOverride("");
    setPreviewHtmlDraft((resumeHtml || "").trim());
  }

  function closePreviewEditor() {
    setShowPreviewEditor(false);
  }

  function handleViewPreview() {
    if (!effectiveResumeHtml) return;
    openPreviewWindow(effectiveResumeHtml);
  }

  function handlePrintPdf() {
    if (!effectiveResumeHtml) return;
    openPrintWindow(effectiveResumeHtml);
  }

  const debugInjected = useMemo(() => {
    const plan = Array.isArray(rewritePlan) ? rewritePlan : [];
    const hits = plan
      .map((p) => String(p?.rewrittenBullet ?? ""))
      .flatMap((t) => findInjectedTerms(t, guardrailTerms));
    return Array.from(new Set(hits));
  }, [rewritePlan, guardrailTerms]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
    {/* Top bar */}
<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
  {/* LEFT: nav buttons */}
  <div className="flex flex-wrap items-center gap-2">
    <Link
      href="/resume"
      className="rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-sm font-extrabold text-black/90 hover:bg-black/10 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
    >
      Resume Compiler
    </Link>

    <Link
      href="/cover-letter"
      className="rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-sm font-extrabold text-black/90 hover:bg-black/10 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
    >
      Cover Letter Generator
    </Link>
  </div>

  {/* MIDDLE: feedback pill */}
  <FeedbackWidget variant="header" surface="resume" delayDays={3} enabled />

  {/* RIGHT: theme toggle */}
  <ThemeToggle />
</div>



      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Git-a-Job: Resume Compiler</h1>
        <p className="mt-2 max-w-3xl text-sm text-black/70 dark:text-white/70">
          Analyze → auto-detect jobs → auto-assign bullets → rewrite selected → generate a clean
          template.
        </p>
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
            <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
              <span className="hidden sm:inline">System theme ready</span>
              <span className="rounded-full border border-black/10 px-2 py-0.5 dark:border-white/10">
                next-themes
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                Resume file (optional)
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
            </label>

            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                Resume text (paste if not uploading)
              </div>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
              />
              {resumeText.trim() ? (
                <div className="text-xs text-black/60 dark:text-white/60">
                  Tip: Pasted text is auto-normalized on Analyze to help recognize headers like
                  “Company … Dates … Title”.
                </div>
              ) : null}
            </label>

            <label className="grid gap-1.5">
              <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                Job posting text
              </div>
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={6}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
              />
            </label>

            {/* Template */}
            <div className="rounded-2xl border border-black/10 bg-white/60 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="mb-2 text-sm font-extrabold text-black/80 dark:text-white/80">
                Template
              </div>

              <select
                value={resumeTemplate}
                onChange={(e) => setResumeTemplate(e.target.value as ResumeTemplateId)}
                className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
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
              <div className="mb-2 text-sm font-extrabold text-black/80 dark:text-white/80">
                Header details
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={profile.fullName}
                  onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
                />
                <input
                  value={profile.titleLine}
                  onChange={(e) => setProfile((p) => ({ ...p, titleLine: e.target.value }))}
                  placeholder="Professional Title (e.g. QA Lead | Game & VR Systems)"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
                />

                <input
                  value={profile.locationLine}
                  onChange={(e) => setProfile((p) => ({ ...p, locationLine: e.target.value }))}
                  placeholder="Location"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
                />

                <input
                  value={profile.email}
                  onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
                />

                <input
                  value={profile.phone}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Phone"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <input
                  value={profile.linkedin}
                  onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
                  placeholder="LinkedIn"
                  className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
                />
              </div>

              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={onlyExperienceBullets}
                  onChange={(e) => setOnlyExperienceBullets(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-extrabold text-black/70 dark:text-white/70">
                  Only experience bullets
                </span>
              </label>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                    Target Company
                  </div>
                  <input
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
                  />
                </label>

                <label className="grid gap-1.5">
                  <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                    Source Company
                  </div>
                  <input
                    value={sourceCompany}
                    onChange={(e) => setSourceCompany(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
                  />
                </label>
              </div>

              {/* Hidden advanced guardrail inputs */}
              <div className="hidden" aria-hidden="true">
                <label className="grid gap-1.5">
                  <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                    Target Products (comma separated)
                  </div>
                  <input
                    value={targetProductsCsv}
                    onChange={(e) => setTargetProductsCsv(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
                  />
                </label>

                <label className="grid gap-1.5">
                  <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
                    Blocked Terms (comma separated)
                  </div>
                  <input
                    value={blockedTermsCsv}
                    onChange={(e) => setBlockedTermsCsv(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:focus:border-white/20"
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze || loadingAnalyze}
                  className="rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
                >
                  {loadingAnalyze ? "Analyzing…" : "Analyze"}
                </button>

                <button
                  type="button"
                  onClick={handleRewriteSelected}
                  disabled={!analysis || loadingBatchRewrite || selectedCount === 0}
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {loadingBatchRewrite ? "Rewriting…" : `Rewrite Selected (${selectedCount})`}
                </button>

                <label className="ml-1 flex items-center gap-2 text-xs font-extrabold text-black/70 dark:text-white/70">
                  <input
                    type="checkbox"
                    checked={includeMetaInResumeDoc}
                    onChange={(e) => setIncludeMetaInResumeDoc(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Include meta blocks
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/70 dark:text-white/70">
                  <input
                    type="checkbox"
                    checked={showDebugJson}
                    onChange={(e) => setShowDebugJson(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show debug
                </label>

                <label className="flex items-center gap-2 text-xs font-extrabold text-black/70 dark:text-white/70">
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
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black p-3 text-xs text-white/80">
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
            <div className="text-xs text-black/60 dark:text-white/60">
              {effectiveResumeHtml ? "Ready" : "Waiting for rewrite"}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopyOutput}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Copy
            </button>

            <select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value as DownloadFormat)}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
              disabled={!effectiveResumeHtml}
            >
              <option value=".txt">.txt</option>
              <option value=".doc">.doc</option>
              <option value=".docx">.docx</option>
              <option value=".pdf">.pdf</option>
              <option value=".mhtml">.mhtml</option>
            </select>

            <button
              type="button"
              onClick={handleDownloadByFormat}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Download
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Print
            </button>

           {false && <ImpactVote feature="resume" template={resumeTemplate} />}



            <button
              type="button"
              onClick={openEditPreview}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Edit Live Preview
            </button>

            <button
              type="button"
              onClick={handleViewPreview}
              disabled={!effectiveResumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Preview
            </button>
          </div>

          {showPreviewEditor ? (
            <div className="mt-3 rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-extrabold">Edit Live Preview (HTML)</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyPreviewEdits}
                    className="rounded-xl border border-black/10 bg-black px-3 py-2 text-sm font-extrabold text-white hover:opacity-90 dark:border-white/10"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={resetPreviewEdits}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold text-black hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={closePreviewEditor}
                    className="text-sm font-extrabold underline opacity-80 hover:opacity-100"
                  >
                    Close
                  </button>
                </div>
              </div>

              <textarea
                value={previewHtmlDraft}
                onChange={(e) => setPreviewHtmlDraft(e.target.value)}
                rows={14}
                spellCheck={false}
                className="mt-3 w-full rounded-xl border border-black/10 bg-white p-3 font-mono text-xs outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-white dark:focus:border-white/20"
              />
              <div className="mt-2 text-xs text-black/60 dark:text-white/60">
                Tip: “Apply” sets the override. Download / View / Print will use the edited HTML.
              </div>
            </div>
          ) : null}

          {resumeHtml ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
              <iframe
                title="Resume preview"
                className="h-[720px] w-full border-0"
                srcDoc={effectiveResumeHtml}
              />
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-black/15 p-4 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
              Run <span className="font-extrabold">Analyze</span> and then rewrite at least one
              bullet to generate the resume HTML preview.
            </div>
          )}
            

          {analysis && rewritePlan.length ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-sm font-extrabold">Rewrite Plan (select bullets)</h3>

            <div className="flex flex-wrap items-center gap-3">
              {/* ✅ Move Rewrite Selected here */}
              <button
                type="button"
                onClick={handleRewriteSelected}
                disabled={!analysis || loadingBatchRewrite || selectedCount === 0}
                className="rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
              >
                {loadingBatchRewrite ? "Rewriting…" : `Rewrite Selected (${selectedCount})`}
              </button>

              <button
                type="button"
                onClick={() => selectAll(rewritePlan.length)}
                className="text-sm font-extrabold underline opacity-80 hover:opacity-100"
              >
                Select all
              </button>

              <button
                type="button"
                onClick={selectNone}
                className="text-sm font-extrabold underline opacity-80 hover:opacity-100"
              >
                Select none
              </button>
            </div>
          </div>


              <div className="mt-3 grid gap-3">
                {rewritePlan.map((item, i) => {
                  const original = planItemToText(item);
                  const rewritten = String(item?.rewrittenBullet ?? "").trim();
                  const isSelected = selectedBulletIdx.has(i);

                  const before = computeVerbStrength(original);
                  const after = rewritten ? computeVerbStrength(rewritten) : undefined;

                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black/10"
                    >
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(i)}
                          className="h-4 w-4"
                        />
                        <strong className="text-sm">Bullet #{i + 1}</strong>

                        <span className="ml-auto flex flex-wrap items-center gap-2">
                          <Chip text={`Original: ${before.label} (${before.score})`} muted />
                          {after ? <Chip text={`Rewrite: ${after.label} (${after.score})`} /> : null}
                        </span>
                      </label>

                      <div className="mt-3 text-sm leading-relaxed">
                        <div className="mb-1 text-xs font-extrabold text-black/60 dark:text-white/60">
                          Original
                        </div>
                        <div className="text-black/90 dark:text-white/90">
                          {original || <em>(empty)</em>}
                        </div>
                      </div>

                      {rewritten ? (
                        <div className="mt-3 text-sm leading-relaxed">
                          <div className="mb-1 text-xs font-extrabold text-black/60 dark:text-white/60">
                            Rewrite
                          </div>
                          <div className="text-black/90 dark:text-white/90">{rewritten}</div>
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRewriteBullet(i)}
                          disabled={loadingRewriteIndex !== null}
                          className="rounded-xl border border-black/10 bg-black px-3 py-2 text-sm font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
                        >
                          {loadingRewriteIndex === i ? "Rewriting…" : "Rewrite this bullet"}
                        </button>

                        {item?.suggestedKeywords?.length ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-extrabold text-black/60 dark:text-white/60">
                              Suggested:
                            </span>
                            {keywordsToArray(item.suggestedKeywords)
                              .slice(0, 10)
                              .map((k) => (
                                <Chip key={k} text={k} />
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
