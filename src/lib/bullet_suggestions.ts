// src/lib/bullet_suggestions.ts
import type { ResumeBullet } from "./bullets";

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string) {
  const t = normalize(s);
  if (!t) return new Set<string>();
  return new Set(t.split(" ").filter((x) => x.length >= 3));
}

function overlapScore(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}

export type BulletSuggestion = {
  bulletId: string;
  bulletText: string;
  suggestedKeywords: string[];
  bulletJobOverlap: number;
};

export function suggestKeywordsForBullets(
  bullets: ResumeBullet[],
  jobText: string,
  missingKeywords: string[]
): {
  bulletSuggestions: BulletSuggestion[];
  weakBullets: { bulletId: string; bulletText: string; overlap: number }[];
} {
  const jobTokens = tokenSet(jobText);

  const bulletSuggestions: BulletSuggestion[] = bullets.map((b) => {
    const bTokens = tokenSet(b.text);
    const bulletJobOverlap = overlapScore(bTokens, jobTokens);

    const suggestedKeywords = missingKeywords
      .map((kw) => {
        const kwTokens = tokenSet(kw);
        const score = overlapScore(kwTokens, bTokens);
        return { kw, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.kw);

    return {
      bulletId: b.id,
      bulletText: b.text,
      suggestedKeywords,
      bulletJobOverlap,
    };
  });

  const weakBullets = bulletSuggestions
    .filter((b) => b.bulletJobOverlap < 0.12)
    .sort((a, b) => a.bulletJobOverlap - b.bulletJobOverlap)
    .slice(0, 8)
    .map((b) => ({
      bulletId: b.bulletId,
      bulletText: b.bulletText,
      overlap: b.bulletJobOverlap,
    }));

  return { bulletSuggestions, weakBullets };
}
