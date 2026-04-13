import type { JobsAdapter, LeverPosting } from "@/lib/jobs/adapters/types";
import { fetchJson, inferFields, normalizeJobShape, stripHtml } from "@/lib/jobs/adapters/shared";

type LeverListResponse = LeverPosting[];

function extractLeverList(posting: LeverPosting, labelMatchers: RegExp[]): string | null {
  const match = (posting.lists ?? []).find((item) => labelMatchers.some((matcher) => matcher.test((item.text ?? "").toLowerCase())));
  return match?.content ? stripHtml(match.content) : null;
}

export const leverAdapter: JobsAdapter = {
  slug: "lever",

  async fetchJobs({ tokenOrSite, fetchImpl }) {
    const site = tokenOrSite.trim();

    if (!site) {
      throw new Error("Lever adapter requires a site slug.");
    }

    const pageSize = 100;
    let skip = 0;
    const collected: LeverPosting[] = [];

    while (true) {
      const url =
        `https://api.lever.co/v0/postings/${encodeURIComponent(site)}` +
        `?mode=json&limit=${pageSize}&skip=${skip}`;

      const batch = await fetchJson<LeverListResponse>(url, undefined, fetchImpl);

      collected.push(...batch);

      if (batch.length < pageSize) break;
      skip += pageSize;
    }

    const jobs = collected.map((posting) => {
      const location = posting.categories?.location || posting.categories?.allLocations?.join(" / ") || null;
      const requirementsText = extractLeverList(posting, [/requirement/, /qualification/]);
      const responsibilitiesText = extractLeverList(posting, [/responsibilit/, /what you.?ll do/, /duties/]);
      const description = posting.descriptionPlain?.trim() || stripHtml(posting.descriptionBodyPlain || "");

      const inferred = inferFields({
        title: posting.text ?? "Untitled role",
        location,
        workplaceType: posting.workplaceType ?? null,
        commitment: posting.categories?.commitment ?? null,
        description,
        requirementsText,
        responsibilitiesText,
      });

      return normalizeJobShape({
        sourceSlug: "lever",
        externalId: posting.id,
        title: posting.text ?? "Untitled role",
        company: site,
        location,
        remoteType: inferred.remoteType,
        employmentType: inferred.employmentType,
        seniority: inferred.seniority ?? posting.categories?.level ?? null,
        description,
        requirementsText: inferred.requirementsText,
        responsibilitiesText: inferred.responsibilitiesText,
        applyUrl: posting.applyUrl ?? null,
        sourceUrl: posting.hostedUrl ?? null,
        postedAt: null,
        salaryMin: posting.salaryRange?.min ?? null,
        salaryMax: posting.salaryRange?.max ?? null,
        salaryCurrency: posting.salaryRange?.currency ?? null,
        rawPayload: posting,
      });
    });

    return {
      adapter: "lever",
      jobs,
      fetchedAt: new Date().toISOString(),
    };
  },
};
