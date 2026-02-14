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

  // Optional extra constraints from client
  constraints?: string[];
  mustPreserveMeaning?: boolean;

  // Word/verb variance controls (per-bullet)
  avoidPhrases?: string[]; // can include verbs OR phrases
  preferVerbVariety?: boolean;

  // Global resume/session context
  usedOpeners?: string[];
  usedPhrases?: string[];
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

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function findKeywordHits(text: string, terms: string[]) {
  const t = normalizeForMatch(text);
  const hits: string[] = [];
  for (const raw of terms) {
    const term = normalizeForMatch(raw);
    if (!term) continue;
    if (t.includes(term)) hits.push(raw);
  }
  return uniq(hits);
}

/** Pull likely opener verb from a bullet (first non-trivial word) */
function extractOpenerVerb(bullet: string) {
  const s = normalize(bullet)
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
    .replace(/[“”"]/g, '"')
    .trim();

  const words = s.split(/\s+/).filter(Boolean);
  for (const w of words.slice(0, 6)) {
    const clean = w.replace(/[^\w-]/g, "").toLowerCase();
    if (!clean) continue;
    if (
      ["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with"].includes(clean)
    )
      continue;
    return clean;
  }
  return "";
}

const DEFAULT_OVERUSED_OPENERS = [
  "collaborated",
  "developed",
  "documented",
  "executed",
  "created",
  "completed",
  "ensured",
  "utilized",
  "managed",
  "led",
];

const DEFAULT_OVERUSED_PHRASES = [
  "developed and documented",
  "ensuring high-quality standards",
  "ensuring quality standards",
  "high-quality standards",
  "utilizing jira",
  "using jira",
  "documenting feedback and issues in jira",
  "for release candidates",
  "across multiple platforms",
  "timely issue resolution",
  "quality standards",
];

function buildSystemPrompt() {
  return [
    "You are a resume bullet rewrite assistant.",
    "Rewrite bullets to be concise, impact-driven, and ATS-friendly.",
    "",
    "Hard rules:",
    "- Do NOT invent new companies, products, teams, tools, metrics, or outcomes.",
    "- Do NOT add target company/product names unless they already exist in the original bullet.",
    "- Do NOT import job requirements as if they were experience; only use facts already stated.",
    "- Keep tense as past tense (resume experience).",
    "- Preserve truthfulness; you may tighten wording and ordering, but not add claims.",
    "- Keep it one sentence. No semicolons unless absolutely necessary.",
    "",
    "Quality rules:",
    "- Avoid repetitive openers across bullets; vary lead verbs and structure.",
    "- Avoid stock filler phrases (e.g., 'ensuring quality standards') unless they add specific meaning.",
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

  constraints?: string[];
  mustPreserveMeaning?: boolean;

  avoidPhrases?: string[];
  preferVerbVariety?: boolean;

  usedOpeners?: string[];
  usedPhrases?: string[];

  retry?: boolean;
  previousRewrite?: string;
  forceStarterVerbList?: string[];
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
    constraints,
    mustPreserveMeaning,
    avoidPhrases,
    preferVerbVariety,
    usedOpeners,
    usedPhrases,
    retry,
    previousRewrite,
    forceStarterVerbList,
  } = args;

  const blocked = [
    ...(normalize(targetCompany) ? [normalize(targetCompany)] : []),
    ...safeArray(targetProducts),
    ...safeArray(blockedTerms),
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const extraConstraints = safeArray(constraints);

  // We allow avoidPhrases to include either verbs OR phrases.
  const avoidNorm = safeArray(avoidPhrases).map((s) => normalizeForMatch(s)).filter(Boolean);

  const usedOpenersNorm = safeArray(usedOpeners).map((s) => normalizeForMatch(s)).filter(Boolean);
  const usedPhrasesNorm = safeArray(usedPhrases).map((s) => normalizeForMatch(s)).filter(Boolean);

  const combinedAvoidOpeners = uniq([
    ...DEFAULT_OVERUSED_OPENERS,
    ...usedOpenersNorm,
    ...avoidNorm, // may include verbs too
  ]).filter(Boolean);

  const combinedAvoidPhrases = uniq([
    ...DEFAULT_OVERUSED_PHRASES,
    ...usedPhrasesNorm,
    ...avoidNorm, // may include phrases too
  ]).filter(Boolean);

  const originalOpener = extractOpenerVerb(originalBullet);

  const blocks: string[] = [];

  blocks.push(`ROLE CONTEXT: ${normalize(role) || "QA / Quality"}`);
  if (normalize(sourceCompany)) blocks.push(`SOURCE COMPANY: ${normalize(sourceCompany)}`);

  blocks.push("");
  blocks.push("ORIGINAL BULLET:");
  blocks.push(originalBullet);

  blocks.push("");
  blocks.push("JOB POSTING (alignment only; do NOT copy company/product names; do NOT import requirements as experience):");
  blocks.push(jobText);

  blocks.push("");
  blocks.push(
    `SUGGESTED KEYWORDS (safe-only; use only if already truthful in original bullet): ${
      suggestedKeywords.join(", ") || "(none)"
    }`
  );

  blocks.push("");
  blocks.push(`BLOCKED TERMS (must not appear): ${blocked.join(", ") || "(none)"}`);

  blocks.push("");
  blocks.push("VARIANCE RULES:");
  blocks.push(`- Prefer verb variety: ${preferVerbVariety ? "ON" : "OFF (default)"}`);

  // ✅ NO EXCEPTIONS now.
  blocks.push(
    `- Do NOT start with any of these opener verbs: ${combinedAvoidOpeners.join(", ") || "(none)"}`
  );
  blocks.push(`- Original opener detected: ${originalOpener || "(none)"}`);
  blocks.push("- If the original opener is overused, choose a different strong verb that preserves meaning.");

  if (combinedAvoidPhrases.length) {
    blocks.push(`- Avoid these repeated phrases: ${combinedAvoidPhrases.join(", ")}`);
  }

  if (mustPreserveMeaning) {
    blocks.push("");
    blocks.push("MEANING GUARDRAIL:");
    blocks.push("- Must preserve original meaning and scope. Improve wording only.");
  }

  if (extraConstraints.length) {
    blocks.push("");
    blocks.push("EXTRA CONSTRAINTS:");
    for (const c of extraConstraints) blocks.push(`- ${c}`);
  }

  blocks.push("");
  blocks.push(`TONE: ${normalize(tone) || "confident, concise, impact-driven"}`);

  blocks.push("");
  blocks.push("OUTPUT FORMAT:");
  blocks.push("- Return ONE rewritten bullet, one sentence, no prefix characters.");
  blocks.push("- Max ~28 words. Prefer clarity over buzzwords.");
  blocks.push("- Start with a strong action verb.");

  if (forceStarterVerbList?.length) {
    blocks.push("");
    blocks.push("STARTER VERB REQUIREMENT:");
    blocks.push(`- Start the bullet with ONE of these verbs: ${forceStarterVerbList.join(", ")}`);
  }

  if (retry) {
    blocks.push("");
    blocks.push("RETRY RULES (previous attempt violated constraints):");
    blocks.push("- Change the opener verb.");
    blocks.push("- Remove repeated filler phrases.");
    blocks.push("- Keep facts identical; do NOT add claims/metrics/outcomes.");
    if (previousRewrite) {
      blocks.push("");
      blocks.push("PREVIOUS REWRITE (do not copy its opener/phrasing):");
      blocks.push(previousRewrite);
    }
  }

  return blocks.join("\n");
}

async function generateRewrite(client: OpenAI, args: Parameters<typeof buildUserPrompt>[0]) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = buildSystemPrompt();
  const user = buildUserPrompt(args);

  const resp = await client.chat.completions.create({
    model,
    temperature: 0.35, // lower = less “creative importing”
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = resp.choices?.[0]?.message?.content ?? "";
  return String(text).trim().replace(/^[-•\u2022]+\s*/g, "");
}

function containsAnyPhrase(text: string, phrases: string[]) {
  const t = normalizeForMatch(text);
  return phrases.some((p) => {
    const pp = normalizeForMatch(p);
    return pp && t.includes(pp);
  });
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

    const constraints = safeArray(body.constraints);
    const mustPreserveMeaning = !!body.mustPreserveMeaning;
    const avoidPhrases = safeArray(body.avoidPhrases);
    const preferVerbVariety = !!body.preferVerbVariety;

    const usedOpeners = safeArray(body.usedOpeners);
    const usedPhrases = safeArray(body.usedPhrases);

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

    // ✅ Prevent FUNCTION_PAYLOAD_TOO_LARGE / oversized requests
    // (also enforce this client-side by trimming before sending)
    if (jobText.length > 6000) {
      return NextResponse.json(
        { ok: false, error: "jobText too long. Keep under ~6k chars." },
        { status: 400 }
      );
    }

    const { usableKeywords, blockedKeywords } = sanitizeKeywords({
      rawKeywords: rawSuggestedKeywords,
      targetCompany: targetCompany || undefined,
      targetProducts,
      extraBlocked: blockedTerms,
    });

    // ✅ KEY FIX (no job→experience blending):
    // Only allow keywords that already appear in the ORIGINAL bullet.
    const safeKeywords = findKeywordHits(originalBullet, usableKeywords);
    const safeNorm = new Set(safeKeywords.map(normalizeForMatch));
    const riskyKeywords = usableKeywords.filter((k) => !safeNorm.has(normalizeForMatch(k)));

    const client = new OpenAI({ apiKey });

    const verbStrengthBefore = computeVerbStrength(originalBullet, { mode: "before" });

    // Build “hard” avoid lists for enforcement
    const hardAvoidOpeners = uniq([
      ...DEFAULT_OVERUSED_OPENERS,
      ...usedOpeners.map(normalizeForMatch),
      ...avoidPhrases.map(normalizeForMatch),
    ]).filter(Boolean);

    const hardAvoidPhrases = uniq([
      ...DEFAULT_OVERUSED_PHRASES,
      ...usedPhrases.map(normalizeForMatch),
      ...avoidPhrases.map(normalizeForMatch),
    ]).filter(Boolean);

    // Attempt #1
    const attempt1 = await generateRewrite(client, {
      originalBullet,
      jobText,
      suggestedKeywords: safeKeywords, // ✅ safe-only
      sourceCompany,
      targetCompany,
      targetProducts,
      blockedTerms,
      role,
      tone,
      constraints,
      mustPreserveMeaning,
      avoidPhrases,
      preferVerbVariety,
      usedOpeners,
      usedPhrases,
      retry: false,
    });

    const after1 = computeVerbStrength(attempt1, { mode: "after" });

    // Enforce opener + phrase bans
    const opener1 = normalizeForMatch(extractOpenerVerb(attempt1));
    const openerViolates = preferVerbVariety && opener1 && hardAvoidOpeners.includes(opener1);
    const phraseViolates =
      preferVerbVariety && hardAvoidPhrases.length ? containsAnyPhrase(attempt1, hardAvoidPhrases) : false;

    // ✅ detect if model smuggled job-only keywords anyway
    const riskyFound1 = findKeywordHits(attempt1, riskyKeywords);
    const riskyViolates = riskyFound1.length > 0;

    let retryUsed = false;
    let attempt2: string | null = null;
    let after2: ReturnType<typeof computeVerbStrength> | null = null;

    const needsRetry =
      after1.baseScore < verbStrengthBefore.baseScore || openerViolates || phraseViolates || riskyViolates;

    if (needsRetry) {
      retryUsed = true;

      // Force a starter set that tends to diversify QA bullets
      const forceStarters = [
        "Led",
        "Owned",
        "Drove",
        "Implemented",
        "Streamlined",
        "Standardized",
        "Coordinated",
        "Automated",
        "Improved",
        "Delivered",
        "Validated",
        "Triaged",
        "Established",
      ];

      attempt2 = await generateRewrite(client, {
        originalBullet,
        jobText,
        suggestedKeywords: safeKeywords, // ✅ safe-only
        sourceCompany,
        targetCompany,
        targetProducts,
        blockedTerms,
        role,
        tone,
        constraints,
        mustPreserveMeaning,
        avoidPhrases,
        preferVerbVariety,
        usedOpeners,
        usedPhrases,
        retry: true,
        previousRewrite: attempt1,
        forceStarterVerbList: forceStarters,
      });

      after2 = computeVerbStrength(attempt2, { mode: "after" });
    }

    // Pick best rewrite (prefer SAFE over "better" if unsafe)
    let bestRewrite = attempt1;
    let bestAfter = after1;

    const riskyFoundBest1 = riskyFound1;

    let riskyFoundBest2: string[] = [];
    if (attempt2) riskyFoundBest2 = findKeywordHits(attempt2, riskyKeywords);

    if (after2 && attempt2) {
      const bestIsSafe = riskyFoundBest1.length === 0;
      const candIsSafe = riskyFoundBest2.length === 0;

      const candidateBetterByStrength =
        after2.baseScore > bestAfter.baseScore ||
        (after2.baseScore === bestAfter.baseScore && after2.score >= bestAfter.score);

      // Prefer safe candidate if current best is unsafe; otherwise use strength criteria
      const chooseCandidate =
        (candIsSafe && !bestIsSafe) || (candIsSafe === bestIsSafe && candidateBetterByStrength);

      if (chooseCandidate) {
        bestRewrite = attempt2;
        bestAfter = after2;
      }
    }

    // Final enforcement: if we STILL violate opener rules or add risky keywords, fallback to original
    const finalOpener = normalizeForMatch(extractOpenerVerb(bestRewrite));
    const finalOpenerViolates =
      preferVerbVariety && finalOpener && hardAvoidOpeners.includes(finalOpener);

    const finalRiskyFound = findKeywordHits(bestRewrite, riskyKeywords);
    const finalRiskyViolates = finalRiskyFound.length > 0;

    let usedOriginalFallback = false;
    if (bestAfter.baseScore < verbStrengthBefore.baseScore || finalOpenerViolates || finalRiskyViolates) {
      usedOriginalFallback = true;
      bestRewrite = originalBullet;
      bestAfter = computeVerbStrength(originalBullet, { mode: "before" });
    }

    const keywordHitsArr = findKeywordHits(bestRewrite, safeKeywords);

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
    notes.push("Keyword guardrail enabled: only keywords already present in the original bullet are allowed.");
    if (preferVerbVariety) notes.push("Verb variety enabled (hard-enforced opener/phrase avoidance).");
    if (avoidPhrases.length) notes.push("Applied avoid list (verbs/phrases).");
    if (usedOpeners.length) notes.push("Used global usedOpeners to reduce opener repetition.");
    if (usedPhrases.length) notes.push("Used global usedPhrases to reduce repeated phrasing.");
    if (retryUsed) notes.push("Auto-retried once (opener/phrase/risky-keyword violation or strength regression).");
    if (usedOriginalFallback) notes.push("Kept original bullet (rewrite violated truth/variance rules or reduced quality).");
    if (blockedKeywords.length) notes.push("Removed blocked keywords from suggestions (guardrail).");
    if (blockedTermsFound.length) notes.push("Detected target-only term risk (blocked terms present).");
    if (riskyKeywords.length)
      notes.push("Job-derived keywords not in the original bullet were treated as risky/forbidden.");

    const regressedBase = bestAfter.baseScore < verbStrengthBefore.baseScore;

    return NextResponse.json({
      ok: true,
      rewrittenBullet: bestRewrite,
      needsMoreInfo,
      notes,

      // Transparency for debugging “mixing”
      safeKeywords,
      riskyKeywords,
      riskyKeywordsFoundInRewrite: usedOriginalFallback ? [] : finalRiskyFound,

      keywordHits: keywordHitsArr,
      blockedKeywords,
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
