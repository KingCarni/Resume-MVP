"use client";

import { useEffect, useState } from "react";

type JobAwareApplyPackBridgeProps = {
  page: "resume" | "cover-letter";
};

type ApplyPackState = {
  bundle?: string;
  jobId?: string;
  resumeProfileId?: string;
  nextStep?: string;
  createdAt?: string;
  job?: {
    title?: string;
    company?: string;
    jobContextText?: string;
  };
};

export default function JobAwareApplyPackBridge(props: JobAwareApplyPackBridgeProps) {
  const [bundle, setBundle] = useState<ApplyPackState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.sessionStorage.getItem("gitajob.applyPack");
      if (!raw) return;

      const parsed = JSON.parse(raw) as ApplyPackState;
      setBundle(parsed);
    } catch {
      // ignore malformed bundle
    }
  }, []);

  if (!bundle?.jobId || bundle.bundle !== "apply-pack") {
    return null;
  }

  const nextHref =
    bundle.jobId && bundle.resumeProfileId
      ? `/cover-letter?jobId=${encodeURIComponent(bundle.jobId)}&resumeProfileId=${encodeURIComponent(
          bundle.resumeProfileId
        )}&bundle=apply-pack`
      : "/cover-letter";

  return (
    <div className="mb-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Apply Pack Active</p>
      <h2 className="mt-2 text-lg font-semibold text-white">
        {bundle.job?.title || "Job-aware tailoring"}{bundle.job?.company ? ` · ${bundle.job.company}` : ""}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-200">
        {props.page === "resume"
          ? "This run was launched from AI Job Match. After tailoring the resume, send the user straight into the cover letter."
          : "This cover letter run came from the Apply Pack flow. Reuse the same job context and selected resume profile."}
      </p>

      {bundle.job?.jobContextText ? (
        <details className="mt-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-white">Preview stored job context</summary>
          <pre className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-300">{bundle.job.jobContextText}</pre>
        </details>
      ) : null}

      {props.page === "resume" ? (
        <a
          href={nextHref}
          className="mt-4 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
        >
          Next: Generate Cover Letter
        </a>
      ) : null}
    </div>
  );
}
