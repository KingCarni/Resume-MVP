"use client";

import React, { useEffect, useMemo, useState } from "react";

import DonationPoolCard from "@/components/admin/DonationPoolCard";

type DonationRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

type AdminRow = {
  id: string;
  userId: string;
  requestedCredits: number;
  reason: string;
  status: DonationRequestStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { email?: string | null; name?: string | null };
};

function badge(status: DonationRequestStatus) {
  const base = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold";
  if (status === "pending") return `${base} border-amber-500/25 bg-amber-500/10 text-amber-100`;
  if (status === "approved") return `${base} border-emerald-500/25 bg-emerald-500/10 text-emerald-100`;
  if (status === "fulfilled") return `${base} border-cyan-500/25 bg-cyan-500/10 text-cyan-100`;
  return `${base} border-rose-500/25 bg-rose-500/10 text-rose-100`;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminDonationRequestsPanel() {
  const [status, setStatus] = useState<DonationRequestStatus>("pending");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canAct = useMemo(
    () => (id: string) => !workingId && !loading && id.length > 0,
    [workingId, loading],
  );

  async function load() {
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(`/api/admin/donation-requests?status=${encodeURIComponent(status)}`);
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) throw new Error(data?.error || `Failed to load (${res.status})`);

      setRows((data.requests || []) as AdminRow[]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function run() {
      setLoading(true);
      setErr(null);
      setOkMsg(null);
      try {
        const res = await fetch(`/api/admin/donation-requests?status=${encodeURIComponent(status)}`);
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok) throw new Error(data?.error || `Failed to load (${res.status})`);

        setRows((data.requests || []) as AdminRow[]);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [status]);

  async function act(id: string, action: "approve" | "reject" | "fulfill") {
    setWorkingId(id);
    setErr(null);
    setOkMsg(null);

    try {
      const res = await fetch(`/api/admin/donation-requests/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) throw new Error(data?.error || `${action} failed`);

      let msg = `${action.toUpperCase()} successful.`;
      if (typeof data?.credited === "number") msg += ` Credited: ${data.credited}.`;
      if (typeof data?.poolRemaining === "number") msg += ` Pool remaining: ${data.poolRemaining}.`;

      setOkMsg(msg);
      setReviewNote("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="grid gap-6">
      <DonationPoolCard />

      <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/15">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Admin requests</p>
            <h4 className="mt-2 text-xl font-semibold text-white">Review first. Fulfill only after approval.</h4>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Keep the pool lane explicit: review note, approve/reject, then fulfill only when the request is eligible.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DonationRequestStatus)}
              className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/40"
            >
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="fulfilled">fulfilled</option>
              <option value="rejected">rejected</option>
            </select>

            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        </div>

        {err ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">{err}</div> : null}
        {okMsg ? <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{okMsg}</div> : null}

        <div className="mt-4">
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            placeholder="Optional admin note..."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
          />
        </div>

        <div className="mt-5 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">
              No requests for this filter.
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {r.requestedCredits} credits - {r.user?.email || r.userId}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">Created: {fmt(r.createdAt)}</div>
                  </div>
                  <span className={badge(r.status)}>{r.status.toUpperCase()}</span>
                </div>

                <div className="mt-3 text-sm leading-6 text-slate-300">{r.reason}</div>

                {r.reviewNote ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-sm leading-6 text-slate-300">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Saved review note</div>
                    <div className="mt-2 whitespace-pre-wrap">{r.reviewNote}</div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={!canAct(r.id) || r.status !== "pending"}
                    onClick={() => act(r.id, "approve")}
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>

                  <button
                    disabled={!canAct(r.id) || r.status !== "pending"}
                    onClick={() => act(r.id, "reject")}
                    className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reject
                  </button>

                  <button
                    disabled={!canAct(r.id) || r.status !== "approved"}
                    onClick={() => act(r.id, "fulfill")}
                    className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Fulfill
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
