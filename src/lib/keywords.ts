// src/lib/keywords.ts

const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","else","when","while","of","at","by","for","with","about",
  "against","between","into","through","during","before","after","to","from","in","out","on","off","over","under",
  "again","further","once","here","there","all","any","both","each","few","more","most","other","some","such",
  "no","nor","not","only","own","same","so","than","too","very","can","will","just","don","should","now",
  "is","am","are","was","were","be","been","being","have","has","had","do","does","did","doing",
  "this","that","these","those","as","it","its","they","them","their","we","our","you","your","i","me","my",
  // common resume fluff
  "responsible","responsibilities","worked","work","years","year","experience","including","strong","skills",
]);

const ALIAS_MAP: Record<string, string> = {
  // normalize common variants
  "ci/cd": "cicd",
  "ci-cd": "cicd",
  "ci cd": "cicd",
  "unit-tests": "unit testing",
  "unit-test": "unit testing",
  "unit testing": "unit testing",
  "integration-tests": "integration testing",
  "integration testing": "integration testing",
  "e2e": "end to end",
  "end-to-end": "end to end",
  "postman": "postman",
  "jira": "jira",
  "confluence": "confluence",
  "typescript": "typescript",
  "javascript": "javascript",
  "playwright": "playwright",
  "selenium": "selenium",
  "cypress": "cypress",
  "api": "api",
  "apis": "api",
};

export type RankedKeyword = { term: string; score: number };

export type AtsGapAnalysis = {
  evaluated: string[];
  present: string[];
  missing: string[];
  addedByRewrite: string[];
  remainingAfterRewrite: string[];
};

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+/#\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyAliases(token: string): string {
  return ALIAS_MAP[token] ?? token;
}

function tokenize(input: string): string[] {
  const t = normalizeText(input);
  return t.split(" ").map(applyAliases).filter(Boolean);
}

function isUsefulToken(t: string): boolean {
  if (t.length < 3) return false;
  if (STOPWORDS.has(t)) return false;
  // filter pure numbers
  if (/^\d+$/.test(t)) return false;
  return true;
}

function buildNgrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n).join(" ");
    out.push(gram);
  }
  return out;
}

function scoreTerms(jobText: string): RankedKeyword[] {
  const baseTokens = tokenize(jobText).filter(isUsefulToken);

  // Weight multi-words higher (they're usually real skills)
  const unigrams = baseTokens;
  const bigrams = buildNgrams(baseTokens, 2);
  const trigrams = buildNgrams(baseTokens, 3);

  // Keep n-grams that look meaningful (avoid "and the", etc. already mostly removed)
  const grams = [
    ...unigrams.map(t => ({ t, w: 1 })),
    ...bigrams.map(t => ({ t, w: 2.2 })),
    ...trigrams.map(t => ({ t, w: 3.2 })),
  ];

  const counts = new Map<string, number>();
  const weights = new Map<string, number>();

  for (const { t, w } of grams) {
    if (!t) continue;
    // avoid ngrams made mostly of stopwords (belt & suspenders)
    const parts = t.split(" ");
    if (parts.some(p => !isUsefulToken(p))) continue;

    counts.set(t, (counts.get(t) ?? 0) + 1);
    weights.set(t, Math.max(weights.get(t) ?? 0, w));
  }

  const raw = jobText;
  const scored: RankedKeyword[] = [];
  for (const [term, freq] of counts.entries()) {
    const w = weights.get(term) ?? 1;
    let score = freq * w;

    // boost for "tool-like" tokens
    if (/(jira|confluence|postman|playwright|selenium|cypress|jenkins|github|aws|gcp|azure|sql|etl)/.test(term)) {
      score *= 1.4;
    }

    // boost if term appears in a "Requirements/Qualifications" style area (rough heuristic)
    const idxReq = raw.toLowerCase().indexOf("require");
    if (idxReq !== -1) {
      const tail = raw.slice(idxReq).toLowerCase();
      if (tail.includes(term)) score *= 1.2;
    }

    scored.push({ term, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate: if trigram exists, drop its component bigrams/unigrams when very overlapping
  const selected: RankedKeyword[] = [];
  const blocked = new Set<string>();

  const blockParts = (term: string) => {
    const parts = term.split(" ");
    parts.forEach(p => blocked.add(p));
    if (parts.length >= 2) {
      for (let i = 0; i < parts.length - 1; i++) {
        blocked.add(parts.slice(i, i + 2).join(" "));
      }
    }
  };

  for (const item of scored) {
    if (selected.length >= 40) break;
    const parts = item.term.split(" ");
    if (parts.length === 1 && blocked.has(item.term)) continue;

    selected.push(item);
    if (parts.length >= 2) blockParts(item.term);
  }

  return selected;
}

function termPresent(resumeNorm: string, term: string): boolean {
  // boundary-ish match for unigrams, substring match for ngrams
  if (term.includes(" ")) return resumeNorm.includes(term);
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(resumeNorm);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keywordPresentInText(text: string, keyword: string): boolean {
  return termPresent(normalizeText(text), normalizeText(keyword));
}

export function buildAtsGapAnalysis(originalText: string, rewrittenText: string, suggestedKeywords: string[]): AtsGapAnalysis {
  const evaluated = Array.from(
    new Set((suggestedKeywords || []).map((k) => normalizeText(String(k))).filter(Boolean))
  );

  const present = evaluated.filter((term) => keywordPresentInText(originalText, term));
  const missing = evaluated.filter((term) => !keywordPresentInText(originalText, term));
  const remainingAfterRewrite = evaluated.filter((term) => !keywordPresentInText(rewrittenText, term));
  const addedByRewrite = missing.filter((term) => keywordPresentInText(rewrittenText, term));

  return {
    evaluated,
    present,
    missing,
    addedByRewrite,
    remainingAfterRewrite,
  };
}

export function analyzeKeywordFit(resumeText: string, jobText: string) {
  const jobKeywords = scoreTerms(jobText); // ranked
  const resumeNorm = normalizeText(resumeText);

  const found: RankedKeyword[] = [];
  const missing: RankedKeyword[] = [];

  let foundScore = 0;
  let totalScore = 0;

  for (const k of jobKeywords) {
    totalScore += k.score;
    if (termPresent(resumeNorm, k.term)) {
      found.push(k);
      foundScore += k.score;
    } else {
      missing.push(k);
    }
  }

  const matchScore = totalScore === 0 ? 0 : Math.round((foundScore / totalScore) * 100);

  return {
    matchScore,
    keywordsFromJob: jobKeywords.map(k => k.term),
    keywordsFoundInResume: found.map(k => k.term),
    missingKeywords: missing.map(k => k.term),
    highImpactMissing: missing.slice(0, 10).map(k => k.term),
    debug: {
      totalEvaluated: jobKeywords.length,
      matchedCount: found.length,
      missingCount: missing.length,
      topWeightedKeywords: jobKeywords.slice(0, 12).map((k) => ({ term: k.term, score: Math.round(k.score * 100) / 100 })),
      topWeightedMissing: missing.slice(0, 12).map((k) => ({ term: k.term, score: Math.round(k.score * 100) / 100 })),
    },
  };
}
