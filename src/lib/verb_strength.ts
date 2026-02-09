// src/lib/verb_strength.ts

export type VerbStrengthLabel = "Weak" | "OK" | "Strong";

export type VerbStrength = {
  score: number;
  label: VerbStrengthLabel;
  detectedVerb?: string;
  suggestion?: string;
  baseScore: number;
  rewriteBonusApplied: number;
};

/**
 * ✅ Option 1 scoring (same logic you're using elsewhere)
 * - mode=before: no rewrite bonus
 * - mode=after: small polish bonus (still returns baseScore for fair comparisons)
 */
export function computeVerbStrength(
  bullet: string,
  opts?: { mode?: "before" | "after" }
): VerbStrength {
  const mode = opts?.mode ?? "before";
  const rewriteBonus = mode === "after" ? 6 : 0;

  const raw = String(bullet ?? "").trim();
  const lower = raw.toLowerCase();

  const cleaned = lower
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
    .replace(/[“”"]/g, '"')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const opener = words.slice(0, 10).join(" ");

  const weakPhrases = [
    "worked with",
    "worked on",
    "helped",
    "assisted",
    "supported",
    "participated in",
    "involved in",
    "exposed to",
    "responsible for",
    "collaborated with",
    "was responsible for",
    "was involved in",
    "was tasked with",
    "was part of",
  ];

  const strongLeadVerbs = new Set([
    "led",
    "owned",
    "drove",
    "delivered",
    "shipped",
    "launched",
    "spearheaded",
    "directed",
    "managed",
    "mentored",
    "architected",
    "designed",
    "implemented",
    "automated",
    "optimized",
    "improved",
    "increased",
    "reduced",
    "cut",
    "saved",
    "prevented",
    "unblocked",
  ]);

  const solidVerbs = new Set([
    "tested",
    "validated",
    "executed",
    "created",
    "built",
    "documented",
    "triaged",
    "investigated",
    "debugged",
    "monitored",
    "coordinated",
    "refactored",
    "integrated",
    "migrated",
    "standardized",
    "streamlined",
  ]);

  const outcomeSignals =
    /\b(increased|reduced|improved|cut|saved|prevented|boosted|grew|decreased|accelerated|shortened)\b/i.test(
      raw
    );

  const metricSignals =
    /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b|\b\d{2,}\b)/i.test(
      raw
    );

  const scopeSignals =
    /\b(api|pipeline|ci\/cd|release|deployment|automation|framework|test plan|test strategy|coverage|regression|observability|monitoring|dashboards|kpi|experiment|a\/b|tracking|instrumentation|backend|frontend|mobile|vr|ue4|ue5|unreal)\b/i.test(
      raw
    );

  const vagueSignals =
    /\b(various|several|some|things|stuff|etc|multiple tasks|as needed)\b/i.test(
      raw
    );

  const passiveSignals =
    /\b(was responsible for|was involved in|was tasked with|was assigned to|was part of)\b/i.test(
      opener
    );

  const filler = new Set([
    "successfully",
    "effectively",
    "proactively",
    "actively",
    "efficiently",
    "responsible",
    "for",
    "the",
    "a",
    "an",
    "to",
    "and",
    "with",
    "in",
    "on",
    "of",
  ]);

  let detectedVerb: string | undefined;
  for (const w of words.slice(0, 8)) {
    const word = w.replace(/[^\w-]/g, "");
    if (!word || filler.has(word)) continue;

    if (strongLeadVerbs.has(word) || solidVerbs.has(word)) {
      detectedVerb = word;
      break;
    }
    if (word.length >= 5 && word.endsWith("ed")) {
      detectedVerb = word;
      break;
    }
  }

  let baseScore = 62;
  const reasons: string[] = [];

  const matchedWeak = weakPhrases.find((p) => opener.startsWith(p));
  if (matchedWeak) {
    baseScore -= 10;
    reasons.push(`Weak opener (“${matchedWeak}”)`);
  }
  if (passiveSignals) {
    baseScore -= 8;
    reasons.push("Passive voice opener");
  }
  if (vagueSignals) {
    baseScore -= 6;
    reasons.push("Vague wording");
  }

  if (detectedVerb) {
    if (strongLeadVerbs.has(detectedVerb)) {
      baseScore += 22;
      reasons.push(`Strong verb (“${detectedVerb}”)`);
    } else if (solidVerbs.has(detectedVerb)) {
      baseScore += 10;
      reasons.push(`Solid verb (“${detectedVerb}”)`);
    } else {
      baseScore += 6;
      reasons.push(`Action verb (“${detectedVerb}”)`);
    }
  } else {
    baseScore -= 4;
    reasons.push("No clear action verb early");
  }

  if (scopeSignals) {
    baseScore += 10;
    reasons.push("Clear scope/system");
  }
  if (outcomeSignals) {
    baseScore += 12;
    reasons.push("Outcome language");
  }
  if (metricSignals) {
    baseScore += 12;
    reasons.push("Quantified impact");
  }

  baseScore = Math.max(0, Math.min(100, baseScore));

  let score = baseScore + rewriteBonus;
  score = Math.max(0, Math.min(100, score));

  const label: VerbStrengthLabel =
    score < 50 ? "Weak" : score < 80 ? "OK" : "Strong";

  let suggestion: string | undefined;
  if (label !== "Strong") {
    suggestion = reasons.length
      ? `Why: ${reasons.slice(0, 3).join(", ")}`
      : "Try a stronger opener and add outcome/metrics if truthful.";
  }

  return {
    score,
    label,
    detectedVerb,
    suggestion,
    baseScore,
    rewriteBonusApplied: rewriteBonus,
  };
}
