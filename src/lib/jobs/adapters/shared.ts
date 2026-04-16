import type { EmploymentType, NormalizedJobInput, RemoteType } from "@/lib/jobs/types";
import type { InferredFields } from "@/lib/jobs/adapters/types";

const COMMON_KEYWORDS = [
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node",
  "python",
  "java",
  "go",
  "sql",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "graphql",
  "rest",
  "api",
  "selenium",
  "playwright",
  "cypress",
  "qa",
  "automation",
  "testing",
  "security",
  "devops",
  "ci/cd",
  "product",
  "design",
  "figma",
  "jira",
  "confluence",
  "scrum",
  "agile",
  "marketing",
  "analytics",
  "machine learning",
  "ai",
];

export type ParsedSectionBucket =
  | "overview"
  | "responsibilities"
  | "requirements"
  | "nice_to_have"
  | "benefits"
  | "company"
  | "process"
  | "location"
  | "other";

export type ParsedSectionSource = "description" | "list" | "body_html" | "body_plain" | "derived";

export type ParsedSection = {
  heading: string;
  bucket: ParsedSectionBucket;
  content: string;
  source: ParsedSectionSource;
  suppressed?: boolean;
};

const RESPONSIBILITY_HEADING_PATTERNS = [
  /^responsibilit(?:y|ies)$/,
  /^what you(?:'|’)ll do$/,
  /^what you'll do$/,
  /^what you will do$/,
  /^what you will be doing$/,
  /^what you do$/,
  /^what you can expect$/,
  /^your impact$/,
  /^duties$/,
  /^tasks$/,
  /^key responsibilities$/,
  /^day to day$/,
  /^day-to-day$/,
  /^in this role$/,
  /^in this role you will$/,
  /^the role$/,
  /^role responsibilities$/,
  /^job duties$/,
  /^scope of the role$/,
  /^what we need you to do$/,
  /^how you will contribute$/,
  /^your mission$/,
  /^what you can contribute$/,
  /^what success looks like$/,
];

const REQUIREMENT_HEADING_PATTERNS = [
  /^requirements?$/,
  /^qualification(?:s)?$/,
  /^required qualifications?$/,
  /^minimum qualifications?$/,
  /^basic qualifications?$/,
  /^essential qualifications?$/,
  /^must haves?$/,
  /^what you(?:'|’)ll bring$/,
  /^what you'll bring$/,
  /^what you bring$/,
  /^who you are$/,
  /^about you$/,
  /^who we are looking for$/,
  /^what we(?:'|’)re looking for$/,
  /^what we're looking for$/,
  /^what we are looking for$/,
  /^skills(?: and experience)?$/,
  /^experience(?: and skills)?$/,
  /^your profile$/,
  /^ideal candidate$/,
  /^candidate profile$/,
  /^what we expect from you$/,
  /^to succeed in this role$/,
  /^you should have$/,
  /^what makes you a fit$/,
  /^about the candidate$/,
  /^candidate requirements$/,
  /^needed for success$/,
  /^success profile$/,
];

const NICE_TO_HAVE_HEADING_PATTERNS = [
  /^nice to haves?$/,
  /^nice-to-haves?$/,
  /^bonus points$/,
  /^preferred qualifications?$/,
  /^preferred experience$/,
  /^desirable$/,
  /^pluses$/,
  /^assets?$/,
  /^it would be great if$/,
  /^extra credit$/,
  /^advantageous$/,
];

const OVERVIEW_HEADING_PATTERNS = [
  /^role overview$/,
  /^overview$/,
  /^about the role$/,
  /^about this role$/,
  /^job description$/,
  /^summary$/,
  /^about the job$/,
  /^introduction$/,
  /^about the opportunity$/,
  /^about the team and role$/,
  /^position overview$/,
  /^about this opportunity$/,
  /^role summary$/,
];

const BENEFIT_HEADING_PATTERNS = [
  /^benefits?$/,
  /^what we offer$/,
  /^perks$/,
  /^why join us$/,
  /^what you get$/,
  /^our offer$/,
  /^compensation(?: and benefits)?$/,
];

const COMPANY_HEADING_PATTERNS = [
  /^about us$/,
  /^about the company$/,
  /^our values$/,
  /^about the team$/,
  /^company overview$/,
  /^about avalanche$/,
  /^about dream games$/,
  /^who we are$/,
  /^life at /,
];

const PROCESS_HEADING_PATTERNS = [
  /^how to apply$/,
  /^application process$/,
  /^next steps$/,
  /^interview process$/,
  /^privacy$/,
  /^equal opportunity$/,
  /^diversity/,
  /^inclusion/,
  /^eeo/,
  /^accommodation/,
];

const LOCATION_HEADING_PATTERNS = [
  /^location$/,
  /^the .* location$/,
  /^our office$/,
  /^workplace$/,
  /^working model$/,
  /^where you'll work$/,
];

const LOW_VALUE_CONTENT_PATTERNS = [
  /under-represented groups/i,
  /diverse opinions and different experiences/i,
  /equal opportunity/i,
  /sexual orientation/i,
  /gender identity/i,
  /please register below/i,
  /review applications continuously/i,
  /non-disclosure agreement/i,
  /privacy policy/i,
  /statement of personal data protection/i,
  /relocation assistance/i,
  /our office is situated/i,
  /our hybrid model requires/i,
  /all further studio-related information/i,
  /we encourage you to apply/i,
];

const REQUIREMENT_SIGNAL_PATTERNS = [
  /\bexperience\b/i,
  /\bexperienced\b/i,
  /\bknowledge\b/i,
  /\bproficiency\b/i,
  /\bfamiliarity\b/i,
  /\bunderstanding\b/i,
  /\bability to\b/i,
  /\bable to\b/i,
  /\bmust\b/i,
  /\bshould\b/i,
  /\brequired\b/i,
  /\bqualification\b/i,
  /\bdegree\b/i,
  /\byears?\b/i,
  /\bbackground\b/i,
  /\bskills?\b/i,
  /\bfluent\b/i,
  /\benglish\b/i,
  /\bplus\b/i,
  /\bbonus\b/i,
  /\bstrong\b/i,
  /\bproven\b/i,
];

const RESPONSIBILITY_SIGNAL_PATTERNS = [
  /\bdesign\b/i,
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\bdevelop\b/i,
  /\bimplement\b/i,
  /\bdeliver\b/i,
  /\blead\b/i,
  /\bmanage\b/i,
  /\bdrive\b/i,
  /\boptimi[sz]e\b/i,
  /\bsupport\b/i,
  /\bwork closely\b/i,
  /\bcollaborat\b/i,
  /\bmaintain\b/i,
  /\bmentor\b/i,
  /\bimprove\b/i,
  /\bown\b/i,
  /\bresponsible for\b/i,
  /\bparticipate\b/i,
  /\bcontribute\b/i,
  /\breporting to\b/i,
  /\bensure\b/i,
];

export function getFetch(fetchImpl?: typeof fetch) {
  return fetchImpl ?? fetch;
}

export async function fetchJson<T>(url: string, init?: RequestInit, fetchImpl?: typeof fetch): Promise<T> {
  const response = await getFetch(fetchImpl)(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Fetch failed (${response.status}) for ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  return (await response.json()) as T;
}

export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";

  return decodeHtmlEntities(
    input
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<(h[1-6])[^>]*>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|ul|ol)>/gi, "\n\n")
      .replace(/<\/(h[1-6]|li)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

export function inferRemoteType(location: string | null | undefined, workplaceType?: string | null, description?: string | null): RemoteType {
  const haystack = `${location ?? ""} ${workplaceType ?? ""} ${description ?? ""}`.toLowerCase();

  if (workplaceType?.toLowerCase() === "remote") return "remote";
  if (workplaceType?.toLowerCase() === "hybrid") return "hybrid";
  if (workplaceType?.toLowerCase() === "on-site" || workplaceType?.toLowerCase() === "onsite") return "onsite";

  if (/\bhybrid\b/.test(haystack)) return "hybrid";
  if (/\bremote\b/.test(haystack) || /\bwork from home\b/.test(haystack)) return "remote";
  if (/\bon[- ]site\b/.test(haystack) || /\bin office\b/.test(haystack)) return "onsite";

  return "unknown";
}

export function inferEmploymentType(value: string | null | undefined): EmploymentType {
  const haystack = (value ?? "").toLowerCase();

  if (haystack.includes("full")) return "full_time";
  if (haystack.includes("part")) return "part_time";
  if (haystack.includes("intern")) return "internship";
  if (haystack.includes("contract")) return "contract";
  if (haystack.includes("temp")) return "temporary";
  if (haystack.includes("freelance")) return "freelance";

  return "unknown";
}

export function inferSeniority(title: string, description?: string | null): string | null {
  const haystack = `${title} ${description ?? ""}`.toLowerCase();

  if (/\b(staff|principal|distinguished)\b/.test(haystack)) return "staff";
  if (/\b(manager|head|director|vp|vice president)\b/.test(haystack)) return "manager";
  if (/\b(lead|sr\.?\s+lead)\b/.test(haystack)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(haystack)) return "senior";
  if (/\b(mid|intermediate)\b/.test(haystack)) return "mid";
  if (/\b(junior|jr\.?)\b/.test(haystack)) return "junior";
  if (/\b(entry|graduate|new grad|intern)\b/.test(haystack)) return "entry";

  return null;
}

export function normalizeHeading(input: string): string {
  return input
    .toLowerCase()
    .replace(/[–—-]/g, " ")
    .replace(/[’']/g, "'")
    .replace(/[()\[\]]/g, " ")
    .replace(/[:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesHeading(normalizedHeading: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(normalizedHeading));
}

export function classifySectionHeading(heading: string): ParsedSectionBucket {
  const normalized = normalizeHeading(heading);

  if (matchesHeading(normalized, OVERVIEW_HEADING_PATTERNS)) return "overview";
  if (matchesHeading(normalized, RESPONSIBILITY_HEADING_PATTERNS)) return "responsibilities";
  if (matchesHeading(normalized, REQUIREMENT_HEADING_PATTERNS)) return "requirements";
  if (matchesHeading(normalized, NICE_TO_HAVE_HEADING_PATTERNS)) return "nice_to_have";
  if (matchesHeading(normalized, BENEFIT_HEADING_PATTERNS)) return "benefits";
  if (matchesHeading(normalized, COMPANY_HEADING_PATTERNS)) return "company";
  if (matchesHeading(normalized, PROCESS_HEADING_PATTERNS)) return "process";
  if (matchesHeading(normalized, LOCATION_HEADING_PATTERNS)) return "location";

  return "other";
}

export function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("•")) return false;
  if (trimmed.length > 90) return false;

  const normalized = normalizeHeading(trimmed);
  if (!normalized) return false;

  if (classifySectionHeading(trimmed) !== "other") return true;

  const headingWordCount = normalized.split(" ").length;
  const hasTerminalColon = /:$/.test(trimmed);
  const titleCaseLike = /^[A-Z][A-Za-z0-9 '&/\-]+$/.test(trimmed);

  return hasTerminalColon || (titleCaseLike && headingWordCount <= 6);
}

function normalizeBulletLine(line: string): string {
  return line
    .replace(/^[-*•▪◦‣·]\s*/, "• ")
    .replace(/^\d+[.)]\s*/, "• ")
    .trim();
}

function splitIntoBlocks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => normalizeBulletLine(line))
        .join("\n")
    )
    .map((block) => sanitizeTextBlock(block))
    .filter(Boolean);
}

function scorePatterns(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function inferBucketFromContent(content: string): ParsedSectionBucket {
  const normalized = content.toLowerCase();

  if (LOW_VALUE_CONTENT_PATTERNS.some((pattern) => pattern.test(content))) return "process";
  if (/\bbenefits?\b|\bperks\b|\bcompensation\b/.test(normalized)) return "benefits";
  if (/\bapply\b|\bapplication\b|\binterview\b|\bprivacy\b|\bequal opportunity\b/.test(normalized)) return "process";
  if (/\boffice\b|\blocation\b|\bhybrid\b|\bon-site\b|\bonsite\b|\bremote\b/.test(normalized) && normalized.length < 400) return "location";

  const requirementScore = scorePatterns(content, REQUIREMENT_SIGNAL_PATTERNS);
  const responsibilityScore = scorePatterns(content, RESPONSIBILITY_SIGNAL_PATTERNS);

  if (/\bbonus\b|\bnice to have\b|\bpreferred\b|\bpluses\b/.test(normalized)) return "nice_to_have";
  if (requirementScore >= responsibilityScore + 1 && requirementScore >= 2) return "requirements";
  if (responsibilityScore >= requirementScore + 1 && responsibilityScore >= 2) return "responsibilities";

  return "other";
}

export function sanitizeTextBlock(input: string | null | undefined): string {
  if (!input) return "";

  return input
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function extractStructuredSections(text: string, source: ParsedSectionSource = "description"): ParsedSection[] {
  if (!text.trim()) return [];

  const blocks = splitIntoBlocks(text);
  const sections: ParsedSection[] = [];
  let currentHeading = "Role Overview";
  let currentBucket: ParsedSectionBucket = "overview";

  const pushSection = (heading: string, bucket: ParsedSectionBucket, content: string) => {
    const cleaned = sanitizeTextBlock(content);
    if (!cleaned) return;

    sections.push({
      heading,
      bucket,
      content: cleaned,
      source,
      suppressed: shouldSuppressContent(bucket, cleaned),
    });
  };

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines.length === 1 && isLikelyHeading(lines[0])) {
      currentHeading = lines[0].replace(/[:\s]+$/g, "").trim();
      const classified = classifySectionHeading(currentHeading);
      currentBucket = classified === "other" ? currentBucket : classified;
      continue;
    }

    if (isLikelyHeading(lines[0]) && lines.length > 1) {
      const heading = lines[0].replace(/[:\s]+$/g, "").trim();
      const classified = classifySectionHeading(heading);
      const content = lines.slice(1).join("\n");
      pushSection(heading, classified === "other" ? inferBucketFromContent(content) : classified, content);
      currentHeading = heading;
      currentBucket = classified === "other" ? currentBucket : classified;
      continue;
    }

    const inferredBucket = currentBucket === "other" ? inferBucketFromContent(block) : currentBucket;
    const heading = inferredBucket === currentBucket ? currentHeading : bucketToHeading(inferredBucket);
    pushSection(heading, inferredBucket, block);
  }

  return sections;
}

function bucketToHeading(bucket: ParsedSectionBucket): string {
  switch (bucket) {
    case "overview":
      return "Role Overview";
    case "responsibilities":
      return "Responsibilities";
    case "requirements":
      return "Requirements";
    case "nice_to_have":
      return "Nice to Haves";
    case "benefits":
      return "Benefits";
    case "company":
      return "About the Company";
    case "process":
      return "Application Process";
    case "location":
      return "Location";
    default:
      return "Other";
  }
}

export function shouldSuppressContent(bucket: ParsedSectionBucket, content: string): boolean {
  if (bucket === "process" || bucket === "benefits") return true;
  return LOW_VALUE_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

export function shouldSuppressSection(section: ParsedSection): boolean {
  if (section.suppressed) return true;
  if (section.bucket === "process" || section.bucket === "benefits") return true;
  return LOW_VALUE_CONTENT_PATTERNS.some((pattern) => pattern.test(section.content));
}

export function mergeSectionContents(sections: ParsedSection[]): string | null {
  const blocks = dedupeTextBlocks(sections.filter((section) => !section.suppressed).map((section) => section.content));
  return blocks.length ? blocks.join("\n\n") : null;
}

export function dedupeTextBlocks(blocks: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const block of blocks) {
    const cleaned = sanitizeTextBlock(block);
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

export function dedupeSections(sections: ParsedSection[]): ParsedSection[] {
  const seen = new Set<string>();
  const result: ParsedSection[] = [];

  for (const section of sections) {
    const key = `${section.bucket}|${normalizeHeading(section.heading)}|${section.content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(section);
  }

  return result;
}

export function extractSection(text: string, labels: string[]): string | null {
  if (!text.trim()) return null;

  const normalizedLabels = labels.map((label) => normalizeHeading(label));
  const parsedSections = extractStructuredSections(text);
  const matches = parsedSections.filter((section) => normalizedLabels.includes(normalizeHeading(section.heading)));
  return mergeSectionContents(matches);
}

export function extractKeywords(text: string): string[] {
  const haystack = text.toLowerCase();
  return COMMON_KEYWORDS.filter((keyword) => haystack.includes(keyword)).slice(0, 24);
}

export function inferFields(args: {
  title: string;
  location?: string | null;
  workplaceType?: string | null;
  commitment?: string | null;
  description: string;
  requirementsText?: string | null;
  responsibilitiesText?: string | null;
}): InferredFields {
  const requirementsText =
    args.requirementsText ??
    extractSection(args.description, [
      "requirements",
      "qualifications",
      "required qualifications",
      "minimum qualifications",
      "preferred qualifications",
      "what you'll bring",
      "who you are",
      "about you",
      "what we're looking for",
      "what we are looking for",
      "skills and experience",
      "your profile",
      "nice to haves",
      "bonus points",
    ]);

  const responsibilitiesText =
    args.responsibilitiesText ??
    extractSection(args.description, [
      "responsibilities",
      "what you'll do",
      "what you will do",
      "your impact",
      "duties",
      "day to day",
      "key responsibilities",
      "tasks",
      "in this role",
    ]);

  const remoteType = inferRemoteType(args.location, args.workplaceType, args.description);
  const employmentType = inferEmploymentType(args.commitment);
  const seniority = inferSeniority(args.title, args.description);
  const keywords = extractKeywords(
    [args.title, args.location ?? "", args.description, requirementsText ?? "", responsibilitiesText ?? ""].join("\n")
  );

  return {
    remoteType,
    employmentType,
    seniority,
    requirementsText,
    responsibilitiesText,
    keywords,
  };
}

export function normalizeJobShape(input: NormalizedJobInput): NormalizedJobInput {
  return {
    ...input,
    title: input.title.trim(),
    company: input.company.trim(),
    location: input.location?.trim() || null,
    description: input.description.trim(),
    requirementsText: input.requirementsText?.trim() || null,
    responsibilitiesText: input.responsibilitiesText?.trim() || null,
    applyUrl: input.applyUrl?.trim() || null,
    sourceUrl: input.sourceUrl?.trim() || null,
    salaryCurrency: input.salaryCurrency?.trim() || null,
  };
}
