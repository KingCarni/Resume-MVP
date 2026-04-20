"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackJobEvent } from "@/lib/analytics/jobs";

type JobDetailItem = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: string;
  seniority: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  description: string;
  requirementsText: string | null;
  responsibilitiesText: string | null;
  source: {
    id: string;
    slug: string;
    name: string;
    kind: string;
    isActive: boolean;
  };
  savedRecord: { id: string; createdAt: string } | null;
  hiddenRecord: { id: string; createdAt: string; reason: string | null } | null;
  isSaved: boolean;
  isHidden: boolean;
};
type JobDetailResponse = { ok: boolean; item?: JobDetailItem; error?: string };
type JobMatchItem = {
  totalScore: number;
  titleScore: number;
  skillScore: number;
  seniorityScore: number;
  locationScore: number;
  keywordScore: number;
  explanationShort: string | null;
  matchingSkills: unknown;
  missingSkills: unknown;
  computedAt: string;
};
type JobMatchResponse = { ok: boolean; item?: JobMatchItem; error?: string };
type ResumeProfileItem = {
  id: string;
  title: string;
  summary: string | null;
  seniority: string | null;
  yearsExperience: number | null;
  updatedAt: string;
  normalizedTitles?: string[];
};
type ResumeProfilesResponse = {
  ok: boolean;
  items?: ResumeProfileItem[];
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
type JobsDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ resumeProfileId?: string }>;
};
type FeedbackTone = "success" | "error" | "info";
type FeedbackState = { tone: FeedbackTone; message: string } | null;

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
  const formatter = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  });
  if (min != null && max != null)
    return `${formatter.format(min)} – ${formatter.format(max)}`;
  if (min != null) return `${formatter.format(min)}+`;
  return `Up to ${formatter.format(max as number)}`;
}
function formatDate(dateValue: string | null) {
  if (!dateValue) return "Recently added";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Recently added";
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
  if (profile.yearsExperience != null && profile.yearsExperience > 0) {
    details.push(`${profile.yearsExperience}y`);
  }
  if (profile.seniority && profile.seniority !== "unknown") {
    details.push(titleCase(profile.seniority));
  }
  const updated = formatProfileUpdated(profile.updatedAt);
  if (updated) {
    details.push(`Updated ${updated}`);
  }
  return details.length > 0 ? `${label} • ${details.join(" • ")}` : label;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
function sanitizeJobText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<(p|div|ul|ol|section)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<strong[^>]*>/gi, "")
    .replace(/<\/strong>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const LIST_MARKER_ONLY_PATTERN = /^(?:(?:[-*•▪◦‣·]|\d+[.)])\s*)+$/;

function cleanSectionLine(line: string) {
  const normalized = line
    .trim()
    .replace(/^(?:(?:[-*•▪◦‣·]|\d+[.)])\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";
  if (LIST_MARKER_ONLY_PATTERN.test(normalized)) return "";
  if (!/[a-zA-Z0-9]/.test(normalized)) return "";
  return normalized;
}

function sectionLines(value: string | null | undefined) {
  const cleaned = sanitizeJobText(value);
  if (!cleaned) return [];

  const seen = new Set<string>();
  return cleaned
    .split(/\n+/)
    .map((line) => cleanSectionLine(line))
    .filter((line) => {
      if (!line) return false;
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function feedbackClasses(tone: FeedbackTone) {
  if (tone === "success")
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "error")
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}
function createApplyPackSessionId() {
  return `applypack_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function overallFitBand(score: number) {
  if (score >= 78) return "Strong match";
  if (score >= 62) return "Good match";
  if (score >= 45) return "Worth a look";
  if (score >= 30) return "Stretch";
  return "Long shot";
}

function overallFitBandClasses(score: number) {
  if (score >= 78)
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (score >= 62)
    return "border-cyan-400/20 bg-cyan-500/10 text-cyan-200";
  if (score >= 45)
    return "border-violet-400/20 bg-violet-500/10 text-violet-200";
  if (score >= 30)
    return "border-amber-400/20 bg-amber-500/10 text-amber-200";
  return "border-rose-400/20 bg-rose-500/10 text-rose-200";
}

function ScoreRow(props: {
  label: string;
  value: number;
  max: number;
  loading?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(props.max, Math.round(props.value)));
  const percent = Math.max(
    0,
    Math.min(100, Math.round((safeValue / Math.max(1, props.max)) * 100)),
  );
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
        <span>{props.label}</span>
        <span className="font-semibold text-white">
          {props.loading ? "…" : `${percent}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-cyan-400 transition-all"
          style={{ width: `${props.loading ? 12 : percent}%` }}
        />
      </div>
    </div>
  );
}


export default function JobDetailPage(props: JobsDetailPageProps) {
  const [jobId, setJobId] = useState("");
  const [resumeProfileId, setResumeProfileId] = useState("");
  const [profiles, setProfiles] = useState<ResumeProfileItem[]>([]);
  const [job, setJob] = useState<JobDetailItem | null>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);
  const [match, setMatch] = useState<JobMatchItem | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [hideLoading, setHideLoading] = useState(false);
  const [launchMode, setLaunchMode] = useState<"resume" | "cover_letter" | "apply_pack" | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === resumeProfileId) || null,
    [profiles, resumeProfileId],
  );
  const trackedDetailViewRef = useRef("");
  const trackedProfileSelectionRef = useRef("");

  useEffect(() => {
    let active = true;
    async function resolveRouteState() {
      const resolvedParams = await props.params;
      const resolvedSearch = props.searchParams
        ? await props.searchParams
        : undefined;
      if (!active) return;
      setJobId(resolvedParams.id);
      if (resolvedSearch?.resumeProfileId) {
        setResumeProfileId(resolvedSearch.resumeProfileId);
        return;
      }
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("activeResumeProfileId");
        if (stored) setResumeProfileId(stored);
      }
    }
    resolveRouteState();
    return () => {
      active = false;
    };
  }, [props]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (resumeProfileId)
      window.localStorage.setItem("activeResumeProfileId", resumeProfileId);
    else window.localStorage.removeItem("activeResumeProfileId");
  }, [resumeProfileId]);
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
        setResumeProfileId((current) =>
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
    if (!jobId) return;
    let active = true;
    async function loadJob() {
      setJobLoading(true);
      setJobError(null);
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json()) as JobDetailResponse;
        if (!response.ok || !json.ok || !json.item)
          throw new Error(json.error || "Could not load job detail.");
        if (!active) return;
        setJob(json.item);
        setSaved(json.item.isSaved);
      } catch (error) {
        if (!active) return;
        setJobError(
          error instanceof Error ? error.message : "Could not load job detail.",
        );
      } finally {
        if (active) setJobLoading(false);
      }
    }
    loadJob();
    return () => {
      active = false;
    };
  }, [jobId]);
  useEffect(() => {
    if (!jobId) return;
    if (!resumeProfileId) {
      setMatch(null);
      setMatchError(null);
      setMatchLoading(false);
      return;
    }
    let active = true;
    async function loadMatch() {
      setMatchLoading(true);
      setMatchError(null);
      try {
        const response = await fetch(
          `/api/jobs/${jobId}/match?resumeProfileId=${encodeURIComponent(resumeProfileId)}`,
          { method: "GET", cache: "no-store" },
        );
        const json = (await response.json()) as JobMatchResponse;
        if (!response.ok || !json.ok || !json.item)
          throw new Error(json.error || "Could not load match data.");
        if (!active) return;
        setMatch(json.item);
      } catch (error) {
        if (!active) return;
        setMatchError(
          error instanceof Error ? error.message : "Could not load match data.",
        );
      } finally {
        if (active) setMatchLoading(false);
      }
    }
    loadMatch();
    return () => {
      active = false;
    };
  }, [jobId, resumeProfileId]);
  useEffect(() => {
    if (!job || jobLoading || jobError) return;
    const detailKey = `${job.id}:${resumeProfileId || ""}:${match?.totalScore ?? ""}`;
    if (trackedDetailViewRef.current === detailKey) return;
    trackedDetailViewRef.current = detailKey;
    trackJobEvent({
      event: "job_detail_view",
      jobId: job.id,
      resumeProfileId: resumeProfileId || undefined,
      company: job.company,
      jobTitle: job.title,
      sourceSlug: job.source.slug,
      route: `/jobs/${job.id}`,
      matchScore: match?.totalScore ?? null,
      mode: "browse",
    });
  }, [job, jobError, jobLoading, match?.totalScore, resumeProfileId]);
  useEffect(() => {
    if (!job || !resumeProfileId) return;
    if (trackedProfileSelectionRef.current === `${job.id}:${resumeProfileId}`)
      return;
    trackedProfileSelectionRef.current = `${job.id}:${resumeProfileId}`;
    trackJobEvent({
      event: "job_detail_resume_profile_selected",
      jobId: job.id,
      resumeProfileId,
      company: job.company,
      jobTitle: job.title,
      sourceSlug: job.source.slug,
      route: `/jobs/${job.id}`,
      matchScore: match?.totalScore ?? null,
      mode: "browse",
    });
  }, [job, match?.totalScore, resumeProfileId]);
  function clearProfile() {
    setResumeProfileId("");
    setFeedback({
      tone: "info",
      message:
        "Resume profile cleared. Match scoring and tailoring shortcuts are now disabled until you pick one again.",
    });
  }
  async function toggleSaveJob() {
    if (!job) return;
    setSaveLoading(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/save`, {
        method: saved ? "DELETE" : "POST",
      });
      const json = (await response
        .json()
        .catch(() => ({ ok: response.ok }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || json.ok === false)
        throw new Error(json.error || "Could not update saved state.");
      const nextSaved = !saved;
      setSaved(nextSaved);
      setFeedback({
        tone: "success",
        message: nextSaved
          ? `${job.title} saved.`
          : `${job.title} removed from saved jobs.`,
      });
      trackJobEvent({
        event: "job_detail_save_clicked",
        jobId: job.id,
        resumeProfileId: resumeProfileId || undefined,
        company: job.company,
        jobTitle: job.title,
        sourceSlug: job.source.slug,
        route: `/jobs/${job.id}`,
        matchScore: match?.totalScore ?? null,
        mode: "browse",
        meta: { action: saved ? "unsave" : "save" },
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not update saved state.",
      });
    } finally {
      setSaveLoading(false);
    }
  }
  async function hideJob() {
    if (!job) return;
    setHideLoading(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "hidden_from_detail" }),
      });
      const json = (await response
        .json()
        .catch(() => ({ ok: response.ok }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || json.ok === false)
        throw new Error(json.error || "Could not hide job.");
      trackJobEvent({
        event: "job_detail_hide_clicked",
        jobId: job.id,
        resumeProfileId: resumeProfileId || undefined,
        company: job.company,
        jobTitle: job.title,
        sourceSlug: job.source.slug,
        route: `/jobs/${job.id}`,
        matchScore: match?.totalScore ?? null,
        mode: "browse",
      });
      window.location.href = "/jobs";
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not hide job.",
      });
    } finally {
      setHideLoading(false);
    }
  }
  async function launchTailorFlow(
    mode: "resume" | "cover_letter" | "apply_pack",
  ) {
    if (!job) return;

    if (!resumeProfileId) {
      setFeedback({
        tone: "info",
        message: "Choose a resume profile before tailoring this job.",
      });
      return;
    }

    const actionLabel =
      mode === "resume"
        ? "Tailor Resume"
        : mode === "cover_letter"
          ? "Generate Cover Letter"
          : "Tailor Both";

    setLaunchMode(mode);

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
            resumeProfileId,
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
        resumeProfileId,
        company: json.item.company,
        jobTitle: json.item.title,
        sourceSlug: job.source.slug,
        route: `/jobs/${job.id}`,
        matchScore: match?.totalScore ?? null,
        mode,
      });

      const destination =
        mode === "resume"
          ? `/resume?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(resumeProfileId)}`
          : mode === "cover_letter"
            ? `/cover-letter?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(resumeProfileId)}`
            : `/resume?jobId=${encodeURIComponent(job.id)}&resumeProfileId=${encodeURIComponent(resumeProfileId)}&bundle=apply-pack&next=cover-letter`;

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
      setLaunchMode(null);
    }
  }
  const salary = useMemo(
    () =>
      job
        ? formatMoney(job.salaryMin, job.salaryMax, job.salaryCurrency)
        : null,
    [job],
  );
  const matchingSkills = useMemo(
    () => asStringArray(match?.matchingSkills).slice(0, 8),
    [match],
  );
  const missingSkills = useMemo(
    () => asStringArray(match?.missingSkills).slice(0, 8),
    [match],
  );
  if (jobLoading)
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="h-6 w-2/3 rounded bg-white/10" />
              <div className="mt-4 h-4 w-1/3 rounded bg-white/10" />
              <div className="mt-8 h-72 rounded bg-white/10" />
            </div>
            <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="h-5 w-28 rounded bg-white/10" />
              <div className="mt-4 h-14 w-24 rounded bg-white/10" />
              <div className="mt-8 h-48 rounded bg-white/10" />
            </div>
          </div>
        </div>
      </main>
    );
  if (jobError || !job)
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-8">
            <h1 className="text-2xl font-semibold">
              This job could not be loaded
            </h1>
            <p className="mt-3 text-sm text-rose-100/90">
              {jobError || "The job may have been removed."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Back to Jobs
              </Link>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  const descriptionLines = sectionLines(job.description);
  const requirementLines = sectionLines(job.requirementsText);
  const responsibilityLines = sectionLines(job.responsibilitiesText);
  const noProfileSelected = !resumeProfileId;
  const isLaunching = launchMode !== null;
  const overallFitScore = Math.max(
    0,
    Math.min(100, Math.round(match?.totalScore ?? 0)),
  );
  const overallFitLabel = overallFitBand(overallFitScore);
  return (
    <main className="min-h-screen pb-10 text-white">
      <div className="shell-wrap py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="shell-nav-link">
              Home
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
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/buy-credits" className="shell-primary-btn">
              Buy Credits
            </Link>
            <Link
              href={`/jobs/saved${resumeProfileId ? `?resumeProfileId=${encodeURIComponent(resumeProfileId)}` : ""}`}
              className="shell-secondary-btn"
            >
              Saved Jobs
            </Link>
            <Link href="/account" className="shell-secondary-btn">
              Account
            </Link>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.12),transparent_28%),rgba(2,6,23,0.76)] p-6 shadow-[0_28px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                {job.source.name}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">
                {titleCase(job.remoteType)}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">
                {titleCase(job.seniority)}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">
                {titleCase(job.employmentType)}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {job.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-300">
              <span className="font-medium text-white">{job.company}</span>
              <span>•</span>
              <span>{job.location || "Location not listed"}</span>
              <span>•</span>
              <span>{formatDate(job.postedAt)}</span>
            </div>
            {salary ? (
              <p className="mt-4 text-base font-semibold text-emerald-300">
                {salary}
              </p>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Salary not listed</p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {job.applyUrl ? (
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Apply
                </a>
              ) : null}
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  View Source
                </a>
              ) : null}
            </div>
            <div className="mt-10 space-y-8">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Role overview
                </h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                  {descriptionLines.length > 0 ? (
                    descriptionLines.map((line, index) => (
                      <p key={`${index}-${line.slice(0, 20)}`}>{line}</p>
                    ))
                  ) : (
                    <p>No description available.</p>
                  )}
                </div>
              </div>
              {requirementLines.length > 0 ? (
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Requirements
                  </h2>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                    {requirementLines.map((line, index) => (
                      <li
                        key={`${index}-${line.slice(0, 20)}`}
                        className="flex gap-3"
                      >
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {responsibilityLines.length > 0 ? (
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Responsibilities
                  </h2>
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                    {responsibilityLines.map((line, index) => (
                      <li
                        key={`${index}-${line.slice(0, 20)}`}
                        className="flex gap-3"
                      >
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-300" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
          <aside className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_30%),rgba(2,6,23,0.78)] p-6 shadow-[0_28px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              Match panel
            </p>
            <div className="mt-6">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Resume Profile
              </label>
              <div className="flex gap-2">
                <select
                  value={resumeProfileId}
                  onChange={(event) => setResumeProfileId(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-0 transition focus:border-cyan-400"
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
                  disabled={!resumeProfileId}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              {selectedProfile ? (
                <p className="mt-2 text-xs text-slate-400">
                  Using {selectedProfile.title || "Resume Profile"}
                  {selectedProfile.normalizedTitles?.length
                    ? ` • ${selectedProfile.normalizedTitles.slice(0, 2).join(" / ")}`
                    : ""}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">
                  {resumeProfileId
                    ? "Profile selected. Match scoring and tailoring actions are active."
                    : "No profile selected. You can still read the role, save it, and open the source."}
                </p>
              )}
            </div>
            <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                Overall fit
              </p>
              <div className="mt-2 text-5xl font-bold leading-none text-white">
                {noProfileSelected
                  ? "—"
                  : matchLoading
                    ? "…"
                    : `${overallFitScore}%`}
              </div>
              {!noProfileSelected && !matchLoading && !matchError ? (
                <div
                  className={cn(
                    "mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                    overallFitBandClasses(overallFitScore),
                  )}
                >
                  {overallFitLabel}
                </div>
              ) : null}
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {noProfileSelected
                  ? "Choose a resume profile to unlock job-aware fit scoring and stronger trust signals."
                  : matchLoading
                    ? "Checking this job against your selected profile..."
                    : matchError
                      ? matchError
                      : match?.explanationShort ||
                        "No match summary available yet."}
              </p>
            </div>
            {noProfileSelected ? (
              <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <h3 className="text-sm font-semibold text-amber-100">
                  No profile selected
                </h3>
                <p className="mt-2 text-xs leading-6 text-amber-100/90">
                  You can still read the role, save it, and open the source.
                  Tailoring and trustworthy match scoring come back as soon as
                  you select a profile again.
                </p>
              </div>
            ) : null}
            <div className="mt-6 space-y-4">
              <ScoreRow
                label="Title fit"
                value={match?.titleScore ?? 0}
                max={25}
                loading={matchLoading && !noProfileSelected}
              />
              <ScoreRow
                label="Skill overlap"
                value={match?.skillScore ?? 0}
                max={35}
                loading={matchLoading && !noProfileSelected}
              />
              <ScoreRow
                label="Seniority fit"
                value={match?.seniorityScore ?? 0}
                max={15}
                loading={matchLoading && !noProfileSelected}
              />
              <ScoreRow
                label="Location fit"
                value={match?.locationScore ?? 0}
                max={10}
                loading={matchLoading && !noProfileSelected}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Component bars show the percentage earned inside each category, not a share of the full 100-point score. Strong signals and likely gaps prefer hard skills and tools first, then role-relevant workflow concepts when the job is light on explicit tools.
            </p>
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-white">
                Strong signals
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {matchLoading && !noProfileSelected ? (
                  <span className="text-xs text-slate-400">
                    Loading strong signals…
                  </span>
                ) : matchingSkills.length > 0 ? (
                  matchingSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    {noProfileSelected
                      ? "Choose a profile first."
                      : "No strong signals yet."}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Likely gaps</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {matchLoading && !noProfileSelected ? (
                  <span className="text-xs text-slate-400">
                    Loading likely gaps…
                  </span>
                ) : missingSkills.length > 0 ? (
                  missingSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    {noProfileSelected
                      ? "Choose a profile first."
                      : "No obvious gaps detected."}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => launchTailorFlow("apply_pack")}
                disabled={isLaunching || !resumeProfileId}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-cyan-400 hover:to-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {launchMode === "apply_pack"
                  ? "Starting Tailor Both..."
                  : "Tailor Both for This Job (8 credits)"}
              </button>
              <button
                type="button"
                onClick={() => launchTailorFlow("resume")}
                disabled={isLaunching || noProfileSelected}
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition",
                  noProfileSelected
                    ? "cursor-not-allowed bg-cyan-500/30 text-slate-200 opacity-60"
                    : "bg-cyan-500 text-slate-950 hover:bg-cyan-400",
                  isLaunching && "cursor-not-allowed opacity-60",
                )}
              >
                {launchMode === "resume"
                  ? "Starting Tailor Resume..."
                  : "Tailor Resume (5 credits)"}
              </button>
              <button
                type="button"
                onClick={() => launchTailorFlow("cover_letter")}
                disabled={isLaunching || noProfileSelected}
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold transition",
                  noProfileSelected
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-slate-400 opacity-60"
                    : "border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10",
                  isLaunching && "cursor-not-allowed opacity-60",
                )}
              >
                {launchMode === "cover_letter"
                  ? "Starting Cover Letter..."
                  : "Generate Cover Letter (5 credits)"}
              </button>
              <button
                type="button"
                onClick={toggleSaveJob}
                disabled={saveLoading}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveLoading ? "Saving..." : saved ? "Saved" : "Save Job"}
              </button>
              <button
                type="button"
                onClick={hideJob}
                disabled={hideLoading}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hideLoading ? "Hiding..." : "Hide Job"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
