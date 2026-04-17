// src/app/api/cover-letter/route.ts
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BOOT_TAG = "cover_letter_route_boot_ok";
const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// If resume text is smaller than this, we refuse to generate
const MIN_RESUME_CHARS = 300;

type ReqBody = {
  resumeText: string;
  jobText: string;

  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  locationLine?: string;

  targetCompany?: string;
  hiringManager?: string;
  roleTitle?: string;

  jobId?: string;
  resumeProfileId?: string;
  sourceSlug?: string;
  jobTitle?: string;
  company?: string;
  mode?: "resume" | "cover_letter" | "apply_pack" | "browse";
  bundleSessionId?: string;

  tone?: string;
  length?: "short" | "standard" | "detailed";
  includeBullets?: boolean;
  blockedTerms?: string[];
  targetTerms?: string[];
};

type JobsAnalyticsMode = "resume" | "cover_letter" | "apply_pack" | "browse";

type JobsAnalyticsContext = {
  jobId: string;
  resumeProfileId?: string;
  sourceSlug?: string;
  company?: string;
  jobTitle?: string;
  mode?: JobsAnalyticsMode;
  bundleSessionId?: string;
};

function cleanOptionalString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function buildJobsAnalyticsContext(input: {
  jobId?: unknown;
  resumeProfileId?: unknown;
  sourceSlug?: unknown;
  company?: unknown;
  jobTitle?: unknown;
  mode?: unknown;
  bundleSessionId?: unknown;
}) {
  const jobId = cleanOptionalString(input.jobId);
  if (!jobId) return null;

  const modeRaw = cleanOptionalString(input.mode);
  const mode: JobsAnalyticsMode | undefined =
    modeRaw === "apply_pack" || modeRaw === "cover_letter" || modeRaw === "browse" || modeRaw === "resume"
      ? modeRaw
      : "cover_letter";

  return {
    jobId,
    resumeProfileId: cleanOptionalString(input.resumeProfileId),
    sourceSlug: cleanOptionalString(input.sourceSlug),
    company: cleanOptionalString(input.company),
    jobTitle: cleanOptionalString(input.jobTitle),
    mode,
    bundleSessionId: cleanOptionalString(input.bundleSessionId),
  } satisfies JobsAnalyticsContext;
}

function toSafeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

async function writeJobsAnalyticsEvent(args: {
  userId: string;
  event: string;
  route: string;
  context: JobsAnalyticsContext | null;
  meta?: Record<string, unknown>;
}) {
  if (!args.context?.jobId) return;

  await prisma.event.create({
    data: {
      userId: args.userId,
      type: "analyze",
      metaJson: {
        tag: BOOT_TAG,
        category: "jobs",
        event: args.event,
        route: args.route,
        jobId: args.context.jobId,
        resumeProfileId: args.context.resumeProfileId ?? null,
        sourceSlug: args.context.sourceSlug ?? null,
        company: args.context.company ?? null,
        jobTitle: args.context.jobTitle ?? null,
        mode: args.context.mode ?? null,
        bundleSessionId: args.context.bundleSessionId ?? null,
        ...(typeof args.meta === "object" && args.meta ? toSafeJson(args.meta) : {}),
      },
    },
  });
}


const COST_GENERATE_COVER_LETTER = 5;
const COST_APPLY_PACK = 8;

function buildJobsChargeConfig(context: JobsAnalyticsContext | null, fallbackMode: JobsAnalyticsMode) {
  const mode = context?.mode === "apply_pack" ? "apply_pack" : fallbackMode;
  const bundleSessionId = cleanOptionalString(context?.bundleSessionId);
  const isApplyPack = mode === "apply_pack" && !!bundleSessionId;

  return {
    mode,
    isApplyPack,
    cost: isApplyPack ? COST_APPLY_PACK : COST_GENERATE_COVER_LETTER,
    reason: isApplyPack ? "job_apply_pack" : "job_generate_cover_letter",
    ref: isApplyPack ? `job_apply_pack:${bundleSessionId}` : undefined,
    bundleSessionId,
  } as const;
}

function okJson(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function normalizeJobText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

async function getCanonicalJobContextText(jobId: string) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      status: "active",
    },
    select: {
      title: true,
      company: true,
      location: true,
      remoteType: true,
      seniority: true,
      employmentType: true,
      description: true,
      requirementsText: true,
      responsibilitiesText: true,
    },
  });

  if (!job) return "";

  return [
    `${job.title} at ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    `Remote type: ${job.remoteType}`,
    `Seniority: ${job.seniority}`,
    `Employment type: ${job.employmentType}`,
    job.description || null,
    job.requirementsText || null,
    job.responsibilitiesText || null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function resolveEffectiveJobsAnalyticsContext(
  context: JobsAnalyticsContext | null,
  currentJobText: string,
  fallbackMode: JobsAnalyticsMode
) {
  const bundleSessionId = cleanOptionalString(context?.bundleSessionId);
  if (!context?.jobId || context?.mode !== "apply_pack" || !bundleSessionId) {
    return {
      context,
      bundleOverrideInvalidated: false,
    } as const;
  }

  const canonicalJobText = await getCanonicalJobContextText(context.jobId);
  const matchesCanonical = !!canonicalJobText && normalizeJobText(canonicalJobText) === normalizeJobText(currentJobText);

  if (matchesCanonical) {
    return {
      context,
      bundleOverrideInvalidated: false,
    } as const;
  }

  return {
    context: {
      ...context,
      mode: fallbackMode,
      bundleSessionId: undefined,
    },
    bundleOverrideInvalidated: true,
  } as const;
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

function stripTagsToText(html: string) {
  return String(html ?? "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeResumeInput(input: unknown) {
  const s = String(input ?? "");
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(s);
  const stripped = looksHtml ? stripTagsToText(s) : s;
  return normalizeResumeText(stripped);
}

function toStr(x: unknown) {
  return String(x ?? "");
}

function toArr(x: unknown): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v).trim()).filter(Boolean);
  const s = String(x ?? "").trim();
  if (!s) return [];
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

/** ---------------- PDF extraction (pdfjs-dist, WORKER FIXED for Vercel/Next) ---------------- */

async function ensurePdfJsPolyfills() {
  if (!(globalThis as any).DOMMatrix) {
    try {
      const dm: any = await import("dommatrix");
      (globalThis as any).DOMMatrix = dm?.DOMMatrix ?? dm?.default ?? dm;
    } catch {
      // ignore
    }
  }
  if (!(globalThis as any).Path2D) {
    (globalThis as any).Path2D = class Path2DStub {};
  }
  if (!(globalThis as any).ImageData) {
    (globalThis as any).ImageData = class ImageDataStub {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: any, width: number, height?: number) {
        this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data || []);
        this.width = Number(width || 0);
        this.height = Number(height ?? 0);
      }
    };
  }
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    await ensurePdfJsPolyfills();

    if (!(globalThis as any).DOMMatrix) {
      throw new Error("DOMMatrix is not defined (polyfill failed).");
    }

    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

    // ✅ Critical: point pdfjs at a real bundled worker URL (prevents /chunks/pdf.worker.mjs missing on Vercel)
    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
    }

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdf = await loadingTask.promise;

    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = (content?.items || []).map((it: any) => String(it?.str ?? "")).filter(Boolean);
      out += strings.join(" ") + "\n";
    }

    return out;
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : String(err);
    throw new Error(`PDF parse failed: ${msg}`);
  }
}

/** --------- File extraction --------- */

async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await mammoth.extractRawText({ buffer });
  return parsed?.value ?? "";
}

async function extractResumeTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();

  if (name.endsWith(".docx")) return extractTextFromDocx(file);

  if (name.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return extractTextFromPdfBuffer(buffer);
  }

  if (name.endsWith(".txt")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return buffer.toString("utf-8");
  }

  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT.");
}

/** --------- Prompt builder --------- */

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
      ? `If truthful and natural, weave in these target terms (no keyword stuffing): ${targetTerms.join(", ")}.`
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

Greeting line (use exactly):
${greeting}

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
  console.log(BOOT_TAG, { at: new Date().toISOString() });

  let chargedUserId = "";
  let chargedCost = 0;
  let jobsAnalyticsContext: JobsAnalyticsContext | null = null;

  try {
    // ✅ Require login
    const session = await getServerSession(authOptions);
    const emailFromSession = session?.user?.email;
    if (!emailFromSession) return okJson({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email: emailFromSession } });
    if (!dbUser) return okJson({ ok: false, error: "User not found" }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return okJson({ ok: false, error: "Missing OPENAI_API_KEY in .env.local" }, { status: 500 });

    const client = new OpenAI({ apiKey });
    const contentType = req.headers.get("content-type") || "";

    let resumeText = "";
    let jobText = "";

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

    // --- Parse inputs first (DO NOT charge yet) ---
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText");

      jobText = normalizeJobText(job);

      if (file && file instanceof File) {
        if (file.size > MAX_FILE_BYTES) {
          return okJson(
            {
              ok: false,
              error: `File too large. Max size is ${MAX_FILE_MB}MB. Tip: export an optimized PDF or upload DOCX.`,
            },
            { status: 400 }
          );
        }
        const extracted = await extractResumeTextFromFile(file);
        resumeText = sanitizeResumeInput(extracted);
      } else {
        resumeText = sanitizeResumeInput(resumeTextFallback);
      }

      fullName = toStr(form.get("fullName")).trim();
      email = toStr(form.get("email")).trim();
      phone = toStr(form.get("phone")).trim();
      linkedin = toStr(form.get("linkedin")).trim();
      locationLine = toStr(form.get("locationLine")).trim();

      targetCompany = toStr(form.get("targetCompany")).trim();
      hiringManager = toStr(form.get("hiringManager")).trim();
      roleTitle = toStr(form.get("roleTitle")).trim();

      jobsAnalyticsContext = buildJobsAnalyticsContext({
        jobId: form.get("jobId"),
        resumeProfileId: form.get("resumeProfileId"),
        sourceSlug: form.get("sourceSlug"),
        company: form.get("company") ?? form.get("targetCompany"),
        jobTitle: form.get("jobTitle") ?? form.get("roleTitle"),
        mode: form.get("mode"),
        bundleSessionId: form.get("bundleSessionId"),
      });

      tone = toStr(form.get("tone") || tone).trim() || tone;

      const lenRaw = toStr(form.get("length") || "standard").trim();
      if (lenRaw === "short" || lenRaw === "standard" || lenRaw === "detailed") length = lenRaw;

      includeBullets = parseBoolFromFormData(form.get("includeBullets"), true);
      blockedTerms = toArr(form.get("blockedTerms"));
      targetTerms = toArr(form.get("targetTerms"));
    } else if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as Partial<ReqBody>;

      resumeText = sanitizeResumeInput(body.resumeText);
      jobText = normalizeJobText(body.jobText);

      fullName = toStr(body.fullName).trim();
      email = toStr(body.email).trim();
      phone = toStr(body.phone).trim();
      linkedin = toStr(body.linkedin).trim();
      locationLine = toStr(body.locationLine).trim();

      targetCompany = toStr(body.targetCompany).trim();
      hiringManager = toStr(body.hiringManager).trim();
      roleTitle = toStr(body.roleTitle).trim();

      jobsAnalyticsContext = buildJobsAnalyticsContext({
        jobId: body.jobId,
        resumeProfileId: body.resumeProfileId,
        sourceSlug: body.sourceSlug,
        company: body.company ?? body.targetCompany,
        jobTitle: body.jobTitle ?? body.roleTitle,
        mode: body.mode,
        bundleSessionId: body.bundleSessionId,
      });

      tone = toStr(body.tone || tone).trim() || tone;

      if (body.length === "short" || body.length === "standard" || body.length === "detailed") length = body.length;
      includeBullets = body.includeBullets !== false;

      blockedTerms = toArr(body.blockedTerms);
      targetTerms = toArr(body.targetTerms);
    } else {
      return okJson(
        { ok: false, error: "Unsupported content type. Send JSON or multipart/form-data (file upload)." },
        { status: 415 }
      );
    }

    if (!resumeText || !jobText) {
      return okJson({ ok: false, error: "Missing resumeText (or file) or jobText" }, { status: 400 });
    }

    if (resumeText.trim().length < MIN_RESUME_CHARS) {
      return okJson(
        {
          ok: false,
          error:
            "Resume text is missing or too short. If you uploaded a PDF, it may be scanned. Try DOCX or paste resume text.",
        },
        { status: 400 }
      );
    }

    // ✅ Charge credits AFTER validation
    const effectiveJobsContextResult = await resolveEffectiveJobsAnalyticsContext(
      jobsAnalyticsContext,
      jobText,
      "cover_letter"
    );
    jobsAnalyticsContext = effectiveJobsContextResult.context;

    const chargeConfig = buildJobsChargeConfig(jobsAnalyticsContext, "cover_letter");
    const charged = await chargeCredits({
      userId: dbUser.id,
      cost: chargeConfig.cost,
      reason: chargeConfig.reason,
      eventType: "cover_letter",
      ref: chargeConfig.ref,
      meta: {
        cost: chargeConfig.cost,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        jobId: jobsAnalyticsContext?.jobId ?? null,
        resumeProfileId: jobsAnalyticsContext?.resumeProfileId ?? null,
        company: jobsAnalyticsContext?.company ?? null,
        jobTitle: jobsAnalyticsContext?.jobTitle ?? null,
        sourceSlug: jobsAnalyticsContext?.sourceSlug ?? null,
        mode: chargeConfig.mode,
        bundleSessionId: chargeConfig.bundleSessionId ?? null,
        bundleOverrideInvalidated: effectiveJobsContextResult.bundleOverrideInvalidated,
      },
    });

    if (!charged.ok) {
      await writeJobsAnalyticsEvent({
        userId: dbUser.id,
        event: "job_cover_letter_failed",
        route: "/cover-letter",
        context: jobsAnalyticsContext,
        meta: {
          creditsCost: chargeConfig.cost,
          error: "OUT_OF_CREDITS",
          refunded: false,
        },
      });

      if (jobsAnalyticsContext?.mode === "apply_pack") {
        await writeJobsAnalyticsEvent({
          userId: dbUser.id,
          event: "job_apply_pack_failed",
          route: "/cover-letter",
          context: jobsAnalyticsContext,
          meta: {
            step: "cover_letter",
            creditsCost: chargeConfig.cost,
            error: "OUT_OF_CREDITS",
            refunded: false,
          },
        });
      }

      return okJson({ ok: false, error: "OUT_OF_CREDITS", balance: charged.balance }, { status: 402 });
    }

    chargedUserId = dbUser.id;
    chargedCost = charged.alreadyApplied ? 0 : chargeConfig.cost;

    await writeJobsAnalyticsEvent({
      userId: dbUser.id,
      event: "job_cover_letter_credit_charged",
      route: "/api/cover-letter",
      context: jobsAnalyticsContext,
      meta: {
        creditsCost: chargeConfig.cost,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
      },
    });

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
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.4,
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
      const refunded = await refundCredits({
        userId: chargedUserId,
        amount: chargedCost,
        reason: "refund_cover_letter_empty",
        eventType: "cover_letter",
        meta: { cost: chargedCost },
      });

      await writeJobsAnalyticsEvent({
        userId: chargedUserId,
        event: "job_cover_letter_failed",
        route: "/api/cover-letter",
        context: jobsAnalyticsContext,
        meta: {
          creditsCost: chargedCost,
          refunded: true,
          error: "MODEL_RETURNED_EMPTY_RESPONSE",
        },
      });

      if (jobsAnalyticsContext?.mode === "apply_pack") {
        await writeJobsAnalyticsEvent({
          userId: chargedUserId,
          event: "job_apply_pack_failed",
          route: "/api/cover-letter",
          context: jobsAnalyticsContext,
          meta: {
            step: "cover_letter",
            creditsCost: chargedCost,
            refunded: true,
            error: "MODEL_RETURNED_EMPTY_RESPONSE",
          },
        });
      }

      return okJson(
        { ok: false, error: "Model returned empty response", refunded: true, balance: refunded.balance },
        { status: 500 }
      );
    }

    // Best-effort post-check: blocked terms (refund on failure)
    if (blockedTerms.length) {
      const lower = text.toLowerCase();
      const hit = blockedTerms.find((t) => t && lower.includes(String(t).toLowerCase()));
      if (hit) {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_cover_letter_blocked_term",
          eventType: "cover_letter",
          meta: { cost: chargedCost, hit },
        });

        await writeJobsAnalyticsEvent({
          userId: chargedUserId,
          event: "job_cover_letter_failed",
          route: "/api/cover-letter",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: true,
            error: "BLOCKED_TERM_DETECTED",
            blockedTerm: hit,
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: chargedUserId,
            event: "job_apply_pack_failed",
            route: "/api/cover-letter",
            context: jobsAnalyticsContext,
            meta: {
              step: "cover_letter",
              creditsCost: chargedCost,
              refunded: true,
              error: "BLOCKED_TERM_DETECTED",
              blockedTerm: hit,
            },
          });
        }

        return okJson(
          {
            ok: false,
            error: `Blocked term detected in output: "${hit}". Try again.`,
            refunded: true,
            balance: refunded.balance,
          },
          { status: 422 }
        );
      }
    }

    await writeJobsAnalyticsEvent({
      userId: dbUser.id,
      event: "job_cover_letter_completed",
      route: "/api/cover-letter",
      context: jobsAnalyticsContext,
      meta: {
        creditsCost: chargeConfig.cost,
        textLength: text.length,
      },
    });

    if (jobsAnalyticsContext?.mode === "apply_pack") {
      await writeJobsAnalyticsEvent({
        userId: dbUser.id,
        event: "job_apply_pack_completed",
        route: "/api/cover-letter",
        context: jobsAnalyticsContext,
        meta: {
          creditsCost: chargeConfig.cost,
          step: "cover_letter",
          textLength: text.length,
        },
      });
    }

    return okJson({
      ok: true,
      coverLetter: text,
      balance: charged.balance,
      debug: {
        contentType,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        maxFileMb: MAX_FILE_MB,
        minResumeChars: MIN_RESUME_CHARS,
        cost: chargeConfig.cost,
      },
    });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : String(err);
    console.error("cover-letter route error:", err);

    if (chargedUserId && chargedCost > 0) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_cover_letter_failed",
          eventType: "cover_letter",
          meta: { error: message, cost: chargedCost },
        });

        await writeJobsAnalyticsEvent({
          userId: chargedUserId,
          event: "job_cover_letter_failed",
          route: "/api/cover-letter",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: true,
            error: message || "Cover letter generation failed",
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: chargedUserId,
            event: "job_apply_pack_failed",
            route: "/api/cover-letter",
            context: jobsAnalyticsContext,
            meta: {
              step: "cover_letter",
              creditsCost: chargedCost,
              refunded: true,
              error: message || "Cover letter generation failed",
            },
          });
        }

        return okJson(
          { ok: false, error: message || "Cover letter generation failed", refunded: true, balance: refunded.balance },
          { status: 500 }
        );
      } catch (refundErr: any) {
        console.error("refundCredits failed:", refundErr);
        await writeJobsAnalyticsEvent({
          userId: chargedUserId,
          event: "job_cover_letter_failed",
          route: "/api/cover-letter",
          context: jobsAnalyticsContext,
          meta: {
            creditsCost: chargedCost,
            refunded: false,
            error: message || "Cover letter generation failed",
            refundError: refundErr?.message || String(refundErr),
          },
        });

        if (jobsAnalyticsContext?.mode === "apply_pack") {
          await writeJobsAnalyticsEvent({
            userId: chargedUserId,
            event: "job_apply_pack_failed",
            route: "/api/cover-letter",
            context: jobsAnalyticsContext,
            meta: {
              step: "cover_letter",
              creditsCost: chargedCost,
              refunded: false,
              error: message || "Cover letter generation failed",
              refundError: refundErr?.message || String(refundErr),
            },
          });
        }

        return okJson(
          {
            ok: false,
            error: message || "Cover letter generation failed",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
          },
          { status: 500 }
        );
      }
    }

    return okJson({ ok: false, error: message || "Cover letter generation failed" }, { status: 500 });
  }
}

export async function GET() {
  // ✅ fingerprint: proves the deployed route is THIS file (and module boot didn’t crash)
  return okJson({ ok: false, route: "src/app/api/cover-letter/route.ts", tag: BOOT_TAG }, { status: 405 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
