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
  react: ["react", "react.js"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js"],
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
  "job",
]);

const NOISY_LINE_PATTERNS = [
  /^skills\b/i,
  /^job experience\b/i,
  /^areas of expertise\b/i,
  /^high\s*l\s*i\s*g\s*h\s*t\s*s\b/i,
  /^key metrics\b/i,
  /^education\b/i,
  /^(?:page\s+\d+|references|available upon request)$/i,
  /^[A-Z\s&/+.-]{18,}$/,
];

const WEAK_SKILLS = new Set(["rest", "testing", "apis", "google", "ai", "c", "software design", "job experience"]);
const STRONG_LANGUAGE_SKILLS = new Set(["c#", "c++", "java", ".net", "typescript", "javascript", "python", "sql", "unity", "graphql", "microservices", "ecs", "oop", "design patterns"]);

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


function stableTitleVariant(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(intern|internship|new grad|graduate|junior|jr)\b/g, "")
    .replace(/\bdesign\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmbeddedSectionBreaks(rawText: string): string {
  return rawText
    .replace(/\b(SKILLS|JOB EXPERIENCE|AREAS OF EXPERTISE|EDUCATION|KEY METRICS|CERTIFICATIONS|SUMMARY)\b/gi, "\n$1\n")
    .replace(/\b(Languages? & Frameworks?|Engineering Practices|Tooling & Delivery|Systems & Architecture)\b/gi, "\n$1")
    .replace(/\n{2,}/g, "\n");
}

function sanitizeRawTextForProfile(rawText?: string | null): string {
  if (!rawText) return "";

  const normalizedText = normalizeEmbeddedSectionBreaks(rawText);

  const cleanedLines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !NOISY_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .filter((line) => !/^([A-Z]\s+){4,}[A-Z]$/.test(line))
    .filter((line) => !/^(skills|job experience|areas of expertise|education|key metrics)$/i.test(line))
    .filter((line) => line.length <= 400);

  return cleanedLines.join("\n");
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

    if (/^[A-Za-z &/+#.-]{3,40}:\s*/.test(cleanedLine)) {
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
    .filter((value) => !/^\d+([.%+-]\d+)?$/.test(value))
    .filter((value) => !/^(and|the|for|with|from|into|over|under)$/.test(value));

  return uniqueStrings(cleaned).slice(0, 80);
}

function cleanupSkills(values: string[]): string[] {
  return uniqueStrings(values)
    .filter((value) => !WEAK_SKILLS.has(value))
    .filter((value) => value.length >= 2)
    .filter((value) => !/^\d+$/.test(value))
    .filter((value) => !/^(job|experience|skills|summary|profile)$/i.test(value))
    .filter((value) => !/^(software design engineer internship|software design engineer)$/i.test(value))
    .sort((left, right) => {
      const leftStrong = STRONG_LANGUAGE_SKILLS.has(left) ? 1 : 0;
      const rightStrong = STRONG_LANGUAGE_SKILLS.has(right) ? 1 : 0;
      if (leftStrong !== rightStrong) return rightStrong - leftStrong;
      const leftWords = left.split(/\s+/).length;
      const rightWords = right.split(/\s+/).length;
      if (leftWords !== rightWords) return rightWords - leftWords;
      return left.localeCompare(right);
    });
}

function cleanupTitles(values: string[], yearsExperience?: number | null): string[] {
  const normalizedYears = yearsExperience ?? 0;
  const unique = uniqueStrings(values).filter((value) => !NOISY_KEYWORDS.has(value));

  const stableVariants = new Set(unique.map((value) => stableTitleVariant(value)));
  const hasSoftwareEngineer = unique.some((value) => /\bsoftware engineer\b/i.test(value) && !/\bdesign\b/i.test(value));

  return unique
    .filter((value) => {
      if (TITLE_PATTERNS.includes(value)) return true;
      return /\b(engineer|developer|programmer|tester|analyst|manager)\b/.test(value);
    })
    .filter((value) => {
      if (hasSoftwareEngineer && /\bsoftware design engineer\b/i.test(value)) return false;
      if (!/\b(intern|internship|new grad|graduate|junior|jr)\b/.test(value)) return true;
      const stable = stableTitleVariant(value);
      if (normalizedYears >= 2 && stableVariants.has(stable)) return false;
      return false;
    })
    .sort((left, right) => {
      const leftStable = stableTitleVariant(left);
      const rightStable = stableTitleVariant(right);
      if (leftStable === "software engineer" && rightStable !== "software engineer") return -1;
      if (rightStable === "software engineer" && leftStable !== "software engineer") return 1;
      return left.length - right.length;
    })
    .slice(0, 12);
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
  const normalizedExplicit = explicitTitle?.trim() ?? "";
  const cleanExplicit = normalizedExplicit && !NOISY_KEYWORDS.has(normalizedExplicit.toLowerCase()) ? normalizedExplicit : null;

  if (normalizedTitles && normalizedTitles.length > 0) {
    const bestTitle = normalizedTitles[0]
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    if (!cleanExplicit) return bestTitle;
    if (/\b(intern|internship|new grad|graduate)\b/i.test(cleanExplicit) && !/\b(intern|internship|new grad|graduate)\b/i.test(bestTitle)) {
      return bestTitle;
    }
  }

  return cleanExplicit || null;
}

export function normalizeResumeProfile(input: ResumeNormalizationInput): NormalizedResumeProfileData {
  const sanitizedRawText = sanitizeRawTextForProfile(input.rawText);
  const rawText = compactSentence(sanitizedRawText);
  const summary = compactSentence(input.summary);
  const rawHaystack = `${input.title ?? ""}\n${sanitizedRawText ?? ""}\n${summary ?? ""}`.toLowerCase();
  const haystack = `${input.title ?? ""}\n${rawText ?? ""}\n${summary ?? ""}`.toLowerCase();

  const yearsExperience = guessYearsExperience(rawHaystack, input.yearsExperience);
  const structuredSkillCandidates = sanitizedRawText ? extractStructuredSkillCandidates(sanitizedRawText) : [];
  const matchedSkills = collectMatches(haystack, KNOWN_SKILLS);
  const normalizedSkills = cleanupSkills([
    ...(input.skills ?? []).map((item) => canonicalizeSkill(item)),
    ...structuredSkillCandidates.map((item) => canonicalizeSkill(item)),
    ...matchedSkills.map((item) => canonicalizeSkill(item)),
  ]).slice(0, 50);

  const normalizedTitles = cleanupTitles([
    ...(input.titles ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, TITLE_PATTERNS),
  ], yearsExperience).slice(0, 20);

  const certifications = uniqueStrings([
    ...(input.certifications ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, CERT_PATTERNS),
  ]).slice(0, 20);

  const industries = uniqueStrings([
    ...(input.industries ?? []).map((item) => item.toLowerCase()),
    ...collectMatches(haystack, INDUSTRY_PATTERNS),
  ]).slice(0, 20);

  const keywordSeed = cleanupSkills([
    ...(input.keywords ?? []).map((item) => canonicalizeSkill(item)),
    ...normalizedSkills,
    ...normalizedTitles,
    ...certifications,
    ...industries,
    ...collectKeywordCandidates(rawHaystack).map((item) => canonicalizeSkill(item)),
  ]).slice(0, 90);

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
