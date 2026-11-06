"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { trackJobEvent } from "@/lib/analytics/jobs";

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

type JobApplicationStatus = "applied" | "interview" | "offer" | "rejected" | "archived";
type JobsWorkspaceTab = "saved" | "applied";

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
  savedAt: string | null;
  source: { slug: string; name: string };
  application: null | {
    status: JobApplicationStatus;
    appliedAt: string;
    updatedAt: string;
  };
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
  view?: JobsWorkspaceTab;
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

const APPLICATION_STATUS_OPTIONS: Array<{ value: JobApplicationStatus; label: string }> = [
  { value: "applied", label: "Applied" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
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

function formatMoney(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return null;
  const safeCurrency = currency || "USD";
  const formatter = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 0,
  });
  if (min != null && max != null) return `${formatter.format(min)} – ${formatter.format(max)}`;
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
  if (profile.yearsExperience != null && profile.yearsExperience > 0) details.push(`${profile.yearsExperience}y`);
  if (profile.seniority && profile.seniority !== "unknown") details.push(titleCase(profile.seniority));
  const updated = formatProfileUpdated(profile.updatedAt);
  if (updated) details.push(`Updated ${updated}`);
  return details.length > 0 ? `${label} • ${details.join(" • ")}` : label;
}

function feedbackClasses(tone: FeedbackTone) {
  if (tone === "success") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "error") return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

function createApplyPackSessionId() {
  return `applypack_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function applicationStatusLabel(status: JobApplicationStatus) {
  return APPLICATION_STATUS_OPTIONS.find((option) => option.value === status)?.label || "Applied";
}

function applicationStatusTone(status: JobApplicationStatus) {
  if (status === "interview") return "border-violet-400/20 bg-violet-500/10 text-violet-200";
  if (status === "offer") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (status === "rejected") return "border-rose-400/20 bg-rose-500/10 text-rose-200";
  if (status === "archived") return "border-slate-400/20 bg-slate-500/10 text-slate-200";
  return "border-cyan-400/20 bg-cyan-500/10 text-cyan-200";
}

function applicationAnalyticsEvent(status: JobApplicationStatus) {
  if (status === "interview") return "job_application_moved_to_interview" as const;
  if (status === "offer") return "job_application_moved_to_offer" as const;
  if (status === "rejected") return "job_application_marked_rejected" as const;
  if (status === "archived") return "job_application_archived" as const;
  return "job_application_marked_applied" as const;
}

export default function SavedJobsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const currentTab: JobsWorkspaceTab = tabParam === "applied" ? "applied" : "saved";

  const [profiles, setProfiles] = useState<ResumeProfileItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [jobs, setJobs] = useState<SavedJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [savingJobIds, setSavingJobIds] = useState<Record<string, boolean>>({});
  const [applicationLoadingIds, setApplicationLoadingIds] = useState<Record<string, boolean>>({});
  const [launchingJobIds, setLaunchingJobIds] = useState<Record<string, TailorLaunchMode | undefined>>({});

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("activeResumeProfileId");
    if (stored) setSelectedProfileId(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedProfileId) window.localStorage.setItem("activeResumeProfileId", selectedProfileId);
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
        const response = await fetch("/api/resume-profiles", { method: "GET", cache: "no-store" });
        const json = (await response.json()) as ResumeProfilesResponse;
        if (!response.ok || !json.ok || !active) return;
        const items = Array.isArray(json.items) ? json.items : [];
        setProfiles(items);
        setSelectedProfileId((current) =>
          current && items.some((profile) => profile.id === current) ? current : current ? "" : current,
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
    async function loadWorkspaceJobs() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("view", currentTab);
        if (selectedProfileId) params.set("resumeProfileId", selectedProfileId);
        const response = await fetch(`/api/jobs/saved?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json()) as SavedJobsResponse;
        if (!response.ok || !json.ok) throw new Error(json.error || "Could not load jobs workspace.");
        if (!active) return;
        const items = Array.isArray(json.items) ? json.items : [];
        setJobs(items);
        trackJobEvent({
          event: "jobs_feed_view",
          resumeProfileId: selectedProfileId || undefined,
          route: "/jobs/saved",
          mode: "browse",
          totalJobs: items.length,
          meta: { source: currentTab === "applied" ? "applied_jobs" : "saved_jobs", tab: currentTab },
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load jobs workspace.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadWorkspaceJobs();
    return () => {
      active = false;
    };
  }, [currentTab, selectedProfileId]);

  function setTab(nextTab: JobsWorkspaceTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function launchTailorFlow(job: SavedJobItem, mode: TailorLaunchMode) {
    if (!selectedProfileId) {
      setFeedback({ tone: "info", message: "Choose a resume profile before tailoring a job." });
      return;
    }

    const actionLabel =
      mode === "resume" ? "Tailor Resume" : mode === "cover_letter" ? "Generate Cover Letter" : "Tailor Both";

    setLaunchingJobIds((current) => ({ ...current, [job.id]: mode }));

    try {
      const response = await fetch(`/api/jobs/${job.id}/context`, { method: "GET", cache: "no-store" });
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
        meta: { source: currentTab === "applied" ? "applied_jobs" : "saved_jobs", tab: currentTab },
      });

      const destination =
        mode === "resume"
          ? `/resume?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(selectedProfileId)}`
          : mode === "cover_letter"
            ? `/cover-letter?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(selectedProfileId)}`
            : `/resume?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(selectedProfileId)}&bundle=apply-pack&next=cover-letter`;

      window.location.href = destination;
    } catch (launchError) {
      setFeedback({
        tone: "error",
        message: launchError instanceof Error ? launchError.message : `Could not start ${actionLabel}.`,
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
        "Resume profile cleared. Jobs remain available, but fit scoring and tailoring actions are disabled until you pick one again.",
    });
  }

  async function unsaveJob(job: SavedJobItem) {
    setSavingJobIds((current) => ({ ...current, [job.id]: true }));
    try {
      const response = await fetch(`/api/jobs/${job.id}/save`, { method: "DELETE" });
      const json = (await response.json().catch(() => ({ ok: response.ok }))) as { ok?: boolean; error?: string };
      if (!response.ok || json.ok === false) throw new Error(json.error || "Could not unsave job.");
      setJobs((current) => current.filter((item) => item.id !== job.id));
      setFeedback({ tone: "success", message: `${job.title} removed from saved jobs.` });
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
        meta: { action: "unsave", source: "saved_jobs", tab: currentTab },
      });
    } catch (unsaveError) {
      setFeedback({
        tone: "error",
        message: unsaveError instanceof Error ? unsaveError.message : "Could not unsave job.",
      });
    } finally {
      setSavingJobIds((current) => ({ ...current, [job.id]: false }));
    }
  }

  async function updateApplicationStatus(job: SavedJobItem, status: JobApplicationStatus) {
    setApplicationLoadingIds((current) => ({ ...current, [job.id]: true }));
    try {
      const response = await fetch(`/api/jobs/${job.id}/application`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await response.json().catch(() => ({ ok: response.ok }))) as { ok?: boolean; error?: string };
      if (!response.ok || json.ok === false) {
        throw new Error(json.error || "Could not update application status.");
      }

      if (currentTab === "saved" && status === "applied") {
        setJobs((current) => current.filter((item) => item.id !== job.id));
      } else {
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  application: {
                    status,
                    appliedAt: item.application?.appliedAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                }
              : item,
          ),
        );
      }

      setFeedback({
        tone: "success",
        message: `${job.title} marked as ${applicationStatusLabel(status).toLowerCase()}.`,
      });
      trackJobEvent({
        event: applicationAnalyticsEvent(status),
        jobId: job.id,
        resumeProfileId: selectedProfileId || undefined,
        company: job.company,
        jobTitle: job.title,
        sourceSlug: job.source.slug,
        route: "/jobs/saved",
        mode: "browse",
        matchScore: job.match?.totalScore ?? null,
        meta: { source: currentTab === "applied" ? "applied_jobs" : "saved_jobs", tab: currentTab, status },
      });
    } catch (statusError) {
      setFeedback({
        tone: "error",
        message: statusError instanceof Error ? statusError.message : "Could not update application status.",
      });
    } finally {
      setApplicationLoadingIds((current) => ({ ...current, [job.id]: false }));
    }
  }

  const emptyMessage = useMemo(() => {
    if (currentTab === "applied") {
      return "Jobs you mark as applied will show up here so you can track interviews, offers, rejections, and archive outcomes without losing the original job context.";
    }
    return selectedProfile
      ? `Saved jobs keep ${selectedProfile.title || "your selected profile"} attached so you can launch tailoring quickly when you're ready to apply.`
      : "Save promising jobs while you browse, then pick a resume profile when you want fit scoring and tailoring shortcuts.";
  }, [currentTab, selectedProfile]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2.2rem] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.96))] p-6 shadow-[0_32px_100px_rgba(2,6,23,0.55)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/80">Jobs workspace</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Saved and applied jobs</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Keep your shortlist clean, mark jobs as applied when you take action, and track interview or offer progress without leaving the jobs workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Browse Jobs
            </Link>
            <Link
              href={selectedProfileId ? `/jobs?resumeProfileId=${encodeURIComponent(selectedProfileId)}` : "/jobs"}
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Back to Feed
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Workspace view</p>
            <div className="flex flex-wrap gap-2">
              {(["saved", "applied"] as JobsWorkspaceTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTab(tab)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition",
                    currentTab === tab
                      ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                      : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/20 hover:bg-slate-800",
                  )}
                >
                  {tab === "saved" ? "Saved" : "Applied"}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[260px] max-w-xl">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resume profile</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
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
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </section>

      {feedback ? (
        <div className={cn("rounded-2xl border px-4 py-3 text-sm", feedbackClasses(feedback.tone))}>{feedback.message}</div>
      ) : null}

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
          <h2 className="text-lg font-semibold">Could not load jobs workspace</h2>
          <p className="mt-2 text-sm text-rose-100/90">{error}</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-center shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-white">{currentTab === "saved" ? "No saved jobs yet" : "No applied jobs yet"}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{emptyMessage}</p>
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
            const salary = formatMoney(job.salaryMin, job.salaryMax, job.salaryCurrency);
            const detailHref = `/jobs/${job.id}${selectedProfileId ? `?resumeProfileId=${encodeURIComponent(selectedProfileId)}` : ""}`;
            const launchingMode = launchingJobIds[job.id];
            const applicationStatus = job.application?.status ?? null;
            const applicationLoading = !!applicationLoadingIds[job.id];
            const statusDate = currentTab === "applied" ? job.application?.updatedAt || job.application?.appliedAt || null : job.savedAt;
            return (
              <article
                key={job.id}
                className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_24%),radial-gradient(circle_at_86%_18%,rgba(59,130,246,0.10),transparent_26%),rgba(2,6,23,0.80)] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl transition hover:border-cyan-400/30"
              >
                <div className="pointer-events-none absolute -right-8 top-0 h-28 w-28 rounded-full bg-cyan-400/8 blur-3xl" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                        {job.source.name}
                      </span>
                      {applicationStatus ? (
                        <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", applicationStatusTone(applicationStatus))}>
                          {applicationStatusLabel(applicationStatus)}
                        </span>
                      ) : null}
                      <span className="text-xs text-slate-400">
                        {currentTab === "applied" ? `${applicationStatusLabel(applicationStatus || "applied")} ${formatDate(statusDate)}` : `Saved ${formatDate(statusDate)}`}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{job.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-300">
                      <span className="font-medium text-slate-100">{job.company}</span>
                      <span>•</span>
                      <span>{job.location || "Location not listed"}</span>
                      <span>•</span>
                      <span>{titleCase(job.remoteType)}</span>
                      <span>•</span>
                      <span>{titleCase(job.seniority)}</span>
                    </div>
                    {salary ? (
                      <p className="mt-3 text-sm font-medium text-emerald-300">{salary}</p>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">Salary not listed</p>
                    )}
                    {job.match?.explanationShort ? (
                      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">{job.match.explanationShort}</p>
                    ) : (
                      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
                        {selectedProfileId
                          ? "Open the job to inspect the fit and launch tailoring."
                          : "Select a profile to add fit scoring to this workspace."}
                      </p>
                    )}
                  </div>

                  <div className="flex min-w-[280px] flex-col gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.24)]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Match</p>
                      <p className="mt-1 text-3xl font-bold text-white">{job.match?.totalScore != null ? `${job.match.totalScore}%` : "—"}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {selectedProfileId ? "Based on your selected profile" : "No profile selected"}
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
                          meta: { source: currentTab === "applied" ? "applied_jobs" : "saved_jobs", tab: currentTab },
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
                      {launchingMode === "resume" ? "Starting Tailor Resume..." : "Tailor Resume (5 credits)"}
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
                      {launchingMode === "cover_letter" ? "Starting Cover Letter..." : "Generate Cover Letter (5 credits)"}
                    </button>

                    <button
                      type="button"
                      onClick={() => launchTailorFlow(job, "apply_pack")}
                      disabled={!selectedProfileId || !!launchingMode}
                      className={cn(
                        "inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition",
                        selectedProfileId ? "hover:from-cyan-400 hover:to-emerald-300" : "cursor-not-allowed opacity-60",
                        launchingMode && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {launchingMode === "apply_pack" ? "Starting Tailor Both..." : "Tailor Both (8 credits)"}
                    </button>

                    {currentTab === "saved" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => updateApplicationStatus(job, "applied")}
                          disabled={applicationLoading}
                          className="inline-flex items-center justify-center rounded-2xl bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {applicationLoading ? "Updating..." : "Mark Applied"}
                        </button>
                        <button
                          type="button"
                          onClick={() => unsaveJob(job)}
                          disabled={!!savingJobIds[job.id]}
                          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingJobIds[job.id] ? "Removing..." : "Unsave"}
                        </button>
                      </>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {APPLICATION_STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateApplicationStatus(job, option.value)}
                            disabled={applicationLoading}
                            className={cn(
                              "rounded-2xl border px-3 py-2 text-xs font-semibold transition",
                              applicationStatus === option.value
                                ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                                : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10",
                              applicationLoading && "cursor-not-allowed opacity-60",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
