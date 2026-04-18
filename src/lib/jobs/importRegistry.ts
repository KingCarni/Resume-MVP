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

export type ImportJobSourceRunResult =
  | (ImportResult & {
      ok: true;
      sourceId: string;
      displayName: string;
      error: null;
      skipped: false;
    })
  | {
      ok: false;
      sourceId: string;
      displayName: string;
      adapter: JobsAdapterSlug;
      tokenOrSite: string;
      created: number;
      updated: number;
      total: number;
      fetchedAt: string;
      items: [];
      error: string;
      skipped: false;
    }
  | {
      ok: true;
      sourceId: string;
      displayName: string;
      adapter: JobsAdapterSlug;
      tokenOrSite: string;
      created: number;
      updated: number;
      total: number;
      fetchedAt: string;
      items: [];
      error: null;
      skipped: true;
    };

export type ImportJobSourceRunSummary = {
  results: ImportJobSourceRunResult[];
  dueSourceCount: number;
  selectedSourceCount: number;
  skippedSourceCount: number;
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

function isSourceDue(source: JobImportSourceRow, now = new Date()): boolean {
  if (!source.isActive) return false;

  const baseline = source.lastRunAt ?? source.lastSuccessAt;
  if (!baseline) return true;

  const refreshMs = normalizeRefreshHours(source.refreshHours) * 60 * 60 * 1000;
  return now.getTime() - baseline.getTime() >= refreshMs;
}

function buildFailureResult(source: JobImportSourceRow, error: unknown): ImportJobSourceRunResult {
  return {
    ok: false,
    sourceId: source.id,
    displayName: source.displayName,
    adapter: source.adapter,
    tokenOrSite: source.tokenOrSite,
    created: 0,
    updated: 0,
    total: 0,
    fetchedAt: new Date().toISOString(),
    items: [],
    error: error instanceof Error ? error.message : "Unknown import failure",
    skipped: false,
  };
}

function buildSkippedResult(source: JobImportSourceRow): ImportJobSourceRunResult {
  return {
    ok: true,
    sourceId: source.id,
    displayName: source.displayName,
    adapter: source.adapter,
    tokenOrSite: source.tokenOrSite,
    created: 0,
    updated: 0,
    total: 0,
    fetchedAt: new Date().toISOString(),
    items: [],
    error: null,
    skipped: true,
  };
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
): Promise<ImportJobSourceRunResult> {
  const table = getSourceTable();

  const source = await table.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    throw new Error(`Job import source not found: ${sourceId}`);
  }

  return runImportForSource(source);
}

export async function importActiveJobSources(args?: {
  now?: Date;
  dueOnly?: boolean;
  limit?: number | null;
}): Promise<ImportJobSourceRunSummary> {
  const now = args?.now ?? new Date();
  const dueOnly = args?.dueOnly ?? false;
  const limit = args?.limit ?? null;

  const sources = await listJobImportSources({ activeOnly: true });
  const dueSources = dueOnly ? sources.filter((source) => isSourceDue(source, now)) : sources;
  const selectedSources = limit ? dueSources.slice(0, limit) : dueSources;
  const results: ImportJobSourceRunResult[] = [];

  for (const source of selectedSources) {
    const result = await runImportForSource(source);
    results.push(result);
  }

  return {
    results,
    dueSourceCount: dueSources.length,
    selectedSourceCount: selectedSources.length,
    skippedSourceCount: Math.max(dueSources.length - selectedSources.length, 0),
  };
}

async function runImportForSource(source: JobImportSourceRow): Promise<ImportJobSourceRunResult> {
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
      ok: true,
      sourceId: source.id,
      displayName: source.displayName,
      error: null,
      skipped: false,
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

    console.error("[job-import-source] failed", {
      sourceId: source.id,
      displayName: source.displayName,
      adapter: source.adapter,
      tokenOrSite: source.tokenOrSite,
      error: error instanceof Error ? error.message : error,
    });

    return buildFailureResult(source, error);
  }
}
