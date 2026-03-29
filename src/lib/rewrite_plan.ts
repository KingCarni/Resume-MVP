// src/lib/rewrite_plan.ts

type BulletSuggestion = {
  originalBullet: string;
  suggestedKeywords: string[];
  reason?: string;
  targetPosition?: string;
  roleFocus?: string[];
  priorityKeywords?: string[];
  ignoredKeywords?: string[];
};

export function buildRewritePlan(
  bulletSuggestions: BulletSuggestion[] | any,
  options?: {
    targetPosition?: string;
    roleFocus?: string[];
    priorityKeywords?: string[];
    ignoredKeywords?: string[];
  }
) {
  const sharedTargetPosition = String(options?.targetPosition ?? "").trim();
  const sharedRoleFocus = Array.isArray(options?.roleFocus)
    ? options!.roleFocus.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const sharedPriorityKeywords = Array.isArray(options?.priorityKeywords)
    ? options!.priorityKeywords.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  const sharedIgnoredKeywords = Array.isArray(options?.ignoredKeywords)
    ? options!.ignoredKeywords.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

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
          targetPosition: String(x?.targetPosition ?? sharedTargetPosition).trim() || undefined,
          roleFocus: Array.isArray(x?.roleFocus)
            ? x.roleFocus.map((r: any) => String(r).trim()).filter(Boolean)
            : sharedRoleFocus,
          priorityKeywords: Array.isArray(x?.priorityKeywords)
            ? x.priorityKeywords.map((k: any) => String(k).trim()).filter(Boolean)
            : sharedPriorityKeywords,
          ignoredKeywords: Array.isArray(x?.ignoredKeywords)
            ? x.ignoredKeywords.map((k: any) => String(k).trim()).filter(Boolean)
            : sharedIgnoredKeywords,
        }))
        .filter((x: BulletSuggestion) => x.originalBullet.length > 0)
    : [];

  return list.map((x) => ({
    originalBullet: x.originalBullet,
    suggestedKeywords: Array.from(
      new Set([
        ...x.suggestedKeywords,
        ...(x.priorityKeywords ?? []).filter(
          (k) => !(x.ignoredKeywords ?? []).includes(k)
        ),
      ])
    ),
    reason: x.reason,
    targetPosition: x.targetPosition,
    roleFocus: x.roleFocus ?? [],
    priorityKeywords: x.priorityKeywords ?? [],
    ignoredKeywords: x.ignoredKeywords ?? [],
    rewrittenBullet: "", // filled in later by /api/rewrite-bullet
  }));
}
