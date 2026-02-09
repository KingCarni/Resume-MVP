// src/app/api/rewrite-bullet/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { computeVerbStrength } from "@/lib/verb_strength";
import { sanitizeKeywords } from "@/lib/keywordSanitizer";

export const runtime = "nodejs";

type ReqBody = {
  jobText: string;
  originalBullet: string;
  suggestedKeywords: string[];

  sourceCompany?: string;
  targetCompany?: string;
  targetProducts?: string[];
  blockedTerms?: string[];

  role?: string;
  tone?: string;
};

function normalize(s: unknown) {
  return String(s ?? "").trim();
}

function normalizeKeywords(k: unknown): string[] {
  if (!Array.isArray(k)) return [];
  return k.map((x) => String(x).trim()).filter(Boolean);
}

function safeArray(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a.map((x) => String(x).trim()).filter(Boolean);
}

function normalizeForMatch(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findKeywordHits(text: string, terms: string[]) {
  const t = normalizeForMatch(text);
  const hits: string[] = [];
  for (const raw of terms) {
    const term = normalizeForMatch(raw);
    if (!term) continue;
    if (t.includes(term)) hits.push(raw);
  }
  return Array.from(new Set(hits));
}

function buildSystemPrompt() {
  return [
    "You are a resume bullet rewrite assistant.",
    "Rewrite bullets to be concise, impact-driven, and ATS-friendly.",
    "Hard rules:",
    "- Do NOT invent new companies, products, teams, tools, metrics, or outcomes.",
    "- Do NOT add target company/product names unless they already exist in the original bullet.",
    "- Keep tense as past tense (resume experience).",
    "- Preserve truthfulness; you may tighten wording and ordering, but not add claims.",
    "- Prefer strong action verbs and specificity without exaggeration.",
  ].join("\n");
}

function buildUserPrompt(args: {
  originalBullet: string;
  jobText: string;
  suggestedKeywords: string[];
  sourceCompany?: string;
  targetCompany?: string;
  targetProducts?: string[];
  blockedTerms?: string[];
  role?: string;
  tone?: string;
  retry?: boolean;
  previousRewrite?: string;
}) {
  const {
    originalBullet,
    jobText,
    suggestedKeywords,
    sourceCompany,
    targetCompany,
    targetProducts,
    blockedTerms,
    role,
    tone,
    retry,
    previousRewrite,
  } = args;

  const blocked = [
    ...(normalize(targetCompany) ? [normalize(targetCompany)] : []),
    ...safeArray(targetProducts),
    ...safeArray(blockedTerms),
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks: string[] = [];

  blocks.push(`ROLE CONTEXT: ${normalize(role) || "QA / Quality"}`);
  if (normalize(sourceCompany))
    blocks.push(`SOURCE COMPANY: ${normalize(sourceCompany)}`);

  blocks.push("");
  blocks.push("ORIGINAL BULLET:");
  blocks.push(originalBullet);

  blocks.push("");
  blocks.push("JOB POSTING (alignment only; do not copy company/product names):");
  blocks.push(jobText);

  blocks.push("");
  blocks.push(
    `SUGGESTED KEYWORDS (use only if truthful): ${
      suggestedKeywords.join(", ") || "(none)"
    }`
  );

  blocks.push("");
  blocks.push(
    `BLOCKED TERMS (must not appear unless already in original): ${
      blocked.join(", ") || "(none)"
    }`
  );

  blocks.push("");
  blocks.push(`TONE: ${normalize(tone) || "confident, concise, impact-driven"}`);

  blocks.push("");
  blocks.push("OUTPUT FORMAT:");
  blocks.push("- Return ONE rewritten bullet, one sentence, no prefix characters.");
  blocks.push("- Max ~28 words. Prefer clarity over buzzwords.");

  if (retry) {
    blocks.push("");
    blocks.push("RETRY RULES (previous attempt regressed):");
    blocks.push(
      "- Start with a strong action verb (Led/Owned/Drove/Implemented/Automated/Optimized/Delivered…)."
    );
    blocks.push(
      "- Avoid weak openers (Worked with/Helped/Assisted/Supported/Responsible for…)."
    );
    blocks.push(
      "- Preserve any concrete details already present in the original (tools/systems/metrics), but do NOT invent new ones."
    );
    blocks.push("- Keep facts the same. Do NOT add new claims/metrics/outcomes.");
    if (previousRewrite) {
      blocks.push("");
      blocks.push("PREVIOUS REWRITE (improve it; do not copy weak phrasing):");
      blocks.push(previousRewrite);
    }
  }

  return blocks.join("\n");
}

async function generateRewrite(
  client: OpenAI,
  args: Parameters<typeof buildUserPrompt>[0]
) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = buildSystemPrompt();
  const user = buildUserPrompt(args);

  const resp = await client.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = resp.choices?.[0]?.message?.content ?? "";
  return String(text).trim().replace(/^[-•\u2022]+\s*/g, "");
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Partial<ReqBody>;

    const jobText = normalize(body.jobText);
    const originalBullet = normalize(body.originalBullet);

    const rawSuggestedKeywords = normalizeKeywords(body.suggestedKeywords);

    const sourceCompany = normalize(body.sourceCompany);
    const targetCompany = normalize(body.targetCompany);
    const targetProducts = safeArray(body.targetProducts);
    const blockedTerms = safeArray(body.blockedTerms);

    const role = normalize(body.role) || "QA Lead";
    const tone = normalize(body.tone) || "confident, concise, impact-driven";

    if (!jobText || !originalBullet) {
      return NextResponse.json(
        { ok: false, error: "Missing jobText or originalBullet" },
        { status: 400 }
      );
    }

    if (originalBullet.length > 800) {
      return NextResponse.json(
        { ok: false, error: "originalBullet too long. Keep under 800 chars." },
        { status: 400 }
      );
    }
    if (jobText.length > 25000) {
      return NextResponse.json(
        { ok: false, error: "jobText too long. Keep under ~25k chars." },
        { status: 400 }
      );
    }

    // ✅ Sanitize suggested keywords (remove target-only terms)
    const { usableKeywords, blockedKeywords } = sanitizeKeywords({
      rawKeywords: rawSuggestedKeywords,
      targetCompany: targetCompany || undefined,
      targetProducts,
      extraBlocked: blockedTerms,
    });

    const client = new OpenAI({ apiKey });

    // BEFORE (shared scorer)
    const verbStrengthBefore = computeVerbStrength(originalBullet, {
      mode: "before",
    });

    // Attempt #1
    const attempt1 = await generateRewrite(client, {
      originalBullet,
      jobText,
      suggestedKeywords: usableKeywords,
      sourceCompany,
      targetCompany,
      targetProducts,
      blockedTerms,
      role,
      tone,
      retry: false,
    });
    const after1 = computeVerbStrength(attempt1, { mode: "after" });

    let retryUsed = false;

    // Attempt #2 if base regressed
    let attempt2: string | null = null;
    let after2: ReturnType<typeof computeVerbStrength> | null = null;

    if (after1.baseScore < verbStrengthBefore.baseScore) {
      retryUsed = true;
      attempt2 = await generateRewrite(client, {
        originalBullet,
        jobText,
        suggestedKeywords: usableKeywords,
        sourceCompany,
        targetCompany,
        targetProducts,
        blockedTerms,
        role,
        tone,
        retry: true,
        previousRewrite: attempt1,
      });
      after2 = computeVerbStrength(attempt2, { mode: "after" });
    }

    // Pick best rewrite (best baseScore; tie-break total score)
    let bestRewrite = attempt1;
    let bestAfter = after1;

    if (after2) {
      const better =
        after2.baseScore > bestAfter.baseScore ||
        (after2.baseScore === bestAfter.baseScore &&
          after2.score >= bestAfter.score);

      if (better) {
        bestRewrite = attempt2!;
        bestAfter = after2;
      }
    }

    // ✅ Never return worse than original
    let usedOriginalFallback = false;
    if (bestAfter.baseScore < verbStrengthBefore.baseScore) {
      usedOriginalFallback = true;
      bestRewrite = originalBullet;
      bestAfter = computeVerbStrength(originalBullet, { mode: "before" });
    }

    const keywordHitsArr = findKeywordHits(bestRewrite, usableKeywords);

    const blockedUniverse = [
      ...(targetCompany ? [targetCompany] : []),
      ...targetProducts,
      ...blockedTerms,
    ].filter(Boolean);

    const blockedTermsFound = findKeywordHits(bestRewrite, blockedUniverse);

    const needsMoreInfo =
      originalBullet.length < 40 ||
      /^(qa|testing|automation|bugs|regression|jira|sdlc)\b/i.test(originalBullet);

    const notes: string[] = [];
    notes.push("Rewrote for clarity + impact while preserving truthfulness.");
    if (retryUsed) notes.push("Auto-retried once to avoid strength regression.");
    if (usedOriginalFallback)
      notes.push(
        "Kept original bullet because rewrite would reduce quality (score regression)."
      );
    if (blockedKeywords.length)
      notes.push("Removed blocked keywords from suggestions (guardrail).");
    if (blockedTermsFound.length)
      notes.push("Detected target-only term risk (blocked terms present).");

    const regressedBase = bestAfter.baseScore < verbStrengthBefore.baseScore;

    return NextResponse.json({
      ok: true,
      rewrittenBullet: bestRewrite,
      needsMoreInfo,
      notes,

      // ✅ what the UI expects as “Keywords used”
      keywordHits: keywordHitsArr,

      // ✅ what the UI expects as “Removed keywords”
      blockedKeywords,

      // ✅ additional debug/safety signal (optional)
      blockedTermsFound,

      verbStrengthBefore,
      verbStrengthAfter: bestAfter,

      regressed: regressedBase,
      retryUsed,
      usedOriginalFallback,
    });
  } catch (e: any) {
    console.error("rewrite-bullet route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Rewrite failed" },
      { status: 500 }
    );
  }
}
