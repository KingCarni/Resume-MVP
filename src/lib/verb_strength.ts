// src/lib/verb_strength.ts

export type VerbStrengthLabel = "Weak" | "OK" | "Strong";

export type VerbStrength = {
  score: number;                 // 0..100
  label: VerbStrengthLabel;      // Weak/OK/Strong
  detectedVerb?: string;         // first meaningful verb we detect early
  suggestion?: string;           // short “why / what to fix”
  baseScore: number;             // same as score for now (kept for compatibility)
  rewriteBonusApplied: number;   // always 0 now (kept for compatibility)
  reasons?: string[];            // optional; useful if you want UI tooltips later
};

const WEAK_OPENERS = [
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

const STRONG_VERBS = new Set([
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
  "eliminated",
  "de-risked",
  "hardened",
]);

const SOLID_VERBS = new Set([
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
  "analyzed",
  "measured",
  "instrumented",
]);

const FILLER = new Set([
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
  "by",
  "as",
  "at",
]);

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function normalizeBullet(bullet: string) {
  const raw = String(bullet ?? "").trim();
  const lower = raw.toLowerCase();

  const cleaned = lower
    .replace(/^[•\-\u2022\u00B7o\s]+/g, "")
    .replace(/[“”]/g, '"')
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const opener = words.slice(0, 10).join(" ");

  return { raw, cleaned, words, opener };
}

function detectVerb(words: string[]): string | undefined {
  // ✅ Only accept known verbs or common -ed verbs that are *actually* verbs you’d expect.
  // This prevents random “-ed” words from becoming “strong verb”.
  const allowedEdVerbs = new Set([
    "improved",
    "increased",
    "reduced",
    "created",
    "implemented",
    "automated",
    "optimized",
    "integrated",
    "standardized",
    "streamlined",
    "delivered",
    "shipped",
    "launched",
    "measured",
    "instrumented",
    "analyzed",
  ]);

  for (const w of words.slice(0, 10)) {
    const word = w.replace(/[^\w-]/g, "");
    if (!word || FILLER.has(word)) continue;

    if (STRONG_VERBS.has(word) || SOLID_VERBS.has(word)) return word;

    // only allow a curated -ed verb list (no random “completed”, “aligned”, etc unless you add them)
    if (allowedEdVerbs.has(word)) return word;
  }

  return undefined;
}

export function computeVerbStrength(
  bullet: string,
  _opts?: { mode?: "before" | "after" } // kept for compatibility; no longer affects scoring
): VerbStrength {
  const { raw, words, opener } = normalizeBullet(bullet);

  const reasons: string[] = [];
  let score = 40; // ✅ lower baseline so “meh” bullets don’t start as OK

  // Weak opener penalties
  const matchedWeak = WEAK_OPENERS.find((p) => opener.startsWith(p));
  if (matchedWeak) {
    score -= 18;
    reasons.push(`Weak opener (“${matchedWeak}”)`);
  }

  const passiveSignals =
    /\b(was responsible for|was involved in|was tasked with|was assigned to|was part of)\b/i.test(opener);
  if (passiveSignals) {
    score -= 12;
    reasons.push("Passive/indirect ownership");
  }

  const vagueSignals =
    /\b(various|several|some|things|stuff|etc|multiple tasks|as needed)\b/i.test(raw);
  if (vagueSignals) {
    score -= 10;
    reasons.push("Vague wording");
  }

  // Verb
  const detectedVerb = detectVerb(words);
  if (!detectedVerb) {
    score -= 10;
    reasons.push("No clear action verb early");
  } else if (STRONG_VERBS.has(detectedVerb)) {
    score += 28;
    reasons.push(`Strong verb (“${detectedVerb}”)`);
  } else if (SOLID_VERBS.has(detectedVerb)) {
    score += 18;
    reasons.push(`Solid verb (“${detectedVerb}”)`);
  } else {
    score += 10;
    reasons.push(`Action verb (“${detectedVerb}”)`);
  }

  // Scope / systems (QA/dev)
  const scopeSignals =
    /\b(api|pipeline|ci\/cd|release|deployment|automation|framework|test plan|test strategy|coverage|regression|observability|monitoring|dashboards|kpi|experiment|a\/b|tracking|instrumentation|backend|frontend|mobile|vr|ue4|ue5|unreal|testrail|jira|confluence|postman)\b/i.test(
      raw
    );
  if (scopeSignals) {
    score += 12;
    reasons.push("Clear scope/system");
  }

  // Outcome language
  const outcomeSignals =
    /\b(increased|reduced|improved|cut|saved|prevented|boosted|grew|decreased|accelerated|shortened|eliminated|de-risked)\b/i.test(
      raw
    );
  if (outcomeSignals) {
    score += 14;
    reasons.push("Outcome language");
  }

  // Metrics
  const metricSignals =
    /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b|\b\d{2,}\b)/i.test(
      raw
    );
  if (metricSignals) {
    score += 14;
    reasons.push("Quantified impact");
  }

  score = clamp(score);

  const label: VerbStrengthLabel = score < 45 ? "Weak" : score < 75 ? "OK" : "Strong";

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
    baseScore: score,
    rewriteBonusApplied: 0,
    reasons,
  };
}
