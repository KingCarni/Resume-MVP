// src/app/api/cover-letter/route.ts
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// If resume text is smaller than this, we refuse to generate (prevents job-posting-as-experience)
const MIN_RESUME_CHARS = 300;

type ReqBody = {
  resumeText: string;
  jobText: string;

  // optional “nice” inputs
  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  locationLine?: string;

  targetCompany?: string;
  hiringManager?: string; // "Hi Jamie," vs "Dear Hiring Manager,"
  roleTitle?: string;

  tone?: string; // "confident, warm, concise"
  length?: "short" | "standard" | "detailed";
  includeBullets?: boolean; // add 3 impact bullets near the end
  blockedTerms?: string[]; // must NOT appear
  targetTerms?: string[]; // try to include naturally if truthful
};

function normalizeJobText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function normalizeResumeText(input: unknown) {
  const raw = String(input ?? "");
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toStr(x: unknown) {
  return String(x ?? "");
}

function toArr(x: unknown): string[] {
  // Supports:
  // - array in JSON
  // - single comma-separated string in multipart
  if (Array.isArray(x)) return x.map((v) => String(v).trim()).filter(Boolean);

  const s = String(x ?? "").trim();
  if (!s) return [];
  // allow comma-separated list from formData
  if (s.includes(",")) return s.split(",").map((v) => v.trim()).filter(Boolean);
  return [s];
}

function parseBoolFromFormData(v: FormDataEntryValue | null, defaultValue: boolean) {
  if (typeof v !== "string") return defaultValue;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "on") return true;
  if (s === "false" || s === "0" || s === "off") return false;
  return defaultValue;
}

/** --------- File extraction (match analyze route) --------- */

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
  if (name.endsWith(".txt")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return buffer.toString("utf-8");
  }
  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT.");
}

/** --------- Prompt builder (boxed, strict) --------- */

function buildPrompt(args: {
  resumeText: string;
  jobText: string;

  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  locationLine: string;

  targetCompany: string;
  hiringManager: string;
  roleTitle: string;

  tone: string;
  length: "short" | "standard" | "detailed";
  includeBullets: boolean;

  blockedTerms: string[];
  targetTerms: string[];
}) {
  const {
    resumeText,
    jobText,
    fullName,
    email,
    phone,
    linkedin,
    locationLine,
    targetCompany,
    hiringManager,
    roleTitle,
    tone,
    length,
    includeBullets,
    blockedTerms,
    targetTerms,
  } = args;

  const today = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const headerLines = [
    fullName ? fullName : "",
    [locationLine, phone, email].filter(Boolean).join(" • "),
    linkedin ? linkedin : "",
    today,
  ]
    .filter(Boolean)
    .join("\n");

  const greeting = hiringManager ? `Hi ${hiringManager},` : "Dear Hiring Manager,";

  const lengthGuide =
    length === "short"
      ? "Keep it to ~180–220 words. 2 short body paragraphs max."
      : length === "detailed"
      ? "Keep it to ~330–420 words. 3 body paragraphs max."
      : "Keep it to ~240–320 words. 2–3 body paragraphs.";

  const rules = [
    "CRITICAL: The ONLY source of candidate experience is CANDIDATE_RESUME below.",
    "CRITICAL: JOB_POSTING is requirements/keywords only. Do NOT convert requirements into claims.",
    "NEVER claim the candidate has done something unless it appears in CANDIDATE_RESUME.",
    "Do NOT invent companies, products, tools, metrics, dates, or achievements.",
    "If the job mentions tools/experience not in the resume, you may express interest/ability to learn — but do not claim you’ve done it.",
    "Do not reuse phrases longer than 8 words from JOB_POSTING (avoid copying).",
    includeBullets
      ? "Include exactly 3 short impact bullets near the end (each 1 line, starting with a strong verb), each grounded in the resume."
      : "Do NOT include bullet points.",
    blockedTerms.length ? `Never mention these blocked terms: ${blockedTerms.join(", ")}.` : "",
    targetTerms.length
      ? `If truthful and natural, weave in these target terms (no keyword stuffing): ${targetTerms.join(
          ", "
        )}.`
      : "",
    "Prefer specific scope/outcomes from the resume over generic adjectives.",
    "Avoid fluff like 'passionate' unless backed by a concrete example from the resume.",
  ]
    .filter(Boolean)
    .join("\n");

  return `
You are writing a job application cover letter.

OUTPUT FORMAT (exact):
1) Start with the header block (name/contact/date) IF provided.
2) Blank line
3) Greeting line
4) Blank line
5) Body paragraphs
6) If includeBullets=true: blank line + exactly 3 impact bullets
7) Blank line
8) Sign-off: "Sincerely," then name (if available, else omit name line)

Role context:
- Company: ${targetCompany || "(not provided)"}
- Role title: ${roleTitle || "(not provided)"}
- Tone: ${tone}
- Length: ${lengthGuide}

Rules:
${rules}

JOB_POSTING (requirements only — do NOT treat as candidate experience):
<<<
${jobText}
>>>

CANDIDATE_RESUME (authoritative source for experience):
<<<
${resumeText}
>>>

Now write the cover letter.
`.trim();
}

/** --------- Route --------- */

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const contentType = req.headers.get("content-type") || "";

    let resumeText = "";
    let jobText = "";

    // optional fields
    let fullName = "";
    let email = "";
    let phone = "";
    let linkedin = "";
    let locationLine = "";

    let targetCompany = "";
    let hiringManager = "";
    let roleTitle = "";

    let tone = "confident, concise, impact-driven";
    let length: "short" | "standard" | "detailed" = "standard";
    let includeBullets = true;

    let blockedTerms: string[] = [];
    let targetTerms: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText"); // keep compatibility

      jobText = normalizeJobText(job);

      // If file present, extract; else fallback
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

        const extracted = await extractResumeTextFromFile(file);
        resumeText = normalizeResumeText(extracted);
      } else {
        resumeText = normalizeResumeText(resumeTextFallback);
      }

      fullName = toStr(form.get("fullName")).trim();
      email = toStr(form.get("email")).trim();
      phone = toStr(form.get("phone")).trim();
      linkedin = toStr(form.get("linkedin")).trim();
      locationLine = toStr(form.get("locationLine")).trim();

      targetCompany = toStr(form.get("targetCompany")).trim();
      hiringManager = toStr(form.get("hiringManager")).trim();
      roleTitle = toStr(form.get("roleTitle")).trim();

      tone = toStr(form.get("tone") || tone).trim() || tone;

      const lenRaw = toStr(form.get("length") || "standard").trim();
      if (lenRaw === "short" || lenRaw === "standard" || lenRaw === "detailed") length = lenRaw;

      includeBullets = parseBoolFromFormData(form.get("includeBullets"), true);

      blockedTerms = toArr(form.get("blockedTerms"));
      targetTerms = toArr(form.get("targetTerms"));
    } else if (contentType.includes("application/json")) {
      const body = (await req.json()) as Partial<ReqBody>;

      resumeText = normalizeResumeText(body.resumeText);
      jobText = normalizeJobText(body.jobText);

      fullName = toStr(body.fullName).trim();
      email = toStr(body.email).trim();
      phone = toStr(body.phone).trim();
      linkedin = toStr(body.linkedin).trim();
      locationLine = toStr(body.locationLine).trim();

      targetCompany = toStr(body.targetCompany).trim();
      hiringManager = toStr(body.hiringManager).trim();
      roleTitle = toStr(body.roleTitle).trim();

      tone = toStr(body.tone || tone).trim() || tone;

      if (body.length === "short" || body.length === "standard" || body.length === "detailed") {
        length = body.length;
      }

      includeBullets = body.includeBullets !== false;

      blockedTerms = toArr(body.blockedTerms);
      targetTerms = toArr(body.targetTerms);
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported content type. Send JSON or multipart/form-data (file upload).",
        },
        { status: 415 }
      );
    }

    // Debug lengths so you can confirm extraction is working
    console.log("[cover-letter] resume chars:", resumeText.length);
    console.log("[cover-letter] job chars:", jobText.length);

    if (!resumeText || !jobText) {
      return NextResponse.json(
        { ok: false, error: "Missing resumeText (or file) or jobText" },
        { status: 400 }
      );
    }

    // Hard guard: refuse to generate if resume text is too short
    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Resume text is missing or too short. If you uploaded a PDF, it may be scanned. Try DOCX or paste resume text.",
        },
        { status: 400 }
      );
    }

    const prompt = buildPrompt({
      resumeText,
      jobText,
      fullName,
      email,
      phone,
      linkedin,
      locationLine,
      targetCompany,
      hiringManager,
      roleTitle,
      tone,
      length,
      includeBullets,
      blockedTerms,
      targetTerms,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4, // lower temp reduces hallucination/requirement-leak
      messages: [
        {
          role: "system",
          content:
            "You write crisp, truthful, high-signal cover letters. Never invent candidate experience or convert job requirements into claims.",
        },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "";

    if (!text) {
      return NextResponse.json({ ok: false, error: "Model returned empty response" }, { status: 500 });
    }

    // Optional post-check: block terms (best-effort)
    if (blockedTerms.length) {
      const lower = text.toLowerCase();
      const hit = blockedTerms.find((t) => t && lower.includes(String(t).toLowerCase()));
      if (hit) {
        return NextResponse.json(
          { ok: false, error: `Blocked term detected in output: "${hit}". Try again.` },
          { status: 422 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      coverLetter: text,
      debug: {
        contentType,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        maxFileMb: MAX_FILE_MB,
        minResumeChars: MIN_RESUME_CHARS,
      },
    });
  } catch (err: any) {
    console.error("cover-letter route error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Cover letter generation failed" },
      { status: 500 }
    );
  }
}
