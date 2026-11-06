import type { AshbyPostingResponse, JobsAdapter } from "@/lib/jobs/adapters/types";
import { fetchJson, inferEmploymentType, inferFields, normalizeJobShape, stripHtml } from "@/lib/jobs/adapters/shared";

export const ashbyAdapter: JobsAdapter = {
  slug: "ashby",

  async fetchJobs({ tokenOrSite, includeCompensation = true, fetchImpl }) {
    const jobBoardName = tokenOrSite.trim();

    if (!jobBoardName) {
      throw new Error("Ashby adapter requires a job board name.");
    }

    const payload = await fetchJson<AshbyPostingResponse>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(jobBoardName)}?includeCompensation=${includeCompensation ? "true" : "false"}`,
      undefined,
      fetchImpl
    );

    const jobs = (payload.jobs ?? [])
      .filter((job) => job.isListed !== false && job.jobUrl)
      .map((job) => {
        const location = job.location || job.secondaryLocations?.map((item) => item.location).filter(Boolean).join(" / ") || null;
        const description = job.descriptionPlain?.trim() || stripHtml(job.descriptionHtml || "");
        const salarySummary = job.compensation?.summaryComponents?.find(
          (component) => component.compensationType === "Salary"
        );

        const inferred = inferFields({
          title: job.title ?? "Untitled role",
          location,
          workplaceType: job.workplaceType ?? null,
          commitment: job.employmentType ?? null,
          description,
        });

        return normalizeJobShape({
          sourceSlug: "ashby",
          externalId: job.jobUrl ?? job.applyUrl ?? `${job.title ?? "job"}-${jobBoardName}`,
          title: job.title ?? "Untitled role",
          company: jobBoardName,
          location,
          remoteType: inferred.remoteType,
          employmentType: inferEmploymentType(job.employmentType ?? null),
          seniority: inferred.seniority,
          description,
          requirementsText: inferred.requirementsText,
          responsibilitiesText: inferred.responsibilitiesText,
          applyUrl: job.applyUrl ?? null,
          sourceUrl: job.jobUrl ?? null,
          postedAt: job.publishedAt ?? null,
          salaryMin: salarySummary?.minValue ?? null,
          salaryMax: salarySummary?.maxValue ?? null,
          salaryCurrency: salarySummary?.currencyCode ?? null,
          rawPayload: job,
        });
      });

    return {
      adapter: "ashby",
      jobs,
      fetchedAt: new Date().toISOString(),
    };
  },
};
