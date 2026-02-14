// src/app/api/analyze/route.ts
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { extractResumeBullets } from "@/lib/extractResumeBullets";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";
import { computeVerbStrength } from "@/lib/verb_strength";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * ✅ Local compat type: the /lib/bullet_suggestions module expects ResumeBullet[]
 * but our extraction pipeline produces string[].
 */
type ResumeBullet = {
  id: string;
  text: string;
  jobId?: string;
};

function normalizeJobText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function normalizeResumeText(input: unknown) {
  const raw = String(input ?? "");
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ---------------- DOCX helpers (FIX: preserve list bullets) ---------------- */

function stripTagsToText(html: string) {
  return String(html ?? "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractLiText(html: string): string[] {
  const matches = [...String(html ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const bullets = matches
    .map((m) => stripTagsToText(m[1]))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(bullets));
}

/**
 * Extract DOCX in a bullet-aware way:
 * - Convert to HTML (keeps lists)
 * - Pull <li> items as bullets
 * - Also provide a plain-text version that includes "- " lines so downstream parsers work
 */
async function extractDocxTextAndBullets(file: File): Promise<{
  text: string;
  bullets: string[];
  html: string;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // Prefer HTML conversion (preserves lists)
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const bullets = extractLiText(html);

  // Plain text from HTML
  const text = stripTagsToText(html);

  // Make sure bullet markers exist in the text for any existing detectors
  const textWithBullets =
    bullets.length > 0 ? `${text}\n\n${bullets.map((b) => `- ${b}`).join("\n")}` : text;

  return { text: textWithBullets, bullets, html };
}

/** ---------------- Experience section slicing ---------------- */

/**
 * Pull ONLY the Experience section from the resume text.
 * Priority:
 * 1) Recognize headings ("Employment History", "Work Experience", etc.) and slice until next major heading
 * 2) Otherwise, heuristically start at first job header line with a date range and end at Skills / Certificates / References / etc.
 */
function extractExperienceSection(fullText: string) {
  const text = normalizeResumeText(fullText);
  const lower = text.toLowerCase();

  // More inclusive end headings (avoid ending too early if "summary" appears near top)
  const endHeadingRegex =
    /\n\s*(skills|personal skills|technical skills|certificates|certifications|education|projects|references|achievements|training|volunteer|interests)\b/i;

  // Accept common experience headings
  const startNeedles = [
    "professional experience",
    "work experience",
    "employment history",
    "experience",
  ];

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

    const experienceText =
      typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

    return {
      experienceText: normalizeResumeText(experienceText),
      foundSection: true,
      mode: `heading:${bestNeedle}`,
    };
  }

  // Heuristic fallback: find first date-range-ish line
  const lines = text.split("\n");
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const dash = "[–—-]";
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

  if (startLine === -1) {
    return { experienceText: text, foundSection: false, mode: "none" };
  }

  const afterStart = lines.slice(startLine).join("\n");
  const endMatch = afterStart.match(endHeadingRegex);
  const endIdx = endMatch?.index;

  const experienceText =
    typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

  return {
    experienceText: normalizeResumeText(experienceText),
    foundSection: true,
    mode: "heuristic",
  };
}

/**
 * Option B: capture metadata blocks (not bullets):
 * - Games Shipped lines
 * - Metrics clusters
 */
function extractMetaBlocks(fullText: string) {
  const text = normalizeResumeText(fullText);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const gamesShippedRegex = /^(\u{1F3AE}\s*)?games shipped:/iu;
  const metricLikeRegex =
    /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b)/i;

  const gamesShipped: string[] = [];
  const metrics: string[] = [];

  for (const l0 of lines) {
    const l = l0.replace(/\s+/g, " ").trim();
    if (!l) continue;

    if (gamesShippedRegex.test(l)) {
      gamesShipped.push(l);
      continue;
    }

    if (l.length <= 110 && metricLikeRegex.test(l)) {
      // avoid date ranges being treated as metrics
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(19|20)\d{2}\b/i.test(l))
        continue;

      // avoid phone numbers
      if (/\b\d{3}[-.)\s]*\d{3}[-.\s]*\d{4}\b/.test(l)) continue;

      metrics.push(l);
      continue;
    }
  }

  return {
    gamesShipped: Array.from(new Set(gamesShipped)).slice(0, 30),
    metrics: Array.from(new Set(metrics)).slice(0, 50),
  };
}

/** ---------------- File extraction ---------------- */

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = (content.items || [])
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean);

    text += strings.join(" ") + "\n";
  }

  return text;
}

/**
 * Return BOTH resumeText and any bullets we can confidently extract at file-read time.
 * (DOCX lists often get lost if you only extract raw text.)
 */
async function extractResumeFromFile(file: File): Promise<{
  text: string;
  bulletsFromFile?: string[];
}> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) {
    const { text, bullets } = await extractDocxTextAndBullets(file);
    return { text, bulletsFromFile: bullets };
  }

  if (name.endsWith(".pdf")) {
    const text = await extractTextFromPdf(file);
    return { text, bulletsFromFile: undefined };
  }

  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}

function parseOnlyExperienceFlagFromFormData(v: FormDataEntryValue | null) {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "on") return true;
  if (s === "false" || s === "0" || s === "off") return false;
  return undefined;
}

/**
 * ✅ Convert extracted string bullets (+ optional jobId mapping) into ResumeBullet[]
 * to satisfy suggestKeywordsForBullets(bullets: ResumeBullet[], ...)
 */
function normalizeBulletsForSuggestions(args: {
  bullets: string[];
  bulletJobIds?: string[];
  fallbackJobId?: string;
}) {
  const { bullets, bulletJobIds, fallbackJobId } = args;

  return (bullets || [])
    .map((t0, i) => {
      const text = String(t0 || "").trim();
      if (!text) return null;

      const jobId = bulletJobIds?.[i] || fallbackJobId || "job_default";

      const b: ResumeBullet = {
        id: `b${i + 1}`,
        text,
        jobId,
      };
      return b;
    })
    .filter((x): x is ResumeBullet => Boolean(x));
}

/** --------- Route --------- */

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let resumeText = "";
    let jobText = "";
    let onlyExperienceBullets: boolean = true;

    // NEW: file-level bullets (DOCX <li> extraction)
    let bulletsFromFile: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText");

      const flagRaw = form.get("onlyExperienceBullets");
      const parsedFlag = parseOnlyExperienceFlagFromFormData(flagRaw);
      if (typeof parsedFlag === "boolean") onlyExperienceBullets = parsedFlag;

      jobText = normalizeJobText(job);

      if (file && file instanceof File) {
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json(
            {
              ok: false,
              error: `File too large. Max size is ${MAX_FILE_MB}MB. Tip: export an optimized PDF or upload DOCX.`,
            },
            { status: 400 }
          );
        }

        const extracted = await extractResumeFromFile(file);
        resumeText = normalizeResumeText(extracted.text);
        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];
      } else {
        resumeText = normalizeResumeText(resumeTextFallback);
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      resumeText = normalizeResumeText(body.resumeText);
      jobText = normalizeJobText(body.jobText ?? body.jobPostingText);

      if (typeof body.onlyExperienceBullets === "boolean") {
        onlyExperienceBullets = body.onlyExperienceBullets;
      }
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported content type. Send JSON or multipart/form-data (file upload).",
        },
        { status: 415 }
      );
    }

    if (!resumeText || !jobText) {
      return NextResponse.json(
        { ok: false, error: "Missing resumeText (or file) or jobText" },
        { status: 400 }
      );
    }

    if (resumeText.length < 300) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Resume text too short. If you uploaded a PDF, it may be scanned. Try DOCX or paste text.",
        },
        { status: 400 }
      );
    }

    const analysis: any = analyzeKeywordFit(resumeText, jobText);
    const metaBlocks = extractMetaBlocks(resumeText);

    const experienceSlice = extractExperienceSection(resumeText);
    const bulletSourceText = onlyExperienceBullets ? experienceSlice.experienceText : resumeText;

    /**
     * ✅ Support BOTH extractor return shapes
     * - old: string[]
     * - new: { bullets: string[]; jobs: ExtractedJob[] }
     *
     * We run strict extraction on experience text, and if empty we try bulletSourceText.
     * PLUS: for DOCX, we can use bulletsFromFile as an additional fallback.
     */
    let experienceJobs: any[] = [];
    let bullets: string[] = [];
    let bulletJobIds: string[] = [];

    const normalizeJobs = (jobsIn: any[]) =>
      (Array.isArray(jobsIn) ? jobsIn : []).map((j) => ({
        id: String(j?.id ?? "job_default"),
        company: String(j?.company || "Company"),
        title: String(j?.title || "Role"),
        dates: String(j?.dates || "Dates"),
        location: j?.location ? String(j.location) : "",
        bullets: Array.isArray(j?.bullets)
          ? j.bullets.map((b: any) => String(b || "").trim()).filter(Boolean)
          : [],
      }));

    const flattenFromJobs = (jobsIn: any[]) => {
      const outBullets: string[] = [];
      const outJobIds: string[] = [];
      for (const job of jobsIn) {
        for (const b of job.bullets || []) {
          const t = String(b || "").trim();
          if (!t) continue;
          outBullets.push(t);
          outJobIds.push(job.id);
        }
      }
      return { outBullets, outJobIds };
    };

    const tryExtract = (text: string) => {
      try {
        const maybe: any = extractResumeBullets(text);
        if (Array.isArray(maybe)) {
          return { bullets: maybe as string[], jobs: [] as any[] };
        }
        return {
          bullets: Array.isArray(maybe?.bullets) ? (maybe.bullets as string[]) : [],
          jobs: Array.isArray(maybe?.jobs) ? maybe.jobs : [],
        };
      } catch {
        return { bullets: [] as string[], jobs: [] as any[] };
      }
    };

    // 0) If we have DOCX list bullets, seed them first (they’re usually the most reliable)
    // We'll still prefer structured jobs from extractResumeBullets if available.
    const seededFileBullets = (bulletsFromFile || [])
      .map((b) => String(b || "").trim())
      .filter(Boolean);

    // 1) strict on experience slice
    const strict1 = tryExtract(experienceSlice.experienceText);
    experienceJobs = normalizeJobs(strict1.jobs);
    const flat1 = flattenFromJobs(experienceJobs);
    bullets = flat1.outBullets;
    bulletJobIds = flat1.outJobIds;

    // 2) if no bullets, try bulletSourceText (full resume if toggle off)
    if (!bullets.length) {
      const strict2 = tryExtract(bulletSourceText);

      // if we got jobs with bullets, prefer that
      const jobs2 = normalizeJobs(strict2.jobs);
      const flat2 = flattenFromJobs(jobs2);

      if (flat2.outBullets.length) {
        experienceJobs = jobs2;
        bullets = flat2.outBullets;
        bulletJobIds = flat2.outJobIds;
      } else {
        // otherwise use flat bullets if provided (no job grouping)
        bullets = (strict2.bullets || [])
          .map((b) => String(b || "").trim())
          .filter(Boolean);

        const fallbackJobId = experienceJobs[0]?.id || "job_default";
        bulletJobIds = bullets.map(() => fallbackJobId);
      }
    }

    // 3) if still empty, fall back to DOCX list bullets (if present)
    if (!bullets.length && seededFileBullets.length) {
      bullets = seededFileBullets;

      const fallbackJobId = experienceJobs[0]?.id || "job_default";
      bulletJobIds = bullets.map(() => fallbackJobId);
    }

    // 4) if still empty, hard fail with useful hint
    if (!bullets.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No bullets detected. Your resume may not use bullet markers (•, -, etc.) or the experience section could not be parsed. Try uploading DOCX, or paste the resume with bullet characters.",
          debug: {
            foundExperienceSection: experienceSlice.foundSection,
            experienceMode: experienceSlice.mode,
            experienceLen: experienceSlice.experienceText.length,
            bulletsFromFileCount: seededFileBullets.length,
          },
        },
        { status: 400 }
      );
    }

    // Suggestions + plan
    let bulletSuggestions: any[] = [];
    let weakBullets: any[] = [];

    try {
      const bulletObjs = normalizeBulletsForSuggestions({
        bullets,
        bulletJobIds,
        fallbackJobId: experienceJobs[0]?.id || "job_default",
      });

      const suggestionResult: any = suggestKeywordsForBullets(
        bulletObjs,
        jobText,
        analysis.missingKeywords
      );

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

    /**
     * ✅ Attach jobId + verb strength (before) onto each plan item.
     * This makes your UI auto-assignment deterministic.
     */
    rewritePlan = (rewritePlan || []).map((item: any, i: number) => {
      const original =
        typeof item?.originalBullet === "string"
          ? item.originalBullet
          : String(item?.originalBullet ?? "");

      const jobId = bulletJobIds[i] || experienceJobs[0]?.id || "job_default";

      return {
        ...item,
        originalBullet: original,
        jobId,
        verbStrength: computeVerbStrength(original, { mode: "before" }),
      };
    });

    return NextResponse.json({
      ok: true,
      ...analysis,

      // ✅ Structured jobs + mapping (for auto sections)
      experienceJobs,
      bullets,
      bulletJobIds,

      bulletSuggestions,
      weakBullets,
      rewritePlan,
      metaBlocks,

      debug: {
        contentType,
        resumeLen: resumeText.length,
        jobLen: jobText.length,

        onlyExperienceBulletsUsed: onlyExperienceBullets,

        experienceLen: experienceSlice.experienceText.length,
        foundExperienceSection: experienceSlice.foundSection,
        experienceMode: experienceSlice.mode,

        bulletsFromFileCount: seededFileBullets.length,

        jobsDetected: experienceJobs.length,
        jobsWithBullets: experienceJobs.filter((j) => j.bullets?.length).length,
        flattenedBulletCount: bullets.length,
        rewritePlanCount: Array.isArray(rewritePlan) ? rewritePlan.length : 0,

        metaGamesCount: metaBlocks.gamesShipped.length,
        metaMetricsCount: metaBlocks.metrics.length,

        maxFileMb: MAX_FILE_MB,
      },
    });
  } catch (e: any) {
    console.error("analyze route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to analyze input" },
      { status: 500 }
    );
  }
}
