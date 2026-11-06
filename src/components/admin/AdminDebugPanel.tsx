"use client";

import { useState } from "react";

type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  ref: string | null;
  createdAt: string;
};

type UserSummary = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    createdAt: string;
    updatedAt: string;
    lastDailyBonusAt: string | null;
  } | null;
  balance: number;
  profileCount: number;
  resumeDocCount: number;
  savedCount: number;
  applicationCount: number;
  ledgerRows: LedgerRow[];
};

type DebugResponse = {
  ok: boolean;
  item?: UserSummary | null;
  message?: string;
  error?: string;
};

function actionButtonClass(danger?: boolean) {
  return danger
    ? "rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50";
}

export default function AdminDebugPanel() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("25");
  const [reason, setReason] = useState("");
  const [confirmReset, setConfirmReset] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserSummary | null>(null);

  async function parseResponse(response: Response): Promise<DebugResponse> {
    const json = (await response.json().catch(() => ({}))) as DebugResponse;
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Request failed (${response.status})`);
    }
    return json;
  }

  async function lookupUser() {
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const params = new URLSearchParams();
      if (email.trim()) params.set("email", email.trim());
      const response = await fetch(`/api/admin/debug?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = await parseResponse(response);
      setSummary(json.item ?? null);
      setFeedback(json.message || (json.item ? "User loaded." : "No user found."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: string, danger?: boolean) {
    if (!email.trim() && action !== "addDonationPoolCredits") {
      setError("Enter a user email first.");
      return;
    }

    if (danger && !window.confirm("This is destructive. Continue?")) return;

    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action,
          email: email.trim(),
          amount,
          reason,
          confirm: confirmReset,
        }),
      });
      const json = await parseResponse(response);
      setSummary(json.item ?? summary);
      setFeedback(json.message || "Admin action complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
        <div className="font-bold">Admin-only debug menu</div>
        <p className="mt-1 opacity-90">
          These tools directly affect user credit ledgers and resume/profile data. Every action is checked server-side; do not rely on hidden UI for safety.
        </p>
      </div>

      {feedback ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{feedback}</div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-bold text-white">User lookup</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
          />
          <button type="button" onClick={lookupUser} disabled={loading} className={actionButtonClass()}>
            {loading ? "Working…" : "Find user"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-bold text-white">Credit tools</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr]">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
              placeholder="25"
              inputMode="numeric"
              className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
            />
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional note"
              className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={loading} onClick={() => runAction("addCredits")} className={actionButtonClass()}>
              Add credits
            </button>
            <button type="button" disabled={loading} onClick={() => runAction("removeCredits")} className={actionButtonClass(true)}>
              Remove credits
            </button>
            <button type="button" disabled={loading} onClick={() => runAction("addDonationPoolCredits")} className={actionButtonClass()}>
              Add donation pool credits
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-xl font-bold text-white">Profile / FTUE tools</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            FTUE is currently gated by profile presence. Resetting resume data forces the user back through setup on locked pages.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={loading} onClick={() => runAction("resetFtueState")} className={actionButtonClass()}>
              Note FTUE reset
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-rose-100">Type RESET to delete resume profiles/documents</label>
            <input
              value={confirmReset}
              onChange={(event) => setConfirmReset(event.target.value)}
              placeholder="RESET"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-rose-400/50"
            />
            <button
              type="button"
              disabled={loading || confirmReset !== "RESET"}
              onClick={() => runAction("resetResumeData", true)}
              className={`${actionButtonClass(true)} mt-3`}
            >
              Reset resume/profile data
            </button>
          </div>
        </div>
      </section>

      {summary?.user ? (
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{summary.user.email || summary.user.id}</h2>
              <p className="mt-1 text-sm text-slate-300">{summary.user.name || "No display name"}</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-wide text-cyan-100">Credit balance</div>
              <div className="text-2xl font-bold text-white">{summary.balance}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              ["Profiles", summary.profileCount],
              ["Resume docs", summary.resumeDocCount],
              ["Saved jobs", summary.savedCount],
              ["Applications", summary.applicationCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div className="border-b border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-white">Recent ledger rows</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950/50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Delta</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.ledgerRows.map((row) => (
                    <tr key={row.id} className="border-t border-white/10 text-slate-200">
                      <td className="px-4 py-3">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className={row.delta >= 0 ? "px-4 py-3 text-emerald-200" : "px-4 py-3 text-rose-200"}>{row.delta}</td>
                      <td className="px-4 py-3">{row.reason}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{row.ref || "—"}</td>
                    </tr>
                  ))}
                  {summary.ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No ledger rows yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
