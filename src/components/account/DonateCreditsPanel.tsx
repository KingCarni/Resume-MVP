"use client";

import React, { useEffect, useMemo, useState } from "react";

type Balances = {
  paidCredits: number;
  totalCredits: number;
  purchasedCredits?: number;
  donatedOutCredits?: number;
};

export default function DonateCreditsPanel() {
  const [creditsStr, setCreditsStr] = useState<string>("25");
  const [note, setNote] = useState<string>("");

  const [balances, setBalances] = useState<Balances | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const creditsInt = useMemo(() => {
    // allow empty while typing
    const trimmed = creditsStr.trim();
    if (!trimmed) return NaN;
    // only accept base-10 integers
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : NaN;
  }, [creditsStr]);

  const canSubmit = useMemo(() => {
    const MIN = 5;
    const MAX = 500;
    return (
      Number.isFinite(creditsInt) &&
      creditsInt > 0 &&
      creditsInt >= MIN &&
      creditsInt <= MAX &&
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
    } catch (e: any) {
      setErr(e?.message || "Failed to load balances");
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

    // Hard guard (prevents NaN/blank from ever hitting API)
    if (!Number.isFinite(creditsInt) || creditsInt <= 0) {
      setErr("Please enter a valid positive integer for credits.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/donate-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: creditsInt, // ✅ always a number
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
      // keep credits field as-is for convenience
      await loadBalances();
    } catch (e: any) {
      setErr(e?.message || "Donate failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-black">Donate Credits</h2>
          <div className="mt-1 text-xs text-black/60 dark:text-black/90">
            You can only donate <span className="font-black">paid</span> credits (not daily/free bonuses).
          </div>
        </div>

        <button
          type="button"
          onClick={loadBalances}
          disabled={loadingBalances}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold text-black hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-black dark:hover:bg-white/15"
        >
          {loadingBalances ? "Loading…" : "Reload"}
        </button>
      </div>

      {balances ? (
        <div className="mt-3 grid gap-2 rounded-2xl border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-black/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-extrabold text-black">
              Paid credits available:{" "}
              <span className="font-black">{balances.paidCredits}</span>
            </div>
            <div className="text-xs font-bold text-black/60 dark:text-black/70">
              Total credits: {balances.totalCredits}
            </div>
          </div>

          <div className="text-[11px] font-bold text-black/50 dark:text-black/60">
            (Debug) purchased: {balances.purchasedCredits ?? 0} • donated out: {balances.donatedOutCredits ?? 0}
          </div>
        </div>
      ) : null}

      {err ? (
        <div className="mt-3 rounded-xl border border-red-300/60 bg-red-100/60 p-3 text-sm font-bold text-red-950 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-100">
          {err}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-3 rounded-xl border border-emerald-300/60 bg-emerald-100/60 p-3 text-sm font-bold text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100">
          {okMsg}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1.5">
          <div className="text-xs font-extrabold text-black/70 dark:text-black/70">
            Credits to donate (min 5, max 500)
          </div>
          <input
            inputMode="numeric"
            value={creditsStr}
            onChange={(e) => {
              // keep only digits (and allow blank)
              const v = e.target.value.replace(/[^\d]/g, "");
              setCreditsStr(v);
            }}
            placeholder="25"
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm font-extrabold outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
          />
          {!Number.isFinite(creditsInt) || creditsInt <= 0 ? (
            <div className="text-xs font-bold text-black/50">Enter a positive whole number.</div>
          ) : null}
        </label>

        <label className="grid gap-1.5">
          <div className="text-xs font-extrabold text-black/70 dark:text-black/70">Note (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional message (shown to admin only / for debugging)."
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20 dark:border-white/10 dark:bg-black/20 dark:text-black dark:focus:border-white/20"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={donate}
            disabled={!canSubmit}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-black shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-emerald-600 hover:shadow-lg disabled:opacity-50"
          >
            {submitting ? "Donating…" : "Donate to pool"}
          </button>

          <div className="text-xs font-extrabold text-black/50 dark:text-black/70">
            </div>
        </div>
      </div>
    </section>
  );
}