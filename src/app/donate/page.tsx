// src/app/donate/page.tsx
"use client";

import React from "react";
import DashboardShell from "@/components/layout/DashboardShell";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

function moneyLabel(amount: number) {
  return `Donate $${amount} CAD`;
}

export default function DonatePage() {
  const [loadingAmount, setLoadingAmount] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string>("");

  async function startCheckout(amountCad: number) {
    setError("");
    setLoadingAmount(amountCad);

    try {
      const res = await fetch("/api/donate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCad }),
      });

      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();
      const data = contentType.includes("application/json") ? JSON.parse(raw) : null;

      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || `Could not start checkout (${res.status})`);
      }

      window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoadingAmount(null);
    }
  }

  return (
    <DashboardShell
      title="Donate"
      subtitle="If Git-a-Job helped you, you can support continued development without leaving the same workspace style as the rest of the product."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-black/15">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Support</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">Keep Git-a-Job moving.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Donations help cover hosting, model usage, and continued product work. This is separate from credits — it is simply support for the product itself.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AMOUNTS.map((amt) => {
              const isLoading = loadingAmount === amt;
              const disabled = loadingAmount !== null;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => startCheckout(amt)}
                  disabled={disabled}
                  className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-left text-white transition hover:border-cyan-400/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">One-time</div>
                  <div className="mt-2 text-lg font-bold tracking-tight text-white">${amt} CAD</div>
                  <div className="mt-3 text-sm text-slate-300">
                    {isLoading ? "Redirecting to Stripe…" : moneyLabel(amt)}
                  </div>
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-sm leading-6 text-slate-300">
            Payments are processed securely by Stripe. You will be redirected there to complete the donation.
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-black/15">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Why donate</p>
          <h3 className="mt-3 text-xl font-bold tracking-tight text-white">Support the product, not just a session.</h3>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-sm font-semibold text-white">Keeps development moving</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Helps fund hosting, model calls, and the cleanup passes that make the product feel more trustworthy.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-sm font-semibold text-white">Separate from credits</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Buying credits powers your own usage. Donating is just direct support for Git-a-Job itself.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-sm font-semibold text-white">No guessing on the flow</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Pick an amount, go to Stripe, and come right back. No weird layout jump, no off-brand page, no surprise styling.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </DashboardShell>
  );
}
