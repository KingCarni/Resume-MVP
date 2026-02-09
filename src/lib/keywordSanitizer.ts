// src/lib/keywordSanitizer.ts

export type KeywordSanitizerParams = {
  rawKeywords: string[];
  targetCompany?: string;
  targetProducts?: string[];
  extraBlocked?: string[];
};

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function sanitizeKeywords(params: KeywordSanitizerParams): {
  usableKeywords: string[];
  blockedKeywords: string[];
} {
  const raw = Array.isArray(params.rawKeywords) ? params.rawKeywords : [];

  const blockedTerms = [
    params.targetCompany || "",
    ...(params.targetProducts || []),
    ...(params.extraBlocked || []),
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const usableKeywords: string[] = [];
  const blockedKeywords: string[] = [];

  const seenUsable = new Set<string>();
  const seenBlocked = new Set<string>();

  for (const k of raw) {
    const kw = String(k || "").trim();
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
