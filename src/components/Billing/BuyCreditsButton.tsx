"use client";

import React, { useMemo, useState } from "react";

type Pack = "standard" | "plus" | "pro" | "premium";

const PACKS: Record<Pack, { label: string; credits: number; price: string }> = {
  standard: { label: "Standard", credits: 25, price: "$5" },
  plus: { label: "Plus", credits: 75, price: "$10" },
  pro: { label: "Pro", credits: 150, price: "$15" },
  premium: { label: "Premium", credits: 500, price: "$25" },
};

export default function BuyCreditsButton({ defaultPack = "standard" }: { defaultPack?: Pack }) {
  const [pack, setPack] = useState<Pack>(defaultPack);
  const [loading, setLoading] = useState(false);

  const packInfo = useMemo(() => PACKS[pack], [pack]);

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
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 text-black
                       dark:border-white/10 dark:bg-black/30 dark:text-black dark:focus:border-white/20"
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

          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch("/api/stripe/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pack }),
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
            Tip: If you get redirected to the wrong domain, set{" "}
            <span className="font-mono">NEXT_PUBLIC_APP_URL</span> to{" "}
            <span className="font-mono">https://git-a-job.com</span> in Vercel (Production) and redeploy.
          </div>
        </div>
      </div>
    </div>
  );
}