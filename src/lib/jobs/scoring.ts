import type { MatchResult, ResumeProfileInput } from "@/lib/jobs/types";
import {
  canonicalizeSkill,
  collectCanonicalSkills,
  extractCanonicalSkillsFromText,
  extractConceptSignalsFromText,
  getSignalSpecificity,
  normalizeRegistryText,
  pruneGenericSignals,
  sortCanonicalSkills,
  sortConceptSignals,
} from "@/lib/jobs/skillRegistry";

type JobForScoring = {
  id: string;
  title: string;
  titleNormalized?: string | null;
  company: string;
  companyNormalized?: string | null;
  location?: string | null;
  locationNormalized?: string | null;
  remoteType?: string | null;
  seniority?: string | null;
  description?: string | null;
  requirementsText?: string | null;
  responsibilitiesText?: string | null;
  skills?: unknown;
  keywords?: unknown;
};

const TITLE_WEIGHT = 25;
const SKILL_WEIGHT = 35;
const SENIORITY_WEIGHT = 15;
const KEYWORD_WEIGHT = 15;
const LOCATION_WEIGHT = 10;
const SIGNAL_LIMIT = 8;
const GAP_LIMIT = 8;
const LOW_FIT_SIGNAL_THRESHOLD = 35;

const HIGH_TRANSFERABLE_SIGNALS = new Set([
  "project delivery",
  "people management",
  "stakeholder management",
  "teamwork",
  "workflow optimization",
  "saas",
  "crm",
  "martech",
  "marketing automation",
  "client services",
  "managed services",
  "resource allocation",
  "capacity planning",
  "delivery operations",
  "retainer model",
  "stakeholder reporting",
  "dependency management",
  "operational cadence",
  "cross-channel",
  "lifecycle marketing",
  "retention marketing",
]);

const LOW_VALUE_LOW_FIT_SIGNALS = new Set([
  "testing",
  "performance optimization",
  "profiling and optimization",
  "automation",
  "reporting",
  "monitoring",
  "debugging",
  "documentation",
  "quality assurance",
  "auditing",
  "compliance",
]);

const GENERIC_TITLE_PHRASES = new Set([
  "engineer",
  "developer",
  "manager",
  "designer",
  "analyst",
  "specialist",
  "architect",
  "programmer",
  "tester",
  "artist",
  "producer",
]);

const ROLE_FAMILIES: Record<string, string[]> = {
  qa: [
    "qa tester",
    "qa engineer",
    "quality assurance",
    "quality engineer",
    "quality analyst",
    "platform quality analyst",
    "test engineer",
    "test analyst",
    "automation tester",
    "sdet",
    "software tester",
    "qa lead",
    "qa manager",
    "test manager",
  ],
  engineering: [
    "software engineer",
    "software developer",
    "game developer",
    "game engineer",
    "gameplay programmer",
    "gameplay engineer",
    "engine programmer",
    "tools engineer",
    "tools programmer",
    "frontend engineer",
    "backend engineer",
    "full stack engineer",
    "devops engineer",
    "platform engineer",
    "site reliability engineer",
    "engineering manager",
    "development manager",
    "developer",
    "engineer",
    "programmer",
  ],
  design: [
    "game designer",
    "gameplay designer",
    "systems designer",
    "level designer",
    "technical designer",
    "ux designer",
    "ui designer",
    "product designer",
  ],
  art: ["artist", "technical artist", "animator", "vfx artist", "3d artist", "art director", "lead artist"],
  product: ["product manager", "program manager", "project manager", "producer", "senior producer", "lead producer", "game producer"],
  support: ["support engineer", "support analyst", "customer support specialist"],
  data: ["data analyst", "business analyst", "data scientist", "analytics engineer"],
  marketing: ["marketing manager", "marketing specialist", "marketing automation specialist", "lifecycle marketing", "crm specialist"],
};

const ROLE_BRIDGES: Record<string, string[]> = {
  qa: ["engineering", "support"],
  engineering: ["qa", "design", "support"],
  design: ["engineering", "art"],
  art: ["design"],
  product: ["engineering", "support", "data"],
  support: ["engineering", "qa", "product"],
  data: ["product", "engineering"],
};

type SeniorityKey = "entry" | "mid" | "senior" | "lead" | "manager";
type TitleTrack = "ic" | "lead" | "manager";

const SENIORITY_RANK: Record<SeniorityKey, number> = {
  entry: 0,
  mid: 1,
  senior: 2,
  lead: 3,
  manager: 4,
};

const TITLE_SPECIALTY_STOPWORDS = new Set([
  "senior",
  "junior",
  "lead",
  "principal",
  "staff",
  "manager",
  "director",
  "head",
  "vp",
  "chief",
  "qa",
  "quality",
  "software",
  "engineering",
  "engineer",
  "developer",
  "development",
  "game",
  "tester",
  "test",
  "artist",
  "art",
  "producer",
  "product",
  "project",
  "program",
  "design",
  "designer",
  "specialist",
  "analyst",
  "managerial",
]);

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeTitleText(value: string): string {
  return normalizeRegistryText(value)
    .replace(/\bfullstack\b/g, "full stack")
    .replace(/\bfront end\b/g, "frontend")
    .replace(/\bback end\b/g, "backend")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeTitleText(value)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function buildProfileKeywordPool(profile: ResumeProfileInput): Set<string> {
  const pool = new Set<string>();
  const seeds = [
    ...profile.normalizedSkills,
    ...(profile.keywords ?? []),
    profile.summary ?? "",
  ];

  for (const seed of seeds) {
    const normalized = normalizeRegistryText(seed);
    if (!normalized) continue;
    pool.add(normalized);
    const canonical = canonicalizeSkill(normalized);
    if (canonical) pool.add(canonical);

    for (const token of tokenize(normalized)) {
      pool.add(token);
    }
  }

  return pool;
}

function extractRoleFamilies(texts: string[]): Set<string> {
  const families = new Set<string>();
  for (const raw of texts) {
    const text = normalizeTitleText(raw);
    if (!text) continue;
    for (const [family, aliases] of Object.entries(ROLE_FAMILIES)) {
      if (aliases.some((alias) => text.includes(normalizeTitleText(alias)))) {
        families.add(family);
      }
    }
  }
  return families;
}

function buildBridgeFamilies(families: Set<string>): Set<string> {
  const bridges = new Set<string>();
  for (const family of families) {
    for (const bridged of ROLE_BRIDGES[family] ?? []) {
      bridges.add(bridged);
    }
  }
  return bridges;
}

function phraseSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function buildJobText(job: JobForScoring): { title: string; requirements: string; responsibilities: string; description: string; full: string } {
  const title = [job.titleNormalized ?? "", job.title].join("\n").trim();
  const requirements = [job.requirementsText ?? "", job.skills ? ensureStringArray(job.skills).join("\n") : ""].join("\n").trim();
  const responsibilities = (job.responsibilitiesText ?? "").trim();
  const description = (job.description ?? "").trim();
  const full = [title, requirements, responsibilities, description].join("\n").trim();
  return { title, requirements, responsibilities, description, full };
}

function buildConceptPool(profile: ResumeProfileInput): Set<string> {
  const raw = [
    profile.summary ?? "",
    ...(profile.keywords ?? []),
    ...profile.normalizedSkills,
    ...profile.normalizedTitles,
  ].join("\n");

  return new Set<string>(extractConceptSignalsFromText(raw));
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeRegistryText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function deriveJobSignals(job: JobForScoring): {
  coreSkills: string[];
  supportSkills: string[];
  conceptSignals: string[];
} {
  const text = buildJobText(job);
  const storedSkills = collectCanonicalSkills(ensureStringArray(job.skills));
  const titleSkills = extractCanonicalSkillsFromText(text.title);
  const requirementSkills = extractCanonicalSkillsFromText(`${text.requirements}\n${text.responsibilities}`);
  const descriptionSkills = extractCanonicalSkillsFromText(text.description);

  const coreSkillSet = new Set<string>([...storedSkills, ...titleSkills, ...requirementSkills]);
  const supportSkillSet = new Set<string>(descriptionSkills.filter((skill) => !coreSkillSet.has(skill)));

  const conceptSignals = dedupePreserveOrder([
    ...extractConceptSignalsFromText(text.title),
    ...extractConceptSignalsFromText(`${text.requirements}\n${text.responsibilities}`),
    ...extractConceptSignalsFromText(text.description),
  ]);

  return {
    coreSkills: sortCanonicalSkills(Array.from(coreSkillSet)),
    supportSkills: sortCanonicalSkills(Array.from(supportSkillSet)),
    conceptSignals: sortConceptSignals(conceptSignals),
  };
}

function hasPoolMatch(pool: Set<string>, value: string): boolean {
  const normalized = normalizeRegistryText(value);
  if (!normalized) return false;
  const canonical = canonicalizeSkill(normalized);
  if (pool.has(normalized) || pool.has(canonical)) return true;
  return Array.from(pool).some((candidate) => phraseSimilarity(candidate, normalized) >= 0.8);
}

function normalizeSeniorityKey(value?: string | null): SeniorityKey | null {
  const normalized = normalizeTitleText(value ?? "");
  if (!normalized || normalized === "unknown") return null;
  if (/\b(entry|junior|jr|intern|internship|graduate|new grad)\b/.test(normalized)) return "entry";
  if (/\b(mid|intermediate|ii)\b/.test(normalized)) return "mid";
  if (/\b(senior|sr|iii|staff)\b/.test(normalized)) return "senior";
  if (/\b(lead|principal)\b/.test(normalized)) return "lead";
  if (/\b(manager|head|director|vp|chief)\b/.test(normalized)) return "manager";
  return null;
}

function seniorityRank(value?: string | null): number | null {
  const key = normalizeSeniorityKey(value);
  return key ? SENIORITY_RANK[key] : null;
}

function detectTitleTrack(value: string): TitleTrack {
  const normalized = normalizeTitleText(value);
  if (/\b(manager|director|head|vp|chief)\b/.test(normalized)) return "manager";
  if (/\b(lead|principal)\b/.test(normalized)) return "lead";
  return "ic";
}

function extractPrimaryFamily(value: string): string | null {
  const text = normalizeTitleText(value);
  for (const [family, aliases] of Object.entries(ROLE_FAMILIES)) {
    if (aliases.some((alias) => text.includes(normalizeTitleText(alias)))) {
      return family;
    }
  }
  return null;
}

function extractTitleSpecialtyTokens(value: string): string[] {
  return tokenize(value).filter((token) => !TITLE_SPECIALTY_STOPWORDS.has(token));
}

function specialtyOverlapScore(left: string, right: string): number {
  const leftTokens = new Set(extractTitleSpecialtyTokens(left));
  const rightTokens = new Set(extractTitleSpecialtyTokens(right));

  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(leftTokens.size, rightTokens.size);
  if (ratio >= 0.75) return 5;
  if (ratio >= 0.4) return 3;
  if (ratio > 0) return 2;
  return 0;
}

function trackCompatibilityScore(left: TitleTrack, right: TitleTrack): number {
  if (left === right) return 4;
  if ((left === "ic" && right === "lead") || (left === "lead" && right === "ic")) return 3;
  if ((left === "lead" && right === "manager") || (left === "manager" && right === "lead")) return 2;
  if ((left === "ic" && right === "manager") || (left === "manager" && right === "ic")) return 1;
  return 0;
}

function levelCompatibilityScore(left: string, right: string): number {
  const leftRank = seniorityRank(left);
  const rightRank = seniorityRank(right);
  if (leftRank == null || rightRank == null) return 2;

  const delta = Math.abs(leftRank - rightRank);
  if (delta === 0) return 4;
  if (delta === 1) return 3;
  if (delta === 2) return 1;
  return 0;
}

function computeSameFamilyTitleScore(profileTitle: string, jobTitle: string): number {
  const profileFamily = extractPrimaryFamily(profileTitle);
  const jobFamily = extractPrimaryFamily(jobTitle);
  if (!profileFamily || !jobFamily || profileFamily !== jobFamily) return 0;

  const specialtyScore = specialtyOverlapScore(profileTitle, jobTitle);
  const trackScore = trackCompatibilityScore(detectTitleTrack(profileTitle), detectTitleTrack(jobTitle));
  const levelScore = levelCompatibilityScore(profileTitle, jobTitle);

  let score = 8;
  score += 4;
  score += specialtyScore;
  score += trackScore;
  score += levelScore;

  if (detectTitleTrack(profileTitle) === "ic" && detectTitleTrack(jobTitle) === "manager") {
    score = Math.min(score, 16);
  }

  if (detectTitleTrack(profileTitle) === "ic" && detectTitleTrack(jobTitle) === "lead") {
    score = Math.min(score, 20);
  }

  return Math.min(score, 22);
}

function computeTitleScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const profileTitles = uniqueStrings(profile.normalizedTitles.map(normalizeTitleText).filter(Boolean));
  const jobTitles = uniqueStrings([job.titleNormalized ?? "", job.title].map(normalizeTitleText).filter(Boolean));
  if (!profileTitles.length || !jobTitles.length) return 0;

  if (profileTitles.some((title) => !GENERIC_TITLE_PHRASES.has(title) && jobTitles.includes(title))) {
    return TITLE_WEIGHT;
  }

  if (
    profileTitles.some((profileTitle) =>
      jobTitles.some((jobTitle) =>
        !GENERIC_TITLE_PHRASES.has(profileTitle) &&
        !GENERIC_TITLE_PHRASES.has(jobTitle) &&
        (profileTitle.includes(jobTitle) || jobTitle.includes(profileTitle)),
      ),
    )
  ) {
    return 21;
  }

  let bestSameFamilyScore = 0;
  for (const profileTitle of profileTitles) {
    for (const jobTitle of jobTitles) {
      bestSameFamilyScore = Math.max(bestSameFamilyScore, computeSameFamilyTitleScore(profileTitle, jobTitle));
    }
  }
  if (bestSameFamilyScore > 0) return bestSameFamilyScore;

  const profileFamilies = extractRoleFamilies(profileTitles);
  const jobFamilies = extractRoleFamilies(jobTitles);
  const directOverlap = Array.from(profileFamilies).filter((family) => jobFamilies.has(family));
  if (directOverlap.length > 0) return directOverlap.length > 1 ? 18 : 15;

  const profileBridges = buildBridgeFamilies(profileFamilies);
  const bridgedOverlap = Array.from(jobFamilies).filter((family) => profileBridges.has(family));
  if (bridgedOverlap.length > 0) return 8;

  return 0;
}

function selectSurfacedSignals(
  buckets: Array<{ values: string[]; confidence: number }>,
  limit: number,
): string[] {
  const deduped: Array<{ value: string; confidence: number }> = [];
  const seen = new Set<string>();

  for (const bucket of buckets) {
    for (const rawValue of bucket.values) {
      const value = normalizeRegistryText(rawValue);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      deduped.push({ value, confidence: bucket.confidence });
    }
  }

  const kept = new Set(pruneGenericSignals(deduped.map((item) => item.value)));

  return deduped
    .filter((item) => kept.has(item.value))
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;

      const specificityDelta = getSignalSpecificity(right.value) - getSignalSpecificity(left.value);
      if (specificityDelta !== 0) return specificityDelta;

      return left.value.localeCompare(right.value);
    })
    .slice(0, limit)
    .map((item) => item.value);
}

function rankLowFitTransferability(value: string): number {
  const normalized = normalizeRegistryText(value);
  if (!normalized) return 0;
  if (HIGH_TRANSFERABLE_SIGNALS.has(normalized)) return 2;
  if (LOW_VALUE_LOW_FIT_SIGNALS.has(normalized)) return 0;
  return 1;
}

function selectLowFitStrongSignals(
  buckets: Array<{ values: string[]; confidence: number }>,
  limit: number,
): string[] {
  const deduped: Array<{ value: string; confidence: number }> = [];
  const seen = new Set<string>();

  for (const bucket of buckets) {
    for (const rawValue of bucket.values) {
      const value = normalizeRegistryText(rawValue);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      deduped.push({ value, confidence: bucket.confidence });
    }
  }

  const kept = new Set(pruneGenericSignals(deduped.map((item) => item.value)));

  return deduped
    .filter((item) => kept.has(item.value))
    .sort((left, right) => {
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;

      const transferableDelta = rankLowFitTransferability(right.value) - rankLowFitTransferability(left.value);
      if (transferableDelta !== 0) return transferableDelta;

      const specificityDelta = getSignalSpecificity(right.value) - getSignalSpecificity(left.value);
      if (specificityDelta !== 0) return specificityDelta;

      return left.value.localeCompare(right.value);
    })
    .slice(0, limit)
    .map((item) => item.value);
}

function computeSkillScore(profile: ResumeProfileInput, job: JobForScoring): {
  score: number;
  matchingBuckets: Array<{ values: string[]; confidence: number }>;
  matching: string[];
  missing: string[];
  conceptMatches: string[]; 
  conceptMissing: string[];
} {
  const profilePool = buildProfileKeywordPool(profile);
  const conceptPool = buildConceptPool(profile);
  const jobSignals = deriveJobSignals(job);
  const targetSkills = jobSignals.coreSkills.length > 0 ? jobSignals.coreSkills : jobSignals.supportSkills;

  const matchingCore = jobSignals.coreSkills.filter((skill) => hasPoolMatch(profilePool, skill));
  const missingCore = jobSignals.coreSkills.filter((skill) => !matchingCore.includes(skill));
  const matchingSupport = jobSignals.supportSkills.filter((skill) => hasPoolMatch(profilePool, skill));
  const missingSupport = jobSignals.supportSkills.filter((skill) => !matchingSupport.includes(skill));
  const conceptMatches = jobSignals.conceptSignals.filter((signal) => conceptPool.has(signal));
  const conceptMissing = jobSignals.conceptSignals.filter((signal) => !conceptMatches.includes(signal));

  const ratio = targetSkills.length > 0
    ? targetSkills.filter((skill) => hasPoolMatch(profilePool, skill)).length / targetSkills.length
    : conceptMatches.length > 0
      ? Math.min(0.35, conceptMatches.length / Math.max(jobSignals.conceptSignals.length, 3))
      : 0;

  return {
    score: Math.round(SKILL_WEIGHT * ratio),
    matchingBuckets: [
      { values: sortCanonicalSkills(matchingCore), confidence: 3 },
      { values: sortCanonicalSkills(matchingSupport), confidence: 2 },
      { values: sortConceptSignals(conceptMatches), confidence: 1 },
    ],
    matching: [],
    missing: selectSurfacedSignals([
      { values: sortCanonicalSkills(missingCore), confidence: 3 },
      { values: sortCanonicalSkills(missingSupport), confidence: 2 },
      { values: sortConceptSignals(conceptMissing), confidence: 1 },
    ], GAP_LIMIT),
    conceptMatches: sortConceptSignals(conceptMatches),
    conceptMissing: sortConceptSignals(conceptMissing),
  };
}

function computeConceptScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const conceptPool = buildConceptPool(profile);
  const jobSignals = deriveJobSignals(job);
  const targets = jobSignals.conceptSignals;

  if (!targets.length) return 0;

  const matched = targets.filter((signal) => conceptPool.has(signal));
  const ratio = matched.length / targets.length;
  return Math.round(KEYWORD_WEIGHT * ratio);
}

function computeSeniorityScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const profileLevel = seniorityRank(profile.seniority);
  const jobLevel = seniorityRank(job.seniority);

  if (profileLevel == null || jobLevel == null) return Math.round(SENIORITY_WEIGHT * 0.6);

  const delta = profileLevel - jobLevel;
  if (delta === 0) return SENIORITY_WEIGHT;
  if (delta === 1) return 14;
  if (delta === 2) return 12;
  if (delta >= 3) return 10;
  if (delta === -1) return 10;
  if (delta === -2) return 5;
  return 1;
}

function computeLocationScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const remoteType = (job.remoteType ?? "unknown").toLowerCase();
  if (remoteType === "remote") return LOCATION_WEIGHT;
  if (remoteType === "hybrid") return 7;

  const summary = normalizeRegistryText(profile.summary ?? "");
  const jobLocation = normalizeRegistryText(job.location ?? "");
  if (!jobLocation) return 5;
  if (summary.includes("remote")) return 6;
  if (summary.includes(jobLocation)) return LOCATION_WEIGHT;
  return 3;
}

function buildShortReasons(args: {
  titleScore: number;
  skillScore: number;
  seniorityScore: number;
  conceptScore: number;
  matchingSkills: string[];
  matchingConcepts: string[];
  missingSkills: string[];
  remoteType?: string | null;
}): string[] {
  const reasons: string[] = [];

  if (args.titleScore >= 18) reasons.push("Strong title fit");
  else if (args.titleScore >= 12) reasons.push("Relevant role family");

  if (args.matchingSkills.length >= 2) {
    reasons.push(`Skills match: ${args.matchingSkills.slice(0, 2).join(", ")}`);
  } else if (args.skillScore >= 12) {
    reasons.push("Useful technical overlap");
  }

  if (args.matchingConcepts.length >= 2) {
    reasons.push(`Workflow overlap: ${args.matchingConcepts.slice(0, 2).join(", ")}`);
  } else if (args.conceptScore >= 6) {
    reasons.push("Relevant responsibilities overlap");
  }

  if (args.seniorityScore >= 12) reasons.push("Seniority aligned");
  if ((args.remoteType ?? "").toLowerCase() === "remote") reasons.push("Remote-friendly");

  if (!reasons.length && args.missingSkills.length) {
    reasons.push(`Gap to close: ${args.missingSkills[0]}`);
  }

  return reasons.slice(0, 3);
}

function buildExplanationShort(result: {
  totalScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  shortReasons: string[];
}): string {
  if (result.totalScore >= 80) return `Strong fit. ${result.shortReasons.join(". ")}.`;
  if (result.totalScore >= 60) return `Promising fit with some gaps. ${result.shortReasons.join(". ")}.`;
  if (result.shortReasons.length > 0) return `Worth a look. ${result.shortReasons.join(". ")}.`;
  if (result.missingSkills.length > 0) {
    return `Partial match. Stronger alignment is possible if you address ${result.missingSkills.slice(0, 2).join(" and ")}.`;
  }
  return "Partial match. Review this role before spending credits on tailoring.";
}

export function scoreResumeToJob(profile: ResumeProfileInput, job: JobForScoring): MatchResult {
  const titleScore = computeTitleScore(profile, job);
  const skillResult = computeSkillScore(profile, job);
  const seniorityScore = computeSeniorityScore(profile, job);
  const keywordScore = computeConceptScore(profile, job);
  const locationScore = computeLocationScore(profile, job);

  const totalScore = Math.max(
    0,
    Math.min(100, titleScore + skillResult.score + seniorityScore + keywordScore + locationScore),
  );

  const matchingSkills = totalScore < LOW_FIT_SIGNAL_THRESHOLD
    ? selectLowFitStrongSignals(skillResult.matchingBuckets, SIGNAL_LIMIT)
    : selectSurfacedSignals(skillResult.matchingBuckets, SIGNAL_LIMIT);

  const shortReasons = buildShortReasons({
    titleScore,
    skillScore: skillResult.score,
    seniorityScore,
    conceptScore: keywordScore,
    matchingSkills,
    matchingConcepts: skillResult.conceptMatches,
    missingSkills: skillResult.missing,
    remoteType: job.remoteType,
  });

  return {
    totalScore,
    titleScore,
    skillScore: skillResult.score,
    seniorityScore,
    keywordScore,
    locationScore,
    matchingSkills,
    missingSkills: skillResult.missing,
    shortReasons,
    explanationShort: buildExplanationShort({
      totalScore,
      matchingSkills,
      missingSkills: skillResult.missing,
      shortReasons,
    }),
  };
}
