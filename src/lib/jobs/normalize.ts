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
  "react",
  "next.js",
  "nextjs",
  "python",
  "java",
  "c#",
  "c++",
  "cypress",
  "playwright",
  "selenium",
  "qa automation",
  "automation testing",
  "test automation",
  "manual testing",
  "regression testing",
  "integration testing",
  "unit testing",
  "exploratory testing",
  "functional testing",
  "api testing",
  "quality assurance",
  "quality analyst",
  "platform quality",
  "acceptance criteria",
  "test plans",
  "test plan",
  "test cases",
  "test case",
  "test strategy",
  "jira",
  "bug triage",
  "bug tracking",
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
  "git",
  "rest api",
  "graphql",
  "jest",
  "vitest",
  "linux",
  "ci/cd",
  "github actions",
  "unity",
  "unreal engine",
  "figma",
  "user research",
  "wireframing",
  "prototyping",
  "maya",
  "blender",
  "photoshop",
  "substance painter",
  "zbrush",
  "3d modeling",
  "rigging",
  "animation",
  "vfx",
  "live ops",
  "monetization",
  "economy design",
  "level design",
  "gameplay systems",
  "production planning",
  "release management",
  "release planning",
  "sprint planning",
  "scrum",
  "agile",
  "stakeholder management",
  "roadmapping",
];

const TITLE_SIGNAL_PATTERNS = [
  "qa tester",
  "qa engineer",
  "qa analyst",
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
  "gameplay programmer",
  "gameplay engineer",
  "engine programmer",
  "tools engineer",
  "frontend developer",
  "frontend engineer",
  "backend developer",
  "backend engineer",
  "full stack developer",
  "full stack engineer",
  "game designer",
  "systems designer",
  "level designer",
  "technical designer",
  "content designer",
  "product designer",
  "ux designer",
  "ui designer",
  "artist",
  "environment artist",
  "character artist",
  "concept artist",
  "technical artist",
  "vfx artist",
  "animator",
  "producer",
  "game producer",
  "associate producer",
  "project manager",
  "delivery manager",
  "product manager",
  "technical product manager",
  "program manager",
  "data analyst",
  "business analyst",
  "insights analyst",
  "data scientist",
  "analytics engineer",
  "devops engineer",
  "site reliability engineer",
  "platform engineer",
  "support engineer",
  "technical support engineer",
  "community manager",
];

const KEYWORD_SIGNAL_PATTERNS = [
  "quality assurance",
  "platform quality",
  "qa automation",
  "automation testing",
  "test automation",
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
  "bug triage",
  "bug tracking",
  "reproduction steps",
  "stakeholder management",
  "roadmapping",
  "production planning",
  "release management",
  "sprint planning",
  "user research",
  "interaction design",
  "visual design",
  "technical art",
  "3d modeling",
  "live ops",
  "economy design",
  "level design",
  "gameplay systems",
  "customer support",
  "community management",
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

export function inferSeniority(
  title: string,
  description?: string | null,
): string | null {
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

    if (bucket.length) {
      return bucket.join("\n");
    }
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
  const roleText = [
    job.title,
    job.description,
    job.requirementsText ?? "",
    job.responsibilitiesText ?? "",
  ].join("\n");

  for (const value of extractSkills(roleText)) keywords.add(value);
  for (const value of extractTitleSignals(roleText)) keywords.add(value);
  for (const value of extractKeywordSignals(roleText)) keywords.add(value);

  if (job.seniority) keywords.add(job.seniority);
  if (job.remoteType && job.remoteType !== "unknown") keywords.add(job.remoteType);
  if (job.location) keywords.add(slugifyJobText(job.location));
  keywords.add(slugifyJobText(job.title));
  keywords.add(slugifyJobText(job.company));

  return Array.from(keywords).sort();
}

export function normalizeJobInput(input: NormalizedJobInput) {
  const description = stripHtml(input.description.trim());
  const title = stripHtml(input.title.trim());
  const company = stripHtml(input.company.trim());
  const location = toNullableString(input.location ? stripHtml(input.location) : null);
  const remoteType =
    input.remoteType ??
    inferRemoteType([title, location ?? "", description].join(" "));
  const employmentType =
    input.employmentType ?? inferEmploymentType(description);
  const seniority =
    toNullableString(input.seniority) ?? inferSeniority(title, description);
  const requirementsText =
    toNullableString(input.requirementsText ? stripHtml(input.requirementsText) : null) ??
    extractSection(description, REQUIREMENTS_HEADERS);
  const responsibilitiesText =
    toNullableString(
      input.responsibilitiesText ? stripHtml(input.responsibilitiesText) : null,
    ) ?? extractSection(description, RESPONSIBILITIES_HEADERS);
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
