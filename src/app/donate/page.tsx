// src/app/donate/page.tsx
"use client";

import React from "react";
import DashboardShell from "@/components/layout/DashboardShell";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

const card =
  "rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg";

const btn =
  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50";

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

      const data = await res.json();

      if (!res.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || "Could not start checkout");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      setLoadingAmount(null);
    }
  }

  return (
    <DashboardShell
      title="Donate"
      subtitle="If Git-a-Job helped you, you can support continued development."
    >
      <div className="max-w-3xl">
        <div className={card}>
          <div className="flex flex-wrap gap-3">
            {AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => startCheckout(amt)}
                disabled={loadingAmount !== null}
                className={btn}
              >
                {loadingAmount === amt ? "Redirecting…" : `Donate $${amt} CAD`}
              </button>
            ))}
          </div>

          {error ? <p className="mt-6 text-sm text-red-700">{error}</p> : null}

          <p className="mt-10 text-xs text-black/60">
            Payments are processed securely by Stripe.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
