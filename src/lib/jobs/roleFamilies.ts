export type RoleFamilyKey =
  | "qa"
  | "engineering"
  | "product"
  | "design"
  | "data"
  | "devops"
  | "support"
  | "project"
  | "marketing"
  | "sales"
  | "operations"
  | "unknown";

export type RoleFamilyMatchStrength = "exact" | "adjacent" | "weak" | "exclude";

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "associate",
  "contract",
  "contractor",
  "entry",
  "full",
  "i",
  "ii",
  "iii",
  "intern",
  "intermediate",
  "jr",
  "junior",
  "lead",
  "manager",
  "mid",
  "of",
  "part",
  "principal",
  "remote",
  "senior",
  "sr",
  "staff",
  "temporary",
  "the",
  "time",
  "to",
]);

export type RoleFamilyDefinition = {
  key: RoleFamilyKey;
  label: string;
  synonyms: string[];
  adjacent: RoleFamilyKey[];
  exclusionKeywords?: string[];
};

const ROLE_FAMILIES: RoleFamilyDefinition[] = [
  {
    key: "qa",
    label: "QA / Test",
    synonyms: [
      "qa",
      "qa tester",
      "qa engineer",
      "qa analyst",
      "qa lead",
      "qa manager",
      "quality assurance",
      "quality assurance engineer",
      "quality assurance analyst",
      "quality engineer",
      "quality analyst",
      "software tester",
      "software test engineer",
      "test engineer",
      "test analyst",
      "test lead",
      "test manager",
      "manual tester",
      "manual qa",
      "functional tester",
      "functional qa",
      "game tester",
      "game qa",
      "games qa",
      "video game tester",
      "certification tester",
      "compliance tester",
      "release tester",
      "release qa",
      "uat analyst",
      "user acceptance tester",
      "validation engineer",
      "verification engineer",
      "verification analyst",
      "test automation engineer",
      "automation tester",
      "automation qa",
      "qa automation engineer",
      "sdet",
      "software development engineer in test",
      "technical qa",
      "platform quality analyst",
      "build verification engineer",
      "bvt engineer",
    ],
    adjacent: ["engineering", "support"],
    exclusionKeywords: [
      "artist",
      "animator",
      "illustrator",
      "concept artist",
      "recruiter",
      "talent acquisition",
      "sales",
      "account executive",
      "marketer",
      "marketing",
    ],
  },
  {
    key: "engineering",
    label: "Software Engineering",
    synonyms: [
      "software engineer",
      "software developer",
      "application developer",
      "web developer",
      "mobile developer",
      "frontend engineer",
      "frontend developer",
      "backend engineer",
      "backend developer",
      "full stack engineer",
      "full stack developer",
      "game developer",
      "game engineer",
      "gameplay programmer",
      "gameplay engineer",
      "engine programmer",
      "engine engineer",
      "tools engineer",
      "tools programmer",
      "unity developer",
      "unreal developer",
      "programmer",
      "developer",
      "engineer",
    ],
    adjacent: ["qa", "devops", "support", "data"],
  },
  {
    key: "product",
    label: "Product",
    synonyms: [
      "product manager",
      "product owner",
      "technical product manager",
      "group product manager",
      "product lead",
    ],
    adjacent: ["project", "operations", "marketing"],
  },
  {
    key: "design",
    label: "Design / Art",
    synonyms: [
      "designer",
      "product designer",
      "ux designer",
      "ui designer",
      "visual designer",
      "graphic designer",
      "motion designer",
      "artist",
      "concept artist",
      "technical artist",
      "animator",
      "vfx artist",
      "3d artist",
      "level designer",
      "systems designer",
      "game designer",
    ],
    adjacent: ["marketing", "product"],
  },
  {
    key: "data",
    label: "Data",
    synonyms: [
      "data analyst",
      "data engineer",
      "data scientist",
      "analytics engineer",
      "bi analyst",
      "business intelligence analyst",
      "reporting analyst",
    ],
    adjacent: ["engineering", "operations", "product"],
  },
  {
    key: "devops",
    label: "DevOps / SRE",
    synonyms: [
      "devops",
      "devops engineer",
      "site reliability",
      "site reliability engineer",
      "sre",
      "platform engineer",
      "platform reliability engineer",
      "infrastructure engineer",
      "build engineer",
      "release engineer",
      "cloud engineer",
      "systems engineer",
    ],
    adjacent: ["engineering", "support"],
  },
  {
    key: "support",
    label: "Support / IT",
    synonyms: [
      "support engineer",
      "technical support",
      "technical support engineer",
      "it support",
      "it specialist",
      "help desk",
      "service desk",
      "desktop support",
      "systems administrator",
      "sysadmin",
      "implementation specialist",
      "application support",
      "customer support specialist",
    ],
    adjacent: ["qa", "engineering", "operations", "project"],
  },
  {
    key: "project",
    label: "Project / Program",
    synonyms: [
      "project manager",
      "program manager",
      "delivery manager",
      "scrum master",
      "technical producer",
      "producer",
    ],
    adjacent: ["product", "operations", "support"],
  },
  {
    key: "marketing",
    label: "Marketing",
    synonyms: [
      "marketing",
      "crm",
      "martech",
      "campaign manager",
      "lifecycle marketing",
      "content marketing",
      "growth marketing",
    ],
    adjacent: ["product", "design", "sales", "operations"],
  },
  {
    key: "sales",
    label: "Sales",
    synonyms: [
      "sales",
      "account executive",
      "business development",
      "sales development",
      "customer success",
    ],
    adjacent: ["marketing", "support", "operations"],
  },
  {
    key: "operations",
    label: "Operations",
    synonyms: [
      "operations",
      "business operations",
      "revenue operations",
      "delivery operations",
      "coordinator",
      "operations analyst",
    ],
    adjacent: ["project", "support", "data", "marketing"],
  },
];

export const TARGET_POSITION_OPTIONS: string[] = ROLE_FAMILIES.map((family) => family.label);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s/,+-]/g, " ")
    .replace(/\bfullstack\b/g, "full stack")
    .replace(/\bfront end\b/g, "frontend")
    .replace(/\bback end\b/g, "backend")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRoleText(value: string | null | undefined): string {
  return normalize(value ?? "");
}

function splitInput(value: string | null | undefined): string[] {
  const normalized = normalize(value ?? "");
  if (!normalized) return [];
  return normalized
    .split(/[,/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getMatchingFamilies(value: string | null | undefined): RoleFamilyKey[] {
  const parts = splitInput(value);
  if (!parts.length) return [];

  const keys = new Set<RoleFamilyKey>();

  for (const part of parts) {
    for (const family of ROLE_FAMILIES) {
      const normalizedLabel = normalize(family.label);
      if (part === normalizedLabel || normalizedLabel.includes(part) || part.includes(normalizedLabel)) {
        keys.add(family.key);
        continue;
      }

      for (const synonym of family.synonyms) {
        const normalizedSynonym = normalize(synonym);
        if (
          part === normalizedSynonym ||
          part.includes(normalizedSynonym) ||
          normalizedSynonym.includes(part)
        ) {
          keys.add(family.key);
          break;
        }
      }
    }
  }

  return Array.from(keys);
}

export function getRoleFamilies(): RoleFamilyDefinition[] {
  return ROLE_FAMILIES;
}

export function inferRoleFamily(value: string | null | undefined): RoleFamilyKey {
  const matches = getMatchingFamilies(value);
  return matches[0] ?? "unknown";
}

export function inferRoleFamilies(value: string | null | undefined): RoleFamilyKey[] {
  return getMatchingFamilies(value);
}

export function getRoleFamilyPriority(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): number {
  const targetFamilies = inferRoleFamilies(targetPosition);
  const jobFamily = inferRoleFamily(jobTitle);

  if (!targetFamilies.length || jobFamily === "unknown") {
    return 0;
  }

  if (targetFamilies.includes(jobFamily)) {
    return 100;
  }

  for (const familyKey of targetFamilies) {
    const family = ROLE_FAMILIES.find((entry) => entry.key === familyKey);
    if (family?.adjacent.includes(jobFamily)) {
      return 28;
    }
  }

  return 0;
}

export function getRoleFamilyMatchStrength(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): RoleFamilyMatchStrength {
  const targetFamilies = inferRoleFamilies(targetPosition);
  const jobFamily = inferRoleFamily(jobTitle);

  if (!targetFamilies.length || jobFamily === "unknown") {
    return "weak";
  }

  if (targetFamilies.includes(jobFamily)) {
    return "exact";
  }

  for (const familyKey of targetFamilies) {
    const family = ROLE_FAMILIES.find((entry) => entry.key === familyKey);
    if (family?.adjacent.includes(jobFamily)) {
      return "adjacent";
    }
  }

  return "exclude";
}

export function shouldHardExcludeRoleCandidate(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): boolean {
  const targetFamilies = inferRoleFamilies(targetPosition);
  if (!targetFamilies.length) return false;

  const normalizedJobTitle = normalize(jobTitle ?? "");
  if (!normalizedJobTitle) return false;

  return targetFamilies.some((familyKey) => {
    const family = ROLE_FAMILIES.find((entry) => entry.key === familyKey);
    if (!family?.exclusionKeywords?.length) return false;
    return family.exclusionKeywords.some((keyword) => normalizedJobTitle.includes(normalize(keyword)));
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalize(value)).filter(Boolean)));
}

function getTargetTitleVariants(targetPosition: string | null | undefined): string[] {
  const normalized = normalize(targetPosition ?? "");
  if (!normalized) return [];

  const variants = [normalized];

  if (normalized.includes("qa")) {
    variants.push(normalized.replace(/\bqa\b/g, "quality assurance"));
  }

  if (normalized.includes("quality assurance")) {
    variants.push(normalized.replace(/quality assurance/g, "qa"));
  }

  if (normalized.includes("sdet")) {
    variants.push("software development engineer in test");
    variants.push("software developer in test");
    variants.push("test automation engineer");
  }

  if (normalized.includes("test automation")) {
    variants.push(normalized.replace("test automation", "qa automation"));
    variants.push(normalized.replace("test automation", "automation qa"));
  }

  return unique(variants);
}

function getSignificantTitleTokens(targetPosition: string | null | undefined): string[] {
  const variants = getTargetTitleVariants(targetPosition);
  const tokens = variants
    .flatMap((variant) => variant.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !TITLE_STOP_WORDS.has(token));

  return Array.from(new Set(tokens));
}

export function getTargetPositionPriority(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): number {
  const target = normalize(targetPosition ?? "");
  const title = normalize(jobTitle ?? "");
  if (!target || !title) return 0;

  const variants = getTargetTitleVariants(targetPosition);

  if (variants.some((variant) => title === variant)) {
    return 340;
  }

  if (variants.some((variant) => title.includes(variant))) {
    return 300;
  }

  const tokens = getSignificantTitleTokens(targetPosition);
  if (tokens.length >= 2 && tokens.every((token) => title.includes(token))) {
    return 240;
  }

  const familyPriority = getRoleFamilyPriority(targetPosition, jobTitle);
  if (familyPriority >= 100) return 120;
  if (familyPriority > 0) return familyPriority;

  return 0;
}

export function isRoleCandidateAllowedForTarget(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): boolean {
  const targetFamilies = inferRoleFamilies(targetPosition);
  if (!targetFamilies.length) return true;
  if (shouldHardExcludeRoleCandidate(targetPosition, jobTitle)) return false;
  return getRoleFamilyMatchStrength(targetPosition, jobTitle) !== "exclude";
}
