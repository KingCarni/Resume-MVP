import type { MatchResult, ResumeProfileInput } from "@/lib/jobs/types";

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

const ROLE_FAMILY_DEFINITIONS = {
  qa: {
    aliases: [
      "qa tester",
      "qa engineer",
      "qa analyst",
      "quality assurance",
      "quality analyst",
      "platform quality analyst",
      "platform qa analyst",
      "platform quality",
      "quality engineer",
      "quality assurance tester",
      "quality assurance engineer",
      "quality assurance analyst",
      "software tester",
      "manual tester",
      "functional tester",
      "test engineer",
      "test analyst",
      "test automation engineer",
      "automation tester",
      "automation engineer",
      "software development engineer in test",
      "sdet",
      "verification engineer",
      "validation engineer",
      "gameplay qa",
      "embedded qa",
      "qa lead",
      "quality lead",
    ],
    bridges: ["engineering", "design_game", "support_ops"],
  },
  engineering: {
    aliases: [
      "software engineer",
      "software developer",
      "game developer",
      "game engineer",
      "gameplay programmer",
      "gameplay engineer",
      "gameplay developer",
      "engine programmer",
      "engine developer",
      "tools programmer",
      "tools engineer",
      "tools developer",
      "technical developer",
      "engine tools programmer",
      "engine tools engineer",
      "ui programmer",
      "systems programmer",
      "systems engineer",
      "integration engineer",
      "frontend engineer",
      "frontend developer",
      "front end engineer",
      "front end developer",
      "backend engineer",
      "backend developer",
      "back end engineer",
      "back end developer",
      "full stack engineer",
      "full stack developer",
      "fullstack engineer",
      "fullstack developer",
      "web developer",
      "web engineer",
      "application developer",
      "application engineer",
      "mobile developer",
      "mobile engineer",
      "ios developer",
      "ios engineer",
      "android developer",
      "android engineer",
      "react native developer",
      "react native engineer",
      "unity developer",
      "unreal developer",
      "graphics engineer",
      "rendering engineer",
      "network engineer",
      "programmer",
      "developer",
      "engineer",
    ],
    bridges: ["qa", "platform_ops", "design_game"],
  },
  design_game: {
    aliases: [
      "game designer",
      "gameplay designer",
      "systems designer",
      "level designer",
      "combat designer",
      "economy designer",
      "narrative designer",
      "quest designer",
      "mission designer",
      "technical designer",
      "content designer",
      "live ops designer",
      "feature designer",
      "mechanics designer",
      "balance designer",
    ],
    bridges: ["engineering", "art", "production", "qa"],
  },
  design_product: {
    aliases: [
      "product designer",
      "ux designer",
      "ui designer",
      "ui ux designer",
      "ui/ux designer",
      "interaction designer",
      "experience designer",
      "visual designer",
      "interface designer",
      "design systems designer",
      "web designer",
      "graphic designer",
      "ux researcher",
      "product researcher",
    ],
    bridges: ["art", "product_ops"],
  },
  art: {
    aliases: [
      "artist",
      "game artist",
      "2d artist",
      "3d artist",
      "environment artist",
      "character artist",
      "concept artist",
      "technical artist",
      "ui artist",
      "vfx artist",
      "animator",
      "motion designer",
      "rigging artist",
      "illustrator",
      "prop artist",
      "lighting artist",
      "cinematic artist",
      "fx artist",
      "vfx animator",
    ],
    bridges: ["design_game", "design_product"],
  },
  production: {
    aliases: [
      "producer",
      "game producer",
      "associate producer",
      "senior producer",
      "development producer",
      "project manager",
      "delivery manager",
      "production coordinator",
      "release manager",
      "scrum master",
      "project coordinator",
      "development manager",
      "live operations producer",
    ],
    bridges: ["design_game", "art", "product_ops", "support_ops"],
  },
  product_ops: {
    aliases: [
      "product manager",
      "technical product manager",
      "program manager",
      "technical program manager",
      "product operations manager",
      "product ops manager",
      "product operations analyst",
      "product ops analyst",
      "product owner",
      "strategy manager",
      "platform operations",
      "operations manager",
      "product operations specialist",
      "product strategist",
    ],
    bridges: ["production", "data", "support_ops", "design_product"],
  },
  data: {
    aliases: [
      "data analyst",
      "business analyst",
      "game analyst",
      "insights analyst",
      "business intelligence analyst",
      "bi analyst",
      "data scientist",
      "analytics engineer",
      "reporting analyst",
      "metrics analyst",
      "player insights analyst",
      "bi developer",
      "data engineer",
    ],
    bridges: ["product_ops"],
  },
  platform_ops: {
    aliases: [
      "devops engineer",
      "site reliability engineer",
      "sre",
      "platform engineer",
      "cloud engineer",
      "infrastructure engineer",
      "build engineer",
      "release engineer",
      "build and release engineer",
      "ci cd engineer",
      "systems engineer",
      "automation engineer",
      "tools engineer",
      "infrastructure developer",
      "build pipeline engineer",
    ],
    bridges: ["engineering", "qa", "support_ops"],
  },
  support_ops: {
    aliases: [
      "support engineer",
      "technical support engineer",
      "application support engineer",
      "customer support specialist",
      "player support specialist",
      "community manager",
      "live operations specialist",
      "support analyst",
      "operations specialist",
      "customer success technical specialist",
      "live ops specialist",
      "player experience specialist",
    ],
    bridges: ["product_ops", "platform_ops", "qa"],
  },
} as const;

type RoleFamily = keyof typeof ROLE_FAMILY_DEFINITIONS;

const ROLE_FAMILY_KEYWORD_HINTS: Record<RoleFamily, string[]> = {
  qa: [
    "qa",
    "quality assurance",
    "quality analyst",
    "software testing",
    "test automation",
    "manual testing",
    "test planning",
    "test strategy",
    "bug triage",
    "defect tracking",
    "jira",
    "acceptance criteria",
  ],
  engineering: [
    "software engineering",
    "software development",
    "application development",
    "programming",
    "systems engineering",
    "unity",
    "unreal engine",
    "c++",
    "c#",
    "build systems",
    "tool development",
    "tools programming",
    "engine tools",
    "editor tools",
    "world editor",
    "performance tools",
    "content pipelines",
    "asset pipelines",
    "ui frameworks",
    "wpf",
    "winforms",
    "qt",
    "oop",
    "object oriented programming",
    ".net",
    "rendering",
    "multiplayer",
  ],
  design_game: [
    "game design",
    "systems design",
    "level design",
    "content design",
    "gameplay systems",
    "combat design",
    "technical design",
    "economy design",
  ],
  design_product: [
    "product design",
    "ux",
    "ui",
    "interaction design",
    "design systems",
    "user research",
    "prototyping",
    "accessibility",
  ],
  art: [
    "art production",
    "technical art",
    "3d modeling",
    "animation",
    "vfx",
    "maya",
    "blender",
    "shader development",
  ],
  production: [
    "production planning",
    "release planning",
    "delivery",
    "project coordination",
    "stakeholder management",
    "milestone planning",
    "dependency management",
  ],
  product_ops: [
    "product operations",
    "program management",
    "technical program management",
    "roadmapping",
    "cross functional delivery",
    "product strategy",
    "product analytics",
  ],
  data: [
    "data analysis",
    "analytics",
    "reporting",
    "insights",
    "business intelligence",
    "tableau",
    "power bi",
    "sql",
  ],
  platform_ops: [
    "platform operations",
    "cloud infrastructure",
    "build and release",
    "ci cd",
    "automation",
    "incident response",
    "monitoring",
    "terraform",
    "kubernetes",
  ],
  support_ops: [
    "support operations",
    "technical support",
    "customer support",
    "community support",
    "player support",
    "ticket triage",
    "zendesk",
    "knowledge base",
  ],
};

const GENERIC_TITLE_PHRASES = new Set([
  "engineer",
  "developer",
  "manager",
  "designer",
  "analyst",
  "specialist",
  "administrator",
  "architect",
  "consultant",
  "coordinator",
  "scientist",
  "tester",
  "technician",
  "artist",
  "producer",
  "programmer",
  "animator",
]);

const ROLE_NOUNS = [
  "engineer",
  "developer",
  "manager",
  "designer",
  "analyst",
  "scientist",
  "administrator",
  "specialist",
  "architect",
  "consultant",
  "coordinator",
  "tester",
  "technician",
  "artist",
  "producer",
  "programmer",
  "animator",
  "owner",
] as const;

type SeniorityKey = "entry" | "mid" | "senior" | "lead" | "manager";

const SENIORITY_RANK: Record<SeniorityKey, number> = {
  entry: 0,
  mid: 1,
  senior: 2,
  lead: 3,
  manager: 4,
};

const SENIORITY_PATTERNS: Array<{ key: SeniorityKey; patterns: RegExp[] }> = [
  {
    key: "manager",
    patterns: [
      /\bmanager\b/,
      /\bsenior manager\b/,
      /\bgroup manager\b/,
      /\bhead\b/,
      /\bdirector\b/,
      /\bvice president\b/,
      /\bvp\b/,
      /\bchief\b/,
    ],
  },
  {
    key: "lead",
    patterns: [/\blead\b/, /\bprincipal\b/, /\bowner\b/],
  },
  {
    key: "senior",
    patterns: [/\bsenior\b/, /\bsr\b/, /\bstaff\b/, /\biii\b/],
  },
  {
    key: "mid",
    patterns: [/\bmid\b/, /\bmid level\b/, /\bmid-level\b/, /\bintermediate\b/, /\bii\b/],
  },
  {
    key: "entry",
    patterns: [
      /\bintern\b/,
      /\binternship\b/,
      /\bjunior\b/,
      /\bjr\b/,
      /\bassociate\b/,
      /\bentry\b/,
      /\bentry level\b/,
      /\bentry-level\b/,
      /\bnew grad\b/,
      /\bgraduate\b/,
      /\bapprentice\b/,
      /\bco op\b/,
      /\bco-op\b/,
      /\btrainee\b/,
    ],
  },
];

const FILLER_KEYWORDS = new Set([
  "and",
  "the",
  "with",
  "from",
  "that",
  "this",
  "your",
  "their",
  "our",
  "for",
  "into",
  "about",
  "across",
  "through",
  "using",
  "used",
  "will",
  "are",
  "is",
  "be",
  "you",
  "they",
  "them",
  "role",
  "work",
  "worked",
  "strong",
  "support",
  "awesome",
  "clearly",
  "continuously",
  "closely",
  "software",
  "development",
  "design",
  "product",
  "operations",
  "production",
  "delivery",
  "analytics",
  "data",
  "research",
  "users",
  "customers",
  "customer",
  "studio",
  "stakeholders",
  "frameworks",
  "languages",
]);

const JUNK_GAP_TOKENS = new Set([
  ...FILLER_KEYWORDS,
  "ability",
  "alongside",
  "around",
  "basis",
  "care",
  "casino",
  "colleagues",
  "communities",
  "community",
  "connecting",
  "connections",
  "daily",
  "deep",
  "deeply",
  "developing",
  "environment",
  "environments",
  "hybrid",
  "india",
  "bangalore",
  "scope",
  "scopely",
  "team",
  "teams",
  "world",
  "global",
  "player",
  "players",
  "mobile",
  "games",
  "gaming",
  "stronger",
  "relevant",
  "fit",
  "promising",
]);

const SKILL_CANONICAL_GROUPS: Record<string, string[]> = {
  "qa automation": [
    "qa automation",
    "automation testing",
    "test automation",
    "automation engineer",
    "automation tester",
    "automation frameworks",
  ],
  "quality assurance": [
    "quality assurance",
    "qa",
    "software testing",
    "platform quality",
    "quality analyst",
    "qa analyst",
    "quality engineering",
  ],
  "manual testing": [
    "manual testing",
    "functional testing",
    "functional tester",
    "exploratory testing",
    "regression testing",
  ],
  "test planning": [
    "test plans",
    "test plan",
    "test cases",
    "test case",
    "test strategy",
    "testing strategy",
    "acceptance criteria",
    "risk based testing",
    "risk-based testing",
    "validation approaches",
  ],
  "bug investigation": [
    "bug triage",
    "bug tracking",
    "defect tracking",
    "defect leakage",
    "reproduction steps",
    "logs",
    "screenshots",
    "bug reporting",
    "cycle time",
    "live issues",
  ],
  "agile delivery": ["agile", "scrum", "sprint planning", "standups", "retrospectives"],
  "api testing": ["api testing", "rest api", "graphql"],
  sql: ["sql", "postgres", "postgresql", "mysql"],
  cloud: ["aws", "azure", "gcp", "cloud engineer", "cloud infrastructure"],
  "ci/cd": ["ci/cd", "github actions", "release management", "release planning"],
  "software engineering": [
    "software engineering",
    "software development",
    "application development",
    "microservices",
    "distributed systems",
  ],
  "game engineering": [
    "unity",
    "unity 3d",
    "unreal engine",
    "unreal",
    "blueprints",
    "rendering",
    "physics",
    "multiplayer",
    "profiling",
  ],
  "c#": ["c#", "c sharp"],
  "c++": ["c++", "cpp"],
  ".net": [".net", "dotnet", "asp.net"],
  "wpf": ["wpf", "windows presentation foundation"],
  "winforms": ["winforms", "windows forms"],
  "qt": ["qt", "qt framework"],
  "oop": ["oop", "object oriented programming", "object-oriented programming"],
  "design patterns": ["design patterns"],
  "tools development": [
    "tool development",
    "tools development",
    "tools programming",
    "tooling",
    "engine tools",
    "editor tools",
    "world editor",
    "performance tools",
    "content pipelines",
    "asset pipelines",
  ],
  "ui frameworks": ["ui frameworks", "wpf", "winforms", "qt"],
  "programming languages": [
    "javascript",
    "typescript",
    "python",
    "java",
    "c#",
    "c++",
    "go",
    "golang",
    "rust",
    "swift",
    "kotlin",
  ],
  frontend: ["react", "next.js", "nextjs", "design systems", "accessibility"],
  backend: ["node", "node.js", "express", "nestjs", "rest api", "graphql", "grpc"],
  "game systems": ["gameplay systems", "systems design", "level design", "economy design"],
  "design research": [
    "user research",
    "wireframing",
    "prototyping",
    "interaction design",
    "usability testing",
    "journey mapping",
  ],
  "product design": ["product design", "ux", "ui", "visual design", "figma", "sketch"],
  "art production": [
    "3d modeling",
    "rigging",
    "animation",
    "vfx",
    "maya",
    "blender",
    "houdini",
    "technical art",
    "shader development",
    "substance painter",
  ],
  "production planning": [
    "production planning",
    "roadmapping",
    "stakeholder management",
    "project management",
    "program management",
    "delivery management",
    "milestone planning",
  ],
  "data analytics": [
    "data analysis",
    "analytics",
    "business intelligence",
    "dashboarding",
    "tableau",
    "power bi",
    "looker",
    "data visualization",
    "experimentation",
  ],
  "support operations": [
    "customer support",
    "player support",
    "community management",
    "ticket triage",
    "incident management",
    "zendesk",
    "salesforce",
    "knowledge base",
  ],
};

const JOB_SIGNAL_PATTERNS = [
  "qa",
  "quality assurance",
  "quality analyst",
  "quality engineering",
  "software testing",
  "manual testing",
  "automation testing",
  "test automation",
  "automation frameworks",
  "test plans",
  "test cases",
  "test strategy",
  "risk based testing",
  "risk-based testing",
  "acceptance criteria",
  "jira",
  "bug triage",
  "bug tracking",
  "defect leakage",
  "cycle time",
  "live issues",
  "risk assessment",
  "go/no-go decisions",
  "cross functional collaboration",
  "stakeholder management",
  "team leadership",
  "mentoring",
  "upskilling",
  "cross pod coordination",
  "cross-pod coordination",
  "player-first mindset",
  "qa partners",
  "offshore qa teams",
  "automation frameworks",
  "software engineering",
  "software development",
  "tool development",
  "tools development",
  "tools programming",
  "engine tools",
  "editor tools",
  "world editor",
  "performance tools",
  "content pipelines",
  "asset pipelines",
  "ui frameworks",
  "wpf",
  "winforms",
  "qt",
  "oop",
  "object oriented programming",
  "object-oriented programming",
  "design patterns",
  ".net",
  "asp.net",
  "application development",
  "unity",
  "unity 3d",
  "unreal engine",
  "unreal",
  "blueprints",
  "rendering",
  "physics",
  "multiplayer",
  "profiling",
  "performance optimization",
  "memory optimization",
  "build systems",
  "build pipelines",
  "release engineering",
  "release pipelines",
  "devops",
  "site reliability",
  "cloud infrastructure",
  "incident response",
  "observability",
  "monitoring",
  "terraform",
  "kubernetes",
  "docker",
  "linux systems",
  "sql",
  "tableau",
  "power bi",
  "looker",
  "dashboarding",
  "data visualization",
  "analytics",
  "business intelligence",
  "user research",
  "interaction design",
  "visual design",
  "design systems",
  "usability testing",
  "wireframing",
  "prototyping",
  "accessibility",
  "technical design",
  "systems design",
  "combat design",
  "economy design",
  "quest design",
  "mission design",
  "technical art",
  "shader development",
  "material authoring",
  "environment art",
  "character art",
  "concept art",
  "ui art",
  "3d modeling",
  "rigging",
  "animation",
  "vfx",
  "maya",
  "blender",
  "houdini",
  "production planning",
  "delivery management",
  "program management",
  "project management",
  "milestone planning",
  "dependency management",
  "product strategy",
  "product analytics",
  "customer support",
  "player support",
  "community management",
  "ticket triage",
  "incident management",
  "knowledge base",
  "zendesk",
  "rest api",
  "graphql",
  "selenium",
  "playwright",
  "cypress",
  "unity",
  "unreal engine",
  "live ops",
  "metrics dashboards",
  "quality metrics",
];

const GENERIC_SUPPORT_TOKENS = new Set([
  ...GENERIC_TITLE_PHRASES,
  "lead",
  "senior",
  "junior",
  "manager",
  "staff",
  "principal",
  "contract",
  "full",
  "time",
  "part",
  "remote",
  "hybrid",
  "onsite",
  "site",
  "level",
]);

const WEAK_STANDALONE_SIGNALS = new Set(["frameworks", "languages", "programming"]);

function getFamilyKeywordHints(families: Set<RoleFamily>): string[] {
  const hints: string[] = [];
  for (const family of families) hints.push(...ROLE_FAMILY_KEYWORD_HINTS[family]);
  return uniqueStrings(hints.map(normalizeKeywordText).filter(Boolean));
}

function buildKeywordSupportPool(values: string[], families: Set<RoleFamily>): Set<string> {
  const pool = buildCanonicalSignalSet(values);
  const sourceValues = uniqueStrings(
    [...values.map(normalizeKeywordText), ...getFamilyKeywordHints(families)].filter(Boolean),
  );

  for (const value of sourceValues) {
    const normalizedValue = normalizeKeywordText(value);
    if (!normalizedValue) continue;

    pool.add(normalizedValue);
    pool.add(canonicalizeSkill(normalizedValue));

    const tokens = tokenizePhrase(normalizedValue).filter(
      (token) => token.length >= 2 && !GENERIC_SUPPORT_TOKENS.has(token),
    );

    for (const token of tokens) pool.add(token);

    for (let index = 0; index < tokens.length - 1; index += 1) {
      const bigram = `${tokens[index]} ${tokens[index + 1]}`.trim();
      if (bigram && !GENERIC_SUPPORT_TOKENS.has(bigram)) pool.add(bigram);
    }
  }

  return pool;
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function normalizeTitleText(value: string): string {
  return normalize(value)
    .replace(/&/g, " and ")
    .replace(/\bfullstack\b/g, "full stack")
    .replace(/\bfront-end\b/g, "front end")
    .replace(/\bback-end\b/g, "back end")
    .replace(/[._/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywordText(value: string): string {
  return normalizeTitleText(value)
    .replace(/[^a-z0-9+\s#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalizedValue = value.trim();
    if (!normalizedValue || seen.has(normalizedValue)) continue;
    seen.add(normalizedValue);
    out.push(normalizedValue);
  }
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createLoosePhrasePattern(value: string): RegExp {
  const normalizedValue = normalizeTitleText(value);
  const escaped = escapeRegex(normalizedValue).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function includesPhrase(text: string, phrase: string): boolean {
  return createLoosePhrasePattern(phrase).test(normalizeTitleText(text));
}

function isGenericTitlePhrase(value: string): boolean {
  return GENERIC_TITLE_PHRASES.has(normalizeTitleText(value));
}

function getTitleFamilies(texts: string[]): Set<RoleFamily> {
  const families = new Set<RoleFamily>();
  for (const rawText of texts) {
    const text = normalizeTitleText(rawText);
    if (!text) continue;
    for (const family of Object.keys(ROLE_FAMILY_DEFINITIONS) as RoleFamily[]) {
      if (ROLE_FAMILY_DEFINITIONS[family].aliases.some((phrase) => includesPhrase(text, phrase))) {
        families.add(family);
      }
    }
  }
  return families;
}

function getBridgeFamilies(families: Set<RoleFamily>): Set<RoleFamily> {
  const bridged = new Set<RoleFamily>();
  for (const family of families) {
    for (const bridge of ROLE_FAMILY_DEFINITIONS[family].bridges) bridged.add(bridge);
  }
  return bridged;
}

function getRoleNouns(text: string): Set<string> {
  const normalizedText = normalizeTitleText(text);
  const nouns = new Set<string>();
  for (const noun of ROLE_NOUNS) {
    if (includesPhrase(normalizedText, noun)) nouns.add(noun);
  }
  return nouns;
}

function tokenizePhrase(value: string): string[] {
  return normalizeKeywordText(value)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !FILLER_KEYWORDS.has(part));
}

function canonicalizeSkill(value: string): string {
  const normalizedValue = normalizeKeywordText(value);
  for (const [canonical, variants] of Object.entries(SKILL_CANONICAL_GROUPS)) {
    if (
      normalizedValue === canonical ||
      variants.some((variant) => includesPhrase(normalizedValue, variant))
    ) {
      return canonical;
    }
  }
  return normalizedValue;
}

function buildCanonicalSignalSet(values: string[]): Set<string> {
  const signals = new Set<string>();
  for (const value of values) {
    const normalizedValue = normalizeKeywordText(value);
    if (!normalizedValue) continue;
    signals.add(canonicalizeSkill(normalizedValue));
    signals.add(normalizedValue);
  }
  return signals;
}

function phraseSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenizePhrase(left));
  const rightTokens = new Set(tokenizePhrase(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function buildJobSourceText(job: JobForScoring): string {
  return [
    job.title,
    job.titleNormalized ?? "",
    job.description ?? "",
    job.requirementsText ?? "",
    job.responsibilitiesText ?? "",
  ]
    .join("\n")
    .trim();
}

function isWeakStandaloneSignal(value: string): boolean {
  const normalizedValue = normalizeKeywordText(value);
  return WEAK_STANDALONE_SIGNALS.has(normalizedValue);
}

function isClearlyJunkSignal(value: string, job: JobForScoring): boolean {
  const normalizedValue = normalizeKeywordText(value);
  if (!normalizedValue) return true;
  if (normalizedValue.length < 3 || normalizedValue.length > 60) return true;
  if (/^\d+([.+-]\d+)?$/.test(normalizedValue)) return true;
  if (/^\d{4}$/.test(normalizedValue)) return true;
  if (!/[a-z]/.test(normalizedValue)) return true;
  if (JUNK_GAP_TOKENS.has(normalizedValue)) return true;
  if (isWeakStandaloneSignal(normalizedValue)) return true;

  const title = normalizeKeywordText(job.title);
  const company = normalizeKeywordText(job.company);
  const companyNormalized = normalizeKeywordText(job.companyNormalized ?? "");
  const location = normalizeKeywordText(job.location ?? "");
  const locationNormalized = normalizeKeywordText(job.locationNormalized ?? "");
  const remote = normalizeKeywordText(job.remoteType ?? "");
  const seniority = normalizeKeywordText(job.seniority ?? "");

  if (
    normalizedValue === title ||
    normalizedValue === company ||
    normalizedValue === companyNormalized ||
    normalizedValue === location ||
    normalizedValue === locationNormalized ||
    normalizedValue === remote ||
    normalizedValue === seniority
  ) {
    return true;
  }

  const tokens = tokenizePhrase(normalizedValue);
  if (!tokens.length) return true;
  if (tokens.every((token) => JUNK_GAP_TOKENS.has(token))) return true;

  return false;
}

function extractPatternHits(text: string, patterns: string[]): string[] {
  const normalizedText = normalizeKeywordText(text);
  const hits = new Set<string>();

  for (const pattern of patterns) {
    if (includesPhrase(normalizedText, pattern)) {
      hits.add(canonicalizeSkill(pattern));
    }
  }

  return Array.from(hits);
}

function deriveLiveJobSignals(job: JobForScoring): { skills: string[]; keywords: string[] } {
  const sourceText = buildJobSourceText(job);
  if (!sourceText) return { skills: [], keywords: [] };

  const titleFamilies = getTitleFamilies([job.title, job.titleNormalized ?? ""]);
  const familyHints = getFamilyKeywordHints(titleFamilies);
  const patternHits = extractPatternHits(sourceText, JOB_SIGNAL_PATTERNS);

  const storedSkillCandidates = ensureStringArray(job.skills)
    .map(normalizeKeywordText)
    .filter(Boolean);

  const storedKeywordCandidates = ensureStringArray(job.keywords)
    .map(normalizeKeywordText)
    .filter(Boolean);

  const liveSkills = uniqueStrings(
    [...storedSkillCandidates, ...patternHits]
      .map(canonicalizeSkill)
      .filter((value) => !isClearlyJunkSignal(value, job)),
  );

  const liveKeywords = uniqueStrings(
    [
      ...storedKeywordCandidates,
      ...patternHits,
      ...familyHints,
      job.title,
      job.titleNormalized ?? "",
      job.seniority ?? "",
    ]
      .map(normalizeKeywordText)
      .map(canonicalizeSkill)
      .filter((value) => !isClearlyJunkSignal(value, job)),
  );

  return { skills: liveSkills, keywords: liveKeywords };
}

function isMeaningfulKeyword(keyword: string, job: JobForScoring, jobSkillSet: Set<string>): boolean {
  const normalizedKeyword = normalizeKeywordText(keyword);
  if (isClearlyJunkSignal(normalizedKeyword, job)) return false;
  if (jobSkillSet.has(normalizedKeyword) || jobSkillSet.has(canonicalizeSkill(normalizedKeyword))) {
    return false;
  }
  return true;
}

function isUsefulGapSignal(value: string, job: JobForScoring): boolean {
  const normalizedValue = canonicalizeSkill(value);
  if (isClearlyJunkSignal(normalizedValue, job)) return false;

  const tokens = tokenizePhrase(normalizedValue);
  if (!tokens.length) return false;
  if (tokens.some((token) => JUNK_GAP_TOKENS.has(token))) return false;

  return (
    JOB_SIGNAL_PATTERNS.some((pattern) => includesPhrase(normalizedValue, pattern)) ||
    Object.keys(SKILL_CANONICAL_GROUPS).some((canonical) => includesPhrase(normalizedValue, canonical)) ||
    tokens.length >= 2 ||
    tokens.some((token) =>
      [
        "unity",
        "unreal",
        "terraform",
        "kubernetes",
        "docker",
        "figma",
        "maya",
        "blender",
        "houdini",
        "tableau",
        "looker",
        "zendesk",
      ].includes(token),
    )
  );
}

export function computeTitleScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const rawProfileTitles = uniqueStrings(profile.normalizedTitles.map(normalizeTitleText).filter(Boolean));
  const profileTitles = rawProfileTitles.filter((title) => !isGenericTitlePhrase(title));
  const jobTitles = uniqueStrings([job.titleNormalized ?? "", job.title].map(normalizeTitleText).filter(Boolean));

  if (!jobTitles.length || !rawProfileTitles.length) return 0;

  const exactSourceTitles = profileTitles.length > 0 ? profileTitles : rawProfileTitles;

  if (exactSourceTitles.some((title) => jobTitles.includes(title))) return TITLE_WEIGHT;

  if (
    exactSourceTitles.some((title) =>
      jobTitles.some(
        (jobTitle) =>
          !isGenericTitlePhrase(title) &&
          !isGenericTitlePhrase(jobTitle) &&
          (jobTitle.includes(title) || title.includes(jobTitle)),
      ),
    )
  ) {
    return Math.round(TITLE_WEIGHT * 0.84);
  }

  const profileFamilies = getTitleFamilies(rawProfileTitles);
  const jobFamilies = getTitleFamilies(jobTitles);
  const directOverlap = Array.from(profileFamilies).filter((family) => jobFamilies.has(family));

  const jobRoleNouns = new Set(jobTitles.flatMap((title) => Array.from(getRoleNouns(title))));
  const sharesRoleNoun = rawProfileTitles.some((title) => {
    const titleNouns = getRoleNouns(title);
    return Array.from(titleNouns).some((noun) => jobRoleNouns.has(noun));
  });

  if (directOverlap.length > 0) {
    if (directOverlap.length >= 2 || sharesRoleNoun) return Math.round(TITLE_WEIGHT * 0.72);
    return Math.round(TITLE_WEIGHT * 0.6);
  }

  const profileBridges = getBridgeFamilies(profileFamilies);
  const jobBridges = getBridgeFamilies(jobFamilies);
  const bridgedOverlap = Array.from(profileFamilies).filter((family) => jobBridges.has(family)).concat(
    Array.from(jobFamilies).filter((family) => profileBridges.has(family)),
  );

  if (bridgedOverlap.length > 0) {
    if (sharesRoleNoun) return Math.round(TITLE_WEIGHT * 0.44);
    return Math.round(TITLE_WEIGHT * 0.32);
  }

  return 0;
}

export function computeSkillScore(
  profile: ResumeProfileInput,
  job: JobForScoring,
): { score: number; matching: string[]; missing: string[] } {
  const profileSignalPool = buildCanonicalSignalSet([
    ...profile.normalizedSkills,
    ...(profile.keywords ?? []),
    ...profile.normalizedTitles,
    profile.summary ?? "",
  ]);

  const liveSignals = deriveLiveJobSignals(job);
  const jobSkills = uniqueStrings(liveSignals.skills);

  if (!jobSkills.length) {
    return { score: Math.round(SKILL_WEIGHT * 0.45), matching: [], missing: [] };
  }

  const matching = new Set<string>();
  const missing: string[] = [];
  let exactMatches = 0;
  let relatedMatches = 0;

  for (const jobSkill of jobSkills) {
    const canonicalSkill = canonicalizeSkill(jobSkill);

    if (profileSignalPool.has(canonicalSkill) || profileSignalPool.has(jobSkill)) {
      matching.add(jobSkill);
      exactMatches += 1;
      continue;
    }

    const hasRelatedMatch = Array.from(profileSignalPool).some((signal) => {
      if (!signal || signal.length < 3) return false;
      return phraseSimilarity(signal, jobSkill) >= 0.67;
    });

    if (hasRelatedMatch) {
      matching.add(jobSkill);
      relatedMatches += 1;
      continue;
    }

    if (isUsefulGapSignal(jobSkill, job)) missing.push(jobSkill);
  }

  if (exactMatches === 0 && relatedMatches === 0) {
    return {
      score: 0,
      matching: [],
      missing: uniqueStrings(missing).slice(0, 8),
    };
  }

  const effectiveMatches = exactMatches + relatedMatches * 0.6;
  const ratio = Math.max(0, Math.min(1, effectiveMatches / Math.max(1, jobSkills.length)));
  const baseFloor = exactMatches > 0 ? 6 : 3;
  const score = Math.min(
    SKILL_WEIGHT,
    Math.round(baseFloor + (SKILL_WEIGHT - baseFloor) * Math.sqrt(ratio)),
  );

  return {
    score,
    matching: uniqueStrings(Array.from(matching)).sort().slice(0, 8),
    missing: uniqueStrings(missing).sort().slice(0, 8),
  };
}

export function normalizeSeniorityKey(value?: string | null): SeniorityKey | null {
  if (!value) return null;

  const normalizedValue = normalize(value).replace(/[._-]+/g, " ");
  if (
    !normalizedValue ||
    normalizedValue === "unknown" ||
    normalizedValue === "n/a" ||
    normalizedValue === "na" ||
    normalizedValue === "none"
  ) {
    return null;
  }

  for (const entry of SENIORITY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalizedValue))) return entry.key;
  }

  return null;
}

export function seniorityRank(value?: string | null): number | null {
  const key = normalizeSeniorityKey(value);
  return key ? SENIORITY_RANK[key] : null;
}

export function computeSeniorityScore(profile: ResumeProfileInput, job: JobForScoring): number {
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

export function computeKeywordScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const profileFamilies = getTitleFamilies(profile.normalizedTitles);
  const jobFamilies = getTitleFamilies([job.titleNormalized ?? "", job.title].filter(Boolean));

  const profileKeywordPool = buildKeywordSupportPool(
    [...(profile.keywords ?? []), ...profile.normalizedSkills, ...profile.normalizedTitles, profile.summary ?? ""],
    profileFamilies,
  );

  const liveSignals = deriveLiveJobSignals(job);
  const jobSkillSet = new Set(liveSignals.skills.flatMap((skill) => [skill, canonicalizeSkill(skill)]));
  const rawJobKeywords = uniqueStrings(
    [...liveSignals.keywords, ...getFamilyKeywordHints(jobFamilies)]
      .map(normalizeKeywordText)
      .filter((keyword) => isMeaningfulKeyword(keyword, job, jobSkillSet)),
  );

  const directFamilyOverlap = Array.from(jobFamilies).filter((family) => profileFamilies.has(family)).length;
  const profileBridges = getBridgeFamilies(profileFamilies);
  const bridgedFamilyOverlap = Array.from(jobFamilies).filter(
    (family) => profileBridges.has(family) && !profileFamilies.has(family),
  ).length;

  if (!rawJobKeywords.length) {
    if (directFamilyOverlap > 0) return 5;
    if (bridgedFamilyOverlap > 0) return 2;
    return Math.round(KEYWORD_WEIGHT * 0.25);
  }

  let exactHits = 0;
  let relatedHits = 0;

  for (const keyword of rawJobKeywords) {
    const canonicalKeyword = canonicalizeSkill(keyword);

    if (profileKeywordPool.has(keyword) || profileKeywordPool.has(canonicalKeyword)) {
      exactHits += 1;
      continue;
    }

    const keywordFamilies = getTitleFamilies([keyword]);
    if (Array.from(keywordFamilies).some((family) => profileFamilies.has(family))) {
      relatedHits += 1;
      continue;
    }

    const hasRelatedMatch = Array.from(profileKeywordPool).some((signal) => {
      if (!signal || signal.length < 2) return false;
      return phraseSimilarity(signal, keyword) >= 0.5;
    });

    if (hasRelatedMatch) relatedHits += 1;
  }

  const familySupport = directFamilyOverlap * 1 + bridgedFamilyOverlap * 0.4;

  if (exactHits === 0 && relatedHits === 0 && familySupport === 0) return 0;

  const effectiveHits = exactHits + relatedHits * 0.6 + familySupport;
  const ratio = Math.max(0, Math.min(1, effectiveHits / Math.max(1, rawJobKeywords.length)));
  const baseFloor =
    directFamilyOverlap > 0
      ? 5
      : bridgedFamilyOverlap > 0
        ? 2
        : exactHits > 0
          ? 4
          : relatedHits > 0
            ? 2
            : 0;

  return Math.min(KEYWORD_WEIGHT, Math.round(baseFloor + (KEYWORD_WEIGHT - baseFloor) * Math.sqrt(ratio)));
}

export function computeLocationScore(profile: ResumeProfileInput, job: JobForScoring): number {
  const remoteType = (job.remoteType ?? "unknown").toLowerCase();
  if (remoteType === "remote") return LOCATION_WEIGHT;
  if (remoteType === "hybrid") return Math.round(LOCATION_WEIGHT * 0.7);

  const summary = normalize(profile.summary ?? "");
  const jobLocation = normalize(job.location ?? "");

  if (!jobLocation) return Math.round(LOCATION_WEIGHT * 0.5);
  if (summary.includes("remote")) return Math.round(LOCATION_WEIGHT * 0.6);
  if (summary.includes(jobLocation)) return LOCATION_WEIGHT;
  return Math.round(LOCATION_WEIGHT * 0.3);
}

export function buildShortReasons(args: {
  titleScore: number;
  skillScore: number;
  seniorityScore: number;
  keywordScore: number;
  locationScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  remoteType?: string | null;
}): string[] {
  const reasons: string[] = [];

  if (args.titleScore >= 18) reasons.push("Strong title fit");
  else if (args.titleScore >= 15) reasons.push("Relevant role family");

  if (args.skillScore >= 18 && args.matchingSkills.length) {
    reasons.push(`Skills match: ${args.matchingSkills.slice(0, 2).join(", ")}`);
  } else if (args.skillScore >= 10) {
    reasons.push("Relevant process/tool overlap");
  }

  if (args.remoteType === "remote") reasons.push("Remote-friendly");
  if (args.seniorityScore >= 12) reasons.push("Seniority aligned");
  if (args.keywordScore >= 6) reasons.push("Supporting keyword overlap");

  if (!reasons.length && args.missingSkills.length) {
    reasons.push(`Gap to close: ${args.missingSkills[0]}`);
  }

  return reasons.slice(0, 3);
}

export function buildExplanationShort(result: {
  totalScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  shortReasons: string[];
}): string {
  if (result.totalScore >= 80) {
    return `Strong fit. ${result.shortReasons.join(". ")}.`;
  }
  if (result.totalScore >= 60) {
    return `Promising fit with some gaps. ${result.shortReasons.join(". ")}.`;
  }
  if (result.shortReasons.length > 0) {
    return `Worth a look. ${result.shortReasons.join(". ")}.`;
  }
  if (result.missingSkills.length) {
    return `Partial match. Stronger alignment is possible if you address ${result.missingSkills
      .slice(0, 2)
      .join(" and ")}.`;
  }
  return "Partial match. Review this role before spending credits on tailoring.";
}

export function scoreResumeToJob(profile: ResumeProfileInput, job: JobForScoring): MatchResult {
  const titleScore = computeTitleScore(profile, job);
  const skillResult = computeSkillScore(profile, job);
  const seniorityScore = computeSeniorityScore(profile, job);
  const keywordScore = computeKeywordScore(profile, job);
  const locationScore = computeLocationScore(profile, job);

  const totalScore = Math.max(
    0,
    Math.min(100, titleScore + skillResult.score + seniorityScore + keywordScore + locationScore),
  );

  const shortReasons = buildShortReasons({
    titleScore,
    skillScore: skillResult.score,
    seniorityScore,
    keywordScore,
    locationScore,
    matchingSkills: skillResult.matching,
    missingSkills: skillResult.missing,
    remoteType: job.remoteType,
  });

  const explanationShort = buildExplanationShort({
    totalScore,
    matchingSkills: skillResult.matching,
    missingSkills: skillResult.missing,
    shortReasons,
  });

  return {
    totalScore,
    titleScore,
    skillScore: skillResult.score,
    seniorityScore,
    keywordScore,
    locationScore,
    matchingSkills: skillResult.matching,
    missingSkills: skillResult.missing,
    shortReasons,
    explanationShort,
  };
}
