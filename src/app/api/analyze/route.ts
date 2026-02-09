import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { extractResumeBullets } from "@/lib/bullets";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * Job postings can be flattened to a single paragraph safely.
 */
function normalizeJobText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Resumes must preserve newlines or we destroy bullet structure.
 * - normalize spaces/tabs within lines
 * - preserve \n
 * - collapse huge blank gaps
 */
function normalizeResumeText(input: unknown) {
  const raw = String(input ?? "");
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pull ONLY the Experience section from the resume text.
 * Priority:
 * 1) If we find "Professional Experience", slice from there -> next major heading
 * 2) Otherwise, heuristically start at first job header line with date range
 *    and end at Skills / Certificates / References / etc.
 */
function extractExperienceSection(fullText: string) {
  const text = normalizeResumeText(fullText);
  const lower = text.toLowerCase();

  const endHeadingRegex =
    /\n\s*(skills|certificates|certifications|education|projects|references|areas of expertise|summary|technical skills)\b/i;

  // 1) Preferred explicit heading
  const startNeedle = "professional experience";
  const startIdx = lower.indexOf(startNeedle);

  if (startIdx !== -1) {
    const afterStart = text.slice(startIdx);
    const endMatch = afterStart.match(endHeadingRegex);
    const endIdx = endMatch?.index;

    const experienceText =
      typeof endIdx === "number" && endIdx > 0
        ? afterStart.slice(0, endIdx)
        : afterStart;

    return {
      experienceText: normalizeResumeText(experienceText),
      foundSection: true,
      mode: "heading",
    };
  }

  // 2) Fallback: find first job header line (company + date range + role)
  const lines = text.split("\n");
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";

  const dateRangeRegex = new RegExp(
    `\\b${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present)\\b`,
    "i"
  );

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (dateRangeRegex.test(l) && l.length >= 25) {
      startLine = i;
      break;
    }
  }

  if (startLine === -1) {
    // No obvious job headers: fall back to full text (filters will still clean it)
    return { experienceText: text, foundSection: false, mode: "none" };
  }

  const afterStart = lines.slice(startLine).join("\n");
  const endMatch = afterStart.match(endHeadingRegex);
  const endIdx = endMatch?.index;

  const experienceText =
    typeof endIdx === "number" && endIdx > 0
      ? afterStart.slice(0, endIdx)
      : afterStart;

  return {
    experienceText: normalizeResumeText(experienceText),
    foundSection: true,
    mode: "heuristic",
  };
}

/**
 * Strong cleaning for pasted resumes:
 * - removes contact/header lines (P:, E:, L:, emails, linkedin, URLs)
 * - removes job header lines (company + date range + role)
 * - removes "Games Shipped:" lines (with or without 🎮)
 * - keeps real bullets + meaningful long lines inside experience
 */
function filterExperienceLinesToBullets(experienceText: string): string[] {
  const lines = normalizeResumeText(experienceText)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Contact/header junk
  const contactPrefixRegex = /^(p:|e:|l:)\s*/i;
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlRegex = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
  const linkedinRegex = /\blinkedin\.com\/in\/\S+/i;

  // Headings / section labels
  const headingRegex =
    /^(skills|certificates|certifications|education|projects|references|areas of expertise|summary|technical skills)\b/i;

  // ✅ NEW: "Games Shipped" junk
  const gamesShippedRegex = /^(\u{1F3AE}\s*)?games shipped:/iu; // 🎮 optional

  // Job header line detection (no pipes)
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const dateRangeRegex = new RegExp(
    `\\b${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present)\\b`,
    "i"
  );

  // Bullets (also catches the odd "o" and "" lines from Word/Outlook paste)
  const bulletPrefixRegex = /^(\u2022|•|-|\*|·|o|)\s+/;

  const kept: string[] = [];

  for (const l0 of lines) {
    const l = l0.replace(/\s+/g, " ").trim();
    if (!l) continue;

    // remove section headings
    if (headingRegex.test(l)) continue;

    // ✅ remove "Games Shipped" lines
    if (gamesShippedRegex.test(l)) continue;

    // remove contact lines + standalone email/url/linkedin lines
    if (contactPrefixRegex.test(l)) continue;
    if (linkedinRegex.test(l)) continue;
    if (urlRegex.test(l) && l.length < 90) continue;
    if (emailRegex.test(l) && l.length < 90) continue;

    // remove job header lines (company + date range + role)
    if (dateRangeRegex.test(l) && l.length >= 25) continue;

    // keep real bullets (strip prefix)
    if (bulletPrefixRegex.test(l)) {
      const stripped = l.replace(bulletPrefixRegex, "").trim();
      if (stripped.length >= 18) kept.push(stripped);
      continue;
    }

    // otherwise only keep “content-like” lines
    if (l.length >= 30) kept.push(l);
  }

  return kept.slice(0, 160);
}

/**
 * Fallback bullet extraction for when your lib extractor returns [].
 * Applies to the experience slice (not entire resume).
 */
function fallbackExtractBullets(text: string): string[] {
  const cleaned = normalizeResumeText(text);

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const bulletRegex = /^(\u2022|•|-|\*|·|\d+\.)\s+/;

  const bulletLike = lines.filter((l) => bulletRegex.test(l));
  if (bulletLike.length) {
    return bulletLike
      .map((l) => l.replace(bulletRegex, "").trim())
      .filter((l) => l.length >= 18)
      .slice(0, 160);
  }

  if (cleaned.includes("•")) {
    const parts = cleaned
      .split("•")
      .map((p) => p.trim())
      .filter((p) => p.length >= 18);

    if (parts.length) return parts.slice(0, 160);
  }

  const reasonableLines = lines
    .filter((l) => l.length >= 18)
    .filter((l) => !/^(summary|skills|experience|education|projects)\b/i.test(l))
    // ✅ also drop games shipped lines here, just in case
    .filter((l) => !/^(\u{1F3AE}\s*)?games shipped:/iu.test(l))
    .slice(0, 160);

  if (reasonableLines.length >= 6) return reasonableLines;

  const sentenceish = cleaned
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 220)
    .slice(0, 120);

  return sentenceish;
}

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await mammoth.extractRawText({ buffer });
  return parsed?.value ?? "";
}

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

async function extractResumeTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return extractTextFromDocx(file);
  if (name.endsWith(".pdf")) return extractTextFromPdf(file);
  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let resumeText = "";
    let jobText = "";

    // ✅ FILE UPLOAD PATH
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText");

      jobText = normalizeJobText(job);

      if (file && file instanceof File) {
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json(
            {
              ok: false,
              error: `File too large. Max size is ${MAX_FILE_MB}MB. Tip: if the PDF is huge due to graphics, export an "optimized/compressed" PDF or upload DOCX.`,
            },
            { status: 400 }
          );
        }

        const extracted = await extractResumeTextFromFile(file);
        resumeText = normalizeResumeText(extracted);
      } else {
        resumeText = normalizeResumeText(resumeTextFallback);
      }
    }
    // ✅ JSON PASTE PATH
    else if (contentType.includes("application/json")) {
      const body = await req.json();
      resumeText = normalizeResumeText(body.resumeText);
      jobText = normalizeJobText(body.jobText ?? body.jobPostingText);
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unsupported content type. Send JSON or multipart/form-data (file upload).",
        },
        { status: 415 }
      );
    }

    // Validation
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
            "Resume text too short. If you uploaded a PDF, it may be scanned (image-only). Try DOCX or paste text.",
        },
        { status: 400 }
      );
    }

    // Analysis (full resume)
    const analysis: any = analyzeKeywordFit(resumeText, jobText);

    // ✅ Experience slicing (heading-based OR heuristic)
    const { experienceText, foundSection, mode } =
      extractExperienceSection(resumeText);

    // ✅ Extract bullets from experience only
    let bullets: string[] = [];

    // 1) Try your lib extractor on experience slice
    try {
      bullets = extractResumeBullets(experienceText) || [];
    } catch {
      bullets = [];
    }

    // 2) Strong experience filters (handles pasted resumes well)
    const filtered = filterExperienceLinesToBullets(experienceText);
    if (filtered.length) {
      bullets = filtered;
    }

    // 3) If still empty, fallback extraction on experience slice
    if (!bullets.length) {
      bullets = fallbackExtractBullets(experienceText);

      // last pass remove job header lines if any slip in
      const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
      const year = "(19|20)\\d{2}";
      const dateRangeRegex = new RegExp(
        `\\b${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present)\\b`,
        "i"
      );
      bullets = bullets.filter((b) => !dateRangeRegex.test(b));
      bullets = bullets.filter(
        (b) => !/^(\u{1F3AE}\s*)?games shipped:/iu.test(b)
      );
    }

    // Suggestions
    let bulletSuggestions: any[] = [];
    let weakBullets: any[] = [];

    try {
      const suggestionResult: any = suggestKeywordsForBullets(
        bullets,
        jobText,
        analysis.missingKeywords
      );
      bulletSuggestions = suggestionResult?.bulletSuggestions ?? [];
      weakBullets = suggestionResult?.weakBullets ?? [];
    } catch {
      bulletSuggestions = [];
      weakBullets = [];
    }

    // Rewrite plan
    let rewritePlan: any[] = [];
    try {
      rewritePlan = buildRewritePlan(bulletSuggestions);
    } catch {
      rewritePlan = [];
    }

    // ✅ Always provide a rewritePlan if bullets exist
    if (!Array.isArray(rewritePlan) || rewritePlan.length === 0) {
      const seedKeywords = (
        analysis.highImpactMissing ||
        analysis.missingKeywords ||
        []
      ).slice(0, 5);

      rewritePlan = bullets.slice(0, 25).map((b) => ({
        originalBullet: b,
        suggestedKeywords: seedKeywords,
        rewrittenBullet: "",
      }));
    }

    return NextResponse.json({
      ok: true,
      ...analysis,
      bullets,
      bulletSuggestions,
      weakBullets,
      rewritePlan,
      debug: {
        contentType,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        experienceLen: experienceText.length,
        foundExperienceSection: foundSection,
        experienceMode: mode,
        bulletsCount: bullets.length,
        rewritePlanCount: Array.isArray(rewritePlan) ? rewritePlan.length : 0,
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
