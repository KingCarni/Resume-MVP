import type { JobsAdapter, GreenhouseBoardResponse } from "@/lib/jobs/adapters/types";
import { fetchJson, inferFields, normalizeJobShape, stripHtml } from "@/lib/jobs/adapters/shared";

type GreenhouseBoardMeta = {
  name?: string;
};

export const greenhouseAdapter: JobsAdapter = {
  slug: "greenhouse",

  async fetchJobs({ tokenOrSite, fetchImpl }) {
    const boardToken = tokenOrSite.trim();

    if (!boardToken) {
      throw new Error("Greenhouse adapter requires a board token.");
    }

    const [board, payload] = await Promise.all([
      fetchJson<GreenhouseBoardMeta>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}`,
        undefined,
        fetchImpl
      ).catch(() => ({ name: boardToken })),
      fetchJson<GreenhouseBoardResponse>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
        undefined,
        fetchImpl
      ),
    ]);

    const companyName = board.name?.trim() || boardToken;

    const jobs = (payload.jobs ?? [])
      .filter((job) => job.id && job.title)
      .map((job) => {
        const location = job.location?.name || job.offices?.map((office) => office.name || office.location).filter(Boolean).join(" / ") || null;
        const description = stripHtml(job.content || "");
        const metadataText = (job.metadata ?? [])
          .map((item) => `${item.name ?? ""}: ${item.value ?? ""}`)
          .join("\n");

        const inferred = inferFields({
          title: job.title ?? "Untitled role",
          location,
          description: [description, metadataText].filter(Boolean).join("\n"),
        });

        return normalizeJobShape({
          sourceSlug: "greenhouse",
          externalId: String(job.id),
          title: job.title ?? "Untitled role",
          company: companyName,
          location,
          remoteType: inferred.remoteType,
          employmentType: inferred.employmentType,
          seniority: inferred.seniority,
          description,
          requirementsText: inferred.requirementsText,
          responsibilitiesText: inferred.responsibilitiesText,
          applyUrl: job.absolute_url ?? null,
          sourceUrl: job.absolute_url ?? null,
          postedAt: job.updated_at ?? null,
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          rawPayload: job,
        });
      });

    return {
      adapter: "greenhouse",
      jobs,
      fetchedAt: new Date().toISOString(),
    };
  },
};
