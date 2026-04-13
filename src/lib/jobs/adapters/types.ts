import type { EmploymentType, NormalizedJobInput, RemoteType } from "@/lib/jobs/types";

export type JobsAdapterSlug = "greenhouse" | "lever" | "ashby";

export type AdapterFetchArgs = {
  tokenOrSite: string;
  includeCompensation?: boolean;
  fetchImpl?: typeof fetch;
};

export type AdapterFetchResult = {
  adapter: JobsAdapterSlug;
  jobs: NormalizedJobInput[];
  fetchedAt: string;
};

export type JobsAdapter = {
  slug: JobsAdapterSlug;
  fetchJobs(args: AdapterFetchArgs): Promise<AdapterFetchResult>;
};

export type GreenhouseBoardResponse = {
  jobs?: Array<{
    id: number;
    internal_job_id?: number | null;
    title?: string | null;
    updated_at?: string | null;
    requisition_id?: string | null;
    location?: { name?: string | null } | null;
    absolute_url?: string | null;
    content?: string | null;
    metadata?: Array<{
      id?: number;
      name?: string | null;
      value?: string | null;
      value_type?: string | null;
    }> | null;
    offices?: Array<{ name?: string | null; location?: string | null }> | null;
    departments?: Array<{ name?: string | null }> | null;
  }>;
  meta?: { total?: number };
};

export type LeverPosting = {
  id: string;
  text?: string | null;
  categories?: {
    location?: string | null;
    commitment?: string | null;
    team?: string | null;
    department?: string | null;
    allLocations?: string[] | null;
    level?: string | null;
  } | null;
  descriptionPlain?: string | null;
  descriptionBodyPlain?: string | null;
  lists?: Array<{
    text?: string | null;
    content?: string | null;
  }> | null;
  hostedUrl?: string | null;
  applyUrl?: string | null;
  workplaceType?: "unspecified" | "on-site" | "remote" | "hybrid" | null;
  salaryRange?: {
    currency?: string | null;
    interval?: string | null;
    min?: number | null;
    max?: number | null;
  } | null;
};

export type AshbyPostingResponse = {
  apiVersion?: string;
  jobs?: Array<{
    title?: string | null;
    location?: string | null;
    secondaryLocations?: Array<{ location?: string | null }> | null;
    department?: string | null;
    team?: string | null;
    isListed?: boolean | null;
    isRemote?: boolean | null;
    workplaceType?: "OnSite" | "Remote" | "Hybrid" | null;
    descriptionHtml?: string | null;
    descriptionPlain?: string | null;
    publishedAt?: string | null;
    employmentType?: "FullTime" | "PartTime" | "Intern" | "Contract" | "Temporary" | null;
    jobUrl?: string | null;
    applyUrl?: string | null;
    compensation?: {
      summaryComponents?: Array<{
        compensationType?: string | null;
        interval?: string | null;
        currencyCode?: string | null;
        minValue?: number | null;
        maxValue?: number | null;
      }> | null;
    } | null;
  }>;
};

export type InferredFields = {
  remoteType: RemoteType;
  employmentType: EmploymentType;
  seniority: string | null;
  requirementsText: string | null;
  responsibilitiesText: string | null;
  keywords: string[];
};
