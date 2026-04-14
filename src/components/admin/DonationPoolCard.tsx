"use client";

import React, { useEffect, useMemo, useState } from "react";

type PoolInfo = {
  id: string;
  email: string | null;
  name: string | null;
};

function prettyError(message: string) {
  if (/pool user not found/i.test(message)) {
    return {
      title: "Donation pool is not ready yet",
      body: "The internal donation-pool user has not been set up in this environment yet, so balance and fulfillment actions cannot work here until that account exists.",
    };
  }

  return {
    title: "Could not load donation pool",
    body: message,
  };
}

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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load pool");
      setBalance(null);
      setPool(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const displayError = useMemo(() => (err ? prettyError(err) : null), [err]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/15">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Donation pool</p>
          <h4 className="mt-2 text-xl font-semibold text-white">See whether fulfillment is actually ready.</h4>
          <p className="mt-2 text-sm leading-6 text-slate-300">This balance is what approved requests ultimately draw from.</p>
          {pool?.email ? (
            <div className="mt-2 text-xs text-slate-400">
              Pool user: <span className="font-mono text-slate-200">{pool.email}</span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading..." : "Reload"}
        </button>
      </div>

      {displayError ? (
        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          <div className="font-semibold">{displayError.title}</div>
          <div className="mt-2 leading-6 text-rose-100/90">{displayError.body}</div>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Pool balance</div>
        <div className="mt-2 text-5xl font-bold tracking-tight text-white">{balance === null ? "-" : balance}</div>
        <div className="mt-2 text-sm text-slate-400">credits available for fulfillment</div>
      </div>
    </section>
  );
}
