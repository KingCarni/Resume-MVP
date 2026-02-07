import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { extractResumeBullets } from "@/lib/bullets";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";

export const runtime = "nodejs";

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
 * Fallback bullet extraction for resumes where your lib extractor returns [].
 * Attempts multiple strategies:
 * 1) Split on newlines and pick bullet-like lines
 * 2) If no bullet-like lines, split on inline "•"
 * 3) If still nothing, take reasonable lines, then sentence-ish chunks
 */
function fallbackExtractBullets(text: string): string[] {
  const cleaned = normalizeResumeText(text);

  // Strategy 1: newline-based extraction
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
      .slice(0, 80);
  }

  // Strategy 2: inline bullet split (common when Word bullets flatten weirdly)
  if (cleaned.includes("•")) {
    const parts = cleaned
      .split("•")
      .map((p) => p.trim())
      .filter((p) => p.length >= 18);

    if (parts.length) return parts.slice(0, 80);
  }

  // Strategy 3: "reasonable" lines (headings removed-ish)
  const reasonableLines = lines
    .filter((l) => l.length >= 18)
    .filter((l) => !/^(summary|skills|experience|education|projects)\b/i.test(l))
    .slice(0, 80);

  if (reasonableLines.length >= 6) return reasonableLines;

  // Strategy 4: sentence-ish chunks from whole text (last resort)
  const sentenceish = cleaned
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 200)
    .slice(0, 60);

  return sentenceish;
}

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await mammoth.extractRawText({ buffer });
  return parsed?.value ?? "";
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // Node-stable PDF parsing
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
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: "File too large. Max size is 5MB." },
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

    // Analysis
    const analysis: any = analyzeKeywordFit(resumeText, jobText);

    // Bullet extraction: lib first, fallback second
    let bullets: string[] = [];
    try {
      bullets = extractResumeBullets(resumeText) || [];
    } catch {
      bullets = [];
    }

    if (!bullets.length) {
      bullets = fallbackExtractBullets(resumeText);
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

    // Rewrite plan: buildRewritePlan first, fallback plan second
    let rewritePlan: any[] = [];
    try {
      rewritePlan = buildRewritePlan(bulletSuggestions);
    } catch {
      rewritePlan = [];
    }

    // ✅ FIX 2: Always provide a rewritePlan if bullets exist
    if (!Array.isArray(rewritePlan) || rewritePlan.length === 0) {
      const seedKeywords = (
        analysis.highImpactMissing ||
        analysis.missingKeywords ||
        []
      ).slice(0, 5);

      rewritePlan = bullets.slice(0, 20).map((b) => ({
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
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        bulletsCount: bullets.length,
        bulletSuggestionsCount: Array.isArray(bulletSuggestions)
          ? bulletSuggestions.length
          : 0,
        rewritePlanCount: Array.isArray(rewritePlan) ? rewritePlan.length : 0,
        contentType,
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
