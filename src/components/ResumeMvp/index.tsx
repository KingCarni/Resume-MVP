"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";

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

type ResumeTemplateId = "classic" | "modern" | "minimal";

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

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        border: "1px solid #ddd",
        background: muted ? "#fafafa" : "#f4f4f4",
        color: muted ? "#777" : "#222",
        fontSize: 12,
        fontWeight: 700,
      }}
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
  const palette =
    tone === "warn"
      ? { bg: "#fff7e6", border: "#ffd38a", title: "#6a4b00" }
      : tone === "danger"
      ? { bg: "#ffe8e8", border: "#ffb3b3", title: "#7a1414" }
      : { bg: "#eef6ff", border: "#b9dcff", title: "#0b3b73" };

  return (
    <div
      style={{
        marginBottom: 10,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        padding: 10,
        borderRadius: 10,
      }}
    >
      <div style={{ fontWeight: 900, color: palette.title }}>{title}</div>
      <div style={{ marginTop: 4, opacity: 0.9 }}>{children}</div>
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
    /\b(various|several|some|things|stuff|etc|multiple tasks|as needed)\b/i.test(
      raw
    );

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
  const label: VerbStrength["label"] =
    score < 50 ? "Weak" : score < 80 ? "OK" : "Strong";

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

function templateStyles(template: ResumeTemplateId) {
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
    profile.locationLine?.trim() ? safe(profile.locationLine) : "",
    profile.email?.trim() ? safe(profile.email) : "",
    profile.phone?.trim() ? safe(profile.phone) : "",
    profile.linkedin?.trim() ? safe(profile.linkedin) : "",
    profile.portfolio?.trim() ? safe(profile.portfolio) : "",
  ].filter(Boolean);

  const metaHtml =
    includeMeta && (metaGames.length || metaMetrics.length)
      ? `
    <div class="section">
      <div class="h">${template === "modern" ? `<span class="bar"></span>` : ""}Highlights</div>
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

      const headerRight = [
        sec.location?.trim() ? safe(sec.location) : "",
        safe(sec.dates || ""),
      ]
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
        ${
          template === "modern"
            ? `<div style="margin-top:10px; color:var(--muted); font-size:12px;">
                ${safe(profile.summary || "")}
              </div>`
            : ""
        }
      </div>
      <div class="contact">
        ${
          template === "modern"
            ? contactBits.map((c) => `<div class="chip">${c}</div>`).join("")
            : contactBits.map((c) => `<div>${c}</div>`).join("")
        }
      </div>
    </div>

    <div class="content">
      ${
        template !== "modern"
          ? `<div class="section">
              <div class="h">Summary</div>
              <div class="summary">${safe(profile.summary || "")}</div>
            </div>`
          : ""
      }

      ${metaHtml}

      <div class="section">
        <div class="h">${template === "modern" ? `<span class="bar"></span>` : ""}Experience</div>
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

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 250);
}

function uid(prefix = "sec") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/** ---------------- Component ---------------- */

export default function ResumeMvp() {
  const [resumeText, setResumeText] = useState("");
  const [jobText, setJobText] = useState("");
  const [file, setFile] = useState<File | null>(null);

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

  function setBulletSection(i: number, sectionId: string) {
    setAssignments((prev) => ({ ...prev, [i]: { sectionId } }));
  }

  function addSection() {
    const id = uid();
    setSections((prev) => [
      ...prev,
      { id, company: "Company", title: "Role", dates: "Dates", location: "" },
    ]);
  }

  function deleteSection(sectionId: string) {
    setSections((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== sectionId);
    });

    setAssignments((prev) => {
      const next = { ...prev };
      const fallbackId =
        sections.find((s) => s.id !== sectionId)?.id || sections[0]?.id || "default";
      for (const k of Object.keys(next)) {
        const idx = Number(k);
        if (next[idx]?.sectionId === sectionId) next[idx] = { sectionId: fallbackId };
      }
      return next;
    });
  }

  function moveSection(sectionId: string, dir: -1 | 1) {
    setSections((prev) => {
      const i = prev.findIndex((s) => s.id === sectionId);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  function updateSection(sectionId: string, patch: Partial<ExperienceSection>) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
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

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("jobText", jobText);
        if (resumeText.trim()) fd.append("resumeText", resumeText.trim());
        fd.append("onlyExperienceBullets", String(onlyExperienceBullets));
        res = await fetch("/api/analyze", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText, jobText, onlyExperienceBullets }),
        });
      }

      const payload = await parseApiResponse(res);

      if (logNetworkDebug) {
        console.log("[analyze] status:", res.status);
        console.log("[analyze] onlyExperienceBullets:", onlyExperienceBullets);
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

      const rewritePlan = Array.isArray((payload as any)?.rewritePlan)
        ? ((payload as any).rewritePlan as RewritePlanItem[])
        : [];
      const planLen = rewritePlan.length;

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
          rewritePlan,
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
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      {/* Top Nav */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Link
          href="/resume"
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
            color: "inherit",
          }}
        >
          Resume Compiler
        </Link>
        <Link
          href="/cover-letter"
          style={{
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
            color: "inherit",
          }}
        >
          Cover Letter Generator
        </Link>
      </div>

      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Resume MVP</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Analyze → auto-detect jobs → auto-assign bullets → rewrite selected → generate a clean template.
      </p>

      {error ? (
        <Callout title="Error" tone="danger">
          <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
        </Callout>
      ) : null}

      {/* Minimal working scaffold UI (so the page isn't empty) */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <div
          style={{
            border: "1px solid #e7e7e7",
            borderRadius: 14,
            padding: 14,
            background: "white",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Inputs</h2>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Resume file (optional)</div>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Chip text={file.name} />
                  <button type="button" onClick={clearFile}>
                    Clear
                  </button>
                </div>
              ) : null}
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>
                Resume text (paste if not uploading)
              </div>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={6}
                style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: 10 }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Job posting text</div>
              <textarea
                value={jobText}
                onChange={(e) => setJobText(e.target.value)}
                rows={6}
                style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: 10 }}
              />
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyExperienceBullets}
                onChange={(e) => setOnlyExperienceBullets(e.target.checked)}
              />
              <span style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>
                Only experience bullets
              </span>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Target Company</div>
                <input
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: 10 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Source Company</div>
                <input
                  value={sourceCompany}
                  onChange={(e) => setSourceCompany(e.target.value)}
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: 10 }}
                />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>
                Target Products (comma separated)
              </div>
              <input
                value={targetProductsCsv}
                onChange={(e) => setTargetProductsCsv(e.target.value)}
                style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: 10 }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>
                Blocked Terms (comma separated)
              </div>
              <input
                value={blockedTermsCsv}
                onChange={(e) => setBlockedTermsCsv(e.target.value)}
                style={{ width: "100%", borderRadius: 10, border: "1px solid #ddd", padding: 10 }}
              />
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze || loadingAnalyze}
                style={{
                  padding: "10px 14px",
                  fontWeight: 900,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                }}
              >
                {loadingAnalyze ? "Analyzing…" : "Analyze"}
              </button>

              <button
                type="button"
                onClick={handleRewriteSelected}
                disabled={!analysis || loadingBatchRewrite || selectedCount === 0}
                style={{
                  padding: "10px 14px",
                  fontWeight: 900,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                }}
              >
                {loadingBatchRewrite ? "Rewriting…" : `Rewrite Selected (${selectedCount})`}
              </button>

              <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6 }}>
                <input
                  type="checkbox"
                  checked={includeMetaInResumeDoc}
                  onChange={(e) => setIncludeMetaInResumeDoc(e.target.checked)}
                />
                <span style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Include meta blocks</span>
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Template</span>
                <select
                  value={resumeTemplate}
                  onChange={(e) => setResumeTemplate(e.target.value as ResumeTemplateId)}
                >
                  <option value="modern">modern</option>
                  <option value="classic">classic</option>
                  <option value="minimal">minimal</option>
                </select>
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={showDebugJson}
                  onChange={(e) => setShowDebugJson(e.target.checked)}
                />
                <span style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Show debug</span>
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={logNetworkDebug}
                  onChange={(e) => setLogNetworkDebug(e.target.checked)}
                />
                <span style={{ fontWeight: 800, fontSize: 12, opacity: 0.8 }}>Console logs</span>
              </label>
            </div>

            {debugInjected.length ? (
              <Callout title="Guardrail terms detected in rewrites" tone="warn">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {debugInjected.map((t) => (
                    <Chip key={t} text={t} />
                  ))}
                </div>
              </Callout>
            ) : null}

            {showDebugJson && analysis ? (
              <pre
                style={{
                  marginTop: 10,
                  background: "#0b0b0b",
                  color: "#ddd",
                  padding: 12,
                  borderRadius: 12,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(analysis, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e7e7e7",
            borderRadius: 14,
            padding: 14,
            background: "white",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Preview</h2>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleDownloadHtml}
              disabled={!resumeHtml}
              style={{ padding: "10px 14px", fontWeight: 900, borderRadius: 12, border: "1px solid #ddd" }}
            >
              Download HTML
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={!resumeHtml}
              style={{ padding: "10px 14px", fontWeight: 900, borderRadius: 12, border: "1px solid #ddd" }}
            >
              Print / Save PDF
            </button>
          </div>

          {resumeHtml ? (
            <div style={{ marginTop: 12, border: "1px solid #e7e7e7", borderRadius: 14, overflow: "hidden" }}>
              <iframe
                title="Resume preview"
                style={{ width: "100%", height: 720, border: "none" }}
                srcDoc={resumeHtml}
              />
            </div>
          ) : (
            <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
              Run Analyze + Rewrite to generate the resume HTML.
            </div>
          )}

          {analysis && rewritePlan.length ? (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ margin: "10px 0 6px", fontSize: 14 }}>Rewrite Plan (select bullets)</h3>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => selectAll(rewritePlan.length)}>
                    Select all
                  </button>
                  <button type="button" onClick={selectNone}>
                    Select none
                  </button>
                </div>

                {rewritePlan.map((item, i) => {
                  const original = planItemToText(item);
                  const rewritten = String(item?.rewrittenBullet ?? "").trim();
                  const isSelected = selectedBulletIdx.has(i);

                  const before = computeVerbStrength(original);
                  const after = rewritten ? computeVerbStrength(rewritten) : undefined;

                  return (
                    <div
                      key={i}
                      style={{
                        border: "1px solid #e7e7e7",
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(i)}
                        />
                        <strong style={{ fontSize: 13 }}>Bullet #{i + 1}</strong>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                          <Chip text={`Original: ${before.label} (${before.score})`} muted />
                          {after ? <Chip text={`Rewrite: ${after.label} (${after.score})`} /> : null}
                        </span>
                      </label>

                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35 }}>
                        <div style={{ opacity: 0.7, fontWeight: 800, marginBottom: 4 }}>Original</div>
                        <div>{original || <em>(empty)</em>}</div>
                      </div>

                      {rewritten ? (
                        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35 }}>
                          <div style={{ opacity: 0.7, fontWeight: 800, marginBottom: 4 }}>Rewrite</div>
                          <div>{rewritten}</div>
                        </div>
                      ) : null}

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => handleRewriteBullet(i)}
                          disabled={loadingRewriteIndex !== null}
                          style={{ padding: "6px 10px", fontWeight: 800 }}
                        >
                          {loadingRewriteIndex === i ? "Rewriting…" : "Rewrite this bullet"}
                        </button>

                        {item?.suggestedKeywords?.length ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Suggested:</span>
                            {keywordsToArray(item.suggestedKeywords).slice(0, 10).map((k) => (
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
        </div>
      </div>
    </main>
  );
}
