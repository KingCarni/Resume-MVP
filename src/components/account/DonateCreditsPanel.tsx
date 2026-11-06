"use client";

import React, { useEffect, useMemo, useState } from "react";

type Balances = {
  paidCredits: number;
  totalCredits: number;
  purchasedCredits?: number;
  donatedOutCredits?: number;
};

function panelButtonClasses(kind: "primary" | "secondary" = "secondary") {
  if (kind === "primary") {
    return "inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50";
  }
  return "inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
}

export default function DonateCreditsPanel() {
  const [creditsStr, setCreditsStr] = useState<string>("25");
  const [note, setNote] = useState<string>("");

  const [balances, setBalances] = useState<Balances | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const creditsInt = useMemo(() => {
    const trimmed = creditsStr.trim();
    if (!trimmed) return NaN;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [creditsStr]);

  const canSubmit = useMemo(() => {
    const min = 5;
    const max = 500;
    return (
      Number.isFinite(creditsInt) &&
      creditsInt > 0 &&
      creditsInt >= min &&
      creditsInt <= max &&
      !submitting
    );
  }, [creditsInt, submitting]);

  async function loadBalances() {
    setLoadingBalances(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/paid-balance", { method: "GET" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Failed to load balance (${res.status})`);
      }

      setBalances({
        paidCredits: Number(data.paidCredits ?? 0),
        totalCredits: Number(data.totalCredits ?? 0),
        purchasedCredits: Number(data.purchasedCredits ?? 0),
        donatedOutCredits: Number(data.donatedOutCredits ?? 0),
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load balances");
    } finally {
      setLoadingBalances(false);
    }
  }

  useEffect(() => {
    loadBalances();
  }, []);

  async function donate() {
    setErr(null);
    setOkMsg(null);

    if (!Number.isFinite(creditsInt) || creditsInt <= 0) {
      setErr("Please enter a valid positive whole number for credits.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/donate-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: creditsInt,
          note: note.trim(),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Donate failed (${res.status})`);
      }

      const donated = typeof data?.donated === "number" ? data.donated : creditsInt;
      const poolBalance =
        typeof data?.poolBalance === "number" ? ` Pool balance: ${data.poolBalance}.` : "";

      setOkMsg(`Donated ${donated} credits to the pool.${poolBalance}`);
      setNote("");
      await loadBalances();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Donate failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Donate credits
          </p>
          <h4 className="mt-2 text-xl font-semibold text-white">Support the pool without guessing.</h4>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Only paid credits can be donated. This keeps the pool tied to real support, not daily/free bonus credits.
          </p>
        </div>

        <button
          type="button"
          onClick={loadBalances}
          disabled={loadingBalances}
          className={panelButtonClasses()}
        >
          {loadingBalances ? "Loading..." : "Reload"}
        </button>
      </div>

      {balances ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Paid credits available</p>
            <div className="mt-2 text-3xl font-bold tracking-tight text-white">{balances.paidCredits}</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Only paid credits can move into the pool.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Current total balance</p>
                <div className="mt-2 text-3xl font-bold tracking-tight text-white">{balances.totalCredits}</div>
              </div>
              <div className="text-right text-xs leading-5 text-slate-400">
                <div>Purchased: {balances.purchasedCredits ?? 0}</div>
                <div>Donated out: {balances.donatedOutCredits ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {err ? (
        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          {err}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {okMsg}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Credits to donate
          </span>
          <input
            inputMode="numeric"
            value={creditsStr}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "");
              setCreditsStr(v);
            }}
            placeholder="25"
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
          />
          <span className="text-xs text-slate-500">Min 5, max 500. Whole numbers only.</span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional context for the admin/pool trail."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={donate}
            disabled={!canSubmit}
            className={panelButtonClasses("primary")}
          >
            {submitting ? "Donating..." : "Donate to pool"}
          </button>
          <span className="text-xs text-slate-400">This is a support action, not a transfer back to your own account.</span>
        </div>
      </div>
    </section>
  );
}
