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
      "quality assurance",
      "qa engineer",
      "quality engineer",
      "qa analyst",
      "software tester",
      "test engineer",
      "test analyst",
      "sdet",
      "software development engineer in test",
      "automation tester",
      "automation qa",
      "qa automation engineer",
      "game tester",
      "manual tester",
      "functional tester",
      "validation engineer",
      "uat analyst",
      "technical qa",
    ],
    adjacent: ["engineering", "support", "devops"],
    exclusionKeywords: ["artist", "animator", "illustrator", "producer", "recruiter"],
  },
  {
    key: "engineering",
    label: "Software Engineering",
    synonyms: [
      "software engineer",
      "software developer",
      "backend engineer",
      "frontend engineer",
      "full stack engineer",
      "application developer",
      "web developer",
      "mobile developer",
      "gameplay programmer",
      "engine programmer",
      "unity developer",
      "unreal developer",
    ],
    adjacent: ["qa", "devops", "data", "support"],
  },
  {
    key: "product",
    label: "Product",
    synonyms: ["product manager", "product owner", "technical product manager"],
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
      "artist",
      "concept artist",
      "graphic designer",
      "motion designer",
      "animator",
    ],
    adjacent: ["marketing", "product"],
  },
  {
    key: "data",
    label: "Data",
    synonyms: ["data analyst", "data engineer", "data scientist", "bi analyst", "analytics engineer"],
    adjacent: ["engineering", "operations", "product"],
  },
  {
    key: "devops",
    label: "DevOps / SRE",
    synonyms: ["devops", "site reliability", "sre", "platform engineer", "infrastructure engineer", "build engineer"],
    adjacent: ["engineering", "qa", "support", "operations"],
  },
  {
    key: "support",
    label: "Support / IT",
    synonyms: ["support engineer", "technical support", "it support", "help desk", "systems administrator", "implementation specialist"],
    adjacent: ["qa", "engineering", "operations", "project"],
  },
  {
    key: "project",
    label: "Project / Program",
    synonyms: ["project manager", "program manager", "producer", "scrum master", "delivery manager"],
    adjacent: ["product", "operations", "support"],
  },
  {
    key: "marketing",
    label: "Marketing",
    synonyms: ["marketing", "crm", "martech", "campaign manager", "lifecycle marketing", "content marketing"],
    adjacent: ["product", "design", "sales", "operations"],
  },
  {
    key: "sales",
    label: "Sales",
    synonyms: ["sales", "account executive", "business development", "sales development", "customer success"],
    adjacent: ["marketing", "support", "operations"],
  },
  {
    key: "operations",
    label: "Operations",
    synonyms: ["operations", "business operations", "revenue operations", "delivery operations", "coordinator"],
    adjacent: ["project", "support", "data", "marketing"],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s/+-]/g, " ").replace(/\s+/g, " ").trim();
}

export function getRoleFamilies(): RoleFamilyDefinition[] {
  return ROLE_FAMILIES;
}

export function inferRoleFamily(value: string | null | undefined): RoleFamilyKey {
  const normalized = normalize(value ?? "");
  if (!normalized) return "unknown";

  for (const family of ROLE_FAMILIES) {
    if (family.synonyms.some((synonym) => normalized.includes(normalize(synonym)))) {
      return family.key;
    }
  }

  return "unknown";
}

export function getRoleFamilyPriority(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): number {
  const targetFamily = inferRoleFamily(targetPosition);
  const jobFamily = inferRoleFamily(jobTitle);

  if (targetFamily === "unknown" || jobFamily === "unknown") {
    return 0;
  }

  if (targetFamily === jobFamily) {
    return 100;
  }

  const family = ROLE_FAMILIES.find((entry) => entry.key === targetFamily);
  if (family?.adjacent.includes(jobFamily)) {
    return 55;
  }

  return 0;
}

export function getRoleFamilyMatchStrength(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): RoleFamilyMatchStrength {
  const score = getRoleFamilyPriority(targetPosition, jobTitle);
  if (score >= 100) return "exact";
  if (score >= 55) return "adjacent";
  if (score >= 20) return "weak";
  return "exclude";
}

export function shouldHardExcludeRoleCandidate(
  targetPosition: string | null | undefined,
  jobTitle: string | null | undefined,
): boolean {
  const targetFamily = inferRoleFamily(targetPosition);
  if (targetFamily === "unknown") return false;

  const family = ROLE_FAMILIES.find((entry) => entry.key === targetFamily);
  if (!family?.exclusionKeywords?.length) return false;

  const normalizedJobTitle = normalize(jobTitle ?? "");
  if (!normalizedJobTitle) return false;

  return family.exclusionKeywords.some((keyword) => normalizedJobTitle.includes(normalize(keyword)));
}
