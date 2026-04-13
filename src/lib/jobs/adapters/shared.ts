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
  "sales",
  "marketing",
  "analytics",
  "machine learning",
  "ai",
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
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li>/gi, "• ")
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

export function extractSection(text: string, labels: string[]): string | null {
  if (!text.trim()) return null;

  const lines = text.split("\n").map((line) => line.trim());
  let collecting = false;
  const collected: string[] = [];

  for (const line of lines) {
    const normalized = line.toLowerCase().replace(/[:\s]+$/, "");

    if (labels.some((label) => normalized === label || normalized.startsWith(`${label} `))) {
      collecting = true;
      continue;
    }

    if (collecting && /^[a-z][a-z\s/&-]{2,30}:?$/i.test(line) && !line.startsWith("•")) {
      break;
    }

    if (collecting && line) {
      collected.push(line);
    }
  }

  return collected.length ? collected.join("\n").trim() : null;
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
    extractSection(args.description, ["requirements", "qualifications", "what you'll bring"]);

  const responsibilitiesText =
    args.responsibilitiesText ??
    extractSection(args.description, ["responsibilities", "what you'll do", "your impact"]);

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
