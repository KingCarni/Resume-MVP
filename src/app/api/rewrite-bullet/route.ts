import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { extractResumeBullets } from "@/lib/bullets";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";

export const runtime = "nodejs";

function normalizeText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await mammoth.extractRawText({ buffer });
  return parsed?.value ?? "";
}

async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());

  // Use pdfjs legacy build for Node stability
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Disable worker in Node
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }

  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
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

    // multipart/form-data (file upload)
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText");

      jobText = normalizeText(job);

      if (file && file instanceof File) {
        // basic size guard
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: "File too large. Max size is 5MB." },
            { status: 400 }
          );
        }

        resumeText = normalizeText(await extractResumeTextFromFile(file));
      } else {
        resumeText = normalizeText(resumeTextFallback);
      }
    }
    // application/json (your existing flow)
    else if (contentType.includes("application/json")) {
      const body = await req.json();
      resumeText = normalizeText(body.resumeText);
      jobText = normalizeText(body.jobText ?? body.jobPostingText);
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

    if (resumeText.length < 500) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Resume text too short. If you uploaded a PDF, it may be scanned (image-based). Try a DOCX or paste text.",
        },
        { status: 400 }
      );
    }

    // Your existing analysis pipeline (unchanged)
    const analysis = analyzeKeywordFit(resumeText, jobText);
    const bullets = extractResumeBullets(resumeText);

    const { bulletSuggestions, weakBullets } = suggestKeywordsForBullets(
      bullets,
      jobText,
      analysis.missingKeywords
    );

    const rewritePlan = buildRewritePlan(bulletSuggestions);

    return NextResponse.json({
      ok: true,
      ...analysis,
      bullets,
      bulletSuggestions,
      weakBullets,
      rewritePlan,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to analyze input" },
      { status: 500 }
    );
  }
}
