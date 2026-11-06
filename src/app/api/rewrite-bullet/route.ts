// src/app/api/rewrite-bullet/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { computeVerbStrength } from "@/lib/verb_strength";
import { sanitizeKeywords } from "@/lib/keywordSanitizer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits, getCreditBalance } from "@/lib/credits";
import { analyzeTruthRisk } from "@/lib/truth_guardrail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReqBody = {
  jobText: string;
  originalBullet: string;
  suggestedKeywords: string[];

  sourceCompany?: string;
  targetCompany?: string;
  targetProducts?: string[];
  blockedTerms?: string[];

  role?: string;
  targetPosition?: string;
  tone?: string;

  priorityMissingKeywords?: string[];
  bulletTargetKeywords?: string[];
  matchedKeywords?: string[];
  ignoredMissingKeywords?: string[];

  constraints?: string[];
  mustPreserveMeaning?: boolean;

  avoidPhrases?: string[];
  preferVerbVariety?: boolean;

  usedOpeners?: string[];
  usedPhrases?: string[];
  usedTailPhrases?: string[];

  resumeSkills?: string[];
  sectionSkills?: string[];
  allowedTerms?: string[];

  rewriteSessionId?: string;
  attemptNumber?: number;
  maxAttempts?: number;
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

function isMeaningfulAtsKeyword(term: string) {
  const t = normalizeForMatch(term).replace(/[^a-z0-9+.#/\s-]/g, " ").trim();
  if (!t) return false;
  const banned = new Set([
    "best","big","want","setting","excellent","benefits","culture","mission","values",
    "attitude","addition","closely","around","group","diverse","customer-first","customer first"
  ]);
  if (banned.has(t)) return false;
  const technicalSingles = new Set([
    "qa","sql","api","apis","rest","graphql","python","typescript","javascript","react","next.js",
    "nextjs","node","node.js","playwright","selenium","cypress","postman","jira","testrail","jenkins",
    "docker","kubernetes","aws","azure","gcp","oauth","sso","jwt","linux","excel","tableau","power bi"
  ]);
  if (technicalSingles.has(t)) return true;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 4) {
    return parts.some((part) => /(test|testing|automation|analysis|analytics|engineer|engineering|developer|development|api|sql|data|reporting|quality|assurance|release|triage|dashboard|cloud)/i.test(part));
  }
  return false;
}

function pickUserSelectedKeywords(args: {
  originalBullet: string;
  selectedKeywords: string[];
  ignoredMissingKeywords: string[];
  blockedTerms: string[];
  safeKeywords: string[];
}) {
  const originalNorm = normalizeForMatch(args.originalBullet);
  const ignoredSet = new Set(args.ignoredMissingKeywords.map(normalizeForMatch));
  const blockedSet = new Set(args.blockedTerms.map(normalizeForMatch));
  const safeSet = new Set(args.safeKeywords.map(normalizeForMatch));

  return uniq(args.selectedKeywords)
    .map((k) => normalize(k))
    .filter(Boolean)
    .filter((k) => !ignoredSet.has(normalizeForMatch(k)))
    .filter((k) => !blockedSet.has(normalizeForMatch(k)))
    .filter((k) => !safeSet.has(normalizeForMatch(k)))
    .filter((k) => !originalNorm.includes(normalizeForMatch(k)))
    .filter((k) => isMeaningfulAtsKeyword(k))
    .slice(0, 2);
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
    if (["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with"].includes(clean)) continue;
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
  "drove",
  "streamlined",
  "facilitated",
  "analyzed",
  "partnered",
  "validated",
  "established",
  "engaged",
  "implemented",
  "improved",
  "delivered",
  "owned",
  "shipped",
  "revamped",
  "directed",
  "mentored",
  "authored",
  "formulated",
  "informed",
  "secured",
  "defined",
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
  "production efficiency",
  "overall production efficiency",
  "enhance production efficiency",
  "enhancing production efficiency",
  "project timelines",
  "cross-team collaboration",
  "overall workflow efficiency",
  "workflow efficiency",
  "operational efficiency",
  "production outcomes",
  "production processes",
  "production workflows",
  "project progress",
  "timely delivery",
  "project tracking and reporting efficiency",
  "maintaining production timelines",
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
  targetPosition?: string;
  tone?: string;

  priorityMissingKeywords?: string[];
  bulletTargetKeywords?: string[];
  matchedKeywords?: string[];
  ignoredMissingKeywords?: string[];

  constraints?: string[];
  mustPreserveMeaning?: boolean;

  avoidPhrases?: string[];
  preferVerbVariety?: boolean;

  usedOpeners?: string[];
  usedPhrases?: string[];
  usedTailPhrases?: string[];

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
    targetPosition,
    tone,
    priorityMissingKeywords,
    bulletTargetKeywords,
    matchedKeywords,
    ignoredMissingKeywords,
    constraints,
    mustPreserveMeaning,
    avoidPhrases,
    preferVerbVariety,
    usedOpeners,
    usedPhrases,
    usedTailPhrases,
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
  const avoidNorm = safeArray(avoidPhrases).map((s) => normalizeForMatch(s)).filter(Boolean);
  const usedOpenersNorm = safeArray(usedOpeners).map((s) => normalizeForMatch(s)).filter(Boolean);
  const usedPhrasesNorm = safeArray(usedPhrases).map((s) => normalizeForMatch(s)).filter(Boolean);
  const usedTailPhrasesNorm = safeArray(usedTailPhrases).map((s) => normalizeTail(s)).filter(Boolean);

  const combinedAvoidOpeners = uniq([...DEFAULT_OVERUSED_OPENERS, ...usedOpenersNorm, ...avoidNorm]).filter(Boolean);
  const combinedAvoidPhrases = uniq([...DEFAULT_OVERUSED_PHRASES, ...usedPhrasesNorm, ...avoidNorm]).filter(Boolean);

  const originalOpener = extractOpenerVerb(originalBullet);

  const blocks: string[] = [];

  blocks.push(`ROLE CONTEXT: ${normalize(role) || "QA / Quality"}`);
  if (normalize(targetPosition)) blocks.push(`TARGET POSITION: ${normalize(targetPosition)}`);
  if (normalize(sourceCompany)) blocks.push(`SOURCE COMPANY: ${normalize(sourceCompany)}`);

  blocks.push("");
  blocks.push("ORIGINAL BULLET:");
  blocks.push(originalBullet);

  blocks.push("");
  blocks.push("JOB POSTING (alignment only; do NOT copy company/product names; do NOT import requirements as experience):");
  blocks.push(jobText);

  blocks.push("");
  blocks.push(
    `SUGGESTED KEYWORDS (reinforce these if they already fit the original bullet): ${
      suggestedKeywords.join(", ") || "(none)"
    }`
  );

  blocks.push("");
  blocks.push(
    `BULLET TARGET KEYWORDS (user-selected; use at most 1-2 only if the original bullet already supports them truthfully): ${
      safeArray(bulletTargetKeywords).join(", ") || "(none)"
    }`
  );
  blocks.push(
    `MATCHED KEYWORDS (optional reinforcement only): ${safeArray(matchedKeywords).join(", ") || "(none)"}`
  );
  if (safeArray(ignoredMissingKeywords).length) {
    blocks.push(`IGNORED MISSING KEYWORDS (do not chase these): ${safeArray(ignoredMissingKeywords).join(", ")}`);
  }

  blocks.push("");
  blocks.push(`BLOCKED TERMS (must not appear): ${blocked.join(", ") || "(none)"}`);

  blocks.push("");
  blocks.push("VARIANCE RULES:");
  blocks.push(`- Prefer verb variety: ${preferVerbVariety ? "ON" : "OFF (default)"}`);
  blocks.push(`- Do NOT start with any of these opener verbs: ${combinedAvoidOpeners.join(", ") || "(none)"}`);
  blocks.push(`- Original opener detected: ${originalOpener || "(none)"}`);
  blocks.push("- If the original opener is overused, choose a different strong verb that preserves meaning.");

  if (combinedAvoidPhrases.length) {
    blocks.push(`- Avoid these repeated phrases: ${combinedAvoidPhrases.join(", ")}`);
  }
  if (usedTailPhrasesNorm.length) {
    blocks.push(`- Do NOT end the bullet with any of these repeated ending phrases: ${usedTailPhrasesNorm.join(", ")}`);
    blocks.push("- Vary the final clause so bullets do not repeatedly land on the same outcome wording.");
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
  blocks.push("- Only use bullet target keywords when they are clearly supported by the original bullet; otherwise skip them. Never force them in.");

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
    temperature: 0.35,
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

function normalizeTail(text: string) {
  return normalizeForMatch(text).replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function extractTailPhrases(text: string) {
  const tokens = normalizeTail(text).split(/\s+/).filter(Boolean);
  const tails: string[] = [];
  if (tokens.length >= 2) tails.push(tokens.slice(-2).join(" "));
  if (tokens.length >= 3) tails.push(tokens.slice(-3).join(" "));
  if (tokens.length >= 4) tails.push(tokens.slice(-4).join(" "));
  return uniq(tails);
}

function endsWithAnyTailPhrase(text: string, tails: string[]) {
  const extracted = extractTailPhrases(text);
  const forbidden = new Set(tails.map(normalizeTail).filter(Boolean));
  return extracted.some((tail) => forbidden.has(tail));
}

function scoreDelta(beforeScore: number, afterScore: number) {
  return Math.round(afterScore - beforeScore);
}

function safeInt(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export async function POST(req: Request) {
  let chargedUserId = "";
  let chargedCost = 0;
  let currentRewriteSessionId = "";
  let currentAttemptNumber = 1;
  let currentMaxAttempts = 5;

  try {
    // ✅ Require login
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "Missing OPENAI_API_KEY in .env.local" }, { status: 500 });

    // ✅ Parse + validate BEFORE charging
    const body = (await req.json()) as Partial<ReqBody>;

    const jobText = normalize(body.jobText);
    const originalBullet = normalize(body.originalBullet);
    const rawSuggestedKeywords = normalizeKeywords(body.suggestedKeywords);

    const sourceCompany = normalize(body.sourceCompany);
    const targetCompany = normalize(body.targetCompany);
    const targetProducts = safeArray(body.targetProducts);
    const blockedTerms = safeArray(body.blockedTerms);

    const role = normalize(body.role) || "QA Lead";
    const targetPosition = normalize((body as any).targetPosition);
    const tone = normalize(body.tone) || "confident, concise, impact-driven";

    const priorityMissingKeywords = safeArray((body as any).priorityMissingKeywords);
    const bulletTargetKeywords = safeArray((body as any).bulletTargetKeywords);
    const matchedKeywords = safeArray((body as any).matchedKeywords);
    const ignoredMissingKeywords = safeArray((body as any).ignoredMissingKeywords);

    const constraints = safeArray(body.constraints);
    const mustPreserveMeaning = !!body.mustPreserveMeaning;
    const avoidPhrases = safeArray(body.avoidPhrases);
    const preferVerbVariety = !!body.preferVerbVariety;

    const usedOpeners = safeArray(body.usedOpeners);
    const usedPhrases = safeArray(body.usedPhrases);
    const usedTailPhrases = safeArray((body as any).usedTailPhrases);

    const resumeSkills = safeArray((body as any).resumeSkills);
    const sectionSkills = safeArray((body as any).sectionSkills);
    const allowedTerms = safeArray((body as any).allowedTerms);

    const rewriteSessionId = normalize((body as any).rewriteSessionId);
    const attemptNumber = Math.max(1, safeInt((body as any).attemptNumber, 1));
    const maxAttempts = Math.min(10, Math.max(1, safeInt((body as any).maxAttempts, 5)));

    currentRewriteSessionId = rewriteSessionId;
    currentAttemptNumber = attemptNumber;
    currentMaxAttempts = maxAttempts;

    if (!jobText || !originalBullet) {
      return NextResponse.json({ ok: false, error: "Missing jobText or originalBullet" }, { status: 400 });
    }
    if (originalBullet.length > 800) {
      return NextResponse.json({ ok: false, error: "originalBullet too long. Keep under 800 chars." }, { status: 400 });
    }
    if (jobText.length > 6000) {
      return NextResponse.json({ ok: false, error: "jobText too long. Keep under ~6k chars." }, { status: 400 });
    }

    // ✅ Charge once per rewrite session. Attempts 2..N in the same session are free.
    const COST_REWRITE = 1;

    if (attemptNumber > maxAttempts) {
      const balance = await getCreditBalance(dbUser.id);
      return NextResponse.json(
        {
          ok: false,
          error: "ATTEMPT_LIMIT_REACHED",
          attemptsUsed: maxAttempts,
          maxAttempts,
          balance,
        },
        { status: 429 }
      );
    }

    const chargeRef =
      rewriteSessionId && rewriteSessionId.length
        ? `rewrite_bullet:${rewriteSessionId}`
        : undefined;

    const shouldChargeThisRequest = attemptNumber === 1 || !chargeRef;

    let charged: Awaited<ReturnType<typeof chargeCredits>> = {
      ok: true as const,
      balance: await getCreditBalance(dbUser.id),
      alreadyApplied: false as const,
    };

    if (shouldChargeThisRequest) {
      charged = await chargeCredits({
        userId: dbUser.id,
        cost: COST_REWRITE,
        reason: "rewrite_bullet",
        eventType: "rewrite_bullet",
        ref: chargeRef,
        meta: {
          cost: COST_REWRITE,
          originalLen: originalBullet.length,
          rewriteSessionId: currentRewriteSessionId || undefined,
          attemptNumber,
          maxAttempts,
        },
      });

      if (!charged.ok) {
        return NextResponse.json({ ok: false, error: "OUT_OF_CREDITS", balance: charged.balance }, { status: 402 });
      }

      chargedUserId = dbUser.id;
      chargedCost = charged.alreadyApplied ? 0 : COST_REWRITE;
    }

    const { usableKeywords, blockedKeywords } = sanitizeKeywords({
      rawKeywords: rawSuggestedKeywords,
      targetCompany: targetCompany || undefined,
      targetProducts,
      extraBlocked: blockedTerms,
    });

    // Safe reinforcement keywords already present in the original bullet.
    const safeKeywords = findKeywordHits(originalBullet, usableKeywords);
    const safeNorm = new Set(safeKeywords.map(normalizeForMatch));

    // Missing keywords are no longer auto-injected. Only user-selected per-bullet keywords
    // may be considered, and only if they fit the original bullet truthfully.
    const allowedBulletTargetKeywords = pickUserSelectedKeywords({
      originalBullet,
      selectedKeywords: bulletTargetKeywords.length ? bulletTargetKeywords : priorityMissingKeywords,
      ignoredMissingKeywords,
      blockedTerms: [...(targetCompany ? [targetCompany] : []), ...targetProducts, ...blockedTerms],
      safeKeywords,
    });
    const allowedBulletTargetNorm = new Set(allowedBulletTargetKeywords.map(normalizeForMatch));
    const reinforcementKeywords = uniq([
      ...findKeywordHits(originalBullet, matchedKeywords),
      ...safeKeywords,
    ]).slice(0, 4);

    const riskyKeywords = usableKeywords.filter(
      (k) => !safeNorm.has(normalizeForMatch(k)) && !allowedBulletTargetNorm.has(normalizeForMatch(k))
    );

    const client = new OpenAI({ apiKey });

    const verbStrengthBefore = computeVerbStrength(originalBullet);
    const beforeScore = verbStrengthBefore.score;

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
      suggestedKeywords: uniq([...reinforcementKeywords, ...allowedBulletTargetKeywords]).slice(0, 8),
      sourceCompany,
      targetCompany,
      targetProducts,
      blockedTerms,
      role,
      targetPosition,
      tone,
      priorityMissingKeywords: [],
      bulletTargetKeywords: allowedBulletTargetKeywords,
      matchedKeywords: reinforcementKeywords,
      ignoredMissingKeywords,
      constraints,
      mustPreserveMeaning,
      avoidPhrases,
      preferVerbVariety,
      usedOpeners,
      usedPhrases,
      usedTailPhrases,
      retry: false,
    });

    if (!attempt1 || !attempt1.trim()) throw new Error("Model returned empty response");

    const after1 = computeVerbStrength(attempt1);
    const afterScore1 = after1.score;

    const opener1 = normalizeForMatch(extractOpenerVerb(attempt1));
    const openerViolates = preferVerbVariety && opener1 && hardAvoidOpeners.includes(opener1);

    const phraseViolates = preferVerbVariety && hardAvoidPhrases.length ? containsAnyPhrase(attempt1, hardAvoidPhrases) : false;
    const tailViolates = preferVerbVariety && usedTailPhrases.length ? endsWithAnyTailPhrase(attempt1, usedTailPhrases) : false;

    const riskyFound1 = findKeywordHits(attempt1, riskyKeywords);
    const riskyViolates = riskyFound1.length > 0;

    let retryUsed = false;
    let attempt2: string | null = null;
    let after2: ReturnType<typeof computeVerbStrength> | null = null;

    const needsRetry = afterScore1 < beforeScore || openerViolates || phraseViolates || tailViolates || riskyViolates;

    if (needsRetry) {
      retryUsed = true;

      const starterPool = [
        "Led",
        "Owned",
        "Implemented",
        "Standardized",
        "Coordinated",
        "Automated",
        "Improved",
        "Delivered",
        "Validated",
        "Triaged",
        "Established",
        "Analyzed",
        "Authored",
        "Built",
        "Debugged",
        "Defined",
        "Directed",
        "Facilitated",
        "Formulated",
        "Guided",
        "Informed",
        "Integrated",
        "Launched",
        "Mentored",
        "Monitored",
        "Optimized",
        "Organized",
        "Partnered",
        "Resolved",
        "Revamped",
        "Shipped",
        "Strengthened",
        "Supported",
        "Tested",
        "Updated",
      ];

      const forceStarters = starterPool.filter(
        (verb) => !hardAvoidOpeners.includes(normalizeForMatch(verb))
      );

      attempt2 = await generateRewrite(client, {
        originalBullet,
        jobText,
        suggestedKeywords: uniq([...reinforcementKeywords, ...allowedBulletTargetKeywords]).slice(0, 8),
        sourceCompany,
        targetCompany,
        targetProducts,
        blockedTerms,
        role,
        targetPosition,
        tone,
        priorityMissingKeywords: [],
        bulletTargetKeywords: allowedBulletTargetKeywords,
        matchedKeywords: reinforcementKeywords,
        ignoredMissingKeywords,
        constraints,
        mustPreserveMeaning,
        avoidPhrases,
        preferVerbVariety,
        usedOpeners,
        usedPhrases,
        usedTailPhrases,
        retry: true,
        previousRewrite: attempt1,
        forceStarterVerbList: forceStarters,
      });

      if (attempt2 && attempt2.trim()) after2 = computeVerbStrength(attempt2);
    }

    // Pick best rewrite (prefer SAFE; then higher score)
    let bestRewrite = attempt1;
    let bestAfter = after1;

    let riskyFoundBest2: string[] = [];
    if (attempt2) riskyFoundBest2 = findKeywordHits(attempt2, riskyKeywords);

    if (after2 && attempt2) {
      const bestIsSafe = riskyFound1.length === 0;
      const candIsSafe = riskyFoundBest2.length === 0;
      const candidateBetter = after2.score > bestAfter.score;

      const chooseCandidate = (candIsSafe && !bestIsSafe) || (candIsSafe === bestIsSafe && candidateBetter);
      if (chooseCandidate) {
        bestRewrite = attempt2;
        bestAfter = after2;
      }
    }

    // Final enforcement: if still violates opener or adds risky keywords, fallback to original
    const finalOpener = normalizeForMatch(extractOpenerVerb(bestRewrite));
    const finalOpenerViolates = preferVerbVariety && finalOpener && hardAvoidOpeners.includes(finalOpener);
    const finalTailViolates = preferVerbVariety && usedTailPhrases.length ? endsWithAnyTailPhrase(bestRewrite, usedTailPhrases) : false;

    const finalRiskyFound = findKeywordHits(bestRewrite, riskyKeywords);
    const finalRiskyViolates = finalRiskyFound.length > 0;

    let usedOriginalFallback = false;
    if (bestAfter.score < beforeScore || finalOpenerViolates || finalTailViolates || finalRiskyViolates) {
      usedOriginalFallback = true;
      bestRewrite = originalBullet;
      bestAfter = verbStrengthBefore;
    }

    const afterScore = bestAfter.score;
    const delta = scoreDelta(beforeScore, afterScore);

    const keywordHitsArr = findKeywordHits(bestRewrite, uniq([...safeKeywords, ...allowedBulletTargetKeywords, ...reinforcementKeywords]));

    const blockedUniverse = [...(targetCompany ? [targetCompany] : []), ...targetProducts, ...blockedTerms]
      .map((s) => String(s || "").trim())
      .filter(Boolean);

    const blockedTermsFound = findKeywordHits(bestRewrite, blockedUniverse);

    const truthRisk = analyzeTruthRisk({
      originalBullet,
      rewrittenBullet: bestRewrite,
      resumeSkills,
      sectionSkills,
      matchedKeywords: reinforcementKeywords,
      allowedTerms: uniq([
        ...allowedBulletTargetKeywords,
        ...safeKeywords,
        ...allowedTerms,
      ]),
    });

    const needsMoreInfo =
      originalBullet.length < 40 || /^(qa|testing|automation|bugs|regression|jira|sdlc)\b/i.test(originalBullet);

    const notes: string[] = [];
    notes.push("Rewrote for clarity + impact while preserving truthfulness.");
    notes.push("Keyword guardrail enabled: original keywords are safest. Missing keywords are only used when the user explicitly targets them for a bullet and they fit truthfully.");
    if (preferVerbVariety) notes.push("Verb variety enabled (hard-enforced opener/phrase avoidance).");
    if (avoidPhrases.length) notes.push("Applied avoid list (verbs/phrases).");
    if (usedOpeners.length) notes.push("Used global usedOpeners to reduce opener repetition.");
    if (usedPhrases.length) notes.push("Used global usedPhrases to reduce repeated phrasing.");
    if (usedTailPhrases.length) notes.push("Used global usedTailPhrases to reduce repeated bullet endings.");
    if (retryUsed) notes.push("Auto-retried once (opener/phrase/tail/risky-keyword violation or score regression).");
    if (usedOriginalFallback) notes.push("Kept original bullet (rewrite violated safety/variance rules or reduced quality).");
    if (blockedKeywords.length) notes.push("Removed blocked keywords from suggestions (guardrail).");
    if (allowedBulletTargetKeywords.length) notes.push(`User-selected bullet keywords considered where truthful: ${allowedBulletTargetKeywords.join(", ")}.`);
    if (blockedTermsFound.length) notes.push("Detected target-only term risk (blocked terms present).");
    if (riskyKeywords.length) notes.push("Job-derived keywords not in the original bullet were treated as risky/forbidden.");
    if (truthRisk.level === "review") notes.push("Truth Guardrail: review suggested for possible wording inflation.");
    if (truthRisk.level === "risky") notes.push("Truth Guardrail: potential overclaim detected; review before keeping this rewrite.");

    const regressed = afterScore < beforeScore;

    const display = {
      before: { score: beforeScore, label: verbStrengthBefore.label },
      after: { score: afterScore, label: bestAfter.label },
      delta,
      improved: delta > 0,
    };

    return NextResponse.json({
      ok: true,
      rewrittenBullet: bestRewrite,
      needsMoreInfo,

      // credits
      creditsRemaining: charged.balance,
      balance: charged.balance,
      rewriteSessionId: rewriteSessionId || null,
      attemptNumber,
      maxAttempts,
      chargedThisRequest: shouldChargeThisRequest,

      safeKeywords,
      allowedBulletTargetKeywords,
      reinforcementKeywords,
      riskyKeywords,
      riskyKeywordsFoundInRewrite: usedOriginalFallback ? [] : finalRiskyFound,

      keywordHits: keywordHitsArr,
      blockedKeywords,
      blockedTermsFound,

      verbStrengthBefore,
      verbStrengthAfter: bestAfter,

      scoreDelta: delta,
      display,

      regressed,
      retryUsed,
      usedOriginalFallback,
      truthRisk,
      notes,
    });
  } catch (e: any) {
    const message = e?.message ? String(e.message) : String(e);
    console.error("rewrite-bullet route error:", e);

    if (chargedUserId && chargedCost > 0) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_rewrite_bullet_failed",
          eventType: "rewrite_bullet",
          ref: currentRewriteSessionId
            ? `refund_rewrite_bullet:${currentRewriteSessionId}`
            : `refund_rewrite_bullet:${Date.now()}:${chargedUserId}`,
          meta: {
            error: message,
            cost: chargedCost,
            rewriteSessionId: currentRewriteSessionId || undefined,
            currentAttemptNumber,
            currentMaxAttempts,
          },
        });

        return NextResponse.json(
          { ok: false, error: message || "Rewrite failed", refunded: true, balance: refunded.balance },
          { status: 500 }
        );
      } catch (refundErr: any) {
        console.error("refundCredits failed:", refundErr);
        return NextResponse.json(
          {
            ok: false,
            error: message || "Rewrite failed",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: false, error: message || "Rewrite failed" }, { status: 500 });
  }
}
