import type { JobsAdapter } from "@/lib/jobs/adapters/types";
import { inferFields, normalizeJobShape, sanitizeTextBlock, stripHtml } from "@/lib/jobs/adapters/shared";

type BambooHrJobSummary = {
  title: string;
  sourceUrl: string | null;
  applyUrl: string | null;
  location: string | null;
  employmentType: string | null;
  department: string | null;
  description: string;
};

function trimToken(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function buildCompanyBase(tokenOrSite: string): string {
  const raw = trimToken(tokenOrSite);
  if (!raw) {
    throw new Error("BambooHR adapter requires a company subdomain or full BambooHR careers URL.");
  }

  if (/\.bamboohr\.com\//i.test(tokenOrSite) || /^https?:\/\//i.test(tokenOrSite.trim())) {
    const parsed = new URL(tokenOrSite.startsWith("http") ? tokenOrSite : `https://${tokenOrSite}`);
    return `${parsed.protocol}//${parsed.host}`;
  }

  if (raw.includes(".bamboohr.com")) {
    return `https://${raw}`;
  }

  return `https://${raw}.bamboohr.com`;
}

async function fetchText(url: string, fetchImpl?: typeof fetch): Promise<string> {
  const response = await (fetchImpl ?? fetch)(url, {
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Fetch failed (${response.status}) for ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  return response.text();
}

function parseEmbeddedJson(html: string): Record<string, unknown> | null {
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/i,
    /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});/i,
    /window\.BambooHR\s*=\s*(\{[\s\S]*?\});/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      return JSON.parse(match[1]) as Record<string, unknown>;
    } catch {
      continue;
    }
  }

  return null;
}

function parseAnchorJobs(html: string, companyBase: string): BambooHrJobSummary[] {
  const jobs: BambooHrJobSummary[] = [];
  const anchorPattern = /<a[^>]+href=["']([^"']*\/careers\/(?:job\/)?[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const href = sanitizeTextBlock(match[1]);
    const anchorBody = stripHtml(match[2]);
    const title = sanitizeTextBlock(anchorBody.split("\n")[0] ?? anchorBody);
    if (!href || !title) continue;

    const sourceUrl = href.startsWith("http") ? href : `${companyBase}${href.startsWith("/") ? href : `/${href}`}`;
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);

    jobs.push({
      title,
      sourceUrl,
      applyUrl: sourceUrl,
      location: null,
      employmentType: null,
      department: null,
      description: title,
    });
  }

  return jobs;
}

function deepFindJobArrays(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    const candidates = value.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)
    );

    const jobLike = candidates.filter((item) => {
      const title = typeof item.title === "string" || typeof item.jobTitle === "string";
      const href = typeof item.url === "string" || typeof item.link === "string" || typeof item.jobOpeningUrl === "string";
      return title || href;
    });

    if (jobLike.length) return jobLike;

    return candidates.flatMap((item) => deepFindJobArrays(item));
  }

  return Object.values(value).flatMap((child) => deepFindJobArrays(child));
}

function parseJsonJobs(jsonValue: Record<string, unknown>, companyBase: string): BambooHrJobSummary[] {
  const rawJobs = deepFindJobArrays(jsonValue);
  const seen = new Set<string>();
  const results: BambooHrJobSummary[] = [];

  for (const rawJob of rawJobs) {
    const title = sanitizeTextBlock(
      typeof rawJob.title === "string"
        ? rawJob.title
        : typeof rawJob.jobTitle === "string"
          ? rawJob.jobTitle
          : ""
    );

    const rawHref =
      typeof rawJob.url === "string"
        ? rawJob.url
        : typeof rawJob.link === "string"
          ? rawJob.link
          : typeof rawJob.jobOpeningUrl === "string"
            ? rawJob.jobOpeningUrl
            : null;

    if (!title && !rawHref) continue;

    const sourceUrl = rawHref
      ? rawHref.startsWith("http")
        ? rawHref
        : `${companyBase}${rawHref.startsWith("/") ? rawHref : `/${rawHref}`}`
      : null;

    const uniqueKey = sourceUrl ?? title;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    const description =
      typeof rawJob.description === "string"
        ? stripHtml(rawJob.description)
        : typeof rawJob.jobDescription === "string"
          ? stripHtml(rawJob.jobDescription)
          : title;

    results.push({
      title: title || "Untitled role",
      sourceUrl,
      applyUrl: sourceUrl,
      location:
        typeof rawJob.location === "string"
          ? rawJob.location
          : typeof rawJob.jobLocation === "string"
            ? rawJob.jobLocation
            : null,
      employmentType:
        typeof rawJob.employmentType === "string"
          ? rawJob.employmentType
          : typeof rawJob.type === "string"
            ? rawJob.type
            : null,
      department:
        typeof rawJob.department === "string"
          ? rawJob.department
          : typeof rawJob.team === "string"
            ? rawJob.team
            : null,
      description,
    });
  }

  return results;
}

async function collectBambooHrJobs(companyBase: string, fetchImpl?: typeof fetch): Promise<BambooHrJobSummary[]> {
  const listUrls = [`${companyBase}/careers/`, `${companyBase}/careers/list`, `${companyBase}/jobs/`];
  let lastError: Error | null = null;

  for (const listUrl of listUrls) {
    try {
      const html = await fetchText(listUrl, fetchImpl);
      const embeddedJson = parseEmbeddedJson(html);
      const jobsFromJson = embeddedJson ? parseJsonJobs(embeddedJson, companyBase) : [];
      const jobsFromAnchors = parseAnchorJobs(html, companyBase);
      const jobs = [...jobsFromJson, ...jobsFromAnchors];
      if (jobs.length) return jobs;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown BambooHR adapter failure");
    }
  }

  throw new Error(`BambooHR import failed for ${companyBase}${lastError ? `: ${lastError.message}` : ""}`);
}

export const bambooHrAdapter: JobsAdapter = {
  slug: "bamboohr",

  async fetchJobs({ tokenOrSite, fetchImpl }) {
    const companyBase = buildCompanyBase(tokenOrSite);
    const companySlug = companyBase.replace(/^https?:\/\//i, "").split(".")[0] ?? tokenOrSite;
    const jobs = await collectBambooHrJobs(companyBase, fetchImpl);

    return {
      adapter: "bamboohr",
      jobs: jobs.map((job) => {
        const inferred = inferFields({
          title: job.title,
          location: job.location,
          commitment: job.employmentType,
          description: job.description,
        });

        return normalizeJobShape({
          sourceSlug: "bamboohr",
          externalId: job.sourceUrl ?? `${companySlug}-${job.title}`,
          title: job.title,
          company: companySlug,
          location: job.location,
          remoteType: inferred.remoteType,
          employmentType: inferred.employmentType,
          seniority: inferred.seniority,
          description: job.description,
          requirementsText: inferred.requirementsText,
          responsibilitiesText: inferred.responsibilitiesText,
          applyUrl: job.applyUrl,
          sourceUrl: job.sourceUrl,
          rawPayload: job,
        });
      }),
      fetchedAt: new Date().toISOString(),
    };
  },
};
