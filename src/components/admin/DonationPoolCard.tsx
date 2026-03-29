// src/components/admin/DonationPoolCard.tsx
"use client";

import React, { useEffect, useState } from "react";

type PoolInfo = {
  id: string;
  email: string | null;
  name: string | null;
};

export default function DonationPoolCard() {
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/donation-pool", { method: "GET" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to load (${res.status})`);
      }

      setBalance(typeof data.balance === "number" ? data.balance : 0);
      setPool(data.pool ?? null);
    } catch (e: any) {
      setErr(e?.message || "Failed to load pool");
      setBalance(null);
      setPool(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-black">Donation Pool</h2>
          <div className="mt-1 text-xs text-black/60 dark:text-black/90">
            Current available balance for fulfillments.
          </div>
          {pool?.email ? (
            <div className="mt-1 text-[11px] font-bold text-black/90">
              Pool user: <span className="font-mono">{pool.email}</span>
            </div>
          ) : null}
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
      ) : null}

      <div className="mt-4 rounded-2xl bg-black/10 p-5">
        <div className="text-sm font-extrabold text-black/70">Pool balance</div>
        <div className="mt-1 text-5xl font-black text-black">
          {balance === null ? "—" : balance}
        </div>
        <div className="mt-1 text-sm text-black/90">credits</div>
      </div>
    </section>
  );
}