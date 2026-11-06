import type { JobImportSourceRow } from "./importRegistry";
import {
  importActiveJobSources,
  listJobImportSources,
  type ImportJobSourceRunResult,
  type ImportJobSourceRunSummary,
} from "./importRegistry";

export type JobImportScheduleDecision = {
  enabled: boolean;
  reason: string;
};

export type RunScheduledJobImportsOptions = {
  now?: Date;
  reason?: string;
  force?: boolean;
  sourceLimit?: number | null;
};

export type ScheduledJobImportSummary = {
  ok: boolean;
  mode: "scheduled" | "manual";
  reason: string;
  startedAt: string;
  finishedAt: string;
  enabled: boolean;
  sourceLimit: number | null;
  dueSourceCount: number;
  selectedSourceCount: number;
  skippedSourceCount: number;
  counts: {
    created: number;
    updated: number;
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  sources: ImportJobSourceRunResult[];
};

function parseBoolean(value: string | undefined): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function isProductionEnvironment() {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function parseSourceLimit(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.max(1, Math.floor(parsed));
  return normalized;
}

export function getScheduledJobImportDecision(): JobImportScheduleDecision {
  const explicit = parseBoolean(process.env.JOB_IMPORT_SCHEDULE_ENABLED);

  if (explicit === true) {
    return { enabled: true, reason: "enabled_by_env" };
  }

  if (explicit === false) {
    return { enabled: false, reason: "disabled_by_env" };
  }

  if (isProductionEnvironment()) {
    return { enabled: true, reason: "enabled_in_production" };
  }

  return { enabled: false, reason: "disabled_outside_production" };
}

export function getScheduledJobImportSourceLimit(): number | null {
  return parseSourceLimit(process.env.JOB_IMPORT_MAX_SOURCES_PER_RUN);
}

export function isJobSourceDue(source: JobImportSourceRow, now = new Date()): boolean {
  if (!source.isActive) return false;

  const baseline = source.lastRunAt ?? source.lastSuccessAt;
  if (!baseline) return true;

  const refreshMs = Math.max(source.refreshHours, 1) * 60 * 60 * 1000;
  return now.getTime() - baseline.getTime() >= refreshMs;
}

function summarizeResults(
  summary: ImportJobSourceRunSummary,
  options: Required<Pick<RunScheduledJobImportsOptions, "reason" | "force">> & {
    startedAt: Date;
    finishedAt: Date;
    enabled: boolean;
    sourceLimit: number | null;
  }
): ScheduledJobImportSummary {
  const counts = {
    created: summary.results.reduce((sum, item) => sum + item.created, 0),
    updated: summary.results.reduce((sum, item) => sum + item.updated, 0),
    total: summary.results.reduce((sum, item) => sum + item.total, 0),
    succeeded: summary.results.filter((item) => item.ok).length,
    failed: summary.results.filter((item) => !item.ok).length,
    skipped: summary.skippedSourceCount,
  };

  return {
    ok: counts.failed === 0,
    mode: options.force ? "manual" : "scheduled",
    reason: options.reason,
    startedAt: options.startedAt.toISOString(),
    finishedAt: options.finishedAt.toISOString(),
    enabled: options.enabled,
    sourceLimit: options.sourceLimit,
    dueSourceCount: summary.dueSourceCount,
    selectedSourceCount: summary.selectedSourceCount,
    skippedSourceCount: summary.skippedSourceCount,
    counts,
    sources: summary.results,
  };
}

export async function runScheduledJobImports(
  options: RunScheduledJobImportsOptions = {}
): Promise<ScheduledJobImportSummary> {
  const startedAt = options.now ?? new Date();
  const decision = getScheduledJobImportDecision();
  const sourceLimit = options.sourceLimit ?? getScheduledJobImportSourceLimit();
  const reason = options.reason ?? (options.force ? "manual_trigger" : "cron");
  const force = options.force ?? false;

  if (!force && !decision.enabled) {
    const finishedAt = new Date();
    return {
      ok: true,
      mode: "scheduled",
      reason,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      enabled: false,
      sourceLimit,
      dueSourceCount: 0,
      selectedSourceCount: 0,
      skippedSourceCount: 0,
      counts: {
        created: 0,
        updated: 0,
        total: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      },
      sources: [],
    };
  }

  const summary = force
    ? await importActiveJobSources({
        now: startedAt,
        dueOnly: false,
        limit: sourceLimit,
      })
    : await importActiveJobSources({
        now: startedAt,
        dueOnly: true,
        limit: sourceLimit,
      });

  const finishedAt = new Date();

  return summarizeResults(summary, {
    startedAt,
    finishedAt,
    reason,
    force,
    enabled: force ? true : decision.enabled,
    sourceLimit,
  });
}

export async function previewScheduledJobImportRun(args?: {
  now?: Date;
  sourceLimit?: number | null;
}) {
  const now = args?.now ?? new Date();
  const sourceLimit = args?.sourceLimit ?? getScheduledJobImportSourceLimit();
  const decision = getScheduledJobImportDecision();
  const activeSources = await listJobImportSources({ activeOnly: true });
  const dueSources = activeSources.filter((source) => isJobSourceDue(source, now));
  const selectedSources = sourceLimit ? dueSources.slice(0, sourceLimit) : dueSources;

  return {
    enabled: decision.enabled,
    reason: decision.reason,
    sourceLimit,
    activeSourceCount: activeSources.length,
    dueSourceCount: dueSources.length,
    selectedSourceCount: selectedSources.length,
    selectedSources: selectedSources.map((source) => ({
      id: source.id,
      displayName: source.displayName,
      adapter: source.adapter,
      refreshHours: source.refreshHours,
      lastRunAt: source.lastRunAt?.toISOString() ?? null,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: source.lastErrorAt?.toISOString() ?? null,
    })),
  };
}
