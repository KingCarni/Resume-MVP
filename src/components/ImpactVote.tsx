"use client";

import React, { useEffect, useMemo, useState } from "react";

type ImpactEvent = "interview" | "job";
type ImpactAnswer = "yes" | "no" | "notyet";

type StatsPayload = {
  ok: boolean;
  counts: {
    interview: { yes: number; no: number; notyet: number };
    job: { yes: number; no: number; notyet: number };
  };
  totals: {
    interviewTotal: number;
    jobTotal: number;
    allResponses: number;
  };
  helpRates: {
    interviewHelpRate: number | null;
    jobHelpRate: number | null;
  };
};

function pctOrDash(v: number | null) {
  return typeof v === "number" ? `${v}%` : "—";
}

function getOrCreateClientId() {
  const key = "gitajob_client_id";
  const existing = typeof window !== "undefined" ? localStorage.getItem(key) : null;
  if (existing) return existing;

  const id =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `cid_${Math.random().toString(16).slice(2)}_${Date.now()}`);

  localStorage.setItem(key, id);
  return id;
}

export default function ImpactVote(props: {
  feature?: string;  // e.g. "resume" or "cover_letter"
  template?: string; // your template id
}) {
  const { feature, template } = props;

  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [voteLoading, setVoteLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const clientId = useMemo(() => (typeof window !== "undefined" ? getOrCreateClientId() : ""), []);

  async function loadStats() {
    setLoading(true);
    try {
      const res = await fetch("/api/impact-stats", { cache: "no-store" });
      const json = (await res.json()) as StatsPayload;
      if (json?.ok) setStats(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function vote(event: ImpactEvent, answer: ImpactAnswer) {
    setVoteLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/impact-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, answer, feature, template, clientId }),
      });

      const payload = await res.json();

      if (!res.ok) {
        const reason = payload?.error || "Could not record your answer.";
        setMsg(reason);
        return;
      }

      setMsg("Thanks — logged.");
      await loadStats();
    } catch (e: any) {
      setMsg(e?.message || "Network error.");
    } finally {
      setVoteLoading(false);
    }
  }

  const interviewCount = stats
    ? stats.counts.interview.yes + stats.counts.interview.no + stats.counts.interview.notyet
    : 0;

  const jobCount = stats
    ? stats.counts.job.yes + stats.counts.job.no + stats.counts.job.notyet
    : 0;

  return (
    <div className="mt-4 rounded-2xl border border-black/10 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold">Did Git-a-Job help?</div>
          <div className="mt-1 text-xs text-black/60 dark:text-white/60">
            Anonymous + 1-click. Helps us measure real outcomes.
          </div>
        </div>

        <div className="text-xs text-black/60 dark:text-white/60">
          {loading ? "Loading…" : stats ? `Responses: ${stats.totals.allResponses}` : ""}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
              Interview help rate
            </div>
            <div className="text-xs font-extrabold">{pctOrDash(stats?.helpRates.interviewHelpRate ?? null)}</div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={voteLoading}
              onClick={() => vote("interview", "yes")}
              className="rounded-xl border border-black/10 bg-black px-3 py-2 text-xs font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
            >
              Yes
            </button>
            <button
              type="button"
              disabled={voteLoading}
              onClick={() => vote("interview", "no")}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              No
            </button>
            <button
              type="button"
              disabled={voteLoading}
              onClick={() => vote("interview", "notyet")}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Not yet
            </button>
          </div>

          <div className="mt-2 text-[11px] text-black/60 dark:text-white/60">
            Totals: {interviewCount}
          </div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black/10">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold text-black/70 dark:text-white/70">
              Job offer help rate
            </div>
            <div className="text-xs font-extrabold">{pctOrDash(stats?.helpRates.jobHelpRate ?? null)}</div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={voteLoading}
              onClick={() => vote("job", "yes")}
              className="rounded-xl border border-black/10 bg-black px-3 py-2 text-xs font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
            >
              Yes
            </button>
            <button
              type="button"
              disabled={voteLoading}
              onClick={() => vote("job", "no")}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              No
            </button>
            <button
              type="button"
              disabled={voteLoading}
              onClick={() => vote("job", "notyet")}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              Not yet
            </button>
          </div>

          <div className="mt-2 text-[11px] text-black/60 dark:text-white/60">
            Totals: {jobCount}
          </div>
        </div>
      </div>

      {msg ? (
        <div className="mt-3 text-xs font-extrabold text-black/70 dark:text-white/70">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
