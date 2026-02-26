"use client";

import React, { useEffect, useState } from "react";

export default function DonationPoolCard() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/admin/donation-pool", { method: "GET" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to load pool (${res.status})`);
      }

      const b = Number(data?.balance);
      setBalance(Number.isFinite(b) ? b : 0);
    } catch (e: any) {
      setErr(e?.message || "Failed to load pool");
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-black">Donation Pool</h2>
          <div className="mt-1 text-xs text-black/60 dark:text-black/70">
            Current available balance for fulfillments.
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
        >
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>

      {err ? (
        <div className="mt-3 rounded-xl border border-red-300/60 bg-red-100/60 p-3 text-sm font-bold text-red-950 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100">
          {err}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black/20">
          <div className="text-xs font-extrabold text-black/60 dark:text-black/70">Pool balance</div>
          <div className="mt-1 text-3xl font-black text-black">{balance}</div>
          <div className="mt-1 text-xs text-black/60 dark:text-black/70">credits</div>
        </div>
      )}
    </section>
  );
}