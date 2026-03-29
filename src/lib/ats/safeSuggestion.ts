// src/lib/ats/safeSuggestions.ts

type SafeSuggestionInput = {
  resumeText: string;
  jobText?: string;
  candidateTerms?: string[];
  matchedTerms?: string[];
};

type SafeSuggestionResult = {
  allowedTerms: string[];
  blockedTerms: string[];
  reasons: Record<string, string>;
};

function normalizeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9+#/. -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholePhrase(text: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (!p) return false;
  const hay = ` ${normalizeText(text)} `;
  const regex = new RegExp(`(^|[^a-z0-9+#/])${escapeRegExp(p)}(?=$|[^a-z0-9+#/])`, "i");
  return regex.test(hay);
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value || "").trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function buildEvidenceSet(input: SafeSuggestionInput): Set<string> {
  const evidence = new Set<string>();

  for (const term of uniqueCaseInsensitive(input.matchedTerms || [])) {
    evidence.add(term.toLowerCase());
  }

  const resumeText = normalizeText(input.resumeText);
  for (const term of uniqueCaseInsensitive(input.candidateTerms || [])) {
    if (containsWholePhrase(resumeText, term)) {
      evidence.add(term.toLowerCase());
    }
  }

  return evidence;
}

export function filterUnsupportedTerms(input: SafeSuggestionInput): SafeSuggestionResult {
  const resumeText = normalizeText(input.resumeText);
  const jobText = normalizeText(input.jobText || "");
  const candidateTerms = uniqueCaseInsensitive(input.candidateTerms || []);
  const evidenceSet = buildEvidenceSet(input);

  const allowedTerms: string[] = [];
  const blockedTerms: string[] = [];
  const reasons: Record<string, string> = {};

  for (const term of candidateTerms) {
    const key = term.toLowerCase();

    const inResume = containsWholePhrase(resumeText, term) || evidenceSet.has(key);
    const inJob = jobText ? containsWholePhrase(jobText, term) : false;

    if (inResume) {
      allowedTerms.push(term);
      reasons[term] = "Supported by resume evidence.";
      continue;
    }

    if (inJob && !inResume) {
      blockedTerms.push(term);
      reasons[term] = "Present in job post, but not supported by resume evidence.";
      continue;
    }

    blockedTerms.push(term);
    reasons[term] = "Not supported by resume evidence.";
  }

  return {
    allowedTerms,
    blockedTerms,
    reasons,
  };
}

export function getTruthSafeSuggestions(input: SafeSuggestionInput): string[] {
  return filterUnsupportedTerms(input).allowedTerms;
}
