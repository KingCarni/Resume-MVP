const MAX_JOBTEXT = 6000;
const MAX_ORIGINAL_BULLET = 800;
const MAX_KEYWORDS = 40;
const MAX_PRODUCTS = 25;

const compact = (s: any, n: number) =>
  String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function buildRewriteBulletPayload(raw: any) {
  const payload = {
    originalBullet: compact(raw.originalBullet, MAX_ORIGINAL_BULLET),
    jobText: compact(raw.jobText, MAX_JOBTEXT),

    suggestedKeywords: (raw.suggestedKeywords ?? [])
      .map(String)
      .slice(0, MAX_KEYWORDS),

    role: raw.role ? compact(raw.role, 120) : undefined,
    tone: raw.tone ? compact(raw.tone, 120) : undefined,

    sourceCompany: raw.sourceCompany
      ? compact(raw.sourceCompany, 120)
      : undefined,

    targetCompany: raw.targetCompany
      ? compact(raw.targetCompany, 120)
      : undefined,

    targetProducts: (raw.targetProducts ?? [])
      .map(String)
      .slice(0, MAX_PRODUCTS),

    blockedTerms: (raw.blockedTerms ?? [])
      .map(String)
      .slice(0, 50),

    constraints: (raw.constraints ?? [])
      .map(String)
      .slice(0, 25),

    mustPreserveMeaning: !!raw.mustPreserveMeaning,
    avoidPhrases: (raw.avoidPhrases ?? []).map(String).slice(0, 50),
    preferVerbVariety: !!raw.preferVerbVariety,

    usedOpeners: (raw.usedOpeners ?? []).map(String).slice(0, 80),
    usedPhrases: (raw.usedPhrases ?? []).map(String).slice(0, 80),
  };

  // Optional debugging
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > 150_000) {
    console.warn("[rewrite-bullet] Large payload bytes:", bytes);
  }

  return payload;
}
