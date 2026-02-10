"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

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

/**
 * Client-side resume text normalization to improve job header parsing.
 * This specifically helps resumes where the job title appears after the dates (tab/column layout),
 * like: "Prodigy Education ... Feb 2025 – Jan 2026 ... QA Lead"
 *
 * We rewrite those header lines into a more parse-friendly shape:
 *   "Prodigy Education — QA Lead (Feb 2025 – Jan 2026)"
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
    // normalize some weird bullet glyphs to hyphen bullets (doesn't affect headers)
    .replace(/^[\u2022\u00B7o\s]+/gm, (m) => (m.trim() ? "- " : m))
    // collapse repeated spaces *but keep newlines*
    .replace(/[ \t]+/g, " ")
    .trimEnd();

  const lines = cleaned.split("\n");
  const out: string[] = [];

  for (const lineRaw of lines) {
    const line = String(lineRaw ?? "");
    const m = line.match(dateRange);

    // Only try to rewrite header-ish lines:
    // - must contain a date range
    // - should not start with a bullet
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

/** A small helper so new themes don't explode the file size */
function mkThemeCss(opts: {
  font?: "sans" | "serif" | "mono";
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2?: string;
  pageBg?: string;
  bodyBg?: string; // full CSS background value
  headerBg?: string; // background for .top
  cardBg?: string; // for .job/.box
  borderStyle?: "solid" | "dashed" | "dotted";
  radius?: number;
  shadow?: string;
  headerAfterGrid?: boolean;
  hasChips?: boolean;
}) {
  const fontFamily =
    opts.font === "mono"
      ? `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
      : opts.font === "serif"
      ? `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
      : `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

  const radius = typeof opts.radius === "number" ? opts.radius : 16;
  const borderStyle = opts.borderStyle || "solid";
  const shadow = opts.shadow || "0 10px 30px rgba(0,0,0,.06)";
  const bodyBg = opts.bodyBg || opts.pageBg || "#fff";
  const headerBg = opts.headerBg || "linear-gradient(180deg, rgba(0,0,0,.04), rgba(255,255,255,0))";
  const cardBg = opts.cardBg || "#fff";
  const accent2 = opts.accent2 || opts.accent;

  const hasBar = true;

  // Note: chips will only render in buildResumeHtml for some templates.
  // New themes still work; chips just behave like plain contact blocks when not used.
  return `
    :root { --ink:${opts.ink}; --muted:${opts.muted}; --line:${opts.line}; --accent:${opts.accent}; --accent2:${accent2}; }
    body { font-family: ${fontFamily}; color:var(--ink); margin:0; background:${bodyBg}; }
    .page { max-width: 860px; margin: 22px auto; background:${opts.pageBg || "white"}; border:1px ${borderStyle} var(--line); border-radius:${radius}px; overflow:hidden; box-shadow:${shadow}; }
    .top { padding: 24px 26px 18px; background:${headerBg}; border-bottom:1px ${borderStyle} var(--line); position:relative; }
    ${
      opts.headerAfterGrid
        ? `.top:after { content:""; position:absolute; inset:0; background-image: linear-gradient(rgba(0,0,0,0) 24px, rgba(0,0,0,.04) 25px); background-size: 100% 25px; pointer-events:none; }`
        : ""
    }
    .name { font-size: 30px; font-weight: 950; letter-spacing: -.02em; margin:0; }
    .title { margin-top:6px; font-size: 14px; color:var(--muted); font-weight:800; }
    .contact { margin-top:12px; font-size: 12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:10px; }
    .chip { display:inline-block; border:1px ${borderStyle} var(--line); padding:6px 10px; border-radius: 999px; background:${opts.hasChips ? "rgba(255,255,255,.9)" : "transparent"}; }
    .content { padding: 18px 26px 26px; }
    .section { margin-top: 16px; }
    .h { display:flex; align-items:center; gap:10px; margin:0 0 8px; font-size: 13px; font-weight: 950; letter-spacing: .10em; text-transform:uppercase; }
    .bar { height: 10px; width: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent2)); ${hasBar ? "" : "display:none;"} }
    .summary { color:var(--muted); line-height: 1.5; font-size: 13px; }
    .job { margin-top: 12px; border:1px ${borderStyle} var(--line); border-radius: ${Math.max(
      10,
      radius - 2
    )}px; padding: 12px; background:${cardBg}; }
    .jobhead { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .jobtitle { font-weight: 950; }
    .jobmeta { color: var(--muted); font-size: 12px; font-weight:800; }
    ul { margin: 8px 0 0 18px; padding:0; }
    li { margin: 6px 0; line-height: 1.35; }
    .meta { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .box { border:1px ${borderStyle} var(--line); border-radius: ${Math.max(
      10,
      radius - 2
    )}px; padding: 12px; background:${cardBg}; }
    .boxtitle { font-weight: 950; font-size: 12px; color: var(--ink); margin:0 0 6px; }
    .small { font-size: 12px; color: var(--muted); }
    @media print { body{background:white;} .page{box-shadow:none; margin:0; border:none; border-radius:0;} .top:after{display:none;} }
  `;
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
      @media print { body{background:white;} .page{box-shadow:none; margin:0; border:none; border-radius:0;} }
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
      @media print { .page{margin:0; padding:0 10px 10px;} }
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
      @media print { body{background:white;} .page{box-shadow:none; margin:0; border:none; border-radius:0;} .top:after{display:none;} }
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
      @media print { body{background:white;} .page{box-shadow:none; margin:0; border:none; border-radius:0;} .bar{box-shadow:none;} }
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
      @media print {
        body{background:white; color:black;}
        .page{box-shadow:none; margin:0; border:1px solid #ddd; border-radius:0; background:white;}
        .name,.h,.boxtitle{color:#111;}
        .summary,.jobmeta,.contact,.small{color:#333;}
        .chip{background:#fff; border:1px solid #ddd; color:#111;}
      }
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
      @media print { body{background:white;} .page{box-shadow:none; margin:0; border:none; border-radius:0;} }
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
      @media print { .page{border:none; margin:0; padding:0 10px 10px;} }
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
      @media print { .page{border:none; margin:0; padding:0 8px 8px;} }
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
      .contact { margin-top:10px; font-size: 12px; color:var(--muted); display:grid; gap:6px; font-weight:700; }
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
      @media print { body{background:white;} .page{box-shadow:none; margin:0; border:none; border-radius:0;} .side{background:white;} }
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
      @media print { body{background:white;} .page{border:none; margin:0; padding:0 10px 10px;} }
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
      @media print { .page{margin:0; padding:0 10px 10px;} }
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
      @media print { .page{border:none; margin:0; padding:0 8px 8px;} }
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
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(124,58,237,.14), rgba(255,255,255,0)), #fbf8ff",
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
      bodyBg:
        "radial-gradient(900px 520px at 20% 10%, rgba(217,119,6,.14), rgba(255,255,255,0)), #fffbf2",
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

  // ultimate fallback
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

  const contactBits = [
    profile.locationLine?.trim() ? safe(profile.locationLine) : "",
    profile.email?.trim() ? safe(profile.email) : "",
    profile.phone?.trim() ? safe(profile.phone) : "",
    profile.linkedin?.trim() ? safe(profile.linkedin) : "",
    profile.portfolio?.trim() ? safe(profile.portfolio) : "",
  ].filter(Boolean);

  const hasBar =
    template === "modern" ||
    template === "arcade" ||
    template === "neon" ||
    template === "blueprint" ||
    // treat new themes as "modern-style"
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

  if (template === "sidebar") {
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
      <div class="title">${safe(profile.titleLine || "QA Lead / QA Manager")}</div>
      <div class="contact">
        ${contactBits.map((c) => `<div>${c}</div>`).join("")}
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

  // “chip style” contact block for templates that are visually richer
  const useChips = hasBar && template !== "terminal" && template !== "ats" && template !== "compact";
  const topContact = useChips
    ? contactBits.map((c) => `<div class="chip">${c}</div>`).join("")
    : contactBits.map((c) => `<div>${c}</div>`).join("");

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
        <div class="title">${safe(profile.titleLine || "QA Lead / QA Manager")}</div>
        ${inlineSummary}
      </div>
      <div class="contact">
        ${topContact}
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

/** ---------------- Component ---------------- */

const TEMPLATE_OPTIONS: Array<{ id: ResumeTemplateId; label: string }> = [
  // original 12
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

  // +18 = 30 total
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

  // Toggle that gets sent to /api/analyze (Option A behavior)
  const [onlyExperienceBullets, setOnlyExperienceBullets] = useState(true);

  const [sourceCompany, setSourceCompany] = useState("Prodigy Education");
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
    fullName: "Harley Curtis",
    titleLine: "QA Lead / QA Manager",
    locationLine: "Vancouver, BC",
    email: "harleydean17@gmail.com",
    phone: "",
    linkedin: "linkedin.com/in/harley-curtis",
    portfolio: "",
    summary:
      "QA leader with experience shipping games and driving quality outcomes across releases, automation, and cross-functional execution.",
  });

  const [sections, setSections] = useState<ExperienceSection[]>([
    { id: "default", company: "Experience", title: "", dates: "", location: "" },
  ]);

  const [assignments, setAssignments] = useState<Record<number, BulletAssignment>>({});

  const canAnalyze = useMemo(() => {
    const hasResume = !!file || resumeText.trim().length > 0;
    const hasJob = jobText.trim().length > 0;
    return hasResume && hasJob;
  }, [file, resumeText, jobText]);

  function clearFile() {
    setFile(null);
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

      // IMPORTANT: normalize pasted resume text to help the backend recognize job titles
      const resumeTextForApi = resumeText.trim()
        ? normalizeResumeTextForParsing(resumeText.trim())
        : "";

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("jobText", jobText);

        // If the user also pasted text, send the normalized version as a hint
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
    const endpoints = ["/api/rewriteBullet", "/api/rewrite-bullet"];

    let lastRes: Response | null = null;
    let lastPayload: any = null;

    for (const url of endpoints) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await parseApiResponse(res);

      if (logNetworkDebug) {
        console.log(`[rewrite] tried ${url} -> status:`, res.status);
        console.log(`[rewrite] payload from ${url}:`, payload);
      }

      if (res.status !== 404) return { res, payload, url };

      lastRes = res;
      lastPayload = payload;
    }

    return { res: lastRes!, payload: lastPayload, url: endpoints[endpoints.length - 1] };
  }

  async function handleRewriteBullet(index: number) {
    if (!analysis) return;

    const bullets = Array.isArray(analysis.bullets) ? analysis.bullets : [];
    const rewritePlanLocal = Array.isArray(analysis.rewritePlan) ? analysis.rewritePlan : [];
    const planItem = rewritePlanLocal[index];

    const originalBullet = planItemToText(planItem) || bulletToText(bullets[index]).trim();
    const suggestedKeywords = keywordsToArray(planItem?.suggestedKeywords);

    if (!originalBullet) {
      setError(
        "Missing original bullet for rewrite. Re-run Analyze or confirm bullets are being extracted."
      );
      return;
    }

    setLoadingRewriteIndex(index);
    setError(null);

    try {
      const targetProducts = csvToArray(targetProductsCsv);
      const blockedTerms = csvToArray(blockedTermsCsv);

      const requestBody = {
        originalBullet,
        suggestedKeywords,
        jobText,

        sourceCompany: sourceCompany.trim(),
        targetCompany: targetCompany.trim(),
        targetProducts,
        blockedTerms,

        role: "QA Lead",
        tone: "confident, concise, impact-driven",
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
          rewrittenBullet,
          needsMoreInfo,
          notes,
          keywordHits,
          blockedKeywords,
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
    const map: Record<string, string[]> = {};
    for (const s of sections) map[s.id] = [];
    if (!rewritePlan.length) return map;

    for (let i = 0; i < rewritePlan.length; i++) {
      const secId = assignments[i]?.sectionId || sections[0]?.id || "default";
      if (!map[secId]) map[secId] = [];
      map[secId].push(appliedBulletText[i]);
    }
    return map;
  }, [sections, assignments, rewritePlan.length, appliedBulletText]);

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

  function handleDownloadHtml() {
    if (!resumeHtml) return;
    downloadHtml("resume-template.html", resumeHtml);
  }

  function handleViewPreview() {
    if (!resumeHtml) return;
    openPreviewWindow(resumeHtml);
  }

  function handlePrintPdf() {
    if (!resumeHtml) return;
    openPrintWindow(resumeHtml);
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

        <ThemeToggle />
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Resume MVP</h1>
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
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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

            <label className="flex items-center gap-2">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="mt-1 flex flex-wrap items-center gap-2">
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
                Template
                <select
                  value={resumeTemplate}
                  onChange={(e) => setResumeTemplate(e.target.value as ResumeTemplateId)}
                  className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-extrabold outline-none dark:border-white/10 dark:bg-black/20"
                >
                  {TEMPLATE_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
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
        </section>

        {/* Preview */}
        <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold">Preview</h2>
            <div className="text-xs text-black/60 dark:text-white/60">
              {resumeHtml ? "Ready" : "Waiting for rewrite"}
            </div>
          </div>

          {/* PREVIEW TOOLBAR */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              disabled={!resumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Download HTML
            </button>

            <button
              type="button"
              onClick={handleViewPreview}
              disabled={!resumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              View Preview
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={!resumeHtml}
              className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Print / Save PDF
            </button>
          </div>

          {resumeHtml ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-black/10 dark:border-white/10">
              <iframe title="Resume preview" className="h-[720px] w-full border-0" srcDoc={resumeHtml} />
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
                <div className="flex gap-2">
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
