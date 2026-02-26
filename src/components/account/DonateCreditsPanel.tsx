"use client";

import React, { useEffect, useState } from "react";

type BalanceResponse = {
  ok: boolean;
  paidCredits?: number;
  error?: string;
};

export default function DonateCreditsPanel() {
  const [paidCredits, setPaidCredits] = useState<number>(0);
  const [amount, setAmount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  async function loadBalance() {
    try {
      const res = await fetch("/api/account/paid-balance");
      const data: BalanceResponse = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load balance");
      }

      setPaidCredits(data.paidCredits || 0);
    } catch (e: any) {
      setError(e.message || "Failed to load balance");
    }
  }

  useEffect(() => {
    loadBalance();
  }, []);

  async function donate() {
    setError("");
    setSuccess("");

    if (amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    if (amount > paidCredits) {
      setError("You cannot donate more paid credits than you have.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/account/donate-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Donation failed");
      }

      setSuccess(`Successfully donated ${amount} credits to the pool.`);
      setAmount(10);
      await loadBalance();
    } catch (e: any) {
      setError(e.message || "Donation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/60 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
      <h2 className="text-lg font-extrabold text-black">Donate Paid Credits</h2>

      <p className="mt-2 text-sm text-black/70">
        Only paid credits can be donated. Free signup and daily credits are not transferable.
      </p>

      <div className="mt-4 text-sm font-bold text-black">
        Your available paid credits: {paidCredits}
      </div>

      <div className="mt-4 flex gap-3">
        <input
          type="number"
          min={1}
          max={paidCredits}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-32 rounded-xl border border-black/20 px-3 py-2 text-sm"
        />

        <button
          onClick={donate}
          disabled={loading || paidCredits === 0}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Processing…" : "Donate"}
        </button>
      </div>

      {error && (
        <div className="mt-4 text-sm font-bold text-red-600">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 text-sm font-bold text-emerald-700">
          {success}
        </div>
      )}
    </section>
  );
}