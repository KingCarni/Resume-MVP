// src/lib/keywordSanitizer.ts

export type KeywordSanitizerParams = {
  rawKeywords: unknown; // ✅ allow any shape; we normalize safely
  targetCompany?: string;
  targetProducts?: string[];
  extraBlocked?: string[];
};

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * ✅ NEW helper: accept "unknown" and return a clean keyword array.
 * This prevents crashes when the client sends weird shapes.
 */
export function coerceKeywordArray(input: unknown): string[] {
  const arr: string[] = Array.isArray(input)
    ? input.map((x) => String(x))
    : typeof input === "string"
    ? input.split(",")
    : [];

  // clean up bullets / punctuation / whitespace
  const cleaned = arr
    .map((s) =>
      String(s ?? "")
        .trim()
        .replace(/^[•\-\u2022\u00B7o\s]+/g, "") // bullet prefixes
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, " ")
        .replace(/^[,.;:]+|[,.;:]+$/g, "") // edge punctuation
        .trim()
    )
    .filter(Boolean);

  // de-dupe case-insensitive, keep first casing
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
 * ✅ Split usable vs blocked keywords
 */
export function sanitizeKeywords(params: KeywordSanitizerParams): {
  usableKeywords: string[];
  blockedKeywords: string[];
} {
  const raw = coerceKeywordArray(params.rawKeywords);

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
