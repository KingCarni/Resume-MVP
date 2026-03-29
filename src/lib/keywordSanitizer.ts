// src/lib/keywordSanitizer.ts

export type KeywordSanitizerParams = {
  rawKeywords: unknown; // allow any shape; we normalize safely
  targetCompany?: string;
  targetProducts?: string[];
  extraBlocked?: string[];
};

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanTerm(input: unknown) {
  return String(input ?? "")
    .trim()
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^[,.;:]+|[,.;:]+$/g, "")
    .trim();
}

const BANNED_KEYWORDS = new Set([
  "best",
  "big",
  "want",
  "setting",
  "excellent",
  "benefits",
  "culture",
  "mission",
  "values",
  "attitude",
  "addition",
  "closely",
  "around",
  "group",
  "diverse",
  "customer-first",
  "customer first",
  "passion",
  "ideal",
  "creative",
  "balance",
  "global",
  "premium",
  "native",
  "first",
  "working",
  "media",
  "industry",
]);

const TECHNICAL_SINGLE_WORDS = new Set([
  "qa",
  "sql",
  "api",
  "apis",
  "rest",
  "graphql",
  "python",
  "typescript",
  "javascript",
  "react",
  "next.js",
  "nextjs",
  "node",
  "node.js",
  "playwright",
  "selenium",
  "cypress",
  "postman",
  "jira",
  "testrail",
  "jenkins",
  "docker",
  "kubernetes",
  "aws",
  "azure",
  "gcp",
  "oauth",
  "sso",
  "jwt",
  "linux",
  "excel",
  "tableau",
  "power bi",
  "powerbi",
  "unity",
  "unreal",
  "firebase",
  "redis",
  "postgres",
  "postgresql",
  "mysql",
  "mongodb",
  "llm",
  "llms",
  "analytics",
  "reporting",
  "automation",
  "testing",
  "playtests",
  "ci/cd",
  "cicd",
]);

/**
 * Filters obvious filler/junk while still allowing technical singles
 * and ATS-style 2-4 word phrases.
 */
export function isMeaningfulKeyword(term: string) {
  const t = normalize(term).replace(/[^a-z0-9+.#/\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (BANNED_KEYWORDS.has(t)) return false;
  if (TECHNICAL_SINGLE_WORDS.has(t)) return true;

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return /^[a-z0-9+.#/-]{2,}$/.test(t) && /[0-9+#./-]/.test(t);
  }

  if (parts.length >= 2 && parts.length <= 4) {
    return parts.some((part) =>
      /(test|testing|automation|analysis|analytics|engineer|engineering|developer|development|api|sql|data|reporting|quality|assurance|release|triage|dashboard|cloud|backend|frontend|mobile|web|game|security|identity|platform|infrastructure|integration)/i.test(
        part
      )
    );
  }

  return false;
}

function coerceTermArray(input: unknown): string[] {
  const arr: string[] = Array.isArray(input)
    ? input.map((x) => String(x))
    : typeof input === "string"
      ? input.split(",")
      : [];

  const cleaned = arr.map(cleanTerm).filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of cleaned) {
    const key = normalize(k);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }

  return out;
}

/**
 * Accept unknown input and return a clean keyword array.
 * This prevents crashes when the client sends weird shapes.
 */
export function coerceKeywordArray(input: unknown): string[] {
  return coerceTermArray(input);
}

/**
 * Context terms are used for truth guardrail / allowed-term comparisons.
 * They get the same normalization pipeline as keywords.
 */
export function coerceContextTerms(input: unknown): string[] {
  return coerceTermArray(input);
}

/**
 * Cleans and filters context terms down to meaningful-ish terms.
 * Useful for resumeSkills / sectionSkills / allowedTerms.
 */
export function sanitizeContextTerms(input: unknown): string[] {
  return coerceContextTerms(input)
    .filter((term) => isMeaningfulKeyword(term) || normalize(term).split(/\s+/).length <= 4)
    .map((term) => cleanTerm(term))
    .filter(Boolean);
}

/**
 * Split usable vs blocked keywords.
 */
export function sanitizeKeywords(params: KeywordSanitizerParams): {
  usableKeywords: string[];
  blockedKeywords: string[];
} {
  const raw = coerceKeywordArray(params.rawKeywords).filter((term) => isMeaningfulKeyword(term));

  const blockedTerms = [
    params.targetCompany || "",
    ...(params.targetProducts || []),
    ...(params.extraBlocked || []),
  ]
    .map((x) => cleanTerm(x))
    .filter(Boolean);

  const usableKeywords: string[] = [];
  const blockedKeywords: string[] = [];

  const seenUsable = new Set<string>();
  const seenBlocked = new Set<string>();

  for (const k of raw) {
    const kw = cleanTerm(k);
    if (!kw) continue;

    const kwNorm = normalize(kw);

    const isBlocked = blockedTerms.some((t) => {
      const tNorm = normalize(t);
      if (!tNorm) return false;

      // Block if keyword contains term OR term contains keyword
      // e.g., "monopoly" vs "monopoly go"
      return kwNorm.includes(tNorm) || tNorm.includes(kwNorm);
    });

    if (isBlocked) {
      if (!seenBlocked.has(kwNorm)) {
        blockedKeywords.push(kw);
        seenBlocked.add(kwNorm);
      }
    } else {
      if (!seenUsable.has(kwNorm)) {
        usableKeywords.push(kw);
        seenUsable.add(kwNorm);
      }
    }
  }

  return { usableKeywords, blockedKeywords };
}
