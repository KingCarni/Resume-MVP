"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AdminDonationRequestsPanel from "@/components/account/AdminDonationRequestsPanel";
import DonateCreditsPanel from "@/components/account/DonateCreditsPanel";
import DonationRequestPanel from "@/components/account/DonationRequestPanel";

type ResumeDocumentItem = {
  id: string;
  title: string | null;
  createdAt: string;
};

type ResumeProfileItem = {
  id: string;
  title: string | null;
  summary: string | null;
  seniority: string | null;
  yearsExperience: number | null;
  updatedAt: string;
  normalizedSkills: string[];
  normalizedTitles: string[];
  sourceDocumentId: string | null;
  sourceDocument: ResumeDocumentItem | null;
  skillsCount: number;
  titlesCount: number;
};

type ResumeProfilesResponse = {
  ok: boolean;
  items?: ResumeProfileItem[];
  resumeDocuments?: ResumeDocumentItem[];
  error?: string;
};

type CreditsResponse = {
  ok: boolean;
  balance?: number;
  error?: string;
};

type PaidBalanceResponse = {
  ok: boolean;
  paidCredits?: number;
  totalCredits?: number;
  purchasedCredits?: number;
  donatedOutCredits?: number;
  error?: string;
};

type FeedbackTone = "success" | "error" | "info";
type FeedbackState = { tone: FeedbackTone; message: string } | null;

type Props = {
  email: string;
  isAdmin: boolean;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function titleCase(value: string | null | undefined) {
  if (!value || value === "unknown") return "Unknown";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(dateValue: string | null | undefined) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeTag(list: string[], nextValue: string) {
  const cleaned = normalizeTag(nextValue);
  if (!cleaned || list.includes(cleaned)) return list;
  return [...list, cleaned];
}

function removeTag(list: string[], value: string) {
  return list.filter((item) => item !== value);
}

function feedbackClasses(tone: FeedbackTone) {
  if (tone === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  }
  if (tone === "error") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  }
  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100";
}

function SummaryStat(props: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-lg shadow-black/15">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {props.label}
      </p>
      <div className="mt-2 text-3xl font-bold tracking-tight text-white">
        {props.value}
      </div>
      {props.subtext ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">{props.subtext}</p>
      ) : null}
    </div>
  );
}

function TagChip(props: {
  value: string;
  removable?: boolean;
  onRemove?: (value: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
      <span>{props.value}</span>
      {props.removable && props.onRemove ? (
        <button
          type="button"
          onClick={() => props.onRemove?.(props.value)}
          className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] leading-none text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-100"
          aria-label={`Remove ${props.value}`}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function ProfileCard(props: {
  profile: ResumeProfileItem;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={props.isSelected}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
      className={cn(
        "w-full rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-400/40",
        props.isSelected
          ? "border-cyan-400/40 bg-cyan-500/10 shadow-lg shadow-cyan-950/20"
          : "border-white/10 bg-slate-900/70 hover:border-white/20 hover:bg-slate-900",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">
              {props.profile.title || "Resume Profile"}
            </h3>
            {props.isActive ? (
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                Active
              </span>
            ) : null}
            {props.isSelected ? (
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
                Selected
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {props.profile.summary || "No summary stored yet."}
          </p>
        </div>

        {!props.isActive ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              props.onActivate();
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
          >
            Set active
          </button>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Current default
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-slate-300">
          {titleCase(props.profile.seniority)}
        </span>
        {props.profile.yearsExperience != null ? (
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-slate-300">
            {props.profile.yearsExperience}y experience
          </span>
        ) : null}
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-slate-300">
          {props.profile.skillsCount} skills
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-slate-300">
          Updated {formatDate(props.profile.updatedAt) || "recently"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {props.profile.normalizedTitles.length > 0 ? (
          props.profile.normalizedTitles.slice(0, 4).map((title) => (
            <TagChip key={title} value={title} />
          ))
        ) : (
          <span className="text-xs text-slate-500">No normalized titles yet.</span>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-400">
        {props.profile.sourceDocument ? (
          <>Attached resume: {props.profile.sourceDocument.title || "Untitled resume"}</>
        ) : (
          <>No resume currently attached.</>
        )}
      </div>
    </div>
  );
}

export default function AccountProfileHub(props: Props) {
  const [profiles, setProfiles] = useState<ResumeProfileItem[]>([]);
  const [resumeDocuments, setResumeDocuments] = useState<ResumeDocumentItem[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [paidCredits, setPaidCredits] = useState<number | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [activeProfileId, setActiveProfileId] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [documentDraft, setDocumentDraft] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [titleKeywordDraft, setTitleKeywordDraft] = useState("");
  const [skillTags, setSkillTags] = useState<string[]>([]);
  const [titleTags, setTitleTags] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) || null,
    [profiles, selectedProfileId],
  );

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) || null,
    [profiles, activeProfileId],
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

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Could not load resume profiles.");
      }

      const items = Array.isArray(json.items) ? json.items : [];
      const documents = Array.isArray(json.resumeDocuments) ? json.resumeDocuments : [];

      setProfiles(items);
      setResumeDocuments(documents);

      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem("activeResumeProfileId")
          : null;

      setActiveProfileId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        if (stored && items.some((item) => item.id === stored)) return stored;
        return items[0]?.id || "";
      });

      setSelectedProfileId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
        if (stored && items.some((item) => item.id === stored)) return stored;
        return items[0]?.id || "";
      });
    } catch (error) {
      setProfilesError(
        error instanceof Error ? error.message : "Could not load resume profiles.",
      );
    } finally {
      setProfilesLoading(false);
    }
  }

  async function loadBalances() {
    setCreditsLoading(true);
    setCreditsError(null);

    try {
      const [creditsRes, paidRes] = await Promise.all([
        fetch("/api/credits", { method: "GET", cache: "no-store" }),
        fetch("/api/account/paid-balance", { method: "GET", cache: "no-store" }),
      ]);

      const creditsJson = (await creditsRes.json()) as CreditsResponse;
      const paidJson = (await paidRes.json()) as PaidBalanceResponse;

      if (!creditsRes.ok || !creditsJson.ok) {
        throw new Error(creditsJson.error || "Could not load credits.");
      }
      if (!paidRes.ok || !paidJson.ok) {
        throw new Error(paidJson.error || "Could not load paid credits.");
      }

      setBalance(typeof creditsJson.balance === "number" ? creditsJson.balance : 0);
      setPaidCredits(typeof paidJson.paidCredits === "number" ? paidJson.paidCredits : 0);
    } catch (error) {
      setCreditsError(
        error instanceof Error ? error.message : "Could not load account balances.",
      );
    } finally {
      setCreditsLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
    loadBalances();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeProfileId) {
      window.localStorage.setItem("activeResumeProfileId", activeProfileId);
    } else {
      window.localStorage.removeItem("activeResumeProfileId");
    }
  }, [activeProfileId]);

  useEffect(() => {
    if (!selectedProfile) {
      setTitleDraft("");
      setDocumentDraft("");
      setSkillTags([]);
      setTitleTags([]);
      return;
    }

    setTitleDraft(selectedProfile.title || "Resume Profile");
    setDocumentDraft(selectedProfile.sourceDocumentId || "");
    setSkillTags(selectedProfile.normalizedSkills);
    setTitleTags(selectedProfile.normalizedTitles);
  }, [selectedProfile]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  function setProfileActive(profileId: string) {
    setActiveProfileId(profileId);
    setSelectedProfileId(profileId);
    setFeedback({
      tone: "success",
      message: "Active profile updated. Jobs match and tailoring now use that profile.",
    });
  }

  function addSkillTag() {
    const next = mergeTag(skillTags, skillDraft);
    if (next === skillTags) {
      setSkillDraft("");
      return;
    }
    setSkillTags(next);
    setSkillDraft("");
  }

  function addTitleTag() {
    const next = mergeTag(titleTags, titleKeywordDraft);
    if (next === titleTags) {
      setTitleKeywordDraft("");
      return;
    }
    setTitleTags(next);
    setTitleKeywordDraft("");
  }

  async function saveProfileChanges() {
    if (!selectedProfile) return;

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setFeedback({ tone: "error", message: "Profile title cannot be blank." });
      return;
    }

    setSaveLoading(true);
    try {
      const response = await fetch("/api/resume-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProfile.id,
          title: nextTitle,
          sourceDocumentId: documentDraft || null,
          normalizedSkills: skillTags,
          normalizedTitles: titleTags,
        }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        error?: string;
        item?: ResumeProfileItem;
      };

      if (!response.ok || !json.ok || !json.item) {
        throw new Error(json.error || "Could not save profile changes.");
      }

      setProfiles((current) =>
        current.map((profile) => (profile.id === json.item?.id ? json.item : profile)),
      );

      setFeedback({
        tone: "success",
        message:
          "Profile updated. Jobs match and tailoring will now use the newer metadata and resume attachment.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Could not save profile changes.",
      });
    } finally {
      setSaveLoading(false);
    }
  }

  if (profilesLoading) {
    return (
      <div className="grid gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-6"
          >
            <div className="h-5 w-40 rounded bg-white/10" />
            <div className="mt-4 h-20 rounded bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {feedback ? (
        <div className={cn("rounded-2xl border px-4 py-3 text-sm", feedbackClasses(feedback.tone))}>
          {feedback.message}
        </div>
      ) : null}

      <section className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              Account / Profile Hub
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Manage your resume identity before you tailor.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Keep profiles distinct, switch the active one safely, attach the right
              resume, and edit the skills/titles that drive jobs match and tailoring.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/jobs"
                className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Open Jobs Feed
              </Link>
              <Link
                href="/resume"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Resume Tool
              </Link>
              <Link
                href="/cover-letter"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Cover Letter Tool
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:w-[360px] xl:grid-cols-1">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Signed in
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {props.email || "Unknown account"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Active profile drives jobs scoring, saved jobs context, and tailoring handoffs.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                Active profile
              </p>
              <p className="mt-2 text-lg font-semibold text-white">
                {activeProfile?.title || "No profile selected"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {activeProfile?.sourceDocument
                  ? `Attached resume: ${activeProfile.sourceDocument.title || "Untitled resume"}`
                  : "No resume attached yet."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Total credits"
          value={creditsLoading ? "…" : String(balance ?? 0)}
          subtext={creditsError || "Your current balance across the product."}
        />
        <SummaryStat
          label="Paid credits"
          value={creditsLoading ? "…" : String(paidCredits ?? 0)}
          subtext="Only paid credits can be donated to the pool."
        />
        <SummaryStat
          label="Profiles"
          value={String(profiles.length)}
          subtext="Multiple profiles can now coexist cleanly."
        />
        <SummaryStat
          label="Current default"
          value={activeProfile?.title || "None"}
          subtext="Jobs and tailoring use the active profile."
        />
      </section>

      {profilesError ? (
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100">
          <h3 className="text-lg font-semibold">Could not load resume profiles</h3>
          <p className="mt-2 text-sm text-rose-100/90">{profilesError}</p>
          <div className="mt-4">
            <button
              type="button"
              onClick={loadProfiles}
              className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-900 transition hover:bg-white"
            >
              Retry
            </button>
          </div>
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            No profiles yet
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            Add a resume first, then this page becomes useful.
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Resume profiles are what jobs matching and tailoring use behind the scenes.
            Once you analyze or upload a resume, it should show up here as a profile you can manage.
          </p>
          <div className="mt-5">
            <Link
              href="/resume"
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Go to Resume Tool
            </Link>
          </div>
        </div>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/10">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Resume profiles
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Keep multiple profiles clear, not messy.
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                  Pick which profile jobs should score against, keep resume attachments explicit,
                  and make targeted metadata edits without drifting into raw profile chaos.
                </p>
              </div>

              <button
                type="button"
                onClick={loadProfiles}
                className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-slate-800"
              >
                Reload
              </button>
            </div>

            <div className="grid gap-4">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  isActive={profile.id === activeProfileId}
                  isSelected={profile.id === selectedProfileId}
                  onSelect={() => setSelectedProfileId(profile.id)}
                  onActivate={() => setProfileActive(profile.id)}
                />
              ))}
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/10 xl:sticky xl:top-6 xl:h-fit">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              Profile details
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Edit the part that actually affects matching.
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Keep this controlled. These edits affect jobs match trust and tailoring context,
              so this is for clean metadata adjustments, not freestyle profile rewriting.
            </p>

            {selectedProfile ? (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Profile title
                  </label>
                  <input
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Current resume attachment
                    </label>
                    {documentDraft ? (
                      <button
                        type="button"
                        onClick={() => setDocumentDraft("")}
                        className="text-xs font-semibold text-rose-300 transition hover:text-rose-200"
                      >
                        Remove current resume
                      </button>
                    ) : null}
                  </div>

                  <select
                    value={documentDraft}
                    onChange={(event) => setDocumentDraft(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
                  >
                    <option value="">No resume attached</option>
                    {resumeDocuments.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title || "Untitled resume"} • {formatDate(document.createdAt) || "recent"}
                      </option>
                    ))}
                  </select>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Choose which stored resume this profile currently represents. This stays explicit
                    so jobs/tailoring context does not drift.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                    Summary
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {selectedProfile.summary || "No summary stored yet."}
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Titles
                      </p>
                      <span className="text-xs text-slate-500">{titleTags.length} total</span>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <input
                        value={titleKeywordDraft}
                        onChange={(event) => setTitleKeywordDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addTitleTag();
                          }
                        }}
                        placeholder="Add title keyword"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
                      />
                      <button
                        type="button"
                        onClick={addTitleTag}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                      >
                        Add
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {titleTags.length > 0 ? (
                        titleTags.map((item) => (
                          <TagChip
                            key={item}
                            value={item}
                            removable
                            onRemove={(value) => setTitleTags((current) => removeTag(current, value))}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No title metadata stored yet.</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Skills
                      </p>
                      <span className="text-xs text-slate-500">{skillTags.length} total</span>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <input
                        value={skillDraft}
                        onChange={(event) => setSkillDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSkillTag();
                          }
                        }}
                        placeholder="Add skill keyword"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
                      />
                      <button
                        type="button"
                        onClick={addSkillTag}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                      >
                        Add
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {skillTags.length > 0 ? (
                        skillTags.map((item) => (
                          <TagChip
                            key={item}
                            value={item}
                            removable
                            onRemove={(value) => setSkillTags((current) => removeTag(current, value))}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No skill metadata stored yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
                    Why this matters
                  </p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
                    <li>Jobs match uses your active profile to score trust and fit.</li>
                    <li>Saved jobs and job detail handoffs rely on that same active profile context.</li>
                    <li>Tailor Resume / Cover Letter / Tailor Both are safer when the active profile is clean and intentional.</li>
                  </ul>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveProfileChanges}
                    disabled={saveLoading}
                    className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saveLoading ? "Saving profile..." : "Save profile changes"}
                  </button>

                  {selectedProfile.id !== activeProfileId ? (
                    <button
                      type="button"
                      onClick={() => setProfileActive(selectedProfile.id)}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                    >
                      Use as active profile
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-sm leading-7 text-slate-300">
                Select a profile to inspect and edit it.
              </div>
            )}
          </aside>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-cyan-400/15 bg-slate-950/90 shadow-2xl shadow-black/20">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Account actions
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h3 className="text-2xl font-semibold tracking-tight text-white">
                Credits, pool help, and review tools.
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                These controls still matter, but they should feel like a clean support lane now — not a leftover admin block fighting the page.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Paid credits only</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Pool donations should come from paid credits, not daily/free bonus credits.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Request flow</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Requests are reviewed first, then fulfilled separately once approved.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Admin lane</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Pool status and request actions stay available without cluttering the profile controls above.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="space-y-6">
              <DonateCreditsPanel />
              <DonationRequestPanel />
            </div>

            <div className="space-y-6">
              {props.isAdmin ? <AdminDonationRequestsPanel /> : null}
              {!props.isAdmin ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/70 p-6 text-sm leading-7 text-slate-300">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Admin lane hidden</p>
                  <p className="mt-3">
                    Pool balance and approval controls are only shown to admin accounts. The donate/request flows above still work normally for standard users.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
