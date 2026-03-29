// src/lib/ats/scoreRoleFit.ts

import {
  ROLE_BANKS,
  detectGameRole,
  getMissingTermsForTargetRole,
  type AtsCategoryKey,
} from "./detectRole";

type ScoreCategoryBreakdown = Record<AtsCategoryKey, number>;

export type RoleFitScore = {
  roleKey: string;
  roleName: string;
  overallScore: number;
  categoryScores: ScoreCategoryBreakdown;
  matchedTerms: string[];
  missingCriticalTerms: string[];
  missingImportantTerms: string[];
  missingNiceToHaveTerms: string[];
  notes: string[];
};

export type ResumeJobScore = {
  targetRoleKey: string | null;
  targetRoleName: string | null;
  overallScore: number;
  categoryScores: ScoreCategoryBreakdown;
  matchedTerms: string[];
  missingCriticalTerms: string[];
  missingImportantTerms: string[];
  missingNiceToHaveTerms: string[];
  notes: string[];
  detectedResumeRole: {
    roleKey: string | null;
    roleName: string | null;
    confidence: "low" | "medium" | "high";
  };
  detectedJobRole: {
    roleKey: string | null;
    roleName: string | null;
    confidence: "low" | "medium" | "high";
  };
};

const EMPTY_CATEGORY_SCORES: ScoreCategoryBreakdown = {
  titles: 0,
  core: 0,
  tools: 0,
  methods: 0,
  domain: 0,
  outcomes: 0,
};

function safeArray(input: unknown): string[] {
  return Array.isArray(input) ? input.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function buildCategoryScores(args: {
  matchedByCategory?: Partial<Record<AtsCategoryKey, string[]>>;
  missingByCategory?: Partial<Record<AtsCategoryKey, string[]>>;
}): ScoreCategoryBreakdown {
  const out: ScoreCategoryBreakdown = { ...EMPTY_CATEGORY_SCORES };

  (Object.keys(EMPTY_CATEGORY_SCORES) as AtsCategoryKey[]).forEach((category) => {
    const matched = safeArray(args.matchedByCategory?.[category]);
    const missing = safeArray(args.missingByCategory?.[category]);
    out[category] = pct(matched.length, matched.length + missing.length);
  });

  return out;
}

function buildOverallScore(categoryScores: ScoreCategoryBreakdown): number {
  const weights: Record<AtsCategoryKey, number> = {
    titles: 5,
    core: 4,
    tools: 3,
    methods: 2,
    domain: 2,
    outcomes: 2,
  };

  const weightedTotal =
    categoryScores.titles * weights.titles +
    categoryScores.core * weights.core +
    categoryScores.tools * weights.tools +
    categoryScores.methods * weights.methods +
    categoryScores.domain * weights.domain +
    categoryScores.outcomes * weights.outcomes;

  const divisor =
    weights.titles + weights.core + weights.tools + weights.methods + weights.domain + weights.outcomes;

  return pct(weightedTotal, divisor * 100);
}

function getMatchedTermsForRole(resumeText: string, roleKey: string): string[] {
  const detection = detectGameRole(resumeText);
  return (detection.hits || [])
    .filter((hit) => hit.roleKey === roleKey)
    .map((hit) => hit.term)
    .filter((term, index, arr) => arr.findIndex((x) => x.toLowerCase() === term.toLowerCase()) === index);
}

export function scoreResumeAgainstRole(resumeText: string, roleKey: string): RoleFitScore {
  const role = ROLE_BANKS[roleKey];
  if (!role) {
    throw new Error(`Unknown role key: ${roleKey}`);
  }

  const missing = getMissingTermsForTargetRole(resumeText, roleKey);
  const categoryScores = buildCategoryScores({
    matchedByCategory: missing.matchedByCategory,
    missingByCategory: missing.missingByCategory,
  });

  return {
    roleKey,
    roleName: role.displayName,
    overallScore: buildOverallScore(categoryScores),
    categoryScores,
    matchedTerms: getMatchedTermsForRole(resumeText, roleKey),
    missingCriticalTerms: safeArray(missing.tier1Critical),
    missingImportantTerms: safeArray(missing.tier2Important),
    missingNiceToHaveTerms: safeArray(missing.tier3NiceToHave),
    notes: safeArray(missing.notes),
  };
}

export function scoreResumeAgainstJob(
  resumeText: string,
  jobText: string,
  roleKey?: string
): ResumeJobScore {
  const resumeDetection = detectGameRole(resumeText);
  const jobDetection = detectGameRole(jobText);

  const targetRoleKey = roleKey || jobDetection.primaryRoleKey || resumeDetection.primaryRoleKey || null;
  const targetRoleName = targetRoleKey && ROLE_BANKS[targetRoleKey] ? ROLE_BANKS[targetRoleKey].displayName : null;

  if (!targetRoleKey || !targetRoleName) {
    return {
      targetRoleKey: null,
      targetRoleName: null,
      overallScore: 0,
      categoryScores: { ...EMPTY_CATEGORY_SCORES },
      matchedTerms: [],
      missingCriticalTerms: [],
      missingImportantTerms: [],
      missingNiceToHaveTerms: [],
      notes: ["Could not determine a target role from the resume or job text."],
      detectedResumeRole: {
        roleKey: resumeDetection.primaryRoleKey,
        roleName: resumeDetection.primaryRoleName,
        confidence: resumeDetection.confidence,
      },
      detectedJobRole: {
        roleKey: jobDetection.primaryRoleKey,
        roleName: jobDetection.primaryRoleName,
        confidence: jobDetection.confidence,
      },
    };
  }

  const scored = scoreResumeAgainstRole(resumeText, targetRoleKey);

  return {
    targetRoleKey,
    targetRoleName,
    overallScore: scored.overallScore,
    categoryScores: scored.categoryScores,
    matchedTerms: scored.matchedTerms,
    missingCriticalTerms: scored.missingCriticalTerms,
    missingImportantTerms: scored.missingImportantTerms,
    missingNiceToHaveTerms: scored.missingNiceToHaveTerms,
    notes: scored.notes,
    detectedResumeRole: {
      roleKey: resumeDetection.primaryRoleKey,
      roleName: resumeDetection.primaryRoleName,
      confidence: resumeDetection.confidence,
    },
    detectedJobRole: {
      roleKey: jobDetection.primaryRoleKey,
      roleName: jobDetection.primaryRoleName,
      confidence: jobDetection.confidence,
    },
  };
}
