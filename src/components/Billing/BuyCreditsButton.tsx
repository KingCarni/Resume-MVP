"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { trackJobEvent } from "@/lib/analytics/jobs";

type Pack = "standard" | "plus" | "pro" | "premium";

const PACKS: Record<Pack, { label: string; credits: number; price: string; description: string }> = {
  standard: { label: "Standard", credits: 25, price: "$5", description: "Quick top-up for a couple of focused tailoring actions." },
  plus: { label: "Plus", credits: 75, price: "$10", description: "A stronger bundle for active job-targeted resume and cover letter work." },
  pro: { label: "Pro", credits: 150, price: "$15", description: "Built for repeated tailoring, rewrites, and multi-job application sprints." },
  premium: { label: "Premium", credits: 500, price: "$25", description: "Best value for heavy use across jobs, resume passes, and premium workflows." },
};

type JobsCheckoutContext = {
  source: string;
  route?: string;
  jobId?: string;
  resumeProfileId?: string;
  company?: string;
  jobTitle?: string;
  sourceSlug?: string;
  mode?: "resume" | "cover_letter" | "apply_pack" | "browse";
};

function normalizeMode(value: string | null): JobsCheckoutContext["mode"] {
  if (value === "resume" || value === "cover_letter" || value === "apply_pack" || value === "browse") {
    return value;
  }
  return undefined;
}

function readJobsContext(searchParams: URLSearchParams): JobsCheckoutContext | null {
  const source = searchParams.get("source");
  if (source !== "jobs") return null;

  return {
    source,
    route: searchParams.get("route") || undefined,
    jobId: searchParams.get("jobId") || undefined,
    resumeProfileId: searchParams.get("resumeProfileId") || undefined,
    company: searchParams.get("company") || undefined,
    jobTitle: searchParams.get("jobTitle") || undefined,
    sourceSlug: searchParams.get("sourceSlug") || undefined,
    mode: normalizeMode(searchParams.get("mode")),
  };
}

export default function BuyCreditsButton({ defaultPack = "standard" }: { defaultPack?: Pack }) {
  const [pack, setPack] = useState<Pack>(defaultPack);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const trackedViewRef = useRef("");

  const packInfo = useMemo(() => PACKS[pack], [pack]);
  const jobsContext = useMemo(() => readJobsContext(searchParams), [searchParams]);

  useEffect(() => {
    if (!jobsContext?.jobId) return;

    const trackingKey = [jobsContext.jobId, jobsContext.resumeProfileId || "", jobsContext.mode || "", jobsContext.route || ""].join("::");
    if (trackedViewRef.current === trackingKey) return;
    trackedViewRef.current = trackingKey;

    trackJobEvent({
      event: "job_buy_credits_view",
      jobId: jobsContext.jobId,
      resumeProfileId: jobsContext.resumeProfileId,
      company: jobsContext.company,
      jobTitle: jobsContext.jobTitle,
      sourceSlug: jobsContext.sourceSlug,
      route: jobsContext.route || "/buy-credits",
      mode: jobsContext.mode,
      meta: {
        source: jobsContext.source,
      },
    });
  }, [jobsContext]);

  async function handleCheckout() {
    setLoading(true);
    try {
      if (jobsContext?.jobId) {
        trackJobEvent({
          event: "job_buy_credits_checkout_started",
          jobId: jobsContext.jobId,
          resumeProfileId: jobsContext.resumeProfileId,
          company: jobsContext.company,
          jobTitle: jobsContext.jobTitle,
          sourceSlug: jobsContext.sourceSlug,
          route: jobsContext.route || "/buy-credits",
          mode: jobsContext.mode,
          creditsCost: packInfo.credits,
          meta: {
            pack,
            source: jobsContext.source,
          },
        });
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack,
          analytics: jobsContext,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();

      if (!res.ok) {
        if (res.status === 401) {
          alert("Please sign in first, then try buying credits again.");
        } else {
          alert(`Checkout failed (${res.status}).

${raw.slice(0, 700)}`);
        }
        return;
      }

      if (!contentType.includes("application/json")) {
        alert(`Expected JSON but got: ${contentType}

${raw.slice(0, 700)}`);
        return;
      }

      const data = JSON.parse(raw);
      if (!data?.ok || !data?.url) {
        alert(`Unexpected JSON:

${raw.slice(0, 700)}`);
        return;
      }

      window.location.href = data.url;
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 w-full">
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-xl shadow-black/20">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
          <div className="space-y-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Buy credits</div>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white">Keep your tailoring flow moving.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                Purchase credits for job-aware resume tailoring, cover letters, rewrites, and premium workflow steps.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.6fr)]">
              <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Selected pack</div>
                <div className="mt-4 text-3xl font-black text-white">{packInfo.label}</div>
                <div className="mt-2 text-lg font-semibold text-cyan-300">{packInfo.credits} credits • {packInfo.price}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Pack</label>
                <select
                  value={pack}
                  onChange={(e) => setPack(e.target.value as Pack)}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-400/40"
                >
                  {Object.entries(PACKS).map(([key, p]) => (
                    <option key={key} value={key}>
                      {p.label} — {p.credits} credits ({p.price})
                    </option>
                  ))}
                </select>

                <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <div className="text-sm font-bold text-white">{packInfo.label} pack</div>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{packInfo.description}</p>
                  <div className="mt-4 text-sm text-slate-200">You’ll get <span className="font-bold text-white">{packInfo.credits} credits</span>.</div>
                </div>
              </div>
            </div>

            <button
              disabled={loading}
              onClick={handleCheckout}
              className="w-full rounded-2xl bg-cyan-500 px-6 py-4 text-lg font-black text-black shadow-md transition-all duration-200 hover:scale-[1.01] hover:bg-cyan-400 hover:shadow-lg disabled:opacity-60"
            >
              {loading ? "Redirecting to Stripe..." : `Buy ${packInfo.label} (${packInfo.price})`}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <div className="text-sm font-bold text-white">What credits unlock</div>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                <li>• Job-aware resume tailoring</li>
                <li>• Cover letter generation</li>
                <li>• Tailor Both / apply-pack flow</li>
                <li>• Rewrite and premium workflow actions</li>
              </ul>
            </div>

            {jobsContext?.jobId ? (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5 text-sm leading-7 text-cyan-100">
                This purchase stays connected to your current job flow so you can jump back into tailoring after checkout.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
