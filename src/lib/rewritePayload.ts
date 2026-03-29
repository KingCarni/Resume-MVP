const MAX_JOBTEXT = 6000;
const MAX_ORIGINAL_BULLET = 800;
const MAX_KEYWORDS = 40;
const MAX_PRODUCTS = 25;
const MAX_CONTEXT_TERMS = 40;

const compact = (s: any, n: number) =>
  String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function buildRewriteBulletPayload(raw: any) {
  const sanitizedKeywords = (raw.suggestedKeywords ?? [])
    .map(String)
    .map((s: string) => compact(s, 80))
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);

  const payload = {
    originalBullet: compact(raw.originalBullet, MAX_ORIGINAL_BULLET),
    jobText: compact(raw.jobText, MAX_JOBTEXT),

    suggestedKeywords: sanitizedKeywords,
    priorityMissingKeywords: (raw.priorityMissingKeywords ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, 8),
    bulletTargetKeywords: (raw.bulletTargetKeywords ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, 8),
    matchedKeywords: (raw.matchedKeywords ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, 8),
    ignoredMissingKeywords: (raw.ignoredMissingKeywords ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, 20),
    keywordLimit: MAX_KEYWORDS,
    keywordCount: sanitizedKeywords.length,

    role: raw.role ? compact(raw.role, 120) : undefined,
    targetPosition: raw.targetPosition ? compact(raw.targetPosition, 120) : undefined,
    tone: raw.tone ? compact(raw.tone, 120) : undefined,

    sourceCompany: raw.sourceCompany
      ? compact(raw.sourceCompany, 120)
      : undefined,

    targetCompany: raw.targetCompany
      ? compact(raw.targetCompany, 120)
      : undefined,

    targetProducts: (raw.targetProducts ?? [])
      .map(String)
      .map((s: string) => compact(s, 120))
      .filter(Boolean)
      .slice(0, MAX_PRODUCTS),

    blockedTerms: (raw.blockedTerms ?? [])
      .map(String)
      .map((s: string) => compact(s, 120))
      .filter(Boolean)
      .slice(0, 50),

    constraints: (raw.constraints ?? [])
      .map(String)
      .map((s: string) => compact(s, 220))
      .filter(Boolean)
      .slice(0, 25),

    mustPreserveMeaning: !!raw.mustPreserveMeaning,
    avoidPhrases: (raw.avoidPhrases ?? []).map(String).slice(0, 50),
    preferVerbVariety: !!raw.preferVerbVariety,

    usedOpeners: (raw.usedOpeners ?? []).map(String).slice(0, 80),
    usedPhrases: (raw.usedPhrases ?? []).map(String).slice(0, 80),
    usedTailPhrases: (raw.usedTailPhrases ?? []).map(String).slice(0, 80),

    // Truth Guardrail V1 context
    resumeSkills: (raw.resumeSkills ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, MAX_CONTEXT_TERMS),
    sectionSkills: (raw.sectionSkills ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, MAX_CONTEXT_TERMS),
    allowedTerms: (raw.allowedTerms ?? [])
      .map(String)
      .map((s: string) => compact(s, 80))
      .filter(Boolean)
      .slice(0, MAX_CONTEXT_TERMS),
  };

  // Optional debugging
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > 150_000) {
    console.warn("[rewrite-bullet] Large payload bytes:", bytes);
  }

  return payload;
}
