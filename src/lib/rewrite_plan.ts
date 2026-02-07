// src/lib/rewrite_plan.ts
import type { BulletSuggestion } from "./bullet_suggestions";

export type RewritePlanItem = {
  bulletId: string;
  original: string;
  targetKeywords: string[];
  suggestionText: string;
};

export function buildRewritePlan(
  bulletSuggestions: BulletSuggestion[],
  maxItems = 8
): RewritePlanItem[] {
  const scored = bulletSuggestions
    .map((b) => ({
      ...b,
      score: (b.suggestedKeywords?.length ?? 0) * 2 + (b.bulletJobOverlap ?? 0),
    }))
    .filter((b) => (b.suggestedKeywords?.length ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxItems);

  return scored.map((b) => {
    const targets = (b.suggestedKeywords ?? []).slice(0, 3);

    const suggestionText =
      `Add: ${targets.join(", ")}. ` +
      `Rewrite in "Action + Tool/Scope + Result" format (metrics if possible). ` +
      `Example: "Validated <scope> using <tool> to ensure <quality outcome>, reducing <risk>."`;

    return {
      bulletId: b.bulletId,
      original: b.bulletText,
      targetKeywords: targets,
      suggestionText,
    };
  });
}
