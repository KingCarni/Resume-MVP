import type {
  EmploymentType,
  NormalizedJobInput,
  RemoteType,
} from "@/lib/jobs/types";

const SENIORITY_PATTERNS_TITLE_FIRST: Array<{ label: string; pattern: RegExp }> = [
  { label: "intern", pattern: /\b(intern|internship|co-op|coop)\b/i },
  { label: "junior", pattern: /\b(junior|jr\.?|entry[- ]level|entry level)\b/i },
  { label: "mid", pattern: /\b(mid|intermediate|ii)\b/i },
  { label: "senior", pattern: /\b(senior|sr\.?|iii|staff)\b/i },
  { label: "lead", pattern: /\b(lead|principal|architect)\b/i },
  { label: "manager", pattern: /\b(manager|head|director)\b/i },
];

const DESCRIPTION_FALLBACK_SENIORITY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "intern", pattern: /\b(intern|internship|co-op|coop)\b/i },
  { label: "junior", pattern: /\b(junior|jr\.?|entry[- ]level|entry level)\b/i },
  { label: "mid", pattern: /\b(mid|intermediate|ii)\b/i },
  { label: "senior", pattern: /\b(senior|sr\.?|iii|staff)\b/i },
  { label: "lead", pattern: /\b(lead|principal)\b/i },
];

const SKILL_PATTERNS = [
  "javascript",
  "typescript",
  "node",
  "node.js",
  "react",
  "next.js",
  "nextjs",
  "python",
  "java",
  "c#",
  "c++",
  "unity",
  "unity 3d",
  "unreal engine",
  "unreal",
  "blueprints",
  "cpp",
  "go",
  "golang",
  "rust",
  "php",
  "dotnet",
  ".net",
  "asp.net",
  "wpf",
  "winforms",
  "windows forms",
  "qt",
  "qt framework",
  "oop",
  "object oriented programming",
  "object-oriented programming",
  "design patterns",
  "java spring",
  "spring boot",
  "express",
  "nestjs",
  "react native",
  "ios",
  "android",
  "swift",
  "kotlin",
  "scala",
  "lua",
  "cypress",
  "playwright",
  "selenium",
  "qa automation",
  "automation testing",
  "test automation",
  "automation frameworks",
  "manual testing",
  "regression testing",
  "integration testing",
  "unit testing",
  "exploratory testing",
  "functional testing",
  "api testing",
  "quality assurance",
  "quality analyst",
  "quality engineering",
  "platform quality",
  "acceptance criteria",
  "test plans",
  "test plan",
  "test cases",
  "test case",
  "test strategy",
  "risk based testing",
  "risk-based testing",
  "validation approaches",
  "jira",
  "bug triage",
  "bug tracking",
  "defect leakage",
  "cycle time",
  "live issues",
  "reproduction steps",
  "logs",
  "screenshots",
  "sql",
  "postgres",
  "mysql",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "terraform",
  "ansible",
  "helm",
  "jenkins",
  "gitlab ci",
  "circleci",
  "git",
  "rest api",
  "graphql",
  "grpc",
  "microservices",
  "distributed systems",
  "performance optimization",
  "memory optimization",
  "debugging",
  "profiling",
  "rendering",
  "physics",
  "networking",
  "multiplayer",
  "build pipelines",
  "build systems",
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
  "ui frameworks",
  "release engineering",
  "release pipelines",
  "devops",
  "site reliability",
  "incident response",
  "observability",
  "monitoring",
  "logging",
  "linux systems",
  "jest",
  "vitest",
  "linux",
  "ci/cd",
  "github actions",
  "figma",
  "sketch",
  "adobe xd",
  "user research",
  "wireframing",
  "prototyping",
  "interaction design",
  "visual design",
  "design systems",
  "usability testing",
  "information architecture",
  "accessibility",
  "a/b testing",
  "journey mapping",
  "player experience",
  "maya",
  "blender",
  "photoshop",
  "substance painter",
  "zbrush",
  "houdini",
  "after effects",
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
  "live ops",
  "monetization",
  "economy design",
  "level design",
  "gameplay systems",
  "systems design",
  "combat design",
  "quest design",
  "mission design",
  "technical design",
  "feature design",
  "content design",
  "production planning",
  "release management",
  "release planning",
  "sprint planning",
  "scrum",
  "agile",
  "stakeholder management",
  "roadmapping",
  "program management",
  "project management",
  "delivery management",
  "milestone planning",
  "dependency management",
  "backlog management",
  "product strategy",
  "go to market",
  "go-to-market",
  "product analytics",
  "sql reporting",
  "dashboarding",
  "tableau",
  "power bi",
  "looker",
  "data visualization",
  "experimentation",
  "etl",
  "data pipelines",
  "business intelligence",
  "kpi reporting",
  "customer support",
  "player support",
  "community management",
  "ticket triage",
  "incident management",
  "knowledge base",
  "crm",
  "zendesk",
  "salesforce",
  "team leadership",
  "mentoring",
  "cross functional collaboration",
  "cross-functional collaboration",
  "quality metrics",
  "metrics dashboards",
  "go/no-go decisions",
  "risk assessment",
];

const TITLE_SIGNAL_PATTERNS = [
  "qa tester",
  "qa engineer",
  "qa analyst",
  "qa lead",
  "quality analyst",
  "platform quality analyst",
  "platform qa analyst",
  "quality assurance engineer",
  "quality assurance tester",
  "quality assurance analyst",
  "quality engineer",
  "test engineer",
  "test analyst",
  "sdet",
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
  "frontend developer",
  "frontend engineer",
  "front end developer",
  "front end engineer",
  "backend developer",
  "backend engineer",
  "full stack developer",
  "full stack engineer",
  "fullstack developer",
  "fullstack engineer",
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
  "devops engineer",
  "site reliability engineer",
  "platform engineer",
  "cloud engineer",
  "infrastructure engineer",
  "build engineer",
  "release engineer",
  "build and release engineer",
  "ci cd engineer",
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
];

const KEYWORD_SIGNAL_PATTERNS = [
  "quality assurance",
  "quality engineering",
  "platform quality",
  "qa automation",
  "automation testing",
  "test automation",
  "automation frameworks",
  "manual testing",
  "regression testing",
  "integration testing",
  "unit testing",
  "exploratory testing",
  "functional testing",
  "acceptance criteria",
  "test plans",
  "test cases",
  "test strategy",
  "risk based testing",
  "risk-based testing",
  "bug triage",
  "bug tracking",
  "defect leakage",
  "cycle time",
  "risk assessment",
  "go/no-go decisions",
  "stakeholder management",
  "roadmapping",
  "production planning",
  "release management",
  "sprint planning",
  "team leadership",
  "mentoring",
  "upskilling",
  "cross functional collaboration",
  "cross-functional collaboration",
  "quality metrics",
  "metrics dashboards",
  "software engineering",
  "software development",
  "application development",
  "gameplay systems",
  "engine development",
  "tools programming",
  "tool development",
  "tools development",
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
  "java",
  "c#",
  "c++",
  ".net",
  "asp.net",
  "unity",
  "build systems",
  "build pipelines",
  "release engineering",
  "platform operations",
  "cloud infrastructure",
  "devops",
  "site reliability",
  "incident response",
  "observability",
  "monitoring",
  "product design",
  "user research",
  "interaction design",
  "visual design",
  "design systems",
  "usability testing",
  "technical design",
  "technical art",
  "3d modeling",
  "shader development",
  "live ops",
  "economy design",
  "level design",
  "systems design",
  "production planning",
  "delivery management",
  "program management",
  "project management",
  "product strategy",
  "product analytics",
  "data analysis",
  "analytics",
  "business intelligence",
  "data visualization",
  "dashboarding",
  "customer support",
  "community management",
  "player support",
  "ticket triage",
];

const REQUIREMENTS_HEADERS = [
  "requirements",
  "qualifications",
  "what you bring",
  "what we're looking for",
  "must have",
];

const RESPONSIBILITIES_HEADERS = [
  "responsibilities",
  "what you'll do",
  "what you will do",
  "day to day",
  "about the role",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createLoosePhrasePattern(value: string): RegExp {
  const normalizedValue = value.toLowerCase().trim().replace(/[._/]+/g, " ");
  const escaped = escapeRegex(normalizedValue).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function slugifyJobText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+.#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRemoteType(input: string): RemoteType {
  if (/\bremote\b/i.test(input)) return "remote";
  if (/\bhybrid\b/i.test(input)) return "hybrid";
  if (/\b(on[- ]site|onsite|in office)\b/i.test(input)) return "onsite";
  return "unknown";
}

export function inferEmploymentType(input: string): EmploymentType {
  if (/\bfull[- ]time\b/i.test(input)) return "full_time";
  if (/\bpart[- ]time\b/i.test(input)) return "part_time";
  if (/\bcontract\b/i.test(input)) return "contract";
  if (/\btemporary|temp\b/i.test(input)) return "temporary";
  if (/\bintern(ship)?|co-?op\b/i.test(input)) return "internship";
  if (/\bfreelance\b/i.test(input)) return "freelance";
  return "unknown";
}

function inferSeniorityFromText(
  text: string,
  patterns: Array<{ label: string; pattern: RegExp }>,
): string | null {
  for (const item of patterns) {
    if (item.pattern.test(text)) return item.label;
  }
  return null;
}

export function inferSeniority(title: string, description?: string | null): string | null {
  const titleHit = inferSeniorityFromText(title, SENIORITY_PATTERNS_TITLE_FIRST);
  if (titleHit) return titleHit;

  if (!description) return null;

  const cleanedDescription = stripHtml(description);
  const earlyWindow = cleanedDescription.slice(0, 420);
  return inferSeniorityFromText(earlyWindow, DESCRIPTION_FALLBACK_SENIORITY_PATTERNS);
}

export function extractSkills(input: string): string[] {
  const normalized = input.toLowerCase();
  const hits = new Set<string>();

  for (const skill of SKILL_PATTERNS) {
    if (createLoosePhrasePattern(skill).test(normalized)) {
      hits.add(skill === "nextjs" ? "next.js" : skill);
    }
  }

  return Array.from(hits).sort();
}

function extractTitleSignals(input: string): string[] {
  const normalized = input.toLowerCase();
  const hits = new Set<string>();

  for (const title of TITLE_SIGNAL_PATTERNS) {
    if (createLoosePhrasePattern(title).test(normalized)) {
      hits.add(title);
    }
  }

  return Array.from(hits).sort();
}

function extractKeywordSignals(input: string): string[] {
  const normalized = input.toLowerCase();
  const hits = new Set<string>();

  for (const phrase of KEYWORD_SIGNAL_PATTERNS) {
    if (createLoosePhrasePattern(phrase).test(normalized)) {
      hits.add(phrase);
    }
  }

  return Array.from(hits).sort();
}

function extractSection(description: string, headers: string[]): string | null {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].toLowerCase();
    if (!headers.some((header) => line.includes(header))) continue;

    const bucket: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j];
      const lower = candidate.toLowerCase();
      const isLikelyNextHeader =
        REQUIREMENTS_HEADERS.some((header) => lower.includes(header)) ||
        RESPONSIBILITIES_HEADERS.some((header) => lower.includes(header));

      if (isLikelyNextHeader) break;
      bucket.push(candidate);
    }

    if (bucket.length) return bucket.join("\n");
  }

  return null;
}

function normalizePostedAt(postedAt?: string | Date | null): Date | null {
  if (!postedAt) return null;
  const date = postedAt instanceof Date ? postedAt : new Date(postedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNullableString(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildJobKeywords(job: {
  title: string;
  company: string;
  location?: string | null;
  description: string;
  seniority?: string | null;
  remoteType?: RemoteType;
  requirementsText?: string | null;
  responsibilitiesText?: string | null;
}): string[] {
  const keywords = new Set<string>();
  const roleText = [job.title, job.description, job.requirementsText ?? "", job.responsibilitiesText ?? ""].join("\n");

  for (const value of extractSkills(roleText)) keywords.add(value);
  for (const value of extractTitleSignals(roleText)) keywords.add(value);
  for (const value of extractKeywordSignals(roleText)) keywords.add(value);

  if (job.seniority) keywords.add(job.seniority);
  if (job.remoteType && job.remoteType !== "unknown") keywords.add(job.remoteType);
  keywords.add(slugifyJobText(job.title));

  return Array.from(keywords).sort();
}

export function normalizeJobInput(input: NormalizedJobInput) {
  const description = stripHtml(input.description.trim());
  const title = stripHtml(input.title.trim());
  const company = stripHtml(input.company.trim());
  const location = toNullableString(input.location ? stripHtml(input.location) : null);
  const remoteType = input.remoteType ?? inferRemoteType([title, location ?? "", description].join(" "));
  const employmentType = input.employmentType ?? inferEmploymentType(description);
  const seniority = toNullableString(input.seniority) ?? inferSeniority(title, description);
  const requirementsText =
    toNullableString(input.requirementsText ? stripHtml(input.requirementsText) : null) ??
    extractSection(description, REQUIREMENTS_HEADERS);
  const responsibilitiesText =
    toNullableString(input.responsibilitiesText ? stripHtml(input.responsibilitiesText) : null) ??
    extractSection(description, RESPONSIBILITIES_HEADERS);
  const roleTextForSignals = [title, description, requirementsText ?? "", responsibilitiesText ?? ""].join("\n");
  const skills = extractSkills(roleTextForSignals);
  const keywords = buildJobKeywords({
    title,
    company,
    location,
    description,
    seniority,
    remoteType,
    requirementsText,
    responsibilitiesText,
  });

  return {
    sourceSlug: input.sourceSlug,
    externalId: toNullableString(input.externalId),
    title,
    titleNormalized: slugifyJobText(title),
    company,
    companyNormalized: slugifyJobText(company),
    location,
    locationNormalized: location ? slugifyJobText(location) : null,
    remoteType,
    employmentType,
    seniority,
    description,
    requirementsText,
    responsibilitiesText,
    skills,
    keywords,
    postedAt: normalizePostedAt(input.postedAt),
    applyUrl: toNullableString(input.applyUrl),
    sourceUrl: toNullableString(input.sourceUrl),
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: toNullableString(input.salaryCurrency) ?? "CAD",
    rawPayload: input.rawPayload ?? input,
  };
}
