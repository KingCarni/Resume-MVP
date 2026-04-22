import type { JobsAdapter } from "@/lib/jobs/adapters/types";
import { inferFields, normalizeJobShape, sanitizeTextBlock } from "@/lib/jobs/adapters/shared";

type WorkdayJobSummary = {
  title?: string | null;
  externalPath?: string | null;
  locationsText?: string | null;
  jobReqId?: string | null;
  postedOn?: string | null;
  bulletFields?: Array<{
    label?: string | null;
    text?: string | null;
  }> | null;
};

type WorkdayListResponse = {
  total?: number | null;
  jobPostings?: WorkdayJobSummary[] | null;
};

type WorkdayCandidate = {
  label: string;
  jobsUrl: string;
  companyHint: string;
  sourceBase: string;
};

const WORKDAY_HOST_VARIANTS = ["wd1", "wd3", "wd5", "wd12"];

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function trimToken(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "").trim();
}

function buildGuessedCandidates(tokenOrSite: string): WorkdayCandidate[] {
  const slug = slugify(tokenOrSite);
  if (!slug) return [];

  const candidates: WorkdayCandidate[] = [];
  for (const hostVariant of WORKDAY_HOST_VARIANTS) {
    const host = `${slug}.${hostVariant}.myworkdayjobs.com`;
    for (const site of unique([slug, "en-US", "careers", "external"])) {
      candidates.push({
        label: `${host}|${slug}|${site}`,
        jobsUrl: `https://${host}/wday/cxs/${encodeURIComponent(slug)}/${encodeURIComponent(site)}/jobs`,
        companyHint: slug,
        sourceBase: `https://${host}`,
      });
    }
  }

  return candidates;
}

function buildCandidatesFromUrl(urlValue: string): WorkdayCandidate[] {
  const parsed = new URL(urlValue);
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const cxsIndex = pathParts.findIndex((part) => part === "cxs");

  if (cxsIndex > -1 && pathParts[cxsIndex + 1] && pathParts[cxsIndex + 2]) {
    const tenant = pathParts[cxsIndex + 1];
    const site = pathParts[cxsIndex + 2];

    return [
      {
        label: `${parsed.host}|${tenant}|${site}`,
        jobsUrl: `${parsed.origin}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`,
        companyHint: tenant,
        sourceBase: parsed.origin,
      },
    ];
  }

  return buildGuessedCandidates(parsed.hostname.split(".")[0] ?? parsed.hostname);
}

function buildCandidates(tokenOrSite: string): WorkdayCandidate[] {
  const raw = trimToken(tokenOrSite);
  if (!raw) return [];

  if (/^https?:\/\//i.test(tokenOrSite.trim())) {
    return buildCandidatesFromUrl(tokenOrSite.trim());
  }

  const parts = raw.split("|").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 3) {
    const [host, tenant, site] = parts;
    return [
      {
        label: `${host}|${tenant}|${site}`,
        jobsUrl: `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`,
        companyHint: tenant,
        sourceBase: `https://${host}`,
      },
    ];
  }

  if (parts.length === 2) {
    const [tenant, site] = parts;
    return WORKDAY_HOST_VARIANTS.map((hostVariant) => {
      const host = `${tenant}.${hostVariant}.myworkdayjobs.com`;
      return {
        label: `${host}|${tenant}|${site}`,
        jobsUrl: `https://${host}/wday/cxs/${encodeURIComponent(tenant)}/${encodeURIComponent(site)}/jobs`,
        companyHint: tenant,
        sourceBase: `https://${host}`,
      };
    });
  }

  return buildGuessedCandidates(raw);
}

async function fetchWorkdayJobsPage(jobsUrl: string, offset: number, fetchImpl?: typeof fetch): Promise<WorkdayListResponse> {
  const response = await (fetchImpl ?? fetch)(jobsUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      appliedFacets: {},
      limit: 20,
      offset,
      searchText: "",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Fetch failed (${response.status}) for ${jobsUrl}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  return (await response.json()) as WorkdayListResponse;
}

function extractWorkdayDescription(job: WorkdayJobSummary): string {
  const bulletLines = (job.bulletFields ?? [])
    .map((field) => {
      const label = sanitizeTextBlock(field.label ?? "");
      const text = sanitizeTextBlock(field.text ?? "");
      if (!label && !text) return null;
      return label && text ? `${label}: ${text}` : label || text;
    })
    .filter((value): value is string => Boolean(value));

  return sanitizeTextBlock(bulletLines.join("\n"));
}

function buildSourceUrl(candidate: WorkdayCandidate, job: WorkdayJobSummary): string | null {
  const path = sanitizeTextBlock(job.externalPath ?? "");
  if (!path) return null;
  return `${candidate.sourceBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseWorkdayPostedAt(value: string | null | undefined): string | null {
  const raw = sanitizeTextBlock(value ?? "");
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  const lower = raw.toLowerCase();
  const now = new Date();

  if (/posted\s+today/.test(lower)) return now.toISOString();
  if (/posted\s+yesterday/.test(lower)) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }

  const match = lower.match(/posted\s+(\d+)\s+(hour|day|week|month)s?\s+ago/);
  if (!match) return null;

  const amount = Number(match[1] ?? 0);
  const unit = match[2] ?? "";
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unitMs = unit === "hour"
    ? 60 * 60 * 1000
    : unit === "day"
      ? 24 * 60 * 60 * 1000
      : unit === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : unit === "month"
          ? 30 * 24 * 60 * 60 * 1000
          : 0;

  if (!unitMs) return null;
  return new Date(now.getTime() - amount * unitMs).toISOString();
}

export const workdayAdapter: JobsAdapter = {
  slug: "workday",

  async fetchJobs({ tokenOrSite, fetchImpl }) {
    const candidates = buildCandidates(tokenOrSite);

    if (!candidates.length) {
      throw new Error(
        'Workday adapter requires a token in one of these forms: "tenant", "tenant|site", "host|tenant|site", or a full Workday jobs URL.'
      );
    }

    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        const collected: WorkdayJobSummary[] = [];
        let offset = 0;
        let total = 0;

        do {
          const payload = await fetchWorkdayJobsPage(candidate.jobsUrl, offset, fetchImpl);
          const batch = payload.jobPostings ?? [];
          total = payload.total ?? batch.length;
          collected.push(...batch);
          offset += batch.length;
          if (!batch.length) break;
        } while (offset < total);

        const jobs = collected
          .filter((job) => job.title)
          .map((job) => {
            const description = extractWorkdayDescription(job);
            const inferred = inferFields({
              title: job.title ?? "Untitled role",
              location: job.locationsText ?? null,
              description,
              commitment: job.bulletFields?.find((field) => /time type/i.test(field.label ?? ""))?.text ?? null,
            });

            return normalizeJobShape({
              sourceSlug: "workday",
              externalId: sanitizeTextBlock(job.jobReqId ?? "") || sanitizeTextBlock(job.externalPath ?? "") || null,
              title: job.title ?? "Untitled role",
              company: candidate.companyHint,
              location: job.locationsText ?? null,
              remoteType: inferred.remoteType,
              employmentType: inferred.employmentType,
              seniority: inferred.seniority,
              description,
              requirementsText: inferred.requirementsText,
              responsibilitiesText: inferred.responsibilitiesText,
              applyUrl: buildSourceUrl(candidate, job),
              sourceUrl: buildSourceUrl(candidate, job),
              postedAt: parseWorkdayPostedAt(job.postedOn),
              rawPayload: {
                candidate: candidate.label,
                job,
              },
            });
          });

        return {
          adapter: "workday",
          jobs,
          fetchedAt: new Date().toISOString(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown Workday adapter failure");
      }
    }

    throw new Error(`Workday import failed for all candidate patterns derived from "${tokenOrSite}"${lastError ? `: ${lastError.message}` : ""}`);
  },
};
