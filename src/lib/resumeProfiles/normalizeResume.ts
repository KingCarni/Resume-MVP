import { SeniorityLevel } from "@prisma/client";

export type ResumeNormalizationInput = {
  title?: string | null;
  rawText?: string | null;
  summary?: string | null;
  skills?: string[];
  titles?: string[];
  certifications?: string[];
  industries?: string[];
  keywords?: string[];
  yearsExperience?: number | null;
  seniority?: string | null;
};

export type NormalizedResumeProfileData = {
  title: string | null;
  rawText: string | null;
  summary: string | null;
  normalizedSkills: string[];
  normalizedTitles: string[];
  certifications: string[];
  industries: string[];
  keywords: string[];
  yearsExperience: number | null;
  seniority: SeniorityLevel;
};

const KNOWN_SKILLS = [
  "selenium",
  "playwright",
  "cypress",
  "test automation",
  "qa automation",
  "automation testing",
  "manual testing",
  "regression testing",
  "integration testing",
  "unit testing",
  "end-to-end testing",
  "e2e testing",
  "exploratory testing",
  "performance testing",
  "accessibility testing",
  "api testing",
  "postman",
  "jira",
  "bug triage",
  "test plans",
  "test cases",
  "reproduction steps",
  "logs",
  "screenshots",
  "typescript",
  "javascript",
  "react",
  "next.js",
  "node.js",
  "python",
  "java",
  "c#",
  "c++",
  "php",
  "ruby",
  "sql",
  "postgresql",
  "mysql",
  "graphql",
  "rest",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "terraform",
  "linux",
  "ci/cd",
  "github actions",
  "unity",
  "unreal engine",
  "gameplay systems",
  "system design",
  "level design",
  "combat design",
  "economy design",
  "live ops",
  "monetization",
  "balancing",
  "wireframing",
  "prototyping",
  "figma",
  "user research",
  "interaction design",
  "maya",
  "blender",
  "photoshop",
  "substance painter",
  "zbrush",
  "3d modeling",
  "rigging",
  "animation",
  "vfx",
  "production planning",
  "release management",
  "sprint planning",
  "scrum",
  "agile",
  "stakeholder management",
  "roadmapping",
];

const TITLE_PATTERNS = [
  "qa tester",
  "qa engineer",
  "qa analyst",
  "quality assurance tester",
  "quality assurance engineer",
  "quality assurance analyst",
  "test engineer",
  "test analyst",
  "sdet",
  "software tester",
  "manual tester",
  "functional tester",
  "gameplay qa",
  "automation tester",
  "test automation engineer",
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
  "product owner",
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
  "sre",
  "platform engineer",
  "cloud engineer",
  "infrastructure engineer",
  "build engineer",
  "release engineer",
  "build and release engineer",
  "support engineer",
  "technical support engineer",
  "application support engineer",
  "customer support specialist",
  "player support specialist",
  "community manager",
  "live operations specialist",
  "support analyst",
  "operations specialist",
];

const CERT_PATTERNS = [
  "istqb",
  "aws certified",
  "azure certified",
  "google cloud certified",
  "scrum master",
  "pmp",
];

const INDUSTRY_PATTERNS = [
  "saas",
  "fintech",
  "healthtech",
  "gaming",
  "game development",
  "ecommerce",
  "payroll",
  "hr tech",
  "developer tools",
  "enterprise software",
  "mobile games",
  "console games",
];

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue || seen.has(normalizedValue)) continue;
    seen.add(normalizedValue);
    out.push(normalizedValue);
  }

  return out;
}

function compactSentence(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createLoosePhrasePattern(value: string): RegExp {
  const normalizedValue = value.toLowerCase().trim().replace(/[._/]+/g, " ");
  const escaped = escapeRegex(normalizedValue).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function collectMatches(haystack: string, patterns: string[]): string[] {
  const found: string[] = [];

  for (const pattern of patterns) {
    if (createLoosePhrasePattern(pattern).test(haystack)) {
      found.push(pattern);
    }
  }

  return found.sort((left, right) => right.length - left.length);
}

function collectKeywordCandidates(haystack: string): string[] {
  const phrases =
    haystack.match(
      /\b[a-z][a-z0-9.+#/-]{2,}(?:\s+[a-z0-9.+#/-]{2,}){0,2}\b/gi,
    ) ?? [];
  const cleaned = phrases
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 3 && value.length <= 40)
    .filter(
      (value) =>
        !/^(the|and|with|from|that|this|have|using|used|built|work|worked|team|role|game|games)$/.test(
          value,
        ),
    );

  return uniqueStrings(cleaned).slice(0, 60);
}

function guessYearsExperience(
  text: string,
  explicitValue?: number | null,
): number | null {
  if (typeof explicitValue === "number" && Number.isFinite(explicitValue)) {
    return Math.max(0, Math.min(50, Math.floor(explicitValue)));
  }

  const explicitYearMatch = text.match(
    /\b(\d{1,2})\+?\s+years?\s+of\s+experience\b/i,
  );
  if (explicitYearMatch) {
    return Math.max(0, Math.min(50, Number(explicitYearMatch[1])));
  }

  const presentCount = (text.match(/\bpresent\b/gi) ?? []).length;
  if (presentCount >= 3) return 6;
  if (presentCount === 2) return 4;
  if (presentCount === 1) return 2;

  return null;
}

function guessSeniority(
  text: string,
  explicit?: string | null,
  yearsExperience?: number | null,
): SeniorityLevel {
  const lowered = explicit?.toLowerCase().trim();

  if (lowered === "entry") return SeniorityLevel.entry;
  if (lowered === "junior") return SeniorityLevel.junior;
  if (lowered === "mid") return SeniorityLevel.mid;
  if (lowered === "senior") return SeniorityLevel.senior;
  if (lowered === "lead") return SeniorityLevel.lead;
  if (lowered === "manager") return SeniorityLevel.manager;

  if (/\bmanager\b/i.test(text)) return SeniorityLevel.manager;
  if (/\bprincipal\b|\bstaff\b|\blead\b/i.test(text)) return SeniorityLevel.lead;
  if (/\bsenior\b/i.test(text)) return SeniorityLevel.senior;
  if (/\bjunior\b/i.test(text) || /\bentry[- ]level\b/i.test(text))
    return SeniorityLevel.junior;

  if ((yearsExperience ?? 0) >= 8) return SeniorityLevel.senior;
  if ((yearsExperience ?? 0) >= 4) return SeniorityLevel.mid;
  if ((yearsExperience ?? 0) >= 1) return SeniorityLevel.junior;

  return SeniorityLevel.entry;
}

function derivePrimaryTitle(
  explicitTitle?: string | null,
  normalizedTitles?: string[],
): string | null {
  if (explicitTitle?.trim()) return explicitTitle.trim();
  if (normalizedTitles && normalizedTitles.length > 0) {
    return normalizedTitles[0]
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return null;
}

export function normalizeResumeProfile(
  input: ResumeNormalizationInput,
): NormalizedResumeProfileData {
  const rawText = compactSentence(input.rawText);
  const summary = compactSentence(input.summary);
  const haystack = `${input.title ?? ""}\n${rawText ?? ""}\n${
    summary ?? ""
  }`.toLowerCase();

  const normalizedSkills = uniqueStrings([
    ...(input.skills ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, KNOWN_SKILLS),
  ]).slice(0, 80);

  const normalizedTitles = uniqueStrings([
    ...(input.titles ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, TITLE_PATTERNS),
  ]).slice(0, 40);

  const certifications = uniqueStrings([
    ...(input.certifications ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, CERT_PATTERNS),
  ]).slice(0, 20);

  const industries = uniqueStrings([
    ...(input.industries ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, INDUSTRY_PATTERNS),
  ]).slice(0, 20);

  const keywordSeed = uniqueStrings([
    ...(input.keywords ?? []).map((item) => item.toLowerCase()),
    ...normalizedSkills,
    ...normalizedTitles,
    ...certifications,
    ...industries,
    ...collectKeywordCandidates(haystack),
  ]).slice(0, 100);

  const yearsExperience = guessYearsExperience(haystack, input.yearsExperience);
  const seniority = guessSeniority(haystack, input.seniority, yearsExperience);
  const title = derivePrimaryTitle(input.title, normalizedTitles);

  return {
    title,
    rawText,
    summary,
    normalizedSkills,
    normalizedTitles,
    certifications,
    industries,
    keywords: keywordSeed,
    yearsExperience,
    seniority,
  };
}
