// src/app/api/rewrite-bullet/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { sanitizeKeywords } from "@/lib/keywordSanitizer";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Detect bullets that are basically definitions/labels, not actions.
 * Example: "Magicoin is Prodigy’s Premium Currency."
 */
function isNonActionableBullet(text: string) {
  const t = normalizeText(text);
  if (!t) return true;

  const words = t.split(" ").filter(Boolean);
  const lower = t.toLowerCase();

  const looksLikeDefinition =
    /\b(is|are|was|were)\b/.test(lower) && words.length <= 14;

  const tooShort = words.length <= 6;

  return looksLikeDefinition || tooShort;
}

type RewriteResponse = {
  rewritten: string;
  notes?: string[];
  keywordHits?: string[];
  needsMoreInfo?: boolean;
};

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Backward compatible keys
    const originalBullet = normalizeText(body.originalBullet ?? body.original);
    const jobText = normalizeText(body.jobText ?? body.jobPostingText);

    const tone =
      normalizeText(body.tone) || "confident, concise, metric-driven";
    const role = normalizeText(body.role) || "QA";

    const sourceCompany = normalizeText(body.sourceCompany);
    const targetCompany = normalizeText(body.targetCompany);

    const targetProducts: string[] = Array.isArray(body.targetProducts)
      ? body.targetProducts.map((p: any) => normalizeText(p)).filter(Boolean)
      : [];

    const rawKeywords: string[] = Array.isArray(body.suggestedKeywords)
      ? body.suggestedKeywords.map((k: any) => String(k))
      : Array.isArray(body.targetKeywords)
      ? body.targetKeywords.map((k: any) => String(k))
      : [];

    const extraBlocked: string[] = Array.isArray(body.blockedTerms)
      ? body.blockedTerms.map((t: any) => normalizeText(t)).filter(Boolean)
      : [];

    if (!originalBullet) {
      return NextResponse.json(
        { ok: false, error: "Missing originalBullet" },
        { status: 400 }
      );
    }

    // ✅ Critical: definition bullets never go to the model
    if (isNonActionableBullet(originalBullet)) {
      return NextResponse.json({
        ok: true,
        rewrittenBullet: originalBullet,
        needsMoreInfo: true,
        notes: [
          "This reads like a definition/label, not an action/achievement.",
          "Add what you did (tested, validated, documented, improved, owned) so we can rewrite truthfully.",
        ],
        keywordHits: [],
        blockedKeywords: [],
      });
    }

    // ✅ Sanitize keywords so target company/product terms don’t get inserted
    const { usableKeywords, blockedKeywords } = sanitizeKeywords({
      rawKeywords,
      targetCompany: targetCompany || undefined,
      targetProducts,
      extraBlocked,
    });

    const keywordLine =
      usableKeywords.length > 0
        ? `Allowed keywords (ONLY if supported by SOURCE): ${usableKeywords.join(", ")}`
        : `Allowed keywords: (none provided)`;

    const prompt = `
You are rewriting ONE resume bullet for a ${role}.
Tone: ${tone}.

SEPARATION CONTRACT (NON-NEGOTIABLE)
- SOURCE = the user's resume bullet. Treat SOURCE as factual past/current experience.
- TARGET = the job posting. Treat TARGET as goals/requirements only. Do NOT import TARGET facts as if the candidate did them.

HARD RULES
- Do NOT imply the candidate worked at the target employer.
- Do NOT mention the target employer name or target products.
- Do NOT invent tools, systems, achievements, dates, responsibilities, or metrics.
- Metrics: do not add numbers unless SOURCE hints at them.
- ONE sentence, 18–30 words.
- Start with a strong past-tense action verb.
- ATS-friendly: no emojis, no fluff, no first-person ("I", "my").
- ${keywordLine}

SOURCE employer/context: "${sourceCompany || "(not provided)"}"
TARGET employer (do NOT claim): "${targetCompany || "(not provided)"}"

SOURCE (FACTUAL)
"${originalBullet}"

TARGET JOB POSTING (CONTEXT ONLY)
"${jobText || "(not provided)"}"

OUTPUT FORMAT (JSON ONLY)
{
  "rewritten": "string",
  "notes": ["string", "string"],
  "keywordHits": ["string", "string"],
  "needsMoreInfo": boolean
}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You rewrite resume bullets with high ATS quality while preserving factual accuracy. Never imply employment at the target company or invent details. Output JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = normalizeText(completion.choices?.[0]?.message?.content);

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "AI returned empty rewrite" },
        { status: 500 }
      );
    }

    const parsed = safeJsonParse<RewriteResponse>(raw);

    if (!parsed || !parsed.rewritten) {
      return NextResponse.json(
        { ok: false, error: "AI returned invalid JSON", debug: { raw } },
        { status: 500 }
      );
    }

    const rewrittenBullet = normalizeText(parsed.rewritten);

    if (!rewrittenBullet) {
      return NextResponse.json(
        { ok: false, error: "AI returned empty rewritten content" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      rewrittenBullet,
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(normalizeText) : [],
      keywordHits: Array.isArray(parsed.keywordHits)
        ? parsed.keywordHits.map(normalizeText)
        : [],
      needsMoreInfo: !!parsed.needsMoreInfo,
      blockedKeywords,
    });
  } catch (e: any) {
    console.error("rewrite-bullet route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to rewrite bullet" },
      { status: 500 }
    );
  }
}
