import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { JobsAdapterSlug } from "./adapters";
import { prisma } from "../prisma";
import { importJobsFromAdapter, type ImportResult } from "./import";

export type JobImportSourceInput = {
  adapter: JobsAdapterSlug;
  tokenOrSite: string;
  displayName: string;
  companyOverride?: string | null;
  refreshHours?: number | null;
  isActive?: boolean | null;
};

export type JobImportSourceRow = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  adapter: JobsAdapterSlug;
  tokenOrSite: string;
  displayName: string;
  companyOverride: string | null;
  isActive: boolean;
  refreshHours: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
};

type JobImportSourceDelegate = {
  findMany(args?: unknown): Promise<JobImportSourceRow[]>;
  findUnique(args: unknown): Promise<JobImportSourceRow | null>;
  upsert(args: unknown): Promise<JobImportSourceRow>;
  update(args: unknown): Promise<JobImportSourceRow>;
};

function getSourceTable(): JobImportSourceDelegate {
  const delegate = (prisma as unknown as { jobImportSource?: JobImportSourceDelegate }).jobImportSource;

  if (!delegate) {
    throw new Error(
      'Missing prisma.jobImportSource delegate. Run the migration/schema update for JobImportSource first.'
    );
  }

  return delegate;
}

function normalizeRefreshHours(value?: number | null): number {
  if (!value || Number.isNaN(value)) return 24;
  return Math.min(Math.max(Math.floor(value), 1), 168);
}

export async function upsertJobImportSource(
  input: JobImportSourceInput
): Promise<JobImportSourceRow> {
  const table = getSourceTable();

  const adapter = input.adapter;
  const tokenOrSite = input.tokenOrSite.trim();
  const displayName = input.displayName.trim();

  if (!tokenOrSite) throw new Error("tokenOrSite is required.");
  if (!displayName) throw new Error("displayName is required.");

  return table.upsert({
    where: {
      adapter_tokenOrSite: {
        adapter,
        tokenOrSite,
      },
    },
    update: {
      displayName,
      companyOverride: input.companyOverride?.trim() || null,
      isActive: input.isActive ?? true,
      refreshHours: normalizeRefreshHours(input.refreshHours),
    },
    create: {
      id: randomUUID(),
      adapter,
      tokenOrSite,
      displayName,
      companyOverride: input.companyOverride?.trim() || null,
      isActive: input.isActive ?? true,
      refreshHours: normalizeRefreshHours(input.refreshHours),
    },
  });
}

export async function listJobImportSources(args?: {
  activeOnly?: boolean;
}): Promise<JobImportSourceRow[]> {
  const table = getSourceTable();

  return table.findMany({
    where: args?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });
}

export async function importOneJobSource(
  sourceId: string
): Promise<ImportResult & { sourceId: string; displayName: string }> {
  const table = getSourceTable();

  const source = await table.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    throw new Error(`Job import source not found: ${sourceId}`);
  }

  return runImportForSource(source);
}

export async function importActiveJobSources(): Promise<
  Array<ImportResult & { sourceId: string; displayName: string }>
> {
  const sources = await listJobImportSources({ activeOnly: true });
  const results: Array<ImportResult & { sourceId: string; displayName: string }> = [];

  for (const source of sources) {
    const result = await runImportForSource(source);
    results.push(result);
  }

  return results;
}

async function runImportForSource(
  source: JobImportSourceRow
): Promise<ImportResult & { sourceId: string; displayName: string }> {
  const table = getSourceTable();
  const startedAt = new Date();

  await table.update({
    where: { id: source.id },
    data: {
      lastRunAt: startedAt,
      lastError: null,
    },
  });

  try {
    const result = await importJobsFromAdapter({
      adapter: source.adapter,
      tokenOrSite: source.tokenOrSite,
      companyOverride: source.companyOverride,
    });

    await table.update({
      where: { id: source.id },
      data: {
        lastSuccessAt: new Date(),
        lastErrorAt: null,
        lastError: null,
      },
    });

    return {
      ...result,
      sourceId: source.id,
      displayName: source.displayName,
    };
  } catch (error) {
    await table.update({
      where: { id: source.id },
      data: {
        lastErrorAt: new Date(),
        lastError:
          error instanceof Error ? error.message.slice(0, 2000) : "Unknown import failure",
      },
    });

    throw error;
  }
}
