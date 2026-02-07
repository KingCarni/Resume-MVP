// src/lib/rewrite_plan.ts

type BulletSuggestion = {
  originalBullet: string;
  suggestedKeywords: string[];
  reason?: string;
};

export function buildRewritePlan(
  bulletSuggestions: BulletSuggestion[] | any
) {
  const list: BulletSuggestion[] = Array.isArray(bulletSuggestions)
    ? bulletSuggestions
        .map((x: any) => ({
          originalBullet: String(
            x?.originalBullet ?? x?.bullet ?? x?.original ?? ""
          ).trim(),
          suggestedKeywords: Array.isArray(x?.suggestedKeywords ?? x?.keywords)
            ? (x.suggestedKeywords ?? x.keywords)
                .map((k: any) => String(k).trim())
                .filter(Boolean)
            : [],
          reason: x?.reason ? String(x.reason) : undefined,
        }))
        .filter((x: BulletSuggestion) => x.originalBullet.length > 0)
    : [];

  // Rewrite plan is intentionally simple: one entry per bullet we want to improve
  return list.map((x) => ({
    originalBullet: x.originalBullet,
    suggestedKeywords: x.suggestedKeywords,
    reason: x.reason,
    rewrittenBullet: "", // filled in later by /api/rewrite-bullet
  }));
}
