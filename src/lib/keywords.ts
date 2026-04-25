// src/lib/keywords.ts

const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","else","when","while","of","at","by","for","with","about",
  "against","between","into","through","during","before","after","to","from","in","out","on","off","over","under",
  "again","further","once","here","there","all","any","both","each","few","more","most","other","some","such",
  "no","nor","not","only","own","same","so","than","too","very","can","will","just","don","should","now",
  "is","am","are","was","were","be","been","being","have","has","had","do","does","did","doing",
  "this","that","these","those","as","it","its","they","them","their","we","our","you","your","i","me","my",
  "responsible","responsibilities","worked","work","years","year","experience","including","strong","skills",
  "skill","preferred","requirements","requirement","must","nice","plus","also","ideal","great","good","best",
  "excellent","creative","results","driven","professional","thrives","delivering","applications","opportunity",
  "company","clients","partners","support","supporting","suite","business","mission","critical","complex",
  "projects","programs","process","processes","standards","overall","required","located","office","manager",
  "hands","hands-on","closely","across","within","variety","environments","latest","technologies","frameworks"
]);

const ALIAS_MAP: Record<string, string> = {
  "ci/cd": "cicd",
  "ci-cd": "cicd",
  "ci cd": "cicd",
  "unit-tests": "unit testing",
  "unit-test": "unit testing",
  "integration-tests": "integration testing",
  "end-to-end": "end to end",
  "e2e": "end to end",
  "ms sql": "sql server",
  "mssql": "sql server",
  "qe": "quality engineering",
  "qa": "quality assurance",
  "gen ai": "genai",
  "llm": "large language models",
};

export type RankedKeyword = { term: string; score: number };

export type AtsGapAnalysis = {
  evaluated: string[];
  present: string[];
  missing: string[];
  /** Compatibility aliases used by analyzer route consumers. */
  presentKeywords: string[];
  missingKeywords: string[];
  addedByRewrite: string[];
  remainingAfterRewrite: string[];
};

type KnownTerm = {
  term: string;
  pattern: RegExp;
  category:
    | "language"
    | "tool"
    | "framework"
    | "platform"
    | "database"
    | "qa"
    | "process"
    | "domain"
    | "certification";
  weight?: number;
};

function normalizeText(input: string): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+/#\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyAliases(token: string): string {
  return ALIAS_MAP[token] ?? token;
}

function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/\s+/)
    .map(applyAliases)
    .filter(Boolean);
}

function isUsefulToken(token: string): boolean {
  if (!token) return false;
  if (token.length < 3) return false;
  if (STOPWORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

const KNOWN_TERMS: KnownTerm[] = [
  { term: "python", pattern: /\bpython\b/i, category: "language", weight: 12 },
  { term: "java", pattern: /\bjava\b/i, category: "language", weight: 12 },
  { term: "sql", pattern: /\bsql\b/i, category: "language", weight: 12 },
  { term: "bash", pattern: /\bbash\b/i, category: "language", weight: 11 },
  { term: "perl", pattern: /\bperl\b/i, category: "language", weight: 11 },
  { term: "c", pattern: /(?:^|[^a-z])c(?:$|[^a-z])/i, category: "language", weight: 8 },
  { term: "unix", pattern: /\bunix\b/i, category: "platform", weight: 11 },
  { term: "linux", pattern: /\blinux\b/i, category: "platform", weight: 11 },
  { term: "windows", pattern: /\bwindows\b/i, category: "platform", weight: 10 },
  { term: "oracle", pattern: /\boracle\b/i, category: "database", weight: 10 },
  { term: "sql server", pattern: /\b(?:ms sql|sql server|mssql)\b/i, category: "database", weight: 11 },
  { term: "hdfs", pattern: /\bhdfs\b/i, category: "database", weight: 10 },
  { term: "hive", pattern: /\bhive\b/i, category: "database", weight: 10 },
  { term: "cloudera", pattern: /\bcloudera\b/i, category: "database", weight: 10 },
  { term: "selenium", pattern: /\bselenium\b/i, category: "framework", weight: 12 },
  { term: "robot framework", pattern: /\brobot framework\b/i, category: "framework", weight: 12 },
  { term: "soapui", pattern: /\bsoapui\b/i, category: "tool", weight: 11 },
  { term: "testng", pattern: /\btestng\b/i, category: "framework", weight: 11 },
  { term: "jira", pattern: /\bjira\b/i, category: "tool", weight: 10 },
  { term: "confluence", pattern: /\bconfluence\b/i, category: "tool", weight: 10 },
  { term: "alm", pattern: /\balm\b/i, category: "tool", weight: 9 },
  { term: "devops", pattern: /\bdevops\b/i, category: "process", weight: 9 },
  { term: "apis", pattern: /\b(?:api|apis)\b/i, category: "qa", weight: 9 },
  { term: "integration testing", pattern: /\bintegration test(?:ing)? automation\b|\bintegration testing\b/i, category: "qa", weight: 10 },
  { term: "test automation", pattern: /\btest automation\b|\bautomation scripts?\b/i, category: "qa", weight: 12 },
  { term: "quality engineering", pattern: /\bquality engineering\b|\bqe\b/i, category: "qa", weight: 12 },
  { term: "shift left", pattern: /\bshift left\b/i, category: "process", weight: 9 },
  { term: "defect management", pattern: /\bdefect management\b/i, category: "process", weight: 8 },
  { term: "test design", pattern: /\btest design\b/i, category: "process", weight: 8 },
  { term: "code reviews", pattern: /\bcode reviews?\b/i, category: "process", weight: 8 },
  { term: "continuous testing", pattern: /\bcontinuous test(?:ing| execution)\b/i, category: "process", weight: 8 },
  { term: "aml", pattern: /\baml\b/i, category: "domain", weight: 8 },
  { term: "genai", pattern: /\b(?:gen ai|genai)\b/i, category: "domain", weight: 8 },
  { term: "large language models", pattern: /\b(?:llm|large language models?)\b/i, category: "domain", weight: 8 },
  { term: "data engineering", pattern: /\bdata engineering\b/i, category: "domain", weight: 8 },
  { term: "istqb", pattern: /\bistqb\b/i, category: "certification", weight: 8 },
  { term: "agile testing", pattern: /\bagile testing\b/i, category: "certification", weight: 7 },
];

const PROCESS_PHRASES = [
  "test automation",
  "integration testing",
  "integration test automation",
  "quality engineering",
  "code reviews",
  "continuous testing",
  "continuous test execution",
  "defect management",
  "test design",
  "test estimation",
  "automation scripts",
  "shift left",
  "technical automated testing",
  "hands on testing",
  "hands-on testing",
];

function splitSections(jobText: string) {
  const normalized = normalizeText(jobText);
  const mustHaveStart = normalized.search(/\bmust have\b/);
  const niceToHaveStart = normalized.search(/\bnice to have\b/);

  return {
    full: normalized,
    mustHave:
      mustHaveStart >= 0
        ? normalized.slice(mustHaveStart, niceToHaveStart >= 0 ? niceToHaveStart : undefined)
        : "",
    niceToHave: niceToHaveStart >= 0 ? normalized.slice(niceToHaveStart) : "",
  };
}

function addScore(map: Map<string, number>, term: string, score: number) {
  if (!term) return;
  map.set(term, (map.get(term) ?? 0) + score);
}

function scoreKnownTerms(jobText: string) {
  const sections = splitSections(jobText);
  const scores = new Map<string, number>();

  for (const item of KNOWN_TERMS) {
    if (item.pattern.test(sections.full)) addScore(scores, item.term, item.weight ?? 8);
    if (sections.mustHave && item.pattern.test(sections.mustHave)) addScore(scores, item.term, Math.ceil((item.weight ?? 8) * 0.6));
    if (sections.niceToHave && item.pattern.test(sections.niceToHave)) addScore(scores, item.term, Math.ceil((item.weight ?? 8) * 0.2));
  }

  for (const phrase of PROCESS_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(sections.full)) addScore(scores, phrase, 6);
    if (sections.mustHave && re.test(sections.mustHave)) addScore(scores, phrase, 3);
  }

  return scores;
}

function scoreFallbackNgrams(jobText: string) {
  const tokens = tokenize(jobText).filter(isUsefulToken);
  const scores = new Map<string, number>();

  for (const token of tokens) {
    addScore(scores, token, 1);
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (!STOPWORDS.has(tokens[i]) && !STOPWORDS.has(tokens[i + 1])) {
      addScore(scores, bigram, 2);
    }
  }

  return scores;
}

function scoreTerms(jobText: string): RankedKeyword[] {
  const known = scoreKnownTerms(jobText);
  const fallback = scoreFallbackNgrams(jobText);

  for (const [term, score] of fallback.entries()) {
    if (!known.has(term)) {
      known.set(term, score);
    }
  }

  return Array.from(known.entries())
    .filter(([term]) => term.length >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([term, score]) => ({ term, score }));
}

function keywordSetFromText(input: string) {
  const text = normalizeText(input);
  const found = new Set<string>();

  for (const item of KNOWN_TERMS) {
    if (item.pattern.test(text)) found.add(item.term);
  }

  return found;
}

export function analyzeKeywordFit(
  jobText: string,
  resumeText: string,
  rewrittenBullets: string[] = []
): AtsGapAnalysis & { keywordsFromJob: RankedKeyword[]; highImpactMissing: string[] } {
  const keywordsFromJob = scoreTerms(jobText);
  const evaluated = keywordsFromJob.map((k) => k.term);

  const resumeTerms = keywordSetFromText(resumeText);
  const rewriteTerms = keywordSetFromText(rewrittenBullets.join(" "));

  const present = evaluated.filter((term) => resumeTerms.has(term));
  const missing = evaluated.filter((term) => !resumeTerms.has(term));
  const addedByRewrite = evaluated.filter((term) => !resumeTerms.has(term) && rewriteTerms.has(term));
  const remainingAfterRewrite = evaluated.filter((term) => !resumeTerms.has(term) && !rewriteTerms.has(term));

  return {
    evaluated,
    present,
    missing,
    presentKeywords: present,
    missingKeywords: missing,
    addedByRewrite,
    remainingAfterRewrite,
    keywordsFromJob,
    highImpactMissing: missing.slice(0, 12),
  };
}

export function extractJobKeywords(jobText: string, maxKeywords = 20): string[] {
  return scoreTerms(jobText).slice(0, maxKeywords).map((k) => k.term);
}
