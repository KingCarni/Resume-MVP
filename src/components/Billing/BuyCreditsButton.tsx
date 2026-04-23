"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { trackJobEvent } from "@/lib/analytics/jobs";

type Pack = "standard" | "plus" | "pro" | "premium";

const PACKS: Record<Pack, { label: string; credits: number; price: string; blurb: string }> = {
  standard: { label: "Standard", credits: 25, price: "$5", blurb: "Quick top-up for a couple of focused tailoring actions." },
  plus: { label: "Plus", credits: 75, price: "$10", blurb: "A better value pack if you are working through several jobs." },
  pro: { label: "Pro", credits: 150, price: "$15", blurb: "Comfortable working room for repeat tailoring and rewrites." },
  premium: { label: "Premium", credits: 500, price: "$25", blurb: "Best fit for heavy usage, testing, or sustained job-search sprints." },
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

  async function startCheckout() {
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
          alert(`Checkout failed (${res.status}).\n\n${raw.slice(0, 700)}`);
        }
        return;
      }

      if (!contentType.includes("application/json")) {
        alert(`Expected JSON but got: ${contentType}\n\n${raw.slice(0, 700)}`);
        return;
      }

      const data = JSON.parse(raw);
      if (!data?.ok || !data?.url) {
        alert(`Unexpected JSON:\n\n${raw.slice(0, 700)}`);
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
    <section className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-black/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Buy credits</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">Keep your tailoring flow moving.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Purchase credits for job-aware resume tailoring, cover letters, rewrites, and premium workflow steps.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Selected pack</div>
          <div className="mt-2 text-lg font-bold text-white">{packInfo.label}</div>
          <div className="text-sm text-cyan-300">{packInfo.credits} credits • {packInfo.price}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Pack</span>
            <select
              value={pack}
              onChange={(e) => setPack(e.target.value as Pack)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
            >
              {Object.entries(PACKS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label} — {p.credits} credits ({p.price})
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-sm font-semibold text-white">{packInfo.label} pack</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{packInfo.blurb}</p>
            <p className="mt-3 text-sm text-slate-300">
              You’ll get <span className="font-bold text-white">{packInfo.credits}</span> credits.
            </p>
          </div>

          {jobsContext?.jobId ? (
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-100">
              Jobs attribution is active for this purchase path. If you reached this page because a jobs workflow ran out of credits, the analytics trail will keep that context.
            </div>
          ) : null}

          <button
            disabled={loading}
            onClick={startCheckout}
            className="mt-1 inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Redirecting to Stripe…" : `Buy ${packInfo.label} (${packInfo.price})`}
          </button>
        </div>

        <aside className="grid gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-sm font-semibold text-white">What credits unlock</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <li>• Job-aware resume tailoring</li>
              <li>• Cover letter generation</li>
              <li>• Tailor Both / apply-pack flow</li>
              <li>• Rewrite and premium workflow actions</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="text-sm font-semibold text-white">Stripe checkout</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Checkout is handled securely by Stripe. After purchase, credits are added to your account and the product flow picks up from there.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs leading-6 text-slate-400">
            Tip: If you ever get redirected to the wrong domain in production, verify <span className="font-mono text-slate-300">NEXT_PUBLIC_APP_URL</span> is set correctly and redeploy.
          </div>
        </aside>
      </div>
    </section>
  );
}
