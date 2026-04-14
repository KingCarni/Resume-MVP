
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
  "postman",
  "jira",
  "confluence",
  "github actions",
  "bitbucket",
  "jenkins",
  "growthbook",
  "sql",
  "postgresql",
  "mysql",
  "rest",
  "rest api",
  "restful api",
  "graphql",
  "grpc",
  "microservices",
  "distributed systems",
  "scalable systems",
  "websockets",
  "tcp",
  "oauth",
  "google oauth",
  "docker",
  "kubernetes",
  "terraform",
  "linux",
  "aws",
  "azure",
  "gcp",
  "ci/cd",
  "git",
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "python",
  "java",
  "c#",
  "c++",
  ".net",
  "asp.net",
  "vue",
  "vue.js",
  "unity",
  "unreal engine",
  "ecs",
  "entity component system",
  "solid",
  "sdlc",
  "oop",
  "object oriented programming",
  "design patterns",
  "code reviews",
  "unit testing",
  "integration testing",
  "api testing",
  "manual testing",
  "automation testing",
  "test automation",
  "qa automation",
  "regression testing",
  "exploratory testing",
  "performance testing",
  "agile",
  "scrum",
  "sprint planning",
  "release management",
  "stakeholder management",
  "a/b testing",
  "ab testing",
  "monetization",
  "live ops",
  "tooling",
  "tool development",
  "tools programming",
  "designer tooling",
  "qa tooling",
  "content pipelines",
  "asset pipelines",
  "spreadsheet-to-json",
  "spreadsheet to json",
  "debug commands",
  "profiling",
  "performance optimization",
  "authentication",
  "session services",
  "inventory systems",
  "player progression",
  "gameplay systems",
  "ui frameworks",
  "google maps api",
];

const SKILL_ALIASES: Record<string, string[]> = {
  "rest api": ["rest api", "restful api", "restful apis", "rest apis"],
  websockets: ["websocket", "websockets"],
  oauth: ["oauth", "google oauth", "oauth tokens"],
  ".net": [".net", "dotnet", "asp.net", "c# .net"],
  vue: ["vue", "vue.js"],
  ecs: ["ecs", "entity component system", "entity component systems"],
  oop: ["oop", "object oriented programming", "object-oriented programming"],
  "a/b testing": ["a/b testing", "ab testing"],
  "tool development": [
    "tool development",
    "tools development",
    "tools programming",
    "tooling",
    "designer tooling",
    "qa tooling",
  ],
  "content pipelines": ["content pipelines", "asset pipelines", "spreadsheet-to-json", "spreadsheet to json"],
  profiling: ["profiling", "runtime profiling", "performance optimization"],
};

const TITLE_PATTERNS = [
  "software engineer",
  "full-stack software engineer",
  "full stack software engineer",
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
  "engine tools programmer",
  "engine tools engineer",
  "frontend engineer",
  "frontend developer",
  "backend engineer",
  "backend developer",
  "full stack engineer",
  "full stack developer",
  "mobile engineer",
  "mobile developer",
  "software design engineer",
  "software design engineer internship",
  "software engineer internship",
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
  "project manager",
  "product manager",
  "devops engineer",
  "platform engineer",
  "support engineer",
];

const CERT_PATTERNS = [
  "istqb",
  "aws certified",
  "azure fundamentals",
  "microsoft azure fundamentals",
  "azure certified",
  "google cloud certified",
  "scrum master",
  "pmp",
  "az-900",
];

const INDUSTRY_PATTERNS = [
  "saas",
  "fintech",
  "healthtech",
  "gaming",
  "game development",
  "developer tools",
  "enterprise software",
  "mobile games",
  "console games",
  "live service",
];

const NOISY_KEYWORDS = new Set([
  "your name",
  "high l ig h ts",
  "experience",
  "areas of expertise",
  "education",
  "key metrics",
  "job experience",
  "skills",
  "resume",
  "profile",
  "role",
  "team",
  "worked",
  "work",
  "using",
  "used",
  "built",
  "designed",
  "implemented",
  "improved",
  "developed",
  "engineer",
  "software engineering",
]);

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
  return new RegExp(`(^|[^a-z0-9+#])${escaped}(?=$|[^a-z0-9+#])`, "i");
}

function canonicalizeSkill(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.some((alias) => createLoosePhrasePattern(alias).test(normalizedValue))) {
      return canonical;
    }
  }
  return normalizedValue;
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

function extractStructuredSkillCandidates(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates: string[] = [];

  for (const line of lines) {
    const cleanedLine = line.replace(/^[•\-–]\s*/, "").trim();

    if (/^[A-Za-z &/+-]{3,40}:\s*/.test(cleanedLine)) {
      const [, value] = cleanedLine.split(/:\s*/, 2);
      if (value) {
        candidates.push(
          ...value
            .split(/[;,|]/)
            .map((part) => part.trim())
            .filter((part) => part.length >= 2 && part.length <= 60),
        );
      }
    }

    if (/languages? & frameworks?/i.test(cleanedLine) || /engineering practices/i.test(cleanedLine) || /tooling & delivery/i.test(cleanedLine) || /systems & architecture/i.test(cleanedLine)) {
      candidates.push(
        ...cleanedLine
          .split(/:\s*/)
          .slice(1)
          .join(":")
          .split(/[;,|]/)
          .map((part) => part.trim())
          .filter((part) => part.length >= 2 && part.length <= 60),
      );
    }
  }

  return uniqueStrings(candidates);
}

function collectKeywordCandidates(haystack: string): string[] {
  const phrases =
    haystack.match(/\b[a-z][a-z0-9.+#/-]{2,}(?:\s+[a-z0-9.+#/-]{2,}){0,2}\b/gi) ?? [];
  const cleaned = phrases
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 2 && value.length <= 50)
    .filter((value) => !NOISY_KEYWORDS.has(value))
    .filter((value) => !/^\d+([.%+-]\d+)?$/.test(value));

  return uniqueStrings(cleaned).slice(0, 80);
}

function guessYearsExperience(text: string, explicitValue?: number | null): number | null {
  if (typeof explicitValue === "number" && Number.isFinite(explicitValue)) {
    return Math.max(0, Math.min(50, Math.floor(explicitValue)));
  }

  const explicitYearMatch = text.match(/\b(\d{1,2})\+?\s+years?\s+of\s+experience\b/i);
  if (explicitYearMatch) {
    return Math.max(0, Math.min(50, Number(explicitYearMatch[1])));
  }

  const yearRanges = Array.from(text.matchAll(/\b(20\d{2})\s*[–-]\s*(20\d{2}|present)\b/gi));
  if (yearRanges.length > 0) {
    const starts = yearRanges.map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
    const ends = yearRanges.map((m) => (m[2].toLowerCase() === "present" ? 2026 : Number(m[2]))).filter((n) => Number.isFinite(n));
    if (starts.length && ends.length) {
      const approx = Math.max(...ends) - Math.min(...starts);
      if (approx >= 0) return Math.max(0, Math.min(50, approx));
    }
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
  if (/\bnew grad\b|\bgraduate\b|\bjunior\b|\bentry[- ]level\b/i.test(text)) return SeniorityLevel.junior;

  if ((yearsExperience ?? 0) >= 8) return SeniorityLevel.senior;
  if ((yearsExperience ?? 0) >= 4) return SeniorityLevel.mid;
  if ((yearsExperience ?? 0) >= 1) return SeniorityLevel.junior;

  return SeniorityLevel.entry;
}

function derivePrimaryTitle(explicitTitle?: string | null, normalizedTitles?: string[]): string | null {
  if (explicitTitle?.trim() && !NOISY_KEYWORDS.has(explicitTitle.trim().toLowerCase())) {
    return explicitTitle.trim();
  }
  if (normalizedTitles && normalizedTitles.length > 0) {
    return normalizedTitles[0]
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return null;
}

export function normalizeResumeProfile(input: ResumeNormalizationInput): NormalizedResumeProfileData {
  const rawText = compactSentence(input.rawText);
  const summary = compactSentence(input.summary);
  const rawHaystack = `${input.title ?? ""}\n${input.rawText ?? ""}\n${summary ?? ""}`.toLowerCase();
  const haystack = `${input.title ?? ""}\n${rawText ?? ""}\n${summary ?? ""}`.toLowerCase();

  const structuredSkillCandidates = rawText ? extractStructuredSkillCandidates(input.rawText ?? "") : [];
  const matchedSkills = collectMatches(haystack, KNOWN_SKILLS);
  const normalizedSkills = uniqueStrings([
    ...(input.skills ?? []).map((item) => canonicalizeSkill(item)),
    ...structuredSkillCandidates.map((item) => canonicalizeSkill(item)),
    ...matchedSkills.map((item) => canonicalizeSkill(item)),
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

  const keywordSeed = uniqueStrings([
    ...(input.keywords ?? []).map((item) => canonicalizeSkill(item)),
    ...normalizedSkills,
    ...normalizedTitles,
    ...certifications,
    ...industries,
    ...collectKeywordCandidates(rawHaystack).map((item) => canonicalizeSkill(item)),
  ]).slice(0, 140);

  const yearsExperience = guessYearsExperience(rawHaystack, input.yearsExperience);
  const seniority = guessSeniority(rawHaystack, input.seniority, yearsExperience);
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
