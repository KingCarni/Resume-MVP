import { createHash } from "node:crypto";

import {
  EmploymentType,
  JobStatus,
  Prisma,
  RemoteType,
  SeniorityLevel,
} from "@prisma/client";

import { getJobsAdapter, type JobsAdapterSlug } from "./adapters";
import { prisma } from "../prisma";
import type { NormalizedJobInput } from "./types";

type ImportFromAdapterArgs = {
  adapter: JobsAdapterSlug;
  tokenOrSite: string;
  includeCompensation?: boolean;
  companyOverride?: string | null;
};

type ImportedJobSummary = {
  title: string;
  company: string;
  externalId: string | null;
  action: "created" | "updated";
};

export type ImportResult = {
  adapter: JobsAdapterSlug;
  tokenOrSite: string;
  created: number;
  updated: number;
  total: number;
  fetchedAt: string;
  items: ImportedJobSummary[];
};

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function createFallbackExternalId(job: NormalizedJobInput): string {
  const basis = [
    job.sourceSlug,
    job.sourceUrl ?? "",
    job.applyUrl ?? "",
    job.title,
    job.company,
  ].join("|");

  return `fallback_${createHash("sha1").update(basis).digest("hex")}`;
}

function extractSkillsAndKeywords(job: NormalizedJobInput) {
  const combined = [
    job.title,
    job.description,
    job.requirementsText ?? "",
    job.responsibilitiesText ?? "",
  ]
    .join("\n")
    .toLowerCase();

  const words = Array.from(
    new Set(
      combined
        .split(/[^a-z0-9+.#/-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && token.length <= 40)
    )
  );

  return {
    skills: words.slice(0, 60),
    keywords: words.slice(0, 80),
  };
}

function normalizeRemoteType(value: string | null | undefined): RemoteType {
  switch ((value ?? "").trim().toLowerCase()) {
    case "remote":
      return RemoteType.remote;
    case "hybrid":
      return RemoteType.hybrid;
    case "onsite":
    case "on_site":
    case "on-site":
      return RemoteType.onsite;
    default:
      return RemoteType.unknown;
  }
}

function normalizeEmploymentType(value: string | null | undefined): EmploymentType {
  switch ((value ?? "").trim().toLowerCase()) {
    case "full_time":
    case "full-time":
    case "fulltime":
      return EmploymentType.full_time;
    case "part_time":
    case "part-time":
    case "parttime":
      return EmploymentType.part_time;
    case "contract":
      return EmploymentType.contract;
    case "temporary":
    case "temp":
      return EmploymentType.temporary;
    case "freelance":
      return EmploymentType.freelance;
    case "internship":
    case "intern":
      return EmploymentType.internship;
    default:
      return EmploymentType.unknown;
  }
}

function normalizeSeniorityLevel(value: string | null | undefined): SeniorityLevel {
  switch ((value ?? "").trim().toLowerCase()) {
    case "entry":
      return SeniorityLevel.entry;
    case "junior":
      return SeniorityLevel.junior;
    case "mid":
      return SeniorityLevel.mid;
    case "senior":
      return SeniorityLevel.senior;
    case "lead":
      return SeniorityLevel.lead;
    case "manager":
      return SeniorityLevel.manager;
    case "staff":
      return SeniorityLevel.staff;
    default:
      return SeniorityLevel.unknown;
  }
}

function normalizeRawPayload(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value == null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

async function ensureSource(slug: JobsAdapterSlug) {
  return prisma.jobSource.upsert({
    where: { slug },
    update: {
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      kind: "ats_feed",
      isActive: true,
    },
    create: {
      slug,
      name: slug.charAt(0).toUpperCase() + slug.slice(1),
      kind: "ats_feed",
      isActive: true,
    },
  });
}

async function upsertNormalizedJob(
  sourceId: string,
  job: NormalizedJobInput
): Promise<ImportedJobSummary> {
  const externalId = job.externalId?.trim() || createFallbackExternalId(job);

  const existing = await prisma.job.findFirst({
    where: {
      sourceId,
      externalId,
    },
    select: {
      id: true,
    },
  });

  const { skills, keywords } = extractSkillsAndKeywords(job);

  const payload = {
    sourceId,
    externalId,
    company: job.company.trim(),
    companyNormalized: normalizeText(job.company),
    title: job.title.trim(),
    titleNormalized: normalizeText(job.title),
    location: job.location?.trim() || null,
    locationNormalized: normalizeText(job.location),
    remoteType: normalizeRemoteType(job.remoteType),
    employmentType: normalizeEmploymentType(job.employmentType),
    seniority: normalizeSeniorityLevel(job.seniority),
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency?.trim() || null,
    description: job.description.trim(),
    requirementsText: job.requirementsText?.trim() || null,
    responsibilitiesText: job.responsibilitiesText?.trim() || null,
    skills,
    keywords,
    postedAt: job.postedAt ? new Date(job.postedAt) : null,
    applyUrl: job.applyUrl?.trim() || null,
    sourceUrl: job.sourceUrl?.trim() || null,
    rawPayload: normalizeRawPayload(job.rawPayload),
    status: JobStatus.active,
  };

  if (existing) {
    await prisma.job.update({
      where: { id: existing.id },
      data: payload,
    });

    return {
      title: payload.title,
      company: payload.company,
      externalId,
      action: "updated",
    };
  }

  await prisma.job.create({
    data: payload,
  });

  return {
    title: payload.title,
    company: payload.company,
    externalId,
    action: "created",
  };
}

export async function importJobsFromAdapter(
  args: ImportFromAdapterArgs
): Promise<ImportResult> {
  const adapter = getJobsAdapter(args.adapter);
  const source = await ensureSource(adapter.slug);

  const fetched = await adapter.fetchJobs({
    tokenOrSite: args.tokenOrSite,
    includeCompensation: args.includeCompensation,
  });

  const normalizedJobs = fetched.jobs.map((job) => ({
    ...job,
    company: args.companyOverride?.trim() || job.company,
  }));

  const items: ImportedJobSummary[] = [];

  for (const job of normalizedJobs) {
    const result = await upsertNormalizedJob(source.id, job);
    items.push(result);
  }

  return {
    adapter: adapter.slug,
    tokenOrSite: args.tokenOrSite,
    created: items.filter((item) => item.action === "created").length,
    updated: items.filter((item) => item.action === "updated").length,
    total: items.length,
    fetchedAt: fetched.fetchedAt,
    items,
  };
}
