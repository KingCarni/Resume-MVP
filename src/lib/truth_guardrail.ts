// src/lib/truth_guardrail.ts

export type TruthRiskLevel = "safe" | "review" | "risky";

export type TruthRisk = {
  score: number; // 0-100
  level: TruthRiskLevel;
  reasons: string[];
  addedTerms: string[];
  riskyPhrases: string[];
  unsupportedClaims: string[];
};

type AnalyzeTruthRiskParams = {
  originalBullet: string;
  rewrittenBullet: string;

  // Optional "allowed" vocabulary that may exist elsewhere in the resume
  // even if not present in the original bullet.
  resumeSkills?: string[];
  sectionSkills?: string[];
  matchedKeywords?: string[];
  allowedTerms?: string[];
};

function normalize(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function tokenize(text: string) {
  return normalize(text)
    .replace(/[^a-z0-9+.#/\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizePhrase(s: string) {
  return normalize(s).replace(/[^a-z0-9+.#/\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function includesPhrase(text: string, phrase: string) {
  const t = normalizePhrase(text);
  const p = normalizePhrase(phrase);
  if (!p) return false;
  return t.includes(p);
}

function findPhrases(text: string, phrases: string[]) {
  const hits: string[] = [];
  for (const phrase of phrases) {
    if (includesPhrase(text, phrase)) hits.push(phrase);
  }
  return uniq(hits);
}

function extractAddedTerms(originalBullet: string, rewrittenBullet: string) {
  const originalTokens = new Set(tokenize(originalBullet));
  const rewrittenTokens = tokenize(rewrittenBullet);

  const stopwords = new Set([
    "a","an","and","the","to","for","of","in","on","with","by","from","into","across","through",
    "using","used","via","while","as","at","or","that","this","these","those","within","over",
    "under","up","down","is","was","were","be","being","been","it","its","their","his","her",
    "our","your","my","team","teams","project","projects","work","worked","working","support",
    "supported","supporting","help","helped","helping"
  ]);

  const added = rewrittenTokens.filter((t) => !originalTokens.has(t) && !stopwords.has(t));

  // remove 1-char junk and dedupe
  return uniq(added.filter((t) => t.length > 1));
}

function findUnsupportedMetrics(originalBullet: string, rewrittenBullet: string) {
  const metricRegexes = [
    /\b\d+(\.\d+)?%\b/g,                // 10%, 8.6%
    /\$\s?\d+([.,]\d+)?[kKmMbB]?\b/g,   // $10k, $1.2M
    /\b\d+\s?\+\b/g,                    // 10+
    /\b\d{2,}\b/g,                      // 25, 100, 5000
    /\b(thousands|millions|billions)\b/g,
  ];

  const originalNorm = normalize(originalBullet);
  const rewrittenNorm = normalize(rewrittenBullet);

  const hits = new Set<string>();

  for (const re of metricRegexes) {
    const matches = rewrittenNorm.match(re) || [];
    for (const m of matches) {
      if (!originalNorm.includes(m)) hits.add(m);
    }
  }

  return Array.from(hits);
}

// Phrases that often inflate business impact beyond the source
const OUTCOME_PHRASES = [
  "revenue growth",
  "increased revenue",
  "boosted revenue",
  "improved revenue",
  "player engagement",
  "user engagement",
  "engagement growth",
  "increased engagement",
  "boosted engagement",
  "improved engagement",
  "improved retention",
  "increased retention",
  "boosted retention",
  "improved conversion",
  "increased conversion",
  "boosted conversion",
  "drove growth",
  "supported growth",
  "business outcomes",
  "operational excellence",
  "optimized business outcomes",
  "improved business outcomes",
  "accelerated growth",
  "enhanced customer satisfaction",
];

// Strong ownership/scope language that can overclaim if newly introduced
const OWNERSHIP_PHRASES = [
  "owned",
  "led",
  "spearheaded",
  "architected",
  "directed",
  "drove",
  "orchestrated",
  "championed",
  "headed",
  "governed",
  "oversaw",
  "end-to-end",
  "end to end",
];

// Strong scope inflation patterns
const SCOPE_PHRASES = [
  "end-to-end delivery",
  "end to end delivery",
  "owned architecture",
  "sole owner",
  "org-wide",
  "organization-wide",
  "cross-functional leadership",
  "enterprise-wide",
  "enterprise wide",
  "platform strategy",
  "roadmap ownership",
];

// Common technical/tool tokens we want to watch for if newly added
const TECH_TERMS = [
  "sql",
  "python",
  "javascript",
  "typescript",
  "node",
  "node.js",
  "react",
  "next.js",
  "nextjs",
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
  "graphql",
  "rest",
  "api",
  "apis",
  "oauth",
  "sso",
  "jwt",
  "linux",
  "excel",
  "tableau",
  "power bi",
  "powerbi",
  "firebase",
  "unity",
  "unreal",
  "unreal engine",
  "growthbook",
  "redis",
  "postgres",
  "postgresql",
  "mysql",
  "mongodb",
];

function findNewTechTerms(params: {
  originalBullet: string;
  rewrittenBullet: string;
  resumeSkills?: string[];
  sectionSkills?: string[];
  matchedKeywords?: string[];
  allowedTerms?: string[];
}) {
  const originalNorm = normalizePhrase(params.originalBullet);
  const rewrittenNorm = normalizePhrase(params.rewrittenBullet);

  const allowPool = uniq([
    ...(params.resumeSkills || []),
    ...(params.sectionSkills || []),
    ...(params.matchedKeywords || []),
    ...(params.allowedTerms || []),
  ]).map(normalizePhrase);

  const hits: { term: string; allowedElsewhere: boolean }[] = [];

  for (const raw of TECH_TERMS) {
    const term = normalizePhrase(raw);
    if (!term) continue;

    const inRewrite = rewrittenNorm.includes(term);
    const inOriginal = originalNorm.includes(term);

    if (inRewrite && !inOriginal) {
      const allowedElsewhere = allowPool.some((x) => x && (x.includes(term) || term.includes(x)));
      hits.push({ term: raw, allowedElsewhere });
    }
  }

  return hits;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function analyzeTruthRisk(params: AnalyzeTruthRiskParams): TruthRisk {
  const {
    originalBullet,
    rewrittenBullet,
    resumeSkills = [],
    sectionSkills = [],
    matchedKeywords = [],
    allowedTerms = [],
  } = params;

  const reasons: string[] = [];
  const riskyPhrases: string[] = [];
  const unsupportedClaims: string[] = [];

  let score = 0;

  const addedTerms = extractAddedTerms(originalBullet, rewrittenBullet);

  // 1) Unsupported metrics (heavy penalty)
  const unsupportedMetrics = findUnsupportedMetrics(originalBullet, rewrittenBullet);
  if (unsupportedMetrics.length) {
    score += 35;
    reasons.push("Added unsupported metric(s)");
    unsupportedClaims.push(...unsupportedMetrics);
  }

  // 2) Outcome inflation
  const outcomeHits = findPhrases(rewrittenBullet, OUTCOME_PHRASES).filter(
    (p) => !includesPhrase(originalBullet, p)
  );
  if (outcomeHits.length) {
    score += Math.min(30, outcomeHits.length * 15);
    reasons.push("Introduced business outcome language not explicit in original");
    riskyPhrases.push(...outcomeHits);
  }

  // 3) Ownership inflation
  const ownershipHits = findPhrases(rewrittenBullet, OWNERSHIP_PHRASES).filter(
    (p) => !includesPhrase(originalBullet, p)
  );
  if (ownershipHits.length) {
    const strongOwnership = ownershipHits.some((p) =>
      ["architected", "spearheaded", "orchestrated", "headed", "governed"].includes(normalizePhrase(p))
    );
    score += strongOwnership ? 20 : 10;
    reasons.push("Introduced stronger ownership language");
    riskyPhrases.push(...ownershipHits);
  }

  // 4) Scope inflation
  const scopeHits = findPhrases(rewrittenBullet, SCOPE_PHRASES).filter(
    (p) => !includesPhrase(originalBullet, p)
  );
  if (scopeHits.length) {
    score += 20;
    reasons.push("Expanded scope beyond the original wording");
    riskyPhrases.push(...scopeHits);
  }

  // 5) New tech/tool injection
  const newTech = findNewTechTerms({
    originalBullet,
    rewrittenBullet,
    resumeSkills,
    sectionSkills,
    matchedKeywords,
    allowedTerms,
  });

  const hardTech = newTech.filter((x) => !x.allowedElsewhere);
  const softTech = newTech.filter((x) => x.allowedElsewhere);

  if (hardTech.length) {
    score += Math.min(40, hardTech.length * 20);
    reasons.push("Added tool/tech not present in original bullet");
    unsupportedClaims.push(...hardTech.map((x) => x.term));
  }

  if (softTech.length) {
    score += Math.min(15, softTech.length * 5);
    reasons.push("Added tool/tech not in bullet (but found elsewhere in resume context)");
    unsupportedClaims.push(...softTech.map((x) => x.term));
  }

  // 6) Generic suspicious overclaim patterns
  const suspiciousPatterns = [
    "at scale",
    "large-scale",
    "large scale",
    "high-impact",
    "high impact",
    "enterprise-grade",
    "enterprise grade",
    "mission-critical",
    "mission critical",
    "strategic initiatives",
    "executive stakeholders",
  ];

  const suspiciousHits = findPhrases(rewrittenBullet, suspiciousPatterns).filter(
    (p) => !includesPhrase(originalBullet, p)
  );

  if (suspiciousHits.length) {
    score += Math.min(15, suspiciousHits.length * 5);
    reasons.push("Introduced higher-seniority or inflated scope phrasing");
    riskyPhrases.push(...suspiciousHits);
  }

  score = clamp(score, 0, 100);

  let level: TruthRiskLevel = "safe";
  if (score >= 55) level = "risky";
  else if (score >= 25) level = "review";

  return {
    score,
    level,
    reasons: uniq(reasons),
    addedTerms: uniq(addedTerms).slice(0, 20),
    riskyPhrases: uniq(riskyPhrases).slice(0, 20),
    unsupportedClaims: uniq(unsupportedClaims).slice(0, 20),
  };
}