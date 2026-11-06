"use client";

import { useMemo, useState } from "react";

type JobMatchWarmupAdminRow = {
  id: string;
  userId: string;
  resumeProfileId: string;
  profileTitle: string | null;
  userEmail: string | null;
  status: "pending" | "running" | "ready" | "failed" | "stale";
  processedCount: number;
  totalCandidateCount: number;
  progressPercent: number;
  cachedMatchCount: number;
  lastProcessedJobId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  isStuck: boolean;
  stuckReason: string | null;
  canRetry: boolean;
  canRunPass: boolean;
  canMarkStale: boolean;
};

type ActionName = "retry" | "mark_stale" | "run_pass";

function badgeTone(row: JobMatchWarmupAdminRow) {
  if (row.status === "failed") return "border-rose-400/30 bg-rose-500/15 text-rose-100";
  if (row.status === "stale") return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  if (row.status === "running") return "border-cyan-400/30 bg-cyan-500/15 text-cyan-100";
  if (row.status === "pending") return "border-white/20 bg-white/10 text-slate-100";
  if (row.status === "ready") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  return "border-white/20 bg-white/10 text-slate-100";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-CA");
}

function progressLabel(row: JobMatchWarmupAdminRow) {
  if (row.totalCandidateCount <= 0) return "0 / 0";
  return `${row.processedCount} / ${row.totalCandidateCount} (${row.progressPercent}%)`;
}

export default function JobMatchWarmupsAdminTable(props: {
  initialRows: JobMatchWarmupAdminRow[];
}) {
  const [rows, setRows] = useState<JobMatchWarmupAdminRow[]>(props.initialRows);
  const [loading, setLoading] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] += 1;
        if (row.isStuck) acc.stuck += 1;
        return acc;
      },
      {
        total: 0,
        pending: 0,
        running: 0,
        ready: 0,
        failed: 0,
        stale: 0,
        stuck: 0,
      },
    );
  }, [rows]);

  async function refresh() {
    const response = await fetch("/api/admin/job-match-warmups", {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          rows?: JobMatchWarmupAdminRow[];
          error?: string;
        }
      | null;

    if (!response.ok || !payload?.ok || !Array.isArray(payload.rows)) {
      throw new Error(payload?.error ?? "Failed to refresh warmup monitor");
    }

    setRows(payload.rows);
  }

  async function runAction(row: JobMatchWarmupAdminRow, action: ActionName) {
    setLoading(`${action}:${row.resumeProfileId}`);
    setFlash(null);

    try {
      const response = await fetch("/api/admin/job-match-warmups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          resumeProfileId: row.resumeProfileId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Warmup action failed");
      }

      await refresh();
      setFlash(`Action completed: ${action}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Warmup action failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {[
          ["Total", summary.total],
          ["Pending", summary.pending],
          ["Running", summary.running],
          ["Ready", summary.ready],
          ["Failed", summary.failed],
          ["Stale", summary.stale],
          ["Stuck", summary.stuck],
        ].map(([label, value], index) => (
          <div
            key={String(label)}
            className={`rounded-3xl border p-4 ${
              index % 2 === 0 ? "border-cyan-400/20 bg-cyan-500/10" : "border-white/10 bg-white/5"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">
              {label}
            </p>
            <div className="mt-2 text-2xl font-black text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
        <button
          type="button"
          onClick={() => void refresh()}
          className="shell-secondary-btn"
          disabled={loading != null}
        >
          Refresh
        </button>
        {flash ? <span className="text-xs text-cyan-100">{flash}</span> : null}
        <span className="ml-auto text-xs text-slate-400">
          Monitoring and recovery only — not a full worker console.
        </span>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5">
        <table className="min-w-[1320px] w-full text-left text-sm text-slate-200">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-slate-400">
              <th className="px-4 py-3">Profile / user</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Cached rows</th>
              <th className="px-4 py-3">Timing</th>
              <th className="px-4 py-3">Recovery notes</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const retryKey = `retry:${row.resumeProfileId}`;
              const staleKey = `mark_stale:${row.resumeProfileId}`;
              const runKey = `run_pass:${row.resumeProfileId}`;
              const busy = loading != null && loading.endsWith(`:${row.resumeProfileId}`);

              return (
                <tr key={row.id} className="border-t border-white/10 align-top first:border-t-0">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-white">
                      {row.profileTitle?.trim() || "Untitled profile"}
                    </div>
                    <div className="mt-1 text-xs text-slate-300">{row.userEmail || "Unknown user"}</div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      Profile ID: {row.resumeProfileId}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone(row)}`}>
                      {row.status}
                    </span>
                    {row.isStuck ? (
                      <div className="mt-2 text-xs font-semibold text-amber-200">
                        Stuck: {row.stuckReason || "Needs recovery"}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4">
                    <div className="font-semibold text-white">{progressLabel(row)}</div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-900/70">
                      <div
                        className="h-full rounded-full bg-cyan-300 transition-all"
                        style={{ width: `${Math.max(4, row.progressPercent)}%` }}
                      />
                    </div>
                    {row.lastProcessedJobId ? (
                      <div className="mt-2 text-[11px] text-slate-500">
                        Last job: {row.lastProcessedJobId}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-4 py-4">
                    <div className="font-semibold text-white">{row.cachedMatchCount}</div>
                    <div className="mt-1 text-xs text-slate-400">Persisted JobMatch rows</div>
                  </td>

                  <td className="px-4 py-4 text-xs leading-6 text-slate-300">
                    <div>Updated: {formatDate(row.updatedAt)}</div>
                    <div>Started: {formatDate(row.startedAt)}</div>
                    <div>Completed: {formatDate(row.completedAt)}</div>
                  </td>

                  <td className="px-4 py-4 text-xs leading-6 text-slate-300">
                    {row.lastError ? (
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-rose-100">
                        {row.lastError}
                      </div>
                    ) : (
                      <div className="text-slate-500">No recorded error</div>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex flex-col items-end gap-2">
                      <button
                        type="button"
                        className="shell-secondary-btn"
                        disabled={busy || !row.canRunPass}
                        onClick={() => void runAction(row, "run_pass")}
                      >
                        {loading === runKey ? "Running…" : "Run pass"}
                      </button>
                      <button
                        type="button"
                        className="shell-secondary-btn"
                        disabled={busy || !row.canRetry}
                        onClick={() => void runAction(row, "retry")}
                      >
                        {loading === retryKey ? "Retrying…" : "Requeue"}
                      </button>
                      <button
                        type="button"
                        className="shell-secondary-btn"
                        disabled={busy || !row.canMarkStale}
                        onClick={() => void runAction(row, "mark_stale")}
                      >
                        {loading === staleKey ? "Marking…" : "Mark stale"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  No warmup rows found for the current filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
