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

type CanonicalPattern = {
  canonical: string;
  aliases: string[];
};

const SKILL_PATTERNS: CanonicalPattern[] = [
  { canonical: "c#", aliases: ["c#", "c sharp"] },
  { canonical: "c++", aliases: ["c++", "cpp"] },
  { canonical: ".net", aliases: [".net", "dotnet", "asp.net", "asp net", ".net core", "dotnet core"] },
  { canonical: "typescript", aliases: ["typescript", "ts"] },
  { canonical: "javascript", aliases: ["javascript", "js", "ecmascript"] },
  { canonical: "react", aliases: ["react", "react.js", "reactjs"] },
  { canonical: "next.js", aliases: ["next.js", "nextjs"] },
  { canonical: "node.js", aliases: ["node.js", "nodejs", "node js"] },
  { canonical: "python", aliases: ["python"] },
  { canonical: "java", aliases: ["java"] },
  { canonical: "php", aliases: ["php"] },
  { canonical: "ruby", aliases: ["ruby"] },
  { canonical: "sql", aliases: ["sql", "t-sql", "tsql"] },
  { canonical: "postgresql", aliases: ["postgresql", "postgres", "postgre sql"] },
  { canonical: "mysql", aliases: ["mysql", "my sql"] },
  { canonical: "graphql", aliases: ["graphql", "graph ql"] },
  { canonical: "rest", aliases: ["rest", "restful", "rest api", "restful api", "restful apis", "rest apis"] },
  { canonical: "microservices", aliases: ["microservices", "microservice", "service oriented architecture"] },
  { canonical: "ecs", aliases: ["ecs", "entity component system", "entity-component-system"] },
  { canonical: "aws", aliases: ["aws", "amazon web services"] },
  { canonical: "azure", aliases: ["azure", "microsoft azure"] },
  { canonical: "gcp", aliases: ["gcp", "google cloud", "google cloud platform"] },
  { canonical: "docker", aliases: ["docker"] },
  { canonical: "kubernetes", aliases: ["kubernetes", "k8s"] },
  { canonical: "terraform", aliases: ["terraform"] },
  { canonical: "linux", aliases: ["linux"] },
  { canonical: "ci/cd", aliases: ["ci/cd", "cicd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"] },
  { canonical: "github actions", aliases: ["github actions"] },
  { canonical: "jenkins", aliases: ["jenkins"] },
  { canonical: "jira", aliases: ["jira"] },
  { canonical: "confluence", aliases: ["confluence"] },
  { canonical: "selenium", aliases: ["selenium"] },
  { canonical: "playwright", aliases: ["playwright"] },
  { canonical: "cypress", aliases: ["cypress"] },
  { canonical: "postman", aliases: ["postman"] },
  { canonical: "test automation", aliases: ["test automation", "qa automation", "automated testing", "automation testing"] },
  { canonical: "manual testing", aliases: ["manual testing"] },
  { canonical: "regression testing", aliases: ["regression testing"] },
  { canonical: "integration testing", aliases: ["integration testing"] },
  { canonical: "unit testing", aliases: ["unit testing", "unit tests", "unit test"] },
  { canonical: "end-to-end testing", aliases: ["end-to-end testing", "end to end testing", "e2e testing", "e2e"] },
  { canonical: "exploratory testing", aliases: ["exploratory testing"] },
  { canonical: "performance testing", aliases: ["performance testing", "load testing"] },
  { canonical: "accessibility testing", aliases: ["accessibility testing"] },
  { canonical: "api testing", aliases: ["api testing"] },
  { canonical: "bug triage", aliases: ["bug triage"] },
  { canonical: "test plans", aliases: ["test plans", "test plan"] },
  { canonical: "test cases", aliases: ["test cases", "test case"] },
  { canonical: "reproduction steps", aliases: ["reproduction steps"] },
  { canonical: "logs", aliases: ["logs", "log analysis"] },
  { canonical: "screenshots", aliases: ["screenshots"] },
  { canonical: "unity", aliases: ["unity", "unity3d"] },
  { canonical: "unreal engine", aliases: ["unreal engine", "unreal"] },
  { canonical: "gameplay systems", aliases: ["gameplay systems", "game systems"] },
  { canonical: "system design", aliases: ["system design"] },
  { canonical: "oop", aliases: ["oop", "object oriented programming", "object-oriented programming"] },
  { canonical: "design patterns", aliases: ["design patterns", "software design patterns"] },
  { canonical: "code reviews", aliases: ["code reviews", "code review", "peer reviews"] },
  { canonical: "level design", aliases: ["level design"] },
  { canonical: "combat design", aliases: ["combat design"] },
  { canonical: "economy design", aliases: ["economy design"] },
  { canonical: "live ops", aliases: ["live ops", "live operations"] },
  { canonical: "monetization", aliases: ["monetization"] },
  { canonical: "balancing", aliases: ["balancing", "game balance"] },
  { canonical: "wireframing", aliases: ["wireframing", "wireframes"] },
  { canonical: "prototyping", aliases: ["prototyping", "prototypes"] },
  { canonical: "figma", aliases: ["figma"] },
  { canonical: "user research", aliases: ["user research"] },
  { canonical: "interaction design", aliases: ["interaction design"] },
  { canonical: "maya", aliases: ["maya", "autodesk maya"] },
  { canonical: "blender", aliases: ["blender"] },
  { canonical: "photoshop", aliases: ["photoshop", "adobe photoshop"] },
  { canonical: "substance painter", aliases: ["substance painter"] },
  { canonical: "zbrush", aliases: ["zbrush", "z brush"] },
  { canonical: "3d modeling", aliases: ["3d modeling", "3d modelling"] },
  { canonical: "rigging", aliases: ["rigging"] },
  { canonical: "animation", aliases: ["animation"] },
  { canonical: "vfx", aliases: ["vfx", "visual effects"] },
  { canonical: "production planning", aliases: ["production planning"] },
  { canonical: "release management", aliases: ["release management"] },
  { canonical: "sprint planning", aliases: ["sprint planning"] },
  { canonical: "scrum", aliases: ["scrum"] },
  { canonical: "agile", aliases: ["agile", "agile methodologies", "agile methodology"] },
  { canonical: "stakeholder management", aliases: ["stakeholder management"] },
  { canonical: "roadmapping", aliases: ["roadmapping", "roadmap planning"] },
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
  "software design engineer",
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
  "safe",
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

const WEAK_PROFILE_KEYWORDS = new Set([
  "experience",
  "job experience",
  "areas of expertise",
  "summary",
  "skills",
  "profile",
  "resume",
  "curriculum vitae",
  "work",
  "worked",
  "team",
  "teams",
  "results",
  "responsibilities",
  "requirements",
  "professional summary",
  "technical skills",
  "employment history",
  "education",
]);

const TITLE_KEYWORD_PARTS = /(engineer|developer|tester|analyst|manager|programmer|designer|artist|producer|specialist|administrator|architect|coordinator|scientist|technician)/;

const HEADER_NOISE_PATTERNS = [
  /^page\s+\d+$/i,
  /^curriculum vitae$/i,
  /^references available upon request$/i,
  /^(phone|mobile|email|address|linkedin|github|portfolio):/i,
  /^\+?\d[\d\s().-]{6,}$/,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /^https?:\/\//i,
  /^www\./i,
  /^(summary|professional summary|skills|technical skills|experience|education|projects|certifications)$/i,
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

function compactMultiline(value: string | null | undefined): string | null {
  if (!value) return null;

  const lines = value
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !HEADER_NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .filter((line) => line.length > 1)
    .filter((line) => !(line.toLowerCase() === "c"));

  if (!lines.length) return null;
  return lines.join("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasToPattern(alias: string): RegExp {
  const escaped = escapeRegex(alias.toLowerCase().trim())
    .replace(/\s+/g, "\\s+")
    .replace(/\//g, "(?:\\/|\\s+)" )
    .replace(/\./g, "\\.?");

  if (/^[a-z0-9+#.\/\-\s]+$/.test(alias) && alias.length <= 5) {
    return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, "i");
  }

  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function collectCanonicalMatches(haystack: string, patterns: CanonicalPattern[]): string[] {
  const found: string[] = [];

  for (const pattern of patterns) {
    if (pattern.aliases.some((alias) => aliasToPattern(alias).test(haystack))) {
      found.push(pattern.canonical);
    }
  }

  return found.sort((left, right) => right.length - left.length);
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
    haystack.match(/\b[a-z][a-z0-9.+#/-]{2,}(?:\s+[a-z0-9.+#/-]{2,}){0,2}\b/gi) ?? [];

  const cleaned = phrases
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 3 && value.length <= 40)
    .filter(
      (value) =>
        !/^(the|and|with|from|that|this|have|using|used|built|work|worked|team|teams|role|roles|game|games|year|years)$/.test(
          value,
        ),
    )
    .filter((value) => !HEADER_NOISE_PATTERNS.some((pattern) => pattern.test(value)));

  return uniqueStrings(cleaned).slice(0, 80);
}

function isTitleLikeKeyword(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return false;

  if (collectMatches(normalizedValue, TITLE_PATTERNS).length > 0) return true;

  const tokens = normalizedValue.split(/\s+/).filter(Boolean);
  if (tokens.length > 4) return false;

  return (
    TITLE_KEYWORD_PARTS.test(normalizedValue) &&
    !/(design patterns|object oriented programming|ci\/cd|asset pipelines|content pipelines)/.test(normalizedValue)
  );
}

function cleanupProfileKeywords(values: string[]): string[] {
  return uniqueStrings(values)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value) => value.length >= 2 && value.length <= 40)
    .filter((value) => !/^\d+$/.test(value))
    .filter((value) => !WEAK_PROFILE_KEYWORDS.has(value))
    .filter((value) => value !== "c")
    .filter((value) => !isTitleLikeKeyword(value));
}

function normalizeExplicitSkill(value: string): string | null {
  const lower = value.trim().toLowerCase();
  if (!lower || lower === "c") return null;

  for (const pattern of SKILL_PATTERNS) {
    if (pattern.aliases.some((alias) => aliasToPattern(alias).test(lower))) {
      return pattern.canonical;
    }
  }

  const cleaned = lower.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (WEAK_PROFILE_KEYWORDS.has(cleaned)) return null;
  return cleaned;
}

function guessYearsExperience(text: string, explicitValue?: number | null): number | null {
  if (typeof explicitValue === "number" && Number.isFinite(explicitValue)) {
    return Math.max(0, Math.min(50, Math.floor(explicitValue)));
  }

  const explicitYearMatch = text.match(/\b(\d{1,2})\+?\s+years?\s+of\s+experience\b/i);
  if (explicitYearMatch) {
    return Math.max(0, Math.min(50, Number(explicitYearMatch[1])));
  }

  const presentCount = (text.match(/\bpresent\b/gi) ?? []).length;
  if (presentCount >= 3) return 6;
  if (presentCount === 2) return 4;
  if (presentCount === 1) return 2;

  return null;
}

function guessSeniority(text: string, explicit?: string | null, yearsExperience?: number | null): SeniorityLevel {
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
  if (/\bjunior\b/i.test(text) || /\bentry[- ]level\b/i.test(text) || /\bintern(ship)?\b/i.test(text)) {
    return SeniorityLevel.junior;
  }

  if ((yearsExperience ?? 0) >= 8) return SeniorityLevel.senior;
  if ((yearsExperience ?? 0) >= 4) return SeniorityLevel.mid;
  if ((yearsExperience ?? 0) >= 1) return SeniorityLevel.junior;

  return SeniorityLevel.entry;
}

function derivePrimaryTitle(explicitTitle?: string | null, normalizedTitles?: string[]): string | null {
  if (explicitTitle?.trim()) return explicitTitle.trim();
  if (normalizedTitles && normalizedTitles.length > 0) {
    return normalizedTitles[0]
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return null;
}

export function normalizeResumeProfile(input: ResumeNormalizationInput): NormalizedResumeProfileData {
  const rawText = compactMultiline(input.rawText);
  const summary = compactSentence(input.summary);
  const titleText = compactSentence(input.title);
  const haystack = `${titleText ?? ""}\n${rawText ?? ""}\n${summary ?? ""}`.toLowerCase();

  const normalizedSkills = uniqueStrings([
    ...(input.skills ?? []).map(normalizeExplicitSkill).filter(Boolean) as string[],
    ...collectCanonicalMatches(haystack, SKILL_PATTERNS),
  ]).slice(0, 100);

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

  const keywordSeed = cleanupProfileKeywords([
    ...(input.keywords ?? []).map((item) => item.toLowerCase()),
    ...normalizedSkills,
    ...certifications,
    ...industries,
    ...collectKeywordCandidates(haystack),
  ]).slice(0, 120);

  const yearsExperience = guessYearsExperience(haystack, input.yearsExperience);
  const seniority = guessSeniority(haystack, input.seniority, yearsExperience);
  const title = derivePrimaryTitle(titleText, normalizedTitles);

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
