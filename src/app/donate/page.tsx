// src/app/donate/page.tsx
"use client";

import React from "react";

const AMOUNTS = [5, 10, 25, 50, 100] as const;

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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-black">Donate</h1>
      <p className="mt-3 opacity-80">
        If Git-a-Job helped you, you can support continued development.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {AMOUNTS.map((amt) => (
          <button
            key={amt}
            onClick={() => startCheckout(amt)}
            disabled={loadingAmount !== null}
            className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50
                       border-black/10 dark:border-white/10"
          >
            {loadingAmount === amt ? "Redirecting…" : `Donate $${amt} CAD`}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <p className="mt-10 text-xs opacity-70">
        Payments are processed securely by Stripe.
      </p>
    </main>
  );
}
