"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { trackJobEvent } from "@/lib/analytics/jobs";
import {
  type PipelineStatus,
  pipelineStatusLabel,
  pipelineStatusTone,
  readPipelineStatusMap,
  writePipelineStatus,
} from "@/lib/jobs/pipelineStub";

type ResumeProfileItem = {
  id: string;
  title: string;
  summary?: string | null;
  seniority?: string | null;
  yearsExperience?: number | null;
  updatedAt?: string;
  normalizedTitles?: string[];
};
type ResumeProfilesResponse = {
  ok: boolean;
  items?: ResumeProfileItem[];
  error?: string;
};
type SavedJobItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  createdAt: string;
  savedAt: string;
  source: { slug: string; name: string };
  match: null | {
    totalScore: number;
    explanationShort: string | null;
    matchingSkills: unknown;
    missingSkills: unknown;
    computedAt: string;
  };
};
type SavedJobsResponse = {
  ok: boolean;
  items?: SavedJobItem[];
  error?: string;
};
type JobContextItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  seniority: string;
  employmentType: string;
  applyUrl: string | null;
  sourceUrl: string | null;
  description: string;
  requirementsText: string | null;
  responsibilitiesText: string | null;
  postedAt: string | null;
  jobContextText: string;
};
type JobContextResponse = {
  ok: boolean;
  item?: JobContextItem;
  error?: string;
};
type TailorLaunchMode = "resume" | "cover_letter" | "apply_pack";
type FeedbackTone = "success" | "error" | "info";
type FeedbackState = { tone: FeedbackTone; message: string } | null;
const PIPELINE_OPTIONS: Array<{ value: PipelineStatus; label: string }> = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "archived", label: "Archived" },
];
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
function titleCase(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function formatMoney(
  min: number | null,
  max: number | null,
  currency: string | null,
) {
  if (min == null && max == null) return null;
  const safeCurrency = currency || "USD";
  const formatter = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 0,
  });
  if (min != null && max != null)
    return `${formatter.format(min)} – ${formatter.format(max)}`;
  if (min != null) return `${formatter.format(min)}+`;
  return `Up to ${formatter.format(max as number)}`;
}
function formatDate(dateValue: string | null) {
  if (!dateValue) return "Unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
function formatProfileUpdated(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(date);
}
function profileOptionLabel(profile: ResumeProfileItem) {
  const label = profile.title?.trim() || "Resume Profile";
  const details: string[] = [];
  if (profile.yearsExperience != null && profile.yearsExperience > 0)
    details.push(`${profile.yearsExperience}y`);
  if (profile.seniority && profile.seniority !== "unknown")
    details.push(titleCase(profile.seniority));
  const updated = formatProfileUpdated(profile.updatedAt);
  if (updated) details.push(`Updated ${updated}`);
  return details.length > 0 ? `${label} • ${details.join(" • ")}` : label;
}
function feedbackClasses(tone: FeedbackTone) {
  if (tone === "success")
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "error")
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

export default function SavedJobsPage() {
  const [profiles, setProfiles] = useState<ResumeProfileItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [jobs, setJobs] = useState<SavedJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [savingJobIds, setSavingJobIds] = useState<Record<string, boolean>>({});
  const [launchingJobIds, setLaunchingJobIds] = useState<
    Record<string, TailorLaunchMode | undefined>
  >({});
  const [pipelineStatuses, setPipelineStatuses] = useState<
    Record<string, PipelineStatus>
  >({});
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("activeResumeProfileId");
    if (stored) setSelectedProfileId(stored);
    setPipelineStatuses(readPipelineStatusMap());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedProfileId)
      window.localStorage.setItem("activeResumeProfileId", selectedProfileId);
    else window.localStorage.removeItem("activeResumeProfileId");
  }, [selectedProfileId]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  useEffect(() => {
    let active = true;
    async function loadProfiles() {
      try {
        const response = await fetch("/api/resume-profiles", {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json()) as ResumeProfilesResponse;
        if (!response.ok || !json.ok || !active) return;
        const items = Array.isArray(json.items) ? json.items : [];
        setProfiles(items);
        setSelectedProfileId((current) =>
          current && items.some((profile) => profile.id === current)
            ? current
            : current
              ? ""
              : current,
        );
      } catch {}
    }
    loadProfiles();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    async function loadSavedJobs() {
      setLoading(true);
      setError(null);
      try {
        const query = selectedProfileId
          ? `?resumeProfileId=${encodeURIComponent(selectedProfileId)}`
          : "";
        const response = await fetch(`/api/jobs/saved${query}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json()) as SavedJobsResponse;
        if (!response.ok || !json.ok)
          throw new Error(json.error || "Could not load saved jobs.");
        if (!active) return;
        const items = Array.isArray(json.items) ? json.items : [];
        setJobs(items);
        trackJobEvent({
          event: "jobs_feed_view",
          resumeProfileId: selectedProfileId || undefined,
          route: "/jobs/saved",
          mode: "browse",
          totalJobs: items.length,
          meta: { source: "saved_jobs" },
        });
      } catch (error) {
        if (!active) return;
        setError(
          error instanceof Error ? error.message : "Could not load saved jobs.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSavedJobs();
    return () => {
      active = false;
    };
  }, [selectedProfileId]);
  async function launchTailorFlow(
    job: SavedJobItem,
    mode: TailorLaunchMode,
  ) {
    if (!selectedProfileId) {
      setFeedback({
        tone: "info",
        message: "Choose a resume profile before tailoring a saved job.",
      });
      return;
    }

    const actionLabel =
      mode === "resume"
        ? "Tailor Resume"
        : mode === "cover_letter"
          ? "Generate Cover Letter"
          : "Tailor Both";

    setLaunchingJobIds((current) => ({ ...current, [job.id]: mode }));

    try {
      const response = await fetch(`/api/jobs/${job.id}/context`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await response.json()) as JobContextResponse;

      if (!response.ok || !json.ok || !json.item) {
        throw new Error(json.error || "Could not load job context.");
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "gitajob.applyPack",
          JSON.stringify({
            bundle: "apply-pack",
            jobId: job.id,
            resumeProfileId: selectedProfileId,
            createdAt: new Date().toISOString(),
            bundleSessionId: createApplyPackSessionId(),
            sourceSlug: job.source.slug,
            nextStep: mode === "cover_letter" ? "cover-letter" : "resume",
            job: json.item,
          }),
        );
      }

      trackJobEvent({
        event:
          mode === "resume"
            ? "job_detail_tailor_resume_clicked"
            : mode === "cover_letter"
              ? "job_detail_cover_letter_clicked"
              : "job_detail_tailor_both_clicked",
        jobId: job.id,
        resumeProfileId: selectedProfileId,
        company: json.item.company,
        jobTitle: json.item.title,
        sourceSlug: job.source.slug,
        route: "/jobs/saved",
        matchScore: job.match?.totalScore ?? null,
        mode,
        meta: {
          source: "saved_jobs",
        },
      });

      const destination =
        mode === "resume"
          ? `/resume?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(selectedProfileId)}`
          : mode === "cover_letter"
            ? `/cover-letter?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(selectedProfileId)}`
            : `/resume?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(selectedProfileId)}&bundle=apply-pack&next=cover-letter`;

      window.location.href = destination;
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : `Could not start ${actionLabel}.`,
      });
    } finally {
      setLaunchingJobIds((current) => ({ ...current, [job.id]: undefined }));
    }
  }

  function clearProfile() {
    setSelectedProfileId("");
    setFeedback({
      tone: "info",
      message:
        "Resume profile cleared. Saved jobs remain available, but fit scoring and tailoring actions are disabled until you pick one again.",
    });
  }
  async function unsaveJob(job: SavedJobItem) {
    setSavingJobIds((current) => ({ ...current, [job.id]: true }));
    try {
      const response = await fetch(`/api/jobs/${job.id}/save`, {
        method: "DELETE",
      });
      const json = (await response
        .json()
        .catch(() => ({ ok: response.ok }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || json.ok === false)
        throw new Error(json.error || "Could not unsave job.");
      setJobs((current) => current.filter((item) => item.id !== job.id));
      setFeedback({
        tone: "success",
        message: `${job.title} removed from saved jobs.`,
      });
      trackJobEvent({
        event: "jobs_save_clicked",
        jobId: job.id,
        resumeProfileId: selectedProfileId || undefined,
        company: job.company,
        jobTitle: job.title,
        sourceSlug: job.source.slug,
        route: "/jobs/saved",
        mode: "browse",
        matchScore: job.match?.totalScore ?? null,
        meta: { action: "unsave", source: "saved_jobs" },
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Could not unsave job.",
      });
    } finally {
      setSavingJobIds((current) => ({ ...current, [job.id]: false }));
    }
  }
  function updatePipelineStatus(job: SavedJobItem, nextStatus: PipelineStatus) {
    writePipelineStatus(job.id, nextStatus);
    setPipelineStatuses((current) => ({ ...current, [job.id]: nextStatus }));
    setFeedback({
      tone: "info",
      message: `${job.title} marked as ${pipelineStatusLabel(nextStatus).toLowerCase()}.`,
    });
    trackJobEvent({
      event: "jobs_feed_view",
      jobId: job.id,
      resumeProfileId: selectedProfileId || undefined,
      company: job.company,
      jobTitle: job.title,
      sourceSlug: job.source.slug,
      route: "/jobs/saved",
      mode: "browse",
      matchScore: job.match?.totalScore ?? null,
      meta: { source: "saved_jobs", pipelineStatus: nextStatus },
    });
  }
  const emptyMessage = useMemo(
    () =>
      selectedProfileId
        ? "You have no saved jobs right now. Save promising roles from the jobs feed so you can return and tailor later."
        : "You have no saved jobs right now. Save promising roles from the jobs feed to create a reusable quick-return workflow.",
    [selectedProfileId],
  );
  return (
    <main className="min-h-screen pb-10 text-white">
      <div className="shell-wrap py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="shell-nav-link">
              Home
            </Link>
            <Link href="/jobs" className="shell-nav-link">
              Jobs
            </Link>
            <Link href="/resume" className="shell-nav-link">
              Resume
            </Link>
            <Link href="/cover-letter" className="shell-nav-link">
              Cover Letter
            </Link>
            <Link href="/account" className="shell-nav-link">
              Account
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/buy-credits" className="shell-primary-btn">
              Buy Credits
            </Link>
            <Link href="/donate" className="shell-secondary-btn">
              Donate
            </Link>
          </div>
        </div>
        <div className="mb-8 rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_78%_20%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.08),transparent_36%),rgba(2,6,23,0.84)] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Git-a-Job 2.0
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Saved Jobs
              </h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">
                Return to the roles you care about, inspect the fit quickly, and
                move them forward without pretending this is a full ATS.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={clearProfile}
                disabled={!selectedProfileId}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear Profile
              </button>
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Back to Jobs
              </Link>
            </div>
          </div>
        </div>
        {feedback ? (
          <div
            className={cn(
              "mb-6 rounded-2xl border px-4 py-3 text-sm",
              feedbackClasses(feedback.tone),
            )}
          >
            {feedback.message}
          </div>
        ) : null}
        <section className="mb-6 rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
          <div className="ml-auto max-w-[360px]">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
              Resume profile{profiles.length > 0 ? ` • ${profiles.length}` : ""}
            </label>
            <div className="flex gap-2">
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
              >
                <option value="">No profile selected</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileOptionLabel(profile)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={clearProfile}
                disabled={!selectedProfileId}
                className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>
        </section>
        {loading ? (
          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl"
              >
                <div className="h-5 w-56 rounded bg-white/10" />
                <div className="mt-3 h-4 w-40 rounded bg-white/10" />
                <div className="mt-6 h-20 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">
            <h2 className="text-lg font-semibold">Could not load saved jobs</h2>
            <p className="mt-2 text-sm text-rose-100/90">{error}</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-center shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-white">
              No saved jobs yet
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {emptyMessage}
            </p>
            <div className="mt-6">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Browse Jobs
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {jobs.map((job) => {
              const salary = formatMoney(
                job.salaryMin,
                job.salaryMax,
                job.salaryCurrency,
              );
              const detailHref = `/jobs/${job.id}${selectedProfileId ? `?resumeProfileId=${encodeURIComponent(selectedProfileId)}` : ""}`;
              const pipelineStatus = pipelineStatuses[job.id] ?? "saved";
              const launchingMode = launchingJobIds[job.id];
              return (
                <article
                  key={job.id}
                  className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.1),transparent_24%),rgba(2,6,23,0.78)] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),rgba(2,6,23,0.82)]"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                          {job.source.name}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium",
                            pipelineStatusTone(pipelineStatus),
                          )}
                        >
                          {pipelineStatusLabel(pipelineStatus)}
                        </span>
                        <span className="text-xs text-slate-400">
                          Saved {formatDate(job.savedAt)}
                        </span>
                      </div>
                      <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                        {job.title}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-300">
                        <span className="font-medium text-slate-100">
                          {job.company}
                        </span>
                        <span>•</span>
                        <span>{job.location || "Location not listed"}</span>
                        <span>•</span>
                        <span>{titleCase(job.remoteType)}</span>
                        <span>•</span>
                        <span>{titleCase(job.seniority)}</span>
                      </div>
                      {salary ? (
                        <p className="mt-3 text-sm font-medium text-emerald-300">
                          {salary}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-slate-400">
                          Salary not listed
                        </p>
                      )}
                      {job.match?.explanationShort ? (
                        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                          {job.match.explanationShort}
                        </p>
                      ) : (
                        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
                          {selectedProfileId
                            ? "Open the job to inspect the fit and launch tailoring."
                            : "Select a profile to add fit scoring to your saved-jobs workflow."}
                        </p>
                      )}
                      <div className="mt-5 flex flex-wrap gap-2">
                        {PIPELINE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              updatePipelineStatus(job, option.value)
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs font-semibold transition",
                              pipelineStatus === option.value
                                ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                                : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/20 hover:bg-slate-800",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex min-w-[260px] flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Match
                        </p>
                        <p className="mt-1 text-3xl font-bold text-white">
                          {job.match?.totalScore != null
                            ? `${job.match.totalScore}%`
                            : "—"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {selectedProfileId
                            ? "Based on your selected profile"
                            : "No profile selected"}
                        </p>
                      </div>
                      <Link
                        href={detailHref}
                        onClick={() =>
                          trackJobEvent({
                            event: "jobs_view_job_clicked",
                            jobId: job.id,
                            resumeProfileId: selectedProfileId || undefined,
                            company: job.company,
                            jobTitle: job.title,
                            sourceSlug: job.source.slug,
                            route: "/jobs/saved",
                            mode: "browse",
                            matchScore: job.match?.totalScore ?? null,
                            meta: { source: "saved_jobs" },
                          })
                        }
                        className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                      >
                        View Job
                      </Link>
                      <button
                        type="button"
                        onClick={() => launchTailorFlow(job, "resume")}
                        disabled={!selectedProfileId || !!launchingMode}
                        className={cn(
                          "inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition",
                          selectedProfileId
                            ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                            : "cursor-not-allowed bg-emerald-400/30 text-slate-200 opacity-60",
                          launchingMode && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {launchingMode === "resume"
                          ? "Starting Tailor Resume..."
                          : "Tailor Resume (5 credits)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => launchTailorFlow(job, "cover_letter")}
                        disabled={!selectedProfileId || !!launchingMode}
                        className={cn(
                          "inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                          selectedProfileId
                            ? "border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                            : "cursor-not-allowed border-white/10 bg-white/5 text-slate-400 opacity-60",
                          launchingMode && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {launchingMode === "cover_letter"
                          ? "Starting Cover Letter..."
                          : "Generate Cover Letter (5 credits)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => launchTailorFlow(job, "apply_pack")}
                        disabled={!selectedProfileId || !!launchingMode}
                        className={cn(
                          "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition",
                          selectedProfileId
                            ? "hover:from-cyan-400 hover:to-emerald-300"
                            : "cursor-not-allowed opacity-60",
                          launchingMode && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {launchingMode === "apply_pack"
                          ? "Starting Tailor Both..."
                          : "Tailor Both (8 credits)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => unsaveJob(job)}
                        disabled={!!savingJobIds[job.id]}
                        className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingJobIds[job.id] ? "Removing..." : "Unsave"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
