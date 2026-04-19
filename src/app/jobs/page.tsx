"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackJobEvent } from "@/lib/analytics/jobs";
import CreditsPill from "@/components/Billing/CreditsPill";
import { TARGET_POSITION_OPTIONS } from "@/lib/jobs/roleFamilies";

type ResumeProfileItem = {
  id: string;
  title: string;
  summary: string | null;
  seniority: string | null;
  yearsExperience: number | null;
  updatedAt: string;
  normalizedSkills: string[];
  normalizedTitles: string[];
  sourceDocumentId: string | null;
  skillsCount: number;
  titlesCount: number;
};

type ResumeProfilesResponse = {
  ok: boolean;
  items?: ResumeProfileItem[];
  error?: string;
};

type JobListItem = {
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
  status: string;
  titleNormalized: string | null;
  locationNormalized: string | null;
  companyNormalized: string | null;
  source: {
    slug: string;
    name: string;
  };
  match: null | {
    totalScore: number;
    explanationShort: string | null;
    matchingSkills: unknown;
    missingSkills: unknown;
    computedAt: string;
  };
};

type MatchWarmupState = {
  status: "idle" | "pending" | "running" | "ready" | "failed" | "stale";
  ready: boolean;
  active: boolean;
  usedFallback: boolean;
  processedCount: number;
  totalCandidateCount: number;
  progressPercent: number;
  shouldPoll: boolean;
  shouldTriggerWarmup: boolean;
  lastError: string | null;
  shortLabel: string;
  message: string;
};

type JobsResponse = {
  ok: boolean;
  items?: JobListItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  usedFallback?: boolean;
  matchCacheReady?: boolean;
  warmup?: MatchWarmupState | null;
  error?: string;
};

type RemoteFilter = "all" | "remote" | "hybrid" | "onsite" | "unknown";
type SortMode = "match" | "newest" | "salary";
type FeedbackTone = "success" | "error" | "info";

type FeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

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

function formatPosted(dateValue: string | null) {
  if (!dateValue) return "Recently added";

  const time = new Date(dateValue).getTime();
  if (Number.isNaN(time)) return "Recently added";

  const diffMs = Date.now() - time;
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.max(0, Math.floor(diffMs / dayMs));

  if (diffDays <= 0) return "Posted today";
  if (diffDays === 1) return "Posted 1 day ago";
  if (diffDays < 7) return `Posted ${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Posted ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
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

function chipValues(job: JobListItem): string[] {
  const values: string[] = [];
  if (job.match?.totalScore != null) {
    if (job.match.totalScore >= 80) values.push("Strong match");
    else if (job.match.totalScore >= 60) values.push("Good fit");
  }
  if (job.remoteType && job.remoteType !== "unknown")
    values.push(titleCase(job.remoteType));
  if (job.seniority && job.seniority !== "unknown")
    values.push(titleCase(job.seniority));
  return values.slice(0, 3);
}

function feedbackClasses(tone: FeedbackTone) {
  if (tone === "success")
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (tone === "error")
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

function normalizeInputValue(value: string) {
  return value.trim();
}

const JOBS_PAGE_STATE_KEY = "jobsPageState:v2";

type PersistedJobsPageState = {
  selectedProfileId?: string;
  search?: string;
  location?: string;
  remote?: RemoteFilter;
  seniority?: string;
  minSalary?: string;
  sort?: SortMode;
  targetPosition?: string;
  page?: number;
};

function isRemoteFilter(value: unknown): value is RemoteFilter {
  return (
    value === "all" ||
    value === "remote" ||
    value === "hybrid" ||
    value === "onsite" ||
    value === "unknown"
  );
}

function isSortMode(value: unknown): value is SortMode {
  return value === "match" || value === "newest" || value === "salary";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function buildCardSummary(job: JobListItem, hasProfile: boolean) {
  if (!hasProfile) {
    return "Browsing without a profile. Select one anytime to unlock fit scoring and stronger tailoring signals.";
  }

  const base = job.match?.explanationShort?.trim();
  const matchingSkills = toStringArray(job.match?.matchingSkills).slice(0, 2);
  const missingSkills = toStringArray(job.match?.missingSkills).slice(0, 2);

  if (!base) {
    return "Open the detail page to inspect the fit and launch job-targeted tailoring.";
  }

  const lowerBase = base.toLowerCase();
  const extras: string[] = [];

  if (matchingSkills.length > 0 && !lowerBase.includes("skills match:")) {
    extras.push(`Matching skills: ${matchingSkills.join(", ")}.`);
  }

  if (missingSkills.length > 0 && !lowerBase.includes("gap to close:") && !lowerBase.includes("address ")) {
    extras.push(`Gap to close: ${missingSkills.join(", ")}.`);
  }

  if (!extras.length) return base;
  return `${base} ${extras[0]}`;
}

function EmptyJobsState(props: {
  hasProfile: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
      <h2 className="text-xl font-semibold text-white">
        {props.hasProfile
          ? "No jobs match these filters yet"
          : "Browsing without a profile"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {props.hasProfile
          ? "Try widening the search, clearing the salary floor, or switching the remote filter. The feed is working — the current filter stack is just too tight."
          : "You can browse the feed without a profile. Select one anytime to unlock match scoring, stronger trust signals, and tailoring shortcuts."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={props.onResetFilters}
          className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          Reset filters
        </button>
        <Link
          href="/resume"
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
        >
          Go to Resume Tool
        </Link>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [profiles, setProfiles] = useState<ResumeProfileItem[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [remoteInput, setRemoteInput] = useState<RemoteFilter>("all");
  const [seniorityInput, setSeniorityInput] = useState("all");
  const [minSalaryInput, setMinSalaryInput] = useState("");
  const [sortInput, setSortInput] = useState<SortMode>("match");
  const [targetPositionInput, setTargetPositionInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [appliedRemote, setAppliedRemote] = useState<RemoteFilter>("all");
  const [appliedSeniority, setAppliedSeniority] = useState("all");
  const [appliedMinSalary, setAppliedMinSalary] = useState("");
  const [appliedSort, setAppliedSort] = useState<SortMode>("match");
  const [appliedTargetPosition, setAppliedTargetPosition] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [matchWarmup, setMatchWarmup] = useState<MatchWarmupState | null>(null);
  const [warmupRequestInFlight, setWarmupRequestInFlight] = useState(false);
  const [jobsRefreshNonce, setJobsRefreshNonce] = useState(0);
  const [savedJobIds, setSavedJobIds] = useState<Record<string, boolean>>({});
  const [savingJobIds, setSavingJobIds] = useState<Record<string, boolean>>({});
  const [hidingJobIds, setHidingJobIds] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const trackedFeedViewKeyRef = useRef("");
  const trackedProfileSelectionRef = useRef("");
  const [pageStateReady, setPageStateReady] = useState(false);

  const defaultSort: SortMode = "match";

  const filtersDirty =
    normalizeInputValue(searchInput) !== appliedSearch ||
    normalizeInputValue(locationInput) !== appliedLocation ||
    remoteInput !== appliedRemote ||
    seniorityInput !== appliedSeniority ||
    normalizeInputValue(minSalaryInput) !== appliedMinSalary ||
    sortInput !== appliedSort ||
    normalizeInputValue(targetPositionInput) !== appliedTargetPosition;


  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedProfileId = window.localStorage.getItem("activeResumeProfileId") || "";
    const rawState = window.localStorage.getItem(JOBS_PAGE_STATE_KEY);

    if (rawState) {
      try {
        const parsed = JSON.parse(rawState) as PersistedJobsPageState;
        const nextSearch = normalizeInputValue(parsed.search ?? "");
        const nextLocation = normalizeInputValue(parsed.location ?? "");
        const nextRemote = isRemoteFilter(parsed.remote) ? parsed.remote : "all";
        const nextSeniority = typeof parsed.seniority === "string" && parsed.seniority.trim() ? parsed.seniority : "all";
        const nextMinSalary = normalizeInputValue((parsed.minSalary ?? "").replace(/[^\d]/g, ""));
        const nextSort = isSortMode(parsed.sort) ? parsed.sort : "match";
        const nextTargetPosition = normalizeInputValue(parsed.targetPosition ?? "");
        const nextPage = typeof parsed.page === "number" && Number.isFinite(parsed.page) && parsed.page > 0
          ? Math.floor(parsed.page)
          : 1;

        setSearchInput(nextSearch);
        setAppliedSearch(nextSearch);
        setLocationInput(nextLocation);
        setAppliedLocation(nextLocation);
        setRemoteInput(nextRemote);
        setAppliedRemote(nextRemote);
        setSeniorityInput(nextSeniority);
        setAppliedSeniority(nextSeniority);
        setMinSalaryInput(nextMinSalary);
        setAppliedMinSalary(nextMinSalary);
        setSortInput(nextSort);
        setAppliedSort(nextSort);
        setTargetPositionInput(nextTargetPosition);
        setAppliedTargetPosition(nextTargetPosition);
        setPage(nextPage);

        if (storedProfileId) {
          setSelectedProfileId(storedProfileId);
        } else if (typeof parsed.selectedProfileId === "string") {
          setSelectedProfileId(parsed.selectedProfileId);
        }
      } catch {
        if (storedProfileId) setSelectedProfileId(storedProfileId);
      }
    } else if (storedProfileId) {
      setSelectedProfileId(storedProfileId);
    }

    setPageStateReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !pageStateReady) return;
    if (selectedProfileId)
      window.localStorage.setItem("activeResumeProfileId", selectedProfileId);
    else window.localStorage.removeItem("activeResumeProfileId");
  }, [pageStateReady, selectedProfileId]);

  useEffect(() => {
    if (typeof window === "undefined" || !pageStateReady) return;

    const payload: PersistedJobsPageState = {
      selectedProfileId,
      search: appliedSearch,
      location: appliedLocation,
      remote: appliedRemote,
      seniority: appliedSeniority,
      minSalary: appliedMinSalary,
      sort: appliedSort,
      targetPosition: appliedTargetPosition,
      page,
    };

    window.localStorage.setItem(JOBS_PAGE_STATE_KEY, JSON.stringify(payload));
  }, [
    appliedLocation,
    appliedMinSalary,
    appliedRemote,
    appliedSearch,
    appliedSeniority,
    appliedSort,
    appliedTargetPosition,
    page,
    pageStateReady,
    selectedProfileId,
  ]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [feedback]);


  useEffect(() => {
    setPage(1);
  }, [selectedProfileId]);

  const warmupRequestPayload = useMemo(
    () => ({
      resumeProfileId: selectedProfileId,
      q: appliedSearch || undefined,
      remote: appliedRemote !== "all" ? appliedRemote : undefined,
      location: appliedLocation || undefined,
      seniority: appliedSeniority !== "all" ? appliedSeniority : undefined,
      minSalary: appliedMinSalary ? Number(appliedMinSalary) : undefined,
      targetPosition: appliedTargetPosition || undefined,
    }),
    [
      appliedLocation,
      appliedMinSalary,
      appliedRemote,
      appliedSearch,
      appliedSeniority,
      selectedProfileId,
      appliedTargetPosition,
    ],
  );

  async function loadProfiles() {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const response = await fetch("/api/resume-profiles", {
        method: "GET",
        cache: "no-store",
      });
      const json = (await response.json()) as ResumeProfilesResponse;
      if (!response.ok || !json.ok)
        throw new Error(json.error || "Could not load resume profiles.");
      const items = Array.isArray(json.items) ? json.items : [];
      setProfiles(items);
      if (items.length === 0) setSelectedProfileId("");
      else {
        setSelectedProfileId((current) => {
          if (current && items.some((item) => item.id === current))
            return current;
          const stored =
            typeof window !== "undefined"
              ? window.localStorage.getItem("activeResumeProfileId")
              : null;
          if (stored && items.some((item) => item.id === stored)) return stored;
          return items[0]?.id ?? "";
        });
      }
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : "Could not load resume profiles.",
      );
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedProfileId) params.set("resumeProfileId", selectedProfileId);
    if (appliedSearch) params.set("q", appliedSearch);
    if (appliedLocation) params.set("location", appliedLocation);
    if (appliedRemote !== "all") params.set("remote", appliedRemote);
    if (appliedSeniority !== "all") params.set("seniority", appliedSeniority);
    if (appliedMinSalary) params.set("minSalary", appliedMinSalary);
    if (appliedTargetPosition) params.set("targetPosition", appliedTargetPosition);
    params.set("sort", appliedSort);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [
    appliedLocation,
    appliedMinSalary,
    appliedRemote,
    appliedSearch,
    appliedSeniority,
    appliedSort,
    appliedTargetPosition,
    page,
    selectedProfileId,
  ]);

  useEffect(() => {
    if (!pageStateReady) return;

    let active = true;
    async function loadJobs() {
      setJobsLoading(true);
      setJobsError(null);
      try {
        const response = await fetch(`/api/jobs?${queryString}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json()) as JobsResponse;
        if (!response.ok || !json.ok)
          throw new Error(json.error || "Could not load jobs.");
        if (!active) return;
        const items = Array.isArray(json.items) ? json.items : [];
        setJobs(items);
        setTotalPages(Math.max(1, json.totalPages ?? 1));
        setTotalJobs(json.total ?? 0);
        setMatchWarmup(
          selectedProfileId && appliedSort === "match"
            ? json.warmup ?? {
                status: json.usedFallback ? "idle" : "ready",
                ready: !json.usedFallback,
                active: false,
                usedFallback: !!json.usedFallback,
                processedCount: 0,
                totalCandidateCount: 0,
                progressPercent: json.usedFallback ? 0 : 100,
                shouldPoll: false,
                shouldTriggerWarmup: !!json.usedFallback,
                lastError: null,
                shortLabel: json.usedFallback ? "Preparing best matches" : "Best match ready",
                message: json.usedFallback
                  ? "Best matches are still preparing, so the feed is showing recent jobs for now."
                  : "Best-match cache is ready.",
              }
            : null,
        );
        setSavedJobIds((current) => {
          let changed = false;
          const next = { ...current };

          for (const job of items) {
            if (current[job.id] && !next[job.id]) {
              next[job.id] = true;
              changed = true;
            }
          }

          return changed ? next : current;
        });
      } catch (error) {
        if (!active) return;
        setMatchWarmup(null);
        setJobsError(
          error instanceof Error ? error.message : "Could not load jobs.",
        );
      } finally {
        if (active) setJobsLoading(false);
      }
    }
    loadJobs();
    return () => {
      active = false;
    };
  }, [jobsRefreshNonce, pageStateReady, queryString]);


  function clearProfile() {
    setSelectedProfileId("");
    setFeedback({
      tone: "info",
      message:
        "Resume profile cleared. You are now browsing without job-fit scoring.",
    });
  }

  function applyFilters() {
    const nextSearch = normalizeInputValue(searchInput);
    const nextLocation = normalizeInputValue(locationInput);
    const nextMinSalary = normalizeInputValue(minSalaryInput);
    setAppliedSearch(nextSearch);
    setAppliedLocation(nextLocation);
    setAppliedRemote(remoteInput);
    setAppliedSeniority(seniorityInput);
    setAppliedMinSalary(nextMinSalary);
    setAppliedSort(sortInput);
    setAppliedTargetPosition(normalizeInputValue(targetPositionInput));
    setPage(1);
  }

  function resetFilters() {
    const nextSort = defaultSort;
    setSearchInput("");
    setLocationInput("");
    setRemoteInput("all");
    setSeniorityInput("all");
    setMinSalaryInput("");
    setSortInput(nextSort);
    setTargetPositionInput("");
    setAppliedSearch("");
    setAppliedLocation("");
    setAppliedRemote("all");
    setAppliedSeniority("all");
    setAppliedMinSalary("");
    setAppliedSort(nextSort);
    setAppliedTargetPosition("");
    setPage(1);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyFilters();
  }

  function removeAppliedFilter(kind: "search" | "location" | "remote" | "seniority" | "minSalary" | "sort" | "targetPosition") {
    if (kind === "search") {
      setSearchInput("");
      setAppliedSearch("");
    } else if (kind === "location") {
      setLocationInput("");
      setAppliedLocation("");
    } else if (kind === "remote") {
      setRemoteInput("all");
      setAppliedRemote("all");
    } else if (kind === "seniority") {
      setSeniorityInput("all");
      setAppliedSeniority("all");
    } else if (kind === "minSalary") {
      setMinSalaryInput("");
      setAppliedMinSalary("");
    } else if (kind === "targetPosition") {
      setTargetPositionInput("");
      setAppliedTargetPosition("");
    } else if (kind === "sort") {
      const nextSort = defaultSort;
      setSortInput(nextSort);
      setAppliedSort(nextSort);
    }
    setPage(1);
  }

  async function toggleSaveJob(job: JobListItem) {
    setSavingJobIds((current) => ({ ...current, [job.id]: true }));
    try {
      const isSaved = !!savedJobIds[job.id];
      const response = await fetch(`/api/jobs/${job.id}/save`, {
        method: isSaved ? "DELETE" : "POST",
      });
      const json = (await response
        .json()
        .catch(() => ({ ok: response.ok }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || json.ok === false)
        throw new Error(json.error || "Could not update saved state.");
      setSavedJobIds((current) => ({ ...current, [job.id]: !isSaved }));
      setFeedback({
        tone: "success",
        message: !isSaved
          ? `${job.title} saved.`
          : `${job.title} removed from saved jobs.`,
      });
      trackJobEvent({
        event: "jobs_save_clicked",
        jobId: job.id,
        resumeProfileId: selectedProfileId || undefined,
        company: job.company,
        jobTitle: job.title,
        sourceSlug: job.source.slug,
        route: "/jobs",
        mode: "browse",
        matchScore: job.match?.totalScore ?? null,
        meta: { action: isSaved ? "unsave" : "save" },
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
      setSavingJobIds((current) => ({ ...current, [job.id]: false }));
    }
  }

  useEffect(() => {
    if (jobsLoading || jobsError) return;
    const viewKey = JSON.stringify({
      selectedProfileId,
      appliedSearch,
      appliedLocation,
      appliedRemote,
      appliedSeniority,
      appliedMinSalary,
      appliedSort,
      page,
      totalJobs,
      jobsCount: jobs.length,
    });
    if (trackedFeedViewKeyRef.current === viewKey) return;
    trackedFeedViewKeyRef.current = viewKey;
    trackJobEvent({
      event: "jobs_feed_view",
      resumeProfileId: selectedProfileId || undefined,
      route: "/jobs",
      mode: "browse",
      page,
      sort: appliedSort,
      search: appliedSearch || undefined,
      remote: appliedRemote,
      seniority: appliedSeniority,
      location: appliedLocation || undefined,
      minSalary: appliedMinSalary || undefined,
      totalJobs,
      meta: { jobsCount: jobs.length, targetPosition: appliedTargetPosition || undefined },
    });
  }, [
    appliedLocation,
    appliedMinSalary,
    appliedRemote,
    appliedSearch,
    appliedSeniority,
    appliedSort,
    appliedTargetPosition,
    jobs,
    jobsError,
    jobsLoading,
    page,
    selectedProfileId,
    totalJobs,
  ]);

  useEffect(() => {
    if (!selectedProfileId || profilesLoading) return;
    if (trackedProfileSelectionRef.current === selectedProfileId) return;
    trackedProfileSelectionRef.current = selectedProfileId;
    trackJobEvent({
      event: "jobs_resume_profile_selected",
      resumeProfileId: selectedProfileId,
      route: "/jobs",
      mode: "browse",
      meta: { profileCount: profiles.length },
    });
  }, [profiles.length, profilesLoading, selectedProfileId]);

  async function triggerWarmup(manualRetry = false) {
    if (!warmupRequestPayload.resumeProfileId || appliedSort !== "match") return;
    setWarmupRequestInFlight(true);

    try {
      const response = await fetch("/api/jobs/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warmupRequestPayload),
      });

      const json = (await response.json().catch(() => ({ ok: response.ok }))) as {
        ok?: boolean;
        error?: string;
        status?: MatchWarmupState["status"];
        processed?: number;
        totalCandidates?: number;
        continueRecommended?: boolean;
        ready?: boolean;
      };

      if (!response.ok || json.ok === false) {
        throw new Error(json.error || "Could not prepare best-match cache.");
      }

      setMatchWarmup((current) => {
        if (!current) return current;
        const nextStatus = json.status ?? "running";
        const nextProcessed = typeof json.processed === "number" ? json.processed : current.processedCount;
        const nextTotal = typeof json.totalCandidates === "number" ? json.totalCandidates : current.totalCandidateCount;
        const nextReady = Boolean(json.ready);
        const shouldContinue = Boolean(json.continueRecommended) && !nextReady;
        const progressPercent = nextTotal > 0 ? Math.max(0, Math.min(100, Math.round((nextProcessed / nextTotal) * 100))) : 0;
        const nextLabel =
          nextStatus === "pending"
            ? manualRetry
              ? "Queued best-match refresh"
              : "Best matches queued"
            : manualRetry
              ? "Retrying best matches"
              : "Preparing best matches";
        const nextMessage =
          nextTotal > 0
            ? `Preparing cached best matches (${nextProcessed}/${nextTotal}). You are seeing recent jobs until the cache is ready.`
            : "Preparing cached best matches now. You are seeing recent jobs until the cache is ready.";

        return {
          ...current,
          status: nextReady ? "ready" : nextStatus,
          active: !nextReady,
          ready: nextReady,
          usedFallback: !nextReady,
          processedCount: nextProcessed,
          totalCandidateCount: nextTotal,
          progressPercent: nextReady ? 100 : progressPercent,
          shouldTriggerWarmup: shouldContinue,
          shouldPoll: shouldContinue,
          shortLabel: nextReady ? "Best matches ready" : nextLabel,
          message: nextReady ? "Cached best-match results are ready for this resume profile." : nextMessage,
          lastError: null,
        };
      });
      setJobsRefreshNonce((value) => value + 1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not prepare best-match cache.";
      setMatchWarmup((current) =>
        current
          ? {
              ...current,
              status: "failed",
              active: false,
              ready: false,
              usedFallback: true,
              shouldTriggerWarmup: false,
              shouldPoll: false,
              shortLabel: "Best match stalled",
              message,
              lastError: message,
            }
          : current,
      );
      setFeedback({
        tone: "error",
        message,
      });
    } finally {
      setWarmupRequestInFlight(false);
    }
  }

  useEffect(() => {
    if (!pageStateReady) return;
    if (!selectedProfileId) return;
    if (appliedSort !== "match") return;
    if (!matchWarmup?.shouldTriggerWarmup) return;
    if (warmupRequestInFlight) return;

    void triggerWarmup(false);
  }, [
    appliedSort,
    matchWarmup?.shouldTriggerWarmup,
    pageStateReady,
    selectedProfileId,
    warmupRequestInFlight,
  ]);

  useEffect(() => {
    if (!pageStateReady) return;
    if (!selectedProfileId) return;
    if (appliedSort !== "match") return;
    if (!matchWarmup?.shouldPoll) return;
    if (warmupRequestInFlight) return;

    const timeout = window.setTimeout(() => {
      void triggerWarmup(false);
    }, 10000);

    return () => window.clearTimeout(timeout);
  }, [
    appliedSort,
    matchWarmup?.processedCount,
    matchWarmup?.shouldPoll,
    matchWarmup?.status,
    pageStateReady,
    selectedProfileId,
    warmupRequestInFlight,
  ]);

  async function hideJob(job: JobListItem) {
    setHidingJobIds((current) => ({ ...current, [job.id]: true }));
    try {
      const response = await fetch(`/api/jobs/${job.id}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "hidden_from_feed" }),
      });
      const json = (await response
        .json()
        .catch(() => ({ ok: response.ok }))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || json.ok === false)
        throw new Error(json.error || "Could not hide job.");
      setJobs((current) => current.filter((item) => item.id !== job.id));
      setSavedJobIds((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
      setTotalJobs((current) => Math.max(0, current - 1));
      setFeedback({
        tone: "info",
        message: `${job.title} hidden from your feed.`,
      });
      trackJobEvent({
        event: "jobs_hide_clicked",
        jobId: job.id,
        resumeProfileId: selectedProfileId || undefined,
        company: job.company,
        jobTitle: job.title,
        sourceSlug: job.source.slug,
        route: "/jobs",
        mode: "browse",
        matchScore: job.match?.totalScore ?? null,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not hide job.",
      });
    } finally {
      setHidingJobIds((current) => ({ ...current, [job.id]: false }));
    }
  }

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: "search" | "location" | "remote" | "seniority" | "minSalary" | "sort"; label: string }> = [];
    if (appliedSearch) pills.push({ key: "search", label: `Search: ${appliedSearch}` });
    if (appliedLocation) pills.push({ key: "location", label: `Location: ${appliedLocation}` });
    if (appliedRemote !== "all") pills.push({ key: "remote", label: `Remote: ${titleCase(appliedRemote)}` });
    if (appliedSeniority !== "all") pills.push({ key: "seniority", label: `Seniority: ${titleCase(appliedSeniority)}` });
    if (appliedMinSalary) pills.push({ key: "minSalary", label: `Min salary: ${appliedMinSalary}` });
    if (appliedSort !== defaultSort) pills.push({ key: "sort", label: `Sort: ${appliedSort === "match" ? "Best match" : appliedSort === "newest" ? "Newest" : "Salary"}` });
    return pills;
  }, [appliedLocation, appliedMinSalary, appliedRemote, appliedSearch, appliedSeniority, appliedSort, defaultSort]);

  return (
    <main className="min-h-screen text-white">
      <header className="shell-wrap pt-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 shadow-[0_18px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold tracking-[0.08em] text-white sm:text-xl">
              Git-a-Job
            </Link>
            <div className="hidden items-center gap-2 md:flex">
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
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <CreditsPill />
            <Link href="/donate" className="shell-secondary-btn">
              Donate
            </Link>
            <Link href="/jobs/saved" className="shell-secondary-btn">
              Saved Jobs
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Git-a-Job 2.0
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                AI Job Match
              </h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">
                Browse real jobs, score them against your resume profile, and
                jump straight into job-aware tailoring.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                <div className="font-semibold text-white">
                  {jobsLoading ? "Loading roles..." : `${totalJobs} role${totalJobs === 1 ? "" : "s"} found`}
                </div>
                <div className="mt-1">
                  Browse is free. Match trust and tailoring are what make this
                  feature pay off.
                </div>
              </div>
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
        <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="grid gap-4 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Resume profile{profiles.length > 0 ? ` • ${profiles.length}` : ""}
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedProfileId}
                  onChange={(event) => setSelectedProfileId(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none ring-0 transition focus:border-cyan-400/50"
                  disabled={profilesLoading || profiles.length === 0}
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
              {profilesError ? (
                <p className="mt-2 text-xs text-rose-300">{profilesError}</p>
              ) : null}
              {!profilesLoading && profiles.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-xs leading-6 text-slate-300">
                  No resume profiles yet. Upload or build one in the Resume tool to unlock best-match ranking.
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Target position
              </label>
              <input
                list="job-target-position-options"
                value={targetPositionInput}
                onChange={(event) => setTargetPositionInput(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="QA Engineer, Product Manager..."
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50"
              />
              <datalist id="job-target-position-options">
                {TARGET_POSITION_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <p className="mt-2 text-xs text-slate-400">
                Use this to prioritize closely related roles first during best-match warmup.
              </p>
            </div>

            <div className="lg:col-span-2">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Search
              </label>
              <div className="flex gap-2">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Title, company, skill, keyword..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50"
                />
                <button
                  type="button"
                  onClick={applyFilters}
                  disabled={!filtersDirty}
                  className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Remote
              </label>
              <select
                value={remoteInput}
                onChange={(event) =>
                  setRemoteInput(event.target.value as RemoteFilter)
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
              >
                <option value="all">All</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Sort
              </label>
              <select
                value={sortInput}
                onChange={(event) => setSortInput(event.target.value as SortMode)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
              >
                <option value="match">Best match</option>
                <option value="newest">Newest</option>
                <option value="salary">Salary</option>
              </select>
              <p className="mt-2 text-xs text-slate-400">
                Best match uses your selected profile when one is available.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Location
              </label>
              <input
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Vancouver, Remote..."
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Seniority
              </label>
              <select
                value={seniorityInput}
                onChange={(event) => setSeniorityInput(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
              >
                <option value="all">All</option>
                <option value="entry">Entry</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
                <option value="manager">Manager</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                Min salary
              </label>
              <input
                value={minSalaryInput}
                onChange={(event) =>
                  setMinSalaryInput(event.target.value.replace(/[^\d]/g, ""))
                }
                onKeyDown={handleSearchKeyDown}
                placeholder="90000"
                inputMode="numeric"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-cyan-400/50"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterPills.length > 0 ? (
                activeFilterPills.map((pill) => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => removeAppliedFilter(pill.key)}
                    className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-slate-800"
                  >
                    {pill.label} ×
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400">
                  No extra filters applied.
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyFilters}
                disabled={!filtersDirty}
                className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-800"
              >
                Reset all
              </button>
            </div>
          </div>
        </section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          <div>
            {jobsLoading ? (
              <span>Refreshing jobs…</span>
            ) : (
              <span>
                Showing <span className="font-semibold text-white">{jobs.length}</span> of{" "}
                <span className="font-semibold text-white">{totalJobs}</span> roles •{" "}
                <span className="font-semibold text-white">
                  {selectedProfileId && appliedSort === "match" && matchWarmup?.usedFallback
                    ? "Recent jobs while best matches prepare"
                    : appliedSort === "match"
                      ? "Best match"
                      : appliedSort === "newest"
                        ? "Newest"
                        : "Salary"}
                </span>
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400">
            Press Enter in a text field or use Apply filters.
          </div>
        </div>

        {selectedProfileId && appliedSort === "match" && matchWarmup && matchWarmup.usedFallback ? (
          <div
            className={cn(
              "mb-4 rounded-3xl border p-4 text-sm",
              matchWarmup.status === "failed"
                ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                : matchWarmup.status === "stale"
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                  : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100",
            )}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold">{matchWarmup.shortLabel}</div>
                <p className="mt-1 text-sm opacity-95">{matchWarmup.message}</p>
                {matchWarmup.totalCandidateCount > 0 ? (
                  <p className="mt-2 text-xs opacity-80">
                    Progress: {matchWarmup.processedCount}/{matchWarmup.totalCandidateCount} ({matchWarmup.progressPercent}%)
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {matchWarmup.shouldPoll || matchWarmup.shouldTriggerWarmup ? (
                  <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                    Checking every 10s
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void triggerWarmup(true)}
                  disabled={warmupRequestInFlight}
                  className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {warmupRequestInFlight ? "Refreshing…" : "Refresh / resume best match"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {jobsLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-5"
              >
                <div className="h-5 w-56 rounded bg-white/10" />
                <div className="mt-3 h-4 w-40 rounded bg-white/10" />
                <div className="mt-6 h-20 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : jobsError ? (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">
            <h2 className="text-lg font-semibold">Could not load jobs</h2>
            <p className="mt-2 text-sm text-rose-100/90">{jobsError}</p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-900 transition hover:bg-white"
              >
                Retry
              </button>
            </div>
          </div>
        ) : jobs.length === 0 ? (
          <EmptyJobsState
            hasProfile={!!selectedProfileId}
            onResetFilters={resetFilters}
          />
        ) : (
          <>
            <div className="grid gap-4">
              {jobs.map((job) => {
                const salary = formatMoney(
                  job.salaryMin,
                  job.salaryMax,
                  job.salaryCurrency,
                );
                const chips = chipValues(job);
                const isSaved = !!savedJobIds[job.id];
                const hasProfile = !!selectedProfileId;
                return (
                  <article
                    key={job.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/10 transition hover:border-cyan-400/30 hover:bg-white/[0.07]"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                            {job.source.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatPosted(job.postedAt)}
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
                        <div className="mt-4 flex flex-wrap gap-2">
                          {chips.map((chip) => (
                            <span
                              key={chip}
                              className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-200"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                        <p className="mt-4 max-w-3xl overflow-hidden text-sm leading-6 text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                          {buildCardSummary(job, hasProfile)}
                        </p>
                      </div>
                      <div className="flex min-w-[220px] flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
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
                            {hasProfile
                              ? "Based on your selected resume profile"
                              : "No profile selected"}
                          </p>
                        </div>
                        <Link
                          href={`/jobs/${job.id}${selectedProfileId ? `?resumeProfileId=${encodeURIComponent(selectedProfileId)}` : ""}`}
                          onClick={() =>
                            trackJobEvent({
                              event: "jobs_view_job_clicked",
                              jobId: job.id,
                              resumeProfileId: selectedProfileId || undefined,
                              company: job.company,
                              jobTitle: job.title,
                              sourceSlug: job.source.slug,
                              route: "/jobs",
                              mode: "browse",
                              matchScore: job.match?.totalScore ?? null,
                              page,
                              sort: appliedSort,
                            })
                          }
                          className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                        >
                          View Job
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleSaveJob(job)}
                          disabled={!!savingJobIds[job.id]}
                          className={cn(
                            "inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                            "border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          {savingJobIds[job.id]
                            ? "Saving..."
                            : isSaved
                              ? "Saved"
                              : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => hideJob(job)}
                          disabled={!!hidingJobIds[job.id]}
                          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {hidingJobIds[job.id] ? "Hiding..." : "Hide"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-300">
                Page <span className="font-semibold text-white">{page}</span> of{" "}
                <span className="font-semibold text-white">{totalPages}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}