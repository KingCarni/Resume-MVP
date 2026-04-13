import type { JobsAdapter, JobsAdapterSlug } from "@/lib/jobs/adapters/types";
import { greenhouseAdapter } from "@/lib/jobs/adapters/greenhouse";
import { leverAdapter } from "@/lib/jobs/adapters/lever";
import { ashbyAdapter } from "@/lib/jobs/adapters/ashby";

const adapters: Record<JobsAdapterSlug, JobsAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
};

export function getJobsAdapter(slug: JobsAdapterSlug): JobsAdapter {
  const adapter = adapters[slug];

  if (!adapter) {
    throw new Error(`Unsupported jobs adapter: ${slug}`);
  }

  return adapter;
}

export { greenhouseAdapter, leverAdapter, ashbyAdapter };
export type { JobsAdapter, JobsAdapterSlug, AdapterFetchArgs, AdapterFetchResult } from "@/lib/jobs/adapters/types";
