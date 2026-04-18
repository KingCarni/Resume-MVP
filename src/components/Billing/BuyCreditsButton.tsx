"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { trackJobEvent } from "@/lib/analytics/jobs";

type Pack = "standard" | "plus" | "pro" | "premium";

const PACKS: Record<Pack, { label: string; credits: number; price: string }> = {
  standard: { label: "Standard", credits: 25, price: "$5" },
  plus: { label: "Plus", credits: 75, price: "$10" },
  pro: { label: "Pro", credits: 150, price: "$15" },
  premium: { label: "Premium", credits: 500, price: "$25" },
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

  return (
    <div className="mb-6 w-full max-w-sm">
      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black/20">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-black dark:text-black">Buy credits</div>
          <div className="text-xs opacity-70 text-black dark:text-black">Stripe Checkout</div>
        </div>

        <div className="mt-3 grid gap-2">
          <label className="text-xs font-bold opacity-80 text-black dark:text-black">Pack</label>
          <select
            value={pack}
            onChange={(e) => setPack(e.target.value as Pack)}
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 text-black dark:border-white/10 dark:bg-black/30 dark:text-black dark:focus:border-white/20"
          >
            {Object.entries(PACKS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label} — {p.credits} credits ({p.price})
              </option>
            ))}
          </select>

          <div className="text-xs opacity-70 text-black dark:text-black">
            You’ll get <span className="font-bold">{packInfo.credits}</span> credits.
          </div>

          {jobsContext?.jobId ? (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] leading-5 text-black dark:text-black">
              Jobs attribution is active for this purchase path. If you came here because a jobs flow ran out of credits, the analytics dashboard will keep that context.
            </div>
          ) : null}

          <button
            disabled={loading}
            onClick={async () => {
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
              } catch (e: any) {
                alert(e?.message || "Checkout failed");
              } finally {
                setLoading(false);
              }
            }}
            className="mt-2 rounded-xl bg-emerald-600 px-6 py-3 font-black text-black shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-700 hover:shadow-lg disabled:opacity-60"
          >
            {loading ? "Redirecting to Stripe..." : `💳 Buy ${packInfo.label} (${packInfo.price})`}
          </button>

          <div className="text-[11px] opacity-60 text-black dark:text-black">
            Tip: If you get redirected to the wrong domain, set <span className="font-mono">NEXT_PUBLIC_APP_URL</span> to <span className="font-mono">https://git-a-job.com</span> in Vercel (Production) and redeploy.
          </div>
        </div>
      </div>
    </div>
  );
}
