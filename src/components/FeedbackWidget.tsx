"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Counts = {
  interview: number;
  job: number;
};

type Props = {
  enabled?: boolean;
  delayDays?: number;
  surface?: "resume" | "cover-letter" | "other";

  /**
   * "card" = big block (default)
   * "header" = compact inline pill for top nav
   */
  variant?: "card" | "header";
};

// Key helper so Resume + Cover Letter don't stomp each other
function k(surface: string, base: string) {
  return `gaj_${surface}_${base}`;
}

export default function FeedbackWidget({
  enabled = true,
  delayDays = 3,
  surface = "resume",
  variant = "card",
}: Props) {
  const delayMs = useMemo(() => Math.max(0, delayDays) * 24 * 60 * 60 * 1000, [delayDays]);

  const LS_FIRST_SEEN = useMemo(() => k(surface, "first_seen_at"), [surface]);
  const LS_FEEDBACK_GIVEN = useMemo(() => k(surface, "feedback_given"), [surface]); // "interview" | "job"
  const LS_FEEDBACK_DISMISSED = useMemo(() => k(surface, "feedback_dismissed"), [surface]); // "1"

  const [readyToShow, setReadyToShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [given, setGiven] = useState<"" | "interview" | "job">("");
  const [counts, setCounts] = useState<Counts>({ interview: 0, job: 0 });
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [submitting, setSubmitting] = useState<"" | "interview" | "job">("");
  const [err, setErr] = useState<string>("");

  const mountedRef = useRef(false);

  // Compute "ready" and keep it updated (so if user leaves the tab open, it will flip to true later)
  useEffect(() => {
    if (typeof window === "undefined") return;

    mountedRef.current = true;

    const readGate = () => {
      try {
        const dismissedRaw = window.localStorage.getItem(LS_FEEDBACK_DISMISSED);
        const givenRaw = window.localStorage.getItem(LS_FEEDBACK_GIVEN);

        if (dismissedRaw === "1") setDismissed(true);
        if (givenRaw === "interview" || givenRaw === "job") setGiven(givenRaw);

        const now = Date.now();
        const firstSeenRaw = window.localStorage.getItem(LS_FIRST_SEEN);
        let firstSeen = Number(firstSeenRaw || 0);

        if (!firstSeen || Number.isNaN(firstSeen)) {
          firstSeen = now;
          window.localStorage.setItem(LS_FIRST_SEEN, String(firstSeen));
        }

        setReadyToShow(now - firstSeen >= delayMs);
      } catch {
        // if localStorage blocked, fall back to showing immediately
        setReadyToShow(true);
      }
    };

    readGate();

    const id = window.setInterval(readGate, 60_000); // check once per minute
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [LS_FEEDBACK_DISMISSED, LS_FEEDBACK_GIVEN, LS_FIRST_SEEN, delayMs]);

  async function refreshCounts() {
    setLoadingCounts(true);
    setErr("");
    try {
      const r = await fetch("/api/feedback", { method: "GET", cache: "no-store" });
      const j = (await r.json()) as any;
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to load feedback counts");
      setCounts({
        interview: Number(j?.counts?.interview ?? 0),
        job: Number(j?.counts?.job ?? 0),
      });
    } catch (e: any) {
      setErr(e?.message || "Failed to load counts");
    } finally {
      setLoadingCounts(false);
    }
  }

  // Load counts only when we will actually show
  useEffect(() => {
    if (!enabled) return;
    if (!readyToShow) return;
    if (dismissed) return;

    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, readyToShow, dismissed]);

  async function submit(type: "interview" | "job") {
    if (submitting) return;
    setSubmitting(type);
    setErr("");

    // optimistic bump
    setCounts((c) => ({
      interview: c.interview + (type === "interview" ? 1 : 0),
      job: c.job + (type === "job" ? 1 : 0),
    }));

    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, surface }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to submit feedback");

      setGiven(type);
      try {
        window.localStorage.setItem(LS_FEEDBACK_GIVEN, type);
      } catch {}
    } catch (e: any) {
      // rollback optimistic bump
      setCounts((c) => ({
        interview: c.interview - (type === "interview" ? 1 : 0),
        job: c.job - (type === "job" ? 1 : 0),
      }));
      setErr(e?.message || "Submit failed");
    } finally {
      setSubmitting("");
    }
  }

  function close() {
    setDismissed(true);
    try {
      window.localStorage.setItem(LS_FEEDBACK_DISMISSED, "1");
    } catch {}
  }

  // Gate conditions
  if (!enabled) return null;
  if (!readyToShow) return null;
  if (dismissed) return null;

  const alreadyVoted = given === "interview" || given === "job";

  // -------------------------
  // Header variant (compact)
  // -------------------------
  if (variant === "header") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
          <div className="whitespace-nowrap text-xs font-extrabold text-black/80 dark:text-white/80">
            Did Git-a-Job help?
          </div>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10" />

          <button
            type="button"
            onClick={() => submit("interview")}
            disabled={alreadyVoted || submitting !== ""}
            className="rounded-lg border border-black/10 bg-black px-2 py-1 text-xs font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
            title="It helped me get an interview"
          >
            Interview
          </button>

          <button
            type="button"
            onClick={() => submit("job")}
            disabled={alreadyVoted || submitting !== ""}
            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            title="It helped me get a job"
          >
            Job
          </button>

          <div className="ml-1 whitespace-nowrap text-[11px] text-black/60 dark:text-white/60">
            {loadingCounts ? (
              <span>…</span>
            ) : (
              <span>
                I: <span className="font-extrabold">{counts.interview}</span> · J:{" "}
                <span className="font-extrabold">{counts.job}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={close}
            className="ml-1 rounded-lg border border-black/10 bg-white/70 px-2 py-1 text-[11px] font-extrabold text-black/60 hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
            aria-label="Dismiss feedback prompt"
            title="Dismiss"
          >
            ✕
          </button>
        </div>

        {err ? (
          <div className="hidden text-[11px] font-extrabold text-red-600 dark:text-red-300 lg:block">
            {err}
          </div>
        ) : null}
      </div>
    );
  }

  // -------------------------
  // Card variant
  // -------------------------
  return (
    <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold text-black/90 dark:text-white/90">
            Quick check-in
          </div>
          <div className="mt-1 text-sm text-black/70 dark:text-white/70">
            Did Git-a-Job help you land an interview or a job?
          </div>
        </div>

        <button
          type="button"
          onClick={close}
          className="rounded-lg border border-black/10 bg-white/70 px-2 py-1 text-xs font-extrabold text-black/70 hover:bg-black/5 dark:border-white/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit("interview")}
          disabled={alreadyVoted || submitting !== ""}
          className="rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-extrabold text-white hover:opacity-90 disabled:opacity-50 dark:border-white/10"
        >
          {given === "interview" ? "✓ Marked: Interview" : "Got Interview"}
        </button>

        <button
          type="button"
          onClick={() => submit("job")}
          disabled={alreadyVoted || submitting !== ""}
          className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
        >
          {given === "job" ? "✓ Marked: Job" : "Got Job"}
        </button>

        <div className="ml-auto text-xs text-black/60 dark:text-white/60">
          {loadingCounts ? (
            <span>Loading…</span>
          ) : (
            <span>
              Interviews: <span className="font-extrabold">{counts.interview}</span> · Jobs:{" "}
              <span className="font-extrabold">{counts.job}</span>
            </span>
          )}
        </div>
      </div>

      {err ? (
        <div className="mt-2 text-xs font-extrabold text-red-600 dark:text-red-300">{err}</div>
      ) : null}

      {alreadyVoted ? (
        <div className="mt-2 text-xs text-black/60 dark:text-white/60">
          Thanks — this helps measure real outcomes.
        </div>
      ) : (
        <div className="mt-2 text-xs text-black/50 dark:text-white/50">
          This prompt appears after {delayDays} days to avoid spammy “instant” feedback.
        </div>
      )}
    </div>
  );
}
